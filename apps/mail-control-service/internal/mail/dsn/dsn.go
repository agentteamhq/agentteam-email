package dsn

import (
	"bufio"
	"bytes"
	"fmt"
	htmltemplate "html/template"
	stdmail "net/mail"
	texttemplate "text/template"
	"time"

	"agent-mail/internal/mail/structured"

	"github.com/emersion/go-message"
	messagemail "github.com/emersion/go-message/mail"
	messagetextproto "github.com/emersion/go-message/textproto"
)

const (
	ActionFailed = "failed"

	InternalDSNIDHeader          = "X-Agent-Mail-DSN-ID"
	InternalSourceIngestIDHeader = "X-Agent-Mail-DSN-Source-Ingest-ID"
)

type FailureMessage struct {
	DSNID           string
	SourceIngestID  string
	FromAddress     string
	ToAddress       string
	ReportingDomain string
	FinalRecipient  string
	OriginalMessage []byte
	Status          string
	DiagnosticCode  string
	ReceivedAt      time.Time
	Now             time.Time
}

type BuiltMessage struct {
	Raw       []byte
	MessageID string
	From      string
	To        string
}

type originalMessage struct {
	Raw       []byte
	MessageID string
}

type humanReport struct {
	FinalRecipient string
	Status         string
	DiagnosticCode string
}

var plainReportTemplate = texttemplate.Must(texttemplate.New("dsn-plain-report").Parse(`** Address not found **

Your message could not be delivered to {{.FinalRecipient}} because that mailbox does not exist on this mail system.

Please check the recipient address and try again.

Technical details:
{{.DiagnosticCode}}
Delivery status: {{.Status}}
`))

var htmlReportTemplate = htmltemplate.Must(htmltemplate.New("dsn-html-report").Parse(`<!doctype html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<style>
body { margin:0; padding:0; background:#ffffff; color:#212121; font-family:Arial, Helvetica, sans-serif; }
.wrapper { padding:32px 0; }
.panel { max-width:560px; padding:24px 24px 32px; background:#fafafa; border:1px solid #e0e0e0; border-radius:2px; }
.badge { float:left; width:48px; height:48px; margin:0 20px 16px 0; border-radius:24px; background:#d93025; color:#ffffff; font-size:32px; line-height:48px; text-align:center; font-weight:bold; }
h2 { margin:0; padding-top:6px; font-size:20px; color:#212121; font-weight:bold; }
.summary { clear:both; padding-top:16px; color:#616161; font-size:16px; line-height:24px; }
.recipient { color:#212121; font-weight:bold; text-decoration:none; }
.details { padding:32px 0 0; color:#424242; font-size:13px; line-height:20px; }
.diagnostic { margin:8px 0 0; padding:12px; background:#ffffff; border:1px solid #eeeeee; font-family:Consolas, "Courier New", monospace; font-size:12px; color:#212121; white-space:pre-wrap; }
</style>
</head>
<body>
<div class="wrapper">
<div class="panel">
<div class="badge">!</div>
<h2>Address not found</h2>
<div class="summary">
Your message could not be delivered to <span class="recipient">{{.FinalRecipient}}</span> because that mailbox does not exist on this mail system.
</div>
<div class="details">
Please check the recipient address and try again.
<div class="diagnostic">{{.DiagnosticCode}}</div>
<div class="diagnostic">Delivery status: {{.Status}}</div>
</div>
</div>
</div>
</body>
</html>
`))

func BuildFailureMessage(input FailureMessage) (BuiltMessage, error) {
	if input.DSNID == "" {
		return BuiltMessage{}, fmt.Errorf("missing dsn id")
	}
	if input.SourceIngestID == "" {
		return BuiltMessage{}, fmt.Errorf("missing source ingest id")
	}
	from, err := structured.ParseMailbox(input.FromAddress)
	if err != nil {
		return BuiltMessage{}, fmt.Errorf("parse dsn from address: %w", err)
	}
	to, err := structured.ParseMailbox(input.ToAddress)
	if err != nil {
		return BuiltMessage{}, fmt.Errorf("parse dsn recipient address: %w", err)
	}
	finalRecipient, err := structured.ParseMailbox(input.FinalRecipient)
	if err != nil {
		return BuiltMessage{}, fmt.Errorf("parse final recipient address: %w", err)
	}
	original, err := parseOriginalMessage(input.OriginalMessage)
	if err != nil {
		return BuiltMessage{}, fmt.Errorf("parse original message: %w", err)
	}
	reportingDomain, err := structured.CanonicalDomain(input.ReportingDomain)
	if err != nil {
		return BuiltMessage{}, fmt.Errorf("canonical reporting domain: %w", err)
	}
	if reportingDomain == "" {
		return BuiltMessage{}, fmt.Errorf("missing reporting domain")
	}
	if input.Status == "" {
		return BuiltMessage{}, fmt.Errorf("missing dsn status")
	}
	if input.DiagnosticCode == "" {
		return BuiltMessage{}, fmt.Errorf("missing dsn diagnostic code")
	}
	now := input.Now.UTC()
	if now.IsZero() {
		now = time.Now().UTC()
	}
	receivedAt := input.ReceivedAt.UTC()
	if receivedAt.IsZero() {
		return BuiltMessage{}, fmt.Errorf("missing received_at for dsn arrival date")
	}

	messageID := input.DSNID + "@" + reportingDomain

	var root messagemail.Header
	root.SetAddressList("From", []*stdmail.Address{{
		Name:    "Mail Delivery Subsystem",
		Address: from.Address,
	}})
	root.SetAddressList("To", []*stdmail.Address{{Address: to.Address}})
	root.SetSubject("Delivery Status Notification (Failure)")
	root.SetDate(now)
	root.SetMessageID(messageID)
	root.SetText("Auto-Submitted", "auto-replied")
	root.SetText(InternalDSNIDHeader, input.DSNID)
	root.SetText(InternalSourceIngestIDHeader, input.SourceIngestID)
	root.SetText("X-Failed-Recipients", finalRecipient.Address)
	if original.MessageID != "" {
		root.SetMsgIDList("References", []string{original.MessageID})
		root.SetMsgIDList("In-Reply-To", []string{original.MessageID})
	}
	root.SetContentType("multipart/report", map[string]string{
		"report-type": "delivery-status",
	})

	var raw bytes.Buffer
	writer, err := message.CreateWriter(&raw, root.Header)
	if err != nil {
		return BuiltMessage{}, fmt.Errorf("create dsn message writer: %w", err)
	}
	report := humanReport{
		FinalRecipient: finalRecipient.Address,
		Status:         input.Status,
		DiagnosticCode: input.DiagnosticCode,
	}
	if err := writeHumanReportPart(writer, report); err != nil {
		_ = writer.Close()
		return BuiltMessage{}, err
	}
	if err := writeDeliveryStatusPart(writer, deliveryStatus{
		ReportingDomain:   reportingDomain,
		ReceivedAt:        receivedAt,
		LastAttemptAt:     now,
		OriginalRecipient: finalRecipient.Address,
		FinalRecipient:    finalRecipient.Address,
		Action:            ActionFailed,
		Status:            input.Status,
		DiagnosticCode:    input.DiagnosticCode,
	}); err != nil {
		_ = writer.Close()
		return BuiltMessage{}, err
	}
	if err := writeOriginalMessagePart(writer, original.Raw); err != nil {
		_ = writer.Close()
		return BuiltMessage{}, err
	}
	if err := writer.Close(); err != nil {
		return BuiltMessage{}, fmt.Errorf("close dsn message writer: %w", err)
	}

	return BuiltMessage{
		Raw:       raw.Bytes(),
		MessageID: "<" + messageID + ">",
		From:      from.Address,
		To:        to.Address,
	}, nil
}

func writeHumanReportPart(parent *message.Writer, report humanReport) error {
	var header message.Header
	header.SetContentType("multipart/alternative", nil)
	part, err := parent.CreatePart(header)
	if err != nil {
		return fmt.Errorf("create dsn human report part: %w", err)
	}
	if err := writePlainTextPart(part, report); err != nil {
		_ = part.Close()
		return err
	}
	if err := writeHTMLPart(part, report); err != nil {
		_ = part.Close()
		return err
	}
	if err := part.Close(); err != nil {
		return fmt.Errorf("close dsn human report part: %w", err)
	}
	return nil
}

func writePlainTextPart(parent *message.Writer, report humanReport) error {
	body, err := renderPlainReport(report)
	if err != nil {
		return err
	}
	var header message.Header
	header.SetContentType("text/plain", map[string]string{"charset": "utf-8"})
	header.SetText("Content-Transfer-Encoding", "quoted-printable")
	part, err := parent.CreatePart(header)
	if err != nil {
		return fmt.Errorf("create dsn plain text part: %w", err)
	}
	if _, err := part.Write(body); err != nil {
		_ = part.Close()
		return fmt.Errorf("write dsn plain text part: %w", err)
	}
	if err := part.Close(); err != nil {
		return fmt.Errorf("close dsn plain text part: %w", err)
	}
	return nil
}

func writeHTMLPart(parent *message.Writer, report humanReport) error {
	body, err := renderHTMLReport(report)
	if err != nil {
		return err
	}
	var header message.Header
	header.SetContentType("text/html", map[string]string{"charset": "utf-8"})
	header.SetText("Content-Transfer-Encoding", "quoted-printable")
	part, err := parent.CreatePart(header)
	if err != nil {
		return fmt.Errorf("create dsn html part: %w", err)
	}
	if _, err := part.Write(body); err != nil {
		_ = part.Close()
		return fmt.Errorf("write dsn html part: %w", err)
	}
	if err := part.Close(); err != nil {
		return fmt.Errorf("close dsn html part: %w", err)
	}
	return nil
}

type deliveryStatus struct {
	ReportingDomain   string
	ReceivedAt        time.Time
	LastAttemptAt     time.Time
	OriginalRecipient string
	FinalRecipient    string
	Action            string
	Status            string
	DiagnosticCode    string
}

func writeDeliveryStatusPart(parent *message.Writer, status deliveryStatus) error {
	var header message.Header
	header.SetContentType("message/delivery-status", nil)
	header.SetText("Content-Transfer-Encoding", "7bit")
	part, err := parent.CreatePart(header)
	if err != nil {
		return fmt.Errorf("create delivery-status part: %w", err)
	}
	body, err := deliveryStatusBody(status)
	if err != nil {
		_ = part.Close()
		return err
	}
	if _, err := part.Write(body); err != nil {
		_ = part.Close()
		return fmt.Errorf("write delivery-status part: %w", err)
	}
	if err := part.Close(); err != nil {
		return fmt.Errorf("close delivery-status part: %w", err)
	}
	return nil
}

func deliveryStatusBody(status deliveryStatus) ([]byte, error) {
	perMessage := messagetextproto.HeaderFromMap(map[string][]string{
		"Reporting-MTA": {"dns; " + status.ReportingDomain},
		"Arrival-Date":  {status.ReceivedAt.UTC().Format(time.RFC1123Z)},
	})
	perRecipient := messagetextproto.HeaderFromMap(map[string][]string{
		"Original-Recipient": {"rfc822; " + status.OriginalRecipient},
		"Final-Recipient":    {"rfc822; " + status.FinalRecipient},
		"Action":             {status.Action},
		"Status":             {status.Status},
		"Diagnostic-Code":    {status.DiagnosticCode},
		"Last-Attempt-Date":  {status.LastAttemptAt.UTC().Format(time.RFC1123Z)},
	})

	var body bytes.Buffer
	if err := messagetextproto.WriteHeader(&body, perMessage); err != nil {
		return nil, fmt.Errorf("serialize dsn per-message fields: %w", err)
	}
	if err := messagetextproto.WriteHeader(&body, perRecipient); err != nil {
		return nil, fmt.Errorf("serialize dsn per-recipient fields: %w", err)
	}
	return body.Bytes(), nil
}

func writeOriginalMessagePart(parent *message.Writer, raw []byte) error {
	var header message.Header
	header.SetContentType("message/rfc822", nil)
	part, err := parent.CreatePart(header)
	if err != nil {
		return fmt.Errorf("create original message part: %w", err)
	}
	if _, err := part.Write(raw); err != nil {
		_ = part.Close()
		return fmt.Errorf("write original message part: %w", err)
	}
	if err := part.Close(); err != nil {
		return fmt.Errorf("close original message part: %w", err)
	}
	return nil
}

func renderPlainReport(report humanReport) ([]byte, error) {
	var body bytes.Buffer
	if err := plainReportTemplate.Execute(&body, report); err != nil {
		return nil, fmt.Errorf("render dsn plain text report: %w", err)
	}
	return body.Bytes(), nil
}

func renderHTMLReport(report humanReport) ([]byte, error) {
	var body bytes.Buffer
	if err := htmlReportTemplate.Execute(&body, report); err != nil {
		return nil, fmt.Errorf("render dsn html report: %w", err)
	}
	return body.Bytes(), nil
}

func parseOriginalMessage(raw []byte) (originalMessage, error) {
	if len(raw) == 0 {
		return originalMessage{}, fmt.Errorf("missing original message")
	}
	reader := bufio.NewReader(bytes.NewReader(raw))
	headers, err := messagetextproto.ReadHeader(reader)
	if err != nil {
		return originalMessage{}, fmt.Errorf("parse original message headers: %w", err)
	}
	mailHeader := messagemail.Header{
		Header: message.Header{
			Header: headers,
		},
	}
	messageID, err := mailHeader.MessageID()
	if err != nil {
		messageID = ""
	}
	return originalMessage{
		Raw:       bytes.Clone(raw),
		MessageID: messageID,
	}, nil
}
