package atemail

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type agentAuthClient struct {
	baseURL   string
	client    *http.Client
	endpoints map[string]string
}

func newAgentAuthClient(baseURL string) agentAuthClient {
	return agentAuthClient{
		baseURL: strings.TrimRight(baseURL, "/"),
		client:  &http.Client{Timeout: 30 * time.Second},
	}
}

func (c agentAuthClient) withConfiguration(configuration map[string]any) agentAuthClient {
	c.endpoints = agentConfigurationEndpoints(configuration)
	return c
}

func (c agentAuthClient) discoverConfiguration(ctx context.Context) (map[string]any, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/.well-known/agent-configuration", nil)
	if err != nil {
		return nil, newServiceTransportError("AgentTeam Email", "preparing Agent Auth discovery request")
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("User-Agent", authUserAgent())
	response, err := c.client.Do(request)
	if err != nil {
		return nil, newServiceTransportError("AgentTeam Email", "sending Agent Auth discovery request")
	}
	defer response.Body.Close()
	raw, readErr := io.ReadAll(response.Body)
	if readErr != nil {
		return nil, newServiceTransportError("AgentTeam Email", "reading Agent Auth discovery response")
	}
	if response.StatusCode >= 400 {
		code, message, interval := readAuthServiceError(raw, response.StatusCode)
		return nil, authServiceError{code: code, message: message, interval: interval}
	}
	payload, err := decodeJSONObject(raw)
	if err != nil {
		return nil, newProtocolError("AgentTeam Email Agent Auth discovery returned malformed service response: " + err.Error())
	}
	return payload, nil
}

func agentConfigurationEndpoints(configuration map[string]any) map[string]string {
	rawEndpoints := objectValue(configuration["endpoints"])
	if len(rawEndpoints) == 0 {
		return nil
	}
	endpoints := make(map[string]string, len(rawEndpoints))
	for key, value := range rawEndpoints {
		if endpoint := strings.TrimSpace(stringValue(value)); endpoint != "" {
			endpoints[key] = endpoint
		}
	}
	return endpoints
}

func (c agentAuthClient) agentEndpointURL(name string, fallbackPath string) (string, error) {
	endpoint := ""
	if c.endpoints != nil {
		endpoint = strings.TrimSpace(c.endpoints[name])
		if endpoint == "" && name == "host_enroll" {
			endpoint = strings.TrimSpace(c.endpoints["enroll_host"])
		}
	}
	if endpoint == "" {
		return agentAuthRequestURL(c.baseURL, fallbackPath), nil
	}
	return resolveAgentEndpointURL(c.baseURL, name, endpoint)
}

func resolveAgentEndpointURL(baseURL string, name string, endpoint string) (string, error) {
	base, err := url.Parse(strings.TrimRight(baseURL, "/"))
	if err != nil || base.Scheme == "" || base.Host == "" {
		return "", newConfigError("local at-email Agent Auth API base URL is invalid")
	}
	parsed, err := url.Parse(endpoint)
	if err != nil {
		return "", newProtocolError("AgentTeam Email Agent Auth discovery endpoint " + name + " is invalid")
	}
	if !parsed.IsAbs() {
		parsed = base.ResolveReference(parsed)
	}
	if parsed.Scheme != base.Scheme || parsed.Host != base.Host {
		return "", newProtocolError("AgentTeam Email Agent Auth discovery endpoint " + name + " must use the same origin as the API base URL")
	}
	if parsed.Path == "" {
		return "", newProtocolError("AgentTeam Email Agent Auth discovery endpoint " + name + " is missing a path")
	}
	parsed.Fragment = ""
	return parsed.String(), nil
}

func appendAgentEndpointQuery(requestURL string, key string, value string) string {
	parsed, err := url.Parse(requestURL)
	if err != nil {
		return requestURL
	}
	query := parsed.Query()
	query.Set(key, value)
	parsed.RawQuery = query.Encode()
	return parsed.String()
}

func (c agentAuthClient) enrollHost(ctx context.Context, token string, publicKey map[string]any, name string) (map[string]any, error) {
	body := map[string]any{
		"public_key": publicKey,
		"token":      token,
	}
	if name != "" {
		body["name"] = name
	}
	requestURL, err := c.agentEndpointURL("host_enroll", "/host/enroll")
	if err != nil {
		return nil, err
	}
	return c.requestJSON(ctx, http.MethodPost, requestURL, "", body)
}

func (c agentAuthClient) startTrial(ctx context.Context, hostPublicKey map[string]any, agentPublicKey map[string]any, name string, capabilities []string, postClaimCapabilities []string, admissionToken string) (map[string]any, error) {
	body := map[string]any{
		"agent_public_key": agentPublicKey,
		"host_public_key":  hostPublicKey,
	}
	if name != "" {
		body["name"] = name
	}
	if len(capabilities) > 0 {
		body["capabilities"] = capabilities
	}
	if len(postClaimCapabilities) > 0 {
		body["post_claim_capabilities"] = postClaimCapabilities
	}
	if strings.TrimSpace(admissionToken) != "" {
		body["admission_token"] = strings.TrimSpace(admissionToken)
	}
	return c.requestAppJSON(ctx, http.MethodPost, "/rpc/agent-access/trials", body)
}

type agentRegistrationOptions struct {
	BindingMessage  string
	Capabilities    []any
	ForceApproval   bool
	Mode            string
	PreferredMethod string
	Reason          string
}

func (c agentAuthClient) registerAgent(ctx context.Context, credential agentCredential, publicKey map[string]any, name string, options agentRegistrationOptions) (map[string]any, error) {
	if err := requireAgentKeyLabel(credential.HostPrivateKey, "host"); err != nil {
		return nil, err
	}
	requestURL, err := c.agentEndpointURL("register", "/agent/register")
	if err != nil {
		return nil, err
	}
	hostIssuer := credential.HostID
	if hostIssuer == "" {
		hostIssuer = credential.HostPrivateKey.Kid
	}
	claims, err := newAgentAuthClaims(
		hostIssuer,
		"",
		agentAuthAudience(c.baseURL),
		http.MethodPost,
		requestURL,
	)
	if err != nil {
		return nil, err
	}
	claims["agent_public_key"] = publicKey
	if credential.Name != "" {
		claims["host_name"] = credential.Name
	}
	if credential.HostID == "" {
		claims["host_public_key"] = credential.HostPrivateKey.publicJWK()
	}
	token, err := signAgentAuthJWT(credential.HostPrivateKey, "host+jwt", claims)
	if err != nil {
		return nil, err
	}
	body := map[string]any{
		"capabilities": []any{},
		"mode":         stringValueOrDefault(options.Mode, "delegated"),
		"name":         name,
	}
	if options.Capabilities != nil {
		body["capabilities"] = options.Capabilities
	}
	if options.Reason != "" {
		body["reason"] = options.Reason
	}
	if options.PreferredMethod != "" {
		body["preferred_method"] = options.PreferredMethod
	}
	if options.BindingMessage != "" {
		body["binding_message"] = options.BindingMessage
	}
	if options.ForceApproval {
		body["force_approval"] = true
	}
	return c.requestJSON(ctx, http.MethodPost, requestURL, token, body)
}

func (c agentAuthClient) agentStatus(ctx context.Context, credential agentCredential) (map[string]any, error) {
	requestURL, err := c.agentEndpointURL("status", "/agent/status")
	if err != nil {
		return nil, err
	}
	token, err := c.signAgentJWTForRequestURL(credential, http.MethodGet, requestURL)
	if err != nil {
		return nil, err
	}
	return c.requestJSON(ctx, http.MethodGet, requestURL, token, nil)
}

func (c agentAuthClient) hostAgentStatus(ctx context.Context, credential agentCredential, agentID string) (map[string]any, error) {
	requestURL, err := c.agentEndpointURL("status", "/agent/status")
	if err != nil {
		return nil, err
	}
	requestURL = appendAgentEndpointQuery(requestURL, "agent_id", agentID)
	token, err := c.signHostJWTForRequestURL(credential, http.MethodGet, requestURL)
	if err != nil {
		return nil, err
	}
	return c.requestJSON(ctx, http.MethodGet, requestURL, token, nil)
}

func (c agentAuthClient) revokeAgent(ctx context.Context, credential agentCredential) (map[string]any, error) {
	requestURL, err := c.agentEndpointURL("revoke", "/agent/revoke")
	if err != nil {
		return nil, err
	}
	token, err := c.signAgentJWTForRequestURL(credential, http.MethodPost, requestURL)
	if err != nil {
		return nil, err
	}
	return c.requestJSON(ctx, http.MethodPost, requestURL, token, map[string]any{
		"agent_id": credential.AgentID,
	})
}

func (c agentAuthClient) signHostJWTForRequestURL(credential agentCredential, method string, requestURL string) (string, error) {
	if err := requireAgentKeyLabel(credential.HostPrivateKey, "host"); err != nil {
		return "", err
	}
	claims, err := newAgentAuthClaims(
		credential.HostID,
		"",
		agentAuthAudience(c.baseURL),
		method,
		requestURL,
	)
	if err != nil {
		return "", err
	}
	return signAgentAuthJWT(credential.HostPrivateKey, "host+jwt", claims)
}

func (c agentAuthClient) signAgentJWTForRequestURL(credential agentCredential, method string, requestURL string) (string, error) {
	if err := requireAgentKeyLabel(credential.AgentPrivateKey, "agent"); err != nil {
		return "", err
	}
	claims, err := newAgentAuthClaims(
		credential.HostID,
		credential.AgentID,
		agentAuthAudience(c.baseURL),
		method,
		requestURL,
	)
	if err != nil {
		return "", err
	}
	return signAgentAuthJWT(credential.AgentPrivateKey, "agent+jwt", claims)
}

func (c agentAuthClient) requestJSON(ctx context.Context, method string, requestURL string, bearerToken string, body map[string]any) (map[string]any, error) {
	var reader io.Reader
	if body != nil {
		data, err := encodeJSONBody(body)
		if err != nil {
			return nil, err
		}
		reader = bytes.NewReader(data)
	}

	request, err := http.NewRequestWithContext(ctx, method, requestURL, reader)
	if err != nil {
		return nil, newServiceTransportError("AgentTeam Email", "preparing "+method+" request")
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("User-Agent", authUserAgent())
	if bearerToken != "" {
		request.Header.Set("Authorization", "Bearer "+bearerToken)
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
		return nil, newProtocolError(fmt.Sprintf("AgentTeam Email %s %s returned malformed service response: %s", method, requestURL, err.Error()))
	}
	return payload, nil
}

func (c agentAuthClient) requestAppJSON(ctx context.Context, method string, path string, body map[string]any) (map[string]any, error) {
	var reader io.Reader
	if body != nil {
		data, err := encodeJSONBody(body)
		if err != nil {
			return nil, err
		}
		reader = bytes.NewReader(data)
	}

	request, err := http.NewRequestWithContext(ctx, method, strings.TrimRight(c.baseURL, "/")+path, reader)
	if err != nil {
		return nil, newServiceTransportError("AgentTeam Email", "preparing "+method+" request")
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("User-Agent", authUserAgent())
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

func agentCapabilitiesFromStatus(payload map[string]any) []string {
	grants := objectSlice(payload["agent_capability_grants"])
	seen := map[string]struct{}{}
	capabilities := make([]string, 0, len(grants))
	for _, grant := range grants {
		capability := stringValue(grant["capability"])
		if capability == "" {
			continue
		}
		if _, ok := seen[capability]; ok {
			continue
		}
		seen[capability] = struct{}{}
		capabilities = append(capabilities, capability)
	}
	return capabilities
}

func safeAgentStatusPayload(payload map[string]any) map[string]any {
	return map[string]any{
		"agent_id":                stringValue(payload["agent_id"]),
		"agent_capability_grants": safeAgentStatusGrants(payload["agent_capability_grants"]),
		"created_at":              stringValue(payload["created_at"]),
		"expires_at":              stringValue(payload["expires_at"]),
		"host_id":                 stringValue(payload["host_id"]),
		"last_used_at":            stringValue(payload["last_used_at"]),
		"mode":                    stringValue(payload["mode"]),
		"name":                    stringValue(payload["name"]),
		"status":                  stringValue(payload["status"]),
	}
}

func safeAgentStatusGrants(value any) []map[string]any {
	grants := objectSlice(value)
	if grants == nil {
		return []map[string]any{}
	}
	result := make([]map[string]any, 0, len(grants))
	for _, grant := range grants {
		safeGrant := map[string]any{}
		copyStringField(safeGrant, grant, "capability")
		copyStringField(safeGrant, grant, "created_at")
		copyStringField(safeGrant, grant, "expires_at")
		copyStringField(safeGrant, grant, "reason")
		copyStringField(safeGrant, grant, "status")
		if constraints := safeAgentGrantConstraints(grant["constraints"]); len(constraints) > 0 {
			safeGrant["constraints"] = constraints
		}
		result = append(result, safeGrant)
	}
	return result
}

func safeAgentGrantConstraints(value any) map[string]any {
	constraints := objectValue(value)
	if len(constraints) == 0 {
		return nil
	}
	result := map[string]any{}
	for _, key := range []string{
		"allowedRecipientDomains",
		"allowedRecipientPatterns",
		"allowedRecipients",
		"mailboxAddress",
		"organizationId",
	} {
		switch key {
		case "allowedRecipientDomains", "allowedRecipientPatterns", "allowedRecipients":
			if values := safeStringList(constraints[key]); len(values) > 0 {
				result[key] = values
			}
		default:
			copyStringField(result, constraints, key)
		}
	}
	return result
}

func copyStringField(target map[string]any, source map[string]any, key string) {
	if value := stringValue(source[key]); value != "" {
		target[key] = value
	}
}

func safeStringList(value any) []string {
	items, ok := value.([]any)
	if !ok {
		return nil
	}
	result := make([]string, 0, len(items))
	for _, item := range items {
		if value := stringValue(item); value != "" {
			result = append(result, value)
		}
	}
	return result
}
