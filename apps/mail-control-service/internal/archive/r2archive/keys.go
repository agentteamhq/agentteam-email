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

	MailPrefix    = "mail"
	OrgsPrefix    = "orgs"
	DomainsPrefix = "domains"
)

type InboundBundle struct {
	OrganizationPublicID string
	RecipientDomain      string
	ArchivePrefix        string
	UTCDate              time.Time
	IngestID             string
	Prefix               string
	RawKey               string
	EdgeKey              string
	DSNKey               string
	ResultKey            string
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

func OrganizationInboundArchivePrefix(organizationPublicID string, recipientDomain string) (string, error) {
	orgID, err := CanonicalPathSegment(organizationPublicID, "organization_public_id")
	if err != nil {
		return "", err
	}
	domain, err := CanonicalDomain(recipientDomain)
	if err != nil {
		return "", fmt.Errorf("canonical recipient domain: %w", err)
	}
	if domain == "" {
		return "", fmt.Errorf("missing recipient domain")
	}
	return path.Join(OrgsPrefix, orgID, DomainsPrefix, domain, MailPrefix, "inbound"), nil
}

func OrganizationInboundBundleKeys(organizationPublicID string, recipientDomain string, ts time.Time, ingestID string) (InboundBundle, error) {
	archivePrefix, err := OrganizationInboundArchivePrefix(organizationPublicID, recipientDomain)
	if err != nil {
		return InboundBundle{}, err
	}
	return InboundBundleKeysFromArchivePrefix(archivePrefix, ts, ingestID)
}

func InboundBundleKeysFromArchivePrefix(archivePrefix string, ts time.Time, ingestID string) (InboundBundle, error) {
	parsedPrefix, err := ParseInboundArchivePrefix(archivePrefix)
	if err != nil {
		return InboundBundle{}, err
	}
	if err := ValidateUUIDv7(ingestID); err != nil {
		return InboundBundle{}, fmt.Errorf("invalid ingest_id: %w", err)
	}

	date := utcDate(ts)
	prefix := path.Join(archivePrefix, date.Format("2006/01/02"), ingestID)
	return InboundBundle{
		OrganizationPublicID: parsedPrefix.OrganizationPublicID,
		RecipientDomain:      parsedPrefix.RecipientDomain,
		ArchivePrefix:        parsedPrefix.ArchivePrefix,
		UTCDate:              date,
		IngestID:             ingestID,
		Prefix:               prefix,
		RawKey:               path.Join(prefix, "raw.eml"),
		EdgeKey:              path.Join(prefix, "edge.json"),
		DSNKey:               path.Join(prefix, "dsn.eml"),
		ResultKey:            path.Join(prefix, "result.json"),
	}, nil
}

func InboundDSNKey(bundlePrefix string) (string, error) {
	if strings.TrimSpace(bundlePrefix) == "" {
		return "", fmt.Errorf("missing inbound bundle prefix")
	}
	return path.Join(bundlePrefix, "dsn.eml"), nil
}

func OrganizationInboundDailyPrefix(organizationPublicID string, recipientDomain string, ts time.Time) (string, error) {
	archivePrefix, err := OrganizationInboundArchivePrefix(organizationPublicID, recipientDomain)
	if err != nil {
		return "", err
	}
	return path.Join(archivePrefix, utcDate(ts).Format("2006/01/02")) + "/", nil
}

type InboundArchivePrefix struct {
	OrganizationPublicID string
	RecipientDomain      string
	ArchivePrefix        string
}

func ParseInboundArchivePrefix(prefix string) (InboundArchivePrefix, error) {
	cleaned := strings.TrimSuffix(path.Clean(prefix), "/")
	parts := strings.Split(cleaned, "/")
	if len(parts) != 6 {
		return InboundArchivePrefix{}, fmt.Errorf("inbound archive prefix must have 6 path segments")
	}
	if parts[0] != OrgsPrefix || parts[2] != DomainsPrefix || parts[4] != MailPrefix || parts[5] != "inbound" {
		return InboundArchivePrefix{}, fmt.Errorf("inbound archive prefix does not match orgs/.../domains/.../mail/inbound")
	}
	orgID, err := CanonicalPathSegment(parts[1], "organization_public_id")
	if err != nil {
		return InboundArchivePrefix{}, err
	}
	if orgID != parts[1] {
		return InboundArchivePrefix{}, fmt.Errorf("organization_public_id path segment is not canonical")
	}
	domain, err := CanonicalDomain(parts[3])
	if err != nil {
		return InboundArchivePrefix{}, fmt.Errorf("canonical recipient domain: %w", err)
	}
	if domain != parts[3] {
		return InboundArchivePrefix{}, fmt.Errorf("recipient domain path segment is not canonical")
	}
	return InboundArchivePrefix{
		OrganizationPublicID: orgID,
		RecipientDomain:      domain,
		ArchivePrefix:        path.Join(parts...),
	}, nil
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
	return len(parts) == 11 && parts[0] == OrgsPrefix && parts[2] == DomainsPrefix && parts[4] == MailPrefix && parts[5] == "inbound" && parts[10] == "edge.json"
}

func ParseInboundEdgeKey(key string) (InboundBundle, error) {
	parts := splitObjectKey(key)
	if len(parts) == 11 {
		if parts[0] != OrgsPrefix || parts[2] != DomainsPrefix || parts[4] != MailPrefix || parts[5] != "inbound" || parts[10] != "edge.json" {
			return InboundBundle{}, fmt.Errorf("inbound edge key does not match orgs/.../domains/.../mail/inbound/.../edge.json")
		}
		archivePrefix := path.Join(parts[:6]...)
		prefix, err := ParseInboundArchivePrefix(archivePrefix)
		if err != nil {
			return InboundBundle{}, err
		}
		date, err := parseUTCDateSegments(parts[6], parts[7], parts[8])
		if err != nil {
			return InboundBundle{}, err
		}
		ingestID := parts[9]
		if err := ValidateUUIDv7(ingestID); err != nil {
			return InboundBundle{}, fmt.Errorf("invalid ingest_id: %w", err)
		}
		return OrganizationInboundBundleKeys(prefix.OrganizationPublicID, prefix.RecipientDomain, date, ingestID)
	}
	return InboundBundle{}, fmt.Errorf("inbound edge key must match orgs/.../domains/.../mail/inbound/.../edge.json")
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

func CanonicalPathSegment(value string, field string) (string, error) {
	segment := strings.TrimSpace(value)
	if segment == "" {
		return "", fmt.Errorf("%s is required", field)
	}
	if segment != value {
		return "", fmt.Errorf("%s must not have surrounding whitespace", field)
	}
	if segment == "." || segment == ".." || strings.Contains(segment, "/") || strings.Contains(segment, "\\") {
		return "", fmt.Errorf("%s must be a single path segment", field)
	}
	if path.Clean(segment) != segment {
		return "", fmt.Errorf("%s must be a canonical path segment", field)
	}
	return segment, nil
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
