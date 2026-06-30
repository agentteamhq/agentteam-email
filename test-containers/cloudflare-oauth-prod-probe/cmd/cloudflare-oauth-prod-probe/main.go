package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"log"
	"net/http"
	"net/mail"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/oauth2"
)

const (
	defaultAuthorizationURL = "https://dash.cloudflare.com/oauth2/auth"
	defaultTokenURL         = "https://dash.cloudflare.com/oauth2/token"
	defaultAPIBaseURL       = "https://api.cloudflare.com/client/v4"
	defaultCallbackPath     = "/oauth/callback/cloudflare"
	connectPath             = "/connect/cloudflare"
	accountSelectionPath    = "/probe/cloudflare/account"
	defaultListenAddr       = "127.0.0.1:9003"
	defaultScopes           = "workers-r2.read workers-r2.write workers-scripts.read workers-scripts.write dns.read dns.write zone.read cloud-email-security.read email-routing-address.read email-routing-address.write email-routing-rule.read email-routing-rule.write email-routing-suppression.read email-security-dmarcreports.read email-sending.read email-sending.write offline_access"
	defaultEventsPath       = "tmp/run/current/events.jsonl"
	probeSessionTTL         = 15 * time.Minute
	refreshTokenStoreSchema = "cloudflare-oauth-prod-probe.refresh-token.v1"
)

type config struct {
	apiBaseURL       string
	authorizationURL string
	callbackPath     string
	clientID         string
	eventsPath       string
	listenAddr       string
	redirectURI      string
	refreshStorePath string
	scopes           []string
	tokenURL         string
}

type server struct {
	cfg          config
	client       *http.Client
	events       *eventLogger
	pkceVerifier string
	state        string

	sessionsMu sync.Mutex
	sessions   map[string]probeSession
}

type tokenResult struct {
	AccessToken  string `json:"access_token"`
	ExpiresIn    int    `json:"expires_in"`
	RefreshToken string `json:"refresh_token"`
	Scope        string `json:"scope"`
	TokenType    string `json:"token_type"`
}

type tokenEndpointHTTPError struct {
	Description string
	ErrorCode   string
	Status      int
}

func (err tokenEndpointHTTPError) Error() string {
	message := fmt.Sprintf("token endpoint returned HTTP %d", err.Status)
	if err.ErrorCode != "" {
		message += ": " + err.ErrorCode
	}
	if err.Description != "" {
		message += ": " + err.Description
	}
	return message
}

type tokenSummary struct {
	AccessTokenPresent  bool   `json:"access_token_present"`
	ExpiresInSeconds    int    `json:"expires_in_seconds,omitempty"`
	RefreshTokenPresent bool   `json:"refresh_token_present"`
	Scope               string `json:"scope,omitempty"`
	TokenType           string `json:"token_type,omitempty"`
}

type refreshProbeSummary struct {
	Attempted bool         `json:"attempted"`
	Error     string       `json:"error,omitempty"`
	Succeeded bool         `json:"succeeded"`
	Token     tokenSummary `json:"token,omitempty"`
}

type refreshTokenStoreDocument struct {
	Schema                      string `json:"schema"`
	RefreshToken                string `json:"refresh_token"`
	Source                      string `json:"source"`
	StoredAt                    string `json:"stored_at"`
	ClientIDHash                string `json:"client_id_hash"`
	Scope                       string `json:"scope,omitempty"`
	AccessTokenExpiresInSeconds int    `json:"access_token_expires_in_seconds,omitempty"`
}

type oauthLifecycleSummary struct {
	InitialToken tokenSummary        `json:"initial_token"`
	Refresh      refreshProbeSummary `json:"refresh"`
}

type probeSession struct {
	AccessToken string
	Accounts    []cloudflareAccountSummary
	CreatedAt   time.Time
	Lifecycle   oauthLifecycleSummary
}

type cloudflareListResponse[T any] struct {
	Errors   []cloudflareError `json:"errors"`
	Messages []cloudflareError `json:"messages"`
	Result   T                 `json:"result"`
	Success  bool              `json:"success"`
}

type cloudflareAccountSummary struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Type string `json:"type"`
}

type cloudflareResponse struct {
	Errors   []cloudflareError `json:"errors"`
	Messages []cloudflareError `json:"messages"`
	Success  bool              `json:"success"`
}

type cloudflareError struct {
	Code    any    `json:"code"`
	Message string `json:"message"`
}

type probeResult struct {
	Classification string             `json:"classification"`
	Endpoint       string             `json:"endpoint"`
	Errors         []sanitizedCFError `json:"errors,omitempty"`
	Status         int                `json:"status"`
}

type persistedRefreshSummary struct {
	AccessTokenPresent  bool   `json:"access_token_present"`
	ExpiresInSeconds    int    `json:"expires_in_seconds,omitempty"`
	RefreshTokenPresent bool   `json:"refresh_token_present"`
	RefreshTokenRotated bool   `json:"refresh_token_rotated"`
	Scope               string `json:"scope,omitempty"`
	Source              string `json:"source"`
	StoreRewritten      bool   `json:"store_rewritten"`
	TokenType           string `json:"token_type,omitempty"`
}

type offlineRefreshResult struct {
	Accounts    accountProbeSummary       `json:"accounts"`
	SendProbes  []probeResult             `json:"send_probes,omitempty"`
	Token       persistedRefreshSummary   `json:"token_refresh"`
	TokenErrors []sanitizedCommandMessage `json:"token_errors,omitempty"`
}

type accountProbeSummary struct {
	Count int `json:"count"`
}

type emailSendingValidationResult struct {
	Accounts        accountProbeSummary       `json:"accounts"`
	RecipientDomain string                    `json:"recipient_domain"`
	Send            emailSendResult           `json:"send"`
	SendRaw         emailSendResult           `json:"send_raw"`
	SenderDomain    string                    `json:"sender_domain"`
	Token           persistedRefreshSummary   `json:"token_refresh"`
	TokenErrors     []sanitizedCommandMessage `json:"token_errors,omitempty"`
}

type emailSendResult struct {
	DeliveredCount       int                `json:"delivered_count"`
	Endpoint             string             `json:"endpoint"`
	Errors               []sanitizedCFError `json:"errors,omitempty"`
	MessageIDPresent     bool               `json:"message_id_present"`
	PermanentBounceCount int                `json:"permanent_bounce_count"`
	QueuedCount          int                `json:"queued_count"`
	Status               int                `json:"status"`
	Success              bool               `json:"success"`
}

type sanitizedCommandMessage struct {
	Message string `json:"message"`
	Type    string `json:"type"`
}

type sanitizedCFError struct {
	Code    string `json:"code,omitempty"`
	Message string `json:"message,omitempty"`
}

type eventLogger struct {
	filePath string
	mu       sync.Mutex
}

type oauthTraceTransport struct {
	base       http.RoundTripper
	cfg        config
	events     *eventLogger
	tokenURL   *url.URL
	traceLimit int64
}

func main() {
	cfg, err := loadConfig()
	if err != nil {
		log.Fatalf("[cloudflare-oauth-prod-probe] config error: %v", err)
	}

	mode := "serve"
	if len(os.Args) > 1 {
		mode = os.Args[1]
	}

	switch mode {
	case "serve":
		if err := serveProbe(cfg); err != nil {
			log.Fatalf("[cloudflare-oauth-prod-probe] server error: %v", err)
		}
	case "offline-refresh":
		if err := runOfflineRefreshCommand(context.Background(), cfg, os.Stdout); err != nil {
			log.Fatalf("[cloudflare-oauth-prod-probe] offline refresh error: %v", err)
		}
	case "validate-email-sending":
		if err := runEmailSendingValidationCommand(context.Background(), cfg, os.Stdout); err != nil {
			log.Fatalf("[cloudflare-oauth-prod-probe] email sending validation error: %v", err)
		}
	default:
		log.Fatalf("[cloudflare-oauth-prod-probe] unsupported command %q", mode)
	}
}

func serveProbe(cfg config) error {
	state, err := newState()
	if err != nil {
		return fmt.Errorf("state error: %w", err)
	}
	pkceVerifier := oauth2.GenerateVerifier()

	events := &eventLogger{filePath: cfg.eventsPath}
	if err := events.log("probe_started", map[string]any{
		"callback_path":               cfg.callbackPath,
		"listen_addr":                 cfg.listenAddr,
		"redirect_uri":                cfg.redirectURI,
		"refresh_token_store_enabled": cfg.refreshStorePath != "",
	}); err != nil {
		return fmt.Errorf("event log error: %w", err)
	}

	probeServer := &server{
		cfg:          cfg,
		client:       newTraceHTTPClient(cfg, events),
		events:       events,
		pkceVerifier: pkceVerifier,
		state:        state,
		sessions:     make(map[string]probeSession),
	}

	connectURL := probeServer.connectURL()
	if err := events.log("connect_page_ready", map[string]any{
		"connect_url": connectURL,
		"oauth":       probeServer.authorizationRequestSummary(),
	}); err != nil {
		return fmt.Errorf("event log error: %w", err)
	}

	log.Printf("[cloudflare-oauth-prod-probe] listening=%s callback=%s", cfg.listenAddr, cfg.callbackPath)
	log.Printf("[cloudflare-oauth-prod-probe] connect_url=%s", connectURL)

	httpServer := &http.Server{
		Addr:              cfg.listenAddr,
		Handler:           probeServer,
		ReadHeaderTimeout: 10 * time.Second,
	}

	if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

func loadConfig() (config, error) {
	cfg := config{
		apiBaseURL:       envDefault("CLOUDFLARE_API_BASE_URL", defaultAPIBaseURL),
		authorizationURL: envDefault("CLOUDFLARE_OAUTH_AUTHORIZATION_URL", defaultAuthorizationURL),
		callbackPath:     envDefault("PROBE_CALLBACK_PATH", defaultCallbackPath),
		clientID:         strings.TrimSpace(os.Getenv("CLOUDFLARE_OAUTH_CLIENT_ID")),
		eventsPath:       envDefault("PROBE_EVENTS_PATH", defaultEventsPath),
		listenAddr:       envDefault("PROBE_LISTEN_ADDR", defaultListenAddr),
		redirectURI:      strings.TrimSpace(os.Getenv("PROBE_REDIRECT_URI")),
		refreshStorePath: strings.TrimSpace(os.Getenv("PROBE_REFRESH_TOKEN_STORE_PATH")),
		scopes:           splitList(envDefault("CLOUDFLARE_OAUTH_SCOPES", defaultScopes)),
		tokenURL:         envDefault("CLOUDFLARE_OAUTH_TOKEN_URL", defaultTokenURL),
	}

	if cfg.clientID == "" {
		return config{}, errors.New("CLOUDFLARE_OAUTH_CLIENT_ID is required")
	}
	if cfg.redirectURI == "" {
		return config{}, errors.New("PROBE_REDIRECT_URI is required")
	}
	if len(cfg.scopes) == 0 {
		return config{}, errors.New("CLOUDFLARE_OAUTH_SCOPES must include at least one scope")
	}
	if !strings.HasPrefix(cfg.callbackPath, "/") {
		return config{}, errors.New("PROBE_CALLBACK_PATH must start with /")
	}
	if _, err := url.ParseRequestURI(cfg.redirectURI); err != nil {
		return config{}, fmt.Errorf("PROBE_REDIRECT_URI is invalid: %w", err)
	}
	if _, err := url.ParseRequestURI(cfg.authorizationURL); err != nil {
		return config{}, fmt.Errorf("CLOUDFLARE_OAUTH_AUTHORIZATION_URL is invalid: %w", err)
	}
	if _, err := url.ParseRequestURI(cfg.tokenURL); err != nil {
		return config{}, fmt.Errorf("CLOUDFLARE_OAUTH_TOKEN_URL is invalid: %w", err)
	}
	if _, err := url.ParseRequestURI(cfg.apiBaseURL); err != nil {
		return config{}, fmt.Errorf("CLOUDFLARE_API_BASE_URL is invalid: %w", err)
	}

	return cfg, nil
}

func envDefault(name string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback
	}
	return value
}

func splitList(value string) []string {
	parts := strings.FieldsFunc(value, func(r rune) bool {
		return r == ',' || r == ' ' || r == '\n' || r == '\t'
	})
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			result = append(result, part)
		}
	}
	return result
}

func newTraceHTTPClient(cfg config, events *eventLogger) *http.Client {
	tokenURL, err := url.Parse(cfg.tokenURL)
	if err != nil {
		tokenURL = nil
	}
	return &http.Client{
		Timeout: 20 * time.Second,
		Transport: &oauthTraceTransport{
			base:       http.DefaultTransport,
			cfg:        cfg,
			events:     events,
			tokenURL:   tokenURL,
			traceLimit: 1 << 20,
		},
	}
}

func (transport *oauthTraceTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	if transport.base == nil {
		transport.base = http.DefaultTransport
	}
	if !transport.isTokenRequest(request) {
		return transport.base.RoundTrip(request)
	}

	requestTrace := transport.traceRequest(request)
	startedAt := time.Now()
	response, err := transport.base.RoundTrip(request)
	durationMs := time.Since(startedAt).Milliseconds()
	if err != nil {
		_ = transport.events.log("oauth_http_roundtrip_failed", map[string]any{
			"duration_ms":  durationMs,
			"error_type":   fmt.Sprintf("%T", err),
			"http_request": requestTrace,
		})
		return response, err
	}

	responseTrace := transport.traceResponse(response)
	_ = transport.events.log("oauth_http_roundtrip_completed", map[string]any{
		"duration_ms":   durationMs,
		"http_request":  requestTrace,
		"http_response": responseTrace,
	})
	return response, nil
}

func (transport *oauthTraceTransport) isTokenRequest(request *http.Request) bool {
	if request == nil || request.URL == nil || transport.tokenURL == nil {
		return false
	}
	return request.URL.Scheme == transport.tokenURL.Scheme &&
		request.URL.Host == transport.tokenURL.Host &&
		request.URL.Path == transport.tokenURL.Path
}

func (transport *oauthTraceTransport) traceRequest(request *http.Request) map[string]any {
	trace := map[string]any{
		"content_length":     request.ContentLength,
		"content_type":       request.Header.Get("content-type"),
		"host_header":        request.Host,
		"method":             request.Method,
		"url_host":           request.URL.Host,
		"url_path":           request.URL.Path,
		"url_query_present":  request.URL.RawQuery != "",
		"url_scheme":         request.URL.Scheme,
		"user_agent_present": request.Header.Get("user-agent") != "",
	}
	addAuthorizationTrace(trace, request.Header.Get("authorization"), transport.cfg)

	body, readErr := readAndRestoreRequestBody(request, transport.traceLimit)
	if readErr != nil {
		trace["body_read_error_type"] = fmt.Sprintf("%T", readErr)
		return trace
	}
	trace["body_bytes"] = len(body)
	if len(body) == 0 {
		return trace
	}

	contentType, _, _ := strings.Cut(request.Header.Get("content-type"), ";")
	if strings.EqualFold(strings.TrimSpace(contentType), "application/x-www-form-urlencoded") {
		form, err := url.ParseQuery(string(body))
		if err != nil {
			trace["form_parse_error_type"] = fmt.Sprintf("%T", err)
			return trace
		}
		trace["form"] = summarizeTokenForm(form, transport.cfg)
	}
	return trace
}

func addAuthorizationTrace(trace map[string]any, authorization string, cfg config) {
	trace["authorization_present"] = authorization != ""
	if authorization == "" {
		return
	}
	scheme, payload, found := strings.Cut(authorization, " ")
	trace["authorization_scheme"] = scheme
	trace["authorization_payload_present"] = found && payload != ""
	trace["authorization_payload_length"] = len(payload)
	if !strings.EqualFold(scheme, "basic") || payload == "" {
		return
	}

	decoded, err := base64.StdEncoding.DecodeString(payload)
	if err != nil {
		trace["basic_decode_error_type"] = fmt.Sprintf("%T", err)
		return
	}
	firstPart, secondPart, ok := strings.Cut(string(decoded), ":")
	escapedClientID := url.QueryEscape(cfg.clientID)
	trace["basic_decoded_has_separator"] = ok
	trace["basic_first_part_length"] = len(firstPart)
	trace["basic_second_part_length"] = len(secondPart)
	trace["basic_first_part_matches_escaped_client_id"] = firstPart == escapedClientID
}

func readAndRestoreRequestBody(request *http.Request, limit int64) ([]byte, error) {
	if request.Body == nil {
		return nil, nil
	}
	body, err := io.ReadAll(io.LimitReader(request.Body, limit))
	_ = request.Body.Close()
	request.Body = io.NopCloser(bytes.NewReader(body))
	request.ContentLength = int64(len(body))
	return body, err
}

func summarizeTokenForm(form url.Values, cfg config) map[string]any {
	keys := make([]string, 0, len(form))
	for key := range form {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	clientID := form.Get("client_id")
	clientCredential := form.Get("client_secret")
	code := form.Get("code")
	renewalValue := form.Get("refresh_token")
	return map[string]any{
		"client_credential_length":  len(clientCredential),
		"client_credential_present": clientCredential != "",
		"client_id_length":          len(clientID),
		"client_id_matches_config":  clientID != "" && clientID == cfg.clientID,
		"client_id_present":         clientID != "",
		"code_length":               len(code),
		"code_present":              code != "",
		"code_verifier_present":     form.Get("code_verifier") != "",
		"fields":                    summarizeURLValueFields(form),
		"grant_type":                form.Get("grant_type"),
		"key_count":                 len(keys),
		"keys":                      keys,
		"redirect_uri":              form.Get("redirect_uri"),
		"renewal_value_length":      len(renewalValue),
		"renewal_value_present":     renewalValue != "",
		"sanitized_fields":          collectSensitiveURLValueFields(form),
	}
}

func (transport *oauthTraceTransport) traceResponse(response *http.Response) map[string]any {
	trace := map[string]any{
		"cache_control":            response.Header.Get("cache-control"),
		"cf_ray":                   response.Header.Get("cf-ray"),
		"content_length":           response.ContentLength,
		"content_type":             response.Header.Get("content-type"),
		"date":                     response.Header.Get("date"),
		"server":                   response.Header.Get("server"),
		"status":                   response.StatusCode,
		"www_authenticate":         response.Header.Get("www-authenticate"),
		"www_authenticate_present": response.Header.Get("www-authenticate") != "",
	}

	body, err := readAndRestoreResponseBody(response, transport.traceLimit)
	if err != nil {
		trace["body_read_error_type"] = fmt.Sprintf("%T", err)
		return trace
	}
	trace["body_bytes"] = len(body)
	if len(body) == 0 {
		return trace
	}

	contentType, _, _ := strings.Cut(response.Header.Get("content-type"), ";")
	switch strings.ToLower(strings.TrimSpace(contentType)) {
	case "application/json":
		bodyJSON, err := parseJSONBody(body)
		if err != nil {
			trace["body_parse_error_type"] = fmt.Sprintf("%T", err)
			return trace
		}
		trace["body_fields"] = summarizeJSONFields(bodyJSON)
		trace["body_json"] = sanitizeTraceMap(bodyJSON)
		trace["body_sanitized_fields"] = collectSensitiveJSONFields(bodyJSON)
		if safeTraceBody(bodyJSON) {
			trace["body_text"] = string(body)
		}
	case "application/x-www-form-urlencoded", "text/plain":
		form, err := url.ParseQuery(string(body))
		if err != nil {
			trace["body_parse_error_type"] = fmt.Sprintf("%T", err)
			return trace
		}
		trace["body_form"] = summarizeResponseForm(form)
	}
	return trace
}

func readAndRestoreResponseBody(response *http.Response, limit int64) ([]byte, error) {
	if response.Body == nil {
		return nil, nil
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, limit))
	_ = response.Body.Close()
	response.Body = io.NopCloser(bytes.NewReader(body))
	response.ContentLength = int64(len(body))
	return body, err
}

func parseJSONBody(body []byte) (map[string]any, error) {
	var payload map[string]any
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	if err := decoder.Decode(&payload); err != nil {
		return nil, err
	}
	return payload, nil
}

func safeTraceBody(payload map[string]any) bool {
	for key, value := range payload {
		if isSensitiveTraceKey(key) {
			return false
		}
		if nested, ok := value.(map[string]any); ok && !safeTraceBody(nested) {
			return false
		}
		if nested, ok := value.([]any); ok && traceArrayHasSensitiveField(nested) {
			return false
		}
	}
	return true
}

func summarizeResponseForm(form url.Values) map[string]any {
	keys := make([]string, 0, len(form))
	for key := range form {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return map[string]any{
		"error":                 form.Get("error"),
		"error_description":     form.Get("error_description"),
		"error_uri":             form.Get("error_uri"),
		"fields":                summarizeURLValueFields(form),
		"key_count":             len(keys),
		"keys":                  keys,
		"scope":                 form.Get("scope"),
		"sanitized_fields":      collectSensitiveURLValueFields(form),
		"token_type":            form.Get("token_type"),
		"access_value_present":  form.Get("access_token") != "",
		"renewal_value_present": form.Get("refresh_token") != "",
	}
}

func summarizeURLValueFields(values url.Values) []any {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	fields := make([]any, 0, len(keys))
	for _, key := range keys {
		fieldValues := values[key]
		lengths := make([]int, 0, len(fieldValues))
		totalLength := 0
		for _, value := range fieldValues {
			length := len(value)
			lengths = append(lengths, length)
			totalLength += length
		}
		fields = append(fields, map[string]any{
			"name":               key,
			"name_length":        len(key),
			"present":            len(fieldValues) > 0,
			"sanitized":          isSensitiveTraceKey(key),
			"total_value_length": totalLength,
			"value_count":        len(fieldValues),
			"value_lengths":      lengths,
		})
	}
	return fields
}

func summarizeURLValueDiagnostics(values url.Values) map[string]any {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return map[string]any{
		"fields":           summarizeURLValueFields(values),
		"key_count":        len(keys),
		"keys":             keys,
		"sanitized_fields": collectSensitiveURLValueFields(values),
	}
}

func collectSensitiveURLValueFields(values url.Values) []string {
	fields := make([]string, 0)
	for key := range values {
		if isSensitiveTraceKey(key) {
			fields = append(fields, key)
		}
	}
	sort.Strings(fields)
	return fields
}

func summarizeJSONFields(payload map[string]any) []any {
	return summarizeJSONFieldsAtPath(payload, "")
}

func summarizeJSONFieldsAtPath(payload map[string]any, prefix string) []any {
	keys := make([]string, 0, len(payload))
	for key := range payload {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	fields := make([]any, 0, len(keys))
	for _, key := range keys {
		value := payload[key]
		path := key
		if prefix != "" {
			path = prefix + "." + key
		}
		metadata := traceValueMetadata(value, isSensitiveTraceKey(key))
		metadata["name"] = key
		metadata["name_length"] = len(key)
		metadata["path"] = path
		metadata["path_length"] = len(path)
		if nested, ok := value.(map[string]any); ok {
			metadata["fields"] = summarizeJSONFieldsAtPath(nested, path)
		}
		fields = append(fields, metadata)
	}
	return fields
}

func collectSensitiveJSONFields(payload map[string]any) []string {
	fields := make([]string, 0)
	collectSensitiveJSONFieldsAtPath(payload, "", &fields)
	sort.Strings(fields)
	return fields
}

func collectSensitiveJSONFieldsAtPath(payload map[string]any, prefix string, fields *[]string) {
	for key, value := range payload {
		path := key
		if prefix != "" {
			path = prefix + "." + key
		}
		if isSensitiveTraceKey(key) {
			*fields = append(*fields, path)
		}
		switch typed := value.(type) {
		case map[string]any:
			collectSensitiveJSONFieldsAtPath(typed, path, fields)
		case []any:
			for index, item := range typed {
				if nested, ok := item.(map[string]any); ok {
					collectSensitiveJSONFieldsAtPath(nested, fmt.Sprintf("%s[%d]", path, index), fields)
				}
			}
		}
	}
}

func traceArrayHasSensitiveField(values []any) bool {
	for _, value := range values {
		switch typed := value.(type) {
		case map[string]any:
			if !safeTraceBody(typed) {
				return true
			}
		case []any:
			if traceArrayHasSensitiveField(typed) {
				return true
			}
		}
	}
	return false
}

func traceValueMetadata(value any, sanitized bool) map[string]any {
	metadata := map[string]any{
		"present":   value != nil,
		"sanitized": sanitized,
	}
	if encoded, err := json.Marshal(value); err == nil {
		metadata["json_length"] = len(encoded)
	}

	switch typed := value.(type) {
	case nil:
		metadata["value_type"] = "null"
	case string:
		metadata["empty"] = typed == ""
		metadata["value_length"] = len(typed)
		metadata["value_type"] = "string"
	case json.Number:
		metadata["value_length"] = len(typed.String())
		metadata["value_type"] = "number"
	case bool:
		metadata["value_length"] = len(strconv.FormatBool(typed))
		metadata["value_type"] = "boolean"
	case map[string]any:
		metadata["field_count"] = len(typed)
		metadata["value_type"] = "object"
	case []any:
		metadata["value_count"] = len(typed)
		metadata["value_type"] = "array"
	default:
		metadata["value_type"] = fmt.Sprintf("%T", value)
	}
	return metadata
}

func redactedValueSummary(value any) map[string]any {
	metadata := traceValueMetadata(value, true)
	metadata["redacted"] = true
	return metadata
}

func isRedactedValueSummary(value any) bool {
	metadata, ok := value.(map[string]any)
	if !ok {
		return false
	}
	redacted, ok := metadata["redacted"].(bool)
	return ok && redacted
}

func sanitizeTraceMap(payload map[string]any) map[string]any {
	sanitized := make(map[string]any, len(payload))
	for key, value := range payload {
		sanitized[key] = sanitizeTraceValue(key, value)
	}
	return sanitized
}

func sanitizeTraceValue(key string, value any) any {
	if isRedactedValueSummary(value) {
		return value
	}
	if isSensitiveTraceKey(key) {
		return redactedValueSummary(value)
	}

	switch typed := value.(type) {
	case map[string]any:
		return sanitizeTraceMap(typed)
	case []any:
		items := make([]any, 0, len(typed))
		for _, item := range typed {
			items = append(items, sanitizeTraceValue(key, item))
		}
		return items
	default:
		return value
	}
}

func isSensitiveTraceKey(key string) bool {
	keyLower := strings.ToLower(key)
	switch keyLower {
	case "access_token",
		"authorization",
		"authorization_header",
		"client_secret",
		"code",
		"code_challenge",
		"code_verifier",
		"id_token",
		"password",
		"refresh_token",
		"session_id",
		"state":
		return true
	}
	return keyLower == "token" ||
		strings.HasSuffix(keyLower, "_token") ||
		strings.Contains(keyLower, "secret") ||
		strings.Contains(keyLower, "auth_header") ||
		strings.Contains(keyLower, "access_key") ||
		strings.Contains(keyLower, "password")
}

func newState() (string, error) {
	buffer := make([]byte, 32)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buffer), nil
}

func (s *server) authorizationURL() string {
	oauthConfig := s.oauth2Config()
	options := []oauth2.AuthCodeOption{oauth2.S256ChallengeOption(s.pkceVerifier)}
	return oauthConfig.AuthCodeURL(s.state, options...)
}

func (s *server) connectURL() string {
	redirectURL, err := url.Parse(s.cfg.redirectURI)
	if err != nil {
		return ""
	}
	return redirectURL.Scheme + "://" + redirectURL.Host + "/"
}

func (s *server) ServeHTTP(response http.ResponseWriter, request *http.Request) {
	if request.URL.Path == "/" {
		if request.Method != http.MethodGet {
			response.Header().Set("allow", http.MethodGet)
			http.Error(response, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		s.handleConnectPage(response, request)
		return
	}

	if request.URL.Path == connectPath {
		if request.Method != http.MethodGet {
			response.Header().Set("allow", http.MethodGet)
			http.Error(response, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		s.handleConnectRedirect(response, request)
		return
	}

	if request.URL.Path == accountSelectionPath {
		if request.Method != http.MethodPost {
			response.Header().Set("allow", http.MethodPost)
			http.Error(response, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		s.handleAccountSelection(response, request)
		return
	}

	if request.URL.Path != s.cfg.callbackPath {
		http.NotFound(response, request)
		return
	}
	if request.Method != http.MethodGet {
		response.Header().Set("allow", http.MethodGet)
		http.Error(response, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	s.handleCallback(response, request)
}

func (s *server) handleConnectPage(response http.ResponseWriter, request *http.Request) {
	_ = request
	_ = s.events.log("connect_page_served", nil)
	writeConnectPage(response, connectPath, s.authorizationRequestSummary())
}

func (s *server) handleConnectRedirect(response http.ResponseWriter, request *http.Request) {
	_ = s.events.log("oauth_authorization_redirect_issued", map[string]any{
		"oauth": s.authorizationRequestSummary(),
	})
	http.Redirect(response, request, s.authorizationURL(), http.StatusFound)
}

func (s *server) handleCallback(response http.ResponseWriter, request *http.Request) {
	_ = s.events.log("oauth_callback_received", map[string]any{
		"query":               summarizeURLValueDiagnostics(request.URL.Query()),
		"remote_addr_present": request.RemoteAddr != "",
	})

	query := request.URL.Query()
	if oauthError := query.Get("error"); oauthError != "" {
		description := query.Get("error_description")
		receivedState := query.Get("state")
		_ = s.events.log("oauth_callback_error", map[string]any{
			"error":             oauthError,
			"error_description": description,
			"state_matches":     receivedState != "" && receivedState == s.state,
			"state_present":     receivedState != "",
		})
		detail := oauthError
		if description != "" {
			detail += ": " + description
		}
		writeResultPage(response, http.StatusOK, "Cloudflare OAuth returned an error", nil, nil, detail)
		return
	}

	if receivedState := query.Get("state"); receivedState == "" || receivedState != s.state {
		_ = s.events.log("oauth_state_rejected", map[string]any{
			"reason": "missing_or_mismatched_state",
		})
		writeResultPage(response, http.StatusOK, "OAuth state rejected", nil, nil, "missing or mismatched OAuth state")
		return
	}
	_ = s.events.log("oauth_state_validated", nil)

	code := query.Get("code")
	if code == "" {
		_ = s.events.log("oauth_code_missing", nil)
		writeResultPage(response, http.StatusOK, "OAuth code missing", nil, nil, "missing authorization code")
		return
	}

	token, err := s.exchangeCode(request.Context(), code)
	if err != nil {
		fields := map[string]any{
			"error":      err.Error(),
			"error_type": fmt.Sprintf("%T", err),
		}
		var endpointError tokenEndpointHTTPError
		if errors.As(err, &endpointError) {
			fields["token_endpoint_status"] = endpointError.Status
			fields["token_endpoint_error"] = endpointError.ErrorCode
			fields["token_endpoint_error_description"] = endpointError.Description
		}
		_ = s.events.log("oauth_token_exchange_failed", fields)
		writeResultPage(response, http.StatusOK, "OAuth token exchange failed", nil, nil, err.Error())
		return
	}
	_ = s.events.log("oauth_token_exchange_succeeded", map[string]any{
		"token": summarizeToken(token),
	})

	lifecycle := oauthLifecycleSummary{
		InitialToken: summarizeToken(token),
		Refresh: refreshProbeSummary{
			Attempted: token.RefreshToken != "",
		},
	}
	accessTokenForProbe := token.AccessToken
	if token.RefreshToken == "" {
		lifecycle.Refresh.Error = "token endpoint did not return a refresh token"
		_ = s.events.log("oauth_refresh_token_missing", map[string]any{
			"initial_token": lifecycle.InitialToken,
		})
	} else {
		if err := s.storeRefreshToken(token.RefreshToken, "authorization_code", token); err != nil {
			_ = s.events.log("oauth_refresh_token_store_failed", map[string]any{
				"error":      err.Error(),
				"error_type": fmt.Sprintf("%T", err),
				"source":     "authorization_code",
			})
			writeResultPage(response, http.StatusOK, "OAuth refresh token persistence failed", &lifecycle, nil, err.Error())
			return
		}
		_ = s.events.log("oauth_refresh_token_stored", map[string]any{
			"refresh_token_store_enabled": s.cfg.refreshStorePath != "",
			"source":                      "authorization_code",
		})

		refreshedToken, err := s.refreshAccessToken(request.Context(), token.RefreshToken)
		if err != nil {
			lifecycle.Refresh.Error = err.Error()
			_ = s.events.log("oauth_refresh_token_exchange_failed", map[string]any{
				"error":      err.Error(),
				"error_type": fmt.Sprintf("%T", err),
			})
		} else {
			accessTokenForProbe = refreshedToken.AccessToken
			lifecycle.Refresh.Succeeded = true
			lifecycle.Refresh.Token = summarizeToken(refreshedToken)
			_ = s.events.log("oauth_refresh_token_exchange_succeeded", map[string]any{
				"token": lifecycle.Refresh.Token,
			})

			refreshTokenForStore := refreshedToken.RefreshToken
			if refreshTokenForStore == "" {
				refreshTokenForStore = token.RefreshToken
			}
			if err := s.storeRefreshToken(refreshTokenForStore, "refresh_token", refreshedToken); err != nil {
				_ = s.events.log("oauth_refresh_token_store_failed", map[string]any{
					"error":      err.Error(),
					"error_type": fmt.Sprintf("%T", err),
					"source":     "refresh_token",
				})
				writeResultPage(response, http.StatusOK, "OAuth refresh token persistence failed", &lifecycle, nil, err.Error())
				return
			}
			_ = s.events.log("oauth_refresh_token_stored", map[string]any{
				"refresh_token_store_enabled":    s.cfg.refreshStorePath != "",
				"rotated_refresh_token_returned": refreshedToken.RefreshToken != "",
				"source":                         "refresh_token",
			})
		}
	}

	accounts, err := s.listCloudflareAccounts(request.Context(), accessTokenForProbe)
	if err != nil {
		_ = s.events.log("cloudflare_accounts_list_failed", map[string]any{
			"error":      err.Error(),
			"error_type": fmt.Sprintf("%T", err),
		})
		writeResultPage(response, http.StatusOK, "Cloudflare account discovery failed", &lifecycle, nil, err.Error())
		return
	}
	_ = s.events.log("cloudflare_accounts_listed", map[string]any{
		"account_count": len(accounts),
	})

	if len(accounts) == 0 {
		writeResultPage(response, http.StatusOK, "Cloudflare OAuth prod probe needs an account", &lifecycle, nil, "OAuth succeeded, but Cloudflare did not return any accounts for this grant.")
		return
	}

	sessionID, err := newState()
	if err != nil {
		_ = s.events.log("probe_session_create_failed", map[string]any{
			"error_type": fmt.Sprintf("%T", err),
		})
		writeResultPage(response, http.StatusOK, "Probe session creation failed", &lifecycle, nil, err.Error())
		return
	}

	s.storeProbeSession(sessionID, probeSession{
		AccessToken: accessTokenForProbe,
		Accounts:    accounts,
		CreatedAt:   time.Now(),
		Lifecycle:   lifecycle,
	})
	_ = s.events.log("probe_account_selection_ready", map[string]any{
		"account_count":           len(accounts),
		"account_selection_path":  accountSelectionPath,
		"session_ttl_seconds":     int(probeSessionTTL.Seconds()),
		"stored_access_token_ref": "in_memory_only",
	})

	writeAccountSelectionPage(response, sessionID, lifecycle, accounts)
}

func (s *server) authorizationRequestSummary() map[string]any {
	authorizationURL, authorizationErr := url.Parse(s.cfg.authorizationURL)
	redirectURI, redirectErr := url.Parse(s.cfg.redirectURI)

	summary := map[string]any{
		"client_id_hash":   shortHash(s.cfg.clientID),
		"client_id_length": len(s.cfg.clientID),
		"response_type":    "code",
		"scope_count":      len(s.cfg.scopes),
		"scopes":           s.cfg.scopes,
		"uses_pkce":        true,
	}
	if authorizationErr == nil {
		summary["authorization_host"] = authorizationURL.Host
		summary["authorization_path"] = authorizationURL.Path
	}
	if redirectErr == nil {
		summary["redirect_host"] = redirectURI.Host
		summary["redirect_path"] = redirectURI.Path
	}
	return summary
}

func shortHash(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])[:16]
}

func (s *server) oauth2Config() oauth2.Config {
	return oauth2.Config{
		ClientID: s.cfg.clientID,
		Endpoint: oauth2.Endpoint{
			AuthStyle: oauth2.AuthStyleInParams,
			AuthURL:   s.cfg.authorizationURL,
			TokenURL:  s.cfg.tokenURL,
		},
		RedirectURL: s.cfg.redirectURI,
		Scopes:      s.cfg.scopes,
	}
}

func (s *server) oauth2Context(ctx context.Context) context.Context {
	if s.client == nil {
		return ctx
	}
	return context.WithValue(ctx, oauth2.HTTPClient, s.client)
}

func (s *server) exchangeCode(ctx context.Context, code string) (tokenResult, error) {
	oauthConfig := s.oauth2Config()
	if s.pkceVerifier == "" {
		return tokenResult{}, errors.New("PKCE verifier is required")
	}
	options := []oauth2.AuthCodeOption{oauth2.VerifierOption(s.pkceVerifier)}
	token, err := oauthConfig.Exchange(s.oauth2Context(ctx), code, options...)
	if err != nil {
		return tokenResult{}, normalizeTokenEndpointError(err)
	}
	return tokenResultFromOAuth2(token)
}

func (s *server) refreshAccessToken(ctx context.Context, refreshToken string) (tokenResult, error) {
	oauthConfig := s.oauth2Config()
	source := oauthConfig.TokenSource(s.oauth2Context(ctx), &oauth2.Token{
		RefreshToken: refreshToken,
		Expiry:       time.Now().Add(-time.Minute),
	})
	token, err := source.Token()
	if err != nil {
		return tokenResult{}, normalizeTokenEndpointError(err)
	}
	return tokenResultFromOAuth2(token)
}

func normalizeTokenEndpointError(err error) error {
	var retrieveError *oauth2.RetrieveError
	if !errors.As(err, &retrieveError) {
		return err
	}
	status := 0
	if retrieveError.Response != nil {
		status = retrieveError.Response.StatusCode
	}
	return tokenEndpointHTTPError{
		Description: retrieveError.ErrorDescription,
		ErrorCode:   retrieveError.ErrorCode,
		Status:      status,
	}
}

func tokenResultFromOAuth2(token *oauth2.Token) (tokenResult, error) {
	if token == nil || token.AccessToken == "" {
		return tokenResult{}, errors.New("token endpoint did not return an access token")
	}

	expiresIn := int(token.ExpiresIn)
	if expiresIn == 0 && !token.Expiry.IsZero() {
		expiresIn = max(0, int(time.Until(token.Expiry).Seconds()))
	}

	return tokenResult{
		AccessToken:  token.AccessToken,
		ExpiresIn:    expiresIn,
		RefreshToken: token.RefreshToken,
		Scope:        tokenScope(token),
		TokenType:    token.Type(),
	}, nil
}

func tokenScope(token *oauth2.Token) string {
	switch value := token.Extra("scope").(type) {
	case string:
		return value
	case []string:
		return strings.Join(value, " ")
	case []any:
		parts := make([]string, 0, len(value))
		for _, item := range value {
			if text, ok := item.(string); ok && text != "" {
				parts = append(parts, text)
			}
		}
		return strings.Join(parts, " ")
	default:
		return ""
	}
}

func summarizeToken(token tokenResult) tokenSummary {
	return tokenSummary{
		AccessTokenPresent:  token.AccessToken != "",
		ExpiresInSeconds:    token.ExpiresIn,
		RefreshTokenPresent: token.RefreshToken != "",
		Scope:               token.Scope,
		TokenType:           token.TokenType,
	}
}

func newCommandServer(cfg config) *server {
	events := &eventLogger{filePath: cfg.eventsPath}
	return &server{
		cfg:    cfg,
		client: newTraceHTTPClient(cfg, events),
		events: events,
	}
}

func (s *server) refreshAccessTokenFromStore(ctx context.Context, source string) (tokenResult, persistedRefreshSummary, error) {
	store, err := readRefreshTokenStore(s.cfg.refreshStorePath)
	if err != nil {
		return tokenResult{}, persistedRefreshSummary{}, err
	}

	token, err := s.refreshAccessToken(ctx, store.RefreshToken)
	if err != nil {
		return tokenResult{}, persistedRefreshSummary{}, err
	}

	refreshTokenForStore := token.RefreshToken
	if refreshTokenForStore == "" {
		refreshTokenForStore = store.RefreshToken
	}
	rotated := token.RefreshToken != "" && token.RefreshToken != store.RefreshToken
	if err := s.storeRefreshToken(refreshTokenForStore, source, token); err != nil {
		return tokenResult{}, persistedRefreshSummary{}, err
	}

	return token, persistedRefreshSummary{
		AccessTokenPresent:  token.AccessToken != "",
		ExpiresInSeconds:    token.ExpiresIn,
		RefreshTokenPresent: refreshTokenForStore != "",
		RefreshTokenRotated: rotated,
		Scope:               token.Scope,
		Source:              source,
		StoreRewritten:      s.cfg.refreshStorePath != "",
		TokenType:           token.TokenType,
	}, nil
}

func readRefreshTokenStore(path string) (refreshTokenStoreDocument, error) {
	if path == "" {
		return refreshTokenStoreDocument{}, errors.New("PROBE_REFRESH_TOKEN_STORE_PATH is required")
	}

	content, err := os.ReadFile(path)
	if err != nil {
		return refreshTokenStoreDocument{}, fmt.Errorf("read refresh token store: %w", err)
	}

	var store refreshTokenStoreDocument
	if err := json.Unmarshal(content, &store); err != nil {
		return refreshTokenStoreDocument{}, fmt.Errorf("decode refresh token store: %w", err)
	}
	if store.Schema != refreshTokenStoreSchema {
		return refreshTokenStoreDocument{}, fmt.Errorf("refresh token store schema = %q, want %q", store.Schema, refreshTokenStoreSchema)
	}
	if store.RefreshToken == "" {
		return refreshTokenStoreDocument{}, errors.New("refresh token store is missing refresh token")
	}
	return store, nil
}

func (s *server) storeRefreshToken(refreshToken string, source string, token tokenResult) error {
	if s.cfg.refreshStorePath == "" || refreshToken == "" {
		return nil
	}

	return writePrivateJSONFile(s.cfg.refreshStorePath, refreshTokenStoreDocument{
		Schema:                      refreshTokenStoreSchema,
		RefreshToken:                refreshToken,
		Source:                      source,
		StoredAt:                    time.Now().UTC().Format(time.RFC3339Nano),
		ClientIDHash:                shortHash(s.cfg.clientID),
		Scope:                       token.Scope,
		AccessTokenExpiresInSeconds: token.ExpiresIn,
	})
}

func writePrivateJSONFile(path string, value any) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("create private token store directory: %w", err)
	}

	encoded, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal private token store file: %w", err)
	}
	encoded = append(encoded, '\n')

	file, err := os.CreateTemp(dir, ".refresh-token-*.tmp")
	if err != nil {
		return fmt.Errorf("create private token store temp file: %w", err)
	}
	tempPath := file.Name()
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.Remove(tempPath)
		}
	}()

	if err := file.Chmod(0o600); err != nil {
		_ = file.Close()
		return fmt.Errorf("set private token store temp permissions: %w", err)
	}
	if _, err := file.Write(encoded); err != nil {
		_ = file.Close()
		return fmt.Errorf("write private token store temp file: %w", err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("close private token store temp file: %w", err)
	}
	if err := os.Rename(tempPath, path); err != nil {
		return fmt.Errorf("replace private token store file: %w", err)
	}
	if err := os.Chmod(path, 0o600); err != nil {
		return fmt.Errorf("set private token store permissions: %w", err)
	}
	cleanup = false
	return nil
}

func (s *server) listCloudflareAccounts(ctx context.Context, accessToken string) ([]cloudflareAccountSummary, error) {
	requestURL, err := cloudflareAPIURL(s.cfg.apiBaseURL, "accounts")
	if err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("authorization", "Bearer "+accessToken)
	request.Header.Set("accept", "application/json")

	response, err := s.client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	body, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, fmt.Errorf("Cloudflare accounts endpoint returned HTTP %d", response.StatusCode)
	}

	var cloudflare cloudflareListResponse[[]cloudflareAccountSummary]
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	if err := decoder.Decode(&cloudflare); err != nil {
		return nil, err
	}
	if len(cloudflare.Errors) > 0 {
		return nil, fmt.Errorf("Cloudflare accounts endpoint returned %d errors", len(cloudflare.Errors))
	}

	accounts := make([]cloudflareAccountSummary, 0, len(cloudflare.Result))
	for _, account := range cloudflare.Result {
		if account.ID == "" {
			continue
		}
		accounts = append(accounts, account)
	}
	return accounts, nil
}

func (s *server) handleAccountSelection(response http.ResponseWriter, request *http.Request) {
	if err := request.ParseForm(); err != nil {
		_ = s.events.log("probe_account_selection_invalid_form", map[string]any{
			"error": err.Error(),
		})
		http.Error(response, "invalid form", http.StatusBadRequest)
		return
	}

	sessionID := request.PostForm.Get("session_id")
	accountID := request.PostForm.Get("account_id")
	_ = s.events.log("probe_account_selection_received", map[string]any{
		"account_id_present": accountID != "",
		"session_id_present": sessionID != "",
	})

	session, ok := s.consumeProbeSession(sessionID)
	if !ok {
		_ = s.events.log("probe_session_rejected", map[string]any{
			"reason": "missing_expired_or_unknown",
		})
		http.Error(response, "probe session expired or unknown", http.StatusBadRequest)
		return
	}

	account, ok := findAccount(session.Accounts, accountID)
	if !ok {
		s.storeProbeSession(sessionID, session)
		_ = s.events.log("probe_account_rejected", map[string]any{
			"known_account_count": len(session.Accounts),
			"reason":              "unknown_account",
		})
		writeAccountSelectionPage(response, sessionID, session.Lifecycle, session.Accounts)
		return
	}

	_ = s.events.log("probe_account_selected", map[string]any{
		"account_id_present":   account.ID != "",
		"account_name_present": account.Name != "",
		"account_type":         account.Type,
	})

	results := make([]probeResult, 0, 2)
	for _, endpoint := range []string{"send_raw", "send"} {
		_ = s.events.log("cloudflare_probe_started", map[string]any{
			"account_id_present": account.ID != "",
			"endpoint":           endpoint,
		})
		result := s.runCloudflareProbe(request.Context(), endpoint, session.AccessToken, account.ID)
		results = append(results, result)
		_ = s.events.log("cloudflare_probe_classified", map[string]any{
			"classification": result.Classification,
			"endpoint":       result.Endpoint,
			"error_codes":    cloudflareErrorCodes(result.Errors),
			"error_count":    len(result.Errors),
			"status":         result.Status,
		})
	}

	_ = s.events.log("probe_completed", map[string]any{
		"result_count": len(results),
	})

	detail := fmt.Sprintf("Selected Cloudflare account: %s (%s)", displayAccountName(account), account.ID)
	writeResultPage(response, http.StatusOK, "Cloudflare OAuth prod probe completed", &session.Lifecycle, results, detail)
}

func (s *server) runCloudflareProbe(ctx context.Context, endpoint string, accessToken string, accountID string) probeResult {
	probeURL, err := cloudflareAPIURL(s.cfg.apiBaseURL, "accounts", accountID, "email", "sending", endpoint)
	if err != nil {
		return probeResult{
			Classification: "unknown_response",
			Endpoint:       endpoint,
			Status:         0,
		}
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, probeURL, bytes.NewReader([]byte("{}")))
	if err != nil {
		return probeResult{
			Classification: "unknown_response",
			Endpoint:       endpoint,
			Status:         0,
		}
	}
	request.Header.Set("authorization", "Bearer "+accessToken)
	request.Header.Set("content-type", "application/json")
	request.Header.Set("accept", "application/json")

	response, err := s.client.Do(request)
	if err != nil {
		return probeResult{
			Classification: "unknown_response",
			Endpoint:       endpoint,
			Status:         0,
		}
	}
	defer response.Body.Close()

	body, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return probeResult{
			Classification: "unknown_response",
			Endpoint:       endpoint,
			Status:         response.StatusCode,
		}
	}

	var cloudflare cloudflareResponse
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	_ = decoder.Decode(&cloudflare)

	return classifyProbeResponse(endpoint, response.StatusCode, cloudflare)
}

func runOfflineRefreshCommand(ctx context.Context, cfg config, output io.Writer) error {
	probeServer := newCommandServer(cfg)
	token, summary, err := probeServer.refreshAccessTokenFromStore(ctx, "offline_refresh_validation")
	if err != nil {
		return err
	}

	accounts, err := probeServer.listCloudflareAccounts(ctx, token.AccessToken)
	if err != nil {
		return err
	}

	result := offlineRefreshResult{
		Accounts: accountProbeSummary{Count: len(accounts)},
		Token:    summary,
	}
	account, ok, err := selectCloudflareAccount(accounts, strings.TrimSpace(os.Getenv("PROBE_CLOUDFLARE_ACCOUNT_ID")))
	if err != nil {
		return err
	}
	if ok {
		for _, endpoint := range []string{"send_raw", "send"} {
			result.SendProbes = append(result.SendProbes, probeServer.runCloudflareProbe(ctx, endpoint, token.AccessToken, account.ID))
		}
	}

	return writeCommandJSON(output, result)
}

func runEmailSendingValidationCommand(ctx context.Context, cfg config, output io.Writer) error {
	validation, err := loadEmailSendingValidationConfig()
	if err != nil {
		return err
	}

	probeServer := newCommandServer(cfg)
	token, summary, err := probeServer.refreshAccessTokenFromStore(ctx, "email_sending_validation")
	if err != nil {
		return err
	}

	accounts, err := probeServer.listCloudflareAccounts(ctx, token.AccessToken)
	if err != nil {
		return err
	}
	account, ok, err := selectCloudflareAccount(accounts, strings.TrimSpace(os.Getenv("PROBE_CLOUDFLARE_ACCOUNT_ID")))
	if err != nil {
		return err
	}
	if !ok {
		return errors.New("Cloudflare account discovery returned no accounts")
	}

	runID := time.Now().UTC().Format("20060102T150405Z")
	sendPayload, err := buildStructuredSendPayload(validation.From, validation.To, runID)
	if err != nil {
		return err
	}
	rawPayload, err := buildRawSendPayload(validation.From, validation.To, runID, time.Now().UTC())
	if err != nil {
		return err
	}

	result := emailSendingValidationResult{
		Accounts:        accountProbeSummary{Count: len(accounts)},
		RecipientDomain: emailDomain(validation.To),
		Send:            probeServer.runEmailSendingRequest(ctx, "send", token.AccessToken, account.ID, sendPayload),
		SendRaw:         probeServer.runEmailSendingRequest(ctx, "send_raw", token.AccessToken, account.ID, rawPayload),
		SenderDomain:    emailDomain(validation.From),
		Token:           summary,
	}
	return writeCommandJSON(output, result)
}

type emailSendingValidationConfig struct {
	From string
	To   string
}

func loadEmailSendingValidationConfig() (emailSendingValidationConfig, error) {
	if strings.TrimSpace(os.Getenv("PROBE_REAL_EMAIL_SEND_CONFIRM")) != "send-real-email" {
		return emailSendingValidationConfig{}, errors.New("PROBE_REAL_EMAIL_SEND_CONFIRM=send-real-email is required")
	}

	from, err := normalizeEmailAddress(os.Getenv("PROBE_EMAIL_FROM"), "PROBE_EMAIL_FROM")
	if err != nil {
		return emailSendingValidationConfig{}, err
	}
	to, err := normalizeEmailAddress(os.Getenv("PROBE_EMAIL_TO"), "PROBE_EMAIL_TO")
	if err != nil {
		return emailSendingValidationConfig{}, err
	}
	return emailSendingValidationConfig{From: from, To: to}, nil
}

func selectCloudflareAccount(accounts []cloudflareAccountSummary, requestedAccountID string) (cloudflareAccountSummary, bool, error) {
	if len(accounts) == 0 {
		return cloudflareAccountSummary{}, false, nil
	}
	if requestedAccountID != "" {
		account, ok := findAccount(accounts, requestedAccountID)
		if !ok {
			return cloudflareAccountSummary{}, false, errors.New("PROBE_CLOUDFLARE_ACCOUNT_ID did not match a discovered account")
		}
		return account, true, nil
	}
	if len(accounts) > 1 {
		return cloudflareAccountSummary{}, false, errors.New("multiple Cloudflare accounts discovered; set PROBE_CLOUDFLARE_ACCOUNT_ID")
	}
	return accounts[0], true, nil
}

func buildStructuredSendPayload(from string, to string, runID string) ([]byte, error) {
	from, err := normalizeEmailAddress(from, "from")
	if err != nil {
		return nil, err
	}
	to, err = normalizeEmailAddress(to, "to")
	if err != nil {
		return nil, err
	}

	payload := struct {
		To      string `json:"to"`
		From    string `json:"from"`
		Subject string `json:"subject"`
		HTML    string `json:"html"`
		Text    string `json:"text"`
	}{
		To:      to,
		From:    from,
		Subject: "Cloudflare OAuth send validation " + runID,
		HTML:    "<h1>Cloudflare OAuth send validation</h1><p>Structured send API probe " + html.EscapeString(runID) + ".</p>",
		Text:    "Cloudflare OAuth send validation. Structured send API probe " + runID + ".",
	}
	return json.Marshal(payload)
}

func buildRawSendPayload(from string, to string, runID string, now time.Time) ([]byte, error) {
	from, err := normalizeEmailAddress(from, "from")
	if err != nil {
		return nil, err
	}
	to, err = normalizeEmailAddress(to, "to")
	if err != nil {
		return nil, err
	}

	mimeMessage, err := buildRawMIMEMessage(from, to, runID, now)
	if err != nil {
		return nil, err
	}

	payload := struct {
		From        string   `json:"from"`
		MIMEMessage string   `json:"mime_message"`
		Recipients  []string `json:"recipients"`
	}{
		From:        from,
		MIMEMessage: mimeMessage,
		Recipients:  []string{to},
	}
	return json.Marshal(payload)
}

func buildRawMIMEMessage(from string, to string, runID string, now time.Time) (string, error) {
	senderDomain := emailDomain(from)
	if senderDomain == "" {
		return "", errors.New("raw MIME sender address is missing a domain")
	}

	subject := "Cloudflare OAuth send_raw validation " + runID
	messageID := "cf-oauth-send-raw-" + runID + "@" + senderDomain
	var builder strings.Builder
	builder.WriteString("From: ")
	builder.WriteString((&mail.Address{Address: from}).String())
	builder.WriteString("\r\nTo: ")
	builder.WriteString((&mail.Address{Address: to}).String())
	builder.WriteString("\r\nSubject: ")
	builder.WriteString(subject)
	builder.WriteString("\r\nMessage-ID: <")
	builder.WriteString(messageID)
	builder.WriteString(">\r\nDate: ")
	builder.WriteString(now.Format(time.RFC1123Z))
	builder.WriteString("\r\nMIME-Version: 1.0")
	builder.WriteString("\r\nContent-Type: text/plain; charset=UTF-8")
	builder.WriteString("\r\nContent-Transfer-Encoding: 7bit")
	builder.WriteString("\r\n\r\nCloudflare OAuth send_raw validation. Raw MIME probe ")
	builder.WriteString(runID)
	builder.WriteString(".\r\n")

	message := builder.String()
	if strings.Contains(message, "\\r\\n") {
		return "", errors.New("raw MIME message contains literal escaped CRLF")
	}
	if _, err := mail.ReadMessage(strings.NewReader(message)); err != nil {
		return "", fmt.Errorf("validate raw MIME message: %w", err)
	}
	return message, nil
}

func (s *server) runEmailSendingRequest(ctx context.Context, endpoint string, accessToken string, accountID string, payload []byte) emailSendResult {
	requestURL, err := cloudflareAPIURL(s.cfg.apiBaseURL, "accounts", accountID, "email", "sending", endpoint)
	if err != nil {
		return emailSendResult{Endpoint: endpoint}
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, requestURL, bytes.NewReader(payload))
	if err != nil {
		return emailSendResult{Endpoint: endpoint}
	}
	request.Header.Set("authorization", "Bearer "+accessToken)
	request.Header.Set("content-type", "application/json")
	request.Header.Set("accept", "application/json")

	response, err := s.client.Do(request)
	if err != nil {
		return emailSendResult{Endpoint: endpoint}
	}
	defer response.Body.Close()

	body, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return emailSendResult{Endpoint: endpoint, Status: response.StatusCode}
	}

	var cloudflare struct {
		Errors []cloudflareError `json:"errors"`
		Result struct {
			Delivered        []string `json:"delivered"`
			MessageID        string   `json:"message_id"`
			PermanentBounces []string `json:"permanent_bounces"`
			Queued           []string `json:"queued"`
		} `json:"result"`
		Success bool `json:"success"`
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	_ = decoder.Decode(&cloudflare)

	return emailSendResult{
		DeliveredCount:       len(cloudflare.Result.Delivered),
		Endpoint:             endpoint,
		Errors:               sanitizeCloudflareErrors(cloudflare.Errors),
		MessageIDPresent:     cloudflare.Result.MessageID != "",
		PermanentBounceCount: len(cloudflare.Result.PermanentBounces),
		QueuedCount:          len(cloudflare.Result.Queued),
		Status:               response.StatusCode,
		Success:              response.StatusCode >= 200 && response.StatusCode < 300 && cloudflare.Success,
	}
}

func cloudflareAPIURL(baseURL string, elements ...string) (string, error) {
	escaped := make([]string, 0, len(elements))
	for _, element := range elements {
		escaped = append(escaped, url.PathEscape(element))
	}
	return url.JoinPath(baseURL, escaped...)
}

func normalizeEmailAddress(value string, field string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", fmt.Errorf("%s is required", field)
	}
	address, err := mail.ParseAddress(value)
	if err != nil {
		return "", fmt.Errorf("%s is invalid: %w", field, err)
	}
	if address.Address == "" || strings.ContainsAny(address.Address, "\r\n") {
		return "", fmt.Errorf("%s is invalid", field)
	}
	return address.Address, nil
}

func emailDomain(address string) string {
	_, domain, ok := strings.Cut(address, "@")
	if !ok {
		return ""
	}
	return strings.ToLower(domain)
}

func writeCommandJSON(output io.Writer, value any) error {
	encoder := json.NewEncoder(output)
	encoder.SetIndent("", "  ")
	return encoder.Encode(value)
}

func (s *server) storeProbeSession(sessionID string, session probeSession) {
	s.sessionsMu.Lock()
	defer s.sessionsMu.Unlock()

	s.pruneExpiredSessionsLocked(time.Now())
	s.sessions[sessionID] = session
}

func (s *server) consumeProbeSession(sessionID string) (probeSession, bool) {
	s.sessionsMu.Lock()
	defer s.sessionsMu.Unlock()

	s.pruneExpiredSessionsLocked(time.Now())
	session, ok := s.sessions[sessionID]
	if ok {
		delete(s.sessions, sessionID)
	}
	return session, ok
}

func (s *server) pruneExpiredSessionsLocked(now time.Time) {
	for sessionID, session := range s.sessions {
		if now.Sub(session.CreatedAt) > probeSessionTTL {
			delete(s.sessions, sessionID)
		}
	}
}

func findAccount(accounts []cloudflareAccountSummary, accountID string) (cloudflareAccountSummary, bool) {
	for _, account := range accounts {
		if account.ID == accountID {
			return account, true
		}
	}
	return cloudflareAccountSummary{}, false
}

func displayAccountName(account cloudflareAccountSummary) string {
	if account.Name != "" {
		return account.Name
	}
	return account.ID
}

func classifyProbeResponse(endpoint string, status int, response cloudflareResponse) probeResult {
	result := probeResult{
		Classification: "unknown_response",
		Endpoint:       endpoint,
		Errors:         sanitizeCloudflareErrors(response.Errors),
		Status:         status,
	}

	switch {
	case status == http.StatusBadRequest:
		result.Classification = "oauth_accepted_validation_failed"
	case status == http.StatusUnauthorized && hasBadTokenType(response.Errors):
		result.Classification = "oauth_rejected_bad_token_type"
	case status == http.StatusUnauthorized:
		result.Classification = "oauth_rejected_unauthorized"
	case status == http.StatusForbidden:
		result.Classification = "oauth_accepted_forbidden"
	case status == http.StatusNotFound:
		result.Classification = "oauth_accepted_account_or_resource_mismatch"
	}

	return result
}

func hasBadTokenType(errors []cloudflareError) bool {
	for _, item := range errors {
		if item.codeString() == "10103" {
			return true
		}
		message := strings.ToLower(item.Message)
		if strings.Contains(message, "bad_token_type") || strings.Contains(message, "wrong token type") {
			return true
		}
	}
	return false
}

func sanitizeCloudflareErrors(errors []cloudflareError) []sanitizedCFError {
	if len(errors) == 0 {
		return nil
	}
	sanitized := make([]sanitizedCFError, 0, len(errors))
	for _, item := range errors {
		sanitized = append(sanitized, sanitizedCFError{
			Code:    item.codeString(),
			Message: item.Message,
		})
	}
	return sanitized
}

func cloudflareErrorCodes(errors []sanitizedCFError) []string {
	if len(errors) == 0 {
		return nil
	}
	codes := make([]string, 0, len(errors))
	for _, item := range errors {
		if item.Code != "" {
			codes = append(codes, item.Code)
		}
	}
	return codes
}

func (item cloudflareError) codeString() string {
	switch value := item.Code.(type) {
	case nil:
		return ""
	case string:
		return value
	case float64:
		return strconv.FormatInt(int64(value), 10)
	case json.Number:
		return value.String()
	default:
		return fmt.Sprint(value)
	}
}

func writeResultPage(response http.ResponseWriter, status int, title string, lifecycle *oauthLifecycleSummary, results []probeResult, detail string) {
	response.Header().Set("content-type", "text/html; charset=utf-8")
	response.WriteHeader(status)

	var builder strings.Builder
	builder.WriteString("<!doctype html><html><head><meta charset=\"utf-8\"><title>")
	builder.WriteString(html.EscapeString(title))
	builder.WriteString("</title></head><body><main>")
	builder.WriteString("<h1>")
	builder.WriteString(html.EscapeString(title))
	builder.WriteString("</h1>")

	if detail != "" {
		builder.WriteString("<p>")
		builder.WriteString(html.EscapeString(detail))
		builder.WriteString("</p>")
	}

	if lifecycle != nil {
		builder.WriteString("<h2>OAuth lifecycle</h2><table><thead><tr><th>Step</th><th>Access token</th><th>Refresh token</th><th>Expires in</th><th>Status</th></tr></thead><tbody>")
		builder.WriteString("<tr><td>authorization_code</td><td>")
		builder.WriteString(boolText(lifecycle.InitialToken.AccessTokenPresent))
		builder.WriteString("</td><td>")
		builder.WriteString(boolText(lifecycle.InitialToken.RefreshTokenPresent))
		builder.WriteString("</td><td>")
		builder.WriteString(strconv.Itoa(lifecycle.InitialToken.ExpiresInSeconds))
		builder.WriteString("</td><td>completed</td></tr>")

		builder.WriteString("<tr><td>refresh_token</td><td>")
		builder.WriteString(boolText(lifecycle.Refresh.Token.AccessTokenPresent))
		builder.WriteString("</td><td>")
		builder.WriteString(boolText(lifecycle.Refresh.Token.RefreshTokenPresent))
		builder.WriteString("</td><td>")
		builder.WriteString(strconv.Itoa(lifecycle.Refresh.Token.ExpiresInSeconds))
		builder.WriteString("</td><td>")
		switch {
		case lifecycle.Refresh.Succeeded:
			builder.WriteString("completed")
		case lifecycle.Refresh.Attempted:
			builder.WriteString("failed")
		default:
			builder.WriteString("not attempted")
		}
		if lifecycle.Refresh.Error != "" {
			builder.WriteString(": ")
			builder.WriteString(html.EscapeString(lifecycle.Refresh.Error))
		}
		builder.WriteString("</td></tr></tbody></table>")
	}

	if len(results) > 0 {
		builder.WriteString("<table><thead><tr><th>Endpoint</th><th>Status</th><th>Classification</th><th>Errors</th></tr></thead><tbody>")
		for _, result := range results {
			builder.WriteString("<tr><td>")
			builder.WriteString(html.EscapeString(result.Endpoint))
			builder.WriteString("</td><td>")
			builder.WriteString(strconv.Itoa(result.Status))
			builder.WriteString("</td><td>")
			builder.WriteString(html.EscapeString(result.Classification))
			builder.WriteString("</td><td><pre>")
			encoded, _ := json.MarshalIndent(result.Errors, "", "  ")
			builder.WriteString(html.EscapeString(string(encoded)))
			builder.WriteString("</pre></td></tr>")
		}
		builder.WriteString("</tbody></table>")
	}

	builder.WriteString("</main></body></html>")
	_, _ = response.Write([]byte(builder.String()))
}

func writeConnectPage(response http.ResponseWriter, connectPath string, summary map[string]any) {
	response.Header().Set("content-type", "text/html; charset=utf-8")
	response.WriteHeader(http.StatusOK)

	var builder strings.Builder
	builder.WriteString("<!doctype html><html><head><meta charset=\"utf-8\"><title>Connect Cloudflare</title></head><body><main>")
	builder.WriteString("<h1>Connect Cloudflare</h1>")
	builder.WriteString("<p>This probe will follow the production OAuth connection flow and then validate the selected account.</p>")
	builder.WriteString("<p><a href=\"")
	builder.WriteString(html.EscapeString(connectPath))
	builder.WriteString("\"><button type=\"button\">Connect Cloudflare</button></a></p>")
	builder.WriteString("<h2>Current OAuth request</h2><pre>")
	encoded, _ := json.MarshalIndent(summary, "", "  ")
	builder.WriteString(html.EscapeString(string(encoded)))
	builder.WriteString("</pre>")
	builder.WriteString("</main></body></html>")
	_, _ = response.Write([]byte(builder.String()))
}

func writeAccountSelectionPage(response http.ResponseWriter, sessionID string, lifecycle oauthLifecycleSummary, accounts []cloudflareAccountSummary) {
	response.Header().Set("content-type", "text/html; charset=utf-8")
	response.WriteHeader(http.StatusOK)

	var builder strings.Builder
	builder.WriteString("<!doctype html><html><head><meta charset=\"utf-8\"><title>Choose Cloudflare account</title></head><body><main>")
	builder.WriteString("<h1>Choose Cloudflare account</h1>")
	builder.WriteString("<p>OAuth succeeded. Select the account to use for the account-scoped Email Sending probe.</p>")

	builder.WriteString("<h2>OAuth lifecycle</h2><table><thead><tr><th>Step</th><th>Access token</th><th>Refresh token</th><th>Expires in</th><th>Status</th></tr></thead><tbody>")
	builder.WriteString("<tr><td>authorization_code</td><td>")
	builder.WriteString(boolText(lifecycle.InitialToken.AccessTokenPresent))
	builder.WriteString("</td><td>")
	builder.WriteString(boolText(lifecycle.InitialToken.RefreshTokenPresent))
	builder.WriteString("</td><td>")
	builder.WriteString(strconv.Itoa(lifecycle.InitialToken.ExpiresInSeconds))
	builder.WriteString("</td><td>completed</td></tr>")
	builder.WriteString("<tr><td>refresh_token</td><td>")
	builder.WriteString(boolText(lifecycle.Refresh.Token.AccessTokenPresent))
	builder.WriteString("</td><td>")
	builder.WriteString(boolText(lifecycle.Refresh.Token.RefreshTokenPresent))
	builder.WriteString("</td><td>")
	builder.WriteString(strconv.Itoa(lifecycle.Refresh.Token.ExpiresInSeconds))
	builder.WriteString("</td><td>")
	if lifecycle.Refresh.Succeeded {
		builder.WriteString("completed")
	} else if lifecycle.Refresh.Attempted {
		builder.WriteString("failed")
	} else {
		builder.WriteString("not attempted")
	}
	builder.WriteString("</td></tr></tbody></table>")

	builder.WriteString("<h2>Accounts discovered through OAuth</h2>")
	builder.WriteString("<table><thead><tr><th>Name</th><th>ID</th><th>Type</th><th>Action</th></tr></thead><tbody>")
	for _, account := range accounts {
		builder.WriteString("<tr><td>")
		builder.WriteString(html.EscapeString(displayAccountName(account)))
		builder.WriteString("</td><td>")
		builder.WriteString(html.EscapeString(account.ID))
		builder.WriteString("</td><td>")
		builder.WriteString(html.EscapeString(account.Type))
		builder.WriteString("</td><td><form method=\"post\" action=\"")
		builder.WriteString(accountSelectionPath)
		builder.WriteString("\"><input type=\"hidden\" name=\"session_id\" value=\"")
		builder.WriteString(html.EscapeString(sessionID))
		builder.WriteString("\"><input type=\"hidden\" name=\"account_id\" value=\"")
		builder.WriteString(html.EscapeString(account.ID))
		builder.WriteString("\"><button type=\"submit\">Run probe</button></form></td></tr>")
	}
	builder.WriteString("</tbody></table>")
	builder.WriteString("</main></body></html>")
	_, _ = response.Write([]byte(builder.String()))
}

func boolText(value bool) string {
	if value {
		return "yes"
	}
	return "no"
}

func (logger *eventLogger) log(event string, fields map[string]any) error {
	if logger == nil {
		return nil
	}

	logger.mu.Lock()
	defer logger.mu.Unlock()

	attributes := sanitizeFields(fields)
	entry := map[string]any{
		"event":      event,
		"timestamp":  time.Now().UTC().Format(time.RFC3339Nano),
		"attributes": attributes,
	}

	if err := os.MkdirAll(filepath.Dir(logger.filePath), 0o700); err != nil {
		return err
	}

	file, err := os.OpenFile(logger.filePath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	defer file.Close()

	encoded, err := json.Marshal(entry)
	if err != nil {
		return err
	}
	if _, err := file.Write(append(encoded, '\n')); err != nil {
		return err
	}

	if len(attributes) == 0 {
		log.Printf("[cloudflare-oauth-prod-probe] event=%s", event)
		return nil
	}

	encodedAttributes, err := json.Marshal(attributes)
	if err != nil {
		return err
	}
	log.Printf("[cloudflare-oauth-prod-probe] event=%s attributes=%s", event, encodedAttributes)
	return nil
}

func sanitizeFields(fields map[string]any) map[string]any {
	if fields == nil {
		return map[string]any{}
	}
	sanitized := make(map[string]any, len(fields))
	for key, value := range fields {
		sanitized[key] = sanitizeFieldValue(key, value)
	}
	return sanitized
}

func sanitizeFieldValue(key string, value any) any {
	keyLower := strings.ToLower(key)
	switch keyLower {
	case "authorization_host", "authorization_path", "token_endpoint_error", "token_endpoint_error_description", "token_endpoint_status", "uses_pkce":
		return value
	case "authorization_header":
		return redactedValueSummary(value)
	}
	if isRedactedValueSummary(value) {
		return value
	}
	switch typed := value.(type) {
	case tokenSummary:
		return typed
	}
	if isSensitiveTraceKey(key) {
		return redactedValueSummary(value)
	}

	switch typed := value.(type) {
	case map[string]any:
		return sanitizeFields(typed)
	case []any:
		items := make([]any, 0, len(typed))
		for _, item := range typed {
			items = append(items, sanitizeFieldValue(key, item))
		}
		return items
	}

	return value
}
