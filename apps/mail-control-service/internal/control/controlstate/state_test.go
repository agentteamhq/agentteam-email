package controlstate

import (
	"context"
	"strings"
	"testing"
	"time"
)

func TestSyncRuntimeDomainsTreatsSnapshotAsAuthoritative(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStore()
	now := time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)

	results, changed, err := SyncRuntimeDomains(ctx, store, ProviderCloudflare, []DomainConfigParams{
		testDomainConfigParams("example.com", true),
		testDomainConfigParams("stale.example.com", true),
	}, now)
	if err != nil {
		t.Fatalf("initial SyncRuntimeDomains: %v", err)
	}
	if !changed || len(results) != 2 {
		t.Fatalf("initial sync changed=%t len(results)=%d, want changed and 2 results", changed, len(results))
	}

	nextResults, nextChanged, err := SyncRuntimeDomains(ctx, store, ProviderCloudflare, []DomainConfigParams{
		testDomainConfigParams("example.com", true),
	}, now.Add(time.Hour))
	if err != nil {
		t.Fatalf("second SyncRuntimeDomains: %v", err)
	}
	if !nextChanged {
		t.Fatal("second sync changed=false, want stale domain deactivation")
	}
	if len(nextResults) != 2 {
		t.Fatalf("len(nextResults)=%d, want active result plus stale deactivation", len(nextResults))
	}

	state, err := store.State(ctx)
	if err != nil {
		t.Fatalf("State: %v", err)
	}
	if len(state.Domains) != 2 {
		t.Fatalf("len(state.Domains)=%d, want 2", len(state.Domains))
	}
	stale := state.Domains[1]
	if stale.Domain != "stale.example.com" || stale.Status != DomainStatusDeactivated || stale.AuthoritativeRouting {
		t.Fatalf("stale domain was not deactivated: %#v", stale)
	}
}

func TestSyncRuntimeDomainsRejectsInvalidSnapshotWithoutPartialMutation(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStore()
	now := time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)
	if _, _, err := SyncRuntimeDomains(ctx, store, ProviderCloudflare, []DomainConfigParams{
		testDomainConfigParams("example.com", true),
	}, now); err != nil {
		t.Fatalf("initial SyncRuntimeDomains: %v", err)
	}

	invalid := testDomainConfigParams("invalid.example.com", true)
	invalid.ArchivePrefix = "../bad"
	if _, _, err := SyncRuntimeDomains(ctx, store, ProviderCloudflare, []DomainConfigParams{
		testDomainConfigParams("new.example.com", true),
		invalid,
	}, now.Add(time.Hour)); err == nil {
		t.Fatal("SyncRuntimeDomains accepted invalid snapshot")
	}

	state, err := store.State(ctx)
	if err != nil {
		t.Fatalf("State: %v", err)
	}
	if len(state.Domains) != 1 || state.Domains[0].Domain != "example.com" || state.Domains[0].Status != DomainStatusActive {
		t.Fatalf("store mutated after rejected snapshot: %#v", state.Domains)
	}
}

func TestSyncRuntimeDomainsRejectsDuplicateDomains(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStore()
	now := time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)

	_, _, err := SyncRuntimeDomains(ctx, store, ProviderCloudflare, []DomainConfigParams{
		testDomainConfigParams("example.com", true),
		testDomainConfigParams("EXAMPLE.com", true),
	}, now)
	if err == nil || !strings.Contains(err.Error(), "duplicate runtime domain") {
		t.Fatalf("duplicate sync error=%v, want duplicate runtime domain", err)
	}

	state, err := store.State(ctx)
	if err != nil {
		t.Fatalf("State: %v", err)
	}
	if len(state.Domains) != 0 {
		t.Fatalf("store mutated after duplicate snapshot: %#v", state.Domains)
	}
}

func TestActiveDomainRecordsFiltersAndValidatesSelection(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStore()
	now := time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)
	if _, _, err := SyncRuntimeDomains(ctx, store, ProviderSES, []DomainConfigParams{
		testDomainConfigParams("example.com", true),
		testDomainConfigParams("disabled.example.com", false),
	}, now); err != nil {
		t.Fatalf("SyncRuntimeDomains: %v", err)
	}

	records, err := ActiveDomainRecords(ctx, store, nil)
	if err != nil {
		t.Fatalf("ActiveDomainRecords: %v", err)
	}
	if len(records) != 1 || records[0].Domain != "example.com" {
		t.Fatalf("active records=%#v, want only example.com", records)
	}

	if _, err := ActiveDomainRecords(ctx, store, []string{"disabled.example.com"}); err == nil {
		t.Fatal("ActiveDomainRecords accepted inactive selected domain")
	}
}

func TestNormalizeDomainConfigValidatesMailFromDomain(t *testing.T) {
	now := time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)
	params := testDomainConfigParams("example.com", true)
	params.MailFromDomain = "mail.example.net"

	if _, err := NormalizeDomainConfig(params, ProviderSES, now); err == nil {
		t.Fatal("NormalizeDomainConfig accepted cross-domain mail_from_domain")
	}
}

func testDomainConfigParams(domain string, enabled bool) DomainConfigParams {
	canonical := strings.ToLower(domain)
	organizationPublicID := "org_public_test"
	return DomainConfigParams{
		OrganizationID:       "org-id",
		OrganizationPublicID: organizationPublicID,
		Domain:               canonical,
		Enabled:              enabled,
		CloudflareZoneName:   canonical,
		ArchivePrefix:        "orgs/" + organizationPublicID + "/domains/" + canonical + "/mail/inbound",
		WorkerConnectionID:   "worker-connection-" + strings.ReplaceAll(canonical, ".", "-"),
		WorkerDeploymentID:   "worker-deployment-" + strings.ReplaceAll(canonical, ".", "-"),
	}
}
