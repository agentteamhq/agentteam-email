package safelog

import (
	"log"
	"net/url"
	"os"
	"regexp"
	"strings"
)

const defaultMaxTextLength = 240

var (
	archiveKeyPattern          = regexp.MustCompile(`orgs/[A-Za-z0-9_.:-]+/domains/[A-Za-z0-9.-]+/mail/(?:inbound|outbound)/[^\s"']+`)
	emailPattern               = regexp.MustCompile(`[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}`)
	urlPattern                 = regexp.MustCompile(`\b[A-Za-z][A-Za-z0-9+.-]*://[^\s"'<>()]+`)
	uriUserInfoPattern         = regexp.MustCompile(`([A-Za-z][A-Za-z0-9+.-]*://)[^/\s@]+@`)
	cookieHeaderPattern        = regexp.MustCompile(`(?i)\bcookie\s*[:=]\s*("[^"]*"|'[^']*'|[^\s]+)`)
	authorizationHeaderPattern = regexp.MustCompile(`(?i)\bauthorization\s*[:=]\s*(?:bearer|basic)?\s*[A-Za-z0-9._~+/=-]+`)
	bearerCredentialPattern    = regexp.MustCompile(`(?i)\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+`)
	sensitiveAssignmentPattern = regexp.MustCompile(`(?i)\b(authorization|x[_-]?access[_-]?token|access[_-]?key(?:[_-]?id)?|secret[_-]?access[_-]?key|access[_-]?token|api[_-]?key|token|password|secret|session[_-]?token|cookie|signature|credential|x-amz-signature|x-amz-credential|x-amz-security-token)(=|:)\s*("[^"]*"|'[^']*'|[^\s&]+)`)
	quotedSensitiveKeyPattern  = regexp.MustCompile(`(?i)(["'])(authorization|x[_-]?access[_-]?token|access[_-]?key(?:[_-]?id)?|secret[_-]?access[_-]?key|access[_-]?token|api[_-]?key|token|password|secret|session[_-]?token|cookie|signature|credential|x-amz-signature|x-amz-credential|x-amz-security-token)(["']\s*:\s*)("[^"]*"|'[^']*'|[^\s,}&]+)`)
	jwtPattern                 = regexp.MustCompile(`\b[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b`)
	prefixedTokenPattern       = regexp.MustCompile(`(?i)\b(?:sk|pk|rk|gh[pousr]|glpat|xox[baprs]?|at)[_-][A-Za-z0-9][A-Za-z0-9._~+/=-]{14,}\b`)
	internalSecretPattern      = regexp.MustCompile(`(?i)\b_secret_[A-Za-z0-9._~+/=-]{8,}\b`)
)

func Error(err error) string {
	if err == nil {
		return ""
	}
	return Text(err.Error())
}

func Text(value string) string {
	message := strings.TrimSpace(strings.Join(strings.Fields(value), " "))
	if message == "" {
		return ""
	}
	message = stripURLQueryAndFragment(message)
	message = uriUserInfoPattern.ReplaceAllString(message, "${1}redacted@")
	message = cookieHeaderPattern.ReplaceAllString(message, "cookie=[redacted]")
	message = authorizationHeaderPattern.ReplaceAllString(message, "authorization=[redacted]")
	message = bearerCredentialPattern.ReplaceAllString(message, "$1 [redacted]")
	message = sensitiveAssignmentPattern.ReplaceAllString(message, "$1$2[redacted]")
	message = quotedSensitiveKeyPattern.ReplaceAllString(message, "$1$2$3\"[redacted]\"")
	message = jwtPattern.ReplaceAllString(message, "[token]")
	message = prefixedTokenPattern.ReplaceAllString(message, "[token]")
	message = internalSecretPattern.ReplaceAllString(message, "[token]")
	message = archiveKeyPattern.ReplaceAllString(message, "[archive_key]")
	message = emailPattern.ReplaceAllString(message, "[email]")
	if len(message) > defaultMaxTextLength {
		return message[:defaultMaxTextLength]
	}
	return message
}

func Issue(code string, err error) string {
	code = strings.TrimSpace(code)
	detail := Error(err)
	switch {
	case code == "":
		return detail
	case detail == "":
		return code
	default:
		return code + ": " + detail
	}
}

func stripURLQueryAndFragment(message string) string {
	return urlPattern.ReplaceAllStringFunc(message, func(candidate string) string {
		parsed, err := url.Parse(candidate)
		if err != nil || parsed.Scheme == "" || parsed.Host == "" {
			return candidate
		}
		parsed.RawQuery = ""
		parsed.Fragment = ""
		parsed.User = nil
		return parsed.String()
	})
}

func Field(value string, maxLength int) string {
	message := Text(value)
	if maxLength <= 0 || len(message) <= maxLength {
		return message
	}
	return message[:maxLength]
}

func DebugEnabled() bool {
	level := strings.ToLower(strings.TrimSpace(os.Getenv("AT_EMAIL_ADMIN_LOG_LEVEL")))
	if level == "debug" || level == "trace" {
		return true
	}
	debug := strings.ToLower(strings.TrimSpace(os.Getenv("DEBUG")))
	if debug == "*" {
		return true
	}
	for _, token := range strings.FieldsFunc(debug, func(r rune) bool {
		return r == ',' || r == ' ' || r == ';'
	}) {
		if token == "agent-mail-control-service" || token == "agent-mail-control-service:*" || token == "agent-mail-control:*" {
			return true
		}
	}
	return false
}

func Debugf(format string, args ...any) {
	if !DebugEnabled() {
		return
	}
	log.Printf(format, args...)
}
