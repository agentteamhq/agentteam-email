package rfc822

import (
	"bytes"
	"encoding/base64"
	"strings"
	"testing"
)

func TestBuildProviderRawSanitizesHeadersInjectsReturnPathAndPreservesBody(t *testing.T) {
	raw := []byte(strings.Join([]string{
		"Return-Path: <old@example.com>",
		"Received: by mx.example.com",
		"DKIM-Signature: v=1; a=rsa-sha256",
		"Authentication-Results: mx.example.com; dkim=pass",
		"ARC-Seal: i=1; a=rsa-sha256",
		"X-ATMCF-Edge-Message-ID: cf-123",
		"X-ATM-Ingest-ID: ing-123",
		"X-Agent-Mail-ZoneMTA-Queue-ID: zone-123",
		"X-Agent-Mail-DSN-ID: 018f1f77-40e0-7cc3-98f5-5b03f9f13f40",
		"X-Agent-Mail-DSN-Source-Ingest-ID: 018f1f77-40e0-7cc3-98f5-5b03f9f13f41",
		"X-Agent-Mail-Local-Route-ID: 018f1f77-40e0-7cc3-98f5-5b03f9f13f42",
		"X-Agent-Mail-Source-Mailbox: media@example.com",
		"X-Agent-Mail-Target-Mailbox: seo@example.com",
		"X-Agent-Mail-Source-Ingest-ID: 018f1f77-40e0-7cc3-98f5-5b03f9f13f43",
		"X-Rspamd-Score: 5.00",
		"X-Haraka-Queue: abc",
		"X-Spam-Status: No",
		"X-SES-SOURCE-ARN: arn:aws:ses:example",
		"Bcc: Hidden <hidden@example.net>",
		"From: Agent <agent@example.com>",
		"To: Recipient <recipient@example.net>",
		"Subject: Provider Raw",
		"MIME-Version: 1.0",
		"Content-Type: multipart/mixed; boundary=\"fixture-boundary\"",
		"",
		"--fixture-boundary",
		"Content-Type: application/octet-stream",
		"Content-Disposition: attachment; filename=\"fixture.txt\"",
		"Content-Transfer-Encoding: base64",
		"",
		base64.StdEncoding.EncodeToString([]byte("attachment bytes")),
		"--fixture-boundary--",
		"",
	}, "\r\n"))

	providerRaw, err := BuildProviderRaw(raw, ProviderRawOptions{
		ReturnPath: "bounces@example.com",
	})
	if err != nil {
		t.Fatalf("BuildProviderRaw returned error: %v", err)
	}

	header, body := splitForTest(t, providerRaw)
	_, originalBody := splitForTest(t, raw)
	if !bytes.Equal(body, originalBody) {
		t.Fatalf("provider raw body changed:\n%s", string(providerRaw))
	}

	headerText := string(header)
	if count := strings.Count(headerText, "Return-Path:"); count != 1 {
		t.Fatalf("expected exactly one Return-Path header, found %d in:\n%s", count, headerText)
	}
	if !strings.HasPrefix(headerText, "Return-Path: <bounces@example.com>\r\n") {
		t.Fatalf("provider raw did not inject expected Return-Path first:\n%s", headerText)
	}
	for _, forbidden := range []string{
		"old@example.com",
		"Received:",
		"DKIM-Signature:",
		"Authentication-Results:",
		"ARC-Seal:",
		"X-ATMCF-Edge-Message-ID:",
		"X-ATM-Ingest-ID:",
		"X-Agent-Mail-ZoneMTA-Queue-ID:",
		"X-Agent-Mail-DSN-ID:",
		"X-Agent-Mail-DSN-Source-Ingest-ID:",
		"X-Agent-Mail-Local-Route-ID:",
		"X-Agent-Mail-Source-Mailbox:",
		"X-Agent-Mail-Target-Mailbox:",
		"X-Agent-Mail-Source-Ingest-ID:",
		"X-Rspamd-Score:",
		"X-Haraka-Queue:",
		"X-Spam-Status:",
		"X-SES-SOURCE-ARN:",
		"Bcc:",
	} {
		if strings.Contains(headerText, forbidden) {
			t.Fatalf("provider raw header still contains forbidden %q:\n%s", forbidden, headerText)
		}
	}
}

func TestProjectLocalRouteHeadersAddsTraceHeadersAndPreservesBody(t *testing.T) {
	raw := []byte(strings.Join([]string{
		"From: Sender <sender@example.net>",
		"To: Media <media@example.com>",
		"Subject: Local Route",
		"Message-ID: <local-route@example.net>",
		"X-Agent-Mail-Local-Route-ID: stale-route",
		"X-Agent-Mail-ZoneMTA-Queue-ID: stale-queue",
		"",
		"body",
		"",
	}, "\r\n"))

	projected, err := ProjectLocalRouteHeaders(raw, map[string]string{
		"X-Agent-Mail-Local-Route-ID":   "018f1f77-40e0-7cc3-98f5-5b03f9f13f42",
		"X-Agent-Mail-Source-Mailbox":   "media@example.com",
		"X-Agent-Mail-Target-Mailbox":   "seo@example.com",
		"X-Agent-Mail-Source-Ingest-ID": "018f1f77-40e0-7cc3-98f5-5b03f9f13f43",
		"X-Agent-Mail-ZoneMTA-Queue-ID": "zone-queue-123",
	})
	if err != nil {
		t.Fatalf("ProjectLocalRouteHeaders returned error: %v", err)
	}

	header, body := splitForTest(t, projected)
	_, originalBody := splitForTest(t, raw)
	if !bytes.Equal(body, originalBody) {
		t.Fatalf("projected local route body changed:\n%s", string(projected))
	}
	headerText := string(header)
	for _, want := range []string{
		"X-Agent-Mail-Local-Route-Id: 018f1f77-40e0-7cc3-98f5-5b03f9f13f42",
		"X-Agent-Mail-Source-Mailbox: media@example.com",
		"X-Agent-Mail-Target-Mailbox: seo@example.com",
		"X-Agent-Mail-Source-Ingest-Id: 018f1f77-40e0-7cc3-98f5-5b03f9f13f43",
		"X-Agent-Mail-Zonemta-Queue-Id: zone-queue-123",
	} {
		if !strings.Contains(headerText, want) {
			t.Fatalf("projected local route header missing %q:\n%s", want, headerText)
		}
	}
	if strings.Contains(headerText, "stale-route") || strings.Contains(headerText, "stale-queue") {
		t.Fatalf("projected local route headers kept stale values:\n%s", headerText)
	}
}

func TestProjectReplayHeadersNamespacesCloudflareBoundaryAuthHeaders(t *testing.T) {
	raw := []byte(strings.Join([]string{
		"Received: from mail.example.net (203.0.113.7) by cloudflare-email.net (cloudflare) id cf-session for <agent@example.com>; Thu, 18 Jun 2026 06:56:11 +0000",
		"ARC-Seal: i=2; a=rsa-sha256; d=cloudflare-email.net; s=cf2024-1; cv=pass; b=abc",
		"ARC-Message-Signature: i=2; a=rsa-sha256; d=cloudflare-email.net; s=cf2024-1; bh=abc; b=def",
		"ARC-Authentication-Results: i=2; mx.cloudflare.net; dkim=pass header.d=example.net; dmarc=pass header.from=example.net; spf=pass smtp.mailfrom=sender@example.net; arc=pass smtp.remote-ip=203.0.113.7",
		"Received-SPF: pass (mx.cloudflare.net: domain of sender@example.net designates 203.0.113.7 as permitted sender) receiver=mx.cloudflare.net; client-ip=203.0.113.7; envelope-from=\"sender@example.net\"; helo=mail.example.net;",
		"Authentication-Results: mx.cloudflare.net; dkim=pass header.d=example.net; dmarc=pass header.from=example.net; spf=pass smtp.mailfrom=sender@example.net; arc=pass smtp.remote-ip=203.0.113.7",
		"Received: by mail.example.net with SMTP id upstream for <agent@example.com>; Thu, 18 Jun 2026 06:56:10 +0000",
		"Authentication-Results: upstream.example; spf=fail smtp.mailfrom=attacker.example",
		"From: Sender <sender@example.net>",
		"To: Agent <agent@example.com>",
		"Subject: Replay",
		"",
		"body",
	}, "\r\n"))

	projected, err := ProjectReplayHeaders(raw, map[string]string{
		"X-ATM-Ingest-ID":            "019ed984-11d5-77d0-98e1-1efddae22fb3",
		"X-ATMCF-Edge-Action":        "worker",
		"X-ATMCF-Edge-Status":        "received",
		"X-ATMCF-Edge-Envelope-To":   "agent@example.com",
		"X-ATMCF-Edge-Envelope-From": "sender@example.net",
	})
	if err != nil {
		t.Fatalf("ProjectReplayHeaders returned error: %v", err)
	}

	header, body := splitForTest(t, projected)
	_, originalBody := splitForTest(t, raw)
	if !bytes.Equal(body, originalBody) {
		t.Fatalf("projected replay body changed:\n%s", string(projected))
	}
	headerText := string(header)
	lowerHeaderText := strings.ToLower(headerText)
	activeHeaderText := "\n" + lowerHeaderText
	for _, required := range []string{
		"x-atmcf-cloudflare-received:",
		"x-atmcf-cloudflare-arc-seal:",
		"x-atmcf-cloudflare-arc-message-signature:",
		"x-atmcf-cloudflare-arc-authentication-results:",
		"x-atmcf-cloudflare-received-spf:",
		"x-atmcf-cloudflare-authentication-results:",
	} {
		if !strings.Contains(lowerHeaderText, required) {
			t.Fatalf("projected replay missing %q:\n%s", required, headerText)
		}
	}
	for _, forbidden := range []string{
		"\nauthentication-results: mx.cloudflare.net;",
		"\nreceived-spf: pass (mx.cloudflare.net:",
		"\narc-authentication-results: i=2; mx.cloudflare.net;",
		"\narc-seal: i=2; a=rsa-sha256; d=cloudflare-email.net;",
		"\narc-message-signature: i=2; a=rsa-sha256; d=cloudflare-email.net;",
		"\nreceived: from mail.example.net (203.0.113.7) by cloudflare-email.net",
	} {
		if strings.Contains(activeHeaderText, forbidden) {
			t.Fatalf("projected replay still has active Cloudflare boundary header %q:\n%s", forbidden, headerText)
		}
	}
	if !strings.Contains(lowerHeaderText, "authentication-results: upstream.example; spf=fail") {
		t.Fatalf("projected replay should retain non-Cloudflare Authentication-Results:\n%s", headerText)
	}
}

func TestBuildProviderRelaySubmissionIdentifiesDSN(t *testing.T) {
	raw := []byte(strings.Join([]string{
		"X-Agent-Mail-ZoneMTA-Queue-ID: zone-queue-123",
		"X-Agent-Mail-DSN-ID: 018f1f77-40e0-7cc3-98f5-5b03f9f13f40",
		"X-Agent-Mail-DSN-Source-Ingest-ID: 018f1f77-40e0-7cc3-98f5-5b03f9f13f41",
		"From: Mail Delivery Subsystem <bounces@example.com>",
		"To: Sender <sender@example.net>",
		"Subject: Delivery Status Notification (Failure)",
		"Message-ID: <018f1f77-40e0-7cc3-98f5-5b03f9f13f40@example.com>",
		"MIME-Version: 1.0",
		"Content-Type: multipart/report; report-type=delivery-status; boundary=\"dsn-boundary\"",
		"",
		"--dsn-boundary",
		"Content-Type: text/plain; charset=utf-8",
		"",
		"failed",
		"--dsn-boundary",
		"Content-Type: message/delivery-status",
		"",
		"Reporting-MTA: dns; example.com",
		"",
		"Final-Recipient: rfc822; missing@example.com",
		"Action: failed",
		"Status: 5.1.1",
		"Diagnostic-Code: smtp; 550 5.1.1 No such user",
		"--dsn-boundary--",
		"",
	}, "\r\n"))

	submission, err := BuildProviderRelaySubmission(raw, "", []string{"sender@example.net"})
	if err != nil {
		t.Fatalf("BuildProviderRelaySubmission returned error: %v", err)
	}
	if !submission.IsDSN {
		t.Fatal("expected DSN submission")
	}
	if submission.InternalDSNID != "018f1f77-40e0-7cc3-98f5-5b03f9f13f40" {
		t.Fatalf("unexpected internal dsn id: %q", submission.InternalDSNID)
	}
	if submission.InternalSourceIngestID != "018f1f77-40e0-7cc3-98f5-5b03f9f13f41" {
		t.Fatalf("unexpected source ingest id: %q", submission.InternalSourceIngestID)
	}
	if submission.MessageID != "018f1f77-40e0-7cc3-98f5-5b03f9f13f40@example.com" {
		t.Fatalf("unexpected message id: %q", submission.MessageID)
	}
}

func TestBuildProviderRelaySubmissionRequiresAndPreservesZoneMTAQueueID(t *testing.T) {
	raw := []byte(strings.Join([]string{
		"X-Agent-Mail-ZoneMTA-Queue-ID: zone-queue-123",
		"X-ATM-Ingest-ID: 018f1f77-40e0-7cc3-98f5-5b03f9f13f40",
		"X-ATMCF-Edge-Envelope-From: 0100019e8a955335-38ce59a1-8306-4e1c-8634-2f91c322f76f-000000@amazonses.com",
		"X-ATMCF-Edge-Envelope-To: media@example.com",
		"From: Agent <agent@example.com>",
		"To: Recipient <recipient@example.net>",
		"Subject: Provider Relay",
		"Message-ID: <provider-relay@example.com>",
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=utf-8",
		"",
		"hello",
		"",
	}, "\r\n"))

	submission, err := BuildProviderRelaySubmission(raw, "agent@example.com", []string{"recipient@example.net"})
	if err != nil {
		t.Fatalf("BuildProviderRelaySubmission returned error: %v", err)
	}
	if submission.ZoneMTAQueueID != "zone-queue-123" {
		t.Fatalf("unexpected ZoneMTA queue id: %q", submission.ZoneMTAQueueID)
	}
	if submission.ReplayIngestID != "018f1f77-40e0-7cc3-98f5-5b03f9f13f40" {
		t.Fatalf("unexpected replay ingest id: %q", submission.ReplayIngestID)
	}
	if submission.ReplayEnvelopeFrom != "0100019e8a955335-38ce59a1-8306-4e1c-8634-2f91c322f76f-000000@amazonses.com" {
		t.Fatalf("unexpected replay envelope-from: %q", submission.ReplayEnvelopeFrom)
	}
	if submission.ReplayEnvelopeTo != "media@example.com" {
		t.Fatalf("unexpected replay envelope-to: %q", submission.ReplayEnvelopeTo)
	}
	if !bytes.Equal(submission.RawMessage, raw) {
		t.Fatalf("provider relay submission changed raw bytes")
	}
}

func TestBuildProviderRelaySubmissionDropsDuplicateZoneLoopHeaders(t *testing.T) {
	raw := []byte(strings.Join([]string{
		"X-Agent-Mail-ZoneMTA-Queue-ID: zone-queue-123",
		"X-Zone-Loop: first",
		"X-Zone-Loop: second",
		"X-Custom-Trace: keep",
		"From: Info <info@example.com>",
		"To: Recipient <recipient@example.net>",
		"Subject: Forwarded Provider Relay",
		"Message-ID: <provider-relay-forward@example.com>",
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=utf-8",
		"",
		"hello",
		"",
	}, "\r\n"))

	submission, err := BuildProviderRelaySubmission(raw, "info@example.com", []string{"recipient@example.net"})
	if err != nil {
		t.Fatalf("BuildProviderRelaySubmission returned error: %v", err)
	}
	if _, ok := submission.Headers["X-Zone-Loop"]; ok {
		t.Fatalf("internal X-Zone-Loop header survived provider metadata projection: %#v", submission.Headers)
	}
	if submission.Headers["X-Custom-Trace"] != "keep" {
		t.Fatalf("custom X header was not preserved: %#v", submission.Headers)
	}
}

func TestBuildProviderRelaySubmissionRejectsMissingZoneMTAQueueID(t *testing.T) {
	raw := []byte(strings.Join([]string{
		"From: Agent <agent@example.com>",
		"To: Recipient <recipient@example.net>",
		"Subject: Missing Provider Relay ID",
		"",
		"hello",
		"",
	}, "\r\n"))

	if _, err := BuildProviderRelaySubmission(raw, "agent@example.com", []string{"recipient@example.net"}); err == nil {
		t.Fatal("expected missing ZoneMTA queue id error")
	}
}

func TestBuildSubmissionAllowsAttachmentOnlyMessage(t *testing.T) {
	raw := []byte(strings.Join([]string{
		"From: Agent <agent@example.com>",
		"To: Recipient <recipient@example.net>",
		"Subject: Attachment Only",
		"Message-ID: <attachment-only@example.com>",
		"MIME-Version: 1.0",
		"Content-Type: multipart/mixed; boundary=\"fixture-boundary\"",
		"",
		"--fixture-boundary",
		"Content-Type: application/octet-stream",
		"Content-Disposition: attachment; filename=\"fixture.txt\"",
		"Content-Transfer-Encoding: base64",
		"",
		base64.StdEncoding.EncodeToString([]byte("attachment bytes")),
		"--fixture-boundary--",
		"",
	}, "\r\n"))

	submission, err := BuildSubmission(raw, "agent@example.com", []string{"recipient@example.net"}, "agent@example.com")
	if err != nil {
		t.Fatalf("BuildSubmission returned error: %v", err)
	}
	if len(submission.Attach) != 1 {
		t.Fatalf("expected one attachment, got %#v", submission.Attach)
	}
	if submission.Text != "" || submission.HTML != "" {
		t.Fatalf("expected no text/html body, got text=%q html=%q", submission.Text, submission.HTML)
	}
}

func TestSanitizeProviderHeadersUsesInternalHeaderBlacklist(t *testing.T) {
	got := SanitizeProviderHeaders(map[string]string{
		"X-Custom-Trace":        "keep",
		"X-ATMCF-Edge-Status":   "drop",
		"X-ATM-Ingest-ID":       "drop",
		"X-Zone-Loop":           "drop",
		"X-Rspamd-Score":        "drop",
		"X-Haraka-Queue":        "drop",
		"X-SES-RETURN-PATH-ARN": "drop",
	})

	if got["X-Custom-Trace"] != "keep" {
		t.Fatalf("missing preserved custom header: %#v", got)
	}
	for key := range got {
		if IsForbiddenProviderHeader(key) {
			t.Fatalf("forbidden provider header survived: %s", key)
		}
	}
}

func splitForTest(t *testing.T, raw []byte) ([]byte, []byte) {
	t.Helper()
	if index := bytes.Index(raw, []byte("\r\n\r\n")); index >= 0 {
		return raw[:index], raw[index+4:]
	}
	t.Fatalf("test fixture is missing header/body separator")
	return nil, nil
}
