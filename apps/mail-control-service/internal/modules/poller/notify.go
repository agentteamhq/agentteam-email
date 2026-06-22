package poller

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"agent-mail/internal/archive/r2archive"
)

const (
	FastPathSchema  = "agent-mail.inbound.fastpath.v1"
	NotifyPath      = "/agent-mail/ingest/v1"
	HealthPath      = "/healthz"
	HeaderTimestamp = "X-Agent-Mail-Timestamp"
	HeaderSignature = "X-Agent-Mail-Signature"

	defaultNotifyClockSkew = 5 * time.Minute
	maxNotifyBodyBytes     = 32 * 1024
)

type Notification struct {
	Schema                   string    `json:"schema"`
	OrganizationID           string    `json:"organization_id"`
	OrganizationPublicID     string    `json:"organization_public_id"`
	ArchivePrefix            string    `json:"archive_prefix"`
	WorkerConnectionID       string    `json:"worker_connection_id"`
	WorkerDomainDeploymentID string    `json:"worker_domain_deployment_id"`
	IngestID                 string    `json:"ingest_id"`
	RecipientDomain          string    `json:"recipient_domain"`
	RawKey                   string    `json:"raw_key"`
	EdgeKey                  string    `json:"edge_key"`
	ResultKey                string    `json:"result_key"`
	ReceivedAt               time.Time `json:"received_at"`
	RawSHA256                string    `json:"raw_sha256"`
}

type notifyHandler struct {
	cfg            runtimeConfig
	state          stateStore
	now            func() time.Time
	activeDomains  func(context.Context) ([]Domain, error)
	enqueuePending func(context.Context, r2archive.InboundBundle) error
	wakeProcess    func()
}

func (p *Poller) startNotifyServer(ctx context.Context) (<-chan error, error) {
	if p.cfg.NotifyListenURL == "" {
		return nil, nil
	}
	parsedListenURL, err := url.Parse(p.cfg.NotifyListenURL)
	if err != nil {
		return nil, fmt.Errorf("parse notify listen URL: %w", err)
	}
	if parsedListenURL.Scheme != "http" {
		return nil, fmt.Errorf("notify listen URL scheme must be http")
	}
	if parsedListenURL.Host == "" {
		return nil, fmt.Errorf("notify listen URL is missing host")
	}
	if parsedListenURL.Path != "" && parsedListenURL.Path != "/" {
		return nil, fmt.Errorf("notify listen URL must not include a path")
	}
	listener, err := net.Listen("tcp", parsedListenURL.Host)
	if err != nil {
		return nil, fmt.Errorf("listen for notify HTTP server: %w", err)
	}

	handler := &notifyHandler{
		cfg:            p.cfg,
		state:          p.state,
		now:            func() time.Time { return time.Now().UTC() },
		activeDomains:  p.activeDomains,
		enqueuePending: p.upsertPending,
		wakeProcess:    p.signalProcessDue,
	}
	server := &http.Server{
		Addr:              parsedListenURL.Host,
		Handler:           handler.routes(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Printf("agent-mail-reconciler event=fastpath_listener_start listen_url=%s external_url=%s", p.cfg.NotifyListenURL, p.cfg.NotifyExternalURL)
		listenErrCh := make(chan error, 1)
		go func() {
			listenErrCh <- server.Serve(listener)
		}()

		select {
		case <-ctx.Done():
			shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			if err := server.Shutdown(shutdownCtx); err != nil {
				errCh <- fmt.Errorf("shutdown notify listener: %w", err)
				return
			}
			err := <-listenErrCh
			if errors.Is(err, http.ErrServerClosed) {
				errCh <- nil
				return
			}
			errCh <- err
		case err := <-listenErrCh:
			if errors.Is(err, http.ErrServerClosed) {
				errCh <- nil
				return
			}
			errCh <- err
		}
	}()

	return errCh, nil
}

func (p *Poller) signalProcessDue() {
	if p.wakeCh == nil {
		return
	}
	select {
	case p.wakeCh <- struct{}{}:
	default:
	}
}

func (h *notifyHandler) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc(HealthPath, h.handleHealth)
	mux.HandleFunc(NotifyPath, h.handleNotify)
	return mux
}

func (h *notifyHandler) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed\n", http.StatusMethodNotAllowed)
		return
	}
	if err := h.state.Ping(r.Context()); err != nil {
		http.Error(w, "state store unavailable\n", http.StatusServiceUnavailable)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *notifyHandler) handleNotify(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed\n", http.StatusMethodNotAllowed)
		return
	}
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		http.Error(w, "content type must be application/json\n", http.StatusUnsupportedMediaType)
		return
	}

	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxNotifyBodyBytes))
	if err != nil {
		http.Error(w, "request body too large\n", http.StatusRequestEntityTooLarge)
		return
	}
	if err := h.verifySignature(r, body); err != nil {
		log.Printf("agent-mail-reconciler event=fastpath_signature_rejected error=%q", err)
		http.Error(w, "invalid signature\n", http.StatusUnauthorized)
		return
	}

	var notification Notification
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&notification); err != nil {
		log.Printf("agent-mail-reconciler event=fastpath_decode_rejected error=%q", err)
		http.Error(w, "invalid notification\n", http.StatusBadRequest)
		return
	}
	bundle, err := ValidateNotification(notification)
	if err != nil {
		log.Printf("agent-mail-reconciler event=fastpath_notification_rejected ingest_id=%s edge_key=%s error=%q", notification.IngestID, notification.EdgeKey, err)
		http.Error(w, "invalid notification\n", http.StatusBadRequest)
		return
	}
	if err := h.validateActiveRecipientDomain(r.Context(), notification, bundle); err != nil {
		log.Printf("agent-mail-reconciler event=fastpath_domain_rejected ingest_id=%s domain=%s edge_key=%s error=%q", bundle.IngestID, bundle.RecipientDomain, bundle.EdgeKey, err)
		if errors.Is(err, errInactiveRecipientDomain) {
			http.Error(w, "invalid notification\n", http.StatusBadRequest)
			return
		}
		http.Error(w, "domain state unavailable\n", http.StatusServiceUnavailable)
		return
	}
	if err := h.enqueuePending(r.Context(), bundle); err != nil {
		log.Printf("agent-mail-reconciler event=fastpath_enqueue_failed ingest_id=%s edge_key=%s error=%q", notification.IngestID, notification.EdgeKey, err)
		http.Error(w, "enqueue failed\n", http.StatusInternalServerError)
		return
	}

	h.wakeProcess()
	log.Printf("agent-mail-reconciler event=fastpath_enqueued ingest_id=%s domain=%s edge_key=%s result_key=%s", bundle.IngestID, bundle.RecipientDomain, bundle.EdgeKey, bundle.ResultKey)
	writeJSON(w, http.StatusAccepted, map[string]string{
		"status":    "enqueued",
		"ingest_id": bundle.IngestID,
	})
}

var errInactiveRecipientDomain = errors.New("recipient domain is not active")

func (h *notifyHandler) validateActiveRecipientDomain(ctx context.Context, notification Notification, bundle r2archive.InboundBundle) error {
	if h.activeDomains == nil {
		return fmt.Errorf("active domain source is not configured")
	}
	domains, err := h.activeDomains(ctx)
	if err != nil {
		return err
	}
	for _, domain := range domains {
		activeDomain, err := r2archive.CanonicalDomain(domain.Name)
		if err != nil {
			return fmt.Errorf("active domain %q is invalid: %w", domain.Name, err)
		}
		if activeDomain != bundle.RecipientDomain {
			continue
		}
		if domain.OrganizationID != "" && notification.OrganizationID != domain.OrganizationID {
			return fmt.Errorf("organization_id does not match active domain")
		}
		if domain.OrganizationPublicID != "" && notification.OrganizationPublicID != domain.OrganizationPublicID {
			return fmt.Errorf("organization_public_id does not match active domain")
		}
		if domain.ArchivePrefix != "" && notification.ArchivePrefix != domain.ArchivePrefix {
			return fmt.Errorf("archive_prefix does not match active domain")
		}
		if domain.WorkerConnectionID != "" && notification.WorkerConnectionID != domain.WorkerConnectionID {
			return fmt.Errorf("worker_connection_id does not match active domain")
		}
		if domain.WorkerDomainDeploymentID != "" && notification.WorkerDomainDeploymentID != domain.WorkerDomainDeploymentID {
			return fmt.Errorf("worker_domain_deployment_id does not match active domain")
		}
		if bundle.ArchivePrefix != "" && notification.ArchivePrefix == bundle.ArchivePrefix {
			return nil
		}
	}
	return fmt.Errorf("%w: %s", errInactiveRecipientDomain, bundle.RecipientDomain)
}

func (h *notifyHandler) verifySignature(r *http.Request, body []byte) error {
	timestampValue := r.Header.Get(HeaderTimestamp)
	if timestampValue == "" {
		return fmt.Errorf("missing %s", HeaderTimestamp)
	}
	signatureValue := r.Header.Get(HeaderSignature)
	if signatureValue == "" {
		return fmt.Errorf("missing %s", HeaderSignature)
	}
	receivedAt, err := time.Parse(time.RFC3339Nano, timestampValue)
	if err != nil {
		return fmt.Errorf("parse timestamp: %w", err)
	}
	clockSkew := h.cfg.NotifyClockSkew
	if clockSkew == 0 {
		clockSkew = defaultNotifyClockSkew
	}
	now := time.Now().UTC()
	if h.now != nil {
		now = h.now().UTC()
	}
	skew := now.Sub(receivedAt.UTC())
	if skew < 0 {
		skew = -skew
	}
	if skew > clockSkew {
		return fmt.Errorf("timestamp skew %s exceeds %s", skew.Round(time.Second), clockSkew)
	}

	decodedSignature, err := hex.DecodeString(signatureValue)
	if err != nil {
		return fmt.Errorf("decode signature: %w", err)
	}
	if hex.EncodeToString(decodedSignature) != signatureValue {
		return fmt.Errorf("signature must be canonical lowercase hex")
	}
	expected := expectedSignature([]byte(h.cfg.NotifyHMACSecret), timestampValue, body)
	if !hmac.Equal(decodedSignature, expected) {
		return fmt.Errorf("signature mismatch")
	}
	return nil
}

func ValidateNotification(notification Notification) (r2archive.InboundBundle, error) {
	if notification.Schema != FastPathSchema {
		return r2archive.InboundBundle{}, fmt.Errorf("schema %q does not match %q", notification.Schema, FastPathSchema)
	}
	if notification.ReceivedAt.IsZero() {
		return r2archive.InboundBundle{}, fmt.Errorf("received_at is required")
	}
	digest, err := hex.DecodeString(notification.RawSHA256)
	if err != nil {
		return r2archive.InboundBundle{}, fmt.Errorf("decode raw_sha256: %w", err)
	}
	if len(digest) != sha256.Size {
		return r2archive.InboundBundle{}, fmt.Errorf("raw_sha256 must be SHA-256 length")
	}
	if hex.EncodeToString(digest) != notification.RawSHA256 {
		return r2archive.InboundBundle{}, fmt.Errorf("raw_sha256 must be canonical lowercase hex")
	}

	bundle, err := r2archive.ParseInboundEdgeKey(notification.EdgeKey)
	if err != nil {
		return r2archive.InboundBundle{}, err
	}
	if strings.TrimSpace(notification.OrganizationID) == "" {
		return r2archive.InboundBundle{}, fmt.Errorf("organization_id is required")
	}
	if notification.OrganizationPublicID == "" {
		return r2archive.InboundBundle{}, fmt.Errorf("organization_public_id is required")
	}
	if notification.OrganizationPublicID != bundle.OrganizationPublicID {
		return r2archive.InboundBundle{}, fmt.Errorf("organization_public_id does not match edge key")
	}
	if notification.ArchivePrefix != bundle.ArchivePrefix {
		return r2archive.InboundBundle{}, fmt.Errorf("archive_prefix does not match edge key")
	}
	if strings.TrimSpace(notification.WorkerConnectionID) == "" {
		return r2archive.InboundBundle{}, fmt.Errorf("worker_connection_id is required")
	}
	if strings.TrimSpace(notification.WorkerDomainDeploymentID) == "" {
		return r2archive.InboundBundle{}, fmt.Errorf("worker_domain_deployment_id is required")
	}
	if notification.IngestID != bundle.IngestID {
		return r2archive.InboundBundle{}, fmt.Errorf("ingest_id does not match edge key")
	}
	domain, err := r2archive.CanonicalDomain(notification.RecipientDomain)
	if err != nil {
		return r2archive.InboundBundle{}, fmt.Errorf("canonical recipient domain: %w", err)
	}
	if domain != bundle.RecipientDomain {
		return r2archive.InboundBundle{}, fmt.Errorf("recipient_domain does not match edge key")
	}
	if notification.RawKey != bundle.RawKey {
		return r2archive.InboundBundle{}, fmt.Errorf("raw_key does not match edge key")
	}
	if notification.ResultKey != bundle.ResultKey {
		return r2archive.InboundBundle{}, fmt.Errorf("result_key does not match edge key")
	}
	idTime, err := r2archive.UUIDv7Time(notification.IngestID)
	if err != nil {
		return r2archive.InboundBundle{}, err
	}
	if !utcDate(idTime).Equal(bundle.UTCDate) {
		return r2archive.InboundBundle{}, fmt.Errorf("ingest_id UTC date does not match edge key date")
	}
	if !utcDate(notification.ReceivedAt).Equal(bundle.UTCDate) {
		return r2archive.InboundBundle{}, fmt.Errorf("received_at UTC date does not match edge key date")
	}
	return bundle, nil
}

func expectedSignature(secret []byte, timestamp string, body []byte) []byte {
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(timestamp))
	mac.Write([]byte("\n"))
	mac.Write(body)
	return mac.Sum(nil)
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
