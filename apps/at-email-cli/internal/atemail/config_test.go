package atemail

import (
	"strings"
	"testing"
)

func TestLoadConfigUsesATEmailNames(t *testing.T) {
	cfg, err := loadConfig([]string{
		"AT_EMAIL_WILDDUCK_API_BASE_URL=https://wildduck.example",
		"AT_EMAIL_WILDDUCK_ACCESS_TOKEN=token-1",
		"AT_EMAIL_WILDDUCK_USER_ID=user-1",
		"AT_EMAIL_MAILBOX_ADDRESS=agent@example.com",
		"AT_EMAIL_CONTROL_API_BASE_URL=https://control.example",
		"AT_EMAIL_MESSAGE_READ_TOKEN=read-token",
		"MATRIX_USER_ID=@qa-agent:example.com",
	})
	if err != nil {
		t.Fatalf("loadConfig returned error: %v", err)
	}
	if cfg.APIBaseURL != "https://wildduck.example" {
		t.Fatalf("APIBaseURL = %q", cfg.APIBaseURL)
	}
	if cfg.AccessToken != "token-1" {
		t.Fatalf("AccessToken = %q", cfg.AccessToken)
	}
	if cfg.MessageReadToken != "read-token" {
		t.Fatalf("MessageReadToken = %q", cfg.MessageReadToken)
	}
	if len(cfg.InternalIdentityTerms) == 0 {
		t.Fatalf("expected identity terms")
	}
}

func TestLoadConfigIgnoresLegacyAgentMailNames(t *testing.T) {
	_, err := loadConfig([]string{
		"AGENT_MAIL_WILDDUCK_API_BASE_URL=https://wildduck.example",
		"AGENT_MAIL_WILDDUCK_ACCESS_TOKEN=legacy-token",
		"AGENT_MAIL_WILDDUCK_USER_ID=user-1",
		"AGENT_MAIL_MAILBOX_ADDRESS=agent@example.com",
		"AGENT_MAIL_CONTROL_API_BASE_URL=https://control.example",
		"AGENT_MAIL_MESSAGE_READ_TOKEN=legacy-read-token",
	})
	if err == nil {
		t.Fatal("expected missing AT_EMAIL env error")
	}
	want := "missing required runtime environment: AT_EMAIL_WILDDUCK_API_BASE_URL, AT_EMAIL_WILDDUCK_ACCESS_TOKEN, AT_EMAIL_WILDDUCK_USER_ID"
	if err.Error() != want {
		t.Fatalf("error = %q, want %q", err.Error(), want)
	}
}

func TestLoadConfigReportsPrimaryATEEmailNames(t *testing.T) {
	_, err := loadConfig(nil)
	if err == nil {
		t.Fatal("expected missing env error")
	}
	want := "missing required runtime environment: AT_EMAIL_WILDDUCK_API_BASE_URL, AT_EMAIL_WILDDUCK_ACCESS_TOKEN, AT_EMAIL_WILDDUCK_USER_ID"
	if err.Error() != want {
		t.Fatalf("error = %q, want %q", err.Error(), want)
	}
}

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
