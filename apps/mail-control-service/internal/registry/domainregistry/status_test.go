package domainregistry

import (
	"testing"
	"time"

	"agent-mail/internal/control/controlstate"
	"agent-mail/internal/modules/poller"
	"agent-mail/internal/modules/smtprelay"
)

func TestProjectorReadsRuntimeConfigSchemas(t *testing.T) {
	projector, err := NewProjector(ProjectedStatusConfig{
		PollerConfig:        testPollerConfig(),
		ProviderRelayConfig: testRelayConfig(),
		SelectedProvider:    "ses",
	})
	if err != nil {
		t.Fatalf("NewProjector: %v", err)
	}

	snapshot, err := projector.Snapshot(time.Date(2026, 5, 21, 0, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("Snapshot: %v", err)
	}
	if len(snapshot.Domains) != 0 {
		t.Fatalf("len(snapshot.Domains) = %d, want 0 for generic checked-in runtime config", len(snapshot.Domains))
	}
}

func testPollerConfig() poller.Config {
	var cfg poller.Config
	cfg.Haraka.Address = "haraka:10025"
	cfg.DSN.SMTPAddress = "zonemta:2526"
	cfg.WildDuck.APIBaseURL = "http://wildduck:8080"
	cfg.WildDuck.MongoURI = "mongodb://mongodb:27017/wildduck"
	return cfg
}

func testRelayConfig() smtprelay.Config {
	return smtprelay.Config{}
}

func TestStatusesFromControlStateReportsCloudflarePrimitivePending(t *testing.T) {
	statuses := StatusesFromControlState([]controlstate.DomainRecord{
		{
			Status:               controlstate.DomainStatusActive,
			Domain:               "example.com",
			AuthoritativeRouting: true,
			CloudflareZoneName:   "example.com",
			FeedbackAddress:      "bounces@example.com",
			Outbound:             controlstate.DomainOutboundPolicy{Provider: "ses", SenderDomain: "example.com"},
			ProviderMetadata:     controlstate.DomainProviderMetadata{SES: controlstate.SESProviderMetadata{IdentityDomain: "example.com", MailFromDomain: "ei.example.com", FeedbackReturnPath: "bounces@example.com"}},
		},
	}, "ses")
	if len(statuses) != 1 {
		t.Fatalf("len(statuses) = %d, want 1", len(statuses))
	}
	if statuses[0].Status != "misconfigured" {
		t.Fatalf("status = %q, want misconfigured", statuses[0].Status)
	}
	if len(statuses[0].Issues) != 1 || statuses[0].Issues[0] != "cloudflare_provision_not_run" {
		t.Fatalf("issues = %#v", statuses[0].Issues)
	}
}
