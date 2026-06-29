package structured

import "testing"

func TestCanonicalDomainUsesIDNAAndDNSValidation(t *testing.T) {
	got, err := CanonicalDomain("Exämple.com")
	if err != nil {
		t.Fatalf("CanonicalDomain returned error: %v", err)
	}
	if got != "xn--exmple-cua.com" {
		t.Fatalf("CanonicalDomain = %q", got)
	}

	for _, value := range []string{"example.com.", " example.com", "example..com", "ex_ample.com"} {
		if _, err := CanonicalDomain(value); err == nil {
			t.Fatalf("CanonicalDomain(%q) succeeded", value)
		}
	}
}

func TestParseMailboxReturnsCanonicalAddressAndDomain(t *testing.T) {
	got, err := ParseMailbox("Agent One <Agent.One@Example.com>")
	if err != nil {
		t.Fatalf("ParseMailbox returned error: %v", err)
	}
	if got.Address != "agent.one@example.com" {
		t.Fatalf("Address = %q", got.Address)
	}
	if got.LocalPart != "Agent.One" {
		t.Fatalf("LocalPart = %q", got.LocalPart)
	}
	if got.Domain != "example.com" {
		t.Fatalf("Domain = %q", got.Domain)
	}
}

func TestParseMailboxReturnsIDNAAddressAndDomain(t *testing.T) {
	got, err := ParseMailbox("Agent <agent@Exämple.com>")
	if err != nil {
		t.Fatalf("ParseMailbox returned error: %v", err)
	}
	if got.Address != "agent@xn--exmple-cua.com" {
		t.Fatalf("Address = %q", got.Address)
	}
	if got.LocalPart != "agent" {
		t.Fatalf("LocalPart = %q", got.LocalPart)
	}
	if got.Domain != "xn--exmple-cua.com" {
		t.Fatalf("Domain = %q", got.Domain)
	}
}
