package controlservice

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"mail-control-service/internal/archive/r2archive"
	"mail-control-service/internal/control/controlapi"
	"mail-control-service/internal/control/controlstate"
	"mail-control-service/internal/modules/poller"

	gosasl "github.com/emersion/go-sasl"
	gosmtp "github.com/emersion/go-smtp"
	"github.com/golang-jwt/jwt/v5"
)

func TestRuntimeSecretsFromEnvRequiresRelayPassword(t *testing.T) {
	clearRuntimeSecretEnv(t)
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
	clearRuntimeSecretEnv(t)
	t.Setenv("AT_EMAIL_ADMIN_ZONEMTA_RELAY_PASSWORD", "relay-password")

	_, err := runtimeSecretsFromEnv()
	if err == nil {
		t.Fatal("runtimeSecretsFromEnv succeeded without feedback mailbox password")
	}
	if !strings.Contains(err.Error(), "AT_EMAIL_ADMIN_FEEDBACK_MAILBOX_PASSWORD") {
		t.Fatalf("error = %q, want missing feedback mailbox password", err)
	}
}

func clearRuntimeSecretEnv(t *testing.T) {
	t.Helper()

	t.Setenv("AT_EMAIL_ADMIN_ZONEMTA_RELAY_PASSWORD", "")
	t.Setenv("AT_EMAIL_ADMIN_FEEDBACK_MAILBOX_PASSWORD", "")
}

func TestWorkerArchiveCredentialIssuerSignsScopedR2TemporaryCredentialsLocally(t *testing.T) {
	issuer := &cloudflareWorkerArchiveCredentialIssuer{
		accountID:             "account-id-123",
		bucket:                "agent-mail-archive",
		endpoint:              "https://account-id-123.r2.cloudflarestorage.com",
		endpointAudience:      "account-id-123.r2.cloudflarestorage.com",
		region:                "auto",
		parentAccessKeyID:     "parent-access-key-id",
		parentSecretAccessKey: "parent-secret-access-key",
	}
	now := time.Now().UTC().Add(-time.Minute).Truncate(time.Second)

	result, err := issuer.IssueWorkerArchiveCredentials(context.Background(), controlapi.WorkerArchiveCredentialsParams{
		OrganizationID:           "org-1",
		OrganizationPublicID:     "org_pub_123",
		Domain:                   "example.com",
		ArchivePrefix:            "orgs/org_pub_123/domains/example.com/mail/inbound",
		WorkerConnectionID:       "worker-connection-1",
		WorkerDomainDeploymentID: "worker-deployment-1",
	}, now)
	if err != nil {
		t.Fatalf("IssueWorkerArchiveCredentials returned error: %v", err)
	}

	if result.AccessKeyID != issuer.parentAccessKeyID {
		t.Fatalf("access key id = %q, want parent access key id", result.AccessKeyID)
	}
	if result.Bucket != issuer.bucket || result.Endpoint != issuer.endpoint || result.Region != issuer.region {
		t.Fatalf("R2 target = %#v, want configured bucket/endpoint/region", result)
	}
	if result.ExpiresAt.Unix() != now.Add(workerArchiveCredentialTTL).Unix() {
		t.Fatalf("expires_at = %s, want %s", result.ExpiresAt, now.Add(workerArchiveCredentialTTL))
	}

	decodedSessionToken, err := base64.StdEncoding.DecodeString(result.SessionToken)
	if err != nil {
		t.Fatalf("session token is not base64: %v", err)
	}
	signedJWT := strings.TrimPrefix(string(decodedSessionToken), "jwt/")
	if signedJWT == string(decodedSessionToken) {
		t.Fatalf("session token does not use Cloudflare R2 jwt/ prefix")
	}
	temporarySecret := sha256.Sum256([]byte(signedJWT))
	if result.SecretAccessKey != hex.EncodeToString(temporarySecret[:]) {
		t.Fatalf("secret access key was not derived from signed JWT")
	}

	claims := &r2TemporaryCredentialClaims{}
	token, err := jwt.ParseWithClaims(signedJWT, claims, func(token *jwt.Token) (any, error) {
		if token.Method != jwt.SigningMethodHS256 {
			t.Fatalf("JWT signing method = %s, want HS256", token.Method.Alg())
		}
		return []byte(issuer.parentSecretAccessKey), nil
	}, jwt.WithAudience(issuer.endpointAudience), jwt.WithIssuer(issuer.parentAccessKeyID), jwt.WithSubject(issuer.accountID))
	if err != nil {
		t.Fatalf("parse signed JWT: %v", err)
	}
	if !token.Valid {
		t.Fatal("signed JWT is not valid")
	}
	if claims.Bucket != issuer.bucket || claims.Scope != "object-read-write" {
		t.Fatalf("claims bucket/scope = %q/%q", claims.Bucket, claims.Scope)
	}
	wantPrefix := "orgs/org_pub_123/domains/example.com/mail/inbound/"
	if len(claims.Paths.PrefixPaths) != 1 || claims.Paths.PrefixPaths[0] != wantPrefix {
		t.Fatalf("claims prefix paths = %#v, want %q", claims.Paths.PrefixPaths, wantPrefix)
	}
	if len(claims.Paths.ObjectPaths) != 0 {
		t.Fatalf("claims object paths = %#v, want none", claims.Paths.ObjectPaths)
	}
}

func TestWorkerArchiveCredentialIssuerKeepsR2APITokenConfigRequirement(t *testing.T) {
	t.Setenv("AT_EMAIL_ADMIN_R2_API_TOKEN", "")
	t.Setenv("AT_EMAIL_ADMIN_R2_ACCOUNT_ID", "account-id-123")
	t.Setenv("AT_EMAIL_ADMIN_R2_BUCKET", "agent-mail-archive")
	t.Setenv("AT_EMAIL_ADMIN_R2_ENDPOINT", "https://account-id-123.r2.cloudflarestorage.com")
	t.Setenv("AT_EMAIL_ADMIN_R2_REGION", "auto")
	t.Setenv("AT_EMAIL_ADMIN_R2_ACCESS_KEY_ID", "parent-access-key-id")
	t.Setenv("AT_EMAIL_ADMIN_R2_SECRET_ACCESS_KEY", "parent-secret-access-key")

	_, err := newCloudflareWorkerArchiveCredentialIssuer()
	if err == nil {
		t.Fatal("newCloudflareWorkerArchiveCredentialIssuer succeeded without AT_EMAIL_ADMIN_R2_API_TOKEN")
	}
	if !strings.Contains(err.Error(), "AT_EMAIL_ADMIN_R2_API_TOKEN") {
		t.Fatalf("error = %q, want missing AT_EMAIL_ADMIN_R2_API_TOKEN", err)
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

func TestRuntimeBootstrapRetriesUntilWebSnapshotSucceeds(t *testing.T) {
	ctx := context.Background()
	store := controlstate.NewMemoryStore()
	var mu sync.Mutex
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != controlToWebRuntimeSnapshotPath {
			t.Fatalf("path = %q, want %q", r.URL.Path, controlToWebRuntimeSnapshotPath)
		}
		if got := r.Header.Get("X-Agent-Mail-Control-Web-Token"); got != "test-control-to-web-token" {
			t.Fatalf("control-to-web token header = %q", got)
		}
		mu.Lock()
		requests++
		requestNumber := requests
		mu.Unlock()
		if requestNumber < 3 {
			http.Error(w, "web not ready", http.StatusServiceUnavailable)
			return
		}
		if err := json.NewEncoder(w).Encode(runtimeSnapshotResponse{
			Domains: []controlstate.DomainConfigParams{testControlServiceDomainConfig("example.com", true)},
		}); err != nil {
			t.Fatalf("encode snapshot: %v", err)
		}
	}))
	defer server.Close()

	bootstrapRuntimeProjectionFromWebWithRetryPolicy(ctx, store, controlstate.ProviderCloudflare, runtimeBootstrapConfig{
		BaseURL: server.URL,
		Token:   "test-control-to-web-token",
	}, testRuntimeBootstrapRetryPolicy(false))

	active, err := controlstate.ActiveDomainRecords(ctx, store, nil)
	if err != nil {
		t.Fatalf("ActiveDomainRecords: %v", err)
	}
	if len(active) != 1 || active[0].Domain != "example.com" {
		t.Fatalf("active domains = %#v, want bootstrapped example.com after retry", active)
	}
	mu.Lock()
	defer mu.Unlock()
	if requests != 3 {
		t.Fatalf("requests = %d, want initial request plus two retries", requests)
	}
}

func TestRuntimeBootstrapRetryStopsAfterDeadline(t *testing.T) {
	ctx := context.Background()
	store := controlstate.NewMemoryStore()
	var mu sync.Mutex
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("X-Agent-Mail-Control-Web-Token"); got != "test-control-to-web-token" {
			t.Fatalf("control-to-web token header = %q", got)
		}
		mu.Lock()
		requests++
		mu.Unlock()
		http.Error(w, "web not ready", http.StatusServiceUnavailable)
	}))
	defer server.Close()

	bootstrapRuntimeProjectionFromWebWithRetryPolicy(ctx, store, controlstate.ProviderCloudflare, runtimeBootstrapConfig{
		BaseURL: server.URL,
		Token:   "test-control-to-web-token",
	}, testRuntimeBootstrapRetryPolicy(false))

	active, err := controlstate.ActiveDomainRecords(ctx, store, nil)
	if err != nil {
		t.Fatalf("ActiveDomainRecords: %v", err)
	}
	if len(active) != 0 {
		t.Fatalf("active domains = %#v, want no runtime domains after retry exhaustion", active)
	}
	mu.Lock()
	defer mu.Unlock()
	if requests < 2 {
		t.Fatalf("requests = %d, want initial request and at least one retry", requests)
	}
}

func testRuntimeBootstrapRetryPolicy(background bool) runtimeBootstrapRetryPolicy {
	return runtimeBootstrapRetryPolicy{
		AttemptTimeout: 50 * time.Millisecond,
		RetryInterval:  5 * time.Millisecond,
		RetryWindow:    40 * time.Millisecond,
		Background:     background,
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

func TestControlRuntimeAPISubmitSendParsesStructuredMailboxes(t *testing.T) {
	tests := []struct {
		name     string
		domain   string
		from     string
		to       string
		wantFrom string
		wantTo   string
	}{
		{
			name:     "display name from and recipient",
			domain:   "example.com",
			from:     "Agent <Agent@Example.com>",
			to:       "Recipient <Recipient@Example.net>",
			wantFrom: "agent@example.com",
			wantTo:   "recipient@example.net",
		},
		{
			name:     "commented sender mailbox",
			domain:   "example.com",
			from:     "agent@example.com (Agent)",
			to:       "recipient@example.net",
			wantFrom: "agent@example.com",
			wantTo:   "recipient@example.net",
		},
		{
			name:     "idna sender domain",
			domain:   "xn--exmple-cua.com",
			from:     "Agent <agent@Exämple.com>",
			to:       "recipient@example.net",
			wantFrom: "agent@xn--exmple-cua.com",
			wantTo:   "recipient@example.net",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			relay := newSubmitSendSMTPServer(t)
			defer relay.Close()
			api := testSubmitSendRuntimeAPI(relay)

			result, err := api.SubmitSend(context.Background(), testSendSubmitParams(test.domain, test.from, test.to), time.Now().UTC())
			if err != nil {
				t.Fatalf("SubmitSend returned error: %v", err)
			}
			if result.Status != "submitted" {
				t.Fatalf("Status = %q, want submitted", result.Status)
			}
			deliveries := relay.Deliveries()
			if len(deliveries) != 1 {
				t.Fatalf("deliveries = %#v, want one delivery", deliveries)
			}
			if deliveries[0].MailFrom != test.wantFrom {
				t.Fatalf("MAIL FROM = %q, want %q", deliveries[0].MailFrom, test.wantFrom)
			}
			if len(deliveries[0].RcptTo) != 1 || deliveries[0].RcptTo[0] != test.wantTo {
				t.Fatalf("RCPT TO = %#v, want %q", deliveries[0].RcptTo, test.wantTo)
			}
		})
	}
}

func TestControlRuntimeAPISubmitSendRejectsInvalidStructuredMailboxesBeforeSMTP(t *testing.T) {
	tests := []struct {
		name   string
		domain string
		from   string
		to     string
	}{
		{
			name:   "malformed sender with matching final split domain",
			domain: "attacker.test",
			from:   "local@example.com@attacker.test",
			to:     "recipient@example.net",
		},
		{
			name:   "malformed recipient with multiple at signs",
			domain: "example.com",
			from:   "agent@example.com",
			to:     "recipient@example.net@blocked.test",
		},
		{
			name:   "recipient group list",
			domain: "example.com",
			from:   "agent@example.com",
			to:     "Team: one@example.net, two@example.net;",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			relay := newSubmitSendSMTPServer(t)
			defer relay.Close()
			api := testSubmitSendRuntimeAPI(relay)

			_, err := api.SubmitSend(context.Background(), testSendSubmitParams(test.domain, test.from, test.to), time.Now().UTC())
			if err == nil {
				t.Fatal("SubmitSend succeeded with invalid mailbox input")
			}
			if sessions := relay.SessionCount(); sessions != 0 {
				t.Fatalf("SubmitSend opened %d SMTP sessions before rejecting invalid mailbox input", sessions)
			}
			if deliveries := relay.Deliveries(); len(deliveries) != 0 {
				t.Fatalf("deliveries = %#v, want none", deliveries)
			}
		})
	}
}

func TestControlRuntimeAPISubmitSendRejectsParsedSenderDomainMismatchBeforeSMTP(t *testing.T) {
	relay := newSubmitSendSMTPServer(t)
	defer relay.Close()
	api := testSubmitSendRuntimeAPI(relay)

	_, err := api.SubmitSend(
		context.Background(),
		testSendSubmitParams("example.com", "Agent <agent@blocked.test>", "recipient@example.net"),
		time.Now().UTC(),
	)
	if err == nil {
		t.Fatal("SubmitSend succeeded with a sender outside the authorized domain")
	}
	if sessions := relay.SessionCount(); sessions != 0 {
		t.Fatalf("SubmitSend opened %d SMTP sessions before rejecting sender domain mismatch", sessions)
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

func testSubmitSendRuntimeAPI(relay *submitSendSMTPServer) *controlRuntimeAPI {
	return &controlRuntimeAPI{
		relayAddress:  relay.Addr(),
		relayUsername: relayUsername,
		relayPassword: relayPassword,
	}
}

func testSendSubmitParams(domain string, from string, to string) controlapi.SendSubmitParams {
	return controlapi.SendSubmitParams{
		IdempotencyKey: "send-test-key",
		Domain:         domain,
		From:           from,
		To:             to,
		Raw:            "Subject: Test\r\n\r\nBody",
	}
}

const (
	relayUsername = "relay-user"
	relayPassword = "relay-password"
)

type submitSendSMTPServer struct {
	t        *testing.T
	listener net.Listener
	smtp     *gosmtp.Server
	done     chan struct{}

	mu         sync.Mutex
	sessions   int
	deliveries []submitSendSMTPDelivery
}

type submitSendSMTPDelivery struct {
	MailFrom string
	RcptTo   []string
	Raw      []byte
}

func newSubmitSendSMTPServer(t *testing.T) *submitSendSMTPServer {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen submit send SMTP: %v", err)
	}
	server := &submitSendSMTPServer{
		t:        t,
		listener: listener,
		done:     make(chan struct{}),
	}
	smtpServer := gosmtp.NewServer(submitSendSMTPBackend{server: server})
	smtpServer.AllowInsecureAuth = true
	smtpServer.Domain = "submit-send-smtp.test"
	smtpServer.ReadTimeout = 10 * time.Second
	smtpServer.WriteTimeout = 10 * time.Second
	server.smtp = smtpServer
	go server.serve()
	return server
}

func (s *submitSendSMTPServer) Addr() string {
	return s.listener.Addr().String()
}

func (s *submitSendSMTPServer) Close() {
	_ = s.smtp.Close()
	_ = s.listener.Close()
	select {
	case <-s.done:
	case <-time.After(2 * time.Second):
		s.t.Errorf("submit send SMTP server did not stop")
	}
}

func (s *submitSendSMTPServer) Deliveries() []submitSendSMTPDelivery {
	s.mu.Lock()
	defer s.mu.Unlock()
	deliveries := make([]submitSendSMTPDelivery, len(s.deliveries))
	for i, delivery := range s.deliveries {
		deliveries[i] = submitSendSMTPDelivery{
			MailFrom: delivery.MailFrom,
			RcptTo:   append([]string(nil), delivery.RcptTo...),
			Raw:      append([]byte(nil), delivery.Raw...),
		}
	}
	return deliveries
}

func (s *submitSendSMTPServer) SessionCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.sessions
}

func (s *submitSendSMTPServer) recordSession() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sessions++
}

func (s *submitSendSMTPServer) recordDelivery(mailFrom string, rcptTo []string, raw []byte) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.deliveries = append(s.deliveries, submitSendSMTPDelivery{
		MailFrom: mailFrom,
		RcptTo:   append([]string(nil), rcptTo...),
		Raw:      append([]byte(nil), raw...),
	})
}

func (s *submitSendSMTPServer) serve() {
	defer close(s.done)
	if err := s.smtp.Serve(s.listener); err != nil && !errors.Is(err, gosmtp.ErrServerClosed) {
		s.t.Errorf("submit send SMTP stopped with error: %v", err)
	}
}

type submitSendSMTPBackend struct {
	server *submitSendSMTPServer
}

func (b submitSendSMTPBackend) NewSession(*gosmtp.Conn) (gosmtp.Session, error) {
	b.server.recordSession()
	return &submitSendSMTPSession{server: b.server}, nil
}

type submitSendSMTPSession struct {
	server        *submitSendSMTPServer
	authenticated bool
	mailFrom      string
	rcptTo        []string
}

func (s *submitSendSMTPSession) AuthMechanisms() []string {
	return []string{gosasl.Plain}
}

func (s *submitSendSMTPSession) Auth(mech string) (gosasl.Server, error) {
	if mech != gosasl.Plain {
		return nil, gosmtp.ErrAuthUnsupported
	}
	return gosasl.NewPlainServer(func(identity string, username string, password string) error {
		if username != relayUsername || password != relayPassword {
			return errors.New("invalid relay credentials")
		}
		s.authenticated = true
		return nil
	}), nil
}

func (s *submitSendSMTPSession) Mail(from string, _ *gosmtp.MailOptions) error {
	if !s.authenticated {
		return gosmtp.ErrAuthRequired
	}
	s.mailFrom = from
	return nil
}

func (s *submitSendSMTPSession) Rcpt(to string, _ *gosmtp.RcptOptions) error {
	if !s.authenticated {
		return gosmtp.ErrAuthRequired
	}
	s.rcptTo = append(s.rcptTo, to)
	return nil
}

func (s *submitSendSMTPSession) Data(reader io.Reader) error {
	if !s.authenticated {
		return gosmtp.ErrAuthRequired
	}
	raw, err := io.ReadAll(reader)
	if err != nil {
		return err
	}
	s.server.recordDelivery(s.mailFrom, s.rcptTo, raw)
	return nil
}

func (s *submitSendSMTPSession) Reset() {
	s.mailFrom = ""
	s.rcptTo = nil
}

func (s *submitSendSMTPSession) Logout() error {
	return nil
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
