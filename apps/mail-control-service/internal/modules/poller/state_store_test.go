package poller

import (
	"errors"
	"strings"
	"testing"
)

func TestPersistedPollerLastErrorRedactsSensitiveMaterial(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		want      []string
		forbidden []string
	}{
		{
			name:  "signed URL query strings",
			input: "GET https://r2.example.test/archive/raw.eml?X-Amz-Signature=example-signature&token=example-token#frag",
			want:  []string{"https://r2.example.test/archive/raw.eml"},
			forbidden: []string{
				"example-signature",
				"example-token",
				"?",
				"#frag",
			},
		},
		{
			name:  "bearer cookie and authorization text",
			input: "Authorization: Bearer example-bearer Cookie: session=example-cookie authorization=basic-secret",
			want:  []string{"authorization=[redacted]", "cookie=[redacted]"},
			forbidden: []string{
				"example-bearer",
				"example-cookie",
				"basic-secret",
			},
		},
		{
			name:  "archive keys and mailbox addresses",
			input: "mailbox=agent.one@example.com raw_key=orgs/org_pub_123/domains/example.com/mail/inbound/2026/07/05/raw.eml",
			want:  []string{"[email]", "[archive_key]"},
			forbidden: []string{
				"agent.one@example.com",
				"orgs/org_pub_123",
			},
		},
		{
			name:  "access and secret keys",
			input: "access_key_id=AKIA1234567890ABCDEF secret_access_key=secret-secret-secret",
			want:  []string{"access_key_id=[redacted]", "secret_access_key=[redacted]"},
			forbidden: []string{
				"AKIA1234567890ABCDEF",
				"secret-secret-secret",
			},
		},
		{
			name: "standalone token-shaped strings",
			input: strings.Join([]string{
				"provider returned",
				"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZ2VudCIsImlhdCI6MTIzfQ.TJVA95OrM7E2cBab30RMHrHDcEfxjoYZgeFONFh7HgQ",
				"sk-proj-abcdefghijklmnopqrstuvwxyz123456",
				"_secret_oauth_access_raw-token",
			}, " "),
			want: []string{"[token]"},
			forbidden: []string{
				"eyJhbGciOiJIUzI1NiJ9",
				"sk-proj-abcdefghijklmnopqrstuvwxyz123456",
				"_secret_oauth_access_raw-token",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := persistedPollerLastError(errors.New(tt.input))
			for _, want := range tt.want {
				if !strings.Contains(got, want) {
					t.Fatalf("persisted last_error missing %q: %s", want, got)
				}
			}
			for _, forbidden := range tt.forbidden {
				if strings.Contains(got, forbidden) {
					t.Fatalf("persisted last_error exposed %q: %s", forbidden, got)
				}
			}
		})
	}
}
