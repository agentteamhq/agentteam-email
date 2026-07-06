package wildduckprovisioner

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"mail-control-service/internal/control/controlstate"
)

func TestSanitizeLogErrorRedactsMailbox(t *testing.T) {
	got := sanitizeLogError(errors.New("wildduck failed for Agent.One+tag@example.com at https://r2.example.test/archive?token=example-token\nwith details"))

	if strings.Contains(got, "Agent.One") || strings.Contains(got, "\n") || strings.Contains(got, "example-token") || strings.Contains(got, "?") {
		t.Fatalf("sanitized provisioner error retained sensitive or multiline value: %q", got)
	}
	if !strings.Contains(got, "[email]") {
		t.Fatalf("sanitized provisioner error did not include email redaction marker: %q", got)
	}
}

func TestStatusIssuesRedactWildDuckLookupErrors(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		writer.WriteHeader(http.StatusBadGateway)
		_, _ = writer.Write([]byte(`{"error":"` + unsafeWildDuckErrorText() + `","code":"upstream"}`))
	}))
	defer server.Close()
	service := newTestService(t, server.URL)

	status := service.Status(context.Background(), []controlstate.DomainRecord{{
		Domain:          "example.com",
		FeedbackAddress: "Agent.One+tag@example.com",
	}})
	joined := strings.Join(status.Domains[0].Issues, "\n")

	if !strings.Contains(joined, "feedback_address_lookup_failed:") || !strings.Contains(joined, "[email]") {
		t.Fatalf("domain issues were not redacted: %#v", status.Domains[0].Issues)
	}
	assertNoUnsafeWildDuckText(t, joined)
}

func TestEnsureFeedbackRedactsDomainResultErrors(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		switch {
		case request.Method == http.MethodGet && strings.Contains(request.URL.Path, "/primary@example.com"):
			_, _ = writer.Write([]byte(`{"user":"user-id"}`))
		case request.Method == http.MethodPut && request.URL.Path == "/users/user-id":
			_, _ = writer.Write([]byte(`{}`))
		default:
			writer.WriteHeader(http.StatusBadGateway)
			_, _ = writer.Write([]byte(`{"error":"` + unsafeWildDuckErrorText() + `","code":"upstream"}`))
		}
	}))
	defer server.Close()
	service := newTestService(t, server.URL)
	service.cfg.PrimaryUsername = "primary@example.com"

	result, err := service.EnsureFeedback(context.Background(), []controlstate.DomainRecord{{
		Domain:          "example.com",
		FeedbackAddress: "Agent.One+tag@example.com",
	}}, timeNowForTest())
	if err != nil {
		t.Fatalf("EnsureFeedback returned error: %v", err)
	}
	if result.OK || len(result.Domains) != 1 {
		t.Fatalf("result = %#v", result)
	}
	if !strings.Contains(result.Domains[0].Error, "[email]") {
		t.Fatalf("domain error was not redacted: %#v", result.Domains[0])
	}
	assertNoUnsafeWildDuckText(t, result.Domains[0].Error)
}

func newTestService(t *testing.T, apiBaseURL string) *Service {
	t.Helper()
	service, err := New(Config{
		APIBaseURL:      apiBaseURL,
		AdminToken:      "test-admin-token",
		Password:        "feedback-password",
		DisplayName:     "Agent Mail Bounces",
		PrimaryUsername: "primary@example.com",
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return service
}

func unsafeWildDuckErrorText() string {
	return `lookup failed for Agent.One+tag@example.com GET https://r2.example.test/archive?X-Amz-Signature=example-signature&token=example-token Authorization: Bearer example-bearer Cookie: session=example-cookie raw_key=orgs/org_pub_123/domains/example.com/mail/inbound/2026/07/05/raw.eml`
}

func assertNoUnsafeWildDuckText(t *testing.T, value string) {
	t.Helper()
	for _, forbidden := range []string{
		"Agent.One",
		"example-signature",
		"example-token",
		"example-bearer",
		"example-cookie",
		"orgs/org_pub_123",
		"?",
	} {
		if strings.Contains(value, forbidden) {
			t.Fatalf("value exposed %q: %s", forbidden, value)
		}
	}
}

func timeNowForTest() time.Time {
	return time.Time{}
}
