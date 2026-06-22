package r2archive

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

type keyLayoutFixture struct {
	Inbound struct {
		RecipientDomain string `json:"recipient_domain"`
		OrgPublicID     string `json:"org_public_id"`
		Timestamp       string `json:"timestamp"`
		IngestID        string `json:"ingest_id"`
		DailyPrefix     string `json:"daily_prefix"`
		BundlePrefix    string `json:"bundle_prefix"`
		RawKey          string `json:"raw_key"`
		EdgeKey         string `json:"edge_key"`
		DSNKey          string `json:"dsn_key"`
		ResultKey       string `json:"result_key"`
	} `json:"inbound"`
	OutboundSES struct {
		SenderDomain string `json:"sender_domain"`
		Timestamp    string `json:"timestamp"`
		SendID       string `json:"send_id"`
		BundlePrefix string `json:"bundle_prefix"`
		RelayKey     string `json:"relay_key"`
		RelayMetaKey string `json:"relay_meta_key"`
		ProviderKey  string `json:"provider_key"`
		ResultKey    string `json:"result_key"`
	} `json:"outbound_ses"`
}

func TestInboundBundleKeysAndParser(t *testing.T) {
	id, err := NewUUIDv7String()
	if err != nil {
		t.Fatalf("NewUUIDv7String returned error: %v", err)
	}
	ts := time.Date(2026, 4, 18, 12, 34, 56, 0, time.FixedZone("test", -7*60*60))

	bundle, err := InboundBundleKeys("Example.com", ts, id)
	if err != nil {
		t.Fatalf("InboundBundleKeys returned error: %v", err)
	}
	if bundle.RawKey != "mail/inbound/example.com/2026/04/18/"+id+"/raw.eml" {
		t.Fatalf("unexpected raw key: %s", bundle.RawKey)
	}
	if bundle.EdgeKey != "mail/inbound/example.com/2026/04/18/"+id+"/edge.json" {
		t.Fatalf("unexpected edge key: %s", bundle.EdgeKey)
	}
	if bundle.ResultKey != "mail/inbound/example.com/2026/04/18/"+id+"/result.json" {
		t.Fatalf("unexpected result key: %s", bundle.ResultKey)
	}
	if bundle.DSNKey != "mail/inbound/example.com/2026/04/18/"+id+"/dsn.eml" {
		t.Fatalf("unexpected dsn key: %s", bundle.DSNKey)
	}

	parsed, err := ParseInboundEdgeKey(bundle.EdgeKey)
	if err != nil {
		t.Fatalf("ParseInboundEdgeKey returned error: %v", err)
	}
	if parsed != bundle {
		t.Fatalf("parsed bundle mismatch: got %#v want %#v", parsed, bundle)
	}
}

func TestOrganizationInboundBundleKeysAndParser(t *testing.T) {
	id, err := NewUUIDv7String()
	if err != nil {
		t.Fatalf("NewUUIDv7String returned error: %v", err)
	}
	ts := time.Date(2026, 4, 18, 12, 34, 56, 0, time.FixedZone("test", -7*60*60))

	bundle, err := OrganizationInboundBundleKeys("org_pub_123", "Example.com", ts, id)
	if err != nil {
		t.Fatalf("OrganizationInboundBundleKeys returned error: %v", err)
	}
	wantPrefix := "orgs/org_pub_123/domains/example.com/mail/inbound"
	if bundle.OrganizationPublicID != "org_pub_123" {
		t.Fatalf("OrganizationPublicID = %q, want org_pub_123", bundle.OrganizationPublicID)
	}
	if bundle.ArchivePrefix != wantPrefix {
		t.Fatalf("ArchivePrefix = %q, want %q", bundle.ArchivePrefix, wantPrefix)
	}
	if bundle.RawKey != wantPrefix+"/2026/04/18/"+id+"/raw.eml" {
		t.Fatalf("unexpected raw key: %s", bundle.RawKey)
	}
	if bundle.EdgeKey != wantPrefix+"/2026/04/18/"+id+"/edge.json" {
		t.Fatalf("unexpected edge key: %s", bundle.EdgeKey)
	}
	if bundle.ResultKey != wantPrefix+"/2026/04/18/"+id+"/result.json" {
		t.Fatalf("unexpected result key: %s", bundle.ResultKey)
	}
	if bundle.DSNKey != wantPrefix+"/2026/04/18/"+id+"/dsn.eml" {
		t.Fatalf("unexpected dsn key: %s", bundle.DSNKey)
	}

	dailyPrefix, err := OrganizationInboundDailyPrefix("org_pub_123", "example.com", ts)
	if err != nil {
		t.Fatalf("OrganizationInboundDailyPrefix returned error: %v", err)
	}
	if dailyPrefix != wantPrefix+"/2026/04/18/" {
		t.Fatalf("daily prefix = %q, want org-prefixed day prefix", dailyPrefix)
	}

	parsed, err := ParseInboundEdgeKey(bundle.EdgeKey)
	if err != nil {
		t.Fatalf("ParseInboundEdgeKey returned error: %v", err)
	}
	if parsed != bundle {
		t.Fatalf("parsed bundle mismatch: got %#v want %#v", parsed, bundle)
	}
	if !IsInboundEdgeKey(bundle.EdgeKey) {
		t.Fatalf("org-prefixed edge key was not recognized")
	}
}

func TestParseInboundArchivePrefixRejectsNonCanonicalMetadata(t *testing.T) {
	tests := []string{
		"orgs/../domains/example.com/mail/inbound",
		"orgs/org_pub_123/domains/Example.com/mail/inbound",
		"mail/inbound/example.com",
	}
	for _, value := range tests {
		t.Run(value, func(t *testing.T) {
			if _, err := ParseInboundArchivePrefix(value); err == nil {
				t.Fatalf("ParseInboundArchivePrefix(%q) succeeded", value)
			}
		})
	}
}

func TestOutboundBundleKeys(t *testing.T) {
	id, err := NewUUIDv7String()
	if err != nil {
		t.Fatalf("NewUUIDv7String returned error: %v", err)
	}
	ts := time.Date(2026, 4, 18, 12, 34, 56, 0, time.UTC)

	bundle, err := OutboundBundleKeys("Example.com", ts, id, "ses")
	if err != nil {
		t.Fatalf("OutboundBundleKeys returned error: %v", err)
	}
	if bundle.RelayKey != "mail/outbound/example.com/2026/04/18/"+id+"/relay.eml" {
		t.Fatalf("unexpected relay key: %s", bundle.RelayKey)
	}
	if bundle.ProviderKey != "mail/outbound/example.com/2026/04/18/"+id+"/provider.eml" {
		t.Fatalf("unexpected provider key: %s", bundle.ProviderKey)
	}
}

func TestValidateUUIDv7RejectsNonV7(t *testing.T) {
	if err := ValidateUUIDv7("00000000-0000-4000-8000-000000000000"); err == nil {
		t.Fatal("expected non-v7 UUID rejection")
	}
}

func TestR2KeyLayoutGoldenFixture(t *testing.T) {
	fixture := loadKeyLayoutFixture(t)

	inboundTS, err := time.Parse(time.RFC3339Nano, fixture.Inbound.Timestamp)
	if err != nil {
		t.Fatalf("parse inbound fixture timestamp: %v", err)
	}
	dailyPrefix, err := OrganizationInboundDailyPrefix(fixture.Inbound.OrgPublicID, fixture.Inbound.RecipientDomain, inboundTS)
	if err != nil {
		t.Fatalf("OrganizationInboundDailyPrefix returned error: %v", err)
	}
	if dailyPrefix != fixture.Inbound.DailyPrefix {
		t.Fatalf("daily prefix = %q, want %q", dailyPrefix, fixture.Inbound.DailyPrefix)
	}

	inbound, err := OrganizationInboundBundleKeys(fixture.Inbound.OrgPublicID, fixture.Inbound.RecipientDomain, inboundTS, fixture.Inbound.IngestID)
	if err != nil {
		t.Fatalf("OrganizationInboundBundleKeys returned error: %v", err)
	}
	if inbound.Prefix != fixture.Inbound.BundlePrefix ||
		inbound.RawKey != fixture.Inbound.RawKey ||
		inbound.EdgeKey != fixture.Inbound.EdgeKey ||
		inbound.DSNKey != fixture.Inbound.DSNKey ||
		inbound.ResultKey != fixture.Inbound.ResultKey {
		t.Fatalf("inbound bundle mismatch: got %#v, fixture %#v", inbound, fixture.Inbound)
	}
	if !IsInboundEdgeKey(fixture.Inbound.EdgeKey) {
		t.Fatalf("fixture edge key was not recognized as inbound edge key")
	}

	outboundTS, err := time.Parse(time.RFC3339Nano, fixture.OutboundSES.Timestamp)
	if err != nil {
		t.Fatalf("parse outbound fixture timestamp: %v", err)
	}
	outbound, err := OutboundBundleKeys(fixture.OutboundSES.SenderDomain, outboundTS, fixture.OutboundSES.SendID, "ses")
	if err != nil {
		t.Fatalf("OutboundBundleKeys returned error: %v", err)
	}
	if outbound.Prefix != fixture.OutboundSES.BundlePrefix ||
		outbound.RelayKey != fixture.OutboundSES.RelayKey ||
		outbound.RelayMetaKey != fixture.OutboundSES.RelayMetaKey ||
		outbound.ProviderKey != fixture.OutboundSES.ProviderKey ||
		outbound.ResultKey != fixture.OutboundSES.ResultKey {
		t.Fatalf("outbound bundle mismatch: got %#v, fixture %#v", outbound, fixture.OutboundSES)
	}
}

func loadKeyLayoutFixture(t *testing.T) keyLayoutFixture {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "cloudflare-email-worker", "test", "fixtures", "r2-key-layout.json"))
	if err != nil {
		t.Fatalf("read key layout fixture: %v", err)
	}
	var fixture keyLayoutFixture
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatalf("decode key layout fixture: %v", err)
	}
	return fixture
}
