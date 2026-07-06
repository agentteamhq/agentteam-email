package controlapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log"
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
	err      error
}

func (p fakeStatusProvider) Snapshot(now time.Time) (domainregistry.Snapshot, error) {
	if p.err != nil {
		return domainregistry.Snapshot{}, p.err
	}
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

	logOutput := captureLogs(t, func() {
		server.Handler().ServeHTTP(response, request)
	})

	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("response.Code = %d, want %d", response.Code, http.StatusUnprocessableEntity)
	}
	assertGenericControlAPIResponse(t, response.Body.String(),
		"agentMail.status.get",
		"agentMail.status.unknown",
		"method must be",
		"expected",
	)
	for _, want := range []string{
		"event=rpc_method_validation_failed",
		"rpc_method=agentMail.status.get",
		"rpc_id=request-1",
		"status=422",
		"received_method=\"agentMail.status.unknown\"",
	} {
		if !strings.Contains(logOutput, want) {
			t.Fatalf("log missing %q: %s", want, logOutput)
		}
	}
}

func TestControlAPIRPCEnvelopeValidationReturnsGenericPublicErrors(t *testing.T) {
	server := newTestServer(t)
	invalidMethodIngestBody := validIngestRPCBody(t, "ingest-1", "agentMail.ingest.expected", poller.IngestNotificationSchema)
	cases := []struct {
		name       string
		path       string
		body       string
		wantLog    string
		forbidden  []string
		wantStatus int
	}{
		{
			name:       "runtime method",
			path:       "/rpc/agentMail.runtime.sync",
			body:       `{"jsonrpc":"2.0","id":"runtime-1","method":"agentMail.runtime.expected","params":{"domains":[]}}`,
			wantLog:    "rpc_method_validation_failed",
			forbidden:  []string{"agentMail.runtime.sync", "agentMail.runtime.expected", "method must be", "expected"},
			wantStatus: http.StatusUnprocessableEntity,
		},
		{
			name:       "ingest method",
			path:       "/rpc/agentMail.ingest.enqueue",
			body:       invalidMethodIngestBody,
			wantLog:    "rpc_method_validation_failed",
			forbidden:  []string{"agentMail.ingest.enqueue", "agentMail.ingest.expected", "method must be", "expected"},
			wantStatus: http.StatusUnprocessableEntity,
		},
		{
			name:       "worker credentials method",
			path:       "/rpc/agentMail.worker.archiveCredentials.issue",
			body:       `{"jsonrpc":"2.0","id":"worker-1","method":"agentMail.worker.expected","params":{"organization_id":"org-1","organization_public_id":"org_pub_123","domain":"example.com","archive_prefix":"orgs/org_pub_123/domains/example.com/mail/inbound","worker_connection_id":"worker-connection-1","worker_domain_deployment_id":"worker-deployment-1"}}`,
			wantLog:    "rpc_method_validation_failed",
			forbidden:  []string{"agentMail.worker.archiveCredentials.issue", "agentMail.worker.expected", "method must be", "expected"},
			wantStatus: http.StatusUnprocessableEntity,
		},
		{
			name:       "send method",
			path:       "/rpc/agentMail.send.submit",
			body:       `{"jsonrpc":"2.0","id":"send-1","method":"agentMail.send.expected","params":{"idempotency_key":"send-1","domain":"example.com","from":"agent@example.com","to":"recipient@example.net","raw":"Subject: Test\r\n\r\nBody"}}`,
			wantLog:    "rpc_method_validation_failed",
			forbidden:  []string{"agentMail.send.submit", "agentMail.send.expected", "method must be", "expected"},
			wantStatus: http.StatusUnprocessableEntity,
		},
		{
			name:       "message provenance method",
			path:       "/rpc/agentMail.message.provenance.get",
			body:       `{"jsonrpc":"2.0","id":"provenance-1","method":"agentMail.message.provenance.expected","params":{"wildDuckUserId":"user-1","wildDuckMailboxId":"mailbox-1","wildDuckUid":324}}`,
			wantLog:    "rpc_method_validation_failed",
			forbidden:  []string{"agentMail.message.provenance.get", "agentMail.message.provenance.expected", "method must be", "expected"},
			wantStatus: http.StatusUnprocessableEntity,
		},
		{
			name:       "message view method",
			path:       "/rpc/agentMail.message.view.get",
			body:       `{"jsonrpc":"2.0","id":"view-1","method":"agentMail.message.view.expected","params":{"wildDuckUserId":"user-1","wildDuckMailboxId":"mailbox-1","wildDuckUid":324}}`,
			wantLog:    "rpc_method_validation_failed",
			forbidden:  []string{"agentMail.message.view.get", "agentMail.message.view.expected", "method must be", "expected"},
			wantStatus: http.StatusUnprocessableEntity,
		},
		{
			name:       "message security method",
			path:       "/rpc/agentMail.message.security.get",
			body:       `{"jsonrpc":"2.0","id":"security-1","method":"agentMail.message.security.expected","params":{"wildDuckUserId":"user-1","wildDuckMailboxId":"mailbox-1","wildDuckUid":324}}`,
			wantLog:    "rpc_method_validation_failed",
			forbidden:  []string{"agentMail.message.security.get", "agentMail.message.security.expected", "method must be", "expected"},
			wantStatus: http.StatusUnprocessableEntity,
		},
		{
			name:       "jsonrpc version",
			path:       "/rpc/agentMail.status.get",
			body:       `{"jsonrpc":"2.1","id":"status-1","method":"agentMail.status.get","params":{}}`,
			wantLog:    "rpc_envelope_validation_failed",
			forbidden:  []string{"jsonrpc must be", "2.0", "2.1", "expected"},
			wantStatus: http.StatusUnprocessableEntity,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var response *httptest.ResponseRecorder
			logOutput := captureLogs(t, func() {
				response = postControlRPC(t, server, tc.path, tc.body)
			})
			if response.Code != tc.wantStatus {
				t.Fatalf("response.Code = %d, want %d, body=%s", response.Code, tc.wantStatus, response.Body.String())
			}
			assertGenericControlAPIResponse(t, response.Body.String(), tc.forbidden...)
			if !strings.Contains(logOutput, tc.wantLog) {
				t.Fatalf("log missing %q: %s", tc.wantLog, logOutput)
			}
		})
	}
}

func TestControlAPIErrorResponseIsGenericAndDiagnosticsAreLogged(t *testing.T) {
	server, err := New(Config{ListenAddress: "127.0.0.1:0"}, fakeStatusProvider{
		err: errors.New(
			`status failed for agent.one@example.com raw_key=orgs/org_pub_123/domains/example.com/mail/inbound/2026/07/05/018f0000-0000-7000-8000-000000000000/raw.eml ` +
				`url=https://r2.example.test/archive?token=example-token access_key_id=example-access-key secret_access_key=example-secret-key`,
		),
	}, mustTestProvenance(t))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	body := bytes.NewBufferString(`{"jsonrpc":"2.0","id":"request-1","method":"agentMail.status.get","params":{}}`)
	request := httptest.NewRequest(http.MethodPost, "/rpc/agentMail.status.get", body)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	logOutput := captureLogs(t, func() {
		server.Handler().ServeHTTP(response, request)
	})

	if response.Code != http.StatusInternalServerError {
		t.Fatalf("response.Code = %d, want %d, body=%s", response.Code, http.StatusInternalServerError, response.Body.String())
	}
	responseBody := response.Body.String()
	if !strings.Contains(responseBody, publicControlAPIErrorMessage) {
		t.Fatalf("response missing generic public message: %s", responseBody)
	}
	for _, forbidden := range []string{
		"build status snapshot",
		"status failed",
		"[email]",
		"[archive_key]",
		"agent.one@example.com",
		"orgs/org_pub_123",
		"example-token",
		"example-access-key",
		"example-secret-key",
		"?",
	} {
		if strings.Contains(responseBody, forbidden) {
			t.Fatalf("response exposed %q: %s", forbidden, responseBody)
		}
	}
	for _, want := range []string{"event=status_snapshot_failed", "rpc_method=agentMail.status.get", "rpc_id=request-1", "[email]", "[archive_key]"} {
		if !strings.Contains(logOutput, want) {
			t.Fatalf("log missing %q: %s", want, logOutput)
		}
	}
	for _, forbidden := range []string{
		"agent.one@example.com",
		"orgs/org_pub_123",
		"example-token",
		"example-access-key",
		"example-secret-key",
		"?",
	} {
		if strings.Contains(logOutput, forbidden) {
			t.Fatalf("log exposed %q: %s", forbidden, logOutput)
		}
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

func TestHandlerLogsRequestActivityWithoutQueryOrHeaders(t *testing.T) {
	server := newTestServer(t)
	logOutput := captureLogs(t, func() {
		request := httptest.NewRequest(http.MethodGet, "/healthz?debug_value=example-placeholder", nil)
		request.Header.Set("Authorization", "Bearer example-placeholder")
		response := httptest.NewRecorder()

		server.Handler().ServeHTTP(response, request)

		if response.Code != http.StatusOK {
			t.Fatalf("response.Code = %d, want %d", response.Code, http.StatusOK)
		}
	})

	for _, want := range []string{
		"event=http_request",
		"method=GET",
		`path="/healthz"`,
		"status=200",
		"duration_ms=",
	} {
		if !strings.Contains(logOutput, want) {
			t.Fatalf("request log missing %q: %s", want, logOutput)
		}
	}
	for _, forbidden := range []string{"debug_value", "example-placeholder", "Authorization"} {
		if strings.Contains(logOutput, forbidden) {
			t.Fatalf("request log exposed %q: %s", forbidden, logOutput)
		}
	}
}

func TestRequestLogMiddlewareRecoversPanicWithSanitizedLog(t *testing.T) {
	handler := requestLogMiddleware("agent-mail-control-api", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		panic("failed for Agent.One+tag@example.com\nwith details")
	}))
	logOutput := captureLogs(t, func() {
		request := httptest.NewRequest(http.MethodGet, "/panic", nil)
		response := httptest.NewRecorder()

		handler.ServeHTTP(response, request)

		if response.Code != http.StatusInternalServerError {
			t.Fatalf("response.Code = %d, want %d", response.Code, http.StatusInternalServerError)
		}
	})

	if !strings.Contains(logOutput, "event=http_panic") {
		t.Fatalf("panic log missing: %s", logOutput)
	}
	if !strings.Contains(logOutput, "event=http_request_error") {
		t.Fatalf("request error log missing: %s", logOutput)
	}
	if strings.Contains(logOutput, "Agent.One+tag@example.com") {
		t.Fatalf("panic log exposed email address: %s", logOutput)
	}
	if !strings.Contains(logOutput, "[email]") {
		t.Fatalf("panic log did not include redaction marker: %s", logOutput)
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

func TestControlAPIUnavailableModulesReturnGenericPublicErrors(t *testing.T) {
	server := newTestServer(t)
	validIngestBody := validIngestRPCBody(t, "ingest-1", ingestEnqueueMethod, poller.IngestNotificationSchema)
	cases := []struct {
		name       string
		path       string
		body       string
		wantStatus int
		wantLog    string
		forbidden  []string
	}{
		{
			name:       "runtime sync",
			path:       "/rpc/agentMail.runtime.sync",
			body:       `{"jsonrpc":"2.0","id":"runtime-1","method":"agentMail.runtime.sync","params":{"domains":[]}}`,
			wantStatus: http.StatusServiceUnavailable,
			wantLog:    "event=runtime_sync_unavailable",
			forbidden:  []string{"runtime sync is not configured"},
		},
		{
			name:       "ingest enqueue",
			path:       "/rpc/agentMail.ingest.enqueue",
			body:       validIngestBody,
			wantStatus: http.StatusServiceUnavailable,
			wantLog:    "event=ingest_enqueue_unavailable",
			forbidden:  []string{"ingest enqueue is not configured"},
		},
		{
			name:       "worker archive credentials",
			path:       "/rpc/agentMail.worker.archiveCredentials.issue",
			body:       `{"jsonrpc":"2.0","id":"worker-creds-1","method":"agentMail.worker.archiveCredentials.issue","params":{"organization_id":"org-1","organization_public_id":"org_pub_123","domain":"example.com","archive_prefix":"orgs/org_pub_123/domains/example.com/mail/inbound","worker_connection_id":"worker-connection-1","worker_domain_deployment_id":"worker-deployment-1"}}`,
			wantStatus: http.StatusServiceUnavailable,
			wantLog:    "event=worker_archive_credentials_unavailable",
			forbidden:  []string{"worker archive credential issuer is not configured", "orgs/org_pub_123", "worker-connection-1"},
		},
		{
			name:       "send submit",
			path:       "/rpc/agentMail.send.submit",
			body:       `{"jsonrpc":"2.0","id":"send-1","method":"agentMail.send.submit","params":{"idempotency_key":"send-1","domain":"example.com","from":"agent@example.com","to":"recipient@example.net","raw":"Subject: Test\r\n\r\nBody"}}`,
			wantStatus: http.StatusNotImplemented,
			wantLog:    "event=send_submit_unimplemented",
			forbidden:  []string{"send submit is not configured", "agent@example.com", "recipient@example.net", "Subject: Test"},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var response *httptest.ResponseRecorder
			logOutput := captureLogs(t, func() {
				response = postControlRPC(t, server, tc.path, tc.body)
			})
			if response.Code != tc.wantStatus {
				t.Fatalf("response.Code = %d, want %d, body=%s", response.Code, tc.wantStatus, response.Body.String())
			}
			assertGenericControlAPIResponse(t, response.Body.String(), tc.forbidden...)
			for _, want := range []string{tc.wantLog, "error=\"control module unavailable\""} {
				if !strings.Contains(logOutput, want) {
					t.Fatalf("log missing %q: %s", want, logOutput)
				}
			}
		})
	}
}

func TestIngestEnqueueRPCReportsGenericValidationFailureAndLogsReason(t *testing.T) {
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

	var response *httptest.ResponseRecorder
	logOutput := captureLogs(t, func() {
		response = postControlRPC(t, server, "/rpc/agentMail.ingest.enqueue", body)
	})
	if response.Code != http.StatusBadRequest {
		t.Fatalf("response.Code = %d, want %d, body=%s", response.Code, http.StatusBadRequest, response.Body.String())
	}
	responseBody := response.Body.String()
	if !strings.Contains(responseBody, publicControlAPIErrorMessage) {
		t.Fatalf("response missing generic public message: %s", responseBody)
	}
	for _, forbidden := range []string{
		"enqueue verified ingest notification",
		"organization_id does not match active domain",
		"worker-secret-key",
		"session-token",
	} {
		if strings.Contains(responseBody, forbidden) {
			t.Fatalf("response exposed %q: %s", forbidden, responseBody)
		}
	}
	for _, want := range []string{"event=ingest_enqueue_rejected", "organization_id does not match active domain", "ingest_id=", "recipient_domain=\"example.com\""} {
		if !strings.Contains(logOutput, want) {
			t.Fatalf("log missing %q: %s", want, logOutput)
		}
	}
}

func TestIngestEnqueueRPCSchemaMismatchReturnsGenericPublicError(t *testing.T) {
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
		"id":"ingest-schema-1",
		"method":"agentMail.ingest.enqueue",
		"params":{
			"schema":"agent-mail.inbound.unexpected.v1",
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

	var response *httptest.ResponseRecorder
	logOutput := captureLogs(t, func() {
		response = postControlRPC(t, server, "/rpc/agentMail.ingest.enqueue", body)
	})
	if response.Code != http.StatusBadRequest {
		t.Fatalf("response.Code = %d, want %d, body=%s", response.Code, http.StatusBadRequest, response.Body.String())
	}
	assertGenericControlAPIResponse(t, response.Body.String(),
		"agent-mail.inbound.ingest.v1",
		"agent-mail.inbound.unexpected.v1",
		"does not match",
	)
	for _, want := range []string{"event=ingest_enqueue_rejected", "schema", "ingest_id=", "status=400"} {
		if !strings.Contains(logOutput, want) {
			t.Fatalf("log missing %q: %s", want, logOutput)
		}
	}
}

func TestControlAPIPreHandlerValidationErrorIsGeneric(t *testing.T) {
	server := newTestServer(t)
	body := `{"jsonrpc":"2.0","id":"ingest-1","method":"agentMail.ingest.enqueue","params":{}}`

	var response *httptest.ResponseRecorder
	logOutput := captureLogs(t, func() {
		response = postControlRPC(t, server, "/rpc/agentMail.ingest.enqueue", body)
	})
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("response.Code = %d, want %d, body=%s", response.Code, http.StatusUnprocessableEntity, response.Body.String())
	}
	assertGenericControlAPIResponse(t, response.Body.String(),
		"validation failed",
		"expected required property",
		"archive_prefix",
		"worker_connection_id",
		"agent-mail.inbound.ingest.v1",
	)
	for _, want := range []string{"event=rpc_error_response_redacted", "rpc_method=agentMail.ingest.enqueue", "operation_id=\"agentMailIngestEnqueue\"", "status=422"} {
		if !strings.Contains(logOutput, want) {
			t.Fatalf("log missing %q: %s", want, logOutput)
		}
	}
}

func TestIngestEnqueueRPCRedactsLowerLayerErrorFromResponseAndLogs(t *testing.T) {
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
	unsafeErr := errors.New(
		`validate raw_key ` + bundle.RawKey +
			`: GET https://r2.example.test/archive?X-Amz-Signature=example-signature&token=example-token ` +
			`Authorization: Bearer example-bearer Cookie: session=example-cookie mailbox=agent.one@example.com`,
	)
	ingest := &fakeIngestEnqueuer{err: unsafeErr}
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

	var response *httptest.ResponseRecorder
	logOutput := captureLogs(t, func() {
		response = postControlRPC(t, server, "/rpc/agentMail.ingest.enqueue", body)
	})
	if response.Code != http.StatusBadRequest {
		t.Fatalf("response.Code = %d, want %d, body=%s", response.Code, http.StatusBadRequest, response.Body.String())
	}
	responseBody := response.Body.String()
	if !strings.Contains(responseBody, publicControlAPIErrorMessage) {
		t.Fatalf("response missing generic public message: %s", responseBody)
	}
	for _, forbidden := range []string{
		"enqueue verified ingest notification",
		"validate raw_key",
		"[archive_key]",
		"[email]",
		bundle.RawKey,
		"X-Amz-Signature",
		"example-signature",
		"example-token",
		"example-bearer",
		"example-cookie",
		"agent.one@example.com",
		"Authorization",
		"Cookie",
		"?",
	} {
		if strings.Contains(responseBody, forbidden) {
			t.Fatalf("response exposed %q: %s", forbidden, responseBody)
		}
	}
	for _, want := range []string{"event=ingest_enqueue_rejected", "[archive_key]", "[email]", "ingest_id=", "recipient_domain=\"example.com\""} {
		if !strings.Contains(logOutput, want) {
			t.Fatalf("log missing %q: %s", want, logOutput)
		}
	}
	for _, forbidden := range []string{
		bundle.RawKey,
		"X-Amz-Signature",
		"example-signature",
		"example-token",
		"example-bearer",
		"example-cookie",
		"agent.one@example.com",
		"Authorization",
		"Cookie",
		"?",
	} {
		if strings.Contains(logOutput, forbidden) {
			t.Fatalf("log exposed %q: %s", forbidden, logOutput)
		}
	}
	if !strings.Contains(logOutput, "event=ingest_enqueue_rejected") {
		t.Fatalf("log missing ingest rejection event: %s", logOutput)
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

	var response *httptest.ResponseRecorder
	logOutput := captureLogs(t, func() {
		response = postControlRPC(t, server, "/rpc/agentMail.message.provenance.get", body)
	})
	if response.Code != http.StatusBadGateway {
		t.Fatalf("response.Code = %d, want %d, body=%s", response.Code, http.StatusBadGateway, response.Body.String())
	}
	responseBody := response.Body.String()
	if !strings.Contains(responseBody, publicControlAPIErrorMessage) {
		t.Fatalf("response missing generic public message: %s", responseBody)
	}
	if strings.Contains(responseBody, "get message provenance") || strings.Contains(responseBody, "wildduck unavailable") {
		t.Fatalf("response exposed operation detail: %s", responseBody)
	}
	for _, want := range []string{"event=message_provenance_failed", "rpc_method=agentMail.message.provenance.get", "wildduck_user_id=\"user-1\"", "wildduck unavailable"} {
		if !strings.Contains(logOutput, want) {
			t.Fatalf("log missing %q: %s", want, logOutput)
		}
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
	if !strings.Contains(payload.Result.DisplayHTML, `<img src="https://tracker.example/pixel.png"`) {
		t.Fatalf("display HTML missing preserved remote image: %s", payload.Result.DisplayHTML)
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

func validIngestRPCBody(t *testing.T, rpcID string, method string, schema string) string {
	t.Helper()
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
	return `{
		"jsonrpc":"2.0",
		"id":"` + rpcID + `",
		"method":"` + method + `",
		"params":{
			"schema":"` + schema + `",
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
}

func captureLogs(t *testing.T, run func()) string {
	t.Helper()
	var buffer bytes.Buffer
	previousOutput := log.Writer()
	previousFlags := log.Flags()
	log.SetOutput(&buffer)
	log.SetFlags(0)
	t.Cleanup(func() {
		log.SetOutput(previousOutput)
		log.SetFlags(previousFlags)
	})
	run()
	return buffer.String()
}

func assertGenericControlAPIResponse(t *testing.T, responseBody string, forbidden ...string) {
	t.Helper()
	if !strings.Contains(responseBody, publicControlAPIErrorMessage) {
		t.Fatalf("response missing generic public message: %s", responseBody)
	}
	for _, value := range forbidden {
		if strings.Contains(responseBody, value) {
			t.Fatalf("response exposed %q: %s", value, responseBody)
		}
	}
}

func newTestServer(t *testing.T) *Server {
	t.Helper()
	return newTestServerWithOptions(t)
}

func newTestServerWithOptions(t *testing.T, options ...Option) *Server {
	t.Helper()
	return newTestServerWithProvenanceAndOptions(t, mustTestProvenance(t), options...)
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

func mustTestProvenance(t *testing.T) MessageProvenanceProvider {
	t.Helper()
	source := []byte("Message-ID: <default@example.net>\r\nX-ATM-Ingest-ID: default-ingest\r\n\r\nbody")
	provenance, err := messageprovenance.New(&fakeMessageSourceFetcher{source: source})
	if err != nil {
		t.Fatalf("messageprovenance.New: %v", err)
	}
	return provenance
}
