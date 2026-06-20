package controlservice

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net/url"
	"os"
	"strings"
	"time"

	"agent-mail/internal/config/configfile"
	"agent-mail/internal/control/controlapi"
	"agent-mail/internal/control/controlstate"
	"agent-mail/internal/control/feedbackrouter"
	"agent-mail/internal/control/messageprovenance"
	"agent-mail/internal/mail/structured"
	"agent-mail/internal/modules/poller"
	"agent-mail/internal/modules/smtprelay"
	"agent-mail/internal/provisioning/cloudflareprovisioner"
	"agent-mail/internal/provisioning/mailprovisioner"
	"agent-mail/internal/provisioning/wildduckprovisioner"
	"agent-mail/internal/registry/domainregistry"
)

type Config struct {
	AdminListenAddress string
}

type runtimeSecrets struct {
	ZoneMTARelayPassword    string
	FeedbackMailboxPassword string
}

type runtimeDatabases struct {
	WildDuckMongoURI      string
	WildDuckMongoDatabase string
	ControlMongoURI       string
	ControlMongoDatabase  string
}

type Service struct {
	poller         *poller.Poller
	providerRelay  *smtprelay.Server
	feedbackRouter *feedbackrouter.Router
	adminAPI       *controlapi.Server
}

func Main(ctx context.Context, args []string) error {
	flags := flag.NewFlagSet("agent-mail-control-service", flag.ContinueOnError)
	adminListenAddress := flags.String("admin-listen-address", "", "admin API listen address")
	if err := flags.Parse(args); err != nil {
		return err
	}

	service, err := New(ctx, Config{
		AdminListenAddress: *adminListenAddress,
	})
	if err != nil {
		return err
	}
	defer service.Close(context.Background())

	return service.Run(ctx)
}

func New(ctx context.Context, cfg Config) (*Service, error) {
	if cfg.AdminListenAddress == "" {
		return nil, fmt.Errorf("missing required -admin-listen-address")
	}

	adminAPIToken, err := configfile.RequireEnv("AGENT_MAIL_CONTROL_API_TOKEN")
	if err != nil {
		return nil, err
	}
	wildduckAdminToken, err := configfile.RequireEnv("AGENT_MAIL_WILDDUCK_ADMIN_ACCESS_TOKEN")
	if err != nil {
		return nil, err
	}
	selectedProvider, err := configfile.RequireEnv("AGENT_MAIL_OUTBOUND_PROVIDER")
	if err != nil {
		return nil, err
	}
	secrets, err := runtimeSecretsFromEnv()
	if err != nil {
		return nil, err
	}
	databases, err := runtimeDatabasesFromEnv()
	if err != nil {
		return nil, err
	}
	stateStore, err := controlstate.NewStoreFromEnv()
	if err != nil {
		return nil, err
	}
	runtimeSource := controlStateRuntimeSource{store: stateStore}
	moduleConfig := canonicalModuleConfig(secrets, databases)
	pollerModule, err := poller.NewWithDomainSourceConfig(ctx, moduleConfig.Poller, runtimeSource)
	if err != nil {
		return nil, fmt.Errorf("initialize poller module: %w", err)
	}
	providerRelayModule, err := smtprelay.NewWithSESReturnPathResolverConfig(ctx, moduleConfig.ProviderRelay, runtimeSource)
	if err != nil {
		_ = pollerModule.Close(context.Background())
		return nil, fmt.Errorf("initialize provider-relay module: %w", err)
	}
	feedbackRouterModule, err := feedbackrouter.NewWithRouteSourceConfig(moduleConfig.FeedbackRouter, runtimeSource)
	if err != nil {
		_ = providerRelayModule.Close(context.Background())
		_ = pollerModule.Close(context.Background())
		return nil, fmt.Errorf("initialize feedback-router module: %w", err)
	}
	cloudflareProvisioner, err := cloudflareprovisioner.NewFromEnv(stateStore)
	if err != nil {
		_ = providerRelayModule.Close(context.Background())
		_ = pollerModule.Close(context.Background())
		return nil, fmt.Errorf("initialize Cloudflare provisioner: %w", err)
	}
	wildduckProvisioner, err := wildduckprovisioner.New(wildduckprovisioner.Config{
		APIBaseURL:      moduleConfig.FeedbackRouter.WildDuck.APIBaseURL,
		AdminToken:      wildduckAdminToken,
		PrimaryUsername: moduleConfig.FeedbackRouter.IMAP.Username,
		Password:        moduleConfig.FeedbackRouter.IMAP.Password,
		DisplayName:     moduleConfig.FeedbackRouter.IMAP.DisplayName,
		SpamLevel:       moduleConfig.FeedbackRouter.IMAP.SpamLevel,
	})
	if err != nil {
		_ = providerRelayModule.Close(context.Background())
		_ = pollerModule.Close(context.Background())
		return nil, fmt.Errorf("initialize WildDuck feedback provisioner: %w", err)
	}
	messageProvenance, err := messageprovenance.NewFromRuntimeEnv(ctx, moduleConfig.FeedbackRouter.WildDuck.APIBaseURL)
	if err != nil {
		_ = providerRelayModule.Close(context.Background())
		_ = pollerModule.Close(context.Background())
		return nil, fmt.Errorf("initialize message provenance provider: %w", err)
	}
	domainProvisioner := mailprovisioner.New(
		stateStore,
		mailprovisioner.WithSelectedProvider(selectedProvider),
		mailprovisioner.WithCloudflare(cloudflareProvisioner),
		mailprovisioner.WithWildDuck(wildduckProvisioner),
	)
	fastPathExternalHost, err := configfile.RequireEnv("AGENT_MAIL_CF_TUNNEL_EXTERNAL_URL")
	if err != nil {
		_ = providerRelayModule.Close(context.Background())
		_ = pollerModule.Close(context.Background())
		return nil, err
	}
	fastPathListenURL, err := configfile.RequireEnv("AGENT_MAIL_CF_TUNNEL_LISTEN_URL")
	if err != nil {
		_ = providerRelayModule.Close(context.Background())
		_ = pollerModule.Close(context.Background())
		return nil, err
	}
	statusProjector, err := domainregistry.NewProjector(domainregistry.ProjectedStatusConfig{
		PollerConfig:        moduleConfig.Poller,
		ProviderRelayConfig: moduleConfig.ProviderRelay,
		SelectedProvider:    selectedProvider,
		TunnelExternalHost:  fastPathExternalHost,
		TunnelListenURL:     fastPathListenURL,
		NotifyPath:          poller.NotifyPath,
	})
	if err != nil {
		_ = providerRelayModule.Close(context.Background())
		_ = pollerModule.Close(context.Background())
		return nil, fmt.Errorf("initialize domain registry projector: %w", err)
	}
	statusProvider := &controlStatusProvider{
		domains:          domainProvisioner,
		fallback:         statusProjector,
		selectedProvider: selectedProvider,
		stateStore:       stateStore,
		cloudflare:       cloudflareProvisioner,
		wildduck:         wildduckProvisioner,
		poller:           pollerModule,
		providerRelay:    providerRelayModule,
		feedbackRouter:   feedbackRouterModule,
		adminListen:      cfg.AdminListenAddress,
		feedbackIMAP:     moduleConfig.FeedbackRouter.IMAP.Address,
	}
	adminAPIModule, err := controlapi.New(controlapi.Config{
		ListenAddress: cfg.AdminListenAddress,
		AuthToken:     adminAPIToken,
	}, statusProvider, domainProvisioner, messageProvenance)
	if err != nil {
		_ = providerRelayModule.Close(context.Background())
		_ = pollerModule.Close(context.Background())
		return nil, fmt.Errorf("initialize admin API module: %w", err)
	}

	return &Service{
		poller:         pollerModule,
		providerRelay:  providerRelayModule,
		feedbackRouter: feedbackRouterModule,
		adminAPI:       adminAPIModule,
	}, nil
}

func (s *Service) Close(ctx context.Context) error {
	if s == nil {
		return nil
	}
	var errs []error
	if s.poller != nil {
		errs = append(errs, s.poller.Close(ctx))
	}
	if s.providerRelay != nil {
		errs = append(errs, s.providerRelay.Close(ctx))
	}
	return errors.Join(errs...)
}

func (s *Service) Run(ctx context.Context) error {
	runCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	errCh := make(chan moduleResult, 4)
	go runModule(runCtx, errCh, "poller", s.poller.Run)
	go runModule(runCtx, errCh, "provider-relay", s.providerRelay.Run)
	go runModule(runCtx, errCh, "feedback-router", s.feedbackRouter.Run)
	go runModule(runCtx, errCh, "admin-api", s.adminAPI.Run)

	var resultErr error
	for remaining := 4; remaining > 0; remaining-- {
		result := <-errCh
		if result.err == nil && runCtx.Err() == nil {
			result.err = fmt.Errorf("%s module stopped unexpectedly", result.name)
		}
		if result.err != nil && !errors.Is(result.err, context.Canceled) {
			resultErr = errors.Join(resultErr, fmt.Errorf("%s module failed: %w", result.name, result.err))
			cancel()
		}
	}
	if resultErr != nil {
		return resultErr
	}
	return ctx.Err()
}

type moduleResult struct {
	name string
	err  error
}

type moduleConfig struct {
	Poller         poller.Config
	ProviderRelay  smtprelay.Config
	FeedbackRouter feedbackrouter.Config
}

func runtimeSecretsFromEnv() (runtimeSecrets, error) {
	relayPassword, err := configfile.RequireEnv("AGENT_MAIL_ZONEMTA_RELAY_PASSWORD")
	if err != nil {
		return runtimeSecrets{}, err
	}
	feedbackPassword, err := configfile.RequireEnv("AGENT_MAIL_FEEDBACK_MAILBOX_PASSWORD")
	if err != nil {
		return runtimeSecrets{}, err
	}
	return runtimeSecrets{
		ZoneMTARelayPassword:    relayPassword,
		FeedbackMailboxPassword: feedbackPassword,
	}, nil
}

func runtimeDatabasesFromEnv() (runtimeDatabases, error) {
	wildduckMongoURI, err := configfile.RequireEnv("AGENTTEAM_EMAIL_WILDDUCK_MONGODB_URI")
	if err != nil {
		return runtimeDatabases{}, err
	}
	wildduckMongoDatabase, err := mongoDatabaseFromURI(wildduckMongoURI)
	if err != nil {
		return runtimeDatabases{}, fmt.Errorf("AGENTTEAM_EMAIL_WILDDUCK_MONGODB_URI: %w", err)
	}
	controlMongoURI, err := configfile.RequireEnv("AGENTTEAM_EMAIL_CONTROL_MONGODB_URI")
	if err != nil {
		return runtimeDatabases{}, err
	}
	controlMongoDatabase, err := mongoDatabaseFromURI(controlMongoURI)
	if err != nil {
		return runtimeDatabases{}, fmt.Errorf("AGENTTEAM_EMAIL_CONTROL_MONGODB_URI: %w", err)
	}
	return runtimeDatabases{
		WildDuckMongoURI:      wildduckMongoURI,
		WildDuckMongoDatabase: wildduckMongoDatabase,
		ControlMongoURI:       controlMongoURI,
		ControlMongoDatabase:  controlMongoDatabase,
	}, nil
}

func mongoDatabaseFromURI(value string) (string, error) {
	parsed, err := url.Parse(value)
	if err != nil {
		return "", fmt.Errorf("parse MongoDB URI: %w", err)
	}
	if parsed.Scheme != "mongodb" && parsed.Scheme != "mongodb+srv" {
		return "", fmt.Errorf("unsupported MongoDB URI scheme %q", parsed.Scheme)
	}
	database := strings.Trim(parsed.Path, "/")
	if database == "" {
		return "", fmt.Errorf("missing database path")
	}
	if strings.Contains(database, "/") {
		return "", fmt.Errorf("database path must contain exactly one database name")
	}
	return database, nil
}

func canonicalModuleConfig(secrets runtimeSecrets, databases runtimeDatabases) moduleConfig {
	helloName := "atemail-mail-control-service.agentteam-email.local"

	var pollerCfg poller.Config
	pollerCfg.SweepInterval = "6h"
	pollerCfg.RetryDelay = "1h"
	pollerCfg.MaxRetries = 2
	pollerCfg.ArchiveStartAt = "2026-01-01T00:00:00Z"
	pollerCfg.SweepSafetyLag = "1h"
	pollerCfg.SweepOverlap = "24h"
	pollerCfg.Domains = []string{}
	pollerCfg.State.Mongo.URI = databases.ControlMongoURI
	pollerCfg.State.Mongo.Database = databases.ControlMongoDatabase
	pollerCfg.Haraka.Address = "haraka:10025"
	pollerCfg.Haraka.HelloName = helloName
	pollerCfg.DSN.SMTPAddress = "zonemta:2526"
	pollerCfg.DSN.HelloName = helloName
	pollerCfg.WildDuck.APIBaseURL = "http://wildduck:8080"
	pollerCfg.WildDuck.MongoURI = databases.WildDuckMongoURI
	pollerCfg.WildDuck.MongoDatabase = databases.WildDuckMongoDatabase

	var relayCfg smtprelay.Config
	relayCfg.ListenAddress = ":2587"
	relayCfg.Hostname = helloName
	relayCfg.RelayAuth.Username = "zonemta"
	relayCfg.RelayAuth.Password = secrets.ZoneMTARelayPassword
	relayCfg.Cloudflare.APIBaseURL = "https://api.cloudflare.com/client/v4"
	relayCfg.LocalDelivery.SMTPAddress = "haraka:10025"
	relayCfg.LocalDelivery.HelloName = helloName
	relayCfg.LocalDelivery.APIBaseURL = "http://wildduck:8080"
	relayCfg.LocalDelivery.MongoURI = databases.WildDuckMongoURI
	relayCfg.LocalDelivery.MongoDatabase = databases.WildDuckMongoDatabase
	relayCfg.Delivery.Domains = []smtprelay.DeliveryDomain{}

	var feedbackCfg feedbackrouter.Config
	feedbackCfg.WildDuck.APIBaseURL = "http://wildduck:8080"
	feedbackCfg.IMAP.Address = "wildduck:10143"
	feedbackCfg.IMAP.Username = "bounces@example.com"
	feedbackCfg.IMAP.Password = secrets.FeedbackMailboxPassword
	feedbackCfg.IMAP.DisplayName = "Agent Mail Bounces"
	feedbackCfg.IMAP.SpamLevel = 25
	feedbackCfg.IMAP.Mailbox = "INBOX"
	feedbackCfg.IMAP.Insecure = true
	feedbackCfg.IMAP.IdleTimeout = "29m"
	feedbackCfg.Haraka.Address = "haraka:10025"
	feedbackCfg.Haraka.HelloName = helloName
	feedbackCfg.Routes = []feedbackrouter.RouteConfig{}

	return moduleConfig{
		Poller:         pollerCfg,
		ProviderRelay:  relayCfg,
		FeedbackRouter: feedbackCfg,
	}
}

type controlStatusProvider struct {
	domains          *mailprovisioner.Service
	fallback         *domainregistry.Projector
	selectedProvider string
	stateStore       controlstate.Store
	cloudflare       *cloudflareprovisioner.Service
	wildduck         *wildduckprovisioner.Service
	poller           *poller.Poller
	providerRelay    *smtprelay.Server
	feedbackRouter   *feedbackrouter.Router
	adminListen      string
	feedbackIMAP     string
}

func (p *controlStatusProvider) Snapshot(now time.Time) (domainregistry.Snapshot, error) {
	snapshot, err := p.fallback.Snapshot(now)
	if err != nil {
		return domainregistry.Snapshot{}, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	state, err := p.domains.State(ctx)
	if err != nil {
		return domainregistry.Snapshot{}, err
	}
	snapshot.ControlState = p.controlStateStatus(ctx, state)
	domains := domainregistry.StatusesFromControlState(state.Domains, p.selectedProvider)
	if len(domains) > 0 {
		snapshot.Domains = domains
	}
	active, err := controlstate.ActiveDomainRecords(ctx, p.stateStore, nil)
	if err != nil {
		snapshot.ControlState.OK = false
		snapshot.ControlState.Issues = append(snapshot.ControlState.Issues, "active_domain_load_failed: "+err.Error())
	}
	snapshot.Modules = p.modulesStatus(ctx, snapshot.Tunnel)
	snapshot.Dependencies = p.dependenciesStatus(snapshot.Dependencies)
	snapshot = p.mergeCloudflareStatus(ctx, snapshot)
	snapshot = p.mergeWildDuckStatus(ctx, snapshot, active)
	snapshot.Provisioning = p.provisioningStatus(state.Domains)
	return snapshot.WithComputedStatus(), nil
}

func (p *controlStatusProvider) controlStateStatus(ctx context.Context, state controlstate.State) domainregistry.ControlStateStatus {
	metadata, err := controlstate.Metadata(ctx, p.stateStore)
	status := domainregistry.ControlStateStatus{
		Schema:       state.Schema,
		DomainsTotal: len(state.Domains),
		OK:           true,
	}
	if !state.UpdatedAt.IsZero() {
		updatedAt := state.UpdatedAt.UTC()
		status.UpdatedAt = &updatedAt
	}
	if err != nil {
		status.OK = false
		status.Issues = append(status.Issues, "control_state_metadata_failed: "+err.Error())
		return status
	}
	status.Backend = metadata.Backend
	status.Namespace = metadata.Namespace
	status.ConfigMap = metadata.ConfigMap
	status.Key = metadata.Key
	status.ResourceVersion = metadata.ResourceVersion
	status.Exists = metadata.Exists
	status.Configured = metadata.Configured
	status.Issues = append(status.Issues, metadata.Issues...)
	for _, record := range state.Domains {
		switch record.Status {
		case controlstate.DomainStatusActive:
			status.DomainsActive++
		case controlstate.DomainStatusDeactivated:
			status.DomainsDisabled++
		default:
			status.OK = false
			status.Issues = append(status.Issues, "unknown_domain_status:"+record.Domain)
		}
	}
	if !metadata.Configured {
		status.OK = false
	}
	if state.Schema != controlstate.Schema {
		status.OK = false
		status.Issues = append(status.Issues, "control_state_schema_mismatch")
	}
	return status
}

func (p *controlStatusProvider) modulesStatus(ctx context.Context, tunnel domainregistry.TunnelStatus) domainregistry.ModulesStatus {
	pollerStatus := p.poller.Status(ctx)
	relayStatus := p.providerRelay.Status()
	feedbackStatus := p.feedbackRouter.Status(ctx)
	return domainregistry.ModulesStatus{
		AdminAPI: domainregistry.ModuleStatus{
			OK:            true,
			Configured:    p.adminListen != "",
			ListenAddress: p.adminListen,
		},
		SMTPRelay: domainregistry.ModuleStatus{
			OK:              relayStatus.OK,
			Configured:      relayStatus.Configured,
			Issues:          relayStatus.Issues,
			ListenAddress:   relayStatus.ListenAddress,
			Hostname:        relayStatus.Hostname,
			Provider:        relayStatus.Provider,
			MaxMessageBytes: relayStatus.MaxMessageBytes,
		},
		Poller: domainregistry.ModuleStatus{
			OK:            pollerStatus.OK,
			Configured:    pollerStatus.Configured,
			Issues:        pollerStatus.Issues,
			SweepInterval: pollerStatus.SweepInterval,
			RetryDelay:    pollerStatus.RetryDelay,
			MaxRetries:    pollerStatus.MaxRetries,
			StateMongoURI: pollerStatus.StateMongoURI,
			StateDatabase: pollerStatus.StateDatabase,
			DomainsSource: pollerStatus.DomainsSource,
			ActiveDomains: pollerStatus.ActiveDomains,
			LastSweepAt:   pollerStatus.LastSweepAt,
			Queue: domainregistry.QueueStatus{
				Pending:   pollerStatus.Queue.Pending,
				Leased:    pollerStatus.Queue.Leased,
				RetryWait: pollerStatus.Queue.RetryWait,
				Blocked:   pollerStatus.Queue.Blocked,
				Delivered: pollerStatus.Queue.Delivered,
				Completed: pollerStatus.Queue.Completed,
			},
		},
		FastPathNotify: domainregistry.ModuleStatus{
			OK:            tunnel.OK,
			Configured:    tunnel.Configured,
			Issues:        tunnel.Issues,
			ListenAddress: tunnel.ListenURL,
			PublicURL:     tunnel.PublicNotifyURL,
		},
		FeedbackRouter: domainregistry.ModuleStatus{
			OK:            feedbackStatus.OK,
			Configured:    feedbackStatus.Configured,
			Issues:        feedbackStatus.Issues,
			DomainsSource: feedbackStatus.DomainsSource,
			ActiveDomains: feedbackStatus.ActiveDomains,
			Endpoint:      feedbackStatus.IMAPAddress,
			Mailbox:       feedbackStatus.Mailbox,
		},
	}
}

func (p *controlStatusProvider) dependenciesStatus(existing domainregistry.DependenciesStatus) domainregistry.DependenciesStatus {
	existing.R2 = domainregistry.DependencyStatus{
		OK:         envConfigured("AGENT_MAIL_R2_ENDPOINT", "AGENT_MAIL_R2_BUCKET", "AGENT_MAIL_R2_ACCESS_KEY_ID", "AGENT_MAIL_R2_SECRET_ACCESS_KEY"),
		Configured: envConfigured("AGENT_MAIL_R2_ENDPOINT", "AGENT_MAIL_R2_BUCKET", "AGENT_MAIL_R2_ACCESS_KEY_ID", "AGENT_MAIL_R2_SECRET_ACCESS_KEY"),
		Endpoint:   os.Getenv("AGENT_MAIL_R2_ENDPOINT"),
		Bucket:     os.Getenv("AGENT_MAIL_R2_BUCKET"),
	}
	if !existing.R2.Configured {
		existing.R2.Issues = append(existing.R2.Issues, "r2_config_missing")
	}
	if existing.OutboundProvider.Provider == "" {
		existing.OutboundProvider.Provider = p.selectedProvider
	}
	existing.OutboundProvider.OK = p.selectedProvider == controlstate.ProviderSES || p.selectedProvider == controlstate.ProviderCloudflare
	existing.OutboundProvider.Configured = p.selectedProvider != ""
	if !existing.OutboundProvider.OK {
		existing.OutboundProvider.Issues = append(existing.OutboundProvider.Issues, "unsupported_outbound_provider")
	}
	if existing.WildDuckIMAP.Endpoint != "" {
		existing.WildDuckIMAP.OK = true
		existing.WildDuckIMAP.Configured = true
	} else {
		existing.WildDuckIMAP = domainregistry.DependencyStatus{
			OK:         p.feedbackIMAP != "",
			Configured: p.feedbackIMAP != "",
			Endpoint:   p.feedbackIMAP,
		}
	}
	return existing
}

func (p *controlStatusProvider) mergeCloudflareStatus(ctx context.Context, snapshot domainregistry.Snapshot) domainregistry.Snapshot {
	if p.cloudflare == nil {
		snapshot.Dependencies.CloudflareAPI = domainregistry.DependencyStatus{
			OK:         false,
			Configured: false,
			Issues:     []string{"cloudflare_status_provider_missing"},
		}
		return snapshot
	}
	cfStatus, err := p.cloudflare.Status(ctx, cloudflareprovisioner.CloudflareStatusParams{})
	if err != nil {
		snapshot.Dependencies.CloudflareAPI = domainregistry.DependencyStatus{
			OK:         false,
			Configured: true,
			Issues:     []string{"cloudflare_status_failed: " + err.Error()},
		}
		return snapshot
	}
	snapshot.Dependencies.CloudflareAPI = domainregistry.DependencyStatus{
		OK:         cfStatus.OK,
		Configured: cfStatus.Config.Configured,
		Issues:     cfStatus.Issues,
	}
	for _, cloudflareDomain := range cfStatus.Domains {
		for index := range snapshot.Domains {
			if snapshot.Domains[index].Domain != cloudflareDomain.Domain {
				continue
			}
			snapshot.Domains[index].Cloudflare.OK = cloudflareDomain.OK
			snapshot.Domains[index].Cloudflare.ZoneName = cloudflareDomain.CloudflareZoneName
			snapshot.Domains[index].Cloudflare.ZoneID = cloudflareDomain.ZoneID
			snapshot.Domains[index].Cloudflare.CatchAllConfigured = cloudflareDomain.CatchAllConfigured
			snapshot.Domains[index].Cloudflare.CatchAllEnabled = cloudflareDomain.CatchAllRule.Enabled
			snapshot.Domains[index].Cloudflare.CatchAllRuleID = cloudflareDomain.CatchAllRule.ID
			snapshot.Domains[index].Cloudflare.Issues = cloudflareDomain.Issues
			snapshot.Domains[index].Cloudflare.RegularRules = ruleStatuses(cloudflareDomain.RegularRules)
			snapshot.Domains[index].Cloudflare.LastProvisionStatus = cloudflareDomain.LastProvisionStatus
			snapshot.Domains[index].Cloudflare.LastProvisionAt = cloudflareDomain.LastProvisionAt
			snapshot.Domains[index].Cloudflare.LastProvisionError = cloudflareDomain.LastProvisionError
			if len(cloudflareDomain.Issues) > 0 {
				snapshot.Domains[index].Issues = append(snapshot.Domains[index].Issues, cloudflareDomain.Issues...)
				snapshot.Domains[index].Status = "misconfigured"
			}
			break
		}
	}
	return snapshot
}

func (p *controlStatusProvider) mergeWildDuckStatus(ctx context.Context, snapshot domainregistry.Snapshot, active []controlstate.DomainRecord) domainregistry.Snapshot {
	if p.wildduck == nil {
		snapshot.Dependencies.WildDuckAPI = domainregistry.DependencyStatus{
			OK:         false,
			Configured: false,
			Issues:     []string{"wildduck_status_provider_missing"},
		}
		return snapshot
	}
	wdStatus := p.wildduck.Status(ctx, active)
	snapshot.Dependencies.WildDuckAPI = domainregistry.DependencyStatus{
		OK:         wdStatus.OK,
		Configured: wdStatus.Config.Configured,
		Endpoint:   wdStatus.Config.APIBaseURL,
		Issues:     wdStatus.Issues,
	}
	for _, feedbackDomain := range wdStatus.Domains {
		for index := range snapshot.Domains {
			if snapshot.Domains[index].Domain != feedbackDomain.Domain {
				continue
			}
			snapshot.Domains[index].Feedback.OK = feedbackDomain.OK
			snapshot.Domains[index].Feedback.Configured = feedbackDomain.FeedbackAddress != ""
			snapshot.Domains[index].Feedback.Address = feedbackDomain.FeedbackAddress
			snapshot.Domains[index].Feedback.WildDuckExists = feedbackDomain.Exists
			snapshot.Domains[index].Feedback.WildDuckUserID = feedbackDomain.UserID
			snapshot.Domains[index].Feedback.Issues = feedbackDomain.Issues
			if len(feedbackDomain.Issues) > 0 {
				snapshot.Domains[index].Issues = append(snapshot.Domains[index].Issues, feedbackDomain.Issues...)
				snapshot.Domains[index].Status = "misconfigured"
			}
			break
		}
	}
	return snapshot
}

func ruleStatuses(rules []cloudflareprovisioner.RuleSummary) []domainregistry.RuleStatus {
	statuses := make([]domainregistry.RuleStatus, 0, len(rules))
	for _, rule := range rules {
		statuses = append(statuses, domainregistry.RuleStatus{
			ID:      rule.ID,
			Name:    rule.Name,
			Enabled: rule.Enabled,
		})
	}
	return statuses
}

func (p *controlStatusProvider) provisioningStatus(records []controlstate.DomainRecord) domainregistry.ProvisioningStatus {
	status := domainregistry.ProvisioningStatus{Status: "not_run"}
	for _, record := range records {
		if record.Status != controlstate.DomainStatusActive {
			continue
		}
		switch record.CloudflareProvision.LastProvisionStatus {
		case "applied":
			status.DomainsApplied++
		case "failed":
			status.DomainsFailed++
			status.Issues = append(status.Issues, "domain_failed:"+record.Domain)
		default:
			status.DomainsPending++
			status.Issues = append(status.Issues, "domain_pending:"+record.Domain)
		}
		if record.CloudflareProvision.LastProvisionAt != nil {
			if status.LastApplyAt == nil || record.CloudflareProvision.LastProvisionAt.After(*status.LastApplyAt) {
				last := record.CloudflareProvision.LastProvisionAt.UTC()
				status.LastApplyAt = &last
			}
		}
		if record.CloudflareProvision.LastProvisionError != "" {
			status.LastError = record.CloudflareProvision.LastProvisionError
		}
	}
	switch {
	case status.DomainsFailed > 0:
		status.Status = "failed"
	case status.DomainsPending > 0:
		status.Status = "pending"
	case status.DomainsApplied > 0:
		status.Status = "applied"
	}
	return status
}

func envConfigured(keys ...string) bool {
	for _, key := range keys {
		if os.Getenv(key) == "" {
			return false
		}
	}
	return true
}

func runModule(ctx context.Context, errCh chan<- moduleResult, name string, run func(context.Context) error) {
	log.Printf("agent-mail-control-service event=module_start module=%s", name)
	err := run(ctx)
	if err != nil {
		log.Printf("agent-mail-control-service event=module_stop module=%s error=%q", name, err)
	} else {
		log.Printf("agent-mail-control-service event=module_stop module=%s", name)
	}
	errCh <- moduleResult{name: name, err: err}
}

type controlStateRuntimeSource struct {
	store controlstate.Store
}

func (s controlStateRuntimeSource) ActivePollerDomains(ctx context.Context) ([]poller.Domain, error) {
	records, err := controlstate.ActiveDomainRecords(ctx, s.store, nil)
	if err != nil {
		return nil, err
	}
	domains := make([]poller.Domain, 0, len(records))
	for _, record := range records {
		if record.FeedbackAddress == "" {
			return nil, fmt.Errorf("active domain %q is missing feedback address", record.Domain)
		}
		domains = append(domains, poller.Domain{
			Name:            record.Domain,
			FeedbackAddress: record.FeedbackAddress,
		})
	}
	return domains, nil
}

func (s controlStateRuntimeSource) SESFeedbackReturnPath(ctx context.Context, senderDomainValue string) (string, error) {
	senderDomain, err := structured.CanonicalDomain(senderDomainValue)
	if err != nil {
		return "", fmt.Errorf("sender domain: %w", err)
	}
	if senderDomain == "" {
		return "", fmt.Errorf("sender domain is required")
	}
	records, err := controlstate.ActiveDomainRecords(ctx, s.store, []string{senderDomain})
	if err != nil {
		return "", err
	}
	for _, record := range records {
		returnPath := record.ProviderMetadata.SES.FeedbackReturnPath
		if returnPath == "" {
			return "", fmt.Errorf("active domain %q is missing SES feedback return path", record.Domain)
		}
		return returnPath, nil
	}
	return "", fmt.Errorf("active domain %q is not configured", senderDomain)
}

func (s controlStateRuntimeSource) LocalRecipientDomain(ctx context.Context, recipientDomainValue string) (bool, error) {
	recipientDomain, err := structured.CanonicalDomain(recipientDomainValue)
	if err != nil {
		return false, fmt.Errorf("recipient domain: %w", err)
	}
	if recipientDomain == "" {
		return false, fmt.Errorf("recipient domain is required")
	}
	records, err := controlstate.ActiveDomainRecords(ctx, s.store, nil)
	if err != nil {
		return false, err
	}
	for _, record := range records {
		if record.Domain == recipientDomain {
			return true, nil
		}
	}
	return false, nil
}

func (s controlStateRuntimeSource) ActiveFeedbackRoutes(ctx context.Context) ([]feedbackrouter.Route, error) {
	records, err := controlstate.ActiveDomainRecords(ctx, s.store, nil)
	if err != nil {
		return nil, err
	}
	routes := make([]feedbackrouter.Route, 0, len(records))
	for _, record := range records {
		routes = append(routes, feedbackrouter.Route{
			FeedbackAddress:      record.FeedbackAddress,
			SenderDomains:        []string{record.Domain},
			MarkSeenOnParseError: true,
		})
	}
	return routes, nil
}
