package messageprovenance

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	"agent-mail/internal/archive/r2archive"
)

type testSourceFetcher struct {
	source []byte
}

func (f testSourceFetcher) FetchMessageSource(ctx context.Context, userID string, mailboxID string, uid int) ([]byte, error) {
	_ = ctx
	_ = userID
	_ = mailboxID
	_ = uid
	return append([]byte(nil), f.source...), nil
}

type testArchiveReader map[string][]byte

func (r testArchiveReader) GetBytes(ctx context.Context, key string) ([]byte, error) {
	_ = ctx
	data, ok := r[key]
	if !ok {
		return nil, fmt.Errorf("missing archive object %s", key)
	}
	return append([]byte(nil), data...), nil
}

func TestMessageViewBlocksRemoteImagesAndMarksExternalLinks(t *testing.T) {
	t.Parallel()

	raw := []byte(strings.Join([]string{
		"From: Sender <sender@example.net>",
		"To: Agent <agent@example.com>",
		"Subject: HTML",
		"MIME-Version: 1.0",
		"Content-Type: text/html; charset=utf-8",
		"",
		`<p>Hello <a href="https://example.net/path?q=1" target="_self">open this</a></p>`,
		`<a href="/internal/admin/path">relative</a>`,
		`<a href="javascript:alert(1)">bad</a>`,
		`<img src="https://tracker.example/pixel.png" alt="tracker">`,
		`<img src="cid:inline-image@example.net" alt="inline">`,
		`<script>alert(1)</script>`,
	}, "\r\n"))
	service, err := New(testSourceFetcher{source: raw})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	view, err := service.View(context.Background(), ViewParams{
		WildDuckUserID:    "user-1",
		WildDuckMailboxID: "mailbox-1",
		WildDuckUID:       42,
		RemoteImages:      "block",
	})
	if err != nil {
		t.Fatalf("View: %v", err)
	}

	if len(view.ExternalLinks) != 1 {
		t.Fatalf("external links = %#v", view.ExternalLinks)
	}
	if view.ExternalLinks[0].URL != "https://example.net/path?q=1" || view.ExternalLinks[0].Host != "example.net" {
		t.Fatalf("external link = %#v", view.ExternalLinks[0])
	}
	if len(view.RemoteImages) != 1 || view.RemoteImages[0].URL != "https://tracker.example/pixel.png" {
		t.Fatalf("remote images = %#v", view.RemoteImages)
	}
	if len(view.InlineImages) != 0 {
		t.Fatalf("unowned inline images should be blocked: %#v", view.InlineImages)
	}
	for _, forbidden := range []string{
		`<img src="https://tracker.example/pixel.png"`,
		`src="cid:inline-image@example.net"`,
		`javascript:alert`,
		`target="_self"`,
		`href="/internal/admin/path"`,
	} {
		if strings.Contains(view.DisplayHTML, forbidden) {
			t.Fatalf("display HTML still contains %q: %s", forbidden, view.DisplayHTML)
		}
	}
	for _, required := range []string{
		`href="#agent-mail-external-link-1"`,
		`data-agent-mail-external-link-id="link-1"`,
		`data-agent-mail-remote-image-id="image-1"`,
	} {
		if !strings.Contains(view.DisplayHTML, required) {
			t.Fatalf("display HTML missing %q: %s", required, view.DisplayHTML)
		}
	}
}

func TestMessageViewAllowsRemoteImagesWhenRequested(t *testing.T) {
	t.Parallel()

	raw := []byte(strings.Join([]string{
		"From: Sender <sender@example.net>",
		"To: Agent <agent@example.com>",
		"Subject: HTML",
		"MIME-Version: 1.0",
		"Content-Type: text/html; charset=utf-8",
		"",
		`<img src="https://cdn.example/image.png" alt="remote">`,
	}, "\r\n"))
	service, err := New(testSourceFetcher{source: raw})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	view, err := service.View(context.Background(), ViewParams{
		WildDuckUserID:    "user-1",
		WildDuckMailboxID: "mailbox-1",
		WildDuckUID:       42,
		RemoteImages:      "allow",
	})
	if err != nil {
		t.Fatalf("View: %v", err)
	}
	if !view.RemoteImagesAllowed {
		t.Fatalf("RemoteImagesAllowed = false")
	}
	if !strings.Contains(view.DisplayHTML, `src="https://cdn.example/image.png"`) {
		t.Fatalf("remote image src not preserved after explicit allow: %s", view.DisplayHTML)
	}
}

func TestMessageViewPreservesNonLinkAndNonImageMarkup(t *testing.T) {
	t.Parallel()

	raw := []byte(strings.Join([]string{
		"From: Sender <sender@example.net>",
		"To: Agent <agent@example.com>",
		"Subject: HTML",
		"MIME-Version: 1.0",
		"Content-Type: text/html; charset=utf-8",
		"",
		`<picture><source srcset="https://cdn.example/hero.avif 1x"><img srcset="https://cdn.example/hero.png 1x, /same-origin.png 2x" alt="hero"></picture>`,
		`<div style="background-image: url(https://tracker.example/style.png)" background="https://tracker.example/background.png">box</div>`,
		`<video poster="https://tracker.example/poster.png"></video>`,
	}, "\r\n"))
	service, err := New(testSourceFetcher{source: raw})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	view, err := service.View(context.Background(), ViewParams{
		WildDuckUserID:    "user-1",
		WildDuckMailboxID: "mailbox-1",
		WildDuckUID:       42,
		RemoteImages:      "block",
	})
	if err != nil {
		t.Fatalf("View: %v", err)
	}
	if len(view.RemoteImages) != 2 {
		t.Fatalf("remote images = %#v", view.RemoteImages)
	}
	remoteImageURLs := map[string]bool{}
	for _, image := range view.RemoteImages {
		remoteImageURLs[image.URL] = true
	}
	for _, want := range []string{
		"https://cdn.example/hero.avif",
		"https://cdn.example/hero.png",
	} {
		if !remoteImageURLs[want] {
			t.Fatalf("remote images missing %q: %#v", want, view.RemoteImages)
		}
	}
	for _, forbidden := range []string{
		`srcset=`,
		`https://cdn.example/hero.avif`,
	} {
		if strings.Contains(view.DisplayHTML, forbidden) {
			t.Fatalf("display HTML still contains %q: %s", forbidden, view.DisplayHTML)
		}
	}
	for _, required := range []string{
		`style="background-image: url(https://tracker.example/style.png)"`,
		`background="https://tracker.example/background.png"`,
		`poster="https://tracker.example/poster.png"`,
	} {
		if !strings.Contains(view.DisplayHTML, required) {
			t.Fatalf("display HTML missing preserved markup %q: %s", required, view.DisplayHTML)
		}
	}
	if strings.Contains(view.DisplayHTML, `<img src="https://`) {
		t.Fatalf("display HTML still contains active remote image src: %s", view.DisplayHTML)
	}
}

func TestMessageSecurityParsesTrustedAuthenticationResults(t *testing.T) {
	t.Parallel()

	ingestID, receivedAt, archive := testVerifiedArchive(t, "sender@example.net", "agent@example.com", testMinimalRawMessage())
	raw := []byte(strings.Join([]string{
		"Authentication-Results: haraka.example.test; spf=pass smtp.mailfrom=sender.example; dkim=pass header.d=sender.example header.i=@sender.example; dmarc=pass header.from=sender.example; arc=none",
		"Authentication-Results: upstream.example; spf=fail smtp.mailfrom=attacker.example",
		"Received-SPF: pass client-ip=10.0.0.1; envelope-from=sender@example.net; receiver=haraka.example.test; identity=mailfrom",
		"X-Rspamd-Score: -1.23",
		"Message-ID: <trace@example.net>",
		"X-ATM-Ingest-ID: " + ingestID,
		"X-ATMCF-Edge-Action: worker",
		"X-ATMCF-Edge-Status: received",
		"X-ATMCF-Edge-Envelope-From: sender@example.net",
		"X-ATMCF-Edge-Envelope-To: agent@example.com",
		"X-ATMCF-Edge-Received-At: " + receivedAt.Format(time.RFC3339Nano),
		"",
		"body",
	}, "\r\n"))
	service, err := New(testSourceFetcher{source: raw}, WithArchiveReader(archive))
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	security, err := service.Security(context.Background(), Params{
		WildDuckUserID:    "user-1",
		WildDuckMailboxID: "mailbox-1",
		WildDuckUID:       42,
	})
	if err != nil {
		t.Fatalf("Security: %v", err)
	}
	if len(security.AuthenticationResults) != 2 {
		t.Fatalf("authentication results = %#v", security.AuthenticationResults)
	}
	if !security.AuthenticationResults[0].Trusted || security.AuthenticationResults[1].Trusted {
		t.Fatalf("trusted flags = %#v", security.AuthenticationResults)
	}
	if security.Summary.SPF.Result != "pass" || security.Summary.SPF.Domain != "sender.example" {
		t.Fatalf("SPF summary = %#v", security.Summary.SPF)
	}
	if security.Summary.DKIM.Result != "pass" || security.Summary.SignedBy != "sender.example" {
		t.Fatalf("DKIM summary = %#v signedBy=%q", security.Summary.DKIM, security.Summary.SignedBy)
	}
	if security.Summary.DMARC.Result != "pass" {
		t.Fatalf("DMARC summary = %#v", security.Summary.DMARC)
	}
	if security.Summary.MailedBy != "sender.example" {
		t.Fatalf("mailedBy = %q", security.Summary.MailedBy)
	}
	if security.Summary.SPFContext != "internal-replay" {
		t.Fatalf("SPFContext = %q", security.Summary.SPFContext)
	}
	if len(security.ReceivedSPF) != 1 || !strings.Contains(security.ReceivedSPF[0], "identity=mailfrom") {
		t.Fatalf("ReceivedSPF = %#v", security.ReceivedSPF)
	}
	if security.Rspamd["X-Rspamd-Score"] != "-1.23" {
		t.Fatalf("Rspamd = %#v", security.Rspamd)
	}
	if security.Cloudflare.ProvenanceHeaders["X-ATMCF-Edge-Envelope-From"] != "sender@example.net" {
		t.Fatalf("Cloudflare = %#v", security.Cloudflare)
	}
	if security.Cloudflare.OriginalSmtpPeerIP.Status != "unavailable" {
		t.Fatalf("OriginalSmtpPeerIP = %#v", security.Cloudflare.OriginalSmtpPeerIP)
	}
	if !security.HarakaWildDuck.Trusted || security.HarakaWildDuck.Source != "internal-replay" {
		t.Fatalf("HarakaWildDuck = %#v", security.HarakaWildDuck)
	}
	if security.HarakaWildDuck.MailAuth["spf"].Scope != "internal-replay" {
		t.Fatalf("HarakaWildDuck SPF = %#v", security.HarakaWildDuck.MailAuth["spf"])
	}
}

func TestMessageSecurityReadsCloudflareEdgeEvidenceFromArchive(t *testing.T) {
	t.Parallel()

	ingestID, err := r2archive.NewUUIDv7String()
	if err != nil {
		t.Fatalf("NewUUIDv7String: %v", err)
	}
	receivedAt, err := r2archive.UUIDv7Time(ingestID)
	if err != nil {
		t.Fatalf("UUIDv7Time: %v", err)
	}
	bundle, err := r2archive.InboundBundleKeys("example.com", receivedAt, ingestID)
	if err != nil {
		t.Fatalf("InboundBundleKeys: %v", err)
	}
		rawArchive := []byte(strings.Join([]string{
			"Received: from mail.example.net (203.0.113.7) by cloudflare-email.net (cloudflare) id cf-session for <agent@example.com>; Thu, 18 Jun 2026 06:56:11 +0000",
			"Received-SPF: pass (mx.cloudflare.net: domain of sender@example.net designates 203.0.113.7 as permitted sender) receiver=mx.cloudflare.net; client-ip=203.0.113.7; envelope-from=\"sender@example.net\"; helo=mail.example.net;",
			"Authentication-Results: mx.cloudflare.net; dkim=pass header.d=example.net header.i=@example.net; dmarc=pass header.from=example.net; spf=pass smtp.mailfrom=sender@example.net; arc=pass smtp.remote-ip=203.0.113.7",
			"X-CF-Trace: one",
			"X-CF-Trace: two",
			"From: Sender <sender@example.net>",
			"To: Agent <agent@example.com>",
			"Subject: Cloudflare Raw",
		"",
		"body",
	}, "\r\n"))
	rawSHA := sha256.Sum256(rawArchive)
	edgeManifest, err := json.Marshal(map[string]any{
		"schema":        r2archive.InboundEdgeSchema,
		"ingest_id":     ingestID,
		"raw_key":       bundle.RawKey,
		"edge_key":      bundle.EdgeKey,
		"raw_sha256":    fmt.Sprintf("%x", rawSHA[:]),
		"envelope_from": "sender@example.net",
		"envelope_to":   "agent@example.com",
		"received_at":   receivedAt.Format(time.RFC3339Nano),
		"cloudflare_edge_evidence": map[string]any{
			"schema":      "agent-mail.cloudflare-edge-evidence.v1",
			"source":      "cloudflare-worker-forwardable-email-message",
			"captured_at": receivedAt.Format(time.RFC3339Nano),
			"worker_message_fields": map[string]any{
				"envelope_from": "sender@example.net",
				"envelope_to":   "agent@example.com",
				"received_at":   receivedAt.Format(time.RFC3339Nano),
			},
		},
	})
	if err != nil {
		t.Fatalf("marshal edge manifest: %v", err)
	}

	raw := []byte(strings.Join([]string{
		"Authentication-Results: haraka.example.test; spf=pass smtp.mailfrom=sender.example",
		"Authentication-Results: mx.cloudflare.net; dkim=fail header.d=attacker.example; dmarc=fail header.from=attacker.example; spf=fail smtp.mailfrom=attacker@example.net; arc=fail smtp.remote-ip=198.51.100.9",
		"X-ATM-Ingest-ID: " + ingestID,
		"X-ATMCF-Edge-Action: worker",
		"X-ATMCF-Edge-Status: received",
		"X-ATMCF-Edge-Envelope-To: agent@example.com",
		"X-ATMCF-Edge-Received-At: " + receivedAt.Format(time.RFC3339Nano),
		"",
		"body",
	}, "\r\n"))
	service, err := New(testSourceFetcher{source: raw}, WithArchiveReader(testArchiveReader{
		bundle.EdgeKey: edgeManifest,
		bundle.RawKey:  rawArchive,
	}))
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	security, err := service.Security(context.Background(), Params{
		WildDuckUserID:    "user-1",
		WildDuckMailboxID: "mailbox-1",
		WildDuckUID:       42,
	})
	if err != nil {
		t.Fatalf("Security: %v", err)
	}
	if security.CloudflareArchive == nil || security.CloudflareArchive.Status != "available" {
		t.Fatalf("CloudflareArchive = %#v", security.CloudflareArchive)
	}
	if security.CloudflareArchive.RawKey != bundle.RawKey || security.CloudflareArchive.EdgeKey != bundle.EdgeKey {
		t.Fatalf("CloudflareArchive keys = %#v", security.CloudflareArchive)
	}
	if security.CloudflareArchive.RawSHA256 != fmt.Sprintf("%x", rawSHA[:]) {
		t.Fatalf("CloudflareArchive raw sha = %q", security.CloudflareArchive.RawSHA256)
	}
	if security.CloudflareArchive.EdgeEvidence["source"] != "cloudflare-worker-forwardable-email-message" {
		t.Fatalf("CloudflareArchive edge evidence = %#v", security.CloudflareArchive.EdgeEvidence)
	}
	if security.Cloudflare.RawKey != bundle.RawKey || security.Cloudflare.RawSHA256 != fmt.Sprintf("%x", rawSHA[:]) {
		t.Fatalf("Cloudflare evidence archive fields = %#v", security.Cloudflare)
	}
	if security.Cloudflare.AuthservID != "mx.cloudflare.net" {
		t.Fatalf("Cloudflare authserv = %q", security.Cloudflare.AuthservID)
	}
	if security.Cloudflare.MailedBy != "sender@example.net" || security.Cloudflare.SignedBy != "example.net" {
		t.Fatalf("Cloudflare mailed/signed = %q/%q", security.Cloudflare.MailedBy, security.Cloudflare.SignedBy)
	}
	if security.Cloudflare.OriginalSmtpPeerIP.Status != "available" ||
		security.Cloudflare.OriginalSmtpPeerIP.Value != "203.0.113.7" {
		t.Fatalf("OriginalSmtpPeerIP = %#v", security.Cloudflare.OriginalSmtpPeerIP)
	}
	if security.Cloudflare.PerMessageAuthVerdicts.SPF.Status != "pass" ||
		security.Cloudflare.PerMessageAuthVerdicts.DKIM.Status != "pass" ||
		security.Cloudflare.PerMessageAuthVerdicts.DMARC.Status != "pass" ||
		security.Cloudflare.PerMessageAuthVerdicts.ARC.Status != "pass" {
		t.Fatalf("Cloudflare auth verdicts = %#v", security.Cloudflare.PerMessageAuthVerdicts)
	}
		if len(security.Cloudflare.AuthenticationResults) != 1 || len(security.Cloudflare.ReceivedSPF) != 1 || len(security.Cloudflare.Received) != 1 {
			t.Fatalf("Cloudflare raw headers = auth=%#v spf=%#v received=%#v", security.Cloudflare.AuthenticationResults, security.Cloudflare.ReceivedSPF, security.Cloudflare.Received)
		}
		if security.CloudflareArchive.RawSource == nil {
			t.Fatalf("CloudflareArchive raw source missing")
		}
		if security.CloudflareArchive.RawSource.Source != "cloudflare-archived-raw-eml" ||
			security.CloudflareArchive.RawSource.Size != len(rawArchive) ||
			security.CloudflareArchive.RawSource.Raw != string(rawArchive) {
			t.Fatalf("CloudflareArchive raw source = %#v", security.CloudflareArchive.RawSource)
		}
		traceHeaders := 0
		for _, header := range security.CloudflareArchive.RawSource.Headers {
			if strings.EqualFold(header.Name, "X-CF-Trace") {
				traceHeaders++
			}
		}
		if traceHeaders != 2 {
			t.Fatalf("CloudflareArchive raw headers should preserve duplicate X-CF headers: %#v", security.CloudflareArchive.RawSource.Headers)
		}
	}

func TestMessageSecurityRejectsArchiveEnvelopeFromMismatch(t *testing.T) {
	t.Parallel()

	ingestID, receivedAt, archive := testVerifiedArchive(t, "sender@example.net", "agent@example.com", testMinimalRawMessage())
	raw := []byte(strings.Join([]string{
		"Authentication-Results: haraka.example.test; spf=pass smtp.mailfrom=sender.example",
		"X-ATM-Ingest-ID: " + ingestID,
		"X-ATMCF-Edge-Action: worker",
		"X-ATMCF-Edge-Status: received",
		"X-ATMCF-Edge-Envelope-From: attacker@example.net",
		"X-ATMCF-Edge-Envelope-To: agent@example.com",
		"X-ATMCF-Edge-Received-At: " + receivedAt.Format(time.RFC3339Nano),
		"",
		"body",
	}, "\r\n"))
	service, err := New(testSourceFetcher{source: raw}, WithArchiveReader(archive))
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	security, err := service.Security(context.Background(), Params{
		WildDuckUserID:    "user-1",
		WildDuckMailboxID: "mailbox-1",
		WildDuckUID:       42,
	})
	if err != nil {
		t.Fatalf("Security: %v", err)
	}
	if security.CloudflareArchive == nil || security.CloudflareArchive.Status != "unavailable" {
		t.Fatalf("CloudflareArchive = %#v", security.CloudflareArchive)
	}
	if security.CloudflareArchive.Reason != "cloudflare_edge_manifest_envelope_from_mismatch" {
		t.Fatalf("CloudflareArchive reason = %q", security.CloudflareArchive.Reason)
	}
	if security.HarakaWildDuck.Trusted {
		t.Fatalf("mismatched sender evidence must not trust Haraka/WildDuck: %#v", security.HarakaWildDuck)
	}
}

func TestMessageSecurityRejectsArchiveReceivedAtMismatch(t *testing.T) {
	t.Parallel()

	ingestID, receivedAt, archive := testVerifiedArchive(t, "sender@example.net", "agent@example.com", testMinimalRawMessage())
	raw := []byte(strings.Join([]string{
		"Authentication-Results: haraka.example.test; spf=pass smtp.mailfrom=sender.example",
		"X-ATM-Ingest-ID: " + ingestID,
		"X-ATMCF-Edge-Action: worker",
		"X-ATMCF-Edge-Status: received",
		"X-ATMCF-Edge-Envelope-From: sender@example.net",
		"X-ATMCF-Edge-Envelope-To: agent@example.com",
		"X-ATMCF-Edge-Received-At: " + receivedAt.Add(time.Second).Format(time.RFC3339Nano),
		"",
		"body",
	}, "\r\n"))
	service, err := New(testSourceFetcher{source: raw}, WithArchiveReader(archive))
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	security, err := service.Security(context.Background(), Params{
		WildDuckUserID:    "user-1",
		WildDuckMailboxID: "mailbox-1",
		WildDuckUID:       42,
	})
	if err != nil {
		t.Fatalf("Security: %v", err)
	}
	if security.CloudflareArchive == nil || security.CloudflareArchive.Status != "unavailable" {
		t.Fatalf("CloudflareArchive = %#v", security.CloudflareArchive)
	}
	if security.CloudflareArchive.Reason != "cloudflare_edge_manifest_received_at_mismatch" {
		t.Fatalf("CloudflareArchive reason = %q", security.CloudflareArchive.Reason)
	}
	if security.HarakaWildDuck.Trusted {
		t.Fatalf("mismatched timestamp evidence must not trust Haraka/WildDuck: %#v", security.HarakaWildDuck)
	}
}

func TestMessageSecurityDoesNotTrustForgedLocalAuthenticationResultsWithoutReplayProvenance(t *testing.T) {
	t.Parallel()

	raw := []byte(strings.Join([]string{
		"Authentication-Results: haraka.example.test; spf=pass smtp.mailfrom=attacker.example; dkim=pass header.d=attacker.example; dmarc=pass header.from=attacker.example",
		"",
		"body",
	}, "\r\n"))
	service, err := New(testSourceFetcher{source: raw})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	security, err := service.Security(context.Background(), Params{
		WildDuckUserID:    "user-1",
		WildDuckMailboxID: "mailbox-1",
		WildDuckUID:       42,
	})
	if err != nil {
		t.Fatalf("Security: %v", err)
	}
	if len(security.AuthenticationResults) != 1 || security.AuthenticationResults[0].Trusted {
		t.Fatalf("forged local Authentication-Results should be untrusted: %#v", security.AuthenticationResults)
	}
	if security.Summary.SPF.Result != "unknown" || security.Summary.DKIM.Result != "unknown" || security.Summary.DMARC.Result != "unknown" {
		t.Fatalf("security summary should ignore forged local Authentication-Results: %#v", security.Summary)
	}
}

func TestMessageSecurityDoesNotUseForgedCloudflareAuthenticationResultsWithoutVerifiedArchive(t *testing.T) {
	t.Parallel()

	raw := []byte(strings.Join([]string{
		"Authentication-Results: mx.cloudflare.net; dkim=pass header.d=attacker.example; dmarc=pass header.from=attacker.example; spf=pass smtp.mailfrom=attacker@example.net; arc=pass smtp.remote-ip=198.51.100.9",
		"",
		"body",
	}, "\r\n"))
	service, err := New(testSourceFetcher{source: raw})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	security, err := service.Security(context.Background(), Params{
		WildDuckUserID:    "user-1",
		WildDuckMailboxID: "mailbox-1",
		WildDuckUID:       42,
	})
	if err != nil {
		t.Fatalf("Security: %v", err)
	}
	if len(security.Cloudflare.AuthenticationResults) != 0 {
		t.Fatalf("forged Cloudflare Authentication-Results should not populate Cloudflare evidence: %#v", security.Cloudflare.AuthenticationResults)
	}
	if security.Cloudflare.PerMessageAuthVerdicts.SPF.Status != "unavailable" {
		t.Fatalf("Cloudflare verdicts should require verified R2 raw evidence: %#v", security.Cloudflare.PerMessageAuthVerdicts)
	}
	if security.Cloudflare.OriginalSmtpPeerIP.Status != "unavailable" {
		t.Fatalf("Cloudflare original IP should require verified R2 raw evidence: %#v", security.Cloudflare.OriginalSmtpPeerIP)
	}
}

func TestMessageSecurityDoesNotTrustForgedLocalAuthenticationResultsWithSpoofedReplayHeaders(t *testing.T) {
	t.Parallel()

	ingestID, err := r2archive.NewUUIDv7String()
	if err != nil {
		t.Fatalf("NewUUIDv7String: %v", err)
	}
	receivedAt, err := r2archive.UUIDv7Time(ingestID)
	if err != nil {
		t.Fatalf("UUIDv7Time: %v", err)
	}
	raw := []byte(strings.Join([]string{
		"Authentication-Results: haraka.example.test; spf=pass smtp.mailfrom=attacker.example; dkim=pass header.d=attacker.example; dmarc=pass header.from=attacker.example",
		"X-ATM-Ingest-ID: " + ingestID,
		"X-ATMCF-Edge-Action: worker",
		"X-ATMCF-Edge-Status: received",
		"X-ATMCF-Edge-Envelope-To: agent@example.com",
		"X-ATMCF-Edge-Received-At: " + receivedAt.Format(time.RFC3339Nano),
		"",
		"body",
	}, "\r\n"))
	service, err := New(testSourceFetcher{source: raw})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	security, err := service.Security(context.Background(), Params{
		WildDuckUserID:    "user-1",
		WildDuckMailboxID: "mailbox-1",
		WildDuckUID:       42,
	})
	if err != nil {
		t.Fatalf("Security: %v", err)
	}
	if len(security.AuthenticationResults) != 1 || security.AuthenticationResults[0].Trusted {
		t.Fatalf("spoofed replay headers should not make local Authentication-Results trusted: %#v", security.AuthenticationResults)
	}
	if security.Summary.SPF.Result != "unknown" || security.Summary.DKIM.Result != "unknown" || security.Summary.DMARC.Result != "unknown" {
		t.Fatalf("security summary should ignore forged local Authentication-Results without verified R2 evidence: %#v", security.Summary)
	}
	if security.HarakaWildDuck.Trusted {
		t.Fatalf("HarakaWildDuck should be untrusted without verified R2 evidence: %#v", security.HarakaWildDuck)
	}
}

func TestMessageSecurityDoesNotTrustUpstreamAuthenticationResultsByPositionOnly(t *testing.T) {
	t.Parallel()

	raw := []byte(strings.Join([]string{
		"Authentication-Results: upstream.example; spf=pass smtp.mailfrom=attacker.example",
		"Authentication-Results: haraka.example.test; spf=pass smtp.mailfrom=sender.example",
		"",
		"body",
	}, "\r\n"))
	service, err := New(testSourceFetcher{source: raw})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	security, err := service.Security(context.Background(), Params{
		WildDuckUserID:    "user-1",
		WildDuckMailboxID: "mailbox-1",
		WildDuckUID:       42,
	})
	if err != nil {
		t.Fatalf("Security: %v", err)
	}
	if security.AuthenticationResults[0].Trusted || security.AuthenticationResults[1].Trusted {
		t.Fatalf("trusted flags = %#v", security.AuthenticationResults)
	}
	if security.Summary.SPF.Result != "unknown" {
		t.Fatalf("SPF summary should ignore upstream headers: %#v", security.Summary.SPF)
	}
}

func testVerifiedArchive(t *testing.T, envelopeFrom string, envelopeTo string, rawArchive []byte) (string, time.Time, testArchiveReader) {
	t.Helper()
	ingestID, err := r2archive.NewUUIDv7String()
	if err != nil {
		t.Fatalf("NewUUIDv7String: %v", err)
	}
	receivedAt, err := r2archive.UUIDv7Time(ingestID)
	if err != nil {
		t.Fatalf("UUIDv7Time: %v", err)
	}
	bundle, err := r2archive.InboundBundleKeys("example.com", receivedAt, ingestID)
	if err != nil {
		t.Fatalf("InboundBundleKeys: %v", err)
	}
	rawSHA := sha256.Sum256(rawArchive)
	edgeManifest, err := json.Marshal(map[string]any{
		"schema":        r2archive.InboundEdgeSchema,
		"ingest_id":     ingestID,
		"raw_key":       bundle.RawKey,
		"edge_key":      bundle.EdgeKey,
		"raw_sha256":    fmt.Sprintf("%x", rawSHA[:]),
		"envelope_from": envelopeFrom,
		"envelope_to":   envelopeTo,
		"received_at":   receivedAt.Format(time.RFC3339Nano),
		"cloudflare_edge_evidence": map[string]any{
			"schema":      "agent-mail.cloudflare-edge-evidence.v1",
			"source":      "cloudflare-worker-forwardable-email-message",
			"captured_at": receivedAt.Format(time.RFC3339Nano),
			"worker_message_fields": map[string]any{
				"envelope_from": envelopeFrom,
				"envelope_to":   envelopeTo,
				"received_at":   receivedAt.Format(time.RFC3339Nano),
			},
			"unavailable": map[string]any{
				"original_smtp_peer_ip": map[string]any{
					"status": "unavailable",
					"reason": "cloudflare_worker_runtime_field_not_exposed",
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("marshal edge manifest: %v", err)
	}
	return ingestID, receivedAt, testArchiveReader{
		bundle.EdgeKey: edgeManifest,
		bundle.RawKey:  rawArchive,
	}
}

func testMinimalRawMessage() []byte {
	return []byte(strings.Join([]string{
		"From: Sender <sender@example.net>",
		"To: Agent <agent@example.com>",
		"Subject: Archived Raw",
		"",
		"body",
	}, "\r\n"))
}
