package controlstate

import (
	"context"
	"testing"
	"time"
)

func TestAddModifyRemoveDomainConfigOwnsMinimalDesiredState(t *testing.T) {
	store := NewMemoryStore()
	now := time.Date(2026, 5, 21, 12, 0, 0, 0, time.UTC)

	record, changed, err := AddDomain(context.Background(), store, ProviderSES, DomainConfigParams{
		Domain:             "example.com",
		Enabled:            true,
		CloudflareZoneName: "example.com",
		MailFromDomain:     "ei.example.com",
	}, now)
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

	modified, changed, err := ModifyDomain(context.Background(), store, ProviderSES, DomainConfigParams{
		Domain:             "example.com",
		Enabled:            false,
		CloudflareZoneName: "example.com",
		MailFromDomain:     "mail.example.com",
	}, now.Add(time.Hour))
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

	_, changed, err = ModifyDomain(context.Background(), store, ProviderSES, DomainConfigParams{
		Domain:             "example.com",
		Enabled:            true,
		CloudflareZoneName: "example.com",
		MailFromDomain:     "mail.example.com",
	}, now.Add(90*time.Minute))
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
}

func TestModifyDomainClearsCloudflareProvisionWhenZoneChanges(t *testing.T) {
	store := NewMemoryStore()
	now := time.Date(2026, 5, 21, 12, 0, 0, 0, time.UTC)
	if _, _, err := AddDomain(context.Background(), store, ProviderSES, DomainConfigParams{
		Domain:             "example.com",
		Enabled:            true,
		CloudflareZoneName: "example.com",
		MailFromDomain:     "ei.example.com",
	}, now); err != nil {
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

	modified, changed, err := ModifyDomain(context.Background(), store, ProviderSES, DomainConfigParams{
		Domain:             "example.com",
		Enabled:            true,
		CloudflareZoneName: "mail.example.com",
		MailFromDomain:     "ei.example.com",
	}, now.Add(time.Hour))
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

	record, changed, err := ApplyDomain(context.Background(), store, DomainApplyParams{
		CompanyIdentity:      "example",
		Domain:               "example.com",
		DesiredHash:          "sha256:domain-v1",
		AuthoritativeRouting: true,
		CloudflareZoneName:   "example.com",
		FeedbackLocalPart:    "bounces",
		Outbound: DomainOutboundPolicy{
			Provider:     ProviderSES,
			SenderDomain: "example.com",
		},
		ProviderMetadata: DomainProviderMetadata{
			SES: SESProviderMetadata{
				IdentityDomain:     "example.com",
				MailFromDomain:     "ei.example.com",
				FeedbackReturnPath: "bounces@example.com",
			},
		},
	}, now)
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

func TestApplyDomainDoesNotRewriteUnchangedDesiredState(t *testing.T) {
	store := NewMemoryStore()
	params := DomainApplyParams{
		CompanyIdentity:      "example",
		Domain:               "example.com",
		DesiredHash:          "sha256:domain-v1",
		AuthoritativeRouting: true,
		CloudflareZoneName:   "example.com",
		FeedbackAddress:      "bounces@example.com",
		Outbound: DomainOutboundPolicy{
			Provider:     ProviderCloudflare,
			SenderDomain: "example.com",
		},
		ProviderMetadata: DomainProviderMetadata{
			Cloudflare: CloudflareProviderMetadata{
				SendingDomain: "example.com",
			},
		},
	}
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
	params := DomainApplyParams{
		CompanyIdentity:      "example",
		Domain:               "example.com",
		DesiredHash:          "sha256:domain-v1",
		AuthoritativeRouting: true,
		CloudflareZoneName:   "example.com",
		FeedbackAddress:      "bounces@example.com",
		Outbound: DomainOutboundPolicy{
			Provider:     ProviderCloudflare,
			SenderDomain: "example.com",
		},
		ProviderMetadata: DomainProviderMetadata{
			Cloudflare: CloudflareProviderMetadata{
				SendingDomain: "example.com",
			},
		},
	}
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
	_, _, err := ApplyDomain(context.Background(), NewMemoryStore(), DomainApplyParams{
		CompanyIdentity:      "example",
		Domain:               "example.com",
		DesiredHash:          "sha256:domain-v1",
		AuthoritativeRouting: true,
		CloudflareZoneName:   "example.com",
		FeedbackAddress:      "bounces@example.net",
		Outbound: DomainOutboundPolicy{
			Provider:     ProviderCloudflare,
			SenderDomain: "example.com",
		},
		ProviderMetadata: DomainProviderMetadata{
			Cloudflare: CloudflareProviderMetadata{
				SendingDomain: "example.com",
			},
		},
	}, time.Now().UTC())
	if err == nil {
		t.Fatalf("ApplyDomain succeeded, want feedback domain error")
	}
}
