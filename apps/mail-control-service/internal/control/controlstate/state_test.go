package controlstate

import (
	"context"
	"testing"
	"time"
)

func testDomainConfigParams(domain string, enabled bool) DomainConfigParams {
	return DomainConfigParams{
		OrganizationID:       "org-1",
		OrganizationPublicID: "org_pub_123",
		Domain:               domain,
		Enabled:              enabled,
		CloudflareZoneName:   domain,
		ArchivePrefix:        "orgs/org_pub_123/domains/" + domain + "/mail/inbound",
		WorkerConnectionID:   "worker-connection-1",
		WorkerDeploymentID:   "worker-deployment-1",
	}
}

func testDomainApplyParams(domain string, provider string) DomainApplyParams {
	params := DomainApplyParams{
		CompanyIdentity:      "example",
		OrganizationID:       "org-1",
		OrganizationPublicID: "org_pub_123",
		Domain:               domain,
		DesiredHash:          "sha256:domain-v1",
		AuthoritativeRouting: true,
		CloudflareZoneName:   domain,
		ArchivePrefix:        "orgs/org_pub_123/domains/" + domain + "/mail/inbound",
		WorkerConnectionID:   "worker-connection-1",
		WorkerDeploymentID:   "worker-deployment-1",
		FeedbackAddress:      "bounces@" + domain,
		Outbound: DomainOutboundPolicy{
			Provider:     provider,
			SenderDomain: domain,
		},
	}
	switch provider {
	case ProviderCloudflare:
		params.ProviderMetadata.Cloudflare = CloudflareProviderMetadata{SendingDomain: domain}
	case ProviderSES:
		params.ProviderMetadata.SES = SESProviderMetadata{
			IdentityDomain:     domain,
			FeedbackReturnPath: "bounces@" + domain,
		}
	}
	return params
}

func TestAddModifyRemoveDomainConfigOwnsMinimalDesiredState(t *testing.T) {
	store := NewMemoryStore()
	now := time.Date(2026, 5, 21, 12, 0, 0, 0, time.UTC)

	addParams := testDomainConfigParams("example.com", true)
	addParams.MailFromDomain = "ei.example.com"
	record, changed, err := AddDomain(context.Background(), store, ProviderSES, addParams, now)
	if err != nil {
		t.Fatalf("AddDomain: %v", err)
	}
	if !changed {
		t.Fatalf("AddDomain changed = false, want true")
	}
	if record.FeedbackAddress != "bounces@example.com" {
		t.Fatalf("FeedbackAddress = %q", record.FeedbackAddress)
	}
	if record.Outbound.Provider != ProviderSES {
		t.Fatalf("Outbound.Provider = %q", record.Outbound.Provider)
	}
	if record.ProviderMetadata.SES.FeedbackReturnPath != "bounces@example.com" {
		t.Fatalf("FeedbackReturnPath = %q", record.ProviderMetadata.SES.FeedbackReturnPath)
	}

	modifyParams := testDomainConfigParams("example.com", false)
	modifyParams.MailFromDomain = "mail.example.com"
	modified, changed, err := ModifyDomain(context.Background(), store, ProviderSES, modifyParams, now.Add(time.Hour))
	if err != nil {
		t.Fatalf("ModifyDomain: %v", err)
	}
	if !changed {
		t.Fatalf("ModifyDomain changed = false, want true")
	}
	if modified.Status != DomainStatusDeactivated {
		t.Fatalf("modified Status = %q", modified.Status)
	}
	if modified.MailFromDomain != "mail.example.com" {
		t.Fatalf("modified MailFromDomain = %q", modified.MailFromDomain)
	}

	reenableParams := testDomainConfigParams("example.com", true)
	reenableParams.MailFromDomain = "mail.example.com"
	_, changed, err = ModifyDomain(context.Background(), store, ProviderSES, reenableParams, now.Add(90*time.Minute))
	if err != nil {
		t.Fatalf("reenable ModifyDomain: %v", err)
	}
	if !changed {
		t.Fatalf("reenable ModifyDomain changed = false, want true")
	}
	removed, changed, err := RemoveDomain(context.Background(), store, DomainRemoveParams{
		Domain: "example.com",
	}, now.Add(2*time.Hour))
	if err != nil {
		t.Fatalf("RemoveDomain: %v", err)
	}
	if !changed {
		t.Fatalf("RemoveDomain changed = false, want true")
	}
	if removed.Status != DomainStatusDeactivated {
		t.Fatalf("removed Status = %q", removed.Status)
	}
	if removed.AuthoritativeRouting {
		t.Fatalf("removed AuthoritativeRouting = true, want false")
	}
	active, err := ActiveDomainRecords(context.Background(), store, nil)
	if err != nil {
		t.Fatalf("ActiveDomainRecords after remove: %v", err)
	}
	if len(active) != 0 {
		t.Fatalf("active runtime projection after remove = %#v, want no active domains", active)
	}
}

func TestDomainConfigDefaultsMailFromDomainToOwnedDomain(t *testing.T) {
	record, err := NormalizeDomainConfig(testDomainConfigParams("example.com", true), ProviderSES, time.Date(2026, 5, 21, 12, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("NormalizeDomainConfig: %v", err)
	}
	if record.MailFromDomain != "example.com" {
		t.Fatalf("MailFromDomain = %q, want example.com", record.MailFromDomain)
	}
	if record.ProviderMetadata.SES.MailFromDomain != "example.com" {
		t.Fatalf("ProviderMetadata.SES.MailFromDomain = %q, want example.com", record.ProviderMetadata.SES.MailFromDomain)
	}
}

func TestDomainConfigRejectsCrossDomainMailFromDomain(t *testing.T) {
	params := testDomainConfigParams("example.com", true)
	params.MailFromDomain = "mail.example.net"
	_, err := NormalizeDomainConfig(params, ProviderSES, time.Date(2026, 5, 21, 12, 0, 0, 0, time.UTC))
	if err == nil {
		t.Fatal("NormalizeDomainConfig succeeded with cross-domain mail_from_domain")
	}
}

func TestDomainConfigRejectsMismatchedArchivePrefix(t *testing.T) {
	params := testDomainConfigParams("example.com", true)
	params.ArchivePrefix = "orgs/org_pub_123/domains/example.net/mail/inbound"

	_, err := NormalizeDomainConfig(params, ProviderSES, time.Date(2026, 5, 21, 12, 0, 0, 0, time.UTC))
	if err == nil {
		t.Fatal("NormalizeDomainConfig succeeded with mismatched archive_prefix")
	}
}

func TestModifyDomainClearsCloudflareProvisionWhenZoneChanges(t *testing.T) {
	store := NewMemoryStore()
	now := time.Date(2026, 5, 21, 12, 0, 0, 0, time.UTC)
	addParams := testDomainConfigParams("example.com", true)
	addParams.MailFromDomain = "ei.example.com"
	if _, _, err := AddDomain(context.Background(), store, ProviderSES, addParams, now); err != nil {
		t.Fatalf("AddDomain: %v", err)
	}
	provisionedAt := now.Add(time.Minute)
	if _, err := RecordCloudflareProvision(context.Background(), store, "example.com", CloudflareProvision{
		ZoneName:            "example.com",
		ZoneID:              "zone-1",
		CatchAllRuleID:      "catch-all-1",
		CatchAllEnabled:     true,
		LastProvisionStatus: "applied",
		LastProvisionAt:     &provisionedAt,
	}, provisionedAt); err != nil {
		t.Fatalf("RecordCloudflareProvision: %v", err)
	}

	modifyParams := testDomainConfigParams("example.com", true)
	modifyParams.CloudflareZoneName = "mail.example.com"
	modifyParams.MailFromDomain = "ei.example.com"
	modified, changed, err := ModifyDomain(context.Background(), store, ProviderSES, modifyParams, now.Add(time.Hour))
	if err != nil {
		t.Fatalf("ModifyDomain: %v", err)
	}
	if !changed {
		t.Fatalf("ModifyDomain changed = false, want true")
	}
	if modified.CloudflareProvision.LastProvisionStatus != "" {
		t.Fatalf("Cloudflare provision was preserved across zone change: %#v", modified.CloudflareProvision)
	}
}

func TestApplyDomainNormalizesAndPersistsActiveDomain(t *testing.T) {
	store := NewMemoryStore()
	now := time.Date(2026, 5, 21, 12, 0, 0, 0, time.UTC)

	applyParams := testDomainApplyParams("example.com", ProviderSES)
	applyParams.FeedbackAddress = ""
	applyParams.FeedbackLocalPart = "bounces"
	applyParams.ProviderMetadata.SES.MailFromDomain = "ei.example.com"
	record, changed, err := ApplyDomain(context.Background(), store, applyParams, now)
	if err != nil {
		t.Fatalf("ApplyDomain: %v", err)
	}
	if !changed {
		t.Fatalf("changed = false, want true")
	}
	if record.FeedbackAddress != "bounces@example.com" {
		t.Fatalf("record.FeedbackAddress = %q", record.FeedbackAddress)
	}
	if record.ProviderMetadata.SES.FeedbackReturnPath != "bounces@example.com" {
		t.Fatalf("SES feedback return path = %q", record.ProviderMetadata.SES.FeedbackReturnPath)
	}

	state, err := store.State(context.Background())
	if err != nil {
		t.Fatalf("State: %v", err)
	}
	if len(state.Domains) != 1 {
		t.Fatalf("len(state.Domains) = %d, want 1", len(state.Domains))
	}
	if state.Domains[0].Status != DomainStatusActive {
		t.Fatalf("domain status = %q", state.Domains[0].Status)
	}
}

func TestApplyDomainDefaultsAndValidatesSESMailFromDomain(t *testing.T) {
	now := time.Date(2026, 5, 21, 12, 0, 0, 0, time.UTC)
	base := testDomainApplyParams("example.com", ProviderSES)

	record, err := NormalizeDomainApply(base, now)
	if err != nil {
		t.Fatalf("NormalizeDomainApply: %v", err)
	}
	if record.ProviderMetadata.SES.MailFromDomain != "example.com" {
		t.Fatalf("default SES mail-from domain = %q, want example.com", record.ProviderMetadata.SES.MailFromDomain)
	}

	base.ProviderMetadata.SES.MailFromDomain = "mail.example.net"
	if _, err := NormalizeDomainApply(base, now); err == nil {
		t.Fatal("NormalizeDomainApply succeeded with cross-domain SES mail-from domain")
	}
}

func TestApplyDomainDoesNotRewriteUnchangedDesiredState(t *testing.T) {
	store := NewMemoryStore()
	params := testDomainApplyParams("example.com", ProviderCloudflare)
	firstTime := time.Date(2026, 5, 21, 12, 0, 0, 0, time.UTC)
	first, changed, err := ApplyDomain(context.Background(), store, params, firstTime)
	if err != nil {
		t.Fatalf("first ApplyDomain: %v", err)
	}
	if !changed {
		t.Fatalf("first changed = false")
	}

	second, changed, err := ApplyDomain(context.Background(), store, params, firstTime.Add(time.Hour))
	if err != nil {
		t.Fatalf("second ApplyDomain: %v", err)
	}
	if changed {
		t.Fatalf("second changed = true, want false")
	}
	if !second.UpdatedAt.Equal(first.UpdatedAt) {
		t.Fatalf("second UpdatedAt = %s, want %s", second.UpdatedAt, first.UpdatedAt)
	}
}

func TestApplyDomainPreservesPrimitiveStateForSameDesiredState(t *testing.T) {
	store := NewMemoryStore()
	params := testDomainApplyParams("example.com", ProviderCloudflare)
	firstTime := time.Date(2026, 5, 21, 12, 0, 0, 0, time.UTC)
	if _, _, err := ApplyDomain(context.Background(), store, params, firstTime); err != nil {
		t.Fatalf("ApplyDomain: %v", err)
	}
	provisionTime := firstTime.Add(time.Hour)
	if _, err := RecordCloudflareProvision(context.Background(), store, "example.com", CloudflareProvision{
		ZoneName:            "example.com",
		ZoneID:              "zone-1",
		CatchAllRuleID:      "catch-all-1",
		CatchAllEnabled:     true,
		LastProvisionStatus: "applied",
		LastProvisionAt:     &provisionTime,
	}, provisionTime); err != nil {
		t.Fatalf("RecordCloudflareProvision: %v", err)
	}

	second, changed, err := ApplyDomain(context.Background(), store, params, firstTime.Add(2*time.Hour))
	if err != nil {
		t.Fatalf("second ApplyDomain: %v", err)
	}
	if changed {
		t.Fatalf("second changed = true, want false")
	}
	if second.CloudflareProvision.ZoneID != "zone-1" {
		t.Fatalf("Cloudflare provision state was not preserved: %#v", second.CloudflareProvision)
	}
}

func TestApplyDomainRejectsCrossDomainFeedbackAddress(t *testing.T) {
	params := testDomainApplyParams("example.com", ProviderCloudflare)
	params.FeedbackAddress = "bounces@example.net"
	_, _, err := ApplyDomain(context.Background(), NewMemoryStore(), params, time.Now().UTC())
	if err == nil {
		t.Fatalf("ApplyDomain succeeded, want feedback domain error")
	}
}
