package atemail

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const (
	defaultAppBaseURL      = "https://app.agentteam.email"
	deviceClientID         = "at-email-cli"
	deviceScope            = "openid profile email"
	deviceGrantType        = "urn:ietf:params:oauth:grant-type:device_code"
	authConfigDirName      = "at-email"
	authConfigFileName     = "auth.json"
	authUserAgentPrefix    = "at-email/"
	defaultPollingInterval = 5 * time.Second
)

var (
	openBrowser       = defaultOpenBrowser
	authUserConfigDir = os.UserConfigDir
	authSleep         = sleepContext
)

type authCredential struct {
	APIBaseURL  string `json:"api_base_url"`
	AccessToken string `json:"access_token"`
	ClientID    string `json:"client_id"`
	ExpiresAt   string `json:"expires_at,omitempty"`
	Scope       string `json:"scope,omitempty"`
	TokenType   string `json:"token_type"`
}

type deviceCodeResponse struct {
	DeviceCode              string
	UserCode                string
	VerificationURI         string
	VerificationURIComplete string
	ExpiresIn               int
	Interval                int
}

type deviceTokenResponse struct {
	AccessToken string
	ExpiresIn   int
	Scope       string
	TokenType   string
}

type appAuthResolution struct {
	APIBaseURL  string
	AuthBaseURL string
}

type appDiscoveryMetadata struct {
	APIBaseURL    string `json:"apiBase"`
	AuthBaseURL   string `json:"authBase"`
	MinCLIVersion string `json:"minCliVersion,omitempty"`
}

type authServiceError struct {
	code     string
	message  string
	interval int
}

func (e authServiceError) Error() string {
	if e.message != "" {
		return e.message
	}
	return e.code
}

func handleAuth(ctx context.Context, args parsedArgs, env []string, stdout io.Writer, stderr io.Writer) error {
	switch args.AuthAction {
	case "login":
		return handleAuthLogin(ctx, args, env, stdout, stderr)
	case "status":
		return handleAuthStatus(ctx, args, stdout)
	case "logout":
		return handleAuthLogout(ctx, args, stdout)
	default:
		return newCommandUsageError(commandAuth, "the following arguments are required: auth_command")
	}
}

func handleAuthLogin(ctx context.Context, args parsedArgs, env []string, stdout io.Writer, stderr io.Writer) error {
	resolution, err := resolveAppAuthResolution(ctx, env, args.APIBaseURL)
	if err != nil {
		return err
	}
	client := newAppAuthClient(resolution.APIBaseURL)
	progress := stdout
	if args.JSON {
		progress = stderr
	}

	if !args.JSON {
		fmt.Fprintf(progress, "Starting at-email login with %s...\n\n", resolution.APIBaseURL)
	}
	code, err := client.requestDeviceCode(ctx)
	if err != nil {
		return err
	}
	if code.DeviceCode == "" || code.UserCode == "" || code.VerificationURIComplete == "" {
		return newProtocolError("AgentTeam Email device login returned an incomplete device code response")
	}

	if !args.JSON {
		verificationURL := code.VerificationURIComplete
		if resolution.AuthBaseURL != "" {
			verificationURL = rewriteVerificationURL(code.VerificationURIComplete, resolution.AuthBaseURL)
		}
		fmt.Fprintf(progress, "Open: %s\n\n", verificationURL)
		fmt.Fprintf(progress, "Code: %s\n\n", formatAuthUserCode(code.UserCode))
		if args.Open {
			_ = openBrowser(verificationURL)
		}
		fmt.Fprintln(progress, "Waiting for approval...")
	}

	token, err := client.pollDeviceToken(ctx, code, progress, args.JSON)
	if err != nil {
		return err
	}
	if token.AccessToken == "" {
		return newProtocolError("AgentTeam Email device login returned an empty access token")
	}
	credential := authCredential{
		APIBaseURL:  resolution.APIBaseURL,
		AccessToken: token.AccessToken,
		ClientID:    deviceClientID,
		ExpiresAt:   time.Now().Add(time.Duration(token.ExpiresIn) * time.Second).UTC().Format(time.RFC3339),
		Scope:       token.Scope,
		TokenType:   token.TokenType,
	}
	if credential.TokenType == "" {
		credential.TokenType = "Bearer"
	}

	session, err := client.getSession(ctx, credential.AccessToken)
	if err != nil {
		return err
	}
	if err := saveAuthCredential(credential); err != nil {
		return err
	}

	if args.JSON {
		return printJSON(stdout, map[string]any{
			"authenticated": true,
			"api_base_url":  resolution.APIBaseURL,
			"session":       safeAuthSession(session),
			"user":          safeAuthUser(session),
		})
	}

	fmt.Fprintln(stdout, "Logged in.")
	renderAuthSession(stdout, resolution.APIBaseURL, session)
	return nil
}

func handleAuthStatus(ctx context.Context, args parsedArgs, stdout io.Writer) error {
	credential, found, err := loadAuthCredential()
	if err != nil {
		return err
	}
	if !found {
		if args.JSON {
			return printJSON(stdout, map[string]any{"authenticated": false})
		}
		fmt.Fprintln(stdout, "Not logged in.")
		fmt.Fprintln(stdout, "hint: run `at-email auth login`")
		return nil
	}

	client := newAppAuthClient(credential.APIBaseURL)
	session, err := client.getSession(ctx, credential.AccessToken)
	if err != nil {
		return err
	}
	authenticated := len(session) > 0
	if args.JSON {
		return printJSON(stdout, map[string]any{
			"authenticated": authenticated,
			"api_base_url":  credential.APIBaseURL,
			"session":       safeAuthSession(session),
			"user":          safeAuthUser(session),
		})
	}
	if !authenticated {
		fmt.Fprintln(stdout, "Not logged in.")
		fmt.Fprintln(stdout, "hint: run `at-email auth login`")
		return nil
	}
	fmt.Fprintln(stdout, "Logged in.")
	renderAuthSession(stdout, credential.APIBaseURL, session)
	return nil
}

func handleAuthLogout(ctx context.Context, args parsedArgs, stdout io.Writer) error {
	credential, found, err := loadAuthCredential()
	if err != nil {
		return err
	}
	if !found {
		if args.JSON {
			return printJSON(stdout, map[string]any{
				"remote_revoked": false,
				"status":         "already_logged_out",
			})
		}
		fmt.Fprintln(stdout, "Already logged out.")
		return nil
	}

	client := newAppAuthClient(credential.APIBaseURL)
	remoteRevoked := true
	remoteErr := ""
	if err := client.revokeSession(ctx, credential.AccessToken); err != nil {
		remoteRevoked = false
		remoteErr = err.Error()
	}
	if err := deleteAuthCredential(); err != nil {
		return err
	}

	if args.JSON {
		payload := map[string]any{
			"remote_revoked": remoteRevoked,
			"status":         "logged_out",
		}
		if remoteErr != "" {
			payload["remote_revoke_error"] = remoteErr
		}
		return printJSON(stdout, payload)
	}

	fmt.Fprintln(stdout, "Logged out.")
	if remoteErr != "" {
		fmt.Fprintf(stdout, "warning: remote session revoke failed: %s\n", remoteErr)
	}
	return nil
}

type appAuthClient struct {
	baseURL string
	client  *http.Client
}

func newAppAuthClient(baseURL string) appAuthClient {
	return appAuthClient{
		baseURL: strings.TrimRight(baseURL, "/"),
		client:  &http.Client{Timeout: 30 * time.Second},
	}
}

func (c appAuthClient) requestDeviceCode(ctx context.Context) (deviceCodeResponse, error) {
	payload, err := c.requestJSON(ctx, http.MethodPost, "/device/code", "", map[string]any{
		"client_id": deviceClientID,
		"scope":     deviceScope,
	})
	if err != nil {
		return deviceCodeResponse{}, err
	}
	return deviceCodeResponse{
		DeviceCode:              stringValue(payload["device_code"]),
		UserCode:                stringValue(payload["user_code"]),
		VerificationURI:         stringValue(payload["verification_uri"]),
		VerificationURIComplete: stringValue(payload["verification_uri_complete"]),
		ExpiresIn:               intValueOrDefault(payload["expires_in"], 1800),
		Interval:                intValueOrDefault(payload["interval"], 5),
	}, nil
}

func (c appAuthClient) pollDeviceToken(ctx context.Context, code deviceCodeResponse, progress io.Writer, jsonMode bool) (deviceTokenResponse, error) {
	interval := time.Duration(code.Interval) * time.Second
	if interval <= 0 {
		interval = defaultPollingInterval
	}
	expiresAt := time.Now().Add(time.Duration(code.ExpiresIn) * time.Second)
	lastHeartbeat := time.Now()

	for {
		if time.Now().After(expiresAt) {
			return deviceTokenResponse{}, newAgentMailError("device login expired; run `at-email auth login` again")
		}
		if err := authSleep(ctx, interval); err != nil {
			return deviceTokenResponse{}, err
		}
		token, err := c.requestDeviceToken(ctx, code.DeviceCode)
		if err == nil {
			return token, nil
		}
		var serviceErr authServiceError
		if !errors.As(err, &serviceErr) {
			return deviceTokenResponse{}, err
		}
		switch serviceErr.code {
		case "authorization_pending":
		case "slow_down":
			if serviceErr.interval > 0 {
				interval = time.Duration(serviceErr.interval) * time.Second
			} else {
				interval += 5 * time.Second
			}
		case "access_denied":
			return deviceTokenResponse{}, newAgentMailError("device login was denied")
		case "expired_token":
			return deviceTokenResponse{}, newAgentMailError("device login expired; run `at-email auth login` again")
		default:
			return deviceTokenResponse{}, err
		}

		if time.Now().After(expiresAt) {
			return deviceTokenResponse{}, newAgentMailError("device login expired; run `at-email auth login` again")
		}
		if !jsonMode && time.Since(lastHeartbeat) >= 10*time.Second {
			fmt.Fprintln(progress, "Still waiting for approval...")
			lastHeartbeat = time.Now()
		}
	}
}

func (c appAuthClient) requestDeviceToken(ctx context.Context, deviceCode string) (deviceTokenResponse, error) {
	payload, err := c.requestJSON(ctx, http.MethodPost, "/device/token", "", map[string]any{
		"client_id":   deviceClientID,
		"device_code": deviceCode,
		"grant_type":  deviceGrantType,
	})
	if err != nil {
		return deviceTokenResponse{}, err
	}
	return deviceTokenResponse{
		AccessToken: stringValue(payload["access_token"]),
		ExpiresIn:   intValueOrDefault(payload["expires_in"], 0),
		Scope:       stringValue(payload["scope"]),
		TokenType:   stringValue(payload["token_type"]),
	}, nil
}

func (c appAuthClient) getSession(ctx context.Context, accessToken string) (map[string]any, error) {
	return c.requestJSON(ctx, http.MethodGet, "/get-session", accessToken, nil)
}

func (c appAuthClient) revokeSession(ctx context.Context, accessToken string) error {
	_, err := c.requestJSON(ctx, http.MethodPost, "/revoke-session", accessToken, map[string]any{
		"token": accessToken,
	})
	return err
}

func (c appAuthClient) requestJSON(ctx context.Context, method string, path string, accessToken string, body map[string]any) (map[string]any, error) {
	var reader io.Reader
	if body != nil {
		data, err := encodeJSONBody(body)
		if err != nil {
			return nil, err
		}
		reader = bytes.NewReader(data)
	}

	request, err := http.NewRequestWithContext(ctx, method, c.baseURL+"/rpc/auth/api"+path, reader)
	if err != nil {
		return nil, newServiceTransportError("AgentTeam Email", "preparing "+method+" request")
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("User-Agent", authUserAgent())
	if accessToken != "" {
		request.Header.Set("Authorization", "Bearer "+accessToken)
	}
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}

	response, err := c.client.Do(request)
	if err != nil {
		return nil, newServiceTransportError("AgentTeam Email", "sending "+method+" request")
	}
	defer response.Body.Close()
	raw, readErr := io.ReadAll(response.Body)
	if readErr != nil {
		return nil, newServiceTransportError("AgentTeam Email", "reading "+method+" response")
	}
	if response.StatusCode >= 400 {
		code, message, interval := readAuthServiceError(raw, response.StatusCode)
		return nil, authServiceError{code: code, message: message, interval: interval}
	}
	if len(raw) == 0 || strings.TrimSpace(string(raw)) == "null" {
		return map[string]any{}, nil
	}
	payload, err := decodeJSONObject(raw)
	if err != nil {
		return nil, newProtocolError(fmt.Sprintf("AgentTeam Email %s %s returned malformed service response: %s", method, path, err.Error()))
	}
	return payload, nil
}

func resolveAppAuthResolution(ctx context.Context, env []string, override string) (appAuthResolution, error) {
	baseURL, err := resolveAppBaseURL(env, override)
	if err != nil {
		return appAuthResolution{}, err
	}
	resolution := appAuthResolution{APIBaseURL: baseURL}
	if discovered, ok := discoverAppMetadata(ctx, baseURL); ok {
		if discovered.APIBaseURL != "" {
			resolution.APIBaseURL = discovered.APIBaseURL
		}
		if discovered.AuthBaseURL != "" {
			resolution.AuthBaseURL = discovered.AuthBaseURL
		}
	}
	return resolution, nil
}

func resolveAppBaseURL(env []string, override string) (string, error) {
	value := strings.TrimSpace(override)
	if value == "" {
		value = lookupEnv(envMap(env), "AT_EMAIL_API_BASE_URL")
	}
	if value == "" {
		value = defaultAppBaseURL
	}
	return normalizeAppBaseURL(value)
}

func normalizeAppBaseURL(value string) (string, error) {
	parsed, err := url.Parse(value)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", newConfigError("AT_EMAIL_API_BASE_URL must be an absolute http or https URL")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", newConfigError("AT_EMAIL_API_BASE_URL must use http or https")
	}
	parsed.Path = strings.TrimRight(parsed.Path, "/")
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return parsed.String(), nil
}

func discoverAppMetadata(ctx context.Context, baseURL string) (appAuthResolution, bool) {
	discoveryBase, err := url.Parse(baseURL)
	if err != nil {
		return appAuthResolution{}, false
	}
	discoveryURL := discoveryBase.ResolveReference(&url.URL{Path: "/.well-known/at-email.json"})
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, discoveryURL.String(), nil)
	if err != nil {
		return appAuthResolution{}, false
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("User-Agent", authUserAgent())

	response, err := (&http.Client{Timeout: 30 * time.Second}).Do(request)
	if err != nil {
		return appAuthResolution{}, false
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return appAuthResolution{}, false
	}

	var metadata appDiscoveryMetadata
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&metadata); err != nil {
		return appAuthResolution{}, false
	}
	resolution := appAuthResolution{}
	if strings.TrimSpace(metadata.APIBaseURL) != "" {
		apiBaseURL, err := normalizeAppBaseURL(metadata.APIBaseURL)
		if err != nil {
			return appAuthResolution{}, false
		}
		resolution.APIBaseURL = apiBaseURL
	}
	if strings.TrimSpace(metadata.AuthBaseURL) != "" {
		authBaseURL, err := normalizeAppBaseURL(metadata.AuthBaseURL)
		if err != nil {
			return appAuthResolution{}, false
		}
		resolution.AuthBaseURL = authBaseURL
	}
	return resolution, true
}

func rewriteVerificationURL(value string, authBaseURL string) string {
	target, err := url.Parse(value)
	if err != nil || target.Scheme == "" || target.Host == "" {
		return value
	}
	authBase, err := url.Parse(authBaseURL)
	if err != nil || authBase.Scheme == "" || authBase.Host == "" {
		return value
	}
	authBase.Path = target.Path
	authBase.RawQuery = target.RawQuery
	authBase.Fragment = target.Fragment
	return authBase.String()
}

func authCredentialPath() (string, error) {
	base, err := authUserConfigDir()
	if err != nil {
		return "", newConfigError("could not resolve user config directory for at-email auth")
	}
	return filepath.Join(base, authConfigDirName, authConfigFileName), nil
}

func loadAuthCredential() (authCredential, bool, error) {
	path, err := authCredentialPath()
	if err != nil {
		return authCredential{}, false, err
	}
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return authCredential{}, false, nil
	}
	if err != nil {
		return authCredential{}, false, newAgentMailError("could not read local at-email auth credential")
	}
	var credential authCredential
	if err := json.Unmarshal(raw, &credential); err != nil {
		return authCredential{}, false, newAgentMailError("local at-email auth credential is invalid; run `at-email auth login` again")
	}
	if credential.APIBaseURL == "" || credential.AccessToken == "" {
		return authCredential{}, false, newAgentMailError("local at-email auth credential is incomplete; run `at-email auth login` again")
	}
	return credential, true, nil
}

func saveAuthCredential(credential authCredential) error {
	path, err := authCredentialPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return newAgentMailError("could not create local at-email auth directory")
	}
	data, err := json.MarshalIndent(credential, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return newAgentMailError("could not write local at-email auth credential")
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return newAgentMailError("could not save local at-email auth credential")
	}
	return nil
}

func deleteAuthCredential() error {
	path, err := authCredentialPath()
	if err != nil {
		return err
	}
	err = os.Remove(path)
	if err == nil || errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return newAgentMailError("could not remove local at-email auth credential")
}

func readAuthServiceError(raw []byte, status int) (string, string, int) {
	code := fmt.Sprintf("http_%d", status)
	message := http.StatusText(status)
	interval := 0
	var envelope map[string]any
	if err := json.Unmarshal(raw, &envelope); err == nil {
		if value := stringValue(envelope["error"]); value != "" {
			code = value
		}
		for _, key := range []string{"error_description", "message", "error"} {
			if value := stringValue(envelope[key]); value != "" {
				message = value
				break
			}
		}
		interval = intValueOrDefault(envelope["interval"], 0)
	}
	return code, "AgentTeam Email auth failed: " + message, interval
}

func safeAuthSession(envelope map[string]any) map[string]any {
	session := objectValue(envelope["session"])
	if len(session) == 0 {
		return nil
	}
	result := map[string]any{}
	for _, key := range []string{"id", "activeOrganizationId", "createdAt", "updatedAt", "expiresAt", "userAgent"} {
		if value, ok := session[key]; ok {
			result[key] = value
		}
	}
	return result
}

func safeAuthUser(envelope map[string]any) map[string]any {
	user := objectValue(envelope["user"])
	if len(user) == 0 {
		return nil
	}
	result := map[string]any{}
	for _, key := range []string{"id", "email", "emailVerified", "name", "image", "role"} {
		if value, ok := user[key]; ok {
			result[key] = value
		}
	}
	return result
}

func renderAuthSession(stdout io.Writer, baseURL string, envelope map[string]any) {
	user := safeAuthUser(envelope)
	session := safeAuthSession(envelope)
	fmt.Fprintf(stdout, "API: %s\n", baseURL)
	if email := stringValue(user["email"]); email != "" {
		fmt.Fprintf(stdout, "Account: %s\n", email)
	} else if name := stringValue(user["name"]); name != "" {
		fmt.Fprintf(stdout, "Account: %s\n", name)
	}
	if id := stringValue(session["id"]); id != "" {
		fmt.Fprintf(stdout, "Session: %s\n", id)
	}
	if expires := stringValue(session["expiresAt"]); expires != "" {
		fmt.Fprintf(stdout, "Expires: %s\n", expires)
	}
}

func authUserAgent() string {
	version := strings.TrimSpace(Version)
	if version == "" {
		version = "dev"
	}
	return fmt.Sprintf("%s%s (%s; %s)", authUserAgentPrefix, version, runtime.GOOS, runtime.GOARCH)
}

func formatAuthUserCode(value string) string {
	cleaned := strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(value), "-", ""))
	if len(cleaned) <= 4 {
		return cleaned
	}
	return cleaned[:4] + "-" + cleaned[4:]
}

func intValueOrDefault(value any, fallback int) int {
	if parsed, ok := parseJSONNumberInt(value); ok {
		return parsed
	}
	return fallback
}

func sleepContext(ctx context.Context, duration time.Duration) error {
	if duration <= 0 {
		return nil
	}
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func defaultOpenBrowser(target string) error {
	var command string
	var args []string
	switch runtime.GOOS {
	case "darwin":
		command = "open"
		args = []string{target}
	case "windows":
		command = "rundll32"
		args = []string{"url.dll,FileProtocolHandler", target}
	default:
		command = "xdg-open"
		args = []string{target}
	}
	return exec.Command(command, args...).Start()
}
