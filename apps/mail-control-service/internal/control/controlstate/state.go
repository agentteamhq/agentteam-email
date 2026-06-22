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

type StoreMetadata struct {
	Backend         string   `json:"backend"`
	Namespace       string   `json:"namespace,omitempty"`
	ConfigMap       string   `json:"configmap,omitempty"`
	Key             string   `json:"key,omitempty"`
	ResourceVersion string   `json:"resource_version,omitempty"`
	Exists          bool     `json:"exists"`
	Configured      bool     `json:"configured"`
	Issues          []string `json:"issues,omitempty"`
}

type metadataProvider interface {
	Metadata(ctx context.Context) (StoreMetadata, error)
}

type State struct {
	Schema    string         `json:"schema"`
	UpdatedAt time.Time      `json:"updated_at"`
	Domains   []DomainRecord `json:"domains"`
}

type ControllerRef struct {
	Namespace  string `json:"namespace,omitempty"`
	Name       string `json:"name,omitempty"`
	UID        string `json:"uid,omitempty"`
	Generation int64  `json:"generation,omitempty"`
}

type DomainApplyParams struct {
	CompanyIdentity      string                 `json:"company_identity"`
	OrganizationID       string                 `json:"organization_id"`
	OrganizationPublicID string                 `json:"organization_public_id"`
	Controller           ControllerRef          `json:"controller"`
	Domain               string                 `json:"domain"`
	DesiredHash          string                 `json:"desired_hash"`
	AuthoritativeRouting bool                   `json:"authoritative_routing"`
	CloudflareZoneName   string                 `json:"cloudflare_zone_name"`
	ArchivePrefix        string                 `json:"archive_prefix"`
	WorkerConnectionID   string                 `json:"worker_connection_id"`
	WorkerDeploymentID   string                 `json:"worker_domain_deployment_id"`
	FeedbackLocalPart    string                 `json:"feedback_local_part,omitempty"`
	FeedbackAddress      string                 `json:"feedback_address,omitempty"`
	Outbound             DomainOutboundPolicy   `json:"outbound"`
	ProviderMetadata     DomainProviderMetadata `json:"provider_metadata,omitempty"`
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

type DomainRemoveParams struct {
	Domain string `json:"domain"`
}

type DomainDeactivateParams struct {
	CompanyIdentity string `json:"company_identity"`
	Domain          string `json:"domain"`
	DesiredHash     string `json:"desired_hash"`
}

type DomainReprovisionParams struct {
	CompanyIdentity string `json:"company_identity"`
	Domain          string `json:"domain"`
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
	CompanyIdentity      string                 `json:"company_identity"`
	OrganizationID       string                 `json:"organization_id"`
	OrganizationPublicID string                 `json:"organization_public_id"`
	Controller           ControllerRef          `json:"controller"`
	Domain               string                 `json:"domain"`
	DesiredHash          string                 `json:"desired_hash"`
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
	CloudflareProvision  CloudflareProvision    `json:"cloudflare_provision,omitempty"`
	CreatedAt            time.Time              `json:"created_at"`
	UpdatedAt            time.Time              `json:"updated_at"`
	ReprovisionCount     int                    `json:"reprovision_count"`
	LastReprovisionAt    *time.Time             `json:"last_reprovision_at,omitempty"`
}

type CloudflareProvision struct {
	ZoneName              string     `json:"zone_name,omitempty"`
	ZoneID                string     `json:"zone_id,omitempty"`
	CatchAllRuleID        string     `json:"catch_all_rule_id,omitempty"`
	CatchAllEnabled       bool       `json:"catch_all_enabled,omitempty"`
	DeletedRegularRules   int        `json:"deleted_regular_rules,omitempty"`
	LastProvisionStatus   string     `json:"last_provision_status,omitempty"`
	LastProvisionAt       *time.Time `json:"last_provision_at,omitempty"`
	LastProvisionError    string     `json:"last_provision_error,omitempty"`
	LastStatusObservedAt  *time.Time `json:"last_status_observed_at,omitempty"`
	LastStatusOK          bool       `json:"last_status_ok,omitempty"`
	LastStatusIssueCount  int        `json:"last_status_issue_count,omitempty"`
	LastStatusDescription string     `json:"last_status_description,omitempty"`
}

type MemoryStore struct {
	mu    sync.Mutex
	state State
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{state: emptyState()}
}

func (s *MemoryStore) Metadata(ctx context.Context) (StoreMetadata, error) {
	return StoreMetadata{
		Backend:    BackendMemory,
		Exists:     true,
		Configured: true,
	}, nil
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

func AddDomain(ctx context.Context, store Store, selectedProvider string, params DomainConfigParams, now time.Time) (DomainRecord, bool, error) {
	record, err := NormalizeDomainConfig(params, selectedProvider, now)
	if err != nil {
		return DomainRecord{}, false, err
	}
	var added DomainRecord
	_, err = store.Update(ctx, func(state State) (State, error) {
		state = normalizeState(state)
		if index := domainIndex(state.Domains, record.Domain); index >= 0 {
			return State{}, fmt.Errorf("domain %q already exists", record.Domain)
		}
		state.Domains = append(state.Domains, record)
		sortDomains(state.Domains)
		state.UpdatedAt = now.UTC()
		added = record
		return state, nil
	})
	if err != nil {
		return DomainRecord{}, false, err
	}
	return added, true, nil
}

func ModifyDomain(ctx context.Context, store Store, selectedProvider string, params DomainConfigParams, now time.Time) (DomainRecord, bool, error) {
	record, err := NormalizeDomainConfig(params, selectedProvider, now)
	if err != nil {
		return DomainRecord{}, false, err
	}
	var changed bool
	var modified DomainRecord
	_, err = store.Update(ctx, func(state State) (State, error) {
		state = normalizeState(state)
		index := domainIndex(state.Domains, record.Domain)
		if index < 0 {
			return State{}, fmt.Errorf("domain %q is not known", record.Domain)
		}
		existing := state.Domains[index]
		record.CreatedAt = existing.CreatedAt
		record.CloudflareProvision = preservedCloudflareProvision(existing, record)
		record.ReprovisionCount = existing.ReprovisionCount
		record.LastReprovisionAt = existing.LastReprovisionAt
		changed = !sameDomainDesired(existing, record)
		if !changed {
			modified = existing
			return state, nil
		}
		state.Domains[index] = record
		sortDomains(state.Domains)
		state.UpdatedAt = now.UTC()
		modified = record
		return state, nil
	})
	if err != nil {
		return DomainRecord{}, false, err
	}
	return modified, changed, nil
}

func RemoveDomain(ctx context.Context, store Store, params DomainRemoveParams, now time.Time) (DomainRecord, bool, error) {
	domain, err := requiredDomain(params.Domain, "domain")
	if err != nil {
		return DomainRecord{}, false, err
	}
	var changed bool
	var removed DomainRecord
	_, err = store.Update(ctx, func(state State) (State, error) {
		state = normalizeState(state)
		index := domainIndex(state.Domains, domain)
		if index < 0 {
			return State{}, fmt.Errorf("domain %q is not known", domain)
		}
		record := state.Domains[index]
		if record.Status == DomainStatusDeactivated {
			removed = record
			return state, nil
		}
		record.Status = DomainStatusDeactivated
		record.AuthoritativeRouting = false
		record.UpdatedAt = now.UTC()
		state.Domains[index] = record
		sortDomains(state.Domains)
		state.UpdatedAt = now.UTC()
		changed = true
		removed = record
		return state, nil
	})
	if err != nil {
		return DomainRecord{}, false, err
	}
	return removed, changed, nil
}

func ApplyDomain(ctx context.Context, store Store, params DomainApplyParams, now time.Time) (DomainRecord, bool, error) {
	record, err := NormalizeDomainApply(params, now)
	if err != nil {
		return DomainRecord{}, false, err
	}
	var changed bool
	var applied DomainRecord
	_, err = store.Update(ctx, func(state State) (State, error) {
		state = normalizeState(state)
		index := domainIndex(state.Domains, record.Domain)
		if index >= 0 {
			existing := state.Domains[index]
			record.CreatedAt = existing.CreatedAt
			record.ReprovisionCount = existing.ReprovisionCount
			record.LastReprovisionAt = existing.LastReprovisionAt
			changed = !sameDomainDesired(existing, record)
			if !changed {
				applied = existing
				return state, nil
			}
			state.Domains[index] = record
		} else {
			changed = true
			state.Domains = append(state.Domains, record)
		}
		sortDomains(state.Domains)
		state.UpdatedAt = now.UTC()
		applied = record
		return state, nil
	})
	if err != nil {
		return DomainRecord{}, false, err
	}
	return applied, changed, nil
}

func DeactivateDomain(ctx context.Context, store Store, params DomainDeactivateParams, now time.Time) (DomainRecord, bool, error) {
	domain, err := requiredDomain(params.Domain, "domain")
	if err != nil {
		return DomainRecord{}, false, err
	}
	companyIdentity, err := requiredPlainValue(params.CompanyIdentity, "company_identity")
	if err != nil {
		return DomainRecord{}, false, err
	}
	desiredHash, err := requiredPlainValue(params.DesiredHash, "desired_hash")
	if err != nil {
		return DomainRecord{}, false, err
	}
	var changed bool
	var deactivated DomainRecord
	_, err = store.Update(ctx, func(state State) (State, error) {
		state = normalizeState(state)
		index := domainIndex(state.Domains, domain)
		if index < 0 {
			return State{}, fmt.Errorf("active domain %q is not known", domain)
		}
		record := state.Domains[index]
		if record.CompanyIdentity != companyIdentity {
			return State{}, fmt.Errorf("domain %q belongs to company_identity %q", domain, record.CompanyIdentity)
		}
		updated := record
		updated.Status = DomainStatusDeactivated
		updated.DesiredHash = desiredHash
		updated.UpdatedAt = now.UTC()
		changed = !sameDomainDesired(record, updated)
		if !changed {
			deactivated = record
			return state, nil
		}
		state.Domains[index] = updated
		sortDomains(state.Domains)
		state.UpdatedAt = now.UTC()
		deactivated = updated
		return state, nil
	})
	if err != nil {
		return DomainRecord{}, false, err
	}
	return deactivated, changed, nil
}

func ReprovisionDomain(ctx context.Context, store Store, params DomainReprovisionParams, now time.Time) (DomainRecord, error) {
	domain, err := requiredDomain(params.Domain, "domain")
	if err != nil {
		return DomainRecord{}, err
	}
	companyIdentity, err := requiredPlainValue(params.CompanyIdentity, "company_identity")
	if err != nil {
		return DomainRecord{}, err
	}
	var record DomainRecord
	_, err = store.Update(ctx, func(state State) (State, error) {
		state = normalizeState(state)
		index := domainIndex(state.Domains, domain)
		if index < 0 {
			return State{}, fmt.Errorf("active domain %q is not known", domain)
		}
		updated := state.Domains[index]
		if updated.CompanyIdentity != companyIdentity {
			return State{}, fmt.Errorf("domain %q belongs to company_identity %q", domain, updated.CompanyIdentity)
		}
		reprovisionedAt := now.UTC()
		updated.ReprovisionCount++
		updated.LastReprovisionAt = &reprovisionedAt
		updated.UpdatedAt = reprovisionedAt
		state.Domains[index] = updated
		sortDomains(state.Domains)
		state.UpdatedAt = reprovisionedAt
		record = updated
		return state, nil
	})
	if err != nil {
		return DomainRecord{}, err
	}
	return record, nil
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

func RecordCloudflareProvision(ctx context.Context, store Store, domainValue string, provision CloudflareProvision, now time.Time) (DomainRecord, error) {
	domain, err := requiredDomain(domainValue, "domain")
	if err != nil {
		return DomainRecord{}, err
	}
	var updated DomainRecord
	_, err = store.Update(ctx, func(state State) (State, error) {
		state = normalizeState(state)
		index := domainIndex(state.Domains, domain)
		if index < 0 {
			return State{}, fmt.Errorf("active domain %q is not known", domain)
		}
		record := state.Domains[index]
		if record.Status != DomainStatusActive {
			return State{}, fmt.Errorf("domain %q is not active", domain)
		}
		record.CloudflareProvision = provision
		record.UpdatedAt = now.UTC()
		state.Domains[index] = record
		state.UpdatedAt = now.UTC()
		updated = record
		return state, nil
	})
	if err != nil {
		return DomainRecord{}, err
	}
	return updated, nil
}

func NormalizeDomainApply(params DomainApplyParams, now time.Time) (DomainRecord, error) {
	companyIdentity, err := requiredPlainValue(params.CompanyIdentity, "company_identity")
	if err != nil {
		return DomainRecord{}, err
	}
	organizationID, err := requiredPlainValue(params.OrganizationID, "organization_id")
	if err != nil {
		return DomainRecord{}, err
	}
	organizationPublicID, err := r2archive.CanonicalPathSegment(params.OrganizationPublicID, "organization_public_id")
	if err != nil {
		return DomainRecord{}, err
	}
	desiredHash, err := requiredPlainValue(params.DesiredHash, "desired_hash")
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
	feedbackAddress, err := normalizeFeedbackAddress(params.FeedbackAddress, params.FeedbackLocalPart, domain)
	if err != nil {
		return DomainRecord{}, err
	}
	outbound, err := normalizeOutbound(params.Outbound, domain)
	if err != nil {
		return DomainRecord{}, err
	}
	providerMetadata, err := normalizeProviderMetadata(params.ProviderMetadata, outbound.Provider, domain, feedbackAddress)
	if err != nil {
		return DomainRecord{}, err
	}
	createdAt := now.UTC()
	return DomainRecord{
		CompanyIdentity:      companyIdentity,
		OrganizationID:       organizationID,
		OrganizationPublicID: organizationPublicID,
		Controller:           params.Controller,
		Domain:               domain,
		DesiredHash:          desiredHash,
		Status:               DomainStatusActive,
		AuthoritativeRouting: params.AuthoritativeRouting,
		CloudflareZoneName:   cloudflareZone,
		ArchivePrefix:        archivePrefix,
		WorkerConnectionID:   workerConnectionID,
		WorkerDeploymentID:   workerDeploymentID,
		FeedbackAddress:      feedbackAddress,
		MailFromDomain:       providerMetadata.SES.MailFromDomain,
		Outbound:             outbound,
		ProviderMetadata:     providerMetadata,
		CreatedAt:            createdAt,
		UpdatedAt:            createdAt,
	}, nil
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

func Metadata(ctx context.Context, store Store) (StoreMetadata, error) {
	provider, ok := store.(metadataProvider)
	if !ok {
		return StoreMetadata{
			Backend:    "unknown",
			Exists:     true,
			Configured: true,
			Issues:     []string{"control_state_metadata_unavailable"},
		}, nil
	}
	return provider.Metadata(ctx)
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
	return left.CompanyIdentity == right.CompanyIdentity &&
		left.OrganizationID == right.OrganizationID &&
		left.OrganizationPublicID == right.OrganizationPublicID &&
		left.Controller == right.Controller &&
		left.Domain == right.Domain &&
		left.DesiredHash == right.DesiredHash &&
		left.Status == right.Status &&
		left.AuthoritativeRouting == right.AuthoritativeRouting &&
		left.CloudflareZoneName == right.CloudflareZoneName &&
		left.ArchivePrefix == right.ArchivePrefix &&
		left.WorkerConnectionID == right.WorkerConnectionID &&
		left.WorkerDeploymentID == right.WorkerDeploymentID &&
		left.FeedbackAddress == right.FeedbackAddress &&
		left.MailFromDomain == right.MailFromDomain &&
		left.Outbound == right.Outbound &&
		left.ProviderMetadata == right.ProviderMetadata &&
		left.ReprovisionCount == right.ReprovisionCount &&
		sameOptionalTime(left.LastReprovisionAt, right.LastReprovisionAt)
}

func preservedCloudflareProvision(existing DomainRecord, next DomainRecord) CloudflareProvision {
	if existing.CloudflareZoneName != next.CloudflareZoneName {
		return CloudflareProvision{}
	}
	return existing.CloudflareProvision
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

func sameOptionalTime(left *time.Time, right *time.Time) bool {
	if left == nil || right == nil {
		return left == right
	}
	return left.Equal(*right)
}

func normalizeFeedbackAddress(addressValue string, localPart string, domain string) (string, error) {
	if addressValue != "" && localPart != "" {
		return "", fmt.Errorf("set feedback_address or feedback_local_part, not both")
	}
	if addressValue == "" && localPart == "" {
		return "", fmt.Errorf("feedback_address or feedback_local_part is required")
	}
	address := addressValue
	if address == "" {
		built, err := structured.BuildAddrSpec(localPart, domain)
		if err != nil {
			return "", fmt.Errorf("feedback_local_part: %w", err)
		}
		address = built
	}
	mailbox, err := structured.ParseMailbox(address)
	if err != nil {
		return "", fmt.Errorf("feedback_address: %w", err)
	}
	if mailbox.Domain != domain {
		return "", fmt.Errorf("feedback_address domain %q must match %q", mailbox.Domain, domain)
	}
	return mailbox.Address, nil
}

func normalizeOutbound(outbound DomainOutboundPolicy, domain string) (DomainOutboundPolicy, error) {
	provider := strings.ToLower(outbound.Provider)
	switch provider {
	case ProviderCloudflare, ProviderSES:
	default:
		return DomainOutboundPolicy{}, fmt.Errorf("outbound.provider must be %q or %q", ProviderCloudflare, ProviderSES)
	}
	senderDomain, err := requiredDomain(outbound.SenderDomain, "outbound.sender_domain")
	if err != nil {
		return DomainOutboundPolicy{}, err
	}
	if senderDomain != domain {
		return DomainOutboundPolicy{}, fmt.Errorf("outbound.sender_domain %q must match %q", senderDomain, domain)
	}
	return DomainOutboundPolicy{
		Provider:     provider,
		SenderDomain: senderDomain,
	}, nil
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
