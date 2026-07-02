package poller

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"mail-control-service/internal/archive/r2archive"
)

const IngestNotificationSchema = "agent-mail.inbound.ingest.v1"

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

func ValidateNotification(notification Notification) (r2archive.InboundBundle, error) {
	if notification.Schema != IngestNotificationSchema {
		return r2archive.InboundBundle{}, fmt.Errorf("schema %q does not match %q", notification.Schema, IngestNotificationSchema)
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
