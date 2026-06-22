package atemail

import (
	"strings"
	"testing"
)

func TestResolveMailboxAliasesAndErrors(t *testing.T) {
	mailboxes := []map[string]any{
		{"id": "inbox-1", "path": "INBOX", "specialUse": "\\Inbox"},
		{"id": "archive-1", "name": "Archive", "specialUse": "\\Archive"},
	}
	mailbox, err := resolveMailbox(mailboxes, "archive")
	if err != nil {
		t.Fatalf("resolveMailbox: %v", err)
	}
	if mailbox["id"] != "archive-1" {
		t.Fatalf("mailbox = %#v", mailbox)
	}
	_, err = resolveMailbox(mailboxes, "")
	if err == nil || err.Error() != "folder name must not be empty" {
		t.Fatalf("empty folder error = %v", err)
	}
}

func TestResolveReplyRecipientsDedupesOwnAddress(t *testing.T) {
	message := map[string]any{
		"replyTo": []any{map[string]any{"address": "sender@example.net"}},
		"to": []any{
			map[string]any{"address": "Agent@Example.com"},
			map[string]any{"address": "team@example.net"},
		},
		"cc": []any{"Team <team@example.net>, Other <other@example.net>"},
	}
	recipients, err := resolveReplyRecipients(message, true, "agent@example.com")
	if err != nil {
		t.Fatalf("resolveReplyRecipients: %v", err)
	}
	if len(recipients.To) != 1 || recipients.To[0] != "sender@example.net" {
		t.Fatalf("To = %#v", recipients.To)
	}
	wantCC := []string{"team@example.net", "other@example.net"}
	if len(recipients.Cc) != len(wantCC) {
		t.Fatalf("Cc = %#v", recipients.Cc)
	}
	for i, want := range wantCC {
		if recipients.Cc[i] != want {
			t.Fatalf("Cc[%d] = %q, want %q", i, recipients.Cc[i], want)
		}
	}
}

func TestResolveReplyRecipientsParsesMalformedMixedHeaders(t *testing.T) {
	message := map[string]any{
		"from": "Sender <sender@example.net>",
		"to":   []any{"Broken <bad, Alice <alice@example.com>, Team <team@example.com>"},
		"cc":   []any{"No Address, Bob <bob@example.com>, Alice <alice@example.com>"},
	}
	recipients, err := resolveReplyRecipients(message, true, "agent@example.com")
	if err != nil {
		t.Fatalf("resolveReplyRecipients: %v", err)
	}
	if len(recipients.To) != 1 || recipients.To[0] != "sender@example.net" {
		t.Fatalf("To = %#v", recipients.To)
	}
	wantCC := []string{"alice@example.com", "team@example.com", "bob@example.com"}
	if len(recipients.Cc) != len(wantCC) {
		t.Fatalf("Cc = %#v", recipients.Cc)
	}
	for i, want := range wantCC {
		if recipients.Cc[i] != want {
			t.Fatalf("Cc[%d] = %q, want %q", i, recipients.Cc[i], want)
		}
	}
	for _, address := range recipients.Cc {
		if strings.Contains(address, "<") || strings.Contains(address, "Alice ") {
			t.Fatalf("corrupted address = %q", address)
		}
	}
}
