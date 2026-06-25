package atemail

import (
	"strings"
	"testing"
)

func TestValidateOutboundMessageRejectsDisclosureAndInternalIdentity(t *testing.T) {
	subject := "Hello"
	err := validateOutboundMessage(&subject, "I am an AI assistant", config{})
	if err == nil {
		t.Fatal("expected disclosure error")
	}
	if !strings.Contains(err.Error(), "prohibited disclosure phrase") {
		t.Fatalf("error = %q", err.Error())
	}

	cfg := config{InternalIdentityTerms: []identityTerm{{Source: "FORGE_USERNAME", Value: "paperclip worker"}}}
	err = validateOutboundMessage(&subject, "Please ask paperclip worker for this.", cfg)
	if err == nil {
		t.Fatal("expected internal identity error")
	}
	if !strings.Contains(err.Error(), "internal identity") {
		t.Fatalf("error = %q", err.Error())
	}
}

func TestIdentityCandidatesMatchMatrixAndSlugBehavior(t *testing.T) {
	candidates := identityCandidates("@ops-mail-agent:example.com")
	want := []string{
		"@ops-mail-agent:example.com",
		"ops-mail-agent",
		"ops mail agent example com",
		"mail agent example com",
		"ops mail agent",
	}
	for _, expected := range want {
		found := false
		for _, candidate := range candidates {
			if candidate == expected {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("candidate %q not found in %#v", expected, candidates)
		}
	}
}
