package rfc822

import (
	"fmt"
	stdtextproto "net/textproto"
	"strings"

	"github.com/emersion/go-message"
	messagemail "github.com/emersion/go-message/mail"
)

const (
	IngestIDHeader       = "X-ATM-Ingest-ID"
	CloudflareEdgePrefix = "X-ATMCF-Edge-"
	MessageIDHeader      = "Message-ID"
)

type ProvenanceHeaders struct {
	IngestID   string
	MessageID  string
	Cloudflare map[string]string
	Headers    map[string]string
}

func ParseProvenanceHeaders(raw []byte) (ProvenanceHeaders, error) {
	if len(raw) == 0 {
		return ProvenanceHeaders{}, fmt.Errorf("missing raw message")
	}
	headers, _, err := readMessageHeaderAndBody(raw)
	if err != nil {
		return ProvenanceHeaders{}, err
	}

	result := ProvenanceHeaders{
		Cloudflare: map[string]string{},
		Headers:    map[string]string{},
	}
	fields := headers.Fields()
	for fields.Next() {
		key := fields.Key()
		value := strings.TrimSpace(fields.Value())
		if value == "" {
			continue
		}
		canonical, ok := provenanceHeaderName(key)
		if !ok {
			continue
		}
		if _, exists := result.Headers[canonical]; !exists {
			result.Headers[canonical] = value
		}
		if strings.EqualFold(canonical, IngestIDHeader) && result.IngestID == "" {
			result.IngestID = value
			continue
		}
		if strings.HasPrefix(canonical, CloudflareEdgePrefix) {
			if _, exists := result.Cloudflare[canonical]; !exists {
				result.Cloudflare[canonical] = value
			}
		}
	}

	mailHeader := messagemail.Header{Header: message.Header{Header: headers}}
	if messageID, err := mailHeader.MessageID(); err == nil && strings.TrimSpace(messageID) != "" {
		result.MessageID = strings.TrimSpace(messageID)
		if _, exists := result.Headers[MessageIDHeader]; !exists {
			result.Headers[MessageIDHeader] = result.MessageID
		}
	}
	return result, nil
}

func provenanceHeaderName(key string) (string, bool) {
	if strings.EqualFold(key, IngestIDHeader) {
		return IngestIDHeader, true
	}
	if strings.EqualFold(key, MessageIDHeader) {
		return MessageIDHeader, true
	}
	if hasASCIIFoldPrefix(key, CloudflareEdgePrefix) {
		return canonicalCloudflareEdgeHeaderName(key), true
	}
	return "", false
}

func canonicalCloudflareEdgeHeaderName(key string) string {
	suffix := key[len(CloudflareEdgePrefix):]
	canonical := stdtextproto.CanonicalMIMEHeaderKey(suffix)
	canonical = strings.ReplaceAll(canonical, "-Id", "-ID")
	return CloudflareEdgePrefix + canonical
}

func hasASCIIFoldPrefix(value, prefix string) bool {
	if len(value) < len(prefix) {
		return false
	}
	return strings.EqualFold(value[:len(prefix)], prefix)
}
