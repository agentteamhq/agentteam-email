package rfc822

import (
	"bufio"
	"bytes"
	"encoding/base64"
	"fmt"
	"io"
	"mime"
	"net/mail"
	stdtextproto "net/textproto"
	"slices"
	"strings"

	"agent-mail/internal/mail/dsn"
	"agent-mail/internal/mail/structured"
	"agent-mail/internal/providers/cloudflaremail"

	"github.com/emersion/go-message"
	messagemail "github.com/emersion/go-message/mail"
	messagetextproto "github.com/emersion/go-message/textproto"
	"github.com/jhillyerd/enmime"
	moxmessage "github.com/mjl-/mox/message"
)

type Address struct {
	Name    string
	Address string
}

type Submission struct {
	From                   Address
	ReplyTo                *Address
	To                     []string
	CC                     []string
	BCC                    []string
	Subject                string
	Text                   string
	HTML                   string
	Headers                map[string]string
	Attach                 []cloudflaremail.Attachment
	RawMessage             []byte
	ZoneMTAQueueID         string
	MessageID              string
	ReplayIngestID         string
	ReplayEnvelopeFrom     string
	ReplayEnvelopeTo       string
	IsDSN                  bool
	InternalDSNID          string
	InternalSourceIngestID string
}

type ProviderRawOptions struct {
	ReturnPath string
}

var allowedCloudflareHeaders = map[string]struct{}{
	"In-Reply-To":              {},
	"References":               {},
	"List-ID":                  {},
	"List-Help":                {},
	"List-Owner":               {},
	"List-Post":                {},
	"List-Subscribe":           {},
	"List-Unsubscribe":         {},
	"List-Unsubscribe-Post":    {},
	"Auto-Submitted":           {},
	"Precedence":               {},
	"X-Auto-Response-Suppress": {},
}

var forbiddenProviderHeaders = map[string]struct{}{
	"authentication-results":            {},
	"bcc":                               {},
	"dkim-signature":                    {},
	"received":                          {},
	"return-path":                       {},
	"x-atm-ingest-id":                   {},
	"x-agent-mail-dsn-id":               {},
	"x-agent-mail-dsn-source-ingest-id": {},
	"x-agent-mail-local-route-id":       {},
	"x-agent-mail-source-mailbox":       {},
	"x-agent-mail-target-mailbox":       {},
	"x-agent-mail-source-ingest-id":     {},
	"x-ses-configuration-set":           {},
	"x-ses-from-arn":                    {},
	"x-ses-return-path-arn":             {},
	"x-ses-source-arn":                  {},
	"x-agent-mail-zonemta-queue-id":     {},
	"x-spam":                            {},
	"x-spam-flag":                       {},
	"x-spam-level":                      {},
	"x-spam-score":                      {},
	"x-spam-status":                     {},
	"x-spamd-bar":                       {},
	"x-spamd-result":                    {},
	"x-virus-scanned":                   {},
}

func ProjectReplayHeaders(raw []byte, replayHeaders map[string]string) ([]byte, error) {
	if len(raw) == 0 {
		return nil, fmt.Errorf("cannot project replay headers onto an empty message")
	}
	if len(replayHeaders) == 0 {
		return nil, fmt.Errorf("missing replay headers for projection")
	}

	headers, body, err := readMessageHeaderAndBody(raw)
	if err != nil {
		return nil, err
	}

	keys := make([]string, 0, len(replayHeaders))
	for key := range replayHeaders {
		if !isReplayHeaderName(key) {
			return nil, fmt.Errorf("invalid replay header %q", key)
		}
		if strings.TrimSpace(replayHeaders[key]) == "" {
			return nil, fmt.Errorf("empty replay header value for %q", key)
		}
		keys = append(keys, key)
	}
	slices.Sort(keys)

	fields := headers.Fields()
	for fields.Next() {
		if isReplayHeaderName(fields.Key()) {
			fields.Del()
		}
	}
	// Preserve Cloudflare boundary evidence without leaving it active for the
	// Haraka/WildDuck replay auth boundary.
	namespaceCloudflareBoundaryHeaders(&headers)

	for index := len(keys) - 1; index >= 0; index-- {
		key := keys[index]
		headers.Add(key, strings.TrimSpace(replayHeaders[key]))
	}

	var projected bytes.Buffer
	if err := messagetextproto.WriteHeader(&projected, headers); err != nil {
		return nil, fmt.Errorf("serialize projected replay headers: %w", err)
	}
	projected.Write(body)
	return projected.Bytes(), nil
}

type projectedCloudflareBoundaryHeader struct {
	name  string
	value string
}

func namespaceCloudflareBoundaryHeaders(headers *messagetextproto.Header) {
	projected := []projectedCloudflareBoundaryHeader{}
	fields := headers.Fields()
	for fields.Next() {
		value := strings.TrimSpace(fields.Value())
		if name, ok := cloudflareBoundaryReplayHeaderName(fields.Key(), value); ok {
			projected = append(projected, projectedCloudflareBoundaryHeader{name: name, value: value})
			fields.Del()
		}
	}
	for index := len(projected) - 1; index >= 0; index-- {
		headers.Add(projected[index].name, projected[index].value)
	}
}

func cloudflareBoundaryReplayHeaderName(key string, value string) (string, bool) {
	if value == "" {
		return "", false
	}
	canonical := canonicalCloudflareBoundaryHeaderName(key)
	switch strings.ToLower(canonical) {
	case "authentication-results":
		parsed, err := moxmessage.ParseAuthResults(value + "\r\n")
		if err != nil || !strings.EqualFold(parsed.Hostname, "mx.cloudflare.net") {
			return "", false
		}
	case "arc-authentication-results":
		if !strings.Contains(strings.ToLower(value), "mx.cloudflare.net") {
			return "", false
		}
	case "received-spf":
		if !strings.Contains(strings.ToLower(value), "mx.cloudflare.net") {
			return "", false
		}
	case "received":
		if !strings.Contains(strings.ToLower(value), "cloudflare-email.net") {
			return "", false
		}
	case "arc-seal", "arc-message-signature":
		if !strings.Contains(strings.ToLower(value), "d=cloudflare-email.net") {
			return "", false
		}
	default:
		return "", false
	}
	return "X-ATMCF-Cloudflare-" + canonical, true
}

func canonicalCloudflareBoundaryHeaderName(key string) string {
	canonical := stdtextproto.CanonicalMIMEHeaderKey(strings.TrimSpace(key))
	canonical = strings.ReplaceAll(canonical, "-Spf", "-SPF")
	return canonical
}

func ProjectLocalRouteHeaders(raw []byte, routeHeaders map[string]string) ([]byte, error) {
	if len(raw) == 0 {
		return nil, fmt.Errorf("cannot project local route headers onto an empty message")
	}
	if len(routeHeaders) == 0 {
		return nil, fmt.Errorf("missing local route headers for projection")
	}

	headers, body, err := readMessageHeaderAndBody(raw)
	if err != nil {
		return nil, err
	}

	canonicalHeaders := make(map[string]string, len(routeHeaders))
	keys := make([]string, 0, len(routeHeaders))
	for key, value := range routeHeaders {
		if !isLocalRouteHeaderName(key) {
			return nil, fmt.Errorf("invalid local route header %q", key)
		}
		if strings.TrimSpace(value) == "" {
			return nil, fmt.Errorf("empty local route header value for %q", key)
		}
		canonical := stdtextproto.CanonicalMIMEHeaderKey(key)
		canonicalHeaders[canonical] = strings.TrimSpace(value)
		keys = append(keys, canonical)
	}
	slices.Sort(keys)

	fields := headers.Fields()
	for fields.Next() {
		if _, ok := canonicalHeaders[stdtextproto.CanonicalMIMEHeaderKey(fields.Key())]; ok {
			fields.Del()
		}
	}

	for index := len(keys) - 1; index >= 0; index-- {
		key := keys[index]
		headers.Add(key, canonicalHeaders[key])
	}

	var projected bytes.Buffer
	if err := messagetextproto.WriteHeader(&projected, headers); err != nil {
		return nil, fmt.Errorf("serialize local route headers: %w", err)
	}
	projected.Write(body)
	return projected.Bytes(), nil
}

func BuildSubmission(raw []byte, envelopeFrom string, envelopeRecipients []string, authenticatedAddress string) (Submission, error) {
	if len(raw) == 0 {
		return Submission{}, fmt.Errorf("missing raw smtp message")
	}
	if envelopeFrom == "" {
		return Submission{}, fmt.Errorf("missing smtp envelope from address")
	}
	if len(envelopeRecipients) == 0 {
		return Submission{}, fmt.Errorf("missing smtp envelope recipients")
	}
	if authenticatedAddress == "" {
		return Submission{}, fmt.Errorf("missing authenticated mailbox address")
	}

	env, err := enmime.ReadEnvelope(bytes.NewReader(raw))
	if err != nil {
		return Submission{}, fmt.Errorf("parse smtp message: %w", err)
	}

	root := env.Root.Header

	from, err := parseSingleAddress(root.Get("From"))
	if err != nil {
		return Submission{}, fmt.Errorf("parse From header: %w", err)
	}

	if normalizeAddress(from.Address) != normalizeAddress(authenticatedAddress) {
		return Submission{}, fmt.Errorf("from header address %q does not match authenticated mailbox %q", from.Address, authenticatedAddress)
	}
	if normalizeAddress(envelopeFrom) != normalizeAddress(authenticatedAddress) {
		return Submission{}, fmt.Errorf("smtp envelope from %q does not match authenticated mailbox %q", envelopeFrom, authenticatedAddress)
	}

	replyTo, err := parseOptionalSingleAddress(root.Get("Reply-To"))
	if err != nil {
		return Submission{}, fmt.Errorf("parse Reply-To header: %w", err)
	}

	toAddrs, err := parseAddressList(root.Get("To"))
	if err != nil {
		return Submission{}, fmt.Errorf("parse To header: %w", err)
	}
	ccAddrs, err := parseAddressList(root.Get("Cc"))
	if err != nil {
		return Submission{}, fmt.Errorf("parse Cc header: %w", err)
	}
	bccAddrs, err := parseAddressList(root.Get("Bcc"))
	if err != nil {
		return Submission{}, fmt.Errorf("parse Bcc header: %w", err)
	}

	envelopeSet := make(map[string]struct{}, len(envelopeRecipients))
	for _, recipient := range envelopeRecipients {
		normalized := normalizeAddress(recipient)
		if normalized == "" {
			return Submission{}, fmt.Errorf("smtp envelope recipient list contains an empty address")
		}
		envelopeSet[normalized] = struct{}{}
	}

	to := addressesToStrings(toAddrs)
	cc := addressesToStrings(ccAddrs)
	headerBCC := addressesToStrings(bccAddrs)
	for _, recipient := range append(append([]string{}, to...), append(cc, headerBCC...)...) {
		if _, ok := envelopeSet[normalizeAddress(recipient)]; !ok {
			return Submission{}, fmt.Errorf("header recipient %q is not present in smtp envelope recipients", recipient)
		}
	}

	bcc := headerBCC
	if len(bcc) == 0 {
		visibleSet := make(map[string]struct{}, len(to)+len(cc))
		for _, recipient := range append(append([]string{}, to...), cc...) {
			visibleSet[normalizeAddress(recipient)] = struct{}{}
		}

		for recipient := range envelopeSet {
			if _, ok := visibleSet[recipient]; !ok {
				bcc = append(bcc, recipient)
			}
		}
		slices.Sort(bcc)
	}

	if len(to) == 0 && len(cc) == 0 && len(bcc) == 0 {
		return Submission{}, fmt.Errorf("message has no recipients after smtp envelope reconciliation")
	}

	subject, err := decodeHeader(root.Get("Subject"))
	if err != nil {
		return Submission{}, fmt.Errorf("parse Subject header: %w", err)
	}
	if strings.TrimSpace(subject) == "" {
		return Submission{}, fmt.Errorf("missing Subject header")
	}

	headers := make(map[string]string)
	for key, values := range root {
		canonical := stdtextproto.CanonicalMIMEHeaderKey(key)
		switch canonical {
		case "From", "To", "Cc", "Bcc", "Subject", "Reply-To", "Date", "Message-Id", "Message-ID", "Mime-Version", "Content-Type", "Content-Transfer-Encoding", "Received", "Return-Path", "DKIM-Signature", "ARC-Seal", "ARC-Message-Signature", "ARC-Authentication-Results":
			continue
		}
		if !projectProviderMetadataHeader(canonical) {
			continue
		}
		if len(values) > 1 {
			return Submission{}, fmt.Errorf("multiple %s headers are not supported for outbound provider metadata", canonical)
		}
		headers[canonical] = values[0]
	}

	var attachments []cloudflaremail.Attachment
	for _, part := range env.Inlines {
		attachments = append(attachments, toAttachment(part, "inline"))
	}
	for _, part := range env.Attachments {
		attachments = append(attachments, toAttachment(part, "attachment"))
	}

	submission := Submission{
		From:       from,
		ReplyTo:    replyTo,
		To:         to,
		CC:         cc,
		BCC:        bcc,
		Subject:    subject,
		Text:       env.Text,
		HTML:       env.HTML,
		Headers:    headers,
		Attach:     attachments,
		RawMessage: bytes.Clone(raw),
	}

	return submission, nil
}

func BuildProviderRelaySubmission(raw []byte, envelopeFrom string, envelopeRecipients []string) (Submission, error) {
	if len(raw) == 0 {
		return Submission{}, fmt.Errorf("missing raw smtp message")
	}
	if len(envelopeRecipients) == 0 {
		return Submission{}, fmt.Errorf("missing smtp envelope recipients")
	}
	if envelopeFrom != "" && normalizeAddress(envelopeFrom) == "" {
		return Submission{}, fmt.Errorf("invalid smtp envelope from address")
	}

	env, err := enmime.ReadEnvelope(bytes.NewReader(raw))
	if err != nil {
		return Submission{}, fmt.Errorf("parse smtp message: %w", err)
	}

	root := env.Root.Header
	zoneMTAQueueID := strings.TrimSpace(root.Get("X-Agent-Mail-ZoneMTA-Queue-ID"))
	if zoneMTAQueueID == "" {
		return Submission{}, fmt.Errorf("missing X-Agent-Mail-ZoneMTA-Queue-ID header")
	}
	messageHeaders, _, err := readMessageHeaderAndBody(raw)
	if err != nil {
		return Submission{}, err
	}
	mailHeader := messagemail.Header{
		Header: message.Header{
			Header: messageHeaders,
		},
	}
	messageID, _ := mailHeader.MessageID()
	isDSN := deliveryStatusNotificationFromHeader(mailHeader.Header)

	from, err := parseSingleAddress(root.Get("From"))
	if err != nil {
		return Submission{}, fmt.Errorf("parse From header: %w", err)
	}

	replyTo, err := parseOptionalSingleAddress(root.Get("Reply-To"))
	if err != nil {
		return Submission{}, fmt.Errorf("parse Reply-To header: %w", err)
	}

	toAddrs, err := parseAddressList(root.Get("To"))
	if err != nil {
		return Submission{}, fmt.Errorf("parse To header: %w", err)
	}
	ccAddrs, err := parseAddressList(root.Get("Cc"))
	if err != nil {
		return Submission{}, fmt.Errorf("parse Cc header: %w", err)
	}
	bccAddrs, err := parseAddressList(root.Get("Bcc"))
	if err != nil {
		return Submission{}, fmt.Errorf("parse Bcc header: %w", err)
	}

	envelopeSet := make(map[string]struct{}, len(envelopeRecipients))
	for _, recipient := range envelopeRecipients {
		normalized := normalizeAddress(recipient)
		if normalized == "" {
			return Submission{}, fmt.Errorf("smtp envelope recipient list contains an empty address")
		}
		envelopeSet[normalized] = struct{}{}
	}

	to := addressesToStringsInSet(toAddrs, envelopeSet)
	cc := addressesToStringsInSet(ccAddrs, envelopeSet)
	bcc := addressesToStringsInSet(bccAddrs, envelopeSet)
	visibleSet := make(map[string]struct{}, len(to)+len(cc)+len(bcc))
	for _, recipient := range append(append(append([]string{}, to...), cc...), bcc...) {
		visibleSet[normalizeAddress(recipient)] = struct{}{}
	}
	for recipient := range envelopeSet {
		if _, ok := visibleSet[recipient]; !ok {
			bcc = append(bcc, recipient)
		}
	}
	slices.Sort(bcc)

	if len(to) == 0 && len(cc) == 0 && len(bcc) == 0 {
		return Submission{}, fmt.Errorf("message has no recipients after smtp envelope reconciliation")
	}

	subject, err := decodeHeader(root.Get("Subject"))
	if err != nil {
		return Submission{}, fmt.Errorf("parse Subject header: %w", err)
	}
	if strings.TrimSpace(subject) == "" {
		return Submission{}, fmt.Errorf("missing Subject header")
	}

	headers := make(map[string]string)
	for key, values := range root {
		canonical := stdtextproto.CanonicalMIMEHeaderKey(key)
		switch canonical {
		case "From", "To", "Cc", "Bcc", "Subject", "Reply-To", "Date", "Message-Id", "Message-ID", "Mime-Version", "Content-Type", "Content-Transfer-Encoding", "Received", "Return-Path", "DKIM-Signature", "ARC-Seal", "ARC-Message-Signature", "ARC-Authentication-Results":
			continue
		}
		if !projectProviderMetadataHeader(canonical) {
			continue
		}
		if len(values) > 1 {
			return Submission{}, fmt.Errorf("multiple %s headers are not supported for outbound provider metadata", canonical)
		}
		headers[canonical] = values[0]
	}

	var attachments []cloudflaremail.Attachment
	for _, part := range env.Inlines {
		attachments = append(attachments, toAttachment(part, "inline"))
	}
	for _, part := range env.Attachments {
		attachments = append(attachments, toAttachment(part, "attachment"))
	}

	return Submission{
		From:                   from,
		ReplyTo:                replyTo,
		To:                     to,
		CC:                     cc,
		BCC:                    bcc,
		Subject:                subject,
		Text:                   env.Text,
		HTML:                   env.HTML,
		Headers:                headers,
		Attach:                 attachments,
		RawMessage:             bytes.Clone(raw),
		ZoneMTAQueueID:         zoneMTAQueueID,
		MessageID:              messageID,
		ReplayIngestID:         strings.TrimSpace(root.Get("X-ATM-Ingest-ID")),
		ReplayEnvelopeFrom:     strings.TrimSpace(root.Get("X-ATMCF-Edge-Envelope-From")),
		ReplayEnvelopeTo:       strings.TrimSpace(root.Get("X-ATMCF-Edge-Envelope-To")),
		IsDSN:                  isDSN,
		InternalDSNID:          strings.TrimSpace(root.Get(dsn.InternalDSNIDHeader)),
		InternalSourceIngestID: strings.TrimSpace(root.Get(dsn.InternalSourceIngestIDHeader)),
	}, nil
}

func SanitizeProviderHeaders(headers map[string]string) map[string]string {
	if len(headers) == 0 {
		return nil
	}

	sanitized := make(map[string]string, len(headers))
	for key, value := range headers {
		canonical := stdtextproto.CanonicalMIMEHeaderKey(key)
		if IsForbiddenProviderHeader(canonical) {
			continue
		}
		sanitized[canonical] = value
	}
	if len(sanitized) == 0 {
		return nil
	}
	return sanitized
}

func BuildProviderRaw(raw []byte, opts ProviderRawOptions) ([]byte, error) {
	if len(raw) == 0 {
		return nil, fmt.Errorf("missing raw message")
	}

	headers, body, err := readMessageHeaderAndBody(raw)
	if err != nil {
		return nil, err
	}

	fields := headers.Fields()
	for fields.Next() {
		if IsForbiddenProviderHeader(fields.Key()) {
			fields.Del()
		}
	}

	if strings.TrimSpace(opts.ReturnPath) != "" {
		formatted, err := formatReturnPath(opts.ReturnPath)
		if err != nil {
			return nil, err
		}
		headers.Add("Return-Path", formatted)
	}

	var out bytes.Buffer
	if err := messagetextproto.WriteHeader(&out, headers); err != nil {
		return nil, fmt.Errorf("serialize provider raw headers: %w", err)
	}
	out.Write(body)
	return out.Bytes(), nil
}

func AddHeaderIfAbsent(raw []byte, name string, value string) ([]byte, error) {
	if len(raw) == 0 {
		return nil, fmt.Errorf("missing raw message")
	}
	canonical := stdtextproto.CanonicalMIMEHeaderKey(strings.TrimSpace(name))
	if canonical == "" || strings.ContainsAny(canonical, ":\r\n") {
		return nil, fmt.Errorf("invalid header name %q", name)
	}
	normalizedValue := strings.TrimSpace(value)
	if normalizedValue == "" || strings.ContainsAny(normalizedValue, "\r\n") {
		return nil, fmt.Errorf("invalid %s header value", canonical)
	}
	headers, body, err := readMessageHeaderAndBody(raw)
	if err != nil {
		return nil, err
	}
	fields := headers.Fields()
	for fields.Next() {
		if strings.EqualFold(fields.Key(), canonical) {
			return nil, fmt.Errorf("raw message must not include %s header", canonical)
		}
	}
	headers.Add(canonical, normalizedValue)

	var out bytes.Buffer
	if err := messagetextproto.WriteHeader(&out, headers); err != nil {
		return nil, fmt.Errorf("serialize message headers: %w", err)
	}
	out.Write(body)
	return out.Bytes(), nil
}

func FormatAddress(address Address) string {
	normalized := normalizeAddress(address.Address)
	if normalized == "" {
		return ""
	}
	var header messagemail.Header
	header.SetAddressList("From", []*mail.Address{{
		Name:    strings.TrimSpace(address.Name),
		Address: normalized,
	}})
	return strings.TrimSpace(header.Get("From"))
}

func FormatMessageID(messageID string) string {
	trimmed := strings.Trim(strings.TrimSpace(messageID), "<>")
	if trimmed == "" {
		return ""
	}
	var header messagemail.Header
	header.SetMessageID(trimmed)
	return strings.TrimSpace(header.Get("Message-Id"))
}

func HeaderValue(lines []string, name string) string {
	if len(lines) == 0 {
		return ""
	}
	var raw bytes.Buffer
	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		raw.WriteString(line)
		raw.WriteString("\r\n")
	}
	raw.WriteString("\r\n")
	headers, _, err := readMessageHeaderAndBody(raw.Bytes())
	if err != nil {
		return ""
	}
	return strings.TrimSpace(headers.Get(name))
}

func IsForbiddenProviderHeader(name string) bool {
	normalized := strings.ToLower(strings.TrimSpace(name))
	if normalized == "" {
		return true
	}
	if _, ok := forbiddenProviderHeaders[normalized]; ok {
		return true
	}
	if strings.HasPrefix(normalized, "arc-") {
		return true
	}
	if strings.HasPrefix(normalized, "x-atmcf-") {
		return true
	}
	if strings.HasPrefix(normalized, "x-haraka-") {
		return true
	}
	// ZoneMTA loop/provenance headers are internal transport state. WildDuck
	// forwards can legitimately contain repeated X-Zone-* headers; they must be
	// dropped before provider metadata duplicate validation so native WildDuck
	// forwarding is not rejected by the relay.
	if strings.HasPrefix(normalized, "x-zone-") {
		return true
	}
	if strings.HasPrefix(normalized, "x-rspamd-") {
		return true
	}
	return strings.HasPrefix(normalized, "x-spam-")
}

func projectProviderMetadataHeader(canonical string) bool {
	if IsForbiddenProviderHeader(canonical) {
		return false
	}
	if _, ok := allowedCloudflareHeaders[canonical]; ok {
		return true
	}
	return strings.HasPrefix(canonical, "X-")
}

func parseSingleAddress(value string) (Address, error) {
	if strings.TrimSpace(value) == "" {
		return Address{}, fmt.Errorf("missing header value")
	}
	addr, err := mail.ParseAddress(value)
	if err != nil {
		return Address{}, err
	}
	return Address{
		Name:    addr.Name,
		Address: addr.Address,
	}, nil
}

func parseOptionalSingleAddress(value string) (*Address, error) {
	if strings.TrimSpace(value) == "" {
		return nil, nil
	}
	addr, err := parseSingleAddress(value)
	if err != nil {
		return nil, err
	}
	return &addr, nil
}

func parseAddressList(value string) ([]*mail.Address, error) {
	if strings.TrimSpace(value) == "" {
		return nil, nil
	}
	return mail.ParseAddressList(value)
}

func addressesToStrings(input []*mail.Address) []string {
	if len(input) == 0 {
		return nil
	}

	seen := make(map[string]struct{}, len(input))
	addresses := make([]string, 0, len(input))
	for _, addr := range input {
		normalized := normalizeAddress(addr.Address)
		if normalized == "" {
			continue
		}
		if _, exists := seen[normalized]; exists {
			continue
		}
		seen[normalized] = struct{}{}
		addresses = append(addresses, normalized)
	}
	return addresses
}

func addressesToStringsInSet(input []*mail.Address, allowed map[string]struct{}) []string {
	if len(input) == 0 {
		return nil
	}

	seen := make(map[string]struct{}, len(input))
	addresses := make([]string, 0, len(input))
	for _, addr := range input {
		normalized := normalizeAddress(addr.Address)
		if normalized == "" {
			continue
		}
		if _, ok := allowed[normalized]; !ok {
			continue
		}
		if _, exists := seen[normalized]; exists {
			continue
		}
		seen[normalized] = struct{}{}
		addresses = append(addresses, normalized)
	}
	return addresses
}

func normalizeAddress(value string) string {
	address, err := structured.NormalizeMailbox(value)
	if err != nil {
		return ""
	}
	return address
}

func decodeHeader(value string) (string, error) {
	if strings.TrimSpace(value) == "" {
		return "", nil
	}
	decoder := mime.WordDecoder{}
	decoded, err := decoder.DecodeHeader(value)
	if err != nil {
		return "", err
	}
	return decoded, nil
}

func toAttachment(part *enmime.Part, disposition string) cloudflaremail.Attachment {
	return cloudflaremail.Attachment{
		Content:     base64.StdEncoding.EncodeToString(part.Content),
		Filename:    part.FileName,
		Type:        part.ContentType,
		Disposition: disposition,
		ContentID:   part.ContentID,
	}
}

func formatReturnPath(value string) (string, error) {
	if value == "" {
		return "", fmt.Errorf("missing return path address")
	}
	addr, err := mail.ParseAddress(value)
	if err != nil {
		return "", fmt.Errorf("parse return path: %w", err)
	}
	if addr.Name != "" {
		return "", fmt.Errorf("return path must not include a display name")
	}
	return addr.String(), nil
}

func readMessageHeaderAndBody(raw []byte) (messagetextproto.Header, []byte, error) {
	reader := bufio.NewReader(bytes.NewReader(raw))
	headers, err := messagetextproto.ReadHeader(reader)
	if err != nil {
		return messagetextproto.Header{}, nil, fmt.Errorf("parse message headers: %w", err)
	}

	body, err := io.ReadAll(reader)
	if err != nil {
		return messagetextproto.Header{}, nil, fmt.Errorf("read message body: %w", err)
	}
	return headers, body, nil
}

func deliveryStatusNotificationFromHeader(header message.Header) bool {
	contentType, params, err := header.ContentType()
	if err != nil {
		return false
	}
	return strings.EqualFold(contentType, "multipart/report") && strings.EqualFold(params["report-type"], "delivery-status")
}

func isReplayHeaderName(name string) bool {
	normalized := strings.ToLower(strings.TrimSpace(name))
	return strings.HasPrefix(normalized, "x-atmcf-") || normalized == "x-atm-ingest-id"
}

func isLocalRouteHeaderName(name string) bool {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "x-agent-mail-local-route-id",
		"x-agent-mail-source-mailbox",
		"x-agent-mail-target-mailbox",
		"x-agent-mail-source-ingest-id",
		"x-agent-mail-zonemta-queue-id":
		return true
	default:
		return false
	}
}
