package cloudflaremail

import (
	"encoding/json"
	"testing"
)

func TestBuildRawPayloadUsesSendRawShape(t *testing.T) {
	payload, err := BuildRawPayload(RawSendRequest{
		From:        "bounces@example.com",
		Recipients:  []string{"sender@example.net"},
		MIMEMessage: []byte("From: bounces@example.com\r\nTo: sender@example.net\r\n\r\nbody"),
	})
	if err != nil {
		t.Fatalf("BuildRawPayload returned error: %v", err)
	}

	var decoded struct {
		From        string   `json:"from"`
		Recipients  []string `json:"recipients"`
		MIMEMessage string   `json:"mime_message"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatalf("decode payload: %v", err)
	}
	if decoded.From != "bounces@example.com" {
		t.Fatalf("from = %q", decoded.From)
	}
	if len(decoded.Recipients) != 1 || decoded.Recipients[0] != "sender@example.net" {
		t.Fatalf("unexpected recipients: %#v", decoded.Recipients)
	}
	if decoded.MIMEMessage == "" {
		t.Fatal("missing mime_message")
	}
}
