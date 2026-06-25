package atemail

import (
	"net/mail"
	"strings"
)

type replyRecipients struct {
	To []string
	Cc []string
}

func resolveMailbox(mailboxes []map[string]any, requestedFolder string) (map[string]any, error) {
	normalized := strings.ToLower(strings.TrimSpace(requestedFolder))
	if normalized == "" {
		return nil, newAgentMailError("folder name must not be empty")
	}
	aliasMap := map[string]string{
		"inbox":   "\\Inbox",
		"junk":    "\\Junk",
		"archive": "\\Archive",
		"sent":    "\\Sent",
		"drafts":  "\\Drafts",
		"trash":   "\\Trash",
	}

	type candidate struct {
		key     string
		mailbox map[string]any
	}
	candidates := make([]candidate, 0, len(mailboxes)*3)
	for _, mailbox := range mailboxes {
		specialUse := stringValue(mailbox["specialUse"])
		name := stringValue(mailbox["name"])
		path := stringValue(mailbox["path"])
		candidates = append(candidates, candidate{key: strings.ToLower(path), mailbox: mailbox})
		if name != "" {
			candidates = append(candidates, candidate{key: strings.ToLower(name), mailbox: mailbox})
		}
		if specialUse != "" {
			candidates = append(candidates, candidate{key: strings.ToLower(specialUse), mailbox: mailbox})
		}
	}
	for _, candidate := range candidates {
		if candidate.key == normalized {
			return candidate.mailbox, nil
		}
	}
	if mapped := strings.ToLower(aliasMap[normalized]); mapped != "" {
		for _, mailbox := range mailboxes {
			if strings.ToLower(stringValue(mailbox["specialUse"])) == mapped {
				return mailbox, nil
			}
		}
	}
	return nil, newAgentMailError("mailbox " + pythonStringRepr(requestedFolder) + " was not found")
}

func resolveSpecialUseMailbox(mailboxes []map[string]any, specialUse string, displayName string) (map[string]any, error) {
	for _, mailbox := range mailboxes {
		if strings.ToLower(stringValue(mailbox["specialUse"])) == strings.ToLower(specialUse) {
			return mailbox, nil
		}
	}
	return nil, newAgentMailError(displayName + " mailbox is not available")
}

func resolveReplyRecipients(message map[string]any, replyAll bool, mailboxAddress string) (replyRecipients, error) {
	ownAddresses := map[string]struct{}{}
	for _, address := range extractAddresses(mailboxAddress) {
		ownAddresses[strings.ToLower(address)] = struct{}{}
	}
	seen := map[string]struct{}{}
	for address := range ownAddresses {
		seen[address] = struct{}{}
	}
	recipients := replyRecipients{}
	replyTargets := extractAddresses(message["replyTo"])
	if len(replyTargets) == 0 {
		replyTargets = extractAddresses(message["from"])
	}
	for _, address := range replyTargets {
		recipients.To = appendUniqueAddress(recipients.To, seen, address)
	}
	if replyAll {
		for _, address := range extractAddresses(message["to"]) {
			recipients.Cc = appendUniqueAddress(recipients.Cc, seen, address)
		}
		for _, address := range extractAddresses(message["cc"]) {
			recipients.Cc = appendUniqueAddress(recipients.Cc, seen, address)
		}
	}
	if len(recipients.To) == 0 && len(recipients.Cc) == 0 {
		return replyRecipients{}, newAgentMailError("could not determine reply recipients from the original message")
	}
	return recipients, nil
}

func extractAddresses(value any) []string {
	if value == nil {
		return nil
	}
	entries := anySlice(value)
	addresses := make([]string, 0, len(entries))
	stringHeaders := make([]string, 0)
	for _, entry := range entries {
		if object, ok := entry.(map[string]any); ok {
			address := strings.TrimSpace(stringValue(object["address"]))
			if address != "" {
				addresses = append(addresses, address)
			}
			continue
		}
		if text, ok := entry.(string); ok && strings.TrimSpace(text) != "" {
			stringHeaders = append(stringHeaders, text)
		}
	}
	for _, header := range stringHeaders {
		addresses = append(addresses, parseAddressHeader(header)...)
	}
	return addresses
}

func parseAddressHeader(header string) []string {
	parsed, err := mail.ParseAddressList(header)
	if err == nil {
		return mailAddressStrings(parsed)
	}

	addresses := make([]string, 0)
	for _, segment := range splitAddressHeader(header) {
		addresses = append(addresses, parseAddressSegment(segment)...)
	}
	return addresses
}

func mailAddressStrings(parsed []*mail.Address) []string {
	addresses := make([]string, 0, len(parsed))
	for _, address := range parsed {
		cleaned := strings.TrimSpace(address.Address)
		if cleaned != "" {
			addresses = append(addresses, cleaned)
		}
	}
	return addresses
}

func parseAddressSegment(segment string) []string {
	cleaned := strings.TrimSpace(segment)
	if cleaned == "" {
		return nil
	}
	if parsed, err := mail.ParseAddress(cleaned); err == nil {
		return mailAddressStrings([]*mail.Address{parsed})
	}

	addresses := make([]string, 0)
	for _, candidate := range angleAddressCandidates(cleaned) {
		if parsed, err := mail.ParseAddress("<" + candidate + ">"); err == nil {
			addresses = append(addresses, strings.TrimSpace(parsed.Address))
		}
	}
	if len(addresses) > 0 {
		return addresses
	}

	if strings.ContainsAny(cleaned, " \t\r\n<>") {
		return nil
	}
	if parsed, err := mail.ParseAddress(cleaned); err == nil {
		return mailAddressStrings([]*mail.Address{parsed})
	}
	return nil
}

func splitAddressHeader(header string) []string {
	segments := make([]string, 0)
	start := 0
	inQuote := false
	escaped := false
	angleDepth := 0
	for index, char := range header {
		if escaped {
			escaped = false
			continue
		}
		if inQuote && char == '\\' {
			escaped = true
			continue
		}
		switch char {
		case '"':
			inQuote = !inQuote
		case '<':
			if !inQuote {
				angleDepth++
			}
		case '>':
			if !inQuote && angleDepth > 0 {
				angleDepth--
			}
		case ',':
			if !inQuote && angleDepth == 0 {
				segments = append(segments, header[start:index])
				start = index + len(string(char))
			}
		}
	}
	segments = append(segments, header[start:])
	return segments
}

func angleAddressCandidates(segment string) []string {
	candidates := make([]string, 0)
	start := -1
	for index, char := range segment {
		switch char {
		case '<':
			start = index + len(string(char))
		case '>':
			if start >= 0 && start <= index {
				candidate := strings.TrimSpace(segment[start:index])
				if candidate != "" {
					candidates = append(candidates, candidate)
				}
			}
			start = -1
		}
	}
	return candidates
}

func appendUniqueAddress(target []string, seen map[string]struct{}, address string) []string {
	cleaned := strings.TrimSpace(address)
	if cleaned == "" {
		return target
	}
	key := strings.ToLower(cleaned)
	if _, ok := seen[key]; ok {
		return target
	}
	seen[key] = struct{}{}
	return append(target, cleaned)
}

func safeMessageMetadata(message map[string]any) map[string]any {
	allowed := []string{
		"id",
		"mailbox",
		"from",
		"to",
		"cc",
		"replyTo",
		"subject",
		"messageId",
		"date",
		"seen",
		"flags",
		"attachments",
	}
	result := map[string]any{}
	for _, key := range allowed {
		if value, ok := message[key]; ok {
			result[key] = value
		}
	}
	return result
}
