package controlservice

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/smtp"
	"net/url"
	"os"
	"strings"
	"time"

	"agent-mail/internal/archive/r2archive"
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

type runtimeEndpoints struct {
	HarakaSMTPAddress   string
	ZoneMTADSNAddress   string
	WildDuckAPIBaseURL  string
	WildDuckIMAPAddress string
}

type Service struct {
	poller         *poller.Poller
	providerRelay  *smtprelay.Server
	feedbackRouter *feedbackrouter.Router
	adminAPI       *controlapi.Server
}

type controlRuntimeAPI struct {
	poller        *poller.Poller
	provisioner   *mailprovisioner.Service
	stateStore    controlstate.Store
	relayAddress  string
	relayUsername string
	relayPassword string
}

const workerArchiveCredentialTTL = 7 * 24 * time.Hour

type cloudflareWorkerArchiveCredentialIssuer struct {
	apiBaseURL        string
	accountID         string
	apiToken          string
	bucket            string
	endpoint          string
	region            string
	parentAccessKeyID string
	httpClient        *http.Client
}

func (a *controlRuntimeAPI) EnqueueNotification(ctx context.Context, notification poller.Notification) (r2archive.InboundBundle, error) {
	if err := a.validateIngestNotification(ctx, notification); err != nil {
		return r2archive.InboundBundle{}, err
	}
	return a.poller.EnqueueNotification(ctx, notification)
}

func (a *controlRuntimeAPI) validateIngestNotification(ctx context.Context, notification poller.Notification) error {
	bundle, err := poller.ValidateNotification(notification)
	if err != nil {
		return err
	}
	records, err := controlstate.ActiveDomainRecords(ctx, a.stateStore, []string{bundle.RecipientDomain})
	if err != nil {
		return err
	}
	if len(records) != 1 {
		record, err := selectIngestDomainRecord(bundle.RecipientDomain, records, notification)
		if err != nil {
			return err
		}
		return validateIngestNotificationMatchesRecord(notification, record)
	}
	return validateIngestNotificationMatchesRecord(notification, records[0])
}

func selectIngestDomainRecord(recipientDomain string, records []controlstate.DomainRecord, notification poller.Notification) (controlstate.DomainRecord, error) {
	matches := make([]controlstate.DomainRecord, 0, 1)
	for _, record := range records {
		if notification.OrganizationID != record.OrganizationID {
			continue
		}
		if notification.OrganizationPublicID != record.OrganizationPublicID {
			continue
		}
		if notification.ArchivePrefix != record.ArchivePrefix {
			continue
		}
		if notification.WorkerConnectionID != record.WorkerConnectionID {
			continue
		}
		if notification.WorkerDomainDeploymentID != record.WorkerDeploymentID {
			continue
		}
		matches = append(matches, record)
	}
	switch len(matches) {
	case 1:
		return matches[0], nil
	case 0:
		return controlstate.DomainRecord{}, fmt.Errorf("active domain %q does not match inbound worker authority", recipientDomain)
	default:
		return controlstate.DomainRecord{}, fmt.Errorf("active domain %q inbound worker authority is not unique", recipientDomain)
	}
}

func validateIngestNotificationMatchesRecord(notification poller.Notification, record controlstate.DomainRecord) error {
	if notification.OrganizationID != record.OrganizationID {
		return fmt.Errorf("organization_id does not match active domain")
	}
	if notification.OrganizationPublicID != record.OrganizationPublicID {
		return fmt.Errorf("organization_public_id does not match active domain")
	}
	if notification.ArchivePrefix != record.ArchivePrefix {
		return fmt.Errorf("archive_prefix does not match active domain")
	}
	if notification.WorkerConnectionID != record.WorkerConnectionID {
		return fmt.Errorf("worker_connection_id does not match active domain")
	}
	if notification.WorkerDomainDeploymentID != record.WorkerDeploymentID {
		return fmt.Errorf("worker_domain_deployment_id does not match active domain")
	}
	return nil
}

func newCloudflareWorkerArchiveCredentialIssuer() (*cloudflareWorkerArchiveCredentialIssuer, error) {
	apiToken, err := configfile.RequireEnv("AGENT_MAIL_CLOUDFLARE_API_TOKEN")
	if err != nil {
		return nil, err
	}
	accountID, err := configfile.RequireEnv("AGENT_MAIL_CLOUDFLARE_ACCOUNT_ID")
	if err != nil {
		return nil, err
	}
	bucket, err := configfile.RequireEnv("AGENT_MAIL_R2_BUCKET")
	if err != nil {
		return nil, err
	}
	endpoint, err := configfile.RequireEnv("AGENT_MAIL_R2_ENDPOINT")
	if err != nil {
		return nil, err
	}
	region, err := configfile.RequireEnv("AGENT_MAIL_R2_REGION")
	if err != nil {
		return nil, err
	}
	parentAccessKeyID, err := configfile.RequireEnv("AGENT_MAIL_R2_ACCESS_KEY_ID")
	if err != nil {
		return nil, err
	}
	return &cloudflareWorkerArchiveCredentialIssuer{
		apiBaseURL:        cloudflareAPIBaseURL(),
		accountID:         accountID,
		apiToken:          apiToken,
		bucket:            bucket,
		endpoint:          endpoint,
		region:            region,
		parentAccessKeyID: parentAccessKeyID,
		httpClient:        http.DefaultClient,
	}, nil
}

func cloudflareAPIBaseURL() string {
	apiBaseURL := strings.TrimRight(os.Getenv("AGENT_MAIL_CLOUDFLARE_API_BASE_URL"), "/")
	if apiBaseURL == "" {
		return "https://api.cloudflare.com/client/v4"
	}
	return apiBaseURL
}

func (i *cloudflareWorkerArchiveCredentialIssuer) IssueWorkerArchiveCredentials(ctx context.Context, params controlapi.WorkerArchiveCredentialsParams, now time.Time) (controlapi.WorkerArchiveCredentialsResult, error) {
	if i == nil {
		return controlapi.WorkerArchiveCredentialsResult{}, fmt.Errorf("worker archive credential issuer is not configured")
	}
	archivePrefix, err := r2archive.ParseInboundArchivePrefix(params.ArchivePrefix)
	if err != nil {
		return controlapi.WorkerArchiveCredentialsResult{}, fmt.Errorf("archive_prefix: %w", err)
	}
	if strings.TrimSpace(params.OrganizationID) == "" {
		return controlapi.WorkerArchiveCredentialsResult{}, fmt.Errorf("organization_id is required")
	}
	if archivePrefix.OrganizationPublicID != strings.TrimSpace(params.OrganizationPublicID) {
		return controlapi.WorkerArchiveCredentialsResult{}, fmt.Errorf("organization_public_id does not match archive_prefix")
	}
	domain, err := r2archive.CanonicalDomain(params.Domain)
	if err != nil {
		return controlapi.WorkerArchiveCredentialsResult{}, fmt.Errorf("domain: %w", err)
	}
	if archivePrefix.RecipientDomain != domain {
		return controlapi.WorkerArchiveCredentialsResult{}, fmt.Errorf("domain does not match archive_prefix")
	}
	if strings.TrimSpace(params.WorkerConnectionID) == "" {
		return controlapi.WorkerArchiveCredentialsResult{}, fmt.Errorf("worker_connection_id is required")
	}
	if strings.TrimSpace(params.WorkerDomainDeploymentID) == "" {
		return controlapi.WorkerArchiveCredentialsResult{}, fmt.Errorf("worker_domain_deployment_id is required")
	}

	body := map[string]any{
		"bucket":            i.bucket,
		"parentAccessKeyId": i.parentAccessKeyID,
		"permission":        "object-read-write",
		"prefixes":          []string{archivePrefix.ArchivePrefix + "/"},
		"ttlSeconds":        int(workerArchiveCredentialTTL.Seconds()),
	}
	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return controlapi.WorkerArchiveCredentialsResult{}, fmt.Errorf("marshal Cloudflare temporary credential request: %w", err)
	}
	url := fmt.Sprintf("%s/accounts/%s/r2/temp-access-credentials", i.apiBaseURL, url.PathEscape(i.accountID))
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return controlapi.WorkerArchiveCredentialsResult{}, fmt.Errorf("create Cloudflare temporary credential request: %w", err)
	}
	request.Header.Set("Authorization", "Bearer "+i.apiToken)
	request.Header.Set("Content-Type", "application/json")

	response, err := i.httpClient.Do(request)
	if err != nil {
		return controlapi.WorkerArchiveCredentialsResult{}, fmt.Errorf("call Cloudflare temporary credential API: %w", err)
	}
	defer response.Body.Close()

	var payload struct {
		Success bool `json:"success"`
		Result  struct {
			AccessKeyID     string `json:"accessKeyId"`
			SecretAccessKey string `json:"secretAccessKey"`
			SessionToken    string `json:"sessionToken"`
		} `json:"result"`
		Errors []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return controlapi.WorkerArchiveCredentialsResult{}, fmt.Errorf("decode Cloudflare temporary credential response: %w", err)
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 || !payload.Success {
		return controlapi.WorkerArchiveCredentialsResult{}, fmt.Errorf("Cloudflare temporary credential API failed with HTTP %d", response.StatusCode)
	}
	if payload.Result.AccessKeyID == "" || payload.Result.SecretAccessKey == "" || payload.Result.SessionToken == "" {
		return controlapi.WorkerArchiveCredentialsResult{}, fmt.Errorf("Cloudflare temporary credential response was missing credential material")
	}

	return controlapi.WorkerArchiveCredentialsResult{
		Status:          "issued",
		ArchivePrefix:   archivePrefix.ArchivePrefix,
		Bucket:          i.bucket,
		Endpoint:        i.endpoint,
		Region:          i.region,
		AccessKeyID:     payload.Result.AccessKeyID,
		SecretAccessKey: payload.Result.SecretAccessKey,
		SessionToken:    payload.Result.SessionToken,
		ExpiresAt:       now.UTC().Add(workerArchiveCredentialTTL),
		RotationDate:    now.UTC().Format("2006-01-02"),
	}, nil
}

func (a *controlRuntimeAPI) SubmitSend(ctx context.Context, params controlapi.SendSubmitParams, _ time.Time) (controlapi.SendSubmitResult, error) {
	if a == nil {
		return controlapi.SendSubmitResult{}, fmt.Errorf("send submitter is not configured")
	}
	domain, err := r2archive.CanonicalDomain(params.Domain)
	if err != nil {
		return controlapi.SendSubmitResult{}, fmt.Errorf("domain: %w", err)
	}
	from := strings.ToLower(strings.TrimSpace(params.From))
	to := strings.ToLower(strings.TrimSpace(params.To))
	if from == "" || to == "" {
		return controlapi.SendSubmitResult{}, fmt.Errorf("from and to are required")
	}
	if senderDomain := domainFromMailbox(from); senderDomain != domain {
		return controlapi.SendSubmitResult{}, fmt.Errorf("from domain does not match authorized domain")
	}
	idempotencyKey := strings.TrimSpace(params.IdempotencyKey)
	if idempotencyKey == "" {
		idempotencyKey, err = r2archive.NewUUIDv7String()
		if err != nil {
			return controlapi.SendSubmitResult{}, fmt.Errorf("generate idempotency key: %w", err)
		}
	}
	if strings.ContainsAny(idempotencyKey, "\r\n") || len(idempotencyKey) > 200 {
		return controlapi.SendSubmitResult{}, fmt.Errorf("invalid idempotency key")
	}
	raw, err := stampOutboundQueueID([]byte(params.Raw), idempotencyKey)
	if err != nil {
		return controlapi.SendSubmitResult{}, err
	}
	if err := a.submitSMTP(ctx, from, to, raw); err != nil {
		return controlapi.SendSubmitResult{}, err
	}
	return controlapi.SendSubmitResult{
		Status:         "submitted",
		IdempotencyKey: idempotencyKey,
	}, nil
}

func (a *controlRuntimeAPI) submitSMTP(ctx context.Context, from string, to string, raw []byte) error {
	address, host, err := loopbackRelayAddress(a.relayAddress)
	if err != nil {
		return err
	}
	dialer := net.Dialer{Timeout: 10 * time.Second}
	conn, err := dialer.DialContext(ctx, "tcp", address)
	if err != nil {
		return fmt.Errorf("dial internal provider relay: %w", err)
	}
	client, err := smtp.NewClient(conn, host)
	if err != nil {
		_ = conn.Close()
		return fmt.Errorf("open internal provider relay SMTP client: %w", err)
	}
	defer client.Close()

	if err := client.Hello("agent-mail-control-api.local"); err != nil {
		return fmt.Errorf("provider relay EHLO: %w", err)
	}
	if err := client.Auth(smtp.PlainAuth("", a.relayUsername, a.relayPassword, host)); err != nil {
		return fmt.Errorf("provider relay auth: %w", err)
	}
	if err := client.Mail(from); err != nil {
		return fmt.Errorf("provider relay MAIL FROM: %w", err)
	}
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("provider relay RCPT TO: %w", err)
	}
	writer, err := client.Data()
	if err != nil {
		return fmt.Errorf("provider relay DATA: %w", err)
	}
	if _, err := writer.Write(raw); err != nil {
		_ = writer.Close()
		return fmt.Errorf("write provider relay DATA: %w", err)
	}
	if err := writer.Close(); err != nil {
		return fmt.Errorf("close provider relay DATA: %w", err)
	}
	if err := client.Quit(); err != nil {
		return fmt.Errorf("provider relay QUIT: %w", err)
	}
	return nil
}

func loopbackRelayAddress(listenAddress string) (string, string, error) {
	address := strings.TrimSpace(listenAddress)
	if address == "" {
		return "", "", fmt.Errorf("provider relay listen address is missing")
	}
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return "", "", fmt.Errorf("parse provider relay listen address: %w", err)
	}
	if host == "" || host == "::" || host == "0.0.0.0" || host == "[::]" {
		host = "127.0.0.1"
	}
	authHost := host
	if host == "127.0.0.1" || host == "::1" {
		authHost = "localhost"
	}
	return net.JoinHostPort(host, port), authHost, nil
}

func stampOutboundQueueID(raw []byte, idempotencyKey string) ([]byte, error) {
	if len(raw) == 0 {
		return nil, fmt.Errorf("raw message is required")
	}
	text := string(raw)
	separator := "\r\n\r\n"
	headerEnd := strings.Index(text, separator)
	if headerEnd < 0 {
		separator = "\n\n"
		headerEnd = strings.Index(text, separator)
	}
	if headerEnd < 0 {
		return nil, fmt.Errorf("raw message is missing a header/body separator")
	}
	headers := text[:headerEnd]
	if strings.Contains(strings.ToLower(headers), "x-agent-mail-zonemta-queue-id:") {
		return nil, fmt.Errorf("raw message must not include internal ZoneMTA queue provenance")
	}
	stamped := "X-Agent-Mail-ZoneMTA-Queue-ID: " + idempotencyKey + "\r\n" + text
	return []byte(stamped), nil
}

func domainFromMailbox(mailbox string) string {
	at := strings.LastIndex(mailbox, "@")
	if at < 0 || at == len(mailbox)-1 {
		return ""
	}
	return strings.ToLower(strings.TrimSpace(mailbox[at+1:]))
}

func (a *controlRuntimeAPI) SyncRuntime(ctx context.Context, params controlapi.RuntimeSyncParams, now time.Time) (controlapi.RuntimeSyncResult, error) {
	state, err := a.provisioner.State(ctx)
	if err != nil {
		return controlapi.RuntimeSyncResult{}, err
	}
	known := make(map[string]struct{}, len(state.Domains))
	for _, domain := range state.Domains {
		known[domain.Domain] = struct{}{}
	}

	result := controlapi.RuntimeSyncResult{Domains: make([]mailprovisioner.DomainConfigResult, 0, len(params.Domains))}
	for _, domain := range params.Domains {
		var synced mailprovisioner.DomainConfigResult
		if _, ok := known[strings.ToLower(strings.TrimSpace(domain.Domain))]; ok {
			synced, err = a.provisioner.ModifyDomain(ctx, domain, now)
		} else {
			synced, err = a.provisioner.AddDomain(ctx, domain, now)
		}
		if err != nil {
			return controlapi.RuntimeSyncResult{}, err
		}
		if synced.Changed {
			result.Changed = true
		}
		result.Domains = append(result.Domains, synced)
	}
	return result, nil
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
	endpoints, err := runtimeEndpointsFromEnv()
	if err != nil {
		return nil, err
	}
	stateStore, err := controlstate.NewStoreFromEnv()
	if err != nil {
		return nil, err
	}
	runtimeSource := controlStateRuntimeSource{store: stateStore}
	moduleConfig := canonicalModuleConfig(secrets, databases, endpoints)
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
	fastPathExternalHost := os.Getenv("AGENT_MAIL_CF_TUNNEL_EXTERNAL_URL")
	fastPathListenURL := os.Getenv("AGENT_MAIL_CF_TUNNEL_LISTEN_URL")
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
	runtimeAPI := &controlRuntimeAPI{
		poller:        pollerModule,
		provisioner:   domainProvisioner,
		stateStore:    stateStore,
		relayAddress:  moduleConfig.ProviderRelay.ListenAddress,
		relayUsername: moduleConfig.ProviderRelay.RelayAuth.Username,
		relayPassword: moduleConfig.ProviderRelay.RelayAuth.Password,
	}
	workerArchiveCredentialIssuer, err := newCloudflareWorkerArchiveCredentialIssuer()
	if err != nil {
		_ = providerRelayModule.Close(context.Background())
		_ = pollerModule.Close(context.Background())
		return nil, fmt.Errorf("initialize Worker archive credential issuer: %w", err)
	}
	adminAPIModule, err := controlapi.New(controlapi.Config{
		ListenAddress: cfg.AdminListenAddress,
		AuthToken:     adminAPIToken,
	}, statusProvider, domainProvisioner, messageProvenance,
		controlapi.WithIngestEnqueuer(runtimeAPI),
		controlapi.WithRuntimeSyncer(runtimeAPI),
		controlapi.WithWorkerArchiveCredentialIssuer(workerArchiveCredentialIssuer),
		controlapi.WithSendSubmitter(runtimeAPI),
	)
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

func runtimeEndpointsFromEnv() (runtimeEndpoints, error) {
	harakaSMTPAddress, err := configfile.RequireEnv("AGENT_MAIL_HARAKA_SMTP_ADDRESS")
	if err != nil {
		return runtimeEndpoints{}, err
	}
	zoneMTADSNAddress, err := configfile.RequireEnv("AGENT_MAIL_ZONEMTA_DSN_ADDRESS")
	if err != nil {
		return runtimeEndpoints{}, err
	}
	wildDuckAPIBaseURL, err := configfile.RequireEnv("AGENT_MAIL_WILDDUCK_API_BASE_URL")
	if err != nil {
		return runtimeEndpoints{}, err
	}
	wildDuckIMAPAddress, err := configfile.RequireEnv("AGENT_MAIL_WILDDUCK_IMAP_ADDRESS")
	if err != nil {
		return runtimeEndpoints{}, err
	}
	return runtimeEndpoints{
		HarakaSMTPAddress:   harakaSMTPAddress,
		ZoneMTADSNAddress:   zoneMTADSNAddress,
		WildDuckAPIBaseURL:  wildDuckAPIBaseURL,
		WildDuckIMAPAddress: wildDuckIMAPAddress,
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

func canonicalModuleConfig(secrets runtimeSecrets, databases runtimeDatabases, endpoints runtimeEndpoints) moduleConfig {
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
	pollerCfg.Haraka.Address = endpoints.HarakaSMTPAddress
	pollerCfg.Haraka.HelloName = helloName
	pollerCfg.DSN.SMTPAddress = endpoints.ZoneMTADSNAddress
	pollerCfg.DSN.HelloName = helloName
	pollerCfg.WildDuck.APIBaseURL = endpoints.WildDuckAPIBaseURL
	pollerCfg.WildDuck.MongoURI = databases.WildDuckMongoURI
	pollerCfg.WildDuck.MongoDatabase = databases.WildDuckMongoDatabase

	var relayCfg smtprelay.Config
	relayCfg.ListenAddress = ":2587"
	relayCfg.Hostname = helloName
	relayCfg.RelayAuth.Username = "zonemta"
	relayCfg.RelayAuth.Password = secrets.ZoneMTARelayPassword
	relayCfg.Cloudflare.APIBaseURL = cloudflareAPIBaseURL()
	relayCfg.LocalDelivery.SMTPAddress = endpoints.HarakaSMTPAddress
	relayCfg.LocalDelivery.HelloName = helloName
	relayCfg.LocalDelivery.APIBaseURL = endpoints.WildDuckAPIBaseURL
	relayCfg.LocalDelivery.MongoURI = databases.WildDuckMongoURI
	relayCfg.LocalDelivery.MongoDatabase = databases.WildDuckMongoDatabase
	relayCfg.Delivery.Domains = []smtprelay.DeliveryDomain{}

	var feedbackCfg feedbackrouter.Config
	feedbackCfg.WildDuck.APIBaseURL = endpoints.WildDuckAPIBaseURL
	feedbackCfg.IMAP.Address = endpoints.WildDuckIMAPAddress
	feedbackCfg.IMAP.Username = "bounces@example.com"
	feedbackCfg.IMAP.Password = secrets.FeedbackMailboxPassword
	feedbackCfg.IMAP.DisplayName = "Agent Mail Bounces"
	feedbackCfg.IMAP.SpamLevel = 25
	feedbackCfg.IMAP.Mailbox = "INBOX"
	feedbackCfg.IMAP.Insecure = true
	feedbackCfg.IMAP.IdleTimeout = "29m"
	feedbackCfg.Haraka.Address = endpoints.HarakaSMTPAddress
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
			Name:                     record.Domain,
			OrganizationID:           record.OrganizationID,
			OrganizationPublicID:     record.OrganizationPublicID,
			ArchivePrefix:            record.ArchivePrefix,
			WorkerConnectionID:       record.WorkerConnectionID,
			WorkerDomainDeploymentID: record.WorkerDeploymentID,
			FeedbackAddress:          record.FeedbackAddress,
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
