package messageprovenance

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"agent-mail/internal/archive/r2archive"
	"agent-mail/internal/mail/rfc822"

	"github.com/emersion/go-message"
	moxmessage "github.com/mjl-/mox/message"
)

const (
	archiveStatusAvailable       = "available"
	archiveStatusUnavailable     = "unavailable"
	cloudflareEdgeEvidenceSchema = "agent-mail.cloudflare-edge-evidence.v1"
)

func (s *Service) Security(ctx context.Context, params Params) (MessageSecurityResult, error) {
	identity, err := normalizeParams(params)
	if err != nil {
		return MessageSecurityResult{}, err
	}
	raw, err := s.fetcher.FetchMessageSource(ctx, identity.UserID, identity.MailboxID, identity.UID)
	if err != nil {
		return MessageSecurityResult{}, fmt.Errorf("fetch WildDuck message source: %w", err)
	}
	provenance, err := rfc822.ParseProvenanceHeaders(raw)
	if err != nil {
		return MessageSecurityResult{}, err
	}
	rawHeaders, err := parseMessageRawHeaders(raw)
	if err != nil {
		return MessageSecurityResult{}, err
	}
	cloudflareArchive, warnings := s.resolveCloudflareArchiveEvidence(ctx, provenance)
	authResults, receivedSPF, rspamd, err := parseSecurityHeaders(raw, provenance, cloudflareArchive)
	if err != nil {
		return MessageSecurityResult{}, err
	}
	summary := summarizeSecurity(authResults)
	deliveryKey, basis := deliveryKey(identity, provenance.IngestID)
	return MessageSecurityResult{
		DeliveryKey:           deliveryKey,
		IdempotencyBasis:      basis,
		IngestID:              provenance.IngestID,
		WildDuck:              identity,
		Source:                MessageRawSource{Source: "wildduck-final-inbound-eml", Size: len(raw), Raw: string(raw), Headers: rawHeaders},
		Cloudflare:            cloudflareSecurityEvidence(provenance.Cloudflare, cloudflareArchive),
		CloudflareArchive:     cloudflareArchive,
		HarakaWildDuck:        harakaWildDuckEvidence(authResults, summary),
		Headers:               provenance.Headers,
		AuthenticationResults: authResults,
		ReceivedSPF:           receivedSPF,
		Rspamd:                rspamd,
		Warnings:              warnings,
		Summary:               summary,
	}, nil
}

func parseMessageRawHeaders(raw []byte) ([]MessageRawHeader, error) {
	entity, err := message.Read(bytes.NewReader(raw))
	if err != nil && entity == nil {
		return nil, fmt.Errorf("parse message headers: %w", err)
	}
	if entity == nil {
		return nil, fmt.Errorf("parse message headers: no message entity")
	}
	headers := []MessageRawHeader{}
	fields := entity.Header.Fields()
	for fields.Next() {
		value := fields.Value()
		if text, textErr := fields.Text(); textErr == nil {
			value = text
		}
		headers = append(headers, MessageRawHeader{
			Name:  fields.Key(),
			Value: strings.TrimSpace(value),
		})
	}
	if err != nil && !message.IsUnknownCharset(err) && !message.IsUnknownEncoding(err) {
		return headers, fmt.Errorf("parse message headers: %w", err)
	}
	return headers, nil
}

func parseSecurityHeaders(raw []byte, provenance rfc822.ProvenanceHeaders, archive *CloudflareArchiveEvidence) ([]AuthenticationResultsHeader, []string, map[string]string, error) {
	entity, err := message.Read(bytes.NewReader(raw))
	if err != nil && entity == nil {
		return nil, nil, nil, fmt.Errorf("parse message headers: %w", err)
	}
	if entity == nil {
		return nil, nil, nil, fmt.Errorf("parse message headers: no message entity")
	}
	authResults := []AuthenticationResultsHeader{}
	receivedSPF := []string{}
	rspamd := map[string]string{}
	fields := entity.Header.Fields()
	authIndex := 0
	for fields.Next() {
		key := fields.Key()
		value, textErr := fields.Text()
		if textErr != nil {
			value = fields.Value()
		}
		value = strings.TrimSpace(value)
		switch {
		case strings.EqualFold(key, "Authentication-Results"):
			authIndex++
			authResults = append(authResults, parseAuthenticationResultsHeader(authIndex, value, provenance, archive))
		case strings.EqualFold(key, "Received-SPF"):
			if value != "" {
				receivedSPF = append(receivedSPF, value)
			}
		case strings.HasPrefix(strings.ToLower(key), "x-rspamd-"):
			if value != "" {
				rspamd[key] = value
			}
		}
	}
	if err != nil && !message.IsUnknownCharset(err) && !message.IsUnknownEncoding(err) {
		return authResults, receivedSPF, rspamd, fmt.Errorf("parse message headers: %w", err)
	}
	return authResults, receivedSPF, rspamd, nil
}

func parseAuthenticationResultsHeader(index int, value string, provenance rfc822.ProvenanceHeaders, archive *CloudflareArchiveEvidence) AuthenticationResultsHeader {
	header := AuthenticationResultsHeader{
		Index: index,
		Raw:   value,
	}
	parsed, err := moxmessage.ParseAuthResults(value + "\r\n")
	if err != nil {
		header.ParseError = err.Error()
		return header
	}
	return authenticationResultsHeaderFromParsed(index, value, parsed, trustedAuthenticationResultsBoundary(index, parsed.Hostname, provenance, archive))
}

func authenticationResultsHeaderFromParsed(index int, value string, parsed moxmessage.AuthResults, trusted bool) AuthenticationResultsHeader {
	header := AuthenticationResultsHeader{
		Index:      index,
		AuthservID: parsed.Hostname,
		Trusted:    trusted,
		Raw:        value,
	}
	for _, method := range parsed.Methods {
		properties := map[string]string{}
		for _, prop := range method.Props {
			if prop.Type == "" || prop.Property == "" {
				continue
			}
			properties[prop.Type+"."+prop.Property] = prop.Value
		}
		if len(properties) == 0 {
			properties = nil
		}
		header.Methods = append(header.Methods, AuthMethod{
			Method:     method.Method,
			Result:     method.Result,
			Reason:     method.Reason,
			Properties: properties,
		})
	}
	return header
}

func trustedAuthenticationResultsBoundary(index int, authservID string, provenance rfc822.ProvenanceHeaders, archive *CloudflareArchiveEvidence) bool {
	if index != 1 {
		return false
	}
	switch strings.ToLower(strings.TrimSpace(authservID)) {
	case "example.test", "haraka.example.test":
		return trustedAgentMailReplayBoundary(provenance, archive)
	default:
		return false
	}
}

func trustedAgentMailReplayBoundary(provenance rfc822.ProvenanceHeaders, archive *CloudflareArchiveEvidence) bool {
	if strings.TrimSpace(provenance.IngestID) == "" {
		return false
	}
	if archive == nil || archive.Status != archiveStatusAvailable {
		return false
	}
	if strings.TrimSpace(provenance.Cloudflare["X-ATMCF-Edge-Envelope-To"]) == "" {
		return false
	}
	if !strings.EqualFold(strings.TrimSpace(provenance.Cloudflare["X-ATMCF-Edge-Action"]), "worker") {
		return false
	}
	if !strings.EqualFold(strings.TrimSpace(provenance.Cloudflare["X-ATMCF-Edge-Status"]), "received") {
		return false
	}
	return true
}

func summarizeSecurity(headers []AuthenticationResultsHeader) MessageSecuritySummary {
	summary := MessageSecuritySummary{
		SPF:   SecuritySignal{Result: "unknown", Note: "no trusted Authentication-Results header found"},
		DKIM:  SecuritySignal{Result: "unknown", Note: "no trusted Authentication-Results header found"},
		DMARC: SecuritySignal{Result: "unknown", Note: "no trusted Authentication-Results header found"},
		ARC:   SecuritySignal{Result: "unknown", Note: "no trusted Authentication-Results header found"},
	}
	var trusted *AuthenticationResultsHeader
	for i := range headers {
		if headers[i].Trusted && headers[i].ParseError == "" {
			trusted = &headers[i]
			break
		}
	}
	if trusted == nil {
		return summary
	}
	source := "haraka-wildduck-mailauth"
	summary.SPFContext = "internal-replay"
	for _, method := range trusted.Methods {
		signal := signalFromAuthMethod(method, source)
		switch strings.ToLower(method.Method) {
		case "spf":
			summary.SPF = signal
			summary.MailedBy = firstNonEmpty(method.Properties["smtp.mailfrom"], method.Properties["header.from"])
		case "dkim":
			if summary.DKIM.Result == "unknown" || strings.EqualFold(method.Result, "pass") {
				summary.DKIM = signal
			}
			if summary.SignedBy == "" && strings.EqualFold(method.Result, "pass") {
				summary.SignedBy = firstNonEmpty(method.Properties["header.d"], method.Properties["header.i"])
			}
		case "dmarc":
			summary.DMARC = signal
		case "arc":
			summary.ARC = signal
		}
	}
	return summary
}

func harakaWildDuckEvidence(headers []AuthenticationResultsHeader, summary MessageSecuritySummary) HarakaWildDuckEvidence {
	evidence := HarakaWildDuckEvidence{
		Source:   archiveStatusUnavailable,
		Trusted:  false,
		MailAuth: defaultMailAuthEvidence(),
	}
	var trusted *AuthenticationResultsHeader
	for i := range headers {
		if headers[i].Trusted && headers[i].ParseError == "" {
			trusted = &headers[i]
			break
		}
	}
	if trusted == nil {
		return evidence
	}
	evidence.Source = "internal-replay"
	evidence.AuthservID = trusted.AuthservID
	evidence.Trusted = true
	evidence.MailAuth["spf"] = mailAuthEvidenceFromSignal(summary.SPF, "internal-replay")
	evidence.MailAuth["dkim"] = mailAuthEvidenceFromSignal(summary.DKIM, "message-signature")
	evidence.MailAuth["arc"] = mailAuthEvidenceFromSignal(summary.ARC, "message-signature")
	evidence.MailAuth["dmarc"] = mailAuthEvidenceFromSignal(summary.DMARC, "message-auth")
	for _, method := range trusted.Methods {
		if strings.EqualFold(method.Method, "bimi") {
			evidence.MailAuth["bimi"] = mailAuthEvidenceFromSignal(signalFromAuthMethod(method, "haraka-wildduck-mailauth"), "message-auth")
		}
	}
	return evidence
}

func defaultMailAuthEvidence() map[string]MailAuthEvidence {
	return map[string]MailAuthEvidence{
		"spf":   {Result: "unknown", Scope: "internal-replay", Source: "haraka-wildduck-mailauth", Note: "no trusted Agent Mail Authentication-Results header found"},
		"dkim":  {Result: "unknown", Scope: "message-signature", Source: "haraka-wildduck-mailauth", Note: "no trusted Agent Mail Authentication-Results header found"},
		"arc":   {Result: "unknown", Scope: "message-signature", Source: "haraka-wildduck-mailauth", Note: "no trusted Agent Mail Authentication-Results header found"},
		"dmarc": {Result: "unknown", Scope: "message-auth", Source: "haraka-wildduck-mailauth", Note: "no trusted Agent Mail Authentication-Results header found"},
		"bimi":  {Result: "unknown", Scope: "message-auth", Source: "haraka-wildduck-mailauth", Note: "no trusted Agent Mail Authentication-Results header found"},
	}
}

func mailAuthEvidenceFromSignal(signal SecuritySignal, scope string) MailAuthEvidence {
	return MailAuthEvidence{
		Result:     firstNonEmpty(signal.Result, "unknown"),
		Scope:      scope,
		Domain:     signal.Domain,
		Identifier: signal.Identifier,
		Reason:     signal.Reason,
		Source:     firstNonEmpty(signal.Source, "haraka-wildduck-mailauth"),
		Note:       signal.Note,
	}
}

func signalFromAuthMethod(method AuthMethod, source string) SecuritySignal {
	return SecuritySignal{
		Result:     firstNonEmpty(method.Result, "unknown"),
		Domain:     firstNonEmpty(method.Properties["header.d"], method.Properties["smtp.mailfrom"], method.Properties["header.from"]),
		Identifier: firstNonEmpty(method.Properties["header.i"], method.Properties["smtp.helo"]),
		Reason:     method.Reason,
		Source:     source,
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

type archivedEdgeManifest struct {
	Schema                 string         `json:"schema"`
	IngestID               string         `json:"ingest_id"`
	RawKey                 string         `json:"raw_key"`
	EdgeKey                string         `json:"edge_key"`
	RawSHA256              string         `json:"raw_sha256"`
	EnvelopeFrom           string         `json:"envelope_from"`
	EnvelopeTo             string         `json:"envelope_to"`
	ReceivedAt             string         `json:"received_at"`
	CloudflareEdgeEvidence map[string]any `json:"cloudflare_edge_evidence"`
}

type cloudflareRawSecurityEvidence struct {
	AuthenticationResults []AuthenticationResultsHeader
	ReceivedSPF           []string
	Received              []string
}

func (s *Service) resolveCloudflareArchiveEvidence(ctx context.Context, provenance rfc822.ProvenanceHeaders) (*CloudflareArchiveEvidence, []string) {
	if s.archive == nil {
		return unavailableCloudflareArchive("r2_archive_reader_not_configured"), nil
	}
	if strings.TrimSpace(provenance.IngestID) == "" {
		return unavailableCloudflareArchive("ingest_id_missing"), nil
	}

	envelopeTo := firstNonEmpty(provenance.Cloudflare["X-ATMCF-Edge-Envelope-To"])
	if envelopeTo == "" {
		return unavailableCloudflareArchive("cloudflare_envelope_to_missing"), nil
	}
	provenanceEnvelopeFromHeader := strings.TrimSpace(provenance.Cloudflare["X-ATMCF-Edge-Envelope-From"])
	provenanceEnvelopeFrom := normalizeArchiveEnvelopeFrom(provenanceEnvelopeFromHeader)
	provenanceReceivedAt := strings.TrimSpace(provenance.Cloudflare["X-ATMCF-Edge-Received-At"])
	recipientDomain, err := r2archive.CanonicalDomainFromAddress(envelopeTo)
	if err != nil {
		return unavailableCloudflareArchive("cloudflare_envelope_to_invalid"), []string{fmt.Sprintf("derive archive recipient domain: %v", err)}
	}
	receivedAt, err := r2archive.UUIDv7Time(provenance.IngestID)
	if err != nil {
		return unavailableCloudflareArchive("cloudflare_ingest_id_time_invalid"), []string{fmt.Sprintf("derive archive received_at from ingest_id: %v", err)}
	}
	bundle, err := r2archive.InboundBundleKeys(recipientDomain, receivedAt, provenance.IngestID)
	if err != nil {
		return unavailableCloudflareArchive("cloudflare_archive_key_invalid"), []string{fmt.Sprintf("derive archive bundle keys: %v", err)}
	}

	data, err := s.archive.GetBytes(ctx, bundle.EdgeKey)
	if err != nil {
		return &CloudflareArchiveEvidence{
			Status:  archiveStatusUnavailable,
			Reason:  "cloudflare_edge_manifest_unavailable",
			RawKey:  bundle.RawKey,
			EdgeKey: bundle.EdgeKey,
		}, []string{fmt.Sprintf("read Cloudflare edge manifest %q: %v", bundle.EdgeKey, err)}
	}

	var manifest archivedEdgeManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return &CloudflareArchiveEvidence{
			Status:  archiveStatusUnavailable,
			Reason:  "cloudflare_edge_manifest_invalid_json",
			RawKey:  bundle.RawKey,
			EdgeKey: bundle.EdgeKey,
		}, []string{fmt.Sprintf("decode Cloudflare edge manifest %q: %v", bundle.EdgeKey, err)}
	}
	if manifest.Schema != r2archive.InboundEdgeSchema {
		return unavailableBoundArchive(bundle, "cloudflare_edge_manifest_schema_mismatch"), []string{fmt.Sprintf("Cloudflare edge manifest schema %q does not match %q", manifest.Schema, r2archive.InboundEdgeSchema)}
	}
	if manifest.IngestID != provenance.IngestID {
		return unavailableBoundArchive(bundle, "cloudflare_edge_manifest_ingest_id_mismatch"), []string{fmt.Sprintf("Cloudflare edge manifest ingest_id %q does not match %q", manifest.IngestID, provenance.IngestID)}
	}
	if manifest.RawKey != bundle.RawKey {
		return unavailableBoundArchive(bundle, "cloudflare_edge_manifest_raw_key_mismatch"), []string{fmt.Sprintf("Cloudflare edge manifest raw_key %q does not match derived key %q", manifest.RawKey, bundle.RawKey)}
	}
	if manifest.EdgeKey != bundle.EdgeKey {
		return unavailableBoundArchive(bundle, "cloudflare_edge_manifest_edge_key_mismatch"), []string{fmt.Sprintf("Cloudflare edge manifest edge_key %q does not match derived key %q", manifest.EdgeKey, bundle.EdgeKey)}
	}
	if manifest.RawSHA256 == "" {
		return unavailableBoundArchive(bundle, "cloudflare_edge_manifest_raw_sha256_missing"), nil
	}
	if strings.TrimSpace(manifest.EnvelopeTo) == "" {
		return unavailableBoundArchive(bundle, "cloudflare_edge_manifest_envelope_to_missing"), nil
	}
	if !strings.EqualFold(strings.TrimSpace(manifest.EnvelopeTo), envelopeTo) {
		return unavailableBoundArchive(bundle, "cloudflare_edge_manifest_envelope_to_mismatch"), []string{fmt.Sprintf("Cloudflare edge manifest envelope_to %q does not match provenance %q", manifest.EnvelopeTo, envelopeTo)}
	}
	if provenanceEnvelopeFromHeader != "" && !strings.EqualFold(normalizeArchiveEnvelopeFrom(manifest.EnvelopeFrom), provenanceEnvelopeFrom) {
		return unavailableBoundArchive(bundle, "cloudflare_edge_manifest_envelope_from_mismatch"), []string{fmt.Sprintf("Cloudflare edge manifest envelope_from %q does not match provenance %q", manifest.EnvelopeFrom, provenanceEnvelopeFromHeader)}
	}
	if provenanceReceivedAt != "" {
		if strings.TrimSpace(manifest.ReceivedAt) == "" {
			return unavailableBoundArchive(bundle, "cloudflare_edge_manifest_received_at_missing"), nil
		}
		if !sameArchiveInstant(manifest.ReceivedAt, provenanceReceivedAt) {
			return unavailableBoundArchive(bundle, "cloudflare_edge_manifest_received_at_mismatch"), []string{fmt.Sprintf("Cloudflare edge manifest received_at %q does not match provenance %q", manifest.ReceivedAt, provenanceReceivedAt)}
		}
	}
	if len(manifest.CloudflareEdgeEvidence) == 0 {
		return unavailableBoundArchive(bundle, "cloudflare_edge_evidence_missing"), nil
	}
	if schema, _ := manifest.CloudflareEdgeEvidence["schema"].(string); schema != cloudflareEdgeEvidenceSchema {
		return unavailableBoundArchive(bundle, "cloudflare_edge_evidence_schema_mismatch"), []string{fmt.Sprintf("Cloudflare edge evidence schema %q does not match %q", schema, cloudflareEdgeEvidenceSchema)}
	}
	workerFields, _ := manifest.CloudflareEdgeEvidence["worker_message_fields"].(map[string]any)
	workerEnvelopeTo, _ := workerFields["envelope_to"].(string)
	if strings.TrimSpace(workerEnvelopeTo) == "" {
		return unavailableBoundArchive(bundle, "cloudflare_edge_evidence_envelope_to_missing"), nil
	}
	if !strings.EqualFold(strings.TrimSpace(workerEnvelopeTo), envelopeTo) {
		return unavailableBoundArchive(bundle, "cloudflare_edge_evidence_envelope_to_mismatch"), []string{fmt.Sprintf("Cloudflare edge evidence envelope_to %q does not match provenance %q", workerEnvelopeTo, envelopeTo)}
	}
	workerEnvelopeFrom, _ := workerFields["envelope_from"].(string)
	if provenanceEnvelopeFromHeader != "" && !strings.EqualFold(normalizeArchiveEnvelopeFrom(workerEnvelopeFrom), provenanceEnvelopeFrom) {
		return unavailableBoundArchive(bundle, "cloudflare_edge_evidence_envelope_from_mismatch"), []string{fmt.Sprintf("Cloudflare edge evidence envelope_from %q does not match provenance %q", workerEnvelopeFrom, provenanceEnvelopeFromHeader)}
	}
	workerReceivedAt, _ := workerFields["received_at"].(string)
	if provenanceReceivedAt != "" {
		if strings.TrimSpace(workerReceivedAt) == "" {
			return unavailableBoundArchive(bundle, "cloudflare_edge_evidence_received_at_missing"), nil
		}
		if !sameArchiveInstant(workerReceivedAt, provenanceReceivedAt) {
			return unavailableBoundArchive(bundle, "cloudflare_edge_evidence_received_at_mismatch"), []string{fmt.Sprintf("Cloudflare edge evidence received_at %q does not match provenance %q", workerReceivedAt, provenanceReceivedAt)}
		}
	}
	rawBytes, err := s.archive.GetBytes(ctx, bundle.RawKey)
	if err != nil {
		return unavailableBoundArchive(bundle, "cloudflare_raw_unavailable"), []string{fmt.Sprintf("read Cloudflare raw message %q: %v", bundle.RawKey, err)}
	}
	rawSHA := sha256.Sum256(rawBytes)
	if got := hex.EncodeToString(rawSHA[:]); got != strings.ToLower(strings.TrimSpace(manifest.RawSHA256)) {
		return unavailableBoundArchive(bundle, "cloudflare_raw_sha256_mismatch"), []string{fmt.Sprintf("Cloudflare raw sha256 %q does not match manifest %q", got, manifest.RawSHA256)}
	}
	rawHeaders, err := parseMessageRawHeaders(rawBytes)
	if err != nil {
		return unavailableBoundArchive(bundle, "cloudflare_raw_headers_unparseable"), []string{fmt.Sprintf("parse Cloudflare raw message headers %q: %v", bundle.RawKey, err)}
	}
	// Cloudflare auth verdicts are trusted only from the verified R2 raw EML.
	// WildDuck source has already been replayed through Haraka and can contain
	// user-supplied or namespaced copies of upstream boundary headers.
	rawSecurity, err := parseCloudflareRawSecurityEvidence(rawBytes)
	if err != nil {
		return unavailableBoundArchive(bundle, "cloudflare_raw_headers_unparseable"), []string{fmt.Sprintf("parse Cloudflare raw message headers %q: %v", bundle.RawKey, err)}
	}

	return &CloudflareArchiveEvidence{
		Status:                archiveStatusAvailable,
		RawKey:                firstNonEmpty(manifest.RawKey, bundle.RawKey),
		EdgeKey:               firstNonEmpty(manifest.EdgeKey, bundle.EdgeKey),
		RawSHA256:             manifest.RawSHA256,
		EdgeEvidence:          manifest.CloudflareEdgeEvidence,
		RawSource:             &MessageRawSource{Source: "cloudflare-archived-raw-eml", Size: len(rawBytes), Raw: string(rawBytes), Headers: rawHeaders},
		AuthenticationResults: rawSecurity.AuthenticationResults,
		ReceivedSPF:           rawSecurity.ReceivedSPF,
		Received:              rawSecurity.Received,
	}, nil
}

func parseCloudflareRawSecurityEvidence(raw []byte) (cloudflareRawSecurityEvidence, error) {
	entity, err := message.Read(bytes.NewReader(raw))
	if err != nil && entity == nil {
		return cloudflareRawSecurityEvidence{}, fmt.Errorf("parse message headers: %w", err)
	}
	if entity == nil {
		return cloudflareRawSecurityEvidence{}, fmt.Errorf("parse message headers: no message entity")
	}
	evidence := cloudflareRawSecurityEvidence{
		AuthenticationResults: []AuthenticationResultsHeader{},
		ReceivedSPF:           []string{},
		Received:              []string{},
	}
	fields := entity.Header.Fields()
	authIndex := 0
	for fields.Next() {
		key := fields.Key()
		value, textErr := fields.Text()
		if textErr != nil {
			value = fields.Value()
		}
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		switch {
		case strings.EqualFold(key, "Authentication-Results"):
			parsed, parseErr := moxmessage.ParseAuthResults(value + "\r\n")
			if parseErr != nil || !strings.EqualFold(parsed.Hostname, "mx.cloudflare.net") {
				continue
			}
			authIndex++
			evidence.AuthenticationResults = append(evidence.AuthenticationResults, authenticationResultsHeaderFromParsed(authIndex, value, parsed, true))
		case strings.EqualFold(key, "Received-SPF"):
			if strings.Contains(strings.ToLower(value), "mx.cloudflare.net") {
				evidence.ReceivedSPF = append(evidence.ReceivedSPF, value)
			}
		case strings.EqualFold(key, "Received"):
			if strings.Contains(strings.ToLower(value), "cloudflare-email.net") {
				evidence.Received = append(evidence.Received, value)
			}
		}
	}
	if err != nil && !message.IsUnknownCharset(err) && !message.IsUnknownEncoding(err) {
		return evidence, fmt.Errorf("parse message headers: %w", err)
	}
	return evidence, nil
}

func normalizeArchiveEnvelopeFrom(value string) string {
	cleaned := strings.TrimSpace(value)
	if cleaned == "<>" {
		return ""
	}
	return cleaned
}

func sameArchiveInstant(left string, right string) bool {
	leftTime, leftErr := time.Parse(time.RFC3339Nano, strings.TrimSpace(left))
	rightTime, rightErr := time.Parse(time.RFC3339Nano, strings.TrimSpace(right))
	if leftErr == nil && rightErr == nil {
		return leftTime.Equal(rightTime)
	}
	return strings.TrimSpace(left) == strings.TrimSpace(right)
}

func unavailableCloudflareArchive(reason string) *CloudflareArchiveEvidence {
	return &CloudflareArchiveEvidence{
		Status: archiveStatusUnavailable,
		Reason: reason,
	}
}

func unavailableBoundArchive(bundle r2archive.InboundBundle, reason string) *CloudflareArchiveEvidence {
	return &CloudflareArchiveEvidence{
		Status:  archiveStatusUnavailable,
		Reason:  reason,
		RawKey:  bundle.RawKey,
		EdgeKey: bundle.EdgeKey,
	}
}

func cloudflareSecurityEvidence(headers map[string]string, archive *CloudflareArchiveEvidence) CloudflareSecurityEvidence {
	evidence := CloudflareSecurityEvidence{
		ProvenanceHeaders:      headers,
		OriginalSmtpPeerIP:     EvidenceStatus{Status: archiveStatusUnavailable, Reason: "cloudflare_archive_unavailable"},
		PerMessageAuthVerdicts: unavailableCloudflareAuthVerdicts("cloudflare_archive_unavailable"),
	}
	if archive == nil {
		return evidence
	}
	evidence.RawKey = archive.RawKey
	evidence.EdgeKey = archive.EdgeKey
	evidence.RawSHA256 = archive.RawSHA256
	evidence.EdgeEvidence = archive.EdgeEvidence
	evidence.AuthenticationResults = archive.AuthenticationResults
	evidence.ReceivedSPF = archive.ReceivedSPF
	evidence.Received = archive.Received
	if archive.Status != archiveStatusAvailable {
		reason := firstNonEmpty(archive.Reason, "cloudflare_archive_unavailable")
		evidence.OriginalSmtpPeerIP = EvidenceStatus{Status: archiveStatusUnavailable, Reason: reason}
		evidence.PerMessageAuthVerdicts = unavailableCloudflareAuthVerdicts(reason)
		return evidence
	}
	evidence.PerMessageAuthVerdicts, evidence.OriginalSmtpPeerIP, evidence.AuthservID, evidence.MailedBy, evidence.SignedBy = cloudflareAuthVerdictsFromHeaders(archive.AuthenticationResults)
	return evidence
}

func cloudflareAuthVerdictsFromHeaders(headers []AuthenticationResultsHeader) (CloudflareAuthVerdictSet, EvidenceStatus, string, string, string) {
	verdicts := unavailableCloudflareAuthVerdicts("cloudflare_authentication_results_missing")
	originalIP := EvidenceStatus{Status: archiveStatusUnavailable, Reason: "cloudflare_original_smtp_peer_ip_not_archived"}
	authservID := ""
	mailedBy := ""
	signedBy := ""
	if len(headers) == 0 {
		return verdicts, originalIP, authservID, mailedBy, signedBy
	}
	authservID = headers[0].AuthservID
	for _, header := range headers {
		if !header.Trusted || header.ParseError != "" {
			continue
		}
		for _, method := range header.Methods {
			status := evidenceStatusFromAuthMethod(method)
			switch strings.ToLower(method.Method) {
			case "spf":
				verdicts.SPF = chooseCloudflareVerdict(verdicts.SPF, status)
				mailedBy = firstNonEmpty(mailedBy, method.Properties["smtp.mailfrom"], method.Properties["header.from"])
			case "dkim":
				verdicts.DKIM = chooseCloudflareVerdict(verdicts.DKIM, status)
				if signedBy == "" && strings.EqualFold(method.Result, "pass") {
					signedBy = firstNonEmpty(method.Properties["header.d"], method.Properties["header.i"])
				}
			case "arc":
				verdicts.ARC = chooseCloudflareVerdict(verdicts.ARC, status)
				if originalIP.Value == "" {
					if remoteIP := firstNonEmpty(method.Properties["smtp.remote-ip"]); remoteIP != "" {
						originalIP = EvidenceStatus{Status: archiveStatusAvailable, Value: remoteIP}
					}
				}
			case "dmarc":
				verdicts.DMARC = chooseCloudflareVerdict(verdicts.DMARC, status)
			case "bimi":
				verdicts.BIMI = chooseCloudflareVerdict(verdicts.BIMI, status)
			}
		}
	}
	return verdicts, originalIP, authservID, mailedBy, signedBy
}

func evidenceStatusFromAuthMethod(method AuthMethod) EvidenceStatus {
	return EvidenceStatus{
		Status: firstNonEmpty(method.Result, "unknown"),
		Reason: method.Reason,
	}
}

func chooseCloudflareVerdict(current EvidenceStatus, next EvidenceStatus) EvidenceStatus {
	if next.Status == "" {
		return current
	}
	if current.Status == "" || current.Status == archiveStatusUnavailable {
		return next
	}
	if !strings.EqualFold(current.Status, "pass") && strings.EqualFold(next.Status, "pass") {
		return next
	}
	return current
}

func unavailableCloudflareAuthVerdicts(reason string) CloudflareAuthVerdictSet {
	return CloudflareAuthVerdictSet{
		SPF:   EvidenceStatus{Status: archiveStatusUnavailable, Reason: reason},
		DKIM:  EvidenceStatus{Status: archiveStatusUnavailable, Reason: reason},
		ARC:   EvidenceStatus{Status: archiveStatusUnavailable, Reason: reason},
		DMARC: EvidenceStatus{Status: archiveStatusUnavailable, Reason: reason},
		BIMI:  EvidenceStatus{Status: archiveStatusUnavailable, Reason: reason},
	}
}

func evidenceStatusFromMap(parent map[string]any, key string, defaultReason string) EvidenceStatus {
	if parent == nil {
		return EvidenceStatus{Status: archiveStatusUnavailable, Reason: defaultReason}
	}
	value, _ := parent[key].(map[string]any)
	status, _ := value["status"].(string)
	reason, _ := value["reason"].(string)
	displayValue, _ := value["value"].(string)
	status = strings.TrimSpace(status)
	if status == "" {
		status = archiveStatusUnavailable
	}
	return EvidenceStatus{Status: status, Reason: firstNonEmpty(reason, defaultReason), Value: strings.TrimSpace(displayValue)}
}
