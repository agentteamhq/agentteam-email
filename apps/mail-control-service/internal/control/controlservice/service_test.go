package controlservice

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"agent-mail/internal/archive/r2archive"
	"agent-mail/internal/control/controlapi"
	"agent-mail/internal/control/controlstate"
	"agent-mail/internal/modules/poller"
)

func TestRuntimeSecretsFromEnvRequiresRelayPassword(t *testing.T) {
	t.Setenv("AT_EMAIL_ADMIN_FEEDBACK_MAILBOX_PASSWORD", "feedback-password")

	_, err := runtimeSecretsFromEnv()
	if err == nil {
		t.Fatal("runtimeSecretsFromEnv succeeded without relay password")
	}
	if !strings.Contains(err.Error(), "AT_EMAIL_ADMIN_ZONEMTA_RELAY_PASSWORD") {
		t.Fatalf("error = %q, want missing relay password", err)
	}
}

func TestRuntimeSecretsFromEnvRequiresFeedbackMailboxPassword(t *testing.T) {
	t.Setenv("AT_EMAIL_ADMIN_ZONEMTA_RELAY_PASSWORD", "relay-password")

	_, err := runtimeSecretsFromEnv()
	if err == nil {
		t.Fatal("runtimeSecretsFromEnv succeeded without feedback mailbox password")
	}
	if !strings.Contains(err.Error(), "AT_EMAIL_ADMIN_FEEDBACK_MAILBOX_PASSWORD") {
		t.Fatalf("error = %q, want missing feedback mailbox password", err)
	}
}

func TestCanonicalModuleConfigUsesRuntimeSecrets(t *testing.T) {
	config := canonicalModuleConfig(runtimeSecrets{
		ZoneMTARelayPassword:    "relay-password",
		FeedbackMailboxPassword: "feedback-password",
	}, runtimeDatabases{
		WildDuckMongoURI:      "mongodb://db.example/wildduck?authSource=admin",
		WildDuckMongoDatabase: "wildduck",
		ControlMongoURI:       "mongodb://db.example/agent_mail_control?authSource=admin",
		ControlMongoDatabase:  "agent_mail_control",
	}, testRuntimeEndpoints())

	if config.ProviderRelay.RelayAuth.Password != "relay-password" {
		t.Fatalf("relay password = %q, want provided secret", config.ProviderRelay.RelayAuth.Password)
	}
	if config.FeedbackRouter.IMAP.Password != "feedback-password" {
		t.Fatalf("feedback password = %q, want provided secret", config.FeedbackRouter.IMAP.Password)
	}
}

func TestCanonicalModuleConfigUsesRuntimeDatabases(t *testing.T) {
	config := canonicalModuleConfig(runtimeSecrets{
		ZoneMTARelayPassword:    "relay-password",
		FeedbackMailboxPassword: "feedback-password",
	}, runtimeDatabases{
		WildDuckMongoURI:      "mongodb://db.example/wildduck?authSource=admin",
		WildDuckMongoDatabase: "wildduck",
		ControlMongoURI:       "mongodb://db.example/agent_mail_control?authSource=admin",
		ControlMongoDatabase:  "agent_mail_control",
	}, testRuntimeEndpoints())

	if config.Poller.State.Mongo.URI != "mongodb://db.example/agent_mail_control?authSource=admin" {
		t.Fatalf("control mongo uri = %q, want provided uri", config.Poller.State.Mongo.URI)
	}
	if config.Poller.State.Mongo.Database != "agent_mail_control" {
		t.Fatalf("control mongo database = %q, want derived database", config.Poller.State.Mongo.Database)
	}
	if config.Poller.WildDuck.MongoURI != "mongodb://db.example/wildduck?authSource=admin" {
		t.Fatalf("poller wildduck mongo uri = %q, want provided uri", config.Poller.WildDuck.MongoURI)
	}
	if config.Poller.WildDuck.MongoDatabase != "wildduck" {
		t.Fatalf("poller wildduck mongo database = %q, want derived database", config.Poller.WildDuck.MongoDatabase)
	}
	if config.ProviderRelay.LocalDelivery.MongoURI != "mongodb://db.example/wildduck?authSource=admin" {
		t.Fatalf("relay wildduck mongo uri = %q, want provided uri", config.ProviderRelay.LocalDelivery.MongoURI)
	}
	if config.ProviderRelay.LocalDelivery.MongoDatabase != "wildduck" {
		t.Fatalf("relay wildduck mongo database = %q, want derived database", config.ProviderRelay.LocalDelivery.MongoDatabase)
	}
}

func TestRuntimeEndpointsFromEnvRequiresExplicitWildDuckAPI(t *testing.T) {
	t.Setenv("AT_EMAIL_ADMIN_CONTROL_TO_WEB_API_BASE_URL", "http://atemail-web-server:4321")
	t.Setenv("AT_EMAIL_ADMIN_CONTROL_TO_WEB_API_TOKEN", "control-to-web-token")
	t.Setenv("AT_EMAIL_ADMIN_HARAKA_SMTP_ADDRESS", "haraka:25")
	t.Setenv("AT_EMAIL_ADMIN_ZONEMTA_DSN_ADDRESS", "zonemta-dsn:2526")
	t.Setenv("AT_EMAIL_ADMIN_WILDDUCK_API_BASE_URL", "")
	t.Setenv("AT_EMAIL_ADMIN_WILDDUCK_IMAP_ADDRESS", "wildduck-imap:143")

	_, err := runtimeEndpointsFromEnv()
	if err == nil {
		t.Fatal("runtimeEndpointsFromEnv succeeded without WildDuck API URL")
	}
	if !strings.Contains(err.Error(), "AT_EMAIL_ADMIN_WILDDUCK_API_BASE_URL") {
		t.Fatalf("error = %q, want missing WildDuck API URL", err)
	}
}

func TestCanonicalModuleConfigUsesRuntimeEndpoints(t *testing.T) {
	endpoints := runtimeEndpoints{
		ControlToWebBaseURL: "http://web-service:4321",
		ControlToWebToken:   "control-to-web-token",
		HarakaSMTPAddress:   "haraka-service:25",
		ZoneMTADSNAddress:   "zonemta-dsn-service:2526",
		WildDuckAPIBaseURL:  "http://wildduck-api-service:8080",
		WildDuckIMAPAddress: "wildduck-imap-service:143",
	}
	config := canonicalModuleConfig(runtimeSecrets{
		ZoneMTARelayPassword:    "relay-password",
		FeedbackMailboxPassword: "feedback-password",
	}, runtimeDatabases{
		WildDuckMongoURI:      "mongodb://db.example/wildduck?authSource=admin",
		WildDuckMongoDatabase: "wildduck",
		ControlMongoURI:       "mongodb://db.example/agent_mail_control?authSource=admin",
		ControlMongoDatabase:  "agent_mail_control",
	}, endpoints)

	if config.Poller.Haraka.Address != endpoints.HarakaSMTPAddress {
		t.Fatalf("poller haraka address = %q, want runtime endpoint", config.Poller.Haraka.Address)
	}
	if config.Poller.DSN.SMTPAddress != endpoints.ZoneMTADSNAddress {
		t.Fatalf("poller DSN address = %q, want runtime endpoint", config.Poller.DSN.SMTPAddress)
	}
	if config.Poller.WildDuck.APIBaseURL != endpoints.WildDuckAPIBaseURL {
		t.Fatalf("poller WildDuck API URL = %q, want runtime endpoint", config.Poller.WildDuck.APIBaseURL)
	}
	if config.ProviderRelay.LocalDelivery.SMTPAddress != endpoints.HarakaSMTPAddress {
		t.Fatalf("relay local delivery SMTP = %q, want runtime endpoint", config.ProviderRelay.LocalDelivery.SMTPAddress)
	}
	if config.ProviderRelay.LocalDelivery.APIBaseURL != endpoints.WildDuckAPIBaseURL {
		t.Fatalf("relay WildDuck API URL = %q, want runtime endpoint", config.ProviderRelay.LocalDelivery.APIBaseURL)
	}
	if config.ProviderRelay.WebServer.APIBaseURL != endpoints.ControlToWebBaseURL {
		t.Fatalf("relay web base URL = %q, want runtime endpoint", config.ProviderRelay.WebServer.APIBaseURL)
	}
	if config.ProviderRelay.WebServer.ControlToWebToken != endpoints.ControlToWebToken {
		t.Fatalf("relay control-to-web token = %q, want runtime token", config.ProviderRelay.WebServer.ControlToWebToken)
	}
	if config.FeedbackRouter.WildDuck.APIBaseURL != endpoints.WildDuckAPIBaseURL {
		t.Fatalf("feedback WildDuck API URL = %q, want runtime endpoint", config.FeedbackRouter.WildDuck.APIBaseURL)
	}
	if config.FeedbackRouter.IMAP.Address != endpoints.WildDuckIMAPAddress {
		t.Fatalf("feedback IMAP address = %q, want runtime endpoint", config.FeedbackRouter.IMAP.Address)
	}
	if config.FeedbackRouter.Haraka.Address != endpoints.HarakaSMTPAddress {
		t.Fatalf("feedback Haraka address = %q, want runtime endpoint", config.FeedbackRouter.Haraka.Address)
	}
}

func TestMongoDatabaseFromURI(t *testing.T) {
	tests := []struct {
		name string
		uri  string
		want string
	}{
		{
			name: "standard uri",
			uri:  "mongodb://user:pass@mongo.example:27017/wildduck?authSource=admin&tls=true",
			want: "wildduck",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := mongoDatabaseFromURI(test.uri)
			if err != nil {
				t.Fatalf("mongoDatabaseFromURI returned error: %v", err)
			}
			if got != test.want {
				t.Fatalf("database = %q, want %q", got, test.want)
			}
		})
	}
}

func testRuntimeEndpoints() runtimeEndpoints {
	return runtimeEndpoints{
		ControlToWebBaseURL: "http://atemail-web-server:4321",
		ControlToWebToken:   "control-to-web-token",
		HarakaSMTPAddress:   "haraka:25",
		ZoneMTADSNAddress:   "zonemta-dsn:2526",
		WildDuckAPIBaseURL:  "http://wildduck-api:8080",
		WildDuckIMAPAddress: "wildduck-imap:143",
	}
}

func TestMongoDatabaseFromURIRejectsMissingDatabase(t *testing.T) {
	_, err := mongoDatabaseFromURI("mongodb://user:pass@mongo.example:27017/?authSource=admin")
	if err == nil {
		t.Fatal("mongoDatabaseFromURI succeeded without database path")
	}
	if !strings.Contains(err.Error(), "missing database path") {
		t.Fatalf("error = %q, want missing database path", err)
	}
}

func TestControlStateRuntimeSourceClassifiesOnlyActiveOwnedDomainsAsLocal(t *testing.T) {
	ctx := context.Background()
	store := controlstate.NewMemoryStore()
	params := testControlServiceDomainConfig("Example.com", true)
	params.MailFromDomain = "ei.example.com"
	if _, _, err := controlstate.SyncRuntimeDomains(ctx, store, controlstate.ProviderCloudflare, []controlstate.DomainConfigParams{params}, time.Now().UTC()); err != nil {
		t.Fatalf("seed active domain: %v", err)
	}

	source := controlStateRuntimeSource{store: store}
	local, err := source.LocalRecipientDomain(ctx, "EXAMPLE.com")
	if err != nil {
		t.Fatalf("LocalRecipientDomain returned error for active domain: %v", err)
	}
	if !local {
		t.Fatal("active owned domain should classify as local")
	}

	external, err := source.LocalRecipientDomain(ctx, "gmail.com")
	if err != nil {
		t.Fatalf("missing active domain should classify external without error: %v", err)
	}
	if external {
		t.Fatal("unowned domain should not classify as local")
	}
}

func TestRuntimeSyncPersistsOrganizationArchiveAndWorkerIdentity(t *testing.T) {
	ctx := context.Background()
	store := controlstate.NewMemoryStore()
	api := &controlRuntimeAPI{
		stateStore: store,
	}

	result, err := api.SyncRuntime(ctx, controlapi.RuntimeSyncParams{
		Domains: []controlstate.DomainConfigParams{testControlServiceDomainConfig("Example.com", true)},
	}, time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("SyncRuntime returned error: %v", err)
	}
	if !result.Changed || len(result.Domains) != 1 {
		t.Fatalf("result = %#v, want one changed domain", result)
	}
	state, err := store.State(ctx)
	if err != nil {
		t.Fatalf("State: %v", err)
	}
	record := state.Domains[0]
	if record.OrganizationID != "org-1" || record.OrganizationPublicID != "org_pub_123" {
		t.Fatalf("organization identity = %#v", record)
	}
	if record.ArchivePrefix != "orgs/org_pub_123/domains/example.com/mail/inbound" {
		t.Fatalf("archive prefix = %q", record.ArchivePrefix)
	}
	if record.WorkerConnectionID != "worker-connection-1" || record.WorkerDeploymentID != "worker-deployment-1" {
		t.Fatalf("worker identity = %#v", record)
	}
}

func TestRuntimeSyncDisablesDomainsMissingFromAuthoritativeSnapshot(t *testing.T) {
	ctx := context.Background()
	store := controlstate.NewMemoryStore()
	now := time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)
	if _, _, err := controlstate.SyncRuntimeDomains(ctx, store, controlstate.ProviderCloudflare, []controlstate.DomainConfigParams{
		testControlServiceDomainConfig("example.com", true),
		testControlServiceDomainConfig("stale.example.com", true),
	}, now); err != nil {
		t.Fatalf("seed runtime domains: %v", err)
	}
	api := &controlRuntimeAPI{
		stateStore: store,
	}

	result, err := api.SyncRuntime(ctx, controlapi.RuntimeSyncParams{
		Domains: []controlstate.DomainConfigParams{testControlServiceDomainConfig("example.com", true)},
	}, now.Add(time.Hour))
	if err != nil {
		t.Fatalf("SyncRuntime returned error: %v", err)
	}
	if !result.Changed || len(result.Domains) != 2 {
		t.Fatalf("result = %#v, want changed synced and stale domains", result)
	}
	active, err := controlstate.ActiveDomainRecords(ctx, store, nil)
	if err != nil {
		t.Fatalf("ActiveDomainRecords: %v", err)
	}
	if len(active) != 1 || active[0].Domain != "example.com" {
		t.Fatalf("active domains = %#v, want only example.com", active)
	}
	state, err := store.State(ctx)
	if err != nil {
		t.Fatalf("State: %v", err)
	}
	var stale controlstate.DomainRecord
	for _, record := range state.Domains {
		if record.Domain == "stale.example.com" {
			stale = record
			break
		}
	}
	if stale.Status != controlstate.DomainStatusDeactivated {
		t.Fatalf("stale status = %q, want deactivated", stale.Status)
	}
	if stale.AuthoritativeRouting {
		t.Fatal("stale AuthoritativeRouting = true, want false")
	}
}

func TestRuntimeBootstrapFetchesWebSnapshotWithScopedToken(t *testing.T) {
	ctx := context.Background()
	store := controlstate.NewMemoryStore()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != controlToWebRuntimeSnapshotPath {
			t.Fatalf("path = %q, want %q", r.URL.Path, controlToWebRuntimeSnapshotPath)
		}
		if got := r.Header.Get("X-Agent-Mail-Control-Web-Token"); got != "test-control-to-web-token" {
			t.Fatalf("control-to-web token header = %q", got)
		}
		if err := json.NewEncoder(w).Encode(runtimeSnapshotResponse{
			Domains: []controlstate.DomainConfigParams{testControlServiceDomainConfig("example.com", true)},
		}); err != nil {
			t.Fatalf("encode snapshot: %v", err)
		}
	}))
	defer server.Close()

	snapshot, err := fetchRuntimeProjectionSnapshot(ctx, server.URL, "test-control-to-web-token")
	if err != nil {
		t.Fatalf("fetchRuntimeProjectionSnapshot: %v", err)
	}
	if _, _, err := controlstate.SyncRuntimeDomains(ctx, store, controlstate.ProviderCloudflare, snapshot.Domains, time.Now().UTC()); err != nil {
		t.Fatalf("SyncRuntimeDomains: %v", err)
	}
	active, err := controlstate.ActiveDomainRecords(ctx, store, nil)
	if err != nil {
		t.Fatalf("ActiveDomainRecords: %v", err)
	}
	if len(active) != 1 || active[0].Domain != "example.com" {
		t.Fatalf("active domains = %#v, want bootstrapped example.com", active)
	}
}

func TestRuntimeSyncRejectsMismatchedArchivePrefix(t *testing.T) {
	ctx := context.Background()
	store := controlstate.NewMemoryStore()
	api := &controlRuntimeAPI{
		stateStore: store,
	}
	params := testControlServiceDomainConfig("example.com", true)
	params.ArchivePrefix = "orgs/org_pub_123/domains/example.net/mail/inbound"

	_, err := api.SyncRuntime(ctx, controlapi.RuntimeSyncParams{
		Domains: []controlstate.DomainConfigParams{params},
	}, time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC))
	if err == nil {
		t.Fatal("SyncRuntime succeeded with mismatched archive_prefix")
	}
}

func TestControlRuntimeAPIRejectsIngestMetadataMismatch(t *testing.T) {
	ctx := context.Background()
	store := controlstate.NewMemoryStore()
	if _, _, err := controlstate.SyncRuntimeDomains(ctx, store, controlstate.ProviderSES, []controlstate.DomainConfigParams{testControlServiceDomainConfig("example.com", true)}, time.Now().UTC()); err != nil {
		t.Fatalf("SyncRuntimeDomains: %v", err)
	}
	ingestID, err := r2archive.NewUUIDv7String()
	if err != nil {
		t.Fatalf("NewUUIDv7String: %v", err)
	}
	receivedAt, err := r2archive.UUIDv7Time(ingestID)
	if err != nil {
		t.Fatalf("UUIDv7Time: %v", err)
	}
	bundle, err := r2archive.OrganizationInboundBundleKeys("org_pub_123", "example.com", receivedAt, ingestID)
	if err != nil {
		t.Fatalf("OrganizationInboundBundleKeys: %v", err)
	}
	api := &controlRuntimeAPI{stateStore: store}
	notification := poller.Notification{
		Schema:                   poller.IngestNotificationSchema,
		OrganizationID:           "org-1",
		OrganizationPublicID:     "org_pub_123",
		ArchivePrefix:            bundle.ArchivePrefix,
		WorkerConnectionID:       "other-worker-connection",
		WorkerDomainDeploymentID: "worker-deployment-1",
		IngestID:                 ingestID,
		RecipientDomain:          "example.com",
		RawKey:                   bundle.RawKey,
		EdgeKey:                  bundle.EdgeKey,
		ResultKey:                bundle.ResultKey,
		ReceivedAt:               receivedAt,
		RawSHA256:                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	}

	err = api.validateIngestNotification(ctx, notification)
	if err == nil {
		t.Fatal("validateIngestNotification succeeded with mismatched worker_connection_id")
	}
	if !strings.Contains(err.Error(), "worker_connection_id") {
		t.Fatalf("error = %q, want worker_connection_id context", err)
	}
}

func TestControlRuntimeAPISelectsIngestDomainByWorkerAuthority(t *testing.T) {
	ctx := context.Background()
	store := controlstate.NewMemoryStore()
	now := time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)

	first, err := controlstate.NormalizeDomainConfig(testControlServiceDomainConfig("example.com", true), controlstate.ProviderSES, now)
	if err != nil {
		t.Fatalf("NormalizeDomainConfig first: %v", err)
	}
	secondParams := testControlServiceDomainConfig("example.com", true)
	secondParams.OrganizationID = "org-2"
	secondParams.OrganizationPublicID = "org_pub_456"
	secondParams.ArchivePrefix = "orgs/org_pub_456/domains/example.com/mail/inbound"
	secondParams.WorkerConnectionID = "worker-connection-2"
	secondParams.WorkerDeploymentID = "worker-deployment-2"
	second, err := controlstate.NormalizeDomainConfig(secondParams, controlstate.ProviderSES, now)
	if err != nil {
		t.Fatalf("NormalizeDomainConfig second: %v", err)
	}
	if _, err := store.Update(ctx, func(state controlstate.State) (controlstate.State, error) {
		state.Domains = []controlstate.DomainRecord{first, second}
		state.UpdatedAt = now
		return state, nil
	}); err != nil {
		t.Fatalf("seed duplicate domain records: %v", err)
	}

	ingestID, err := r2archive.NewUUIDv7String()
	if err != nil {
		t.Fatalf("NewUUIDv7String: %v", err)
	}
	receivedAt, err := r2archive.UUIDv7Time(ingestID)
	if err != nil {
		t.Fatalf("UUIDv7Time: %v", err)
	}
	bundle, err := r2archive.OrganizationInboundBundleKeys("org_pub_123", "example.com", receivedAt, ingestID)
	if err != nil {
		t.Fatalf("OrganizationInboundBundleKeys: %v", err)
	}
	api := &controlRuntimeAPI{stateStore: store}
	notification := poller.Notification{
		Schema:                   poller.IngestNotificationSchema,
		OrganizationID:           "org-1",
		OrganizationPublicID:     "org_pub_123",
		ArchivePrefix:            bundle.ArchivePrefix,
		WorkerConnectionID:       "worker-connection-1",
		WorkerDomainDeploymentID: "worker-deployment-1",
		IngestID:                 ingestID,
		RecipientDomain:          "example.com",
		RawKey:                   bundle.RawKey,
		EdgeKey:                  bundle.EdgeKey,
		ResultKey:                bundle.ResultKey,
		ReceivedAt:               receivedAt,
		RawSHA256:                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	}

	if err := api.validateIngestNotification(ctx, notification); err != nil {
		t.Fatalf("validateIngestNotification returned error: %v", err)
	}
}

func TestLoopbackRelayAddressUsesLocalhostForPlainAuth(t *testing.T) {
	tests := []struct {
		name     string
		listen   string
		wantAddr string
		wantHost string
	}{
		{
			name:     "wildcard",
			listen:   ":2587",
			wantAddr: "127.0.0.1:2587",
			wantHost: "localhost",
		},
		{
			name:     "explicit IPv4 loopback",
			listen:   "127.0.0.1:2587",
			wantAddr: "127.0.0.1:2587",
			wantHost: "localhost",
		},
		{
			name:     "service hostname",
			listen:   "mail-control:2587",
			wantAddr: "mail-control:2587",
			wantHost: "mail-control",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			addr, host, err := loopbackRelayAddress(test.listen)
			if err != nil {
				t.Fatalf("loopbackRelayAddress returned error: %v", err)
			}
			if addr != test.wantAddr || host != test.wantHost {
				t.Fatalf("addr, host = %q, %q; want %q, %q", addr, host, test.wantAddr, test.wantHost)
			}
		})
	}
}

func testControlServiceDomainConfig(domain string, enabled bool) controlstate.DomainConfigParams {
	canonical := strings.ToLower(domain)
	return controlstate.DomainConfigParams{
		OrganizationID:       "org-1",
		OrganizationPublicID: "org_pub_123",
		Domain:               domain,
		Enabled:              enabled,
		CloudflareZoneName:   canonical,
		ArchivePrefix:        "orgs/org_pub_123/domains/" + canonical + "/mail/inbound",
		WorkerConnectionID:   "worker-connection-1",
		WorkerDeploymentID:   "worker-deployment-1",
	}
}
