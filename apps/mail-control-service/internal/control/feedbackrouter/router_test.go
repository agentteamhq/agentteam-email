package feedbackrouter

import (
	"context"
	"errors"
	"fmt"
	"net/textproto"
	"strings"
	"testing"

	"github.com/emersion/go-imap/v2"
)

func TestExtractOriginalSenderFromEmbeddedMessage(t *testing.T) {
	raw := strings.ReplaceAll(`From: Mail Delivery Subsystem <mailer-daemon@example.net>
To: bounces@example.com
Subject: Delivery Status Notification
Content-Type: multipart/report; boundary="b1"; report-type=delivery-status

--b1
Content-Type: text/plain

delivery failed
--b1
Content-Type: message/rfc822

From: Agent One <agent.one@example.com>
To: missing@example.net
Subject: Hello

body
--b1--
`, "\n", "\r\n")

	got, err := ExtractOriginalSender([]byte(raw), []string{"example.com"}, "bounces@example.com")
	if err != nil {
		t.Fatalf("ExtractOriginalSender returned error: %v", err)
	}
	if got != "agent.one@example.com" {
		t.Fatalf("sender = %q, want agent.one@example.com", got)
	}
}

func TestExtractOriginalSenderIgnoresFeedbackMailbox(t *testing.T) {
	raw := strings.ReplaceAll(`From: bounces@example.com
To: bounces@example.com
Subject: loop

`, "\n", "\r\n")

	_, err := ExtractOriginalSender([]byte(raw), []string{"example.com"}, "bounces@example.com")
	if err == nil {
		t.Fatal("ExtractOriginalSender succeeded for feedback mailbox loop")
	}
}

func TestExtractOriginalSenderUsesParsedAddressDomain(t *testing.T) {
	raw := strings.ReplaceAll(`From: "agent@local"@example.com
To: bounces@example.com
Subject: Delivery Status Notification

`, "\n", "\r\n")

	got, err := ExtractOriginalSender([]byte(raw), []string{"example.com"}, "bounces@example.com")
	if err != nil {
		t.Fatalf("ExtractOriginalSender returned error: %v", err)
	}
	if got != `"agent@local"@example.com` {
		t.Fatalf("sender = %q, want quoted local-part address", got)
	}
}

func TestValidateConfigRequiresRoutes(t *testing.T) {
	var cfg Config
	cfg.WildDuck.APIBaseURL = "http://wildduck-api:8080"
	cfg.IMAP.Address = "wildduck-imap:143"
	cfg.IMAP.Username = "bounces@example.com"
	cfg.IMAP.Password = "feedback-router-password"
	cfg.IMAP.DisplayName = "Agent Mail Bounces"
	cfg.IMAP.Mailbox = "INBOX"
	cfg.Haraka.Address = "haraka:25"
	cfg.Haraka.HelloName = "atemail-mail-control-service.agentteam-email.svc.cluster.local"

	_, err := validateConfig(cfg, false)
	if err == nil {
		t.Fatal("validateConfig succeeded without routes")
	}
}

func TestValidateConfigNormalizesRoute(t *testing.T) {
	var cfg Config
	cfg.WildDuck.APIBaseURL = "http://wildduck-api:8080"
	cfg.IMAP.Address = "wildduck-imap:143"
	cfg.IMAP.Username = "Bounces@Example.com"
	cfg.IMAP.Password = "feedback-router-password"
	cfg.IMAP.DisplayName = "Agent Mail Bounces"
	cfg.IMAP.Mailbox = "INBOX"
	cfg.Haraka.Address = "haraka:25"
	cfg.Haraka.HelloName = "atemail-mail-control-service.agentteam-email.svc.cluster.local"
	cfg.Routes = []RouteConfig{{
		FeedbackAddress:      "Bounces@Example.com",
		SenderDomains:        []string{"Example.com"},
		MarkSeenOnParseError: true,
	}}

	got, err := validateConfig(cfg, false)
	if err != nil {
		t.Fatalf("validateConfig returned error: %v", err)
	}
	if got.IMAPUsername != "bounces@example.com" {
		t.Fatalf("IMAPUsername = %q", got.IMAPUsername)
	}
	if got.Routes[0].SenderDomains[0] != "example.com" {
		t.Fatalf("SenderDomains[0] = %q", got.Routes[0].SenderDomains[0])
	}
}

func TestProcessRawFeedbackMarksPermanentSMTPFailureSeen(t *testing.T) {
	router := routerForProcessingTest()
	raw := feedbackWithEmbeddedSender("Testing <testing@example.com>")
	deliverErr := fmtSMTPRecipientError(550, "5.1.1 No such user")

	markSeen, err := router.processRawFeedback(context.Background(), imap.UID(2), raw, func(context.Context, runtimeConfig, string, []byte) error {
		return deliverErr
	})

	if !errors.Is(err, deliverErr) {
		t.Fatalf("error = %v, want wrapped permanent SMTP error", err)
	}
	// Regression guard: provider bounces can arrive after the original local
	// mailbox is removed. The message must be marked seen on a permanent local
	// SMTP reject so the feedback listener does not retry an impossible delivery
	// forever.
	if !markSeen {
		t.Fatal("permanent SMTP feedback delivery failure was left retryable")
	}
}

func TestProcessRawFeedbackLeavesTransientSMTPFailureRetryable(t *testing.T) {
	router := routerForProcessingTest()
	raw := feedbackWithEmbeddedSender("Testing <testing@example.com>")
	deliverErr := fmtSMTPRecipientError(451, "4.3.0 temporary failure")

	markSeen, err := router.processRawFeedback(context.Background(), imap.UID(2), raw, func(context.Context, runtimeConfig, string, []byte) error {
		return deliverErr
	})

	if !errors.Is(err, deliverErr) {
		t.Fatalf("error = %v, want wrapped transient SMTP error", err)
	}
	if markSeen {
		t.Fatal("transient SMTP feedback delivery failure was marked seen")
	}
}

func TestProcessRawFeedbackLeavesNonRecipientSMTPFailureRetryable(t *testing.T) {
	router := routerForProcessingTest()
	raw := feedbackWithEmbeddedSender("Testing <testing@example.com>")
	deliverErr := fmtSMTPError(550, "5.5.0 data rejected")

	markSeen, err := router.processRawFeedback(context.Background(), imap.UID(2), raw, func(context.Context, runtimeConfig, string, []byte) error {
		return deliverErr
	})

	if !errors.Is(err, deliverErr) {
		t.Fatalf("error = %v, want wrapped non-recipient SMTP error", err)
	}
	if markSeen {
		t.Fatal("non-recipient SMTP feedback delivery failure was marked seen")
	}
}

func routerForProcessingTest() *Router {
	return &Router{
		cfg: runtimeConfig{
			Routes: []route{{
				FeedbackAddress:      "bounces@example.com",
				SenderDomains:        []string{"example.com"},
				MarkSeenOnParseError: true,
			}},
		},
	}
}

func feedbackWithEmbeddedSender(sender string) []byte {
	raw := `From: MAILER-DAEMON@example.net
To: bounces@example.com
Subject: Delivery Status Notification
Content-Type: multipart/report; boundary="b1"; report-type=delivery-status

--b1
Content-Type: text/plain

delivery failed
--b1
Content-Type: message/rfc822

From: ` + sender + `
To: missing@example.net
Subject: Hello

body
--b1--
`
	return []byte(strings.ReplaceAll(raw, "\n", "\r\n"))
}

func fmtSMTPError(code int, message string) error {
	return &textproto.Error{Code: code, Msg: message}
}

func fmtSMTPRecipientError(code int, message string) error {
	return &smtpCommandError{
		command: "rcpt",
		err:     fmt.Errorf("smtp rcpt testing@example.com: %w", fmtSMTPError(code, message)),
	}
}
