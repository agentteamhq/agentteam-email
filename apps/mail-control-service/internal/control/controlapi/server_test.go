package controlapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"mail-control-service/internal/archive/r2archive"
	"mail-control-service/internal/control/controlstate"
	"mail-control-service/internal/control/messageprovenance"
	"mail-control-service/internal/modules/poller"
	"mail-control-service/internal/registry/domainregistry"
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

func TestStatusRPCReturnsProjectedDomainStatus(t *testing.T) {
	server := newTestServer(t)
	body := bytes.NewBufferString(`{"jsonrpc":"2.0","id":"request-1","method":"agentMail.status.get","params":{"include_source_files":true}}`)
	request := httptest.NewRequest(http.MethodPost, "/rpc/agentMail.status.get", body)
	request.Header.Set("Content-Type", "application/json")
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

func postControlRPC(t *testing.T, server *Server, path string, body string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(http.MethodPost, path, bytes.NewBufferString(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, request)
	return response
}

func newTestServer(t *testing.T) *Server {
	t.Helper()
	return newTestServerWithOptions(t)
}

func newTestServerWithOptions(t *testing.T, options ...Option) *Server {
	t.Helper()
	source := []byte("Message-ID: <default@example.net>\r\nX-ATM-Ingest-ID: default-ingest\r\n\r\nbody")
	provenance, err := messageprovenance.New(&fakeMessageSourceFetcher{source: source})
	if err != nil {
		t.Fatalf("messageprovenance.New: %v", err)
	}
	return newTestServerWithProvenanceAndOptions(t, provenance, options...)
}

func newTestServerWithProvenance(t *testing.T, provenance MessageProvenanceProvider) *Server {
	t.Helper()
	return newTestServerWithProvenanceAndOptions(t, provenance)
}

func newTestServerWithProvenanceAndOptions(t *testing.T, provenance MessageProvenanceProvider, options ...Option) *Server {
	t.Helper()
	server, err := New(Config{
		ListenAddress: "127.0.0.1:0",
	}, fakeStatusProvider{snapshot: domainregistry.Snapshot{
		OK:               true,
		Status:           "ready",
		SelectedProvider: "ses",
		ControlState: domainregistry.ControlStateStatus{
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
	}}, provenance, options...)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return server
}
