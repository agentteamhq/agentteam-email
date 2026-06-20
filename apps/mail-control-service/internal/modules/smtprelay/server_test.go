package smtprelay

import (
	"context"
	"strings"
	"testing"

	"agent-mail/internal/mail/rfc822"
)

type noopLocalDeliverer struct{}

func (noopLocalDeliverer) Deliver(context.Context, string, []string, []byte) error {
	return nil
}

func TestUniqueStrings(t *testing.T) {
	got := uniqueStrings([]string{
		"User@example.com",
		"user@example.com",
		"other@example.com",
	})

	if len(got) != 2 {
		t.Fatalf("unexpected unique result length: %d", len(got))
	}
	if got[0] != "other@example.com" || got[1] != "user@example.com" {
		t.Fatalf("unexpected unique result: %#v", got)
	}
}

func TestLocalDeliveryDispositionClassifiesActiveLocalRecipients(t *testing.T) {
	server := &Server{
		cfg: runtimeConfig{LocalDelivery: localDeliveryRuntimeConfig{Enabled: true}},
		localDomainResolver: staticLocalDomainResolver{
			"example.com": {},
		},
		localDeliverer: noopLocalDeliverer{},
	}

	got, err := server.localDeliveryDisposition(context.Background(), []string{
		"SEO-Researcher@Example.com",
		"seo-researcher@example.com",
	})
	if err != nil {
		t.Fatalf("localDeliveryDisposition returned error: %v", err)
	}
	if got != localDeliveryAll {
		t.Fatalf("localDeliveryDisposition = %q, want %q", got, localDeliveryAll)
	}
}

func TestLocalDeliveryDispositionRejectsMixedLocalAndExternalRecipients(t *testing.T) {
	server := &Server{
		cfg: runtimeConfig{LocalDelivery: localDeliveryRuntimeConfig{Enabled: true}},
		localDomainResolver: staticLocalDomainResolver{
			"example.com": {},
		},
		localDeliverer: noopLocalDeliverer{},
	}

	got, err := server.localDeliveryDisposition(context.Background(), []string{
		"seo-researcher@example.com",
		"someone@example.net",
	})
	if err != nil {
		t.Fatalf("localDeliveryDisposition returned error: %v", err)
	}
	if got != localDeliveryMixed {
		t.Fatalf("localDeliveryDisposition = %q, want %q", got, localDeliveryMixed)
	}
}

func TestLocalDeliveryDispositionDisabledWithoutConfiguredDeliverer(t *testing.T) {
	server := &Server{
		cfg: runtimeConfig{LocalDelivery: localDeliveryRuntimeConfig{Enabled: true}},
		localDomainResolver: staticLocalDomainResolver{
			"example.com": {},
		},
	}

	got, err := server.localDeliveryDisposition(context.Background(), []string{"seo-researcher@example.com"})
	if err != nil {
		t.Fatalf("localDeliveryDisposition returned error: %v", err)
	}
	if got != localDeliveryExternal {
		t.Fatalf("localDeliveryDisposition = %q, want %q", got, localDeliveryExternal)
	}
}

func TestLocalRouteEnvelopeFromPrefersReplayEnvelopeSender(t *testing.T) {
	submission := rfc822.Submission{
		ReplayEnvelopeFrom: "0100019e8a955335-38ce59a1-8306-4e1c-8634-2f91c322f76f-000000@amazonses.com",
	}
	fallback := "SRS0=dc11=D7=amazonses.com=0100019e8a955335-38ce59a1-8306-4e1c-8634-2f91c322f76f-000000@agent-mail.invalid"

	got := localRouteEnvelopeFrom(submission, fallback)
	if got != submission.ReplayEnvelopeFrom {
		t.Fatalf("local route envelope sender = %q, want replay sender %q", got, submission.ReplayEnvelopeFrom)
	}
}

func TestLocalRouteEnvelopeFromConvertsNullReplayEnvelopeSender(t *testing.T) {
	got := localRouteEnvelopeFrom(rfc822.Submission{ReplayEnvelopeFrom: "<>"}, "sender@example.net")
	if got != "" {
		t.Fatalf("local route null envelope sender = %q, want empty SMTP reverse path", got)
	}
}

func TestValidateConfigRequiresCompleteLocalDeliveryConfig(t *testing.T) {
	cfg := validRelayConfigForTest()
	cfg.LocalDelivery.SMTPAddress = "haraka:25"

	if _, err := validateConfig(cfg); err == nil {
		t.Fatal("expected missing local_delivery.hello_name error")
	}
}

func TestValidateConfigRequiresLocalDeliveryProofConfig(t *testing.T) {
	cfg := validRelayConfigForTest()
	cfg.LocalDelivery.SMTPAddress = "haraka:25"
	cfg.LocalDelivery.HelloName = "atemail-mail-control-service.agentteam-email.svc.cluster.local"

	if _, err := validateConfig(cfg); err == nil {
		t.Fatal("expected missing local_delivery.api_base_url error")
	}
}

func TestValidateConfigAcceptsLocalDeliveryConfig(t *testing.T) {
	cfg := validRelayConfigForTest()
	cfg.LocalDelivery.SMTPAddress = "haraka:25"
	cfg.LocalDelivery.HelloName = "atemail-mail-control-service.agentteam-email.svc.cluster.local"
	cfg.LocalDelivery.APIBaseURL = "http://wildduck-api:8080"
	cfg.LocalDelivery.MongoURI = "mongodb://mongodb:27017/wildduck"
	cfg.LocalDelivery.MongoDatabase = "wildduck"

	runtimeCfg, err := validateConfig(cfg)
	if err != nil {
		t.Fatalf("validateConfig returned error: %v", err)
	}
	if !runtimeCfg.LocalDelivery.Enabled {
		t.Fatal("local delivery should be enabled")
	}
	if runtimeCfg.LocalDelivery.SMTPAddress != "haraka:25" {
		t.Fatalf("local delivery address = %q", runtimeCfg.LocalDelivery.SMTPAddress)
	}
}

func TestValidateOutboundProvider(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{name: "cloudflare", in: "cloudflare", want: outboundProviderCloudflare},
		{name: "ses", in: "ses", want: outboundProviderSES},
		{name: "trim and lower", in: " SES ", want: outboundProviderSES},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := validateOutboundProvider(tt.in)
			if err != nil {
				t.Fatalf("validateOutboundProvider returned error: %v", err)
			}
			if got != tt.want {
				t.Fatalf("unexpected provider: got %q want %q", got, tt.want)
			}
		})
	}
}

func validRelayConfigForTest() Config {
	var cfg Config
	cfg.ListenAddress = ":2587"
	cfg.Hostname = "atemail-mail-control-service.agentteam-email.svc.cluster.local"
	cfg.RelayAuth.Username = "zonemta"
	cfg.RelayAuth.Password = "agent-mail-zonemta-relay"
	cfg.Cloudflare.APIBaseURL = "http://cloudflare.test"
	return cfg
}

func TestValidateOutboundProviderRejectsEmptyAndUnknown(t *testing.T) {
	for _, value := range []string{"", "smtp", "sendmail"} {
		t.Run(value, func(t *testing.T) {
			if _, err := validateOutboundProvider(value); err == nil {
				t.Fatalf("expected error for provider %q", value)
			}
		})
	}
}

func TestSESFeedbackReturnPathsBySenderDomain(t *testing.T) {
	paths, err := sesFeedbackReturnPathsBySenderDomain(DeliveryConfig{
		Domains: []DeliveryDomain{
			{
				Name: "example.com",
				Outbound: DeliveryOutbound{
					SenderDomain: "Example.com",
					SES: DeliverySESOutbound{
						FeedbackReturnPath: "Bounces@Example.com",
					},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("sesFeedbackReturnPathsBySenderDomain returned error: %v", err)
	}
	if paths["example.com"] != "bounces@example.com" {
		t.Fatalf("unexpected feedback path map: %#v", paths)
	}
}

func TestSESFeedbackReturnPathsRejectsMissingReturnPath(t *testing.T) {
	_, err := sesFeedbackReturnPathsBySenderDomain(DeliveryConfig{
		Domains: []DeliveryDomain{
			{
				Name: "example.com",
				Outbound: DeliveryOutbound{
					SenderDomain: "example.com",
				},
			},
		},
	})
	if err == nil {
		t.Fatal("expected missing feedback return path error")
	}
}

func TestSESSenderBuildsSanitizedProviderRaw(t *testing.T) {
	sender := sesSender{
		client: nil,
		feedbackReturnPaths: map[string]string{
			"example.com": "bounces@example.com",
		},
	}
	returnPath, err := sender.feedbackReturnPath(context.Background(), "agent@example.com")
	if err != nil {
		t.Fatalf("feedbackReturnPath returned error: %v", err)
	}

	raw := []byte(strings.Join([]string{
		"Return-Path: <old@example.net>",
		"Received: by relay.example.net",
		"X-ATMCF-Edge-Status: received",
		"Bcc: Hidden <hidden@example.net>",
		"From: Agent <agent@example.com>",
		"To: Recipient <recipient@example.net>",
		"Subject: SES Raw",
		"MIME-Version: 1.0",
		"Content-Type: application/octet-stream",
		"Content-Transfer-Encoding: base64",
		"Content-Disposition: attachment; filename=\"fixture.bin\"",
		"",
		"YXR0YWNobWVudA==",
		"",
	}, "\r\n"))
	providerRaw, err := rfc822.BuildProviderRaw(raw, rfc822.ProviderRawOptions{ReturnPath: returnPath})
	if err != nil {
		t.Fatalf("BuildProviderRaw returned error: %v", err)
	}
	text := string(providerRaw)
	if strings.Count(text, "Return-Path:") != 1 || !strings.Contains(text, "Return-Path: <bounces@example.com>") {
		t.Fatalf("provider raw did not contain exactly the configured return path:\n%s", text)
	}
	for _, forbidden := range []string{"old@example.net", "Received:", "X-ATMCF-Edge-Status:", "Bcc:"} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("provider raw contains forbidden %q:\n%s", forbidden, text)
		}
	}
	if !strings.Contains(text, "YXR0YWNobWVudA==") {
		t.Fatalf("provider raw lost attachment body:\n%s", text)
	}
}

func TestSESDsnProviderRawUsesFeedbackReturnPathFallback(t *testing.T) {
	raw := []byte(strings.Join([]string{
		"X-Agent-Mail-ZoneMTA-Queue-ID: zone-queue-123",
		"X-Agent-Mail-DSN-ID: 018f1f77-40e0-7cc3-98f5-5b03f9f13f40",
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
		"--dsn-boundary--",
		"",
	}, "\r\n"))
	submission, err := rfc822.BuildProviderRelaySubmission(raw, "", []string{"sender@example.net"})
	if err != nil {
		t.Fatalf("BuildProviderRelaySubmission returned error: %v", err)
	}
	providerRaw, err := rfc822.BuildProviderRaw(submission.RawMessage, rfc822.ProviderRawOptions{
		ReturnPath: "bounces@example.com",
	})
	if err != nil {
		t.Fatalf("BuildProviderRaw returned error: %v", err)
	}
	text := string(providerRaw)
	if !strings.HasPrefix(text, "Return-Path: <bounces@example.com>\r\n") {
		t.Fatalf("DSN provider raw should use feedback Return-Path first:\n%s", text)
	}
	if strings.Contains(text, "X-Agent-Mail-DSN-ID:") {
		t.Fatalf("DSN provider raw leaked internal DSN header:\n%s", text)
	}
}

func TestCloudflareAllowsDsnWithoutTextOrHTML(t *testing.T) {
	err := validateSubmissionForProvider(outboundProviderCloudflare, rfc822.Submission{IsDSN: true})
	if err != nil {
		t.Fatalf("validateSubmissionForProvider rejected DSN: %v", err)
	}
}

func TestSESSenderFeedbackReturnPathUsesParsedSenderDomain(t *testing.T) {
	sender := sesSender{
		client: nil,
		feedbackReturnPaths: map[string]string{
			"example.com": "bounces@example.com",
		},
	}

	returnPath, err := sender.feedbackReturnPath(context.Background(), `"agent@local"@example.com`)
	if err != nil {
		t.Fatalf("feedbackReturnPath returned error: %v", err)
	}
	if returnPath != "bounces@example.com" {
		t.Fatalf("returnPath = %q, want bounces@example.com", returnPath)
	}
}

func TestMaxMessageBytesForProvider(t *testing.T) {
	if got := maxMessageBytesForProvider(outboundProviderSES); got != 10*1024*1024 {
		t.Fatalf("unexpected SES max message bytes: %d", got)
	}
	if got := maxMessageBytesForProvider(outboundProviderCloudflare); got != 5*1024*1024 {
		t.Fatalf("unexpected Cloudflare max message bytes: %d", got)
	}
}
