package atemail

import (
	"fmt"
	"regexp"
	"strings"
)

type identityTerm struct {
	Source string
	Value  string
}

type config struct {
	APIBaseURL            string
	AccessToken           string
	UserID                string
	MailboxAddress        string
	ControlAPIBaseURL     string
	MessageReadToken      string
	InternalIdentityTerms []identityTerm
}

var internalIdentityEnvKeys = []string{
	"AGENTTEAM_AGENT_KEY",
	"AGENTTEAM_RUNTIME_NAME",
	"FORGE_USERNAME",
	"OPENVIKING_USER",
	"OPENVIKING_AGENT",
	"MATRIX_USER_ID",
}

var genericIdentityTerms = map[string]struct{}{
	"agent":     {},
	"assistant": {},
	"bot":       {},
	"system":    {},
	"runtime":   {},
	"user":      {},
	"admin":     {},
	"ceo":       {},
	"cto":       {},
	"cfo":       {},
}

var hexIdentityPattern = regexp.MustCompile(`^[0-9a-f]{12,}$`)
var slugSplitPattern = regexp.MustCompile(`[^A-Za-z0-9]+`)
var disclosureNormalizePattern = regexp.MustCompile(`[^a-z0-9]+`)

func loadConfig(env []string) (config, error) {
	values := envMap(env)
	apiBaseURL := lookupEnv(values, "AT_EMAIL_WILDDUCK_API_BASE_URL")
	accessToken := lookupEnv(values, "AT_EMAIL_WILDDUCK_ACCESS_TOKEN")
	userID := lookupEnv(values, "AT_EMAIL_WILDDUCK_USER_ID")
	mailboxAddress := lookupEnv(values, "AT_EMAIL_MAILBOX_ADDRESS")
	controlAPIBaseURL := lookupEnv(values, "AT_EMAIL_CONTROL_API_BASE_URL")
	messageReadToken := lookupEnv(values, "AT_EMAIL_MESSAGE_READ_TOKEN")

	missing := make([]string, 0, 3)
	for _, item := range []struct {
		name  string
		value string
	}{
		{"AT_EMAIL_WILDDUCK_API_BASE_URL", apiBaseURL},
		{"AT_EMAIL_WILDDUCK_ACCESS_TOKEN", accessToken},
		{"AT_EMAIL_WILDDUCK_USER_ID", userID},
	} {
		if item.value == "" {
			missing = append(missing, item.name)
		}
	}
	if len(missing) > 0 {
		return config{}, newConfigError(fmt.Sprintf("missing required runtime environment: %s", strings.Join(missing, ", ")))
	}

	return config{
		APIBaseURL:            apiBaseURL,
		AccessToken:           accessToken,
		UserID:                userID,
		MailboxAddress:        mailboxAddress,
		ControlAPIBaseURL:     controlAPIBaseURL,
		MessageReadToken:      messageReadToken,
		InternalIdentityTerms: buildInternalIdentityTerms(values),
	}, nil
}

func envMap(env []string) map[string]string {
	values := make(map[string]string, len(env))
	for _, item := range env {
		name, value, ok := strings.Cut(item, "=")
		if !ok {
			continue
		}
		values[name] = value
	}
	return values
}

func lookupEnv(values map[string]string, name string) string {
	return strings.TrimSpace(values[name])
}

func buildInternalIdentityTerms(env map[string]string) []identityTerm {
	terms := make([]identityTerm, 0)
	seen := map[string]struct{}{}
	for _, key := range internalIdentityEnvKeys {
		value := strings.TrimSpace(env[key])
		if value == "" {
			continue
		}
		for _, candidate := range identityCandidates(value) {
			normalized := normalizeDisclosureText(candidate)
			if !usableIdentityTerm(normalized) {
				continue
			}
			dedupeKey := key + ":" + normalized
			if _, ok := seen[dedupeKey]; ok {
				continue
			}
			seen[dedupeKey] = struct{}{}
			terms = append(terms, identityTerm{Source: key, Value: candidate})
		}
	}
	return terms
}

func identityCandidates(value string) []string {
	candidates := make([]string, 0)
	candidates = addCandidate(candidates, value)
	if matrixLocal := matrixUserLocalpart(value); matrixLocal != "" {
		candidates = addCandidate(candidates, matrixLocal)
	}

	initial := append([]string(nil), candidates...)
	for _, candidate := range initial {
		parts := slugParts(candidate)
		if len(parts) >= 2 {
			candidates = addCandidate(candidates, strings.Join(parts, " "))
		}
		if len(parts) >= 3 && len(parts[0]) >= 1 && len(parts[0]) <= 4 {
			candidates = addCandidate(candidates, strings.Join(parts[1:], " "))
		}
	}
	return candidates
}

func addCandidate(candidates []string, value string) []string {
	cleaned := strings.TrimSpace(value)
	if cleaned == "" {
		return candidates
	}
	for _, candidate := range candidates {
		if candidate == cleaned {
			return candidates
		}
	}
	return append(candidates, cleaned)
}

func matrixUserLocalpart(value string) string {
	cleaned := strings.TrimSpace(value)
	if !strings.HasPrefix(cleaned, "@") || !strings.Contains(cleaned, ":") {
		return ""
	}
	local, _, _ := strings.Cut(strings.TrimPrefix(cleaned, "@"), ":")
	return strings.TrimSpace(local)
}

func slugParts(value string) []string {
	raw := slugSplitPattern.Split(strings.TrimSpace(value), -1)
	parts := make([]string, 0, len(raw))
	for _, part := range raw {
		if part != "" {
			parts = append(parts, part)
		}
	}
	return parts
}

func usableIdentityTerm(normalized string) bool {
	if normalized == "" {
		return false
	}
	if _, ok := genericIdentityTerms[normalized]; ok {
		return false
	}
	compact := strings.ReplaceAll(normalized, " ", "")
	if len(compact) < 5 {
		return false
	}
	allDigits := true
	hasAlpha := false
	for _, ch := range compact {
		if ch < '0' || ch > '9' {
			allDigits = false
		}
		if (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') {
			hasAlpha = true
		}
	}
	if allDigits {
		return false
	}
	if hexIdentityPattern.MatchString(compact) {
		return false
	}
	return hasAlpha
}

func normalizeDisclosureText(value string) string {
	cleaned := strings.ReplaceAll(strings.ToLower(value), "'", "")
	return strings.Join(strings.Fields(disclosureNormalizePattern.ReplaceAllString(cleaned, " ")), " ")
}

func normalizedContains(normalizedText string, normalizedTerm string) bool {
	return strings.Contains(" "+normalizedText+" ", " "+normalizedTerm+" ")
}
