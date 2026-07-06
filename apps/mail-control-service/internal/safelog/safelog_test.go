package safelog

import (
	"strings"
	"testing"
)

func TestTextRedactsSensitiveLogMaterial(t *testing.T) {
	input := strings.Join([]string{
		"GET https://r2.example.test/archive/raw.eml?X-Amz-Signature=example-signature&token=example-token#frag",
		"Authorization: Bearer example-bearer",
		"Cookie: session=example-cookie",
		"access_key_id=example-access-key",
		"secret_access_key=example-secret-key",
		`{"api_key":"example-json-api-key","x-access-token":"example-json-token"}`,
		"agent.one@example.com",
		"orgs/org_pub_123/domains/example.com/mail/inbound/2026/07/05/018f0000-0000-7000-8000-000000000000/raw.eml",
	}, " ")

	output := Text(input)

	for _, want := range []string{
		"https://r2.example.test/archive/raw.eml",
		"authorization=[redacted]",
		"cookie=[redacted]",
		"access_key_id=[redacted]",
		"secret_access_key=[redacted]",
		`"api_key":"[redacted]"`,
		`"x-access-token":"[redacted]"`,
		"[email]",
		"[archive_key]",
	} {
		if !strings.Contains(output, want) {
			t.Fatalf("redacted output missing %q: %s", want, output)
		}
	}
	for _, forbidden := range []string{
		"X-Amz-Signature",
		"example-signature",
		"example-token",
		"example-bearer",
		"example-cookie",
		"example-access-key",
		"example-secret-key",
		"example-json-api-key",
		"example-json-token",
		"agent.one@example.com",
		"orgs/org_pub_123",
		"?",
		"#frag",
	} {
		if strings.Contains(output, forbidden) {
			t.Fatalf("redacted output exposed %q: %s", forbidden, output)
		}
	}
}

func TestIssueRedactsErrorDetail(t *testing.T) {
	output := Issue("queue_status_failed", errString(
		`GET https://r2.example.test/archive?token=example-token Authorization: Bearer example-bearer `+
			`mailbox=agent.one@example.com raw_key=orgs/org_pub_123/domains/example.com/mail/outbound/2026/07/05/raw.eml`,
	))

	for _, want := range []string{"queue_status_failed: ", "[email]", "[archive_key]"} {
		if !strings.Contains(output, want) {
			t.Fatalf("issue missing %q: %s", want, output)
		}
	}
	for _, forbidden := range []string{"example-token", "example-bearer", "agent.one@example.com", "orgs/org_pub_123", "?"} {
		if strings.Contains(output, forbidden) {
			t.Fatalf("issue exposed %q: %s", forbidden, output)
		}
	}
}

func TestTextRedactsStandaloneTokenShapedValues(t *testing.T) {
	output := Text(strings.Join([]string{
		"provider returned",
		"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZ2VudCIsImlhdCI6MTIzfQ.TJVA95OrM7E2cBab30RMHrHDcEfxjoYZgeFONFh7HgQ",
		"sk-proj-abcdefghijklmnopqrstuvwxyz123456",
		"_secret_oauth_access_raw-token",
	}, " "))

	if !strings.Contains(output, "[token]") {
		t.Fatalf("redacted output missing token marker: %s", output)
	}
	for _, forbidden := range []string{
		"eyJhbGciOiJIUzI1NiJ9",
		"sk-proj-abcdefghijklmnopqrstuvwxyz123456",
		"_secret_oauth_access_raw-token",
	} {
		if strings.Contains(output, forbidden) {
			t.Fatalf("redacted output exposed %q: %s", forbidden, output)
		}
	}
}

type errString string

func (e errString) Error() string {
	return string(e)
}
