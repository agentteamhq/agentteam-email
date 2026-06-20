package rfc822

import (
	"os"
	"strings"
	"testing"
)

func TestParseProvenanceHeadersExtractsAllowlistedHeaders(t *testing.T) {
	t.Parallel()

	raw := []byte(strings.Join([]string{
		"From: Sender <sender@example.net>",
		"To: Agent <agent@example.com>",
		"Subject: Provenance",
		"Message-ID: <trace-message@example.net>",
		"x-atm-ingest-id: 018f1f77-40e0-7cc3-98f5-5b03f9f13f40",
		"X-ATMCF-Edge-Envelope-From: sender@example.net",
		"X-ATMCF-Edge-Envelope-To: agent@example.com",
		"X-ATMCF-Edge-Message-ID: <edge-trace@example.net>",
		"X-ATMCF-Edge-Status: received",
		"X-Private-Token: must-not-leak",
		"X-ATMCF-Other: must-not-leak",
		"",
		"body",
	}, "\r\n"))

	parsed, err := ParseProvenanceHeaders(raw)
	if err != nil {
		t.Fatalf("ParseProvenanceHeaders returned error: %v", err)
	}
	if parsed.IngestID != "018f1f77-40e0-7cc3-98f5-5b03f9f13f40" {
		t.Fatalf("IngestID = %q", parsed.IngestID)
	}
	if parsed.MessageID != "trace-message@example.net" {
		t.Fatalf("MessageID = %q", parsed.MessageID)
	}
	if parsed.Headers[MessageIDHeader] != "<trace-message@example.net>" {
		t.Fatalf("Message-ID header = %q", parsed.Headers[MessageIDHeader])
	}
	if parsed.Headers[IngestIDHeader] != "018f1f77-40e0-7cc3-98f5-5b03f9f13f40" {
		t.Fatalf("X-ATM-Ingest-ID header = %q", parsed.Headers[IngestIDHeader])
	}
	for _, key := range []string{
		"X-ATMCF-Edge-Envelope-From",
		"X-ATMCF-Edge-Envelope-To",
		"X-ATMCF-Edge-Message-ID",
		"X-ATMCF-Edge-Status",
	} {
		if strings.TrimSpace(parsed.Cloudflare[key]) == "" {
			t.Fatalf("missing Cloudflare provenance header %s in %#v", key, parsed.Cloudflare)
		}
		if parsed.Headers[key] != parsed.Cloudflare[key] {
			t.Fatalf("headers[%s] = %q, cloudflare = %q", key, parsed.Headers[key], parsed.Cloudflare[key])
		}
	}
	for _, forbidden := range []string{"X-Private-Token", "X-ATMCF-Other"} {
		if _, ok := parsed.Headers[forbidden]; ok {
			t.Fatalf("forbidden header %s leaked into %#v", forbidden, parsed.Headers)
		}
	}
}

func TestParseProvenanceHeadersHandlesFoldedHeaderValues(t *testing.T) {
	t.Parallel()

	raw := []byte(strings.Join([]string{
		"X-ATM-Ingest-ID: 018f1f77-40e0-7cc3-98f5-5b03f9f13f40",
		"X-ATMCF-Edge-Envelope-From: sender",
		" .example.net",
		"",
		"body",
	}, "\r\n"))

	parsed, err := ParseProvenanceHeaders(raw)
	if err != nil {
		t.Fatalf("ParseProvenanceHeaders returned error: %v", err)
	}
	if got := parsed.Cloudflare["X-ATMCF-Edge-Envelope-From"]; got != "sender .example.net" {
		t.Fatalf("folded header = %q", got)
	}
}

func TestProvenanceParserDoesNotUseRegex(t *testing.T) {
	t.Parallel()

	data, err := os.ReadFile("provenance.go")
	if err != nil {
		t.Fatalf("read provenance.go: %v", err)
	}
	source := string(data)
	for _, forbidden := range []string{"regexp.", "MustCompile", "Compile("} {
		if strings.Contains(source, forbidden) {
			t.Fatalf("provenance parser must not use regex/manual header extraction token %q", forbidden)
		}
	}
}
