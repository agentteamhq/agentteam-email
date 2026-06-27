package domainregistry

import (
	"fmt"
	"slices"
	"time"

	"agent-mail/internal/mail/structured"
	"agent-mail/internal/modules/poller"
	"agent-mail/internal/modules/smtprelay"
)

type ProjectedStatusConfig struct {
	PollerConfig        poller.Config
	ProviderRelayConfig smtprelay.Config
	SelectedProvider    string
}

type Snapshot struct {
	OK               bool               `json:"ok"`
	Status           string             `json:"status"`
	Issues           []string           `json:"issues,omitempty"`
	GeneratedAt      time.Time          `json:"generated_at"`
	SelectedProvider string             `json:"selected_provider"`
	ControlState     ControlStateStatus `json:"control_state"`
	Modules          ModulesStatus      `json:"modules"`
	Dependencies     DependenciesStatus `json:"dependencies"`
	Domains          []DomainStatus     `json:"domains"`
	SourceFiles      SourceFiles        `json:"source_files"`
}

type SourceFiles struct {
	PollerConfig        string `json:"poller_config"`
	ProviderRelayConfig string `json:"provider_relay_config"`
}

type ControlStateStatus struct {
	Schema          string     `json:"schema"`
	UpdatedAt       *time.Time `json:"updated_at,omitempty"`
	DomainsTotal    int        `json:"domains_total"`
	DomainsActive   int        `json:"domains_active"`
	DomainsDisabled int        `json:"domains_disabled"`
	OK              bool       `json:"ok"`
	Issues          []string   `json:"issues,omitempty"`
}

type ModulesStatus struct {
	AdminAPI       ModuleStatus `json:"admin_api"`
	SMTPRelay      ModuleStatus `json:"smtp_relay"`
	Poller         ModuleStatus `json:"poller"`
	FeedbackRouter ModuleStatus `json:"feedback_router"`
}

type ModuleStatus struct {
	OK              bool        `json:"ok"`
	Configured      bool        `json:"configured"`
	Issues          []string    `json:"issues,omitempty"`
	ListenAddress   string      `json:"listen_address,omitempty"`
	PublicURL       string      `json:"public_url,omitempty"`
	Endpoint        string      `json:"endpoint,omitempty"`
	Mailbox         string      `json:"mailbox,omitempty"`
	SweepInterval   string      `json:"sweep_interval,omitempty"`
	RetryDelay      string      `json:"retry_delay,omitempty"`
	MaxRetries      int         `json:"max_retries,omitempty"`
	StateMongoURI   string      `json:"state_mongo_uri,omitempty"`
	StateDatabase   string      `json:"state_database,omitempty"`
	DomainsSource   string      `json:"domains_source,omitempty"`
	ActiveDomains   int         `json:"active_domains,omitempty"`
	LastSweepAt     *time.Time  `json:"last_sweep_at,omitempty"`
	Queue           QueueStatus `json:"queue,omitempty"`
	Provider        string      `json:"provider,omitempty"`
	Hostname        string      `json:"hostname,omitempty"`
	MaxMessageBytes int64       `json:"max_message_bytes,omitempty"`
}

type QueueStatus struct {
	Pending   int `json:"pending"`
	Leased    int `json:"leased"`
	RetryWait int `json:"retry_wait"`
	Blocked   int `json:"blocked"`
	Delivered int `json:"delivered"`
	Completed int `json:"completed"`
}

type DependenciesStatus struct {
	R2               DependencyStatus `json:"r2"`
	WildDuckAPI      DependencyStatus `json:"wildduck_api"`
	WildDuckIMAP     DependencyStatus `json:"wildduck_imap"`
	WildDuckMongo    DependencyStatus `json:"wildduck_mongo"`
	HarakaSMTP       DependencyStatus `json:"haraka_smtp"`
	ZoneMTADSN       DependencyStatus `json:"zonemta_dsn"`
	CloudflareAPI    DependencyStatus `json:"cloudflare_api"`
	OutboundProvider DependencyStatus `json:"outbound_provider"`
}

type DependencyStatus struct {
	OK         bool     `json:"ok"`
	Configured bool     `json:"configured"`
	Endpoint   string   `json:"endpoint,omitempty"`
	Provider   string   `json:"provider,omitempty"`
	Bucket     string   `json:"bucket,omitempty"`
	Issues     []string `json:"issues,omitempty"`
}

type DomainStatus struct {
	Domain           string           `json:"domain"`
	Status           string           `json:"status"`
	Issues           []string         `json:"issues,omitempty"`
	Inbound          InboundStatus    `json:"inbound"`
	Outbound         OutboundStatus   `json:"outbound"`
	FeedbackAddress  string           `json:"feedback_address"`
	Feedback         FeedbackStatus   `json:"feedback"`
	ProviderIdentity ProviderIdentity `json:"provider_identity"`
	Cloudflare       CloudflareStatus `json:"cloudflare"`
}

type CloudflareStatus struct {
	OK                 bool         `json:"ok"`
	ZoneName           string       `json:"zone_name,omitempty"`
	ZoneID             string       `json:"zone_id,omitempty"`
	CatchAllRuleID     string       `json:"catch_all_rule_id,omitempty"`
	CatchAllEnabled    bool         `json:"catch_all_enabled,omitempty"`
	CatchAllConfigured bool         `json:"catch_all_configured,omitempty"`
	RegularRules       []RuleStatus `json:"regular_rules,omitempty"`
	Issues             []string     `json:"issues,omitempty"`
}

type RuleStatus struct {
	ID      string `json:"id,omitempty"`
	Name    string `json:"name,omitempty"`
	Enabled bool   `json:"enabled"`
}

type FeedbackStatus struct {
	OK             bool     `json:"ok"`
	Configured     bool     `json:"configured"`
	Address        string   `json:"address"`
	WildDuckExists bool     `json:"wildduck_exists"`
	WildDuckUserID string   `json:"wildduck_user_id,omitempty"`
	Issues         []string `json:"issues,omitempty"`
}

type InboundStatus struct {
	SweepConfigured bool   `json:"sweep_configured"`
	DSNConfigured   bool   `json:"dsn_configured"`
	Provider        string `json:"provider"`
	CloudflareZone  string `json:"cloudflare_zone"`
}

type OutboundStatus struct {
	Configured   bool   `json:"configured"`
	Provider     string `json:"provider"`
	SenderDomain string `json:"sender_domain"`
}

type ProviderIdentity struct {
	Cloudflare CloudflareIdentity `json:"cloudflare"`
	SES        SESIdentity        `json:"ses"`
}

type CloudflareIdentity struct {
	SendingDomain string `json:"sending_domain"`
	BounceDomain  string `json:"bounce_domain"`
}

type SESIdentity struct {
	IdentityDomain     string `json:"identity_domain"`
	MailFromDomain     string `json:"mail_from_domain"`
	FeedbackReturnPath string `json:"feedback_return_path"`
}

type Projector struct {
	cfg ProjectedStatusConfig
}

func NewProjector(cfg ProjectedStatusConfig) (*Projector, error) {
	if cfg.SelectedProvider == "" {
		return nil, fmt.Errorf("missing selected provider")
	}
	return &Projector{cfg: cfg}, nil
}

func (p *Projector) Snapshot(now time.Time) (Snapshot, error) {
	pollerCfg := p.cfg.PollerConfig
	relayCfg := p.cfg.ProviderRelayConfig

	pollerDomains, err := canonicalDomainSet(pollerCfg.Domains)
	if err != nil {
		return Snapshot{}, err
	}
	dsnFeedback, err := feedbackByDomain(pollerCfg)
	if err != nil {
		return Snapshot{}, err
	}
	relayDomains, err := relayDomainStatus(relayCfg, p.cfg.SelectedProvider)
	if err != nil {
		return Snapshot{}, err
	}

	allDomains := make([]string, 0, len(pollerDomains)+len(relayDomains))
	for domain := range pollerDomains {
		allDomains = append(allDomains, domain)
	}
	for domain := range relayDomains {
		if !slices.Contains(allDomains, domain) {
			allDomains = append(allDomains, domain)
		}
	}
	slices.Sort(allDomains)

	domains := make([]DomainStatus, 0, len(allDomains))
	for _, domain := range allDomains {
		status := relayDomains[domain]
		status.Domain = domain
		status.Inbound.SweepConfigured = pollerDomains[domain]
		status.FeedbackAddress = dsnFeedback[domain]
		status.Feedback = FeedbackStatus{
			OK:         status.FeedbackAddress != "",
			Configured: status.FeedbackAddress != "",
			Address:    status.FeedbackAddress,
		}
		status.Inbound.DSNConfigured = status.FeedbackAddress != ""
		status.Issues = domainIssues(status)
		status.Status = "ready"
		if len(status.Issues) > 0 {
			status.Status = "misconfigured"
		}
		domains = append(domains, status)
	}

	return Snapshot{
		OK:               true,
		Status:           "ready",
		GeneratedAt:      now.UTC(),
		SelectedProvider: p.cfg.SelectedProvider,
		Dependencies: DependenciesStatus{
			WildDuckAPI:   dependencyFromEndpoint(pollerCfg.WildDuck.APIBaseURL),
			WildDuckMongo: dependencyFromEndpoint(pollerCfg.WildDuck.MongoURI),
			HarakaSMTP:    dependencyFromEndpoint(pollerCfg.Haraka.Address),
			ZoneMTADSN:    dependencyFromEndpoint(pollerCfg.DSN.SMTPAddress),
			OutboundProvider: DependencyStatus{
				OK:         p.cfg.SelectedProvider != "",
				Configured: p.cfg.SelectedProvider != "",
				Provider:   p.cfg.SelectedProvider,
			},
		},
		Domains: domains,
	}, nil
}

func canonicalDomainSet(values []string) (map[string]bool, error) {
	result := make(map[string]bool, len(values))
	for _, value := range values {
		domain, err := requiredDomain(value, "poller domain")
		if err != nil {
			return nil, err
		}
		result[domain] = true
	}
	return result, nil
}

func feedbackByDomain(cfg poller.Config) (map[string]string, error) {
	result := make(map[string]string, len(cfg.DSN.Domains))
	for _, item := range cfg.DSN.Domains {
		domain, err := requiredDomain(item.Name, "dsn domain")
		if err != nil {
			return nil, err
		}
		mailbox, err := structured.ParseMailbox(item.FeedbackAddress)
		if err != nil {
			return nil, err
		}
		result[domain] = mailbox.Address
	}
	return result, nil
}

func relayDomainStatus(cfg smtprelay.Config, selectedProvider string) (map[string]DomainStatus, error) {
	result := make(map[string]DomainStatus, len(cfg.Delivery.Domains))
	for _, item := range cfg.Delivery.Domains {
		domain, err := requiredDomain(item.Name, "delivery domain")
		if err != nil {
			return nil, err
		}
		senderDomain, err := structured.CanonicalDomain(item.Outbound.SenderDomain)
		if err != nil {
			return nil, err
		}
		result[domain] = DomainStatus{
			Inbound: InboundStatus{
				Provider:       item.Inbound.Provider,
				CloudflareZone: item.Inbound.CloudflareZoneName,
			},
			Outbound: OutboundStatus{
				Configured:   true,
				Provider:     selectedProvider,
				SenderDomain: senderDomain,
			},
			ProviderIdentity: ProviderIdentity{
				Cloudflare: CloudflareIdentity{
					SendingDomain: item.Outbound.Cloudflare.SendingDomain,
					BounceDomain:  item.Outbound.Cloudflare.BounceDomain,
				},
				SES: SESIdentity{
					IdentityDomain:     item.Outbound.SES.IdentityDomain,
					MailFromDomain:     item.Outbound.SES.MailFromDomain,
					FeedbackReturnPath: item.Outbound.SES.FeedbackReturnPath,
				},
			},
		}
	}
	return result, nil
}

func domainIssues(status DomainStatus) []string {
	var issues []string
	if !status.Inbound.SweepConfigured {
		issues = append(issues, "poller_domain_missing")
	}
	if !status.Inbound.DSNConfigured {
		issues = append(issues, "dsn_feedback_missing")
	}
	if !status.Feedback.Configured {
		issues = append(issues, "feedback_address_missing")
	}
	if status.Feedback.Configured && !status.Feedback.OK {
		issues = append(issues, "feedback_address_not_ready")
	}
	if len(status.Cloudflare.Issues) > 0 {
		issues = append(issues, status.Cloudflare.Issues...)
	}
	if !status.Outbound.Configured {
		issues = append(issues, "provider_relay_domain_missing")
	}
	if status.Outbound.Configured && status.Outbound.SenderDomain == "" {
		issues = append(issues, "sender_domain_missing")
	}
	if status.Outbound.SenderDomain != "" && status.Outbound.SenderDomain != status.Domain {
		issues = append(issues, "sender_domain_mismatch")
	}
	return issues
}

func dependencyFromEndpoint(endpoint string) DependencyStatus {
	status := DependencyStatus{
		OK:         endpoint != "",
		Configured: endpoint != "",
		Endpoint:   endpoint,
	}
	if endpoint == "" {
		status.Issues = append(status.Issues, "endpoint_missing")
	}
	return status
}

func (s Snapshot) WithComputedStatus() Snapshot {
	var issues []string
	if !s.ControlState.OK {
		issues = append(issues, "control_state_not_ready")
		issues = append(issues, s.ControlState.Issues...)
	}
	appendModuleIssue := func(name string, status ModuleStatus) {
		if status.OK {
			return
		}
		issues = append(issues, name+"_not_ready")
		issues = append(issues, status.Issues...)
	}
	appendModuleIssue("admin_api", s.Modules.AdminAPI)
	appendModuleIssue("smtp_relay", s.Modules.SMTPRelay)
	appendModuleIssue("poller", s.Modules.Poller)
	appendDependencyIssue := func(name string, status DependencyStatus) {
		if status.OK {
			return
		}
		issues = append(issues, name+"_not_ready")
		issues = append(issues, status.Issues...)
	}
	appendDependencyIssue("r2", s.Dependencies.R2)
	appendDependencyIssue("wildduck_api", s.Dependencies.WildDuckAPI)
	appendDependencyIssue("wildduck_imap", s.Dependencies.WildDuckIMAP)
	appendDependencyIssue("wildduck_mongo", s.Dependencies.WildDuckMongo)
	appendDependencyIssue("haraka_smtp", s.Dependencies.HarakaSMTP)
	appendDependencyIssue("zonemta_dsn", s.Dependencies.ZoneMTADSN)
	appendDependencyIssue("cloudflare_api", s.Dependencies.CloudflareAPI)
	appendDependencyIssue("outbound_provider", s.Dependencies.OutboundProvider)
	if s.ControlState.DomainsActive == 0 {
		issues = append(issues, "no_active_domains")
	}
	for _, domain := range s.Domains {
		if domain.Status != "ready" {
			issues = append(issues, "domain_not_ready:"+domain.Domain)
		}
	}
	s.Issues = dedupeStrings(append(s.Issues, issues...))
	s.OK = len(s.Issues) == 0
	switch {
	case s.OK:
		s.Status = "ready"
	case !s.ControlState.OK || !s.Modules.AdminAPI.OK || !s.Modules.SMTPRelay.OK || !s.Modules.Poller.Configured:
		s.Status = "failed"
	case hasDomainMisconfiguration(s.Domains):
		s.Status = "misconfigured"
	default:
		s.Status = "degraded"
	}
	return s
}

func hasDomainMisconfiguration(domains []DomainStatus) bool {
	for _, domain := range domains {
		if domain.Status == "misconfigured" {
			return true
		}
	}
	return false
}

func dedupeStrings(values []string) []string {
	seen := make(map[string]bool, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		result = append(result, value)
	}
	return result
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
