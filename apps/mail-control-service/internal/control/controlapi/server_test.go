package controlapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"agent-mail/internal/archive/r2archive"
	"agent-mail/internal/control/controlstate"
	"agent-mail/internal/control/messageprovenance"
	"agent-mail/internal/modules/poller"
	"agent-mail/internal/provisioning/cloudflareprovisioner"
	"agent-mail/internal/provisioning/mailprovisioner"
	"agent-mail/internal/provisioning/wildduckprovisioner"
	"agent-mail/internal/registry/domainregistry"
)

type fakeStatusProvider struct {
	snapshot domainregistry.Snapshot
}

func (p fakeStatusProvider) Snapshot(now time.Time) (domainregistry.Snapshot, error) {
	snapshot := p.snapshot
	snapshot.GeneratedAt = now
	return snapshot, nil
}

type fakeMessageSourceFetcher struct {
	source []byte
	err    error
	calls  []messageprovenance.WildDuckIdentity
}

func (f *fakeMessageSourceFetcher) FetchMessageSource(ctx context.Context, userID string, mailboxID string, uid int) ([]byte, error) {
	_ = ctx
	f.calls = append(f.calls, messageprovenance.WildDuckIdentity{UserID: userID, MailboxID: mailboxID, UID: uid})
	if f.err != nil {
		return nil, f.err
	}
	return append([]byte(nil), f.source...), nil
}

type fakeIngestEnqueuer struct {
	calls []poller.Notification
	err   error
}

func (f *fakeIngestEnqueuer) EnqueueNotification(ctx context.Context, notification poller.Notification) (r2archive.InboundBundle, error) {
	_ = ctx
	f.calls = append(f.calls, notification)
	if f.err != nil {
		return r2archive.InboundBundle{}, f.err
	}
	bundle, err := poller.ValidateNotification(notification)
	if err != nil {
		return r2archive.InboundBundle{}, err
	}
	return bundle, nil
}

type fakeWorkerArchiveCredentialIssuer struct {
	calls []WorkerArchiveCredentialsParams
	err   error
}

func (f *fakeWorkerArchiveCredentialIssuer) IssueWorkerArchiveCredentials(ctx context.Context, params WorkerArchiveCredentialsParams, now time.Time) (WorkerArchiveCredentialsResult, error) {
	_ = ctx
	f.calls = append(f.calls, params)
	if f.err != nil {
		return WorkerArchiveCredentialsResult{}, f.err
	}
	return WorkerArchiveCredentialsResult{
		Status:          "issued",
		ArchivePrefix:   params.ArchivePrefix,
		Bucket:          "agent-mail-archive",
		Endpoint:        "https://r2.example.test",
		Region:          "auto",
		AccessKeyID:     "worker-access-key",
		SecretAccessKey: "worker-secret-key",
		SessionToken:    "worker-session-token",
		ExpiresAt:       now.Add(7 * 24 * time.Hour),
		RotationDate:    now.Format("2006-01-02"),
	}, nil
}

func TestStatusRPCRequiresToken(t *testing.T) {
	server := newTestServer(t)
	tests := []struct {
		name string
		body string
	}{
		{
			name: "valid body",
			body: `{"jsonrpc":"2.0","id":"request-1","method":"agentMail.status.get","params":{}}`,
		},
		{
			name: "malformed body",
			body: `{`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/rpc/agentMail.status.get", bytes.NewBufferString(tt.body))
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()

			server.Handler().ServeHTTP(response, request)

			if response.Code != http.StatusUnauthorized {
				t.Fatalf("response.Code = %d, want %d; body=%s", response.Code, http.StatusUnauthorized, response.Body.String())
			}
		})
	}
}

func TestControlAPITokenIsHeaderOnlyAndHealthIsUnauthenticated(t *testing.T) {
	server := newTestServer(t)

	healthRequest := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	healthResponse := httptest.NewRecorder()
	server.Handler().ServeHTTP(healthResponse, healthRequest)
	if healthResponse.Code != http.StatusOK {
		t.Fatalf("health response.Code = %d, want %d", healthResponse.Code, http.StatusOK)
	}
	if strings.Contains(healthResponse.Body.String(), "test-token") {
		t.Fatalf("health response exposed auth token: %s", healthResponse.Body.String())
	}

	tests := []struct {
		name string
		path string
		body string
	}{
		{
			name: "query token",
			path: "/rpc/agentMail.status.get?X-Agent-Mail-Control-Token=test-token",
			body: `{"jsonrpc":"2.0","id":"query-token","method":"agentMail.status.get","params":{}}`,
		},
		{
			name: "body token",
			path: "/rpc/agentMail.status.get",
			body: `{"jsonrpc":"2.0","id":"body-token","method":"agentMail.status.get","token":"test-token","params":{}}`,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, tt.path, bytes.NewBufferString(tt.body))
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()

			server.Handler().ServeHTTP(response, request)

			if response.Code != http.StatusUnauthorized {
				t.Fatalf("response.Code = %d, want %d; body=%s", response.Code, http.StatusUnauthorized, response.Body.String())
			}
		})
	}

	request := httptest.NewRequest(
		http.MethodPost,
		"/rpc/agentMail.status.get",
		bytes.NewBufferString(`{"jsonrpc":"2.0","id":"bad-token","method":"agentMail.status.get","params":{}}`),
	)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(TokenHeader, "wrong-token")
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("wrong token response.Code = %d, want %d; body=%s", response.Code, http.StatusUnauthorized, response.Body.String())
	}
}

func TestStatusRPCReturnsProjectedDomainStatus(t *testing.T) {
	server := newTestServer(t)
	body := bytes.NewBufferString(`{"jsonrpc":"2.0","id":"request-1","method":"agentMail.status.get","params":{"include_source_files":true}}`)
	request := httptest.NewRequest(http.MethodPost, "/rpc/agentMail.status.get", body)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(TokenHeader, "test-token")
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("response.Code = %d, want %d, body=%s", response.Code, http.StatusOK, response.Body.String())
	}
	var payload StatusRPCResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.JSONRPC != "2.0" {
		t.Fatalf("payload.JSONRPC = %q, want 2.0", payload.JSONRPC)
	}
	if payload.ID != "request-1" {
		t.Fatalf("payload.ID = %q, want request-1", payload.ID)
	}
	if len(payload.Result.Domains) != 1 {
		t.Fatalf("len(payload.Result.Domains) = %d, want 1", len(payload.Result.Domains))
	}
	if !payload.Result.OK || payload.Result.Status != "ready" {
		t.Fatalf("status summary = ok:%t status:%q issues:%#v", payload.Result.OK, payload.Result.Status, payload.Result.Issues)
	}
	if !payload.Result.ControlState.OK || payload.Result.ControlState.DomainsActive != 1 {
		t.Fatalf("control state status = %#v", payload.Result.ControlState)
	}
	if !payload.Result.Modules.Poller.OK || payload.Result.Modules.Poller.DomainsSource != "control-state" {
		t.Fatalf("poller module status = %#v", payload.Result.Modules.Poller)
	}
	if payload.Result.Domains[0].Domain != "example.com" {
		t.Fatalf("domain = %q, want example.com", payload.Result.Domains[0].Domain)
	}
	if payload.Result.SourceFiles.PollerConfig != "" || payload.Result.SourceFiles.ProviderRelayConfig != "" {
		t.Fatalf("source files = %#v, want no module config files", payload.Result.SourceFiles)
	}
}

func TestStatusRPCValidatesMethod(t *testing.T) {
	server := newTestServer(t)
	body := bytes.NewBufferString(`{"jsonrpc":"2.0","id":"request-1","method":"agentMail.status.unknown","params":{}}`)
	request := httptest.NewRequest(http.MethodPost, "/rpc/agentMail.status.get", body)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(TokenHeader, "test-token")
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("response.Code = %d, want %d", response.Code, http.StatusUnprocessableEntity)
	}
}

func TestOpenAPISpecDocumentsControlContract(t *testing.T) {
	server := newTestServer(t)
	request := httptest.NewRequest(http.MethodGet, "/openapi.json", nil)
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("response.Code = %d, want %d", response.Code, http.StatusOK)
	}
	spec := response.Body.String()
	for _, operation := range []string{
		"agentMailStatusGet",
		"agentMailDomainAdd",
		"agentMailDomainModify",
		"agentMailDomainRemove",
		"agentMailProvisionApply",
		"agentMailRuntimeSync",
		"agentMailIngestEnqueue",
		"agentMailWorkerArchiveCredentialsIssue",
		"agentMailSendSubmit",
		"agentMailMessageProvenanceGet",
		"agentMailMessageViewGet",
		"agentMailMessageSecurityGet",
	} {
		if !strings.Contains(spec, operation) {
			t.Fatalf("openapi response missing operation %s: %s", operation, spec)
		}
	}
	for _, oldOperation := range []string{
		"agentMailDomainApply",
		"agentMailDomainDeactivate",
		"agentMailDomainReprovision",
		"agentMailCloudflareStatusGet",
		"agentMailCloudflareProvisionApply",
	} {
		if strings.Contains(spec, oldOperation) {
			t.Fatalf("openapi response still exposes old operation %s", oldOperation)
		}
	}
}

func TestIngestEnqueueRPCRequiresControlToken(t *testing.T) {
	server := newTestServer(t)
	body := `{"jsonrpc":"2.0","id":"ingest-1","method":"agentMail.ingest.enqueue","params":{}}`
	request := httptest.NewRequest(http.MethodPost, "/rpc/agentMail.ingest.enqueue", bytes.NewBufferString(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("response.Code = %d, want %d", response.Code, http.StatusUnauthorized)
	}
}

func TestIngestEnqueueRPCEnqueuesVerifiedNotification(t *testing.T) {
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
	ingest := &fakeIngestEnqueuer{}
	server := newTestServerWithOptions(t, WithIngestEnqueuer(ingest))
	body := `{
		"jsonrpc":"2.0",
		"id":"ingest-1",
		"method":"agentMail.ingest.enqueue",
		"params":{
			"schema":"agent-mail.inbound.ingest.v1",
			"organization_id":"org-1",
			"organization_public_id":"org_pub_123",
			"archive_prefix":"` + bundle.ArchivePrefix + `",
			"worker_connection_id":"worker-connection-1",
			"worker_domain_deployment_id":"worker-deployment-1",
			"ingest_id":"` + ingestID + `",
			"recipient_domain":"example.com",
			"raw_key":"` + bundle.RawKey + `",
			"edge_key":"` + bundle.EdgeKey + `",
			"result_key":"` + bundle.ResultKey + `",
			"received_at":"` + receivedAt.Format(time.RFC3339Nano) + `",
			"raw_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
		}
	}`

	response := postControlRPC(t, server, "/rpc/agentMail.ingest.enqueue", body)
	if response.Code != http.StatusOK {
		t.Fatalf("response.Code = %d, body=%s", response.Code, response.Body.String())
	}
	var payload IngestEnqueueRPCResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Result.Status != "enqueued" || payload.Result.IngestID != ingestID {
		t.Fatalf("payload.Result = %#v", payload.Result)
	}
	if len(ingest.calls) != 1 || ingest.calls[0].IngestID != ingestID {
		t.Fatalf("ingest calls = %#v", ingest.calls)
	}
}

func TestIngestEnqueueRPCReportsValidationReasonWithoutSecrets(t *testing.T) {
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
	ingest := &fakeIngestEnqueuer{err: errors.New("organization_id does not match active domain")}
	server := newTestServerWithOptions(t, WithIngestEnqueuer(ingest))
	body := `{
		"jsonrpc":"2.0",
		"id":"ingest-1",
		"method":"agentMail.ingest.enqueue",
		"params":{
			"schema":"agent-mail.inbound.ingest.v1",
			"organization_id":"org-1",
			"organization_public_id":"org_pub_123",
			"archive_prefix":"` + bundle.ArchivePrefix + `",
			"worker_connection_id":"worker-connection-1",
			"worker_domain_deployment_id":"worker-deployment-1",
			"ingest_id":"` + ingestID + `",
			"recipient_domain":"example.com",
			"raw_key":"` + bundle.RawKey + `",
			"edge_key":"` + bundle.EdgeKey + `",
			"result_key":"` + bundle.ResultKey + `",
			"received_at":"` + receivedAt.Format(time.RFC3339Nano) + `",
			"raw_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
		}
	}`

	response := postControlRPC(t, server, "/rpc/agentMail.ingest.enqueue", body)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("response.Code = %d, want %d, body=%s", response.Code, http.StatusBadRequest, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), "organization_id does not match active domain") {
		t.Fatalf("response did not include validation reason: %s", response.Body.String())
	}
	if strings.Contains(response.Body.String(), "worker-secret-key") || strings.Contains(response.Body.String(), "session-token") {
		t.Fatalf("response exposed credential material: %s", response.Body.String())
	}
}

func TestWorkerArchiveCredentialsRPCUsesConfiguredIssuer(t *testing.T) {
	issuer := &fakeWorkerArchiveCredentialIssuer{}
	server := newTestServerWithOptions(t, WithWorkerArchiveCredentialIssuer(issuer))
	body := `{
		"jsonrpc":"2.0",
		"id":"worker-creds-1",
		"method":"agentMail.worker.archiveCredentials.issue",
		"params":{
			"organization_id":"org-1",
			"organization_public_id":"org_pub_123",
			"domain":"example.com",
			"archive_prefix":"orgs/org_pub_123/domains/example.com/mail/inbound",
			"worker_connection_id":"worker-connection-1",
			"worker_domain_deployment_id":"worker-deployment-1"
		}
	}`

	response := postControlRPC(t, server, "/rpc/agentMail.worker.archiveCredentials.issue", body)
	if response.Code != http.StatusOK {
		t.Fatalf("response.Code = %d, body=%s", response.Code, response.Body.String())
	}
	var payload WorkerArchiveCredentialsRPCResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.JSONRPC != "2.0" || payload.ID != "worker-creds-1" {
		t.Fatalf("unexpected JSON-RPC envelope: %#v", payload)
	}
	if payload.Result.Status != "issued" || payload.Result.ArchivePrefix != "orgs/org_pub_123/domains/example.com/mail/inbound" {
		t.Fatalf("unexpected credential result: %#v", payload.Result)
	}
	if payload.Result.SecretAccessKey != "worker-secret-key" || payload.Result.SessionToken != "worker-session-token" {
		t.Fatalf("credential material was not returned in the internal response: %#v", payload.Result)
	}
	if len(issuer.calls) != 1 || issuer.calls[0].WorkerDomainDeploymentID != "worker-deployment-1" {
		t.Fatalf("issuer calls = %#v", issuer.calls)
	}
}

func TestWorkerArchiveCredentialsRPCDoesNotPretendWithoutIssuer(t *testing.T) {
	server := newTestServer(t)
	body := `{
		"jsonrpc":"2.0",
		"id":"worker-creds-1",
		"method":"agentMail.worker.archiveCredentials.issue",
		"params":{
			"organization_id":"org-1",
			"organization_public_id":"org_pub_123",
			"domain":"example.com",
			"archive_prefix":"orgs/org_pub_123/domains/example.com/mail/inbound",
			"worker_connection_id":"worker-connection-1",
			"worker_domain_deployment_id":"worker-deployment-1"
		}
	}`

	response := postControlRPC(t, server, "/rpc/agentMail.worker.archiveCredentials.issue", body)
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("response.Code = %d, want %d, body=%s", response.Code, http.StatusServiceUnavailable, response.Body.String())
	}
	if strings.Contains(response.Body.String(), "worker-secret-key") {
		t.Fatalf("unconfigured issuer response exposed credential material: %s", response.Body.String())
	}
}

func TestSendSubmitRPCDoesNotPretendToSendWithoutExecutor(t *testing.T) {
	server := newTestServer(t)
	body := `{
		"jsonrpc":"2.0",
		"id":"send-1",
		"method":"agentMail.send.submit",
		"params":{
			"idempotency_key":"send-1",
			"domain":"example.com",
			"from":"agent@example.com",
			"to":"recipient@example.net",
			"raw":"Subject: Test\r\n\r\nBody"
		}
	}`

	response := postControlRPC(t, server, "/rpc/agentMail.send.submit", body)
	if response.Code != http.StatusNotImplemented {
		t.Fatalf("response.Code = %d, want %d, body=%s", response.Code, http.StatusNotImplemented, response.Body.String())
	}
}

func TestMessageProvenanceRPCReturnsCanonicalDeliveryKey(t *testing.T) {
	fetcher := &fakeMessageSourceFetcher{source: []byte(strings.Join([]string{
		"Message-ID: <trace-message@example.net>",
		"X-ATM-Ingest-ID: ingest-1",
		"X-ATMCF-Edge-Envelope-From: sender@example.net",
		"X-ATMCF-Edge-Envelope-To: agent@example.com",
		"",
		"body",
	}, "\r\n"))}
	provenance, err := messageprovenance.New(fetcher)
	if err != nil {
		t.Fatalf("messageprovenance.New: %v", err)
	}
	server := newTestServerWithProvenance(t, provenance)
	body := `{
		"jsonrpc":"2.0",
		"id":"provenance-1",
		"method":"agentMail.message.provenance.get",
		"params":{
			"wildDuckUserId":"user-1",
			"wildDuckMailboxId":"mailbox-1",
			"wildDuckUid":324,
			"wildDuckMessageId":"message-object-1"
		}
	}`

	response := postControlRPC(t, server, "/rpc/agentMail.message.provenance.get", body)
	if response.Code != http.StatusOK {
		t.Fatalf("response.Code = %d, body=%s", response.Code, response.Body.String())
	}
	var payload MessageProvenanceRPCResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.JSONRPC != "2.0" || payload.ID != "provenance-1" {
		t.Fatalf("unexpected JSON-RPC envelope: %#v", payload)
	}
	wantKey := "agent-mail:inbound:v1:ingest:ingest-1:wd:user-1:mb:mailbox-1:uid:324"
	if payload.Result.DeliveryKey != wantKey {
		t.Fatalf("deliveryKey = %q, want %q", payload.Result.DeliveryKey, wantKey)
	}
	if payload.Result.IdempotencyBasis != "ingest+wildduck-delivery" {
		t.Fatalf("basis = %q", payload.Result.IdempotencyBasis)
	}
	if payload.Result.IngestID != "ingest-1" {
		t.Fatalf("ingestId = %q", payload.Result.IngestID)
	}
	if payload.Result.WildDuck.MessageID != "message-object-1" {
		t.Fatalf("wildDuck.messageId = %q", payload.Result.WildDuck.MessageID)
	}
	if payload.Result.Headers["Message-ID"] != "<trace-message@example.net>" {
		t.Fatalf("Message-ID trace header = %q", payload.Result.Headers["Message-ID"])
	}
	if payload.Result.Cloudflare["X-ATMCF-Edge-Envelope-From"] != "sender@example.net" {
		t.Fatalf("cloudflare headers = %#v", payload.Result.Cloudflare)
	}
	if len(fetcher.calls) != 1 || fetcher.calls[0].UserID != "user-1" || fetcher.calls[0].MailboxID != "mailbox-1" || fetcher.calls[0].UID != 324 {
		t.Fatalf("fetcher calls = %#v", fetcher.calls)
	}
}

func TestMessageProvenanceRPCSourceFetchFailureReturnsError(t *testing.T) {
	fetcher := &fakeMessageSourceFetcher{err: errors.New("wildduck unavailable")}
	provenance, err := messageprovenance.New(fetcher)
	if err != nil {
		t.Fatalf("messageprovenance.New: %v", err)
	}
	server := newTestServerWithProvenance(t, provenance)
	body := `{
		"jsonrpc":"2.0",
		"id":"provenance-1",
		"method":"agentMail.message.provenance.get",
		"params":{
			"wildDuckUserId":"user-1",
			"wildDuckMailboxId":"mailbox-1",
			"wildDuckUid":324
		}
	}`

	response := postControlRPC(t, server, "/rpc/agentMail.message.provenance.get", body)
	if response.Code != http.StatusBadGateway {
		t.Fatalf("response.Code = %d, want %d, body=%s", response.Code, http.StatusBadGateway, response.Body.String())
	}
}

func TestMessageProvenanceRPCMissingIngestHeaderUsesFallbackKey(t *testing.T) {
	provenanceWithObjectID, err := messageprovenance.New(&fakeMessageSourceFetcher{source: []byte("Message-ID: <trace@example.net>\r\n\r\nbody")})
	if err != nil {
		t.Fatalf("messageprovenance.New: %v", err)
	}
	server := newTestServerWithProvenance(t, provenanceWithObjectID)
	body := `{
		"jsonrpc":"2.0",
		"id":"provenance-object",
		"method":"agentMail.message.provenance.get",
		"params":{
			"wildDuckUserId":"user-1",
			"wildDuckMailboxId":"mailbox-1",
			"wildDuckUid":324,
			"wildDuckMessageId":"message-object-1"
		}
	}`
	response := postControlRPC(t, server, "/rpc/agentMail.message.provenance.get", body)
	if response.Code != http.StatusOK {
		t.Fatalf("object fallback response.Code = %d, body=%s", response.Code, response.Body.String())
	}
	var payload MessageProvenanceRPCResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode object fallback: %v", err)
	}
	wantObjectKey := "agent-mail:inbound:v1:wd-message:message-object-1:wd:user-1:mb:mailbox-1:uid:324"
	if payload.Result.DeliveryKey != wantObjectKey || payload.Result.IdempotencyBasis != "wildduck-message+delivery" {
		t.Fatalf("object fallback result = %#v", payload.Result)
	}

	body = strings.ReplaceAll(body, `"wildDuckMessageId":"message-object-1"`, `"wildDuckMessageId":""`)
	response = postControlRPC(t, server, "/rpc/agentMail.message.provenance.get", body)
	if response.Code != http.StatusOK {
		t.Fatalf("identity fallback response.Code = %d, body=%s", response.Code, response.Body.String())
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode identity fallback: %v", err)
	}
	wantIdentityKey := "agent-mail:inbound:v1:wd:user-1:mb:mailbox-1:uid:324"
	if payload.Result.DeliveryKey != wantIdentityKey || payload.Result.IdempotencyBasis != "wildduck-delivery" {
		t.Fatalf("identity fallback result = %#v", payload.Result)
	}
}

func TestMessageViewRPCReturnsLinkAndImageMetadata(t *testing.T) {
	source := []byte(strings.Join([]string{
		"From: Sender <sender@example.net>",
		"To: Agent <agent@example.com>",
		"Subject: HTML",
		"MIME-Version: 1.0",
		"Content-Type: text/html; charset=utf-8",
		"",
		`<a href="https://example.net" target="_self">Example</a>`,
		`<img src="https://tracker.example/pixel.png" alt="tracker">`,
	}, "\r\n"))
	provenance, err := messageprovenance.New(&fakeMessageSourceFetcher{source: source})
	if err != nil {
		t.Fatalf("messageprovenance.New: %v", err)
	}
	server := newTestServerWithProvenance(t, provenance)
	body := `{
		"jsonrpc":"2.0",
		"id":"view-1",
		"method":"agentMail.message.view.get",
		"params":{
			"wildDuckUserId":"user-1",
			"wildDuckMailboxId":"mailbox-1",
			"wildDuckUid":324,
			"remoteImages":"block"
		}
	}`

	response := postControlRPC(t, server, "/rpc/agentMail.message.view.get", body)
	if response.Code != http.StatusOK {
		t.Fatalf("response.Code = %d, body=%s", response.Code, response.Body.String())
	}
	var payload MessageViewRPCResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.JSONRPC != "2.0" || payload.ID != "view-1" {
		t.Fatalf("unexpected JSON-RPC envelope: %#v", payload)
	}
	if len(payload.Result.ExternalLinks) != 1 || payload.Result.ExternalLinks[0].URL != "https://example.net" {
		t.Fatalf("external links = %#v", payload.Result.ExternalLinks)
	}
	if len(payload.Result.RemoteImages) != 1 || payload.Result.RemoteImages[0].URL != "https://tracker.example/pixel.png" {
		t.Fatalf("remote images = %#v", payload.Result.RemoteImages)
	}
	if strings.Contains(payload.Result.DisplayHTML, `<img src="https://tracker.example/pixel.png"`) {
		t.Fatalf("display HTML loaded blocked remote image: %s", payload.Result.DisplayHTML)
	}
	if !strings.Contains(payload.Result.DisplayHTML, `data-agent-mail-external-link-id="link-1"`) {
		t.Fatalf("display HTML missing external-link marker: %s", payload.Result.DisplayHTML)
	}
}

func TestMessageSecurityRPCReturnsAuthenticationSummary(t *testing.T) {
	source := []byte(strings.Join([]string{
		"Authentication-Results: haraka.example.test; spf=pass smtp.mailfrom=sender.example; dkim=pass header.d=sender.example; dmarc=pass header.from=sender.example",
		"Received-SPF: pass client-ip=10.0.0.1; envelope-from=sender@example.net; receiver=haraka.example.test; identity=mailfrom",
		"Message-ID: <trace@example.net>",
		"X-ATM-Ingest-ID: ingest-1",
		"X-ATMCF-Edge-Action: worker",
		"X-ATMCF-Edge-Status: received",
		"X-ATMCF-Edge-Envelope-From: sender@example.net",
		"X-ATMCF-Edge-Envelope-To: agent@example.com",
		"",
		"body",
	}, "\r\n"))
	provenance, err := messageprovenance.New(&fakeMessageSourceFetcher{source: source})
	if err != nil {
		t.Fatalf("messageprovenance.New: %v", err)
	}
	server := newTestServerWithProvenance(t, provenance)
	body := `{
		"jsonrpc":"2.0",
		"id":"security-1",
		"method":"agentMail.message.security.get",
		"params":{
			"wildDuckUserId":"user-1",
			"wildDuckMailboxId":"mailbox-1",
			"wildDuckUid":324
		}
	}`

	response := postControlRPC(t, server, "/rpc/agentMail.message.security.get", body)
	if response.Code != http.StatusOK {
		t.Fatalf("response.Code = %d, body=%s", response.Code, response.Body.String())
	}
	var payload MessageSecurityRPCResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.JSONRPC != "2.0" || payload.ID != "security-1" {
		t.Fatalf("unexpected JSON-RPC envelope: %#v", payload)
	}
	if payload.Result.Summary.SPF.Result != "unknown" || payload.Result.Summary.DKIM.Result != "unknown" || payload.Result.Summary.DMARC.Result != "unknown" {
		t.Fatalf("security summary = %#v", payload.Result.Summary)
	}
	if payload.Result.HarakaWildDuck.Trusted {
		t.Fatalf("HarakaWildDuck must be untrusted without verified R2 archive evidence: %#v", payload.Result.HarakaWildDuck)
	}
	if len(payload.Result.ReceivedSPF) != 1 {
		t.Fatalf("ReceivedSPF = %#v", payload.Result.ReceivedSPF)
	}
}

func TestDomainAddModifyRemoveMutateDesiredControlStateOnly(t *testing.T) {
	store := controlstate.NewMemoryStore()
	server := newTestServerWithStore(t, store)

	addBody := `{
		"jsonrpc":"2.0",
		"id":"domain-add-1",
		"method":"agentMail.domain.add",
			"params":{
				"organization_id":"org-1",
				"organization_public_id":"org_pub_123",
				"domain":"example.com",
				"enabled":true,
				"cloudflare_zone_name":"example.com",
				"archive_prefix":"orgs/org_pub_123/domains/example.com/mail/inbound",
				"worker_connection_id":"worker-connection-1",
				"worker_domain_deployment_id":"worker-deployment-1",
				"mail_from_domain":"ei.example.com"
			}
	}`
	addResponse := postControlRPC(t, server, "/rpc/agentMail.domain.add", addBody)
	if addResponse.Code != http.StatusOK {
		t.Fatalf("add response.Code = %d, body=%s", addResponse.Code, addResponse.Body.String())
	}
	var addPayload DomainAddRPCResponse
	if err := json.NewDecoder(addResponse.Body).Decode(&addPayload); err != nil {
		t.Fatalf("decode add response: %v", err)
	}
	if !addPayload.Result.Changed {
		t.Fatalf("add changed = false, want true")
	}
	if addPayload.Result.Domain.FeedbackAddress != "bounces@example.com" {
		t.Fatalf("feedback address = %q", addPayload.Result.Domain.FeedbackAddress)
	}
	if addPayload.Result.Domain.Outbound.Provider != controlstate.ProviderSES {
		t.Fatalf("provider = %q, want ses", addPayload.Result.Domain.Outbound.Provider)
	}
	if addPayload.Result.Domain.ProviderMetadata.SES.MailFromDomain != "ei.example.com" {
		t.Fatalf("mail-from domain = %q", addPayload.Result.Domain.ProviderMetadata.SES.MailFromDomain)
	}
	if addPayload.Result.Domain.CloudflareProvision.LastProvisionStatus != "" {
		t.Fatalf("domain add ran provisioning unexpectedly: %#v", addPayload.Result.Domain.CloudflareProvision)
	}

	modifyBody := `{
		"jsonrpc":"2.0",
		"id":"domain-modify-1",
		"method":"agentMail.domain.modify",
			"params":{
				"organization_id":"org-1",
				"organization_public_id":"org_pub_123",
				"domain":"example.com",
				"enabled":false,
				"cloudflare_zone_name":"example.com",
				"archive_prefix":"orgs/org_pub_123/domains/example.com/mail/inbound",
				"worker_connection_id":"worker-connection-1",
				"worker_domain_deployment_id":"worker-deployment-1",
				"mail_from_domain":"mail.example.com"
			}
	}`
	modifyResponse := postControlRPC(t, server, "/rpc/agentMail.domain.modify", modifyBody)
	if modifyResponse.Code != http.StatusOK {
		t.Fatalf("modify response.Code = %d, body=%s", modifyResponse.Code, modifyResponse.Body.String())
	}
	var modifyPayload DomainModifyRPCResponse
	if err := json.NewDecoder(modifyResponse.Body).Decode(&modifyPayload); err != nil {
		t.Fatalf("decode modify response: %v", err)
	}
	if !modifyPayload.Result.Changed {
		t.Fatalf("modify changed = false, want true")
	}
	if modifyPayload.Result.Domain.Status != controlstate.DomainStatusDeactivated {
		t.Fatalf("modified domain status = %q", modifyPayload.Result.Domain.Status)
	}
	if modifyPayload.Result.Domain.ProviderMetadata.SES.FeedbackReturnPath != "bounces@example.com" {
		t.Fatalf("feedback return path = %q", modifyPayload.Result.Domain.ProviderMetadata.SES.FeedbackReturnPath)
	}

	enableResponse := postControlRPC(t, server, "/rpc/agentMail.domain.modify", strings.ReplaceAll(modifyBody, `"enabled":false`, `"enabled":true`))
	if enableResponse.Code != http.StatusOK {
		t.Fatalf("enable response.Code = %d, body=%s", enableResponse.Code, enableResponse.Body.String())
	}

	removeBody := `{
		"jsonrpc":"2.0",
		"id":"domain-remove-1",
		"method":"agentMail.domain.remove",
		"params":{"domain":"example.com"}
	}`
	removeResponse := postControlRPC(t, server, "/rpc/agentMail.domain.remove", removeBody)
	if removeResponse.Code != http.StatusOK {
		t.Fatalf("remove response.Code = %d, body=%s", removeResponse.Code, removeResponse.Body.String())
	}
	var removePayload DomainRemoveRPCResponse
	if err := json.NewDecoder(removeResponse.Body).Decode(&removePayload); err != nil {
		t.Fatalf("decode remove response: %v", err)
	}
	if !removePayload.Result.Changed {
		t.Fatalf("remove changed = false, want true")
	}
	if removePayload.Result.Domain.Status != controlstate.DomainStatusDeactivated {
		t.Fatalf("removed domain status = %q", removePayload.Result.Domain.Status)
	}

	state, err := store.State(context.Background())
	if err != nil {
		t.Fatalf("store.State: %v", err)
	}
	if len(state.Domains) != 1 {
		t.Fatalf("len(state.Domains) = %d, want 1", len(state.Domains))
	}
	if state.Domains[0].CloudflareProvision.LastProvisionStatus != "" {
		t.Fatalf("CRUD methods must not run provisioning: %#v", state.Domains[0].CloudflareProvision)
	}
}

func TestDomainAddDefaultsAndValidatesMailFromDomain(t *testing.T) {
	defaultStore := controlstate.NewMemoryStore()
	defaultServer := newTestServerWithStore(t, defaultStore)
	defaultBody := `{
		"jsonrpc":"2.0",
		"id":"domain-add-default-mail-from",
		"method":"agentMail.domain.add",
			"params":{
				"organization_id":"org-1",
				"organization_public_id":"org_pub_123",
				"domain":"example.com",
				"enabled":true,
				"cloudflare_zone_name":"example.com",
				"archive_prefix":"orgs/org_pub_123/domains/example.com/mail/inbound",
				"worker_connection_id":"worker-connection-1",
				"worker_domain_deployment_id":"worker-deployment-1"
			}
	}`
	defaultResponse := postControlRPC(t, defaultServer, "/rpc/agentMail.domain.add", defaultBody)
	if defaultResponse.Code != http.StatusOK {
		t.Fatalf("default mail-from response.Code = %d, body=%s", defaultResponse.Code, defaultResponse.Body.String())
	}
	var defaultPayload DomainAddRPCResponse
	if err := json.NewDecoder(defaultResponse.Body).Decode(&defaultPayload); err != nil {
		t.Fatalf("decode default response: %v", err)
	}
	if defaultPayload.Result.Domain.ProviderMetadata.SES.MailFromDomain != "example.com" {
		t.Fatalf("default mail-from domain = %q, want example.com", defaultPayload.Result.Domain.ProviderMetadata.SES.MailFromDomain)
	}

	rejectServer := newTestServerWithStore(t, controlstate.NewMemoryStore())
	rejectBody := `{
		"jsonrpc":"2.0",
		"id":"domain-add-cross-mail-from",
		"method":"agentMail.domain.add",
			"params":{
				"organization_id":"org-1",
				"organization_public_id":"org_pub_123",
				"domain":"example.com",
				"enabled":true,
				"cloudflare_zone_name":"example.com",
				"archive_prefix":"orgs/org_pub_123/domains/example.com/mail/inbound",
				"worker_connection_id":"worker-connection-1",
				"worker_domain_deployment_id":"worker-deployment-1",
				"mail_from_domain":"mail.example.net"
			}
	}`
	rejectResponse := postControlRPC(t, rejectServer, "/rpc/agentMail.domain.add", rejectBody)
	if rejectResponse.Code != http.StatusBadRequest {
		t.Fatalf("cross-domain mail-from response.Code = %d, body=%s", rejectResponse.Code, rejectResponse.Body.String())
	}
	if !strings.Contains(rejectResponse.Body.String(), "mail_from_domain") {
		t.Fatalf("cross-domain mail-from response missing field context: %s", rejectResponse.Body.String())
	}
}

func TestProvisionApplyMutatesWildDuckCloudflareAndControlState(t *testing.T) {
	// Service contract: provision.apply is the single public full-apply
	// operation. The assertion verifies actual downstream effects so the API
	// cannot return success while failing to provision feedback or routing.
	store := controlstate.NewMemoryStore()
	cloudflareMock := newControlAPICloudflareMock(t)
	defer cloudflareMock.server.Close()
	wildDuckMock := newControlAPIWildDuckMock(t)
	defer wildDuckMock.server.Close()

	cfProvisioner, err := cloudflareprovisioner.New(cloudflareprovisioner.Config{
		APIBaseURL:       cloudflareMock.server.URL + "/client/v4",
		AccountID:        "account-1",
		APIToken:         "token-1",
		WorkerScriptName: cloudflareprovisioner.DefaultWorkerScriptName,
	}, store)
	if err != nil {
		t.Fatalf("cloudflareprovisioner.New: %v", err)
	}
	wdProvisioner, err := wildduckprovisioner.New(wildduckprovisioner.Config{
		APIBaseURL:      wildDuckMock.server.URL,
		AdminToken:      "wildduck-token",
		PrimaryUsername: "",
		Password:        "test-password",
		DisplayName:     "Mail Delivery Subsystem",
		SpamLevel:       0,
	})
	if err != nil {
		t.Fatalf("wildduckprovisioner.New: %v", err)
	}
	provisioner := mailprovisioner.New(
		store,
		mailprovisioner.WithSelectedProvider(controlstate.ProviderSES),
		mailprovisioner.WithCloudflare(cfProvisioner),
		mailprovisioner.WithWildDuck(wdProvisioner),
	)
	server := newTestServerWithProvisioner(t, provisioner)

	addBody := `{
		"jsonrpc":"2.0",
		"id":"domain-add-1",
		"method":"agentMail.domain.add",
			"params":{
				"organization_id":"org-1",
				"organization_public_id":"org_pub_123",
				"domain":"example.com",
				"enabled":true,
				"cloudflare_zone_name":"example.com",
				"archive_prefix":"orgs/org_pub_123/domains/example.com/mail/inbound",
				"worker_connection_id":"worker-connection-1",
				"worker_domain_deployment_id":"worker-deployment-1",
				"mail_from_domain":"ei.example.com"
			}
	}`
	if response := postControlRPC(t, server, "/rpc/agentMail.domain.add", addBody); response.Code != http.StatusOK {
		t.Fatalf("add response.Code = %d, body=%s", response.Code, response.Body.String())
	}

	provisionBody := `{
		"jsonrpc":"2.0",
		"id":"provision-1",
		"method":"agentMail.provision.apply",
		"params":{}
	}`
	provisionResponse := postControlRPC(t, server, "/rpc/agentMail.provision.apply", provisionBody)
	if provisionResponse.Code != http.StatusOK {
		t.Fatalf("provision response.Code = %d, body=%s", provisionResponse.Code, provisionResponse.Body.String())
	}
	var provisionPayload ProvisionApplyRPCResponse
	if err := json.NewDecoder(provisionResponse.Body).Decode(&provisionPayload); err != nil {
		t.Fatalf("decode provision response: %v", err)
	}
	if !provisionPayload.Result.OK {
		t.Fatalf("provision result OK = false: %#v", provisionPayload.Result)
	}
	if !hasAppliedStep(provisionPayload.Result.Steps, "wildduck_feedback") {
		t.Fatalf("provision steps did not include applied WildDuck feedback: %#v", provisionPayload.Result.Steps)
	}
	if !hasAppliedStep(provisionPayload.Result.Steps, "cloudflare_routing") {
		t.Fatalf("provision steps did not include applied Cloudflare routing: %#v", provisionPayload.Result.Steps)
	}
	if !wildDuckMock.hasAddress("bounces@example.com") {
		t.Fatalf("WildDuck mock missing bounces@example.com address")
	}
	if !cloudflareMock.catchAll.Enabled {
		t.Fatalf("mock Cloudflare catch-all was not enabled: %#v", cloudflareMock.catchAll)
	}
	if len(cloudflareMock.regularRules) != 0 {
		t.Fatalf("mock Cloudflare regular rules remain: %#v", cloudflareMock.regularRules)
	}
	state, err := store.State(context.Background())
	if err != nil {
		t.Fatalf("store.State: %v", err)
	}
	if state.Domains[0].CloudflareProvision.LastProvisionStatus != "applied" {
		t.Fatalf("stored Cloudflare status = %q", state.Domains[0].CloudflareProvision.LastProvisionStatus)
	}

	secondResponse := postControlRPC(t, server, "/rpc/agentMail.provision.apply", provisionBody)
	if secondResponse.Code != http.StatusOK {
		t.Fatalf("second provision response.Code = %d, body=%s", secondResponse.Code, secondResponse.Body.String())
	}
	var secondPayload ProvisionApplyRPCResponse
	if err := json.NewDecoder(secondResponse.Body).Decode(&secondPayload); err != nil {
		t.Fatalf("decode second provision response: %v", err)
	}
	if !secondPayload.Result.OK {
		t.Fatalf("second provision result OK = false: %#v", secondPayload.Result)
	}
	if !cloudflareMock.catchAll.Enabled || len(cloudflareMock.regularRules) != 0 {
		t.Fatalf("second provision was not idempotent: catchAll=%#v regular=%#v", cloudflareMock.catchAll, cloudflareMock.regularRules)
	}
}

func TestProvisionApplyFailsClearlyWithoutEnabledDomains(t *testing.T) {
	server := newTestServerWithStore(t, controlstate.NewMemoryStore())
	body := `{
		"jsonrpc":"2.0",
		"id":"provision-no-domains",
		"method":"agentMail.provision.apply",
		"params":{}
	}`

	response := postControlRPC(t, server, "/rpc/agentMail.provision.apply", body)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("response.Code = %d, want %d, body=%s", response.Code, http.StatusBadRequest, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), "no enabled domains") {
		t.Fatalf("response body missing no-enabled-domains detail: %s", response.Body.String())
	}
}

func postControlRPC(t *testing.T, server *Server, path string, body string) *httptest.ResponseRecorder {
	t.Helper()
	return postControlRPCWithToken(t, server, path, body, "test-token")
}

func postControlRPCWithToken(t *testing.T, server *Server, path string, body string, token string) *httptest.ResponseRecorder {
	t.Helper()
	return postControlRPCWithHeaders(t, server, path, body, map[string]string{TokenHeader: token})
}

func postControlRPCWithHeaders(t *testing.T, server *Server, path string, body string, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(http.MethodPost, path, bytes.NewBufferString(body))
	request.Header.Set("Content-Type", "application/json")
	for key, value := range headers {
		request.Header.Set(key, value)
	}
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, request)
	return response
}

func hasAppliedStep(steps []mailprovisioner.ProvisionStep, name string) bool {
	for _, step := range steps {
		if step.Name == name && step.Status == "applied" {
			return true
		}
	}
	return false
}

func newTestServer(t *testing.T) *Server {
	t.Helper()
	return newTestServerWithStore(t, controlstate.NewMemoryStore())
}

func newTestServerWithOptions(t *testing.T, options ...Option) *Server {
	t.Helper()
	source := []byte("Message-ID: <default@example.net>\r\nX-ATM-Ingest-ID: default-ingest\r\n\r\nbody")
	provenance, err := messageprovenance.New(&fakeMessageSourceFetcher{source: source})
	if err != nil {
		t.Fatalf("messageprovenance.New: %v", err)
	}
	return newTestServerWithProvisionerProvenanceAndOptions(t, mailprovisioner.New(
		controlstate.NewMemoryStore(),
		mailprovisioner.WithSelectedProvider(controlstate.ProviderSES),
	), provenance, options...)
}

func newTestServerWithStore(t *testing.T, store *controlstate.MemoryStore) *Server {
	t.Helper()
	return newTestServerWithProvisioner(t, mailprovisioner.New(
		store,
		mailprovisioner.WithSelectedProvider(controlstate.ProviderSES),
	))
}

func newTestServerWithProvisioner(t *testing.T, provisioner *mailprovisioner.Service) *Server {
	t.Helper()
	source := []byte("Message-ID: <default@example.net>\r\nX-ATM-Ingest-ID: default-ingest\r\n\r\nbody")
	provenance, err := messageprovenance.New(&fakeMessageSourceFetcher{source: source})
	if err != nil {
		t.Fatalf("messageprovenance.New: %v", err)
	}
	return newTestServerWithProvisionerAndProvenance(t, provisioner, provenance)
}

func newTestServerWithProvenance(t *testing.T, provenance MessageProvenanceProvider) *Server {
	t.Helper()
	return newTestServerWithProvisionerAndProvenance(t, mailprovisioner.New(
		controlstate.NewMemoryStore(),
		mailprovisioner.WithSelectedProvider(controlstate.ProviderSES),
	), provenance)
}

func newTestServerWithProvisionerAndProvenance(t *testing.T, provisioner *mailprovisioner.Service, provenance MessageProvenanceProvider) *Server {
	t.Helper()
	return newTestServerWithProvisionerProvenanceAndOptions(t, provisioner, provenance)
}

func newTestServerWithProvisionerProvenanceAndOptions(t *testing.T, provisioner *mailprovisioner.Service, provenance MessageProvenanceProvider, options ...Option) *Server {
	t.Helper()
	server, err := New(Config{
		ListenAddress: "127.0.0.1:0",
		AuthToken:     "test-token",
	}, fakeStatusProvider{snapshot: domainregistry.Snapshot{
		OK:               true,
		Status:           "ready",
		SelectedProvider: "ses",
		ControlState: domainregistry.ControlStateStatus{
			Backend:       controlstate.BackendMemory,
			Exists:        true,
			Configured:    true,
			Schema:        controlstate.Schema,
			DomainsTotal:  1,
			DomainsActive: 1,
			OK:            true,
		},
		Modules: domainregistry.ModulesStatus{
			AdminAPI:       domainregistry.ModuleStatus{OK: true, Configured: true, ListenAddress: "127.0.0.1:0"},
			SMTPRelay:      domainregistry.ModuleStatus{OK: true, Configured: true, ListenAddress: ":2587", Provider: "ses"},
			Poller:         domainregistry.ModuleStatus{OK: true, Configured: true, DomainsSource: "control-state", ActiveDomains: 1},
			FeedbackRouter: domainregistry.ModuleStatus{OK: true, Configured: true, DomainsSource: "control-state", ActiveDomains: 1, Endpoint: "wildduck-imap:143", Mailbox: "INBOX"},
		},
		Dependencies: domainregistry.DependenciesStatus{
			R2:               domainregistry.DependencyStatus{OK: true, Configured: true, Bucket: "agent-mail-archive"},
			WildDuckAPI:      domainregistry.DependencyStatus{OK: true, Configured: true, Endpoint: "http://wildduck-api:8080"},
			WildDuckIMAP:     domainregistry.DependencyStatus{OK: true, Configured: true, Endpoint: "wildduck-imap:143"},
			WildDuckMongo:    domainregistry.DependencyStatus{OK: true, Configured: true, Endpoint: "mongodb://mongodb:27017/wildduck"},
			HarakaSMTP:       domainregistry.DependencyStatus{OK: true, Configured: true, Endpoint: "haraka:25"},
			ZoneMTADSN:       domainregistry.DependencyStatus{OK: true, Configured: true, Endpoint: "zonemta-dsn:2526"},
			CloudflareAPI:    domainregistry.DependencyStatus{OK: true, Configured: true},
			OutboundProvider: domainregistry.DependencyStatus{OK: true, Configured: true, Provider: "ses"},
		},
		Provisioning: domainregistry.ProvisioningStatus{Status: "applied", DomainsApplied: 1},
		Domains: []domainregistry.DomainStatus{
			{
				Domain: "example.com",
				Status: "ready",
				Inbound: domainregistry.InboundStatus{
					SweepConfigured: true,
					DSNConfigured:   true,
					Provider:        "cloudflare",
					CloudflareZone:  "example.com",
				},
				Outbound: domainregistry.OutboundStatus{
					Configured:   true,
					Provider:     "ses",
					SenderDomain: "example.com",
				},
				FeedbackAddress: "bounces@example.com",
				Feedback: domainregistry.FeedbackStatus{
					OK:             true,
					Configured:     true,
					Address:        "bounces@example.com",
					WildDuckExists: true,
					WildDuckUserID: "user-1",
				},
				Cloudflare: domainregistry.CloudflareStatus{
					OK:                 true,
					ZoneName:           "example.com",
					ZoneID:             "zone-1",
					CatchAllRuleID:     "catch-all-1",
					CatchAllEnabled:    true,
					CatchAllConfigured: true,
				},
			},
		},
	}}, provisioner, provenance, options...)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return server
}

type controlAPICloudflareRule struct {
	ID       string                              `json:"id,omitempty"`
	Name     string                              `json:"name,omitempty"`
	Enabled  bool                                `json:"enabled"`
	Actions  []cloudflareprovisioner.RuleAction  `json:"actions,omitempty"`
	Matchers []cloudflareprovisioner.RuleMatcher `json:"matchers,omitempty"`
}

type controlAPICloudflareMock struct {
	server       *httptest.Server
	catchAll     controlAPICloudflareRule
	regularRules []controlAPICloudflareRule
}

func newControlAPICloudflareMock(t *testing.T) *controlAPICloudflareMock {
	t.Helper()
	mock := &controlAPICloudflareMock{
		catchAll: controlAPICloudflareRule{ID: "catch-all-1", Enabled: false},
		regularRules: []controlAPICloudflareRule{
			{
				ID:      "literal-1",
				Name:    "literal support",
				Enabled: true,
				Actions: []cloudflareprovisioner.RuleAction{
					{Type: "forward", Value: []string{"support@example.net"}},
				},
				Matchers: []cloudflareprovisioner.RuleMatcher{{Type: "literal"}},
			},
		},
	}
	mock.server = httptest.NewServer(http.HandlerFunc(mock.handle))
	return mock
}

func (m *controlAPICloudflareMock) handle(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Authorization") != "Bearer token-1" {
		writeControlAPICloudflareFailure(w, http.StatusUnauthorized, "bad token")
		return
	}
	switch {
	case r.Method == http.MethodGet && r.URL.Path == "/client/v4/accounts/account-1/workers/scripts/agent-mail-ingress/settings":
		writeControlAPICloudflareSuccess(w, map[string]string{"script": "agent-mail-ingress"})
	case r.Method == http.MethodGet && r.URL.Path == "/client/v4/zones" && r.URL.Query().Get("name") == "example.com":
		writeControlAPICloudflareSuccess(w, []map[string]string{{"id": "zone-1"}})
	case r.Method == http.MethodPut && r.URL.Path == "/client/v4/zones/zone-1/email/routing/rules/catch_all":
		var body struct {
			Actions  []cloudflareprovisioner.RuleAction  `json:"actions"`
			Enabled  bool                                `json:"enabled"`
			Matchers []cloudflareprovisioner.RuleMatcher `json:"matchers"`
			Name     string                              `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeControlAPICloudflareFailure(w, http.StatusBadRequest, err.Error())
			return
		}
		m.catchAll = controlAPICloudflareRule{
			ID:       "catch-all-1",
			Name:     body.Name,
			Enabled:  body.Enabled,
			Actions:  body.Actions,
			Matchers: body.Matchers,
		}
		writeControlAPICloudflareSuccess(w, m.catchAll)
	case r.Method == http.MethodGet && r.URL.Path == "/client/v4/zones/zone-1/email/routing/rules":
		writeControlAPICloudflareSuccess(w, m.regularRules)
	case r.Method == http.MethodDelete && r.URL.Path == "/client/v4/zones/zone-1/email/routing/rules/literal-1":
		m.regularRules = nil
		writeControlAPICloudflareSuccess(w, map[string]string{"id": "literal-1"})
	default:
		writeControlAPICloudflareFailure(w, http.StatusNotFound, r.Method+" "+r.URL.String())
	}
}

func writeControlAPICloudflareSuccess(w http.ResponseWriter, result any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"success": true,
		"result":  result,
		"errors":  []any{},
	})
}

func writeControlAPICloudflareFailure(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"success": false,
		"errors": []map[string]any{
			{"code": status, "message": message},
		},
	})
}

type controlAPIWildDuckMock struct {
	server    *httptest.Server
	addresses map[string]string
	users     map[string]string
	userID    string
}

func newControlAPIWildDuckMock(t *testing.T) *controlAPIWildDuckMock {
	t.Helper()
	mock := &controlAPIWildDuckMock{
		addresses: map[string]string{},
		users:     map[string]string{},
		userID:    "user-1",
	}
	mock.server = httptest.NewServer(http.HandlerFunc(mock.handle))
	return mock
}

func (m *controlAPIWildDuckMock) hasAddress(address string) bool {
	_, ok := m.addresses[address]
	return ok
}

func (m *controlAPIWildDuckMock) handle(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("X-Access-Token") != "wildduck-token" {
		writeWildDuckFailure(w, http.StatusUnauthorized, "bad token")
		return
	}
	switch {
	case r.Method == http.MethodGet && strings.HasPrefix(r.URL.EscapedPath(), "/users/resolve/"):
		escaped := strings.TrimPrefix(r.URL.EscapedPath(), "/users/resolve/")
		username, err := url.PathUnescape(escaped)
		if err != nil {
			writeWildDuckFailure(w, http.StatusBadRequest, err.Error())
			return
		}
		userID, ok := m.users[username]
		if !ok {
			writeWildDuckFailure(w, http.StatusNotFound, "user not found")
			return
		}
		writeWildDuckSuccess(w, map[string]string{"id": userID})
	case r.Method == http.MethodGet && strings.HasPrefix(r.URL.EscapedPath(), "/addresses/resolve/"):
		escaped := strings.TrimPrefix(r.URL.EscapedPath(), "/addresses/resolve/")
		address, err := url.PathUnescape(escaped)
		if err != nil {
			writeWildDuckFailure(w, http.StatusBadRequest, err.Error())
			return
		}
		userID, ok := m.addresses[address]
		if !ok {
			writeWildDuckFailure(w, http.StatusNotFound, "address not found")
			return
		}
		writeWildDuckSuccess(w, map[string]string{"user": userID})
	case r.Method == http.MethodPost && r.URL.Path == "/users":
		var body struct {
			Username     string `json:"username"`
			Address      string `json:"address"`
			EmptyAddress bool   `json:"emptyAddress"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeWildDuckFailure(w, http.StatusBadRequest, err.Error())
			return
		}
		if body.Username == "" {
			writeWildDuckFailure(w, http.StatusBadRequest, "missing username")
			return
		}
		if body.Address == "" && !body.EmptyAddress {
			writeWildDuckFailure(w, http.StatusBadRequest, "missing address")
			return
		}
		m.users[body.Username] = m.userID
		if body.Address != "" {
			m.addresses[body.Address] = m.userID
		}
		writeWildDuckSuccess(w, map[string]string{"id": m.userID})
	case r.Method == http.MethodPut && r.URL.Path == "/users/user-1":
		writeWildDuckSuccess(w, map[string]string{"updated": "true"})
	case r.Method == http.MethodPost && r.URL.Path == "/users/user-1/addresses":
		var body struct {
			Address string `json:"address"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeWildDuckFailure(w, http.StatusBadRequest, err.Error())
			return
		}
		if body.Address == "" {
			writeWildDuckFailure(w, http.StatusBadRequest, "missing address")
			return
		}
		m.addresses[body.Address] = m.userID
		writeWildDuckSuccess(w, map[string]string{"id": "address-1"})
	default:
		writeWildDuckFailure(w, http.StatusNotFound, r.Method+" "+r.URL.String())
	}
}

func writeWildDuckSuccess(w http.ResponseWriter, result any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(result)
}

func writeWildDuckFailure(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"error": message,
		"code":  http.StatusText(status),
	})
}
