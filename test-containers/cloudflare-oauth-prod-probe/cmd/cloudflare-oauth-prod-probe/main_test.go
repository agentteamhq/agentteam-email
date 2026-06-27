package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/mail"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type tokenEndpointErrorResponse struct {
	Error            string `json:"error"`
	ErrorDescription string `json:"error_description"`
}

func TestClassifyProbeResponse(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name           string
		status         int
		errors         []cloudflareError
		classification string
	}{
		{
			name:           "validation failure means OAuth passed auth",
			status:         http.StatusBadRequest,
			classification: "oauth_accepted_validation_failed",
		},
		{
			name:   "bad token type is rejected OAuth",
			status: http.StatusUnauthorized,
			errors: []cloudflareError{
				{Code: json.Number("10103"), Message: "email.sending.error.authentication.bad_token_type"},
			},
			classification: "oauth_rejected_bad_token_type",
		},
		{
			name:           "other unauthorized is not enough to prove bad token type",
			status:         http.StatusUnauthorized,
			classification: "oauth_rejected_unauthorized",
		},
		{
			name:           "forbidden means token type passed auth boundary",
			status:         http.StatusForbidden,
			classification: "oauth_accepted_forbidden",
		},
		{
			name:           "not found means token type passed auth boundary",
			status:         http.StatusNotFound,
			classification: "oauth_accepted_account_or_resource_mismatch",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			result := classifyProbeResponse("send_raw", test.status, cloudflareResponse{Errors: test.errors})
			if result.Classification != test.classification {
				t.Fatalf("classification = %q, want %q", result.Classification, test.classification)
			}
		})
	}
}

func TestRouteGateReturnsNotFoundForUnknownPaths(t *testing.T) {
	t.Parallel()

	probeServer := newTestServer(t)
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "https://example.test/unknown", nil)

	probeServer.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusNotFound)
	}
}

func TestRootRendersConnectPage(t *testing.T) {
	t.Parallel()

	probeServer := newTestServer(t)
	probeServer.cfg.authorizationURL = "https://dash.cloudflare.com/oauth2/auth"
	probeServer.cfg.clientID = "client-id"
	probeServer.cfg.redirectURI = "https://callback.example/oauth/callback/cloudflare"
	probeServer.cfg.scopes = []string{"offline_access", "email-sending.write"}

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "https://callback.example/", nil)

	probeServer.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}
	body := response.Body.String()
	if !strings.Contains(body, "Connect Cloudflare") {
		t.Fatalf("root page does not render connect copy: %s", body)
	}
	if !strings.Contains(body, "href=\"/connect/cloudflare\"") {
		t.Fatalf("root page does not link to local connect handler: %s", body)
	}
	if strings.Contains(body, "client-id") {
		t.Fatalf("root page exposed raw client id: %s", body)
	}
	if !strings.Contains(body, "client_id_hash") {
		t.Fatalf("root page does not include OAuth request diagnostics: %s", body)
	}
}

func TestConnectRedirectLogsAndRedirectsToCloudflare(t *testing.T) {
	t.Parallel()

	eventsPath := filepath.Join(t.TempDir(), "events.jsonl")
	probeServer := newTestServer(t)
	probeServer.cfg.authorizationURL = "https://dash.cloudflare.com/oauth2/auth"
	probeServer.cfg.clientID = "client-id"
	probeServer.cfg.clientSecret = "client-secret"
	probeServer.cfg.eventsPath = eventsPath
	probeServer.cfg.redirectURI = "https://callback.example/oauth/callback/cloudflare"
	probeServer.cfg.scopes = []string{"offline_access", "email-sending.write"}
	probeServer.events = &eventLogger{filePath: eventsPath}

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "https://callback.example/connect/cloudflare", nil)

	probeServer.ServeHTTP(response, request)

	if response.Code != http.StatusFound {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusFound)
	}
	location := response.Header().Get("location")
	if !strings.HasPrefix(location, "https://dash.cloudflare.com/oauth2/auth?") {
		t.Fatalf("redirect location = %q", location)
	}
	if !strings.Contains(location, "response_type=code") {
		t.Fatalf("redirect location missing response_type: %s", location)
	}

	content, err := os.ReadFile(eventsPath)
	if err != nil {
		t.Fatal(err)
	}
	text := string(content)
	if !strings.Contains(text, "oauth_authorization_redirect_issued") {
		t.Fatalf("event log missing connect event: %s", text)
	}
	if strings.Contains(text, "client-secret") || strings.Contains(text, "client-id\"") {
		t.Fatalf("event log exposed client credentials: %s", text)
	}
}

func TestConnectRedirectUsesPKCEForTokenAuthNone(t *testing.T) {
	t.Parallel()

	eventsPath := filepath.Join(t.TempDir(), "events.jsonl")
	probeServer := newTestServer(t)
	probeServer.cfg.authorizationURL = "https://dash.cloudflare.com/oauth2/auth"
	probeServer.cfg.clientID = "client-id"
	probeServer.cfg.eventsPath = eventsPath
	probeServer.cfg.redirectURI = "https://callback.example/oauth/callback/cloudflare"
	probeServer.cfg.scopes = []string{"offline_access", "email-sending.write"}
	probeServer.cfg.tokenAuthMethod = "none"
	probeServer.events = &eventLogger{filePath: eventsPath}
	probeServer.pkceVerifier = "pkce-verifier"

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "https://callback.example/connect/cloudflare", nil)

	probeServer.ServeHTTP(response, request)

	if response.Code != http.StatusFound {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusFound)
	}
	location := response.Header().Get("location")
	parsedLocation, err := url.Parse(location)
	if err != nil {
		t.Fatalf("redirect location is invalid: %v", err)
	}
	query := parsedLocation.Query()
	if query.Get("response_type") != "code" {
		t.Fatalf("response_type = %q, want code", query.Get("response_type"))
	}
	if query.Get("code_challenge") == "" {
		t.Fatalf("redirect location missing code_challenge: %s", location)
	}
	if query.Get("code_challenge_method") != "S256" {
		t.Fatalf("code_challenge_method = %q, want S256", query.Get("code_challenge_method"))
	}
	if strings.Contains(location, "pkce-verifier") || strings.Contains(location, "code_verifier") {
		t.Fatalf("redirect location exposed PKCE verifier: %s", location)
	}

	content, err := os.ReadFile(eventsPath)
	if err != nil {
		t.Fatal(err)
	}
	text := string(content)
	if strings.Contains(text, "pkce-verifier") || strings.Contains(text, "code_verifier") {
		t.Fatalf("event log exposed PKCE verifier: %s", text)
	}
	if !strings.Contains(text, `"uses_pkce":true`) || !strings.Contains(text, `"uses_client_secret":false`) {
		t.Fatalf("event log missing PKCE summary: %s", text)
	}
}

func TestCallbackRejectsMismatchedState(t *testing.T) {
	t.Parallel()

	probeServer := newTestServer(t)
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "https://example.test/oauth/callback/cloudflare?state=wrong&code=code", nil)

	probeServer.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}
	if !strings.Contains(response.Body.String(), "OAuth state rejected") {
		t.Fatalf("body does not explain rejected state: %s", response.Body.String())
	}
}

func TestCallbackReportsProviderErrorBeforeStateRejection(t *testing.T) {
	t.Parallel()

	eventsPath := filepath.Join(t.TempDir(), "events.jsonl")
	probeServer := newTestServer(t)
	probeServer.cfg.eventsPath = eventsPath
	probeServer.events = &eventLogger{filePath: eventsPath}
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "https://example.test/oauth/callback/cloudflare?error=invalid_client&error_description=client+does+not+exist", nil)

	probeServer.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}
	if !strings.Contains(response.Body.String(), "invalid_client") || !strings.Contains(response.Body.String(), "client does not exist") {
		t.Fatalf("body does not include provider error: %s", response.Body.String())
	}

	content, err := os.ReadFile(eventsPath)
	if err != nil {
		t.Fatal(err)
	}
	text := string(content)
	if !strings.Contains(text, "oauth_callback_error") || strings.Contains(text, "oauth_state_rejected") {
		t.Fatalf("event log did not preserve provider error before state rejection: %s", text)
	}
}

func TestCallbackReportsTokenEndpointOAuthErrorWithoutLeakingCode(t *testing.T) {
	t.Parallel()

	eventsPath := filepath.Join(t.TempDir(), "events.jsonl")
	tokenServer := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPost {
			t.Fatalf("token method = %s, want POST", request.Method)
		}
		username, password, ok := request.BasicAuth()
		if !ok || username != "client-id" || password != "client-secret" {
			t.Fatalf("token basic auth = %q/%q ok=%v", username, password, ok)
		}
		response.Header().Set("content-type", "application/json")
		response.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(response).Encode(tokenEndpointErrorResponse{
			Error:            "invalid_client",
			ErrorDescription: "Client authentication failed",
		})
	}))
	defer tokenServer.Close()

	probeServer := &server{
		cfg: config{
			callbackPath: "/oauth/callback/cloudflare",
			clientID:     "client-id",
			clientSecret: "client-secret",
			eventsPath:   eventsPath,
			redirectURI:  "https://callback.example/oauth/callback/cloudflare",
			tokenURL:     tokenServer.URL,
		},
		client:   tokenServer.Client(),
		events:   &eventLogger{filePath: eventsPath},
		state:    "expected-state",
		sessions: make(map[string]probeSession),
	}

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "https://callback.example/oauth/callback/cloudflare?state=expected-state&code=auth-code", nil)
	probeServer.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}
	body := response.Body.String()
	if !strings.Contains(body, "invalid_client") || !strings.Contains(body, "Client authentication failed") {
		t.Fatalf("body does not include token endpoint OAuth error: %s", body)
	}

	content, err := os.ReadFile(eventsPath)
	if err != nil {
		t.Fatal(err)
	}
	text := string(content)
	if !strings.Contains(text, `"token_endpoint_status":401`) || !strings.Contains(text, `"token_endpoint_error":"invalid_client"`) {
		t.Fatalf("event log did not include token endpoint details: %s", text)
	}
	if !strings.Contains(text, `"token_auth_method":"client_secret_basic"`) {
		t.Fatalf("event log did not include token auth method: %s", text)
	}
	if strings.Contains(text, `"token_endpoint_error":"[redacted]"`) {
		t.Fatalf("event log redacted safe token endpoint details: %s", text)
	}
	if strings.Contains(text, "auth-code") {
		t.Fatalf("event log exposed authorization code: %s", text)
	}
}

func TestExchangeTokenUsesClientSecretPostWhenConfigured(t *testing.T) {
	t.Parallel()

	tokenServer := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Header.Get("authorization") != "" {
			t.Fatalf("client_secret_post request included authorization header")
		}
		if err := request.ParseForm(); err != nil {
			t.Fatal(err)
		}
		if request.PostForm.Get("client_id") != "client-id" {
			t.Fatalf("client_id form value = %q", request.PostForm.Get("client_id"))
		}
		if request.PostForm.Get("client_secret") != "client-secret" {
			t.Fatalf("client_secret form value = %q", request.PostForm.Get("client_secret"))
		}
		if request.PostForm.Get("grant_type") != "authorization_code" {
			t.Fatalf("grant_type = %q", request.PostForm.Get("grant_type"))
		}
		response.Header().Set("content-type", "application/json")
		_ = json.NewEncoder(response).Encode(map[string]any{
			"access_token": "access-token",
			"expires_in":   3600,
			"token_type":   "bearer",
		})
	}))
	defer tokenServer.Close()

	probeServer := &server{
		cfg: config{
			clientID:        "client-id",
			clientSecret:    "client-secret",
			redirectURI:     "https://callback.example/oauth/callback/cloudflare",
			tokenAuthMethod: "client_secret_post",
			tokenURL:        tokenServer.URL,
		},
		client: tokenServer.Client(),
	}

	token, err := probeServer.exchangeCode(context.Background(), "auth-code")
	if err != nil {
		t.Fatal(err)
	}
	if token.AccessToken != "access-token" {
		t.Fatalf("access token = %q", token.AccessToken)
	}
}

func TestExchangeTokenUsesPKCEWithoutClientSecretWhenConfigured(t *testing.T) {
	t.Parallel()

	tokenServer := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Header.Get("authorization") != "" {
			t.Fatalf("PKCE request included authorization header")
		}
		if err := request.ParseForm(); err != nil {
			t.Fatal(err)
		}
		if request.PostForm.Get("client_id") != "client-id" {
			t.Fatalf("client_id form value = %q", request.PostForm.Get("client_id"))
		}
		if request.PostForm.Get("client_secret") != "" {
			t.Fatalf("client_secret form value = %q, want empty", request.PostForm.Get("client_secret"))
		}
		if request.PostForm.Get("code_verifier") != "pkce-verifier" {
			t.Fatalf("code_verifier form value = %q", request.PostForm.Get("code_verifier"))
		}
		if request.PostForm.Get("grant_type") != "authorization_code" {
			t.Fatalf("grant_type = %q", request.PostForm.Get("grant_type"))
		}
		response.Header().Set("content-type", "application/json")
		_ = json.NewEncoder(response).Encode(map[string]any{
			"access_token": "access-token",
			"expires_in":   3600,
			"token_type":   "bearer",
		})
	}))
	defer tokenServer.Close()

	probeServer := &server{
		cfg: config{
			clientID:        "client-id",
			clientSecret:    "ignored-client-secret",
			redirectURI:     "https://callback.example/oauth/callback/cloudflare",
			tokenAuthMethod: "none",
			tokenURL:        tokenServer.URL,
		},
		client:       tokenServer.Client(),
		pkceVerifier: "pkce-verifier",
	}

	token, err := probeServer.exchangeCode(context.Background(), "auth-code")
	if err != nil {
		t.Fatal(err)
	}
	if token.AccessToken != "access-token" {
		t.Fatalf("access token = %q", token.AccessToken)
	}
}

func TestSanitizedLoggingRedactsSecretsAndKeepsErrorCodes(t *testing.T) {
	t.Parallel()

	fields := sanitizeFields(map[string]any{
		"access_token":                     "secret-access-token",
		"authorization_host":               "dash.cloudflare.com",
		"authorization_path":               "/oauth2/auth",
		"authorization_header":             "Bearer secret-access-token",
		"cloudflare_error_code":            "10103",
		"endpoint":                         "send_raw",
		"token_auth_method":                "client_secret_basic",
		"token_endpoint_error":             "invalid_client",
		"token_endpoint_error_description": "Client authentication failed",
		"token_endpoint_status":            401,
		"uses_client_secret":               true,
	})

	requireRedactedSummary(t, fields["access_token"], len("secret-access-token"))
	if fields["authorization_host"] != "dash.cloudflare.com" {
		t.Fatalf("authorization host was redacted: %#v", fields["authorization_host"])
	}
	if fields["authorization_path"] != "/oauth2/auth" {
		t.Fatalf("authorization path was redacted: %#v", fields["authorization_path"])
	}
	requireRedactedSummary(t, fields["authorization_header"], len("Bearer secret-access-token"))
	if fields["cloudflare_error_code"] != "10103" {
		t.Fatalf("cloudflare error code was changed: %#v", fields["cloudflare_error_code"])
	}
	if fields["endpoint"] != "send_raw" {
		t.Fatalf("endpoint was changed: %#v", fields["endpoint"])
	}
	if fields["token_auth_method"] != "client_secret_basic" {
		t.Fatalf("token auth method was redacted: %#v", fields["token_auth_method"])
	}
	if fields["token_endpoint_error"] != "invalid_client" {
		t.Fatalf("token endpoint error was redacted: %#v", fields["token_endpoint_error"])
	}
	if fields["token_endpoint_error_description"] != "Client authentication failed" {
		t.Fatalf("token endpoint error description was redacted: %#v", fields["token_endpoint_error_description"])
	}
	if fields["token_endpoint_status"] != 401 {
		t.Fatalf("token endpoint status was redacted: %#v", fields["token_endpoint_status"])
	}
	if fields["uses_client_secret"] != true {
		t.Fatalf("uses client secret metadata was redacted: %#v", fields["uses_client_secret"])
	}
}

func TestEventLoggerDoesNotWriteTokenValues(t *testing.T) {
	t.Parallel()

	eventsPath := filepath.Join(t.TempDir(), "events.jsonl")
	logger := &eventLogger{filePath: eventsPath}

	err := logger.log("oauth_token_exchange_succeeded", map[string]any{
		"access_token": "secret-access-token",
		"token": tokenSummary{
			AccessTokenPresent:  true,
			RefreshTokenPresent: true,
			Scope:               "email-sending.write",
			TokenType:           "Bearer",
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	content, err := os.ReadFile(eventsPath)
	if err != nil {
		t.Fatal(err)
	}
	text := string(content)
	if strings.Contains(text, "secret-access-token") {
		t.Fatalf("event log exposed token: %s", text)
	}
	if !strings.Contains(text, `"access_token":{"empty":false,"json_length":21,"present":true,"redacted":true,"sanitized":true,"value_length":19,"value_type":"string"}`) {
		t.Fatalf("event log did not include redaction metadata: %s", text)
	}
	if !strings.Contains(text, "email-sending.write") {
		t.Fatalf("event log lost safe scope summary: %s", text)
	}
}

func TestTokenFormTraceReportsAllFieldLengthsAndSanitizedFields(t *testing.T) {
	t.Parallel()

	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("code", "auth-code")
	form.Set("redirect_uri", "https://callback.example/oauth/callback/cloudflare")
	form.Set("client_id", "client-id")
	form.Set("client_secret", "client-secret")

	summary := summarizeTokenForm(form, config{
		clientID:     "client-id",
		clientSecret: "client-secret",
	})
	encoded, err := json.Marshal(summary)
	if err != nil {
		t.Fatal(err)
	}
	text := string(encoded)
	for _, expected := range []string{
		`"name":"client_secret"`,
		`"sanitized":true`,
		`"total_value_length":13`,
		`"name":"code"`,
		`"total_value_length":9`,
		`"sanitized_fields":["client_secret","code"]`,
	} {
		if !strings.Contains(text, expected) {
			t.Fatalf("summary missing %s: %s", expected, text)
		}
	}
	if strings.Contains(text, "client-secret") || strings.Contains(text, "auth-code") {
		t.Fatalf("summary exposed sensitive form values: %s", text)
	}
}

func TestJSONTraceReportsRedactedFieldLengths(t *testing.T) {
	t.Parallel()

	payload := map[string]any{
		"access_token":      "secret-access-token",
		"error":             "invalid_client",
		"error_description": "Client authentication failed",
	}

	sanitized := sanitizeTraceMap(payload)
	requireRedactedSummary(t, sanitized["access_token"], len("secret-access-token"))
	if sanitized["error"] != "invalid_client" {
		t.Fatalf("safe error field was changed: %#v", sanitized["error"])
	}

	fields := summarizeJSONFields(payload)
	encoded, err := json.Marshal(fields)
	if err != nil {
		t.Fatal(err)
	}
	text := string(encoded)
	for _, expected := range []string{
		`"name":"access_token"`,
		`"sanitized":true`,
		`"value_length":19`,
		`"name":"error_description"`,
		`"sanitized":false`,
	} {
		if !strings.Contains(text, expected) {
			t.Fatalf("field metadata missing %s: %s", expected, text)
		}
	}
	if strings.Contains(text, "secret-access-token") {
		t.Fatalf("field metadata exposed sensitive JSON value: %s", text)
	}
}

func TestCallbackRefreshesDiscoversAccountsAndUsesRefreshedTokenForSendProbes(t *testing.T) {
	t.Parallel()

	eventsPath := filepath.Join(t.TempDir(), "events.jsonl")
	tokenStorePath := filepath.Join(t.TempDir(), "refresh-token.json")
	tokenGrantTypes := make([]string, 0, 2)
	tokenServer := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPost {
			t.Fatalf("token method = %s, want POST", request.Method)
		}
		username, password, ok := request.BasicAuth()
		if !ok || username != "client-id" || password != "client-secret" {
			t.Fatalf("token basic auth = %q/%q ok=%v", username, password, ok)
		}
		if err := request.ParseForm(); err != nil {
			t.Fatal(err)
		}
		grantType := request.PostForm.Get("grant_type")
		tokenGrantTypes = append(tokenGrantTypes, grantType)
		response.Header().Set("content-type", "application/json")
		switch grantType {
		case "authorization_code":
			if request.PostForm.Get("code") != "auth-code" {
				t.Fatalf("authorization code = %q", request.PostForm.Get("code"))
			}
			_ = json.NewEncoder(response).Encode(map[string]any{
				"access_token":  "initial-access-token",
				"expires_in":    60,
				"refresh_token": "initial-refresh-token",
				"scope":         "offline_access email-sending.write",
				"token_type":    "bearer",
			})
		case "refresh_token":
			if request.PostForm.Get("refresh_token") != "initial-refresh-token" {
				t.Fatalf("refresh token form value = %q", request.PostForm.Get("refresh_token"))
			}
			_ = json.NewEncoder(response).Encode(map[string]any{
				"access_token":  "refreshed-access-token",
				"expires_in":    3600,
				"refresh_token": "rotated-refresh-token",
				"scope":         "offline_access email-sending.write",
				"token_type":    "bearer",
			})
		default:
			t.Fatalf("unexpected grant type %q", grantType)
		}
	}))
	defer tokenServer.Close()

	apiAuthorizationHeaders := make([]string, 0, 3)
	apiServer := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		apiAuthorizationHeaders = append(apiAuthorizationHeaders, request.Header.Get("authorization"))
		response.Header().Set("content-type", "application/json")
		if request.Method == http.MethodGet && request.URL.Path == "/accounts" {
			_ = json.NewEncoder(response).Encode(cloudflareListResponse[[]cloudflareAccountSummary]{
				Result: []cloudflareAccountSummary{
					{ID: "account-id", Name: "Test Account", Type: "standard"},
				},
				Success: true,
			})
			return
		}

		if request.Method != http.MethodPost || !strings.HasPrefix(request.URL.Path, "/accounts/account-id/email/sending/") {
			t.Fatalf("unexpected API request %s %s", request.Method, request.URL.Path)
		}
		response.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(response).Encode(cloudflareResponse{
			Errors: []cloudflareError{{Code: json.Number("1000"), Message: "validation failed"}},
		})
	}))
	defer apiServer.Close()

	probeServer := &server{
		cfg: config{
			apiBaseURL:       apiServer.URL,
			callbackPath:     "/oauth/callback/cloudflare",
			clientID:         "client-id",
			clientSecret:     "client-secret",
			eventsPath:       eventsPath,
			refreshStorePath: tokenStorePath,
			redirectURI:      "https://callback.example/oauth/callback/cloudflare",
			tokenURL:         tokenServer.URL,
			authorizationURL: "https://dash.cloudflare.com/oauth2/auth",
			scopes:           []string{"offline_access", "email-sending.write"},
		},
		client:   tokenServer.Client(),
		events:   &eventLogger{filePath: eventsPath},
		state:    "expected-state",
		sessions: make(map[string]probeSession),
	}

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "https://callback.example/oauth/callback/cloudflare?state=expected-state&code=auth-code", nil)
	probeServer.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body: %s", response.Code, http.StatusOK, response.Body.String())
	}
	if len(tokenGrantTypes) != 2 || tokenGrantTypes[0] != "authorization_code" || tokenGrantTypes[1] != "refresh_token" {
		t.Fatalf("token grant types = %#v", tokenGrantTypes)
	}
	if len(apiAuthorizationHeaders) != 1 {
		t.Fatalf("api request count after callback = %d, want account discovery only", len(apiAuthorizationHeaders))
	}
	if apiAuthorizationHeaders[0] != "Bearer refreshed-access-token" {
		t.Fatalf("account discovery authorization header = %q, want refreshed token", apiAuthorizationHeaders[0])
	}
	if !strings.Contains(response.Body.String(), "Choose Cloudflare account") || !strings.Contains(response.Body.String(), "Test Account") {
		t.Fatalf("callback did not render account selection: %s", response.Body.String())
	}

	var stored refreshTokenStoreDocument
	storedContent, err := os.ReadFile(tokenStorePath)
	if err != nil {
		t.Fatalf("read refresh token store: %v", err)
	}
	if err := json.Unmarshal(storedContent, &stored); err != nil {
		t.Fatalf("decode refresh token store: %v", err)
	}
	if stored.Schema != refreshTokenStoreSchema {
		t.Fatalf("stored schema = %q, want %q", stored.Schema, refreshTokenStoreSchema)
	}
	if stored.RefreshToken != "rotated-refresh-token" {
		t.Fatalf("stored refresh token = %q, want rotated token", stored.RefreshToken)
	}
	if stored.Source != "refresh_token" {
		t.Fatalf("stored source = %q, want refresh_token", stored.Source)
	}
	if stored.TokenAuthMethod != "client_secret_basic" {
		t.Fatalf("stored token auth method = %q", stored.TokenAuthMethod)
	}
	if stored.ClientIDHash != shortHash("client-id") {
		t.Fatalf("stored client id hash = %q", stored.ClientIDHash)
	}
	storedInfo, err := os.Stat(tokenStorePath)
	if err != nil {
		t.Fatalf("stat refresh token store: %v", err)
	}
	if storedInfo.Mode().Perm() != 0o600 {
		t.Fatalf("refresh token store permissions = %o, want 600", storedInfo.Mode().Perm())
	}

	var sessionID string
	for key := range probeServer.sessions {
		sessionID = key
	}
	if sessionID == "" {
		t.Fatal("callback did not store probe session")
	}

	selectionResponse := httptest.NewRecorder()
	form := url.Values{}
	form.Set("session_id", sessionID)
	form.Set("account_id", "account-id")
	selectionRequest := httptest.NewRequest(http.MethodPost, "https://callback.example/probe/cloudflare/account", strings.NewReader(form.Encode()))
	selectionRequest.Header.Set("content-type", "application/x-www-form-urlencoded")
	probeServer.ServeHTTP(selectionResponse, selectionRequest)

	if selectionResponse.Code != http.StatusOK {
		t.Fatalf("selection status = %d, want %d, body: %s", selectionResponse.Code, http.StatusOK, selectionResponse.Body.String())
	}
	if len(apiAuthorizationHeaders) != 3 {
		t.Fatalf("api request count after selection = %d, want account discovery plus 2 send probes", len(apiAuthorizationHeaders))
	}
	for _, header := range apiAuthorizationHeaders {
		if header != "Bearer refreshed-access-token" {
			t.Fatalf("api authorization header = %q, want refreshed token", header)
		}
	}

	content, err := os.ReadFile(eventsPath)
	if err != nil {
		t.Fatal(err)
	}
	text := string(content)
	for _, secret := range []string{
		"auth-code",
		"initial-access-token",
		"initial-refresh-token",
		"refreshed-access-token",
		"rotated-refresh-token",
	} {
		if strings.Contains(text, secret) {
			t.Fatalf("event log exposed %q: %s", secret, text)
		}
	}
	if !strings.Contains(selectionResponse.Body.String(), "refresh_token") || !strings.Contains(selectionResponse.Body.String(), "completed") {
		t.Fatalf("result page does not show completed refresh lifecycle: %s", selectionResponse.Body.String())
	}
}

func TestRefreshAccessTokenFromStoreRotatesAndPersists(t *testing.T) {
	t.Parallel()

	tokenServer := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Header.Get("authorization") != "" {
			t.Fatalf("refresh request included authorization header")
		}
		if err := request.ParseForm(); err != nil {
			t.Fatal(err)
		}
		if request.PostForm.Get("grant_type") != "refresh_token" {
			t.Fatalf("grant_type = %q", request.PostForm.Get("grant_type"))
		}
		if request.PostForm.Get("refresh_token") != "stored-refresh-token" {
			t.Fatalf("refresh token form value = %q", request.PostForm.Get("refresh_token"))
		}
		if request.PostForm.Get("client_id") != "client-id" {
			t.Fatalf("client_id form value = %q", request.PostForm.Get("client_id"))
		}
		response.Header().Set("content-type", "application/json")
		_ = json.NewEncoder(response).Encode(map[string]any{
			"access_token":  "refreshed-access-token",
			"expires_in":    3600,
			"refresh_token": "rotated-refresh-token",
			"scope":         "offline_access email-sending.write",
			"token_type":    "bearer",
		})
	}))
	defer tokenServer.Close()

	tokenStorePath := filepath.Join(t.TempDir(), "refresh-token.json")
	if err := writePrivateJSONFile(tokenStorePath, refreshTokenStoreDocument{
		Schema:       refreshTokenStoreSchema,
		RefreshToken: "stored-refresh-token",
		Source:       "test",
		StoredAt:     timeNowForTest(),
	}); err != nil {
		t.Fatal(err)
	}
	probeServer := &server{
		cfg: config{
			clientID:         "client-id",
			refreshStorePath: tokenStorePath,
			tokenAuthMethod:  "none",
			tokenURL:         tokenServer.URL,
		},
		client: tokenServer.Client(),
	}

	token, summary, err := probeServer.refreshAccessTokenFromStore(context.Background(), "offline_refresh_validation")
	if err != nil {
		t.Fatal(err)
	}
	if token.AccessToken != "refreshed-access-token" {
		t.Fatalf("access token = %q", token.AccessToken)
	}
	if !summary.RefreshTokenRotated || !summary.StoreRewritten {
		t.Fatalf("refresh summary did not record rotation and rewrite: %#v", summary)
	}

	var stored refreshTokenStoreDocument
	content, err := os.ReadFile(tokenStorePath)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(content, &stored); err != nil {
		t.Fatal(err)
	}
	if stored.RefreshToken != "rotated-refresh-token" {
		t.Fatalf("stored refresh token = %q", stored.RefreshToken)
	}
}

func TestBuildRawSendPayloadUsesActualCRLFAndParsesAsMail(t *testing.T) {
	t.Parallel()

	payload, err := buildRawSendPayload("welcome@example.com", "recipient@example.net", "20260627T102724Z", time.Date(2026, 6, 27, 10, 27, 24, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}

	var decoded struct {
		MIMEMessage string `json:"mime_message"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(decoded.MIMEMessage, `\r\n`) {
		t.Fatalf("raw MIME contains literal escaped CRLF: %q", decoded.MIMEMessage)
	}
	if !strings.Contains(decoded.MIMEMessage, "\r\n\r\n") {
		t.Fatalf("raw MIME missing CRLF header/body separator: %q", decoded.MIMEMessage)
	}
	message, err := mail.ReadMessage(strings.NewReader(decoded.MIMEMessage))
	if err != nil {
		t.Fatalf("raw MIME did not parse: %v", err)
	}
	if message.Header.Get("Subject") != "Cloudflare OAuth send_raw validation 20260627T102724Z" {
		t.Fatalf("subject = %q", message.Header.Get("Subject"))
	}
}

func TestRunEmailSendingValidationCommandSendsStructuredAndRawPayloads(t *testing.T) {
	t.Setenv("PROBE_REAL_EMAIL_SEND_CONFIRM", "send-real-email")
	t.Setenv("PROBE_EMAIL_FROM", "welcome@example.com")
	t.Setenv("PROBE_EMAIL_TO", "recipient@example.net")

	tokenServer := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Header.Get("authorization") != "" {
			t.Fatalf("refresh request included authorization header")
		}
		if err := request.ParseForm(); err != nil {
			t.Fatal(err)
		}
		if request.PostForm.Get("grant_type") != "refresh_token" {
			t.Fatalf("grant_type = %q", request.PostForm.Get("grant_type"))
		}
		if request.PostForm.Get("refresh_token") != "stored-refresh-token" {
			t.Fatalf("refresh token form value = %q", request.PostForm.Get("refresh_token"))
		}
		response.Header().Set("content-type", "application/json")
		_ = json.NewEncoder(response).Encode(map[string]any{
			"access_token":  "email-access-token",
			"expires_in":    3600,
			"refresh_token": "email-rotated-refresh-token",
			"scope":         "offline_access email-sending.write",
			"token_type":    "bearer",
		})
	}))
	defer tokenServer.Close()

	seenEndpoints := make(map[string]bool)
	apiServer := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Header.Get("authorization") != "Bearer email-access-token" {
			t.Fatalf("authorization header = %q", request.Header.Get("authorization"))
		}
		response.Header().Set("content-type", "application/json")
		if request.Method == http.MethodGet && request.URL.Path == "/accounts" {
			_ = json.NewEncoder(response).Encode(cloudflareListResponse[[]cloudflareAccountSummary]{
				Result:  []cloudflareAccountSummary{{ID: "account-id", Name: "Test Account", Type: "standard"}},
				Success: true,
			})
			return
		}

		body, err := io.ReadAll(request.Body)
		if err != nil {
			t.Fatal(err)
		}
		switch request.URL.Path {
		case "/accounts/account-id/email/sending/send":
			seenEndpoints["send"] = true
			var payload struct {
				To      string `json:"to"`
				From    string `json:"from"`
				Subject string `json:"subject"`
				HTML    string `json:"html"`
				Text    string `json:"text"`
			}
			if err := json.Unmarshal(body, &payload); err != nil {
				t.Fatal(err)
			}
			if payload.To != "recipient@example.net" || payload.From != "welcome@example.com" || payload.Subject == "" || payload.HTML == "" || payload.Text == "" {
				t.Fatalf("unexpected send payload: %#v", payload)
			}
		case "/accounts/account-id/email/sending/send_raw":
			seenEndpoints["send_raw"] = true
			var payload struct {
				From        string   `json:"from"`
				MIMEMessage string   `json:"mime_message"`
				Recipients  []string `json:"recipients"`
			}
			if err := json.Unmarshal(body, &payload); err != nil {
				t.Fatal(err)
			}
			if payload.From != "welcome@example.com" || len(payload.Recipients) != 1 || payload.Recipients[0] != "recipient@example.net" {
				t.Fatalf("unexpected send_raw envelope: %#v", payload)
			}
			if strings.Contains(payload.MIMEMessage, `\r\n`) {
				t.Fatalf("send_raw MIME contains literal escaped CRLF: %q", payload.MIMEMessage)
			}
			if _, err := mail.ReadMessage(strings.NewReader(payload.MIMEMessage)); err != nil {
				t.Fatalf("send_raw MIME did not parse: %v", err)
			}
		default:
			t.Fatalf("unexpected API request %s %s", request.Method, request.URL.Path)
		}
		_ = json.NewEncoder(response).Encode(map[string]any{
			"success": true,
			"result": map[string]any{
				"delivered":         []string{},
				"message_id":        "<message@example.test>",
				"permanent_bounces": []string{},
				"queued":            []string{},
			},
		})
	}))
	defer apiServer.Close()

	tokenStorePath := filepath.Join(t.TempDir(), "refresh-token.json")
	if err := writePrivateJSONFile(tokenStorePath, refreshTokenStoreDocument{
		Schema:       refreshTokenStoreSchema,
		RefreshToken: "stored-refresh-token",
		Source:       "test",
		StoredAt:     timeNowForTest(),
	}); err != nil {
		t.Fatal(err)
	}

	var output strings.Builder
	err := runEmailSendingValidationCommand(context.Background(), config{
		apiBaseURL:       apiServer.URL,
		clientID:         "client-id",
		eventsPath:       filepath.Join(t.TempDir(), "events.jsonl"),
		refreshStorePath: tokenStorePath,
		tokenAuthMethod:  "none",
		tokenURL:         tokenServer.URL,
	}, &output)
	if err != nil {
		t.Fatal(err)
	}
	if !seenEndpoints["send"] || !seenEndpoints["send_raw"] {
		t.Fatalf("did not call both send endpoints: %#v", seenEndpoints)
	}
	if strings.Contains(output.String(), "email-access-token") || strings.Contains(output.String(), "email-rotated-refresh-token") {
		t.Fatalf("command output exposed token: %s", output.String())
	}
	if !strings.Contains(output.String(), `"sender_domain": "example.com"`) || !strings.Contains(output.String(), `"recipient_domain": "example.net"`) {
		t.Fatalf("command output missing domain summary: %s", output.String())
	}

	var stored refreshTokenStoreDocument
	content, err := os.ReadFile(tokenStorePath)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(content, &stored); err != nil {
		t.Fatal(err)
	}
	if stored.RefreshToken != "email-rotated-refresh-token" {
		t.Fatalf("stored refresh token = %q", stored.RefreshToken)
	}
}

func TestRunEmailSendingValidationCommandRequiresExplicitConfirmation(t *testing.T) {
	t.Setenv("PROBE_EMAIL_FROM", "welcome@example.com")
	t.Setenv("PROBE_EMAIL_TO", "recipient@example.net")

	err := runEmailSendingValidationCommand(context.Background(), config{}, io.Discard)
	if err == nil || !strings.Contains(err.Error(), "PROBE_REAL_EMAIL_SEND_CONFIRM") {
		t.Fatalf("error = %v, want confirmation error", err)
	}
}

func newTestServer(t *testing.T) *server {
	t.Helper()
	return &server{
		cfg: config{
			callbackPath: "/oauth/callback/cloudflare",
			eventsPath:   filepath.Join(t.TempDir(), "events.jsonl"),
		},
		client:   http.DefaultClient,
		events:   &eventLogger{filePath: filepath.Join(t.TempDir(), "events.jsonl")},
		state:    "expected-state",
		sessions: make(map[string]probeSession),
	}
}

func requireRedactedSummary(t *testing.T, value any, expectedLength int) {
	t.Helper()

	summary, ok := value.(map[string]any)
	if !ok {
		t.Fatalf("redacted value is %T, want map[string]any: %#v", value, value)
	}
	if summary["redacted"] != true {
		t.Fatalf("redacted value did not include redacted=true: %#v", summary)
	}
	if summary["sanitized"] != true {
		t.Fatalf("redacted value did not include sanitized=true: %#v", summary)
	}
	if summary["value_length"] != expectedLength {
		t.Fatalf("redacted value length = %#v, want %d: %#v", summary["value_length"], expectedLength, summary)
	}
}

func timeNowForTest() string {
	return time.Date(2026, 6, 27, 10, 0, 0, 0, time.UTC).Format(time.RFC3339Nano)
}
