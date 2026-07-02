package smoke

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"mail-control-service/internal/archive/r2archive"
	"mail-control-service/internal/modules/poller"

	"github.com/emersion/go-message"
	messagetextproto "github.com/emersion/go-message/textproto"
	gosmtp "github.com/emersion/go-smtp"
	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestInboundReplayDeliveryOutcomeContracts(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	suite := sweepContractNewSuite(t, ctx)

	t.Run("unknown recipient with valid sender submits dsn and records terminal result", func(t *testing.T) {
		scenario := newInboundOutcomeScenario(t, suite, "unknown-valid-sender", inboundOutcomeOptions{
			Mailbox: "missing",
			WildDuck: inboundOutcomeWildDuck{
				Existing: map[string]inboundOutcomeAddress{},
			},
		})
		bundle := scenario.writeBundle(t, "Unknown recipient DSN", "sender@example.net")

		p := scenario.startPoller(t)
		_ = p
		scenario.postNotification(t, bundle)

		receipt := scenario.waitForReceipt(t, bundle.Bundle.ResultKey, "delivery_failed_dsn_submitted")
		if receipt.DSNEnvelopeFrom != "" {
			t.Fatalf("dsn envelope_from = %q, want null reverse path", receipt.DSNEnvelopeFrom)
		}
		if receipt.DSNEnvelopeTo != "sender@example.net" {
			t.Fatalf("dsn envelope_to = %q, want sender@example.net", receipt.DSNEnvelopeTo)
		}
		if receipt.DSNFrom != "bounces@"+scenario.domain {
			t.Fatalf("dsn from = %q, want bounces@%s", receipt.DSNFrom, scenario.domain)
		}
		if receipt.DSNRawKey != bundle.Bundle.DSNKey {
			t.Fatalf("dsn raw key = %q, want %q", receipt.DSNRawKey, bundle.Bundle.DSNKey)
		}
		if receipt.DSNRawSHA256 == "" || receipt.DSNID == "" || receipt.DSNMessageID == "" {
			t.Fatalf("dsn receipt missing persisted identifiers: %#v", receipt)
		}

		deliveries := scenario.dsnSMTP.Deliveries()
		if len(deliveries) != 1 {
			t.Fatalf("dsn smtp deliveries = %d, want 1", len(deliveries))
		}
		if deliveries[0].MailFrom != "" {
			t.Fatalf("dsn smtp MAIL FROM = %q, want null reverse path", deliveries[0].MailFrom)
		}
		if len(deliveries[0].RcptTo) != 1 || deliveries[0].RcptTo[0] != "sender@example.net" {
			t.Fatalf("dsn smtp RCPT TO = %#v, want sender@example.net", deliveries[0].RcptTo)
		}

		dsnRaw := scenario.objectBytes(t, bundle.Bundle.DSNKey)
		dsnEntity, err := message.Read(bytes.NewReader(dsnRaw))
		if err != nil {
			t.Fatalf("parse dsn raw: %v\n%s", err, string(dsnRaw))
		}
		contentType, params, err := dsnEntity.Header.ContentType()
		if err != nil {
			t.Fatalf("parse dsn Content-Type: %v\n%s", err, string(dsnRaw))
		}
		if contentType != "multipart/report" || params["report-type"] != "delivery-status" {
			t.Fatalf("dsn Content-Type = %q params %#v, want multipart/report delivery-status", contentType, params)
		}
		statusHeader := dsnDeliveryStatusRecipientHeader(t, dsnEntity)
		if got := statusHeader.Get("Final-Recipient"); got != "rfc822; "+scenario.mailbox {
			t.Fatalf("dsn Final-Recipient = %q, want rfc822; %s", got, scenario.mailbox)
		}
		if got := statusHeader.Get("Diagnostic-Code"); got != "smtp; 550 5.1.1 No such user" {
			t.Fatalf("dsn Diagnostic-Code = %q, want smtp; 550 5.1.1 No such user", got)
		}
		if !messageHasHeader(dsnRaw, "X-Agent-Mail-DSN-Source-Ingest-ID", bundle.IngestID) {
			t.Fatalf("dsn raw missing source ingest id header %q:\n%s", bundle.IngestID, string(dsnRaw))
		}

		resultBefore := scenario.objectBytes(t, bundle.Bundle.ResultKey)
		scenario.postNotification(t, bundle)
		time.Sleep(350 * time.Millisecond)
		resultAfter := scenario.objectBytes(t, bundle.Bundle.ResultKey)
		if string(resultAfter) != string(resultBefore) {
			t.Fatalf("terminal dsn result was rewritten after duplicate notification\nbefore:\n%s\nafter:\n%s", resultBefore, resultAfter)
		}
		if deliveries := scenario.dsnSMTP.Deliveries(); len(deliveries) != 1 {
			t.Fatalf("dsn smtp deliveries = %d, want no duplicate DSN submission", len(deliveries))
		}
		scenario.assertWorkCompleted(t, bundle.IngestID)
	})

	t.Run("unknown recipient with null sender suppresses dsn", func(t *testing.T) {
		scenario := newInboundOutcomeScenario(t, suite, "unknown-null-sender", inboundOutcomeOptions{
			Mailbox: "missing",
			WildDuck: inboundOutcomeWildDuck{
				Existing: map[string]inboundOutcomeAddress{},
			},
		})
		bundle := scenario.writeBundle(t, "Unknown recipient DSN suppressed", "")

		p := scenario.startPoller(t)
		_ = p
		scenario.postNotification(t, bundle)

		receipt := scenario.waitForReceipt(t, bundle.Bundle.ResultKey, "delivery_failed_dsn_suppressed")
		if receipt.DeliverySource != "dsn_suppressed" {
			t.Fatalf("delivery_source = %q, want dsn_suppressed", receipt.DeliverySource)
		}
		if receipt.Detail != "original envelope sender is null" {
			t.Fatalf("suppression detail = %q, want original envelope sender is null", receipt.Detail)
		}
		if exists := scenario.objectExists(t, bundle.Bundle.DSNKey); exists {
			t.Fatalf("dsn object %s exists for null-sender suppression", bundle.Bundle.DSNKey)
		}
		if deliveries := scenario.dsnSMTP.Deliveries(); len(deliveries) != 0 {
			t.Fatalf("dsn smtp deliveries = %d, want 0", len(deliveries))
		}
		scenario.assertWorkCompleted(t, bundle.IngestID)
	})

	t.Run("existing WildDuck delivery proof is terminal without replay", func(t *testing.T) {
		scenario := newInboundOutcomeScenario(t, suite, "existing-delivery-proof", inboundOutcomeOptions{
			Mailbox: "agent",
		})
		bundle := scenario.writeBundle(t, "Existing delivery proof", "sender@example.net")
		existingMessageID := scenario.seedDeliveredMessage(t, bundle.IngestID)

		p := scenario.startPoller(t)
		_ = p
		scenario.postNotification(t, bundle)

		receipt := scenario.waitForReceipt(t, bundle.Bundle.ResultKey, "delivered")
		if receipt.DeliverySource != "existing" {
			t.Fatalf("delivery_source = %q, want existing", receipt.DeliverySource)
		}
		if receipt.WildDuckMessageID != existingMessageID {
			t.Fatalf("wildduck_message_id = %q, want existing seeded message %q", receipt.WildDuckMessageID, existingMessageID)
		}
		if deliveries := scenario.replaySMTP.Deliveries(); len(deliveries) != 0 {
			t.Fatalf("replay smtp deliveries = %d, want 0 for existing proof", len(deliveries))
		}
		if deliveries := scenario.dsnSMTP.Deliveries(); len(deliveries) != 0 {
			t.Fatalf("dsn smtp deliveries = %d, want 0", len(deliveries))
		}
		scenario.assertWorkStatus(t, bundle.IngestID, "delivered", "completed")
	})

	t.Run("forward-only address records forwarded terminal result after replay", func(t *testing.T) {
		scenario := newInboundOutcomeScenario(t, suite, "forward-only", inboundOutcomeOptions{
			Mailbox: "forward",
			WildDuck: inboundOutcomeWildDuck{
				Existing: map[string]inboundOutcomeAddress{},
				ForwardTargets: map[string][]string{
					"forward": {"outside@example.net"},
				},
			},
		})
		bundle := scenario.writeBundle(t, "Forward-only address", "sender@example.net")

		p := scenario.startPoller(t)
		_ = p
		scenario.postNotification(t, bundle)

		receipt := scenario.waitForReceipt(t, bundle.Bundle.ResultKey, "delivered")
		if receipt.DeliverySource != "forwarded" {
			t.Fatalf("delivery_source = %q, want forwarded", receipt.DeliverySource)
		}
		if receipt.WildDuckUserID != "" || receipt.WildDuckMailboxID != "" || receipt.WildDuckMessageID != "" {
			t.Fatalf("forward-only receipt should not invent WildDuck mailbox identifiers: %#v", receipt)
		}
		deliveries := scenario.replaySMTP.Deliveries()
		if len(deliveries) != 1 {
			t.Fatalf("replay smtp deliveries = %d, want 1", len(deliveries))
		}
		if deliveries[0].MailFrom != "sender@example.net" {
			t.Fatalf("replay smtp MAIL FROM = %q, want sender@example.net", deliveries[0].MailFrom)
		}
		if deliveries := scenario.dsnSMTP.Deliveries(); len(deliveries) != 0 {
			t.Fatalf("dsn smtp deliveries = %d, want 0", len(deliveries))
		}
		scenario.assertWorkStatus(t, bundle.IngestID, "delivered", "completed")
	})
}

type inboundOutcomeOptions struct {
	Mailbox  string
	WildDuck inboundOutcomeWildDuck
}

type inboundOutcomeWildDuck struct {
	Existing       map[string]inboundOutcomeAddress
	ForwardTargets map[string][]string
}

type inboundOutcomeAddress struct {
	UserID string
}

type inboundOutcomeScenario struct {
	suite      *sweepContractSuite
	domain     string
	mailbox    string
	controlDB  string
	wildduckDB string
	wildduck   inboundOutcomeWildDuck
	userID     bson.ObjectID
	mailboxID  bson.ObjectID
	wdServer   *httptest.Server
	replaySMTP *smokeSMTPServer
	dsnSMTP    *recordingSMTPServer
	poller     *poller.Poller
}

func newInboundOutcomeScenario(t *testing.T, suite *sweepContractSuite, name string, opts inboundOutcomeOptions) *inboundOutcomeScenario {
	t.Helper()

	slug := sweepContractSlug(name)
	domain := slug + "." + smokeDomain
	mailboxLocal := strings.TrimSpace(opts.Mailbox)
	if mailboxLocal == "" {
		mailboxLocal = "agent"
	}
	userID := bson.NewObjectID()
	mailboxID := bson.NewObjectID()
	mailbox := mailboxLocal + "@" + domain
	wildduck := opts.WildDuck
	if wildduck.Existing == nil {
		wildduck.Existing = map[string]inboundOutcomeAddress{
			mailbox: {UserID: userID.Hex()},
		}
	}
	if wildduck.ForwardTargets == nil {
		wildduck.ForwardTargets = map[string][]string{}
	}
	for address, targets := range wildduck.ForwardTargets {
		if !strings.Contains(address, "@") {
			delete(wildduck.ForwardTargets, address)
			wildduck.ForwardTargets[address+"@"+domain] = targets
		}
	}
	wildduckAccessToken := randomSmokeToken(t, "wildduck")
	t.Setenv("AT_EMAIL_ADMIN_WILDDUCK_ADMIN_ACCESS_TOKEN", wildduckAccessToken)
	wdServer := newInboundOutcomeWildDuckServer(t, wildduckAccessToken, wildduck)
	t.Cleanup(wdServer.Close)

	wildduckDB := "wildduck_" + slug + "_" + smokeRunID()
	replaySMTP := newSmokeSMTPServer(t, suite.mongoClient.Database(wildduckDB).Collection("messages"), userID, mailboxID)
	t.Cleanup(replaySMTP.Close)
	dsnSMTP := newRecordingSMTPServer(t)
	t.Cleanup(dsnSMTP.Close)

	return &inboundOutcomeScenario{
		suite:      suite,
		domain:     domain,
		mailbox:    mailbox,
		controlDB:  "agent_mail_control_" + slug + "_" + smokeRunID(),
		wildduckDB: wildduckDB,
		wildduck:   wildduck,
		userID:     userID,
		mailboxID:  mailboxID,
		wdServer:   wdServer,
		replaySMTP: replaySMTP,
		dsnSMTP:    dsnSMTP,
	}
}

func (s *inboundOutcomeScenario) startPoller(t *testing.T) *poller.Poller {
	t.Helper()

	cfg := smokePollerConfig(s.suite.mongoURI, s.controlDB, s.wildduckDB, s.wdServer.URL, s.replaySMTP.Addr())
	cfg.DSN.SMTPAddress = s.dsnSMTP.Addr()
	cfg.SweepInterval = "1h"
	cfg.RetryDelay = "100ms"
	cfg.MaxRetries = 2

	p, err := poller.NewWithDomainSourceConfig(s.suite.ctx, cfg, sweepContractDomainSource{domain: s.domain})
	if err != nil {
		t.Fatalf("initialize inbound outcome poller: %v", err)
	}
	pollerCtx, stopPoller := context.WithCancel(s.suite.ctx)
	errCh := make(chan error, 1)
	go func() {
		errCh <- p.Run(pollerCtx)
	}()
	s.poller = p
	t.Cleanup(func() {
		stopPoller()
		err := <-errCh
		if err != nil && err != context.Canceled {
			t.Errorf("poller stopped with error: %v", err)
		}
		if err := p.Close(context.Background()); err != nil {
			t.Errorf("close poller: %v", err)
		}
	})
	return p
}

func (s *inboundOutcomeScenario) writeBundle(t *testing.T, subject string, envelopeFrom string) sweepContractBundle {
	t.Helper()

	bundle := s.newBundle(t, subject)
	if err := s.suite.archive.PutBytes(s.suite.ctx, bundle.Bundle.RawKey, "message/rfc822", bundle.RawMessage); err != nil {
		t.Fatalf("write inbound outcome raw archive: %v", err)
	}
	manifest := poller.Manifest{
		Schema:             r2archive.InboundEdgeSchema,
		IngestID:           bundle.IngestID,
		OrganizationID:     smokeOrganizationID,
		OrgPublicID:        smokeOrganizationPublicID,
		ArchivePrefix:      bundle.Bundle.ArchivePrefix,
		ConnectionID:       smokeWorkerConnectionID,
		DomainID:           smokeWorkerDomainDeploymentID,
		RawKey:             bundle.Bundle.RawKey,
		EdgeKey:            bundle.Bundle.EdgeKey,
		Mailbox:            s.mailbox,
		EnvelopeFrom:       envelopeFrom,
		EnvelopeTo:         s.mailbox,
		RecipientDomain:    s.domain,
		CloudflareZoneName: s.domain,
		WorkerName:         "delivery-outcome-worker",
		ReceivedAt:         bundle.ReceivedAt,
		RawSHA256:          bundle.RawSHA256,
		MessageID:          bundle.MessageID,
		ATMCFHeaders: map[string]string{
			"X-ATMCF-Edge-Action":        "worker",
			"X-ATMCF-Edge-Status":        "received",
			"X-ATMCF-Edge-Envelope-From": envelopeFrom,
			"X-ATMCF-Edge-Envelope-To":   s.mailbox,
			"X-ATMCF-Edge-Message-ID":    bundle.MessageID,
		},
	}
	if err := s.suite.archive.PutJSON(s.suite.ctx, bundle.Bundle.EdgeKey, manifest); err != nil {
		t.Fatalf("write inbound outcome edge archive: %v", err)
	}
	return bundle
}

func (s *inboundOutcomeScenario) newBundle(t *testing.T, subject string) sweepContractBundle {
	t.Helper()

	ingestID, err := r2archive.NewUUIDv7String()
	if err != nil {
		t.Fatalf("generate inbound outcome ingest id: %v", err)
	}
	receivedAt, err := r2archive.UUIDv7Time(ingestID)
	if err != nil {
		t.Fatalf("decode inbound outcome ingest id time: %v", err)
	}
	bundle := smokeInboundBundleKeys(t, s.domain, receivedAt, ingestID)
	messageID := "<" + sweepContractSlug(subject) + "@" + s.domain + ">"
	raw := sweepContractRawMessage(s.mailbox, subject, messageID)
	return sweepContractBundle{
		IngestID:   ingestID,
		ReceivedAt: receivedAt,
		Bundle:     bundle,
		RawMessage: raw,
		RawSHA256:  sha256Hex(raw),
		MessageID:  messageID,
	}
}

func (s *inboundOutcomeScenario) postNotification(t *testing.T, bundle sweepContractBundle) {
	t.Helper()
	if s.poller == nil {
		t.Fatal("poller is not started")
	}
	if err := enqueueSmokeNotification(s.suite.ctx, s.poller, smokeNotificationForBundle(bundle.Bundle, bundle.ReceivedAt, bundle.RawSHA256)); err != nil {
		t.Fatalf("enqueue inbound outcome notification: %v", err)
	}
}

func (s *inboundOutcomeScenario) waitForReceipt(t *testing.T, resultKey string, wantStatus string) poller.Receipt {
	t.Helper()

	deadline := time.Now().Add(30 * time.Second)
	var lastErr error
	for time.Now().Before(deadline) {
		data, err := s.suite.archive.GetBytes(s.suite.ctx, resultKey)
		if err == nil {
			var receipt poller.Receipt
			if err := json.Unmarshal(data, &receipt); err != nil {
				t.Fatalf("decode inbound outcome receipt: %v\n%s", err, string(data))
			}
			if receipt.Status != wantStatus {
				t.Fatalf("receipt status = %q, want %q\n%s", receipt.Status, wantStatus, string(data))
			}
			return receipt
		}
		lastErr = err
		time.Sleep(250 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for inbound outcome result %s: last error: %v", resultKey, lastErr)
	return poller.Receipt{}
}

func (s *inboundOutcomeScenario) seedDeliveredMessage(t *testing.T, ingestID string) string {
	t.Helper()

	messageID := bson.NewObjectID()
	_, err := s.suite.mongoClient.Database(s.wildduckDB).Collection("messages").InsertOne(s.suite.ctx, bson.D{
		{"_id", messageID},
		{"user", s.userID},
		{"mailbox", s.mailboxID},
		{"mimeTree", bson.D{{"header", bson.A{"X-ATM-Ingest-ID: " + ingestID}}}},
		{"created", time.Now().UTC()},
	})
	if err != nil {
		t.Fatalf("seed existing WildDuck delivery proof: %v", err)
	}
	return messageID.Hex()
}

func (s *inboundOutcomeScenario) assertWorkCompleted(t *testing.T, ingestID string) {
	t.Helper()
	s.assertWorkStatus(t, ingestID, "completed")
}

func (s *inboundOutcomeScenario) assertWorkStatus(t *testing.T, ingestID string, want ...string) {
	t.Helper()

	wantSet := make(map[string]struct{}, len(want))
	for _, status := range want {
		wantSet[status] = struct{}{}
	}
	deadline := time.Now().Add(10 * time.Second)
	var lastStatus string
	for time.Now().Before(deadline) {
		var work bson.M
		err := s.suite.mongoClient.Database(s.controlDB).Collection("inbound_work_items").FindOne(s.suite.ctx, bson.D{{Key: "_id", Value: ingestID}}).Decode(&work)
		if err == nil {
			lastStatus = sweepContractStringField(work, "status")
			if _, ok := wantSet[lastStatus]; ok {
				return
			}
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatalf("work item %s status = %q, want one of %v", ingestID, lastStatus, want)
}

func (s *inboundOutcomeScenario) objectExists(t *testing.T, key string) bool {
	t.Helper()
	exists, err := s.suite.archive.Exists(s.suite.ctx, key)
	if err != nil {
		t.Fatalf("head archive object %s: %v", key, err)
	}
	return exists
}

func (s *inboundOutcomeScenario) objectBytes(t *testing.T, key string) []byte {
	t.Helper()
	data, err := s.suite.archive.GetBytes(s.suite.ctx, key)
	if err != nil {
		t.Fatalf("read archive object %s: %v", key, err)
	}
	return data
}

func newInboundOutcomeWildDuckServer(t *testing.T, expectedAccessToken string, data inboundOutcomeWildDuck) *httptest.Server {
	t.Helper()

	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Header.Get("X-Access-Token") != expectedAccessToken {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"success":false,"error":"Unauthorized","code":"Unauthorized"}`))
			return
		}

		addressPath := "/addresses/resolve/"
		if r.Method != http.MethodGet || !strings.HasPrefix(r.URL.Path, addressPath) {
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"success":false,"error":"not found","code":"NotFound"}`))
			return
		}
		address, err := url.PathUnescape(strings.TrimPrefix(r.URL.EscapedPath(), addressPath))
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"success":false,"error":"Bad address","code":"BadAddress"}`))
			return
		}
		address = strings.TrimSpace(address)

		if entry, ok := data.Existing[address]; ok {
			_, _ = fmt.Fprintf(w, `{"success":true,"id":"address-%s","address":%q,"user":%q}`, strings.ReplaceAll(address, "@", "-"), address, entry.UserID)
			return
		}
		if targets, ok := data.ForwardTargets[address]; ok {
			payload, err := json.Marshal(struct {
				Success bool     `json:"success"`
				ID      string   `json:"id"`
				Address string   `json:"address"`
				Targets []string `json:"targets"`
			}{
				Success: true,
				ID:      "forward-" + strings.ReplaceAll(address, "@", "-"),
				Address: address,
				Targets: targets,
			})
			if err != nil {
				t.Fatalf("marshal WildDuck forward response: %v", err)
			}
			_, _ = w.Write(payload)
			return
		}

		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"success":false,"error":"Address not found","code":"AddressNotFound"}`))
	}))
}

func dsnDeliveryStatusRecipientHeader(t *testing.T, entity *message.Entity) messagetextproto.Header {
	t.Helper()

	multipartReader := entity.MultipartReader()
	if multipartReader == nil {
		t.Fatal("dsn raw is not multipart")
	}
	for {
		part, err := multipartReader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatalf("read dsn multipart part: %v", err)
		}
		partType, _, err := part.Header.ContentType()
		if err != nil {
			t.Fatalf("parse dsn part Content-Type: %v", err)
		}
		if partType != "message/delivery-status" {
			continue
		}
		reader := bufio.NewReader(part.Body)
		if _, err := messagetextproto.ReadHeader(reader); err != nil {
			t.Fatalf("parse dsn per-message status fields: %v", err)
		}
		recipientHeader, err := messagetextproto.ReadHeader(reader)
		if err != nil {
			t.Fatalf("parse dsn per-recipient status fields: %v", err)
		}
		return recipientHeader
	}
	t.Fatal("dsn raw missing message/delivery-status part")
	return messagetextproto.Header{}
}

type recordingSMTPServer struct {
	t          *testing.T
	listener   net.Listener
	smtp       *gosmtp.Server
	mu         sync.Mutex
	deliveries []smokeSMTPDelivery
	done       chan struct{}
}

func newRecordingSMTPServer(t *testing.T) *recordingSMTPServer {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen recording SMTP: %v", err)
	}
	server := &recordingSMTPServer{
		t:        t,
		listener: listener,
		done:     make(chan struct{}),
	}
	smtpServer := gosmtp.NewServer(smokeSMTPBackend{recorder: server})
	smtpServer.Domain = "recording-smtp.test"
	smtpServer.ReadTimeout = 10 * time.Second
	smtpServer.WriteTimeout = 10 * time.Second
	server.smtp = smtpServer
	go server.serve()
	return server
}

func (s *recordingSMTPServer) Addr() string {
	return s.listener.Addr().String()
}

func (s *recordingSMTPServer) Close() {
	_ = s.smtp.Close()
	<-s.done
}

func (s *recordingSMTPServer) Deliveries() []smokeSMTPDelivery {
	s.mu.Lock()
	defer s.mu.Unlock()
	result := make([]smokeSMTPDelivery, len(s.deliveries))
	copy(result, s.deliveries)
	return result
}

func (s *recordingSMTPServer) serve() {
	defer close(s.done)
	if err := s.smtp.Serve(s.listener); err != nil && err != gosmtp.ErrServerClosed {
		s.t.Errorf("recording SMTP stopped with error: %v", err)
	}
}

func (s *recordingSMTPServer) recordDelivery(_ context.Context, mailFrom string, rcptTo []string, raw []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.deliveries = append(s.deliveries, smokeSMTPDelivery{
		MailFrom:   mailFrom,
		RcptTo:     append([]string(nil), rcptTo...),
		RawMessage: append([]byte(nil), raw...),
	})
	return nil
}
