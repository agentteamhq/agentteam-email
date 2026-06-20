package r2archive

import (
	"fmt"
	"path"
	"strings"
	"time"

	"agent-mail/internal/mail/structured"

	"github.com/google/uuid"
)

const (
	InboundEdgeSchema             = "agent-mail.inbound.edge.v1"
	InboundLocalRouteEdgeSchema   = "agent-mail.inbound.local-route.edge.v1"
	InboundResultSchema           = "agent-mail.inbound.result.v1"
	InboundLocalRouteResultSchema = "agent-mail.inbound.local-route.result.v1"

	OutboundRelaySchema  = "agent-mail.outbound.relay.v1"
	OutboundResultSchema = "agent-mail.outbound.result.v1"

	MailPrefix = "mail"
)

type InboundBundle struct {
	RecipientDomain string
	UTCDate         time.Time
	IngestID        string
	Prefix          string
	RawKey          string
	EdgeKey         string
	DSNKey          string
	ResultKey       string
}

type OutboundBundle struct {
	SenderDomain string
	UTCDate      time.Time
	SendID       string
	Prefix       string
	RelayKey     string
	RelayMetaKey string
	ProviderKey  string
	ResultKey    string
}

func NewUUIDv7String() (string, error) {
	id, err := uuid.NewV7()
	if err != nil {
		return "", fmt.Errorf("generate uuidv7: %w", err)
	}
	return id.String(), nil
}

func ValidateUUIDv7(value string) error {
	id, err := uuid.Parse(value)
	if err != nil {
		return fmt.Errorf("parse uuid: %w", err)
	}
	if id.Version() != 7 {
		return fmt.Errorf("uuid %q is version %d, not version 7", value, id.Version())
	}
	if value != strings.ToLower(id.String()) {
		return fmt.Errorf("uuid %q is not canonical lowercase form", value)
	}
	return nil
}

func UUIDv7Time(value string) (time.Time, error) {
	id, err := uuid.Parse(value)
	if err != nil {
		return time.Time{}, fmt.Errorf("parse uuid: %w", err)
	}
	if id.Version() != 7 {
		return time.Time{}, fmt.Errorf("uuid %q is version %d, not version 7", value, id.Version())
	}
	sec, nsec := id.Time().UnixTime()
	return time.Unix(sec, nsec).UTC(), nil
}

func InboundBundleKeys(recipientDomain string, ts time.Time, ingestID string) (InboundBundle, error) {
	domain, err := CanonicalDomain(recipientDomain)
	if err != nil {
		return InboundBundle{}, fmt.Errorf("canonical recipient domain: %w", err)
	}
	if domain == "" {
		return InboundBundle{}, fmt.Errorf("missing recipient domain")
	}
	if err := ValidateUUIDv7(ingestID); err != nil {
		return InboundBundle{}, fmt.Errorf("invalid ingest_id: %w", err)
	}

	date := utcDate(ts)
	prefix := path.Join(MailPrefix, "inbound", domain, date.Format("2006/01/02"), ingestID)
	return InboundBundle{
		RecipientDomain: domain,
		UTCDate:         date,
		IngestID:        ingestID,
		Prefix:          prefix,
		RawKey:          path.Join(prefix, "raw.eml"),
		EdgeKey:         path.Join(prefix, "edge.json"),
		DSNKey:          path.Join(prefix, "dsn.eml"),
		ResultKey:       path.Join(prefix, "result.json"),
	}, nil
}

func InboundDSNKey(bundlePrefix string) (string, error) {
	if strings.TrimSpace(bundlePrefix) == "" {
		return "", fmt.Errorf("missing inbound bundle prefix")
	}
	return path.Join(bundlePrefix, "dsn.eml"), nil
}

func InboundDailyPrefix(recipientDomain string, ts time.Time) (string, error) {
	domain, err := CanonicalDomain(recipientDomain)
	if err != nil {
		return "", fmt.Errorf("canonical recipient domain: %w", err)
	}
	if domain == "" {
		return "", fmt.Errorf("missing recipient domain")
	}
	return path.Join(MailPrefix, "inbound", domain, utcDate(ts).Format("2006/01/02")) + "/", nil
}

func OutboundBundleKeys(senderDomain string, ts time.Time, sendID string, provider string) (OutboundBundle, error) {
	domain, err := CanonicalDomain(senderDomain)
	if err != nil {
		return OutboundBundle{}, fmt.Errorf("canonical sender domain: %w", err)
	}
	if domain == "" {
		return OutboundBundle{}, fmt.Errorf("missing sender domain")
	}
	if err := ValidateUUIDv7(sendID); err != nil {
		return OutboundBundle{}, fmt.Errorf("invalid send_id: %w", err)
	}

	providerFile := "provider.json"
	if provider == "ses" {
		providerFile = "provider.eml"
	}

	date := utcDate(ts)
	prefix := path.Join(MailPrefix, "outbound", domain, date.Format("2006/01/02"), sendID)
	return OutboundBundle{
		SenderDomain: domain,
		UTCDate:      date,
		SendID:       sendID,
		Prefix:       prefix,
		RelayKey:     path.Join(prefix, "relay.eml"),
		RelayMetaKey: path.Join(prefix, "relay.json"),
		ProviderKey:  path.Join(prefix, providerFile),
		ResultKey:    path.Join(prefix, "result.json"),
	}, nil
}

func IsInboundEdgeKey(key string) bool {
	parts := splitObjectKey(key)
	return len(parts) == 8 && parts[0] == MailPrefix && parts[1] == "inbound" && parts[7] == "edge.json"
}

func ParseInboundEdgeKey(key string) (InboundBundle, error) {
	parts := splitObjectKey(key)
	if len(parts) != 8 {
		return InboundBundle{}, fmt.Errorf("inbound edge key must have 8 path segments")
	}
	if parts[0] != MailPrefix || parts[1] != "inbound" || parts[7] != "edge.json" {
		return InboundBundle{}, fmt.Errorf("inbound edge key does not match mail/inbound/.../edge.json")
	}

	domain, err := CanonicalDomain(parts[2])
	if err != nil {
		return InboundBundle{}, fmt.Errorf("canonical recipient domain: %w", err)
	}
	if domain != parts[2] {
		return InboundBundle{}, fmt.Errorf("recipient domain path segment is not canonical")
	}

	date, err := parseUTCDateSegments(parts[3], parts[4], parts[5])
	if err != nil {
		return InboundBundle{}, err
	}
	ingestID := parts[6]
	if err := ValidateUUIDv7(ingestID); err != nil {
		return InboundBundle{}, fmt.Errorf("invalid ingest_id: %w", err)
	}
	return InboundBundleKeys(domain, date, ingestID)
}

func splitObjectKey(key string) []string {
	return strings.Split(path.Clean(key), "/")
}

func CanonicalDomainFromAddress(value string) (string, error) {
	return structured.DomainFromAddrSpec(value)
}

func CanonicalDomain(value string) (string, error) {
	return structured.CanonicalDomain(value)
}

func utcDate(ts time.Time) time.Time {
	utc := ts.UTC()
	return time.Date(utc.Year(), utc.Month(), utc.Day(), 0, 0, 0, 0, time.UTC)
}

func parseUTCDateSegments(year string, month string, day string) (time.Time, error) {
	parsed, err := time.ParseInLocation("2006/01/02", path.Join(year, month, day), time.UTC)
	if err != nil {
		return time.Time{}, fmt.Errorf("parse UTC archive date: %w", err)
	}
	if parsed.Format("2006") != year || parsed.Format("01") != month || parsed.Format("02") != day {
		return time.Time{}, fmt.Errorf("archive date path is not canonical")
	}
	return parsed, nil
}
