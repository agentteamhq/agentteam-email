package controlstate

import (
	"context"
	"fmt"
	"slices"
	"strings"
	"sync"
	"time"

	"agent-mail/internal/archive/r2archive"
	"agent-mail/internal/mail/structured"
)

const Schema = "agent-mail.control-state.v1"

const (
	DomainStatusActive      = "active"
	DomainStatusDeactivated = "deactivated"
)

const (
	ProviderCloudflare = "cloudflare"
	ProviderSES        = "ses"
)

type Store interface {
	State(ctx context.Context) (State, error)
	Update(ctx context.Context, update func(State) (State, error)) (State, error)
}

type State struct {
	Schema    string         `json:"schema"`
	UpdatedAt time.Time      `json:"updated_at"`
	Domains   []DomainRecord `json:"domains"`
}

type DomainConfigParams struct {
	OrganizationID       string `json:"organization_id"`
	OrganizationPublicID string `json:"organization_public_id"`
	Domain               string `json:"domain"`
	Enabled              bool   `json:"enabled"`
	CloudflareZoneName   string `json:"cloudflare_zone_name"`
	ArchivePrefix        string `json:"archive_prefix"`
	WorkerConnectionID   string `json:"worker_connection_id"`
	WorkerDeploymentID   string `json:"worker_domain_deployment_id"`
	MailFromDomain       string `json:"mail_from_domain,omitempty"`
}

type DomainOutboundPolicy struct {
	Provider     string `json:"provider"`
	SenderDomain string `json:"sender_domain"`
}

type DomainProviderMetadata struct {
	Cloudflare CloudflareProviderMetadata `json:"cloudflare,omitempty"`
	SES        SESProviderMetadata        `json:"ses,omitempty"`
}

type CloudflareProviderMetadata struct {
	SendingDomain string `json:"sending_domain,omitempty"`
	BounceDomain  string `json:"bounce_domain,omitempty"`
}

type SESProviderMetadata struct {
	IdentityDomain     string `json:"identity_domain,omitempty"`
	MailFromDomain     string `json:"mail_from_domain,omitempty"`
	FeedbackReturnPath string `json:"feedback_return_path,omitempty"`
}

type DomainRecord struct {
	OrganizationID       string                 `json:"organization_id"`
	OrganizationPublicID string                 `json:"organization_public_id"`
	Domain               string                 `json:"domain"`
	Status               string                 `json:"status"`
	AuthoritativeRouting bool                   `json:"authoritative_routing"`
	CloudflareZoneName   string                 `json:"cloudflare_zone_name"`
	ArchivePrefix        string                 `json:"archive_prefix"`
	WorkerConnectionID   string                 `json:"worker_connection_id"`
	WorkerDeploymentID   string                 `json:"worker_domain_deployment_id"`
	FeedbackAddress      string                 `json:"feedback_address"`
	MailFromDomain       string                 `json:"mail_from_domain"`
	Outbound             DomainOutboundPolicy   `json:"outbound"`
	ProviderMetadata     DomainProviderMetadata `json:"provider_metadata"`
	CreatedAt            time.Time              `json:"created_at"`
	UpdatedAt            time.Time              `json:"updated_at"`
}

type RuntimeDomainSyncResult struct {
	Domain  DomainRecord `json:"domain"`
	Changed bool         `json:"changed"`
}

type MemoryStore struct {
	mu    sync.Mutex
	state State
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{state: emptyState()}
}

func (s *MemoryStore) State(ctx context.Context) (State, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return normalizeState(s.state), nil
}

func (s *MemoryStore) Update(ctx context.Context, update func(State) (State, error)) (State, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	next, err := update(normalizeState(s.state))
	if err != nil {
		return State{}, err
	}
	s.state = normalizeState(next)
	return s.state, nil
}

func ActiveDomainRecords(ctx context.Context, store Store, domains []string) ([]DomainRecord, error) {
	state, err := store.State(ctx)
	if err != nil {
		return nil, err
	}
	requested, err := canonicalDomainSelection(domains)
	if err != nil {
		return nil, err
	}
	records := make([]DomainRecord, 0, len(state.Domains))
	for _, record := range state.Domains {
		if record.Status != DomainStatusActive {
			continue
		}
		if len(requested) > 0 {
			if _, ok := requested[record.Domain]; !ok {
				continue
			}
			delete(requested, record.Domain)
		}
		records = append(records, record)
	}
	if len(requested) > 0 {
		missing := make([]string, 0, len(requested))
		for domain := range requested {
			missing = append(missing, domain)
		}
		slices.Sort(missing)
		return nil, fmt.Errorf("active domain not found: %s", strings.Join(missing, ", "))
	}
	sortDomains(records)
	return records, nil
}

func SyncRuntimeDomains(ctx context.Context, store Store, selectedProvider string, params []DomainConfigParams, now time.Time) ([]RuntimeDomainSyncResult, bool, error) {
	records := make([]DomainRecord, 0, len(params))
	seen := make(map[string]struct{}, len(params))
	for _, params := range params {
		record, err := NormalizeDomainConfig(params, selectedProvider, now)
		if err != nil {
			return nil, false, err
		}
		if _, ok := seen[record.Domain]; ok {
			return nil, false, fmt.Errorf("duplicate runtime domain %q", record.Domain)
		}
		seen[record.Domain] = struct{}{}
		records = append(records, record)
	}

	var results []RuntimeDomainSyncResult
	var changed bool
	_, err := store.Update(ctx, func(state State) (State, error) {
		state = normalizeState(state)
		results = make([]RuntimeDomainSyncResult, 0, len(records)+len(state.Domains))
		known := make(map[string]int, len(state.Domains))
		for index, record := range state.Domains {
			known[record.Domain] = index
		}

		for _, record := range records {
			if index, ok := known[record.Domain]; ok {
				existing := state.Domains[index]
				record.CreatedAt = existing.CreatedAt
				domainChanged := !sameDomainDesired(existing, record)
				if domainChanged {
					state.Domains[index] = record
					changed = true
					results = append(results, RuntimeDomainSyncResult{Domain: record, Changed: true})
				} else {
					results = append(results, RuntimeDomainSyncResult{Domain: existing, Changed: false})
				}
			} else {
				state.Domains = append(state.Domains, record)
				known[record.Domain] = len(state.Domains) - 1
				changed = true
				results = append(results, RuntimeDomainSyncResult{Domain: record, Changed: true})
			}
		}

		for index, record := range state.Domains {
			if _, ok := seen[record.Domain]; ok {
				continue
			}
			if record.Status != DomainStatusActive {
				continue
			}
			record.Status = DomainStatusDeactivated
			record.AuthoritativeRouting = false
			record.UpdatedAt = now.UTC()
			state.Domains[index] = record
			changed = true
			results = append(results, RuntimeDomainSyncResult{Domain: record, Changed: true})
		}

		if changed {
			sortDomains(state.Domains)
			state.UpdatedAt = now.UTC()
		}
		return state, nil
	})
	if err != nil {
		return nil, false, err
	}
	return results, changed, nil
}

func NormalizeDomainConfig(params DomainConfigParams, selectedProvider string, now time.Time) (DomainRecord, error) {
	organizationID, err := requiredPlainValue(params.OrganizationID, "organization_id")
	if err != nil {
		return DomainRecord{}, err
	}
	organizationPublicID, err := r2archive.CanonicalPathSegment(params.OrganizationPublicID, "organization_public_id")
	if err != nil {
		return DomainRecord{}, err
	}
	domain, err := requiredDomain(params.Domain, "domain")
	if err != nil {
		return DomainRecord{}, err
	}
	cloudflareZone, err := requiredDomain(params.CloudflareZoneName, "cloudflare_zone_name")
	if err != nil {
		return DomainRecord{}, err
	}
	archivePrefix, err := normalizeArchivePrefix(params.ArchivePrefix, organizationPublicID, domain)
	if err != nil {
		return DomainRecord{}, err
	}
	workerConnectionID, err := requiredPlainValue(params.WorkerConnectionID, "worker_connection_id")
	if err != nil {
		return DomainRecord{}, err
	}
	workerDeploymentID, err := requiredPlainValue(params.WorkerDeploymentID, "worker_domain_deployment_id")
	if err != nil {
		return DomainRecord{}, err
	}
	mailFromDomain, err := normalizeMailFromDomain(params.MailFromDomain, domain, "mail_from_domain")
	if err != nil {
		return DomainRecord{}, err
	}
	provider, err := normalizeSelectedProvider(selectedProvider)
	if err != nil {
		return DomainRecord{}, err
	}
	feedbackAddress, err := feedbackAddressForDomain(domain)
	if err != nil {
		return DomainRecord{}, err
	}
	providerMetadata := DomainProviderMetadata{}
	switch provider {
	case ProviderCloudflare:
		providerMetadata.Cloudflare = CloudflareProviderMetadata{
			SendingDomain: domain,
		}
	case ProviderSES:
		providerMetadata.SES = SESProviderMetadata{
			IdentityDomain:     domain,
			MailFromDomain:     mailFromDomain,
			FeedbackReturnPath: feedbackAddress,
		}
	default:
		return DomainRecord{}, fmt.Errorf("unsupported selected provider %q", provider)
	}
	status := DomainStatusDeactivated
	if params.Enabled {
		status = DomainStatusActive
	}
	timestamp := now.UTC()
	return DomainRecord{
		OrganizationID:       organizationID,
		OrganizationPublicID: organizationPublicID,
		Domain:               domain,
		Status:               status,
		AuthoritativeRouting: params.Enabled,
		CloudflareZoneName:   cloudflareZone,
		ArchivePrefix:        archivePrefix,
		WorkerConnectionID:   workerConnectionID,
		WorkerDeploymentID:   workerDeploymentID,
		FeedbackAddress:      feedbackAddress,
		MailFromDomain:       mailFromDomain,
		Outbound: DomainOutboundPolicy{
			Provider:     provider,
			SenderDomain: domain,
		},
		ProviderMetadata: providerMetadata,
		CreatedAt:        timestamp,
		UpdatedAt:        timestamp,
	}, nil
}

func normalizeState(state State) State {
	if state.Schema == "" {
		state.Schema = Schema
	}
	sortDomains(state.Domains)
	return state
}

func emptyState() State {
	return State{
		Schema:  Schema,
		Domains: []DomainRecord{},
	}
}

func domainIndex(records []DomainRecord, domain string) int {
	for index, record := range records {
		if record.Domain == domain {
			return index
		}
	}
	return -1
}

func sortDomains(records []DomainRecord) {
	slices.SortFunc(records, func(left DomainRecord, right DomainRecord) int {
		return strings.Compare(left.Domain, right.Domain)
	})
}

func sameDomainDesired(left DomainRecord, right DomainRecord) bool {
	return left.OrganizationID == right.OrganizationID &&
		left.OrganizationPublicID == right.OrganizationPublicID &&
		left.Domain == right.Domain &&
		left.Status == right.Status &&
		left.AuthoritativeRouting == right.AuthoritativeRouting &&
		left.CloudflareZoneName == right.CloudflareZoneName &&
		left.ArchivePrefix == right.ArchivePrefix &&
		left.WorkerConnectionID == right.WorkerConnectionID &&
		left.WorkerDeploymentID == right.WorkerDeploymentID &&
		left.FeedbackAddress == right.FeedbackAddress &&
		left.MailFromDomain == right.MailFromDomain &&
		left.Outbound == right.Outbound &&
		left.ProviderMetadata == right.ProviderMetadata
}

func canonicalDomainSelection(domains []string) (map[string]struct{}, error) {
	if len(domains) == 0 {
		return nil, nil
	}
	result := make(map[string]struct{}, len(domains))
	for _, value := range domains {
		domain, err := requiredDomain(value, "domains[]")
		if err != nil {
			return nil, err
		}
		result[domain] = struct{}{}
	}
	return result, nil
}

func normalizeProviderMetadata(metadata DomainProviderMetadata, provider string, domain string, feedbackAddress string) (DomainProviderMetadata, error) {
	switch provider {
	case ProviderCloudflare:
		sendingDomain, err := requiredDomain(metadata.Cloudflare.SendingDomain, "provider_metadata.cloudflare.sending_domain")
		if err != nil {
			return DomainProviderMetadata{}, err
		}
		if sendingDomain != domain {
			return DomainProviderMetadata{}, fmt.Errorf("provider_metadata.cloudflare.sending_domain %q must match %q", sendingDomain, domain)
		}
		bounceDomain, err := optionalDomain(metadata.Cloudflare.BounceDomain, "provider_metadata.cloudflare.bounce_domain")
		if err != nil {
			return DomainProviderMetadata{}, err
		}
		return DomainProviderMetadata{
			Cloudflare: CloudflareProviderMetadata{
				SendingDomain: sendingDomain,
				BounceDomain:  bounceDomain,
			},
		}, nil
	case ProviderSES:
		identityDomain, err := requiredDomain(metadata.SES.IdentityDomain, "provider_metadata.ses.identity_domain")
		if err != nil {
			return DomainProviderMetadata{}, err
		}
		if identityDomain != domain {
			return DomainProviderMetadata{}, fmt.Errorf("provider_metadata.ses.identity_domain %q must match %q", identityDomain, domain)
		}
		mailFromDomain, err := normalizeMailFromDomain(metadata.SES.MailFromDomain, domain, "provider_metadata.ses.mail_from_domain")
		if err != nil {
			return DomainProviderMetadata{}, err
		}
		feedbackReturnPath, err := structured.ParseMailbox(metadata.SES.FeedbackReturnPath)
		if err != nil {
			return DomainProviderMetadata{}, fmt.Errorf("provider_metadata.ses.feedback_return_path: %w", err)
		}
		if feedbackReturnPath.Address != feedbackAddress {
			return DomainProviderMetadata{}, fmt.Errorf("provider_metadata.ses.feedback_return_path must match feedback_address %q", feedbackAddress)
		}
		return DomainProviderMetadata{
			SES: SESProviderMetadata{
				IdentityDomain:     identityDomain,
				MailFromDomain:     mailFromDomain,
				FeedbackReturnPath: feedbackReturnPath.Address,
			},
		}, nil
	default:
		return DomainProviderMetadata{}, fmt.Errorf("unsupported provider %q", provider)
	}
}

func normalizeArchivePrefix(value string, organizationPublicID string, domain string) (string, error) {
	if value == "" {
		return "", fmt.Errorf("archive_prefix is required")
	}
	prefix, err := r2archive.ParseInboundArchivePrefix(value)
	if err != nil {
		return "", fmt.Errorf("archive_prefix: %w", err)
	}
	if prefix.OrganizationPublicID != organizationPublicID {
		return "", fmt.Errorf("archive_prefix organization_public_id %q must match %q", prefix.OrganizationPublicID, organizationPublicID)
	}
	if prefix.RecipientDomain != domain {
		return "", fmt.Errorf("archive_prefix domain %q must match %q", prefix.RecipientDomain, domain)
	}
	expected, err := r2archive.OrganizationInboundArchivePrefix(organizationPublicID, domain)
	if err != nil {
		return "", err
	}
	if prefix.ArchivePrefix != expected {
		return "", fmt.Errorf("archive_prefix must be %q", expected)
	}
	return prefix.ArchivePrefix, nil
}

func normalizeSelectedProvider(value string) (string, error) {
	provider := strings.ToLower(value)
	switch provider {
	case ProviderCloudflare, ProviderSES:
		return provider, nil
	default:
		return "", fmt.Errorf("selected provider must be %q or %q", ProviderCloudflare, ProviderSES)
	}
}

func feedbackAddressForDomain(domain string) (string, error) {
	address, err := structured.BuildAddrSpec("bounces", domain)
	if err != nil {
		return "", err
	}
	mailbox, err := structured.ParseMailbox(address)
	if err != nil {
		return "", err
	}
	return mailbox.Address, nil
}

func requiredDomain(value string, field string) (string, error) {
	domain, err := structured.CanonicalDomain(value)
	if err != nil {
		return "", fmt.Errorf("%s: %w", field, err)
	}
	if domain == "" {
		return "", fmt.Errorf("%s is required", field)
	}
	return domain, nil
}

func optionalDomain(value string, field string) (string, error) {
	if value == "" {
		return "", nil
	}
	domain, err := structured.CanonicalDomain(value)
	if err != nil {
		return "", fmt.Errorf("%s: %w", field, err)
	}
	return domain, nil
}

func normalizeMailFromDomain(value string, domain string, field string) (string, error) {
	if value == "" {
		return domain, nil
	}
	mailFromDomain, err := requiredDomain(value, field)
	if err != nil {
		return "", err
	}
	if mailFromDomain != domain && !strings.HasSuffix(mailFromDomain, "."+domain) {
		return "", fmt.Errorf("%s %q must match %q or be a subdomain of %q", field, mailFromDomain, domain, domain)
	}
	return mailFromDomain, nil
}

func requiredPlainValue(value string, field string) (string, error) {
	if value == "" {
		return "", fmt.Errorf("%s is required", field)
	}
	return value, nil
}
