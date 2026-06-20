package domainregistry

import "agent-mail/internal/control/controlstate"

func StatusesFromControlState(records []controlstate.DomainRecord, selectedProvider string) []DomainStatus {
	statuses := make([]DomainStatus, 0, len(records))
	for _, record := range records {
		if record.Status != controlstate.DomainStatusActive {
			continue
		}
		status := DomainStatus{
			Domain:          record.Domain,
			Status:          "ready",
			FeedbackAddress: record.FeedbackAddress,
			Feedback: FeedbackStatus{
				OK:         record.FeedbackAddress != "",
				Configured: record.FeedbackAddress != "",
				Address:    record.FeedbackAddress,
			},
			Inbound: InboundStatus{
				SweepConfigured: true,
				DSNConfigured:   record.FeedbackAddress != "",
				Provider:        "cloudflare",
				CloudflareZone:  record.CloudflareZoneName,
			},
			Outbound: OutboundStatus{
				Configured:   true,
				Provider:     record.Outbound.Provider,
				SenderDomain: record.Outbound.SenderDomain,
			},
			ProviderIdentity: ProviderIdentity{
				Cloudflare: CloudflareIdentity{
					SendingDomain: record.ProviderMetadata.Cloudflare.SendingDomain,
					BounceDomain:  record.ProviderMetadata.Cloudflare.BounceDomain,
				},
				SES: SESIdentity{
					IdentityDomain:     record.ProviderMetadata.SES.IdentityDomain,
					MailFromDomain:     record.ProviderMetadata.SES.MailFromDomain,
					FeedbackReturnPath: record.ProviderMetadata.SES.FeedbackReturnPath,
				},
			},
			Cloudflare: CloudflareStatus{
				OK:                  record.CloudflareProvision.LastProvisionStatus == "applied" && record.CloudflareProvision.LastProvisionError == "",
				ZoneName:            record.CloudflareZoneName,
				ZoneID:              record.CloudflareProvision.ZoneID,
				CatchAllRuleID:      record.CloudflareProvision.CatchAllRuleID,
				CatchAllEnabled:     record.CloudflareProvision.CatchAllEnabled,
				CatchAllConfigured:  record.CloudflareProvision.CatchAllEnabled,
				LastProvisionStatus: record.CloudflareProvision.LastProvisionStatus,
				LastProvisionAt:     record.CloudflareProvision.LastProvisionAt,
				LastProvisionError:  record.CloudflareProvision.LastProvisionError,
			},
		}
		if record.AuthoritativeRouting && record.CloudflareProvision.LastProvisionAt == nil {
			status.Issues = append(status.Issues, "cloudflare_provision_not_run")
		}
		if record.CloudflareProvision.LastProvisionError != "" {
			status.Issues = append(status.Issues, "cloudflare_provision_failed")
		}
		if record.Outbound.Provider != selectedProvider {
			status.Issues = append(status.Issues, "selected_provider_mismatch")
		}
		status.Issues = append(status.Issues, domainIssues(status)...)
		if len(status.Issues) > 0 {
			status.Status = "misconfigured"
		}
		statuses = append(statuses, status)
	}
	return statuses
}
