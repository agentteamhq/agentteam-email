package dsn

import (
	"bytes"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/emersion/go-message"
)

func TestBuildFailureMessageCreatesMultipartReport(t *testing.T) {
	originalRaw := []byte(strings.Join([]string{
		"From: Sender <sender@example.net>",
		"To: Missing <missing@example.com>",
		"Subject: Original message",
		"Message-ID: <original@example.net>",
		"MIME-Version: 1.0",
		"Content-Type: multipart/alternative; boundary=\"original-boundary\"",
		"",
		"--original-boundary",
		"Content-Type: text/plain; charset=utf-8",
		"",
		"original body",
		"--original-boundary",
		"Content-Type: text/html; charset=utf-8",
		"Content-Transfer-Encoding: quoted-printable",
		"",
		"<p>original body</p>",
		"--original-boundary--",
		"",
	}, "\r\n"))
	raw, err := BuildFailureMessage(FailureMessage{
		DSNID:           "018f1f77-40e0-7cc3-98f5-5b03f9f13f40",
		SourceIngestID:  "018f1f77-40e0-7cc3-98f5-5b03f9f13f41",
		FromAddress:     "Bounces@Example.com",
		ToAddress:       "sender@example.net",
		ReportingDomain: "Example.com",
		FinalRecipient:  "missing@example.com",
		OriginalMessage: originalRaw,
		Status:          "5.1.1",
		DiagnosticCode:  "smtp; 550 5.1.1 No such user",
		ReceivedAt:      time.Date(2026, 5, 20, 12, 0, 0, 0, time.UTC),
		Now:             time.Date(2026, 5, 20, 12, 1, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("BuildFailureMessage returned error: %v", err)
	}
	if raw.MessageID != "<018f1f77-40e0-7cc3-98f5-5b03f9f13f40@example.com>" {
		t.Fatalf("unexpected message id: %q", raw.MessageID)
	}

	entity, err := message.Read(bytes.NewReader(raw.Raw))
	if err != nil {
		t.Fatalf("parse dsn raw: %v", err)
	}
	contentType, params, err := entity.Header.ContentType()
	if err != nil {
		t.Fatalf("parse content type: %v", err)
	}
	if contentType != "multipart/report" || params["report-type"] != "delivery-status" {
		t.Fatalf("unexpected content type %q params %#v", contentType, params)
	}
	if got := entity.Header.Get(InternalDSNIDHeader); got != "018f1f77-40e0-7cc3-98f5-5b03f9f13f40" {
		t.Fatalf("missing dsn id header: %q", got)
	}
	if got := entity.Header.Get("X-Failed-Recipients"); got != "missing@example.com" {
		t.Fatalf("unexpected failed recipient header: %q", got)
	}
	if got := entity.Header.Get("References"); got != "<original@example.net>" {
		t.Fatalf("unexpected References header: %q", got)
	}
	if got := entity.Header.Get("In-Reply-To"); got != "<original@example.net>" {
		t.Fatalf("unexpected In-Reply-To header: %q", got)
	}

	mr := entity.MultipartReader()
	if mr == nil {
		t.Fatal("expected multipart reader")
	}
	var plainBody string
	var htmlBody string
	var deliveryStatusBody string
	var originalMessage []byte
	for {
		part, err := mr.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatalf("read multipart part: %v", err)
		}
		partType, _, err := part.Header.ContentType()
		if err != nil {
			t.Fatalf("parse part content type: %v", err)
		}
		if partType == "multipart/alternative" {
			plainBody, htmlBody = readHumanAlternatives(t, part)
		}
		if partType == "message/delivery-status" {
			data, err := io.ReadAll(part.Body)
			if err != nil {
				t.Fatalf("read delivery status body: %v", err)
			}
			deliveryStatusBody = string(data)
		}
		if partType == "message/rfc822" {
			data, err := io.ReadAll(part.Body)
			if err != nil {
				t.Fatalf("read original message body: %v", err)
			}
			originalMessage = data
		}
	}
	for _, want := range []string{
		"Address not found",
		"Your message could not be delivered to missing@example.com",
		"Technical details:",
		"smtp; 550 5.1.1 No such user",
		"Delivery status: 5.1.1",
	} {
		if !strings.Contains(plainBody, want) {
			t.Fatalf("plain report missing %q:\n%s", want, plainBody)
		}
	}
	for _, want := range []string{
		"<h2>Address not found</h2>",
		"missing@example.com",
		"smtp; 550 5.1.1 No such user",
		"Delivery status: 5.1.1",
	} {
		if !strings.Contains(htmlBody, want) {
			t.Fatalf("html report missing %q:\n%s", want, htmlBody)
		}
	}
	for _, want := range []string{
		"Reporting-Mta: dns; example.com",
		"Original-Recipient: rfc822; missing@example.com",
		"Final-Recipient: rfc822; missing@example.com",
		"Action: failed",
		"Status: 5.1.1",
		"Diagnostic-Code: smtp; 550 5.1.1 No such user",
		"Last-Attempt-Date: Wed, 20 May 2026 12:01:00 +0000",
	} {
		if !strings.Contains(deliveryStatusBody, want) {
			t.Fatalf("delivery-status body missing %q:\n%s", want, deliveryStatusBody)
		}
	}
	if !bytes.Equal(originalMessage, originalRaw) {
		t.Fatalf("original message part changed:\n%s", string(originalMessage))
	}
}

func readHumanAlternatives(t *testing.T, entity *message.Entity) (string, string) {
	t.Helper()

	mr := entity.MultipartReader()
	if mr == nil {
		t.Fatal("human report part is not multipart")
	}
	var plainBody string
	var htmlBody string
	for {
		part, err := mr.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatalf("read human report multipart part: %v", err)
		}
		partType, _, err := part.Header.ContentType()
		if err != nil {
			t.Fatalf("parse human report content type: %v", err)
		}
		data, err := io.ReadAll(part.Body)
		if err != nil {
			t.Fatalf("read human report body: %v", err)
		}
		switch partType {
		case "text/plain":
			plainBody = string(data)
		case "text/html":
			htmlBody = string(data)
		}
	}
	if plainBody == "" {
		t.Fatal("human report is missing text/plain alternative")
	}
	if htmlBody == "" {
		t.Fatal("human report is missing text/html alternative")
	}
	return plainBody, htmlBody
}
