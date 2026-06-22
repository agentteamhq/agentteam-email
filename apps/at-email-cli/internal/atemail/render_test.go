package atemail

import (
	"bytes"
	"testing"
)

func TestRenderMessageListMatchesTableShape(t *testing.T) {
	var out bytes.Buffer
	renderMessageList(&out, []map[string]any{
		{
			"id":      7,
			"seen":    false,
			"date":    "2026-06-20T10:11:12.000Z",
			"from":    map[string]any{"name": "Sender", "address": "sender@example.net"},
			"subject": "This is a fairly long subject that should be truncated before it breaks the table",
		},
	}, "INBOX", false, false, nil)
	want := "" +
		"1 message(s) in INBOX\n" +
		"ID  SEEN  DATE                 FROM                      SUBJECT                                                     \n" +
		"7   no    2026-06-20T10:11:1\u2026  Sender <sender@example.\u2026  This is a fairly long subject that should be truncated befo\u2026\n"
	if out.String() != want {
		t.Fatalf("output:\n%s\nwant:\n%s", out.String(), want)
	}
}

func TestPrintJSONDoesNotEscapeHTML(t *testing.T) {
	var out bytes.Buffer
	if err := printJSON(&out, map[string]any{"html": "<b>safe</b>"}); err != nil {
		t.Fatalf("printJSON: %v", err)
	}
	want := "{\n  \"html\": \"<b>safe</b>\"\n}\n"
	if out.String() != want {
		t.Fatalf("json = %q, want %q", out.String(), want)
	}
}
