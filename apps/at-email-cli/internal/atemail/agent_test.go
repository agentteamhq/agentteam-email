package atemail

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestSaveCredentialFilesUsePrivateModes(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	hostKey, err := newAgentEd25519JWK()
	if err != nil {
		t.Fatalf("host key generation failed: %v", err)
	}
	agentKey, err := newAgentEd25519JWK()
	if err != nil {
		t.Fatalf("agent key generation failed: %v", err)
	}

	if err := saveAuthCredential(authCredential{
		AccessToken: "auth-token-secret",
		APIBaseURL:  "https://mail.example.com",
		ClientID:    deviceClientID,
		TokenType:   "Bearer",
	}); err != nil {
		t.Fatalf("save auth credential failed: %v", err)
	}
	authPath, err := authCredentialPath()
	if err != nil {
		t.Fatalf("auth credential path failed: %v", err)
	}
	assertCredentialPathModes(t, authPath)
	loosenCredentialPathModes(t, authPath)
	if err := saveAuthCredential(authCredential{
		AccessToken: "auth-token-secret-2",
		APIBaseURL:  "https://mail.example.com",
		ClientID:    deviceClientID,
		TokenType:   "Bearer",
	}); err != nil {
		t.Fatalf("overwrite auth credential failed: %v", err)
	}
	assertCredentialPathModes(t, authPath)

	if err := saveAgentCredential(defaultAgentProfileName, agentCredential{
		AgentID:         "agent-1",
		AgentPrivateKey: agentKey,
		APIBaseURL:      "https://mail.example.com",
		HostID:          "host-1",
		HostPrivateKey:  hostKey,
		Issuer:          "https://mail.example.com",
		Mode:            "delegated",
		Name:            "Private Agent",
		Status:          "active",
	}); err != nil {
		t.Fatalf("save agent credential failed: %v", err)
	}
	agentPath, err := agentCredentialPath(defaultAgentProfileName)
	if err != nil {
		t.Fatalf("agent credential path failed: %v", err)
	}
	assertCredentialPathModes(t, agentPath)
	loosenCredentialPathModes(t, agentPath)
	if err := saveAgentCredential(defaultAgentProfileName, agentCredential{
		AgentID:         "agent-2",
		AgentPrivateKey: agentKey,
		APIBaseURL:      "https://mail.example.com",
		HostID:          "host-1",
		HostPrivateKey:  hostKey,
		Issuer:          "https://mail.example.com",
		Mode:            "delegated",
		Name:            "Private Agent",
		Status:          "active",
	}); err != nil {
		t.Fatalf("overwrite agent credential failed: %v", err)
	}
	assertCredentialPathModes(t, agentPath)

	if err := saveAgentHostCredential(agentHostCredential{
		APIBaseURL:     "https://mail.example.com",
		HostID:         "host-1",
		HostPrivateKey: hostKey,
		Issuer:         "https://mail.example.com",
		Name:           "Private Host",
		Status:         "active",
	}); err != nil {
		t.Fatalf("save agent host credential failed: %v", err)
	}
	hostPath, err := agentHostCredentialPath()
	if err != nil {
		t.Fatalf("agent host credential path failed: %v", err)
	}
	assertCredentialPathModes(t, hostPath)
	loosenCredentialPathModes(t, hostPath)
	if err := saveAgentHostCredential(agentHostCredential{
		APIBaseURL:     "https://mail.example.com",
		HostID:         "host-2",
		HostPrivateKey: hostKey,
		Issuer:         "https://mail.example.com",
		Name:           "Private Host",
		Status:         "active",
	}); err != nil {
		t.Fatalf("overwrite agent host credential failed: %v", err)
	}
	assertCredentialPathModes(t, hostPath)
}

func assertCredentialPathModes(t *testing.T, path string) {
	t.Helper()

	fileInfo, err := os.Stat(path)
	if err != nil {
		t.Fatalf("credential stat failed for %s: %v", path, err)
	}
	if got := fileInfo.Mode().Perm(); got != 0o600 {
		t.Fatalf("credential file mode for %s = %#o, want 0600", path, got)
	}

	dirInfo, err := os.Stat(filepath.Dir(path))
	if err != nil {
		t.Fatalf("credential dir stat failed for %s: %v", filepath.Dir(path), err)
	}
	if got := dirInfo.Mode().Perm(); got != 0o700 {
		t.Fatalf("credential dir mode for %s = %#o, want 0700", filepath.Dir(path), got)
	}
}

func loosenCredentialPathModes(t *testing.T, path string) {
	t.Helper()

	if err := os.Chmod(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("loosen credential dir failed: %v", err)
	}
	if err := os.Chmod(path, 0o644); err != nil {
		t.Fatalf("loosen credential file failed: %v", err)
	}
}

func TestMainAgentEnrollStatusAndDisconnect(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	seen := map[string]int{}
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		seen[request.URL.Path]++
		writer.Header().Set("Content-Type", "application/json")
		switch request.URL.Path {
		case "/.well-known/at-email.json":
			http.NotFound(writer, request)
		case "/.well-known/agent-configuration":
			if request.Method != http.MethodGet {
				t.Fatalf("agent configuration method = %s", request.Method)
			}
			writeJSON(t, writer, map[string]any{
				"issuer": server.URL,
				"modes":  []string{"delegated", "autonomous"},
			})
		case "/rpc/auth/api/host/enroll":
			if request.Method != http.MethodPost {
				t.Fatalf("host enroll method = %s", request.Method)
			}
			var body map[string]any
			if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
				t.Fatalf("host enroll body decode failed: %v", err)
			}
			if body["token"] != "enrollment-token" {
				t.Fatalf("host enroll token = %#v", body["token"])
			}
			publicKey := objectValue(body["public_key"])
			if publicKey["d"] != nil || publicKey["kty"] != "OKP" || publicKey["crv"] != "Ed25519" {
				t.Fatalf("host public key = %#v", publicKey)
			}
			writeJSON(t, writer, map[string]any{
				"default_capabilities": []string{},
				"hostId":               "host-1",
				"name":                 "Test Agent",
				"status":               "active",
			})
		case "/rpc/auth/api/agent/register":
			if request.Method != http.MethodPost {
				t.Fatalf("agent register method = %s", request.Method)
			}
			header, payload := decodeTestJWT(t, request.Header.Get("Authorization"))
			if header["typ"] != "host+jwt" || payload["iss"] != "host-1" {
				t.Fatalf("host jwt header=%#v payload=%#v", header, payload)
			}
			if payload["aud"] != server.URL || payload["htm"] != http.MethodPost || payload["htu"] != server.URL+"/rpc/auth/api/agent/register" {
				t.Fatalf("host jwt request binding payload=%#v", payload)
			}
			agentPublicKey := objectValue(payload["agent_public_key"])
			if agentPublicKey["d"] != nil || agentPublicKey["kty"] != "OKP" || agentPublicKey["crv"] != "Ed25519" {
				t.Fatalf("agent public key = %#v", agentPublicKey)
			}
			var body map[string]any
			if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
				t.Fatalf("agent register body decode failed: %v", err)
			}
			if body["name"] != "Test Agent" || body["mode"] != "delegated" {
				t.Fatalf("agent register body = %#v", body)
			}
			writeJSON(t, writer, map[string]any{
				"agent_capability_grants": []map[string]any{
					{"capability": "email.status", "status": "active"},
				},
				"agent_id": "agent-1",
				"host_id":  "host-1",
				"mode":     "delegated",
				"name":     "Test Agent",
				"status":   "active",
			})
		case "/rpc/mail/workspace":
			if request.Method != http.MethodGet {
				t.Fatalf("mail workspace method = %s", request.Method)
			}
			header, payload := decodeTestJWT(t, request.Header.Get("Authorization"))
			if header["typ"] != "agent+jwt" || payload["iss"] != "host-1" || payload["sub"] != "agent-1" {
				t.Fatalf("mail workspace jwt header=%#v payload=%#v", header, payload)
			}
			if payload["aud"] != server.URL || payload["htm"] != http.MethodGet || payload["htu"] != server.URL+"/rpc/mail/workspace" {
				t.Fatalf("mail workspace jwt request binding payload=%#v", payload)
			}
			if request.Header.Get("X-Access-Token") != "" {
				t.Fatalf("mail workspace request forwarded a WildDuck access token")
			}
			writeJSON(t, writer, map[string]any{
				"accounts": []map[string]any{
					{"id": "support@example.test", "address": "support@example.test", "name": "Support", "state": "ready"},
				},
				"activeAccountId": "support@example.test",
				"activeFolderId":  "inbox-1",
				"folders": []map[string]any{
					{"id": "inbox-1", "name": "Inbox", "path": "INBOX", "specialUse": "\\Inbox", "total": 42, "unread": 7},
				},
				"messages": []map[string]any{},
				"pagination": map[string]any{
					"hasNextPage":     false,
					"hasPreviousPage": false,
				},
				"selectedMessage": nil,
			})
		case "/rpc/auth/api/agent/status":
			if request.Method != http.MethodGet {
				t.Fatalf("agent status method = %s", request.Method)
			}
			header, payload := decodeTestJWT(t, request.Header.Get("Authorization"))
			if header["typ"] != "agent+jwt" || payload["iss"] != "host-1" || payload["sub"] != "agent-1" {
				t.Fatalf("agent status jwt header=%#v payload=%#v", header, payload)
			}
			if payload["aud"] != server.URL || payload["htm"] != http.MethodGet || payload["htu"] != server.URL+"/rpc/auth/api/agent/status" {
				t.Fatalf("agent status jwt request binding payload=%#v", payload)
			}
			writeJSON(t, writer, map[string]any{
				"agent_capability_grants": []map[string]any{
					{
						"capability":            "email.status",
						"constraints":           map[string]any{"mailboxAddress": "support@example.test", "organizationId": "org-1", "secret": "grant-secret-value"},
						"host_private_key_jwk":  "remote-host-private-key",
						"secret_access_token":   "remote-agent-access-token",
						"status":                "active",
						"wildduck_access_token": "remote-wildduck-token",
					},
				},
				"agent_id":   "agent-1",
				"expires_at": "2026-06-22T12:00:00.000Z",
				"host_id":    "host-1",
				"mode":       "delegated",
				"name":       "Test Agent",
				"status":     "active",
			})
		case "/rpc/auth/api/agent/revoke":
			if request.Method != http.MethodPost {
				t.Fatalf("agent revoke method = %s", request.Method)
			}
			header, payload := decodeTestJWT(t, request.Header.Get("Authorization"))
			if header["typ"] != "agent+jwt" || payload["sub"] != "agent-1" {
				t.Fatalf("agent revoke jwt header=%#v payload=%#v", header, payload)
			}
			if payload["htu"] != server.URL+"/rpc/auth/api/agent/revoke" {
				t.Fatalf("agent revoke htu = %#v", payload["htu"])
			}
			var body map[string]any
			if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
				t.Fatalf("agent revoke body decode failed: %v", err)
			}
			if body["agent_id"] != "agent-1" {
				t.Fatalf("agent revoke body = %#v", body)
			}
			writeJSON(t, writer, map[string]any{
				"agent_id": "agent-1",
				"status":   "revoked",
			})
		default:
			t.Fatalf("unexpected request path %s", request.URL.Path)
		}
	}))
	defer server.Close()

	var stdout, stderr bytes.Buffer
	code := Main(
		context.Background(),
		[]string{"agent", "enroll", "enrollment-token", "--api-base-url", server.URL, "--name", "Test Agent", "--json"},
		nil,
		strings.NewReader(""),
		&stdout,
		&stderr,
	)
	if code != 0 {
		t.Fatalf("enroll code = %d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	assertNoAgentSecretsInOutput(t, stdout.String())
	if !strings.Contains(stdout.String(), `"agent_id": "agent-1"`) {
		t.Fatalf("enroll stdout = %s", stdout.String())
	}
	if !strings.Contains(stdout.String(), `"issuer": "`+server.URL+`"`) {
		t.Fatalf("enroll stdout missing issuer = %s", stdout.String())
	}
	if stderr.String() != "" {
		t.Fatalf("enroll stderr = %q", stderr.String())
	}
	credentialPath, err := agentCredentialPath(defaultAgentProfileName)
	if err != nil {
		t.Fatalf("agentCredentialPath failed: %v", err)
	}
	if _, err := os.Stat(credentialPath); err != nil {
		t.Fatalf("agent credential was not saved: %v", err)
	}
	credentialFile, err := os.ReadFile(credentialPath)
	if err != nil {
		t.Fatalf("agent credential read failed: %v", err)
	}
	if !strings.Contains(string(credentialFile), `"issuer": "`+server.URL+`"`) {
		t.Fatalf("agent credential file missing issuer = %s", string(credentialFile))
	}
	authPath, err := authCredentialPath()
	if err != nil {
		t.Fatalf("authCredentialPath failed: %v", err)
	}
	if _, err := os.Stat(authPath); !os.IsNotExist(err) {
		t.Fatalf("personal auth credential should not be created, stat err=%v", err)
	}

	stdout.Reset()
	stderr.Reset()
	code = Main(context.Background(), []string{"status"}, nil, strings.NewReader(""), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("mail status code = %d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	assertNoAgentSecretsInOutput(t, stdout.String())
	if !strings.Contains(stdout.String(), "User: agent-1") ||
		!strings.Contains(stdout.String(), "API: "+server.URL) ||
		!strings.Contains(stdout.String(), "Folders: 1") ||
		!strings.Contains(stdout.String(), "INBOX") ||
		!strings.Contains(stdout.String(), "total=42") ||
		!strings.Contains(stdout.String(), "unseen=7") {
		t.Fatalf("mail status stdout = %s", stdout.String())
	}

	stdout.Reset()
	stderr.Reset()
	code = Main(context.Background(), []string{"agent", "status", "--json"}, nil, strings.NewReader(""), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("status code = %d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	assertNoAgentSecretsInOutput(t, stdout.String())
	for _, forbidden := range []string{
		"grant-secret-value",
		"remote-agent-access-token",
		"remote-host-private-key",
		"remote-wildduck-token",
		"secret_access_token",
		"wildduck_access_token",
	} {
		if strings.Contains(stdout.String(), forbidden) {
			t.Fatalf("status stdout leaked remote secret %q: %s", forbidden, stdout.String())
		}
	}
	if !strings.Contains(stdout.String(), `"remote"`) || !strings.Contains(stdout.String(), `"expires_at": "2026-06-22T12:00:00.000Z"`) {
		t.Fatalf("status stdout = %s", stdout.String())
	}

	stdout.Reset()
	stderr.Reset()
	code = Main(context.Background(), []string{"agent", "disconnect", "--json"}, nil, strings.NewReader(""), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("disconnect code = %d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	assertNoAgentSecretsInOutput(t, stdout.String())
	if !strings.Contains(stdout.String(), `"status": "revoked"`) {
		t.Fatalf("disconnect stdout = %s", stdout.String())
	}
	if _, err := os.Stat(credentialPath); !os.IsNotExist(err) {
		t.Fatalf("agent credential should be removed from %s, stat err=%v", filepath.Base(credentialPath), err)
	}

	for _, path := range []string{
		"/rpc/auth/api/host/enroll",
		"/rpc/auth/api/agent/register",
		"/rpc/mail/workspace",
		"/rpc/auth/api/agent/status",
		"/rpc/auth/api/agent/revoke",
	} {
		if seen[path] != 1 {
			t.Fatalf("%s seen %d times", path, seen[path])
		}
	}
	if seen["/.well-known/agent-configuration"] != 3 {
		t.Fatalf("/.well-known/agent-configuration seen %d times", seen["/.well-known/agent-configuration"])
	}
}

func TestMainAgentEnrollRequiresDelegatedProviderMode(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	var sawHostEnroll bool
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		switch request.URL.Path {
		case "/.well-known/at-email.json":
			http.NotFound(writer, request)
		case "/.well-known/agent-configuration":
			writeJSON(t, writer, map[string]any{
				"issuer": request.Host,
				"modes":  []string{"autonomous"},
			})
		case "/rpc/auth/api/host/enroll":
			sawHostEnroll = true
			t.Fatalf("host enroll should not be called when delegated mode is unavailable")
		default:
			t.Fatalf("unexpected request path %s", request.URL.Path)
		}
	}))
	defer server.Close()

	var stdout, stderr bytes.Buffer
	code := Main(
		context.Background(),
		[]string{"agent", "enroll", "enrollment-token", "--api-base-url", server.URL},
		nil,
		strings.NewReader(""),
		&stdout,
		&stderr,
	)
	if code != 1 {
		t.Fatalf("enroll code = %d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	if sawHostEnroll {
		t.Fatal("host enroll was called")
	}
	if !strings.Contains(stdout.String(), "does not advertise delegated Agent Auth support") {
		t.Fatalf("enroll stdout = %s", stdout.String())
	}
	if stderr.String() != "" {
		t.Fatalf("enroll stderr = %q", stderr.String())
	}
}

func TestMainAgentEnrollWaitsForPendingRegistrationApproval(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	previousOpenBrowser := openBrowser
	previousAuthSleep := authSleep
	t.Cleanup(func() {
		openBrowser = previousOpenBrowser
		authSleep = previousAuthSleep
	})
	var openedURL string
	openBrowser = func(target string) error {
		openedURL = target
		return nil
	}
	authSleep = func(ctx context.Context, duration time.Duration) error {
		return nil
	}

	var statusPolls int
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		switch request.URL.Path {
		case "/.well-known/at-email.json":
			http.NotFound(writer, request)
		case "/.well-known/agent-configuration":
			if request.Method != http.MethodGet {
				t.Fatalf("agent configuration method = %s", request.Method)
			}
			writeJSON(t, writer, map[string]any{
				"issuer": server.URL,
				"modes":  []string{"delegated", "autonomous"},
			})
		case "/rpc/auth/api/host/enroll":
			if request.Method != http.MethodPost {
				t.Fatalf("host enroll method = %s", request.Method)
			}
			writeJSON(t, writer, map[string]any{
				"default_capabilities": []string{},
				"hostId":               "host-1",
				"name":                 "Pending Agent",
				"status":               "active",
			})
		case "/rpc/auth/api/agent/register":
			if request.Method != http.MethodPost {
				t.Fatalf("agent register method = %s", request.Method)
			}
			header, payload := decodeTestJWT(t, request.Header.Get("Authorization"))
			if header["typ"] != "host+jwt" || payload["iss"] != "host-1" {
				t.Fatalf("host jwt header=%#v payload=%#v", header, payload)
			}
			writeJSON(t, writer, map[string]any{
				"agent_capability_grants": []map[string]any{
					{"capability": "email.status", "status": "pending"},
				},
				"agent_id": "agent-1",
				"approval": map[string]any{
					"expires_in":                60,
					"interval":                  1,
					"method":                    "device_authorization",
					"user_code":                 "WXYZ9876",
					"verification_uri":          server.URL + "/device/capabilities",
					"verification_uri_complete": server.URL + "/device/capabilities?agent_id=agent-1&code=WXYZ9876",
				},
				"host_id": "host-1",
				"mode":    "delegated",
				"name":    "Pending Agent",
				"status":  "pending",
			})
		case "/rpc/auth/api/agent/status":
			statusPolls++
			if request.URL.Query().Get("agent_id") != "agent-1" {
				t.Fatalf("agent status query = %s", request.URL.RawQuery)
			}
			header, payload := decodeTestJWT(t, request.Header.Get("Authorization"))
			if header["typ"] != "host+jwt" || payload["iss"] != "host-1" {
				t.Fatalf("agent status jwt header=%#v payload=%#v", header, payload)
			}
			writeJSON(t, writer, map[string]any{
				"agent_capability_grants": []map[string]any{
					{"capability": "email.status", "status": "active"},
				},
				"agent_id": "agent-1",
				"host_id":  "host-1",
				"mode":     "delegated",
				"name":     "Pending Agent",
				"status":   "active",
			})
		default:
			t.Fatalf("unexpected request path %s", request.URL.Path)
		}
	}))
	defer server.Close()

	var stdout, stderr bytes.Buffer
	code := Main(
		context.Background(),
		[]string{"agent", "enroll", "enrollment-token", "--api-base-url", server.URL, "--name", "Pending Agent"},
		nil,
		strings.NewReader(""),
		&stdout,
		&stderr,
	)
	if code != 0 {
		t.Fatalf("enroll code = %d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	assertNoAgentSecretsInOutput(t, stdout.String())
	if !strings.Contains(stdout.String(), "Open: "+server.URL+"/device/capabilities?agent_id=agent-1&code=WXYZ9876") ||
		!strings.Contains(stdout.String(), "Waiting for agent approval...") ||
		!strings.Contains(stdout.String(), "Agent enrolled.") {
		t.Fatalf("enroll stdout = %s", stdout.String())
	}
	if openedURL != server.URL+"/device/capabilities?agent_id=agent-1&code=WXYZ9876" {
		t.Fatalf("opened URL = %q", openedURL)
	}
	if statusPolls != 1 {
		t.Fatalf("status polls = %d", statusPolls)
	}
	if stderr.String() != "" {
		t.Fatalf("enroll stderr = %q", stderr.String())
	}

	credentialPath, err := agentCredentialPath(defaultAgentProfileName)
	if err != nil {
		t.Fatalf("agentCredentialPath failed: %v", err)
	}
	credentialFile, err := os.ReadFile(credentialPath)
	if err != nil {
		t.Fatalf("agent credential read failed: %v", err)
	}
	if !strings.Contains(string(credentialFile), `"status": "active"`) ||
		!strings.Contains(string(credentialFile), `"agent_id": "agent-1"`) ||
		!strings.Contains(string(credentialFile), `"issuer": "`+server.URL+`"`) {
		t.Fatalf("agent credential file = %s", string(credentialFile))
	}
}

func TestMainAgentTrialCreatesAutonomousCredentialThroughWebserver(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	oldHostKey, err := newAgentEd25519JWK()
	if err != nil {
		t.Fatalf("old host key: %v", err)
	}
	oldAgentKey, err := newAgentEd25519JWK()
	if err != nil {
		t.Fatalf("old agent key: %v", err)
	}

	seen := map[string]int{}
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		seen[request.URL.Path]++
		writer.Header().Set("Content-Type", "application/json")
		switch request.URL.Path {
		case "/.well-known/at-email.json":
			http.NotFound(writer, request)
		case "/.well-known/agent-configuration":
			if request.Method != http.MethodGet {
				t.Fatalf("agent configuration method = %s", request.Method)
			}
			writeJSON(t, writer, map[string]any{
				"modes": []string{"delegated", "autonomous"},
				"endpoints": map[string]string{
					"revoke": server.URL + "/api/auth/agent/revoke",
				},
			})
		case "/api/auth/agent/revoke":
			if request.Method != http.MethodPost {
				t.Fatalf("agent revoke method = %s", request.Method)
			}
			header, payload := decodeTestJWT(t, request.Header.Get("Authorization"))
			if header["typ"] != "agent+jwt" || payload["iss"] != "old-host" || payload["sub"] != "old-agent" {
				t.Fatalf("old agent revoke jwt header=%#v payload=%#v", header, payload)
			}
			if payload["htu"] != server.URL+"/api/auth/agent/revoke" {
				t.Fatalf("old agent revoke htu = %#v", payload["htu"])
			}
			writeJSON(t, writer, map[string]any{
				"agent_id": "old-agent",
				"status":   "revoked",
			})
		case "/rpc/auth/api/agent/revoke":
			t.Fatalf("agent trial --force used fallback revoke endpoint instead of discovered endpoint")
		case "/rpc/agent-access/trials":
			if request.Method != http.MethodPost {
				t.Fatalf("trial method = %s", request.Method)
			}
			if request.Header.Get("Authorization") != "" {
				t.Fatalf("trial request should not carry a bearer token")
			}
			var body map[string]any
			if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
				t.Fatalf("trial body decode failed: %v", err)
			}
			if body["name"] != "Trial Agent" {
				t.Fatalf("trial body = %#v", body)
			}
			if body["admission_token"] != "trial-admission-token" {
				t.Fatalf("trial admission token missing from body = %#v", body)
			}
			hostPublicKey := objectValue(body["host_public_key"])
			if hostPublicKey["d"] != nil || hostPublicKey["kty"] != "OKP" || hostPublicKey["crv"] != "Ed25519" {
				t.Fatalf("host public key = %#v", hostPublicKey)
			}
			agentPublicKey := objectValue(body["agent_public_key"])
			if agentPublicKey["d"] != nil || agentPublicKey["kty"] != "OKP" || agentPublicKey["crv"] != "Ed25519" {
				t.Fatalf("agent public key = %#v", agentPublicKey)
			}
			capabilities := anySlice(body["capabilities"])
			if len(capabilities) != 1 || capabilities[0] != "email.status" {
				t.Fatalf("trial capabilities = %#v", body["capabilities"])
			}
			postClaimCapabilities := anySlice(body["post_claim_capabilities"])
			if len(postClaimCapabilities) != 1 || postClaimCapabilities[0] != "email.message.send" {
				t.Fatalf("trial post-claim capabilities = %#v", body["post_claim_capabilities"])
			}
			writeJSON(t, writer, map[string]any{
				"agent_capability_grants": []map[string]any{
					{"capability": "email.status", "constraints": map[string]any{"organizationId": "org-1"}, "status": "active"},
				},
				"agent_id":                "agent-trial-1",
				"capabilities":            []string{"email.status"},
				"expires_at":              "2026-06-29T00:00:00.000Z",
				"host_id":                 "host-trial-1",
				"mode":                    "autonomous",
				"name":                    "Trial Agent",
				"post_claim_capabilities": []string{"email.message.send"},
				"status":                  "active",
				"trial_id":                "trial-public-1",
				"claim":                   map[string]any{"expires_at": "2026-06-23T00:00:00.000Z", "secret": "claim-secret-value", "url": server.URL + "/agent/claim/claim-token"},
				"mailbox":                 map[string]any{"address": "trial-1@example.test", "wildduck_user_id": "wildduck-user-1"},
			})
		default:
			t.Fatalf("unexpected request path %s", request.URL.Path)
		}
	}))
	defer server.Close()
	if err := saveAgentCredential(defaultAgentProfileName, agentCredential{
		APIBaseURL:      server.URL,
		AgentID:         "old-agent",
		AgentPrivateKey: oldAgentKey,
		HostID:          "old-host",
		HostPrivateKey:  oldHostKey,
		Status:          "active",
	}); err != nil {
		t.Fatalf("save existing agent credential failed: %v", err)
	}

	var stdout, stderr bytes.Buffer
	code := Main(
		context.Background(),
		[]string{"agent", "trial", "--api-base-url", server.URL, "--name", "Trial Agent", "--capability", "email.status", "--post-claim-capability", "email.message.send", "--force", "--json"},
		[]string{"AT_EMAIL_TRIAL_ADMISSION_TOKEN=trial-admission-token"},
		strings.NewReader(""),
		&stdout,
		&stderr,
	)
	if code != 0 {
		t.Fatalf("trial code = %d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	assertNoAgentSecretsInOutput(t, stdout.String())
	if !strings.Contains(stdout.String(), `"agent_id": "agent-trial-1"`) ||
		!strings.Contains(stdout.String(), `"mode": "autonomous"`) ||
		!strings.Contains(stdout.String(), `"address": "trial-1@example.test"`) ||
		!strings.Contains(stdout.String(), `"url": "`+server.URL+`/agent/claim/claim-token"`) {
		t.Fatalf("trial stdout = %s", stdout.String())
	}
	if strings.Contains(stdout.String(), "wildduck-user-1") || strings.Contains(stdout.String(), "wildduck_user_id") {
		t.Fatalf("trial stdout exposed internal WildDuck state: %s", stdout.String())
	}
	if strings.Contains(stdout.String(), "claim-secret-value") || strings.Contains(stdout.String(), `"secret"`) {
		t.Fatalf("trial stdout exposed remote claim extras: %s", stdout.String())
	}
	if stderr.String() != "" {
		t.Fatalf("trial stderr = %q", stderr.String())
	}

	credentialPath, err := agentCredentialPath(defaultAgentProfileName)
	if err != nil {
		t.Fatalf("agentCredentialPath failed: %v", err)
	}
	credentialFile, err := os.ReadFile(credentialPath)
	if err != nil {
		t.Fatalf("agent credential was not saved: %v", err)
	}
	if !strings.Contains(string(credentialFile), `"agent_id": "agent-trial-1"`) ||
		!strings.Contains(string(credentialFile), `"mode": "autonomous"`) {
		t.Fatalf("agent credential file = %s", string(credentialFile))
	}
	if strings.Contains(string(credentialFile), "old-agent") || strings.Contains(string(credentialFile), "old-host") {
		t.Fatalf("agent credential file retained replaced credential state: %s", string(credentialFile))
	}
	if strings.Contains(string(credentialFile), "claim-token") || strings.Contains(string(credentialFile), "wildduck-user-1") {
		t.Fatalf("agent credential file persisted trial handoff state: %s", string(credentialFile))
	}
	authPath, err := authCredentialPath()
	if err != nil {
		t.Fatalf("authCredentialPath failed: %v", err)
	}
	if _, err := os.Stat(authPath); !os.IsNotExist(err) {
		t.Fatalf("personal auth credential should not be created, stat err=%v", err)
	}
	for _, path := range []string{
		"/api/auth/agent/revoke",
		"/.well-known/agent-configuration",
		"/rpc/agent-access/trials",
	} {
		want := 1
		if path == "/.well-known/agent-configuration" {
			want = 2
		}
		if seen[path] != want {
			t.Fatalf("%s seen %d times, want %d", path, seen[path], want)
		}
	}
}

func TestMainAgentTrialUsesFreshHostKeyWhenStoredHostExists(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	hostKey, err := newAgentEd25519JWK()
	if err != nil {
		t.Fatalf("host key: %v", err)
	}

	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		switch request.URL.Path {
		case "/.well-known/at-email.json":
			http.NotFound(writer, request)
		case "/.well-known/agent-configuration":
			writeJSON(t, writer, map[string]any{
				"modes": []string{"delegated", "autonomous"},
			})
		case "/rpc/agent-access/trials":
			var body map[string]any
			if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
				t.Fatalf("trial body decode failed: %v", err)
			}
			hostPublicKey := objectValue(body["host_public_key"])
			if hostPublicKey["x"] == hostKey.X || hostPublicKey["kid"] == hostKey.Kid {
				t.Fatalf("trial reused stored host public key: %#v", hostPublicKey)
			}
			writeJSON(t, writer, map[string]any{
				"agent_capability_grants": []map[string]any{
					{"capability": "email.status", "status": "active"},
				},
				"agent_id": "agent-trial-1",
				"host_id":  "host-trial-1",
				"mode":     "autonomous",
				"name":     "Trial Agent",
				"status":   "active",
			})
		default:
			t.Fatalf("unexpected request path %s", request.URL.Path)
		}
	}))
	defer server.Close()

	if err := saveAgentHostCredential(agentHostCredential{
		APIBaseURL:     server.URL,
		HostID:         "host-existing",
		HostPrivateKey: hostKey,
		Name:           "Stored Host",
		Status:         "active",
	}); err != nil {
		t.Fatalf("save host credential failed: %v", err)
	}

	var stdout, stderr bytes.Buffer
	code := Main(
		context.Background(),
		[]string{"agent", "trial", "--api-base-url", server.URL, "--name", "Trial Agent", "--json"},
		nil,
		strings.NewReader(""),
		&stdout,
		&stderr,
	)
	if code != 0 {
		t.Fatalf("trial code = %d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	if !strings.Contains(stdout.String(), `"host_id": "host-trial-1"`) {
		t.Fatalf("trial stdout = %s", stdout.String())
	}
	storedHost, found, err := loadAgentHostCredentialForAPIBaseURL(server.URL)
	if err != nil || !found {
		t.Fatalf("load stored trial host credential found=%v err=%v", found, err)
	}
	if storedHost.HostID != "host-trial-1" || storedHost.HostPrivateKey.Kid == hostKey.Kid {
		t.Fatalf("stored trial host credential = %#v", storedHost)
	}
	assertNoAgentSecretsInOutput(t, stdout.String())
}

func TestMainAgentTrialRefusesToOverwriteExistingAgentCredentialWithoutForce(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	if err := saveAgentCredential(defaultAgentProfileName, agentCredential{
		APIBaseURL: "https://old.example.test",
		AgentID:    "old-agent",
		HostID:     "old-host",
	}); err != nil {
		t.Fatalf("save existing agent credential failed: %v", err)
	}

	var contacted bool
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		contacted = true
		t.Fatalf("trial should not contact %s when a local agent credential already exists", request.URL.Path)
	}))
	defer server.Close()

	var stdout, stderr bytes.Buffer
	code := Main(
		context.Background(),
		[]string{"agent", "trial", "--api-base-url", server.URL},
		nil,
		strings.NewReader(""),
		&stdout,
		&stderr,
	)
	if code != 1 {
		t.Fatalf("trial code = %d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	if !strings.Contains(stdout.String(), "local at-email agent credential already exists") ||
		!strings.Contains(stdout.String(), "--force") {
		t.Fatalf("trial stdout = %s", stdout.String())
	}
	if stderr.String() != "" {
		t.Fatalf("trial stderr = %q", stderr.String())
	}
	if contacted {
		t.Fatal("trial contacted the webserver before rejecting the local credential overwrite")
	}
}

func TestMainAgentConnectForceValidatesCapabilityInputBeforeRevokingExistingAgent(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	oldHostKey, err := newAgentEd25519JWK()
	if err != nil {
		t.Fatalf("old host key: %v", err)
	}
	oldAgentKey, err := newAgentEd25519JWK()
	if err != nil {
		t.Fatalf("old agent key: %v", err)
	}

	var sawRevoke bool
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		switch request.URL.Path {
		case "/.well-known/at-email.json":
			http.NotFound(writer, request)
		case "/.well-known/agent-configuration":
			writeJSON(t, writer, map[string]any{
				"issuer": server.URL,
				"modes":  []string{"delegated"},
			})
		case "/rpc/auth/api/agent/revoke", "/api/auth/agent/revoke":
			sawRevoke = true
			t.Fatalf("agent connect --force should not revoke before required capability input is valid")
		default:
			t.Fatalf("unexpected request path %s", request.URL.Path)
		}
	}))
	defer server.Close()

	if err := saveAgentCredential(defaultAgentProfileName, agentCredential{
		APIBaseURL:      server.URL,
		AgentID:         "old-agent",
		AgentPrivateKey: oldAgentKey,
		HostID:          "old-host",
		HostPrivateKey:  oldHostKey,
		Status:          "active",
	}); err != nil {
		t.Fatalf("save existing agent credential failed: %v", err)
	}

	var stdout, stderr bytes.Buffer
	code := Main(
		context.Background(),
		[]string{"agent", "connect", "--api-base-url", server.URL, "--force", "--capability", "email.message.read"},
		nil,
		strings.NewReader(""),
		&stdout,
		&stderr,
	)
	if code != 1 {
		t.Fatalf("connect code = %d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	if sawRevoke {
		t.Fatal("revoke endpoint was called")
	}
	if !strings.Contains(stdout.String(), "argument --mailbox-address is required for email.message.* capabilities") {
		t.Fatalf("connect stdout = %s", stdout.String())
	}
	credential, found, err := loadAgentCredential(defaultAgentProfileName)
	if err != nil || !found {
		t.Fatalf("old agent credential was not preserved found=%v err=%v", found, err)
	}
	if credential.AgentID != "old-agent" || credential.HostID != "old-host" {
		t.Fatalf("old agent credential changed = %#v", credential)
	}
}

func TestMainAgentConnectCreatesAgentCredentialThroughDynamicHostRegistration(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	previousOpenBrowser := openBrowser
	previousAuthSleep := authSleep
	t.Cleanup(func() {
		openBrowser = previousOpenBrowser
		authSleep = previousAuthSleep
	})
	var openedURL string
	openBrowser = func(target string) error {
		openedURL = target
		return nil
	}
	authSleep = func(ctx context.Context, duration time.Duration) error {
		return nil
	}

	var statusPolls int
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		switch request.URL.Path {
		case "/.well-known/at-email.json":
			http.NotFound(writer, request)
		case "/.well-known/agent-configuration":
			if request.Method != http.MethodGet {
				t.Fatalf("agent configuration method = %s", request.Method)
			}
			writeJSON(t, writer, map[string]any{
				"issuer": server.URL,
				"modes":  []string{"delegated", "autonomous"},
				"endpoints": map[string]string{
					"register": server.URL + "/api/auth/agent/register",
					"status":   server.URL + "/api/auth/agent/status",
				},
			})
		case "/api/auth/agent/register":
			if request.Method != http.MethodPost {
				t.Fatalf("agent register method = %s", request.Method)
			}
			header, payload := decodeTestJWT(t, request.Header.Get("Authorization"))
			if header["typ"] != "host+jwt" || payload["iss"] == "" {
				t.Fatalf("host jwt header=%#v payload=%#v", header, payload)
			}
			if payload["htu"] != server.URL+"/api/auth/agent/register" {
				t.Fatalf("agent register htu = %#v", payload["htu"])
			}
			hostPublicKey := objectValue(payload["host_public_key"])
			if hostPublicKey["d"] != nil || hostPublicKey["kty"] != "OKP" || hostPublicKey["crv"] != "Ed25519" {
				t.Fatalf("host public key = %#v", hostPublicKey)
			}
			agentPublicKey := objectValue(payload["agent_public_key"])
			if agentPublicKey["d"] != nil || agentPublicKey["kty"] != "OKP" || agentPublicKey["crv"] != "Ed25519" {
				t.Fatalf("agent public key = %#v", agentPublicKey)
			}
			var body map[string]any
			if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
				t.Fatalf("agent register body decode failed: %v", err)
			}
			if body["name"] != "Test Agent" || body["mode"] != "delegated" {
				t.Fatalf("agent register body = %#v", body)
			}
			capabilities := objectSlice(body["capabilities"])
			if len(capabilities) != 4 {
				t.Fatalf("agent register capabilities = %#v", body["capabilities"])
			}
			assertCapabilityRequest(t, capabilities, "email.status", "")
			assertCapabilityRequest(t, capabilities, "email.message.list", "support@example.com")
			assertCapabilityRequest(t, capabilities, "email.message.read", "support@example.com")
			assertCapabilityRequest(t, capabilities, "email.message.search", "support@example.com")
			writeJSON(t, writer, map[string]any{
				"agent_capability_grants": []map[string]any{
					{"capability": "email.status", "status": "pending"},
					{"capability": "email.message.list", "status": "pending"},
					{"capability": "email.message.read", "status": "pending"},
					{"capability": "email.message.search", "status": "pending"},
				},
				"agent_id": "agent-1",
				"approval": map[string]any{
					"expires_in":                60,
					"interval":                  1,
					"method":                    "device_authorization",
					"user_code":                 "ABCD1234",
					"verification_uri":          server.URL + "/device/capabilities",
					"verification_uri_complete": server.URL + "/device/capabilities?agent_id=agent-1&code=ABCD1234",
				},
				"host_id": "host-1",
				"mode":    "delegated",
				"name":    "Test Agent",
				"status":  "pending",
			})
		case "/api/auth/agent/status":
			statusPolls++
			if request.Method != http.MethodGet {
				t.Fatalf("agent status method = %s", request.Method)
			}
			if request.URL.Query().Get("agent_id") != "agent-1" {
				t.Fatalf("agent status query = %s", request.URL.RawQuery)
			}
			header, payload := decodeTestJWT(t, request.Header.Get("Authorization"))
			if header["typ"] != "host+jwt" || payload["iss"] != "host-1" {
				t.Fatalf("agent status jwt header=%#v payload=%#v", header, payload)
			}
			if payload["htu"] != server.URL+"/api/auth/agent/status?agent_id=agent-1" {
				t.Fatalf("agent status htu = %#v", payload["htu"])
			}
			writeJSON(t, writer, map[string]any{
				"agent_capability_grants": []map[string]any{
					{"capability": "email.status", "status": "active"},
					{"capability": "email.message.list", "status": "active"},
					{"capability": "email.message.read", "status": "active"},
					{"capability": "email.message.search", "status": "active"},
				},
				"agent_id": "agent-1",
				"host_id":  "host-1",
				"mode":     "delegated",
				"name":     "Test Agent",
				"status":   "active",
			})
		default:
			t.Fatalf("unexpected request path %s", request.URL.Path)
		}
	}))
	defer server.Close()

	var stdout, stderr bytes.Buffer
	code := Main(
		context.Background(),
		[]string{"agent", "connect", "--api-base-url", server.URL, "--name", "Test Agent", "--mailbox-address", "support@example.com", "--organization-id", "org-1"},
		nil,
		strings.NewReader(""),
		&stdout,
		&stderr,
	)
	if code != 0 {
		t.Fatalf("connect code = %d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	assertNoAgentSecretsInOutput(t, stdout.String())
	if strings.Contains(stdout.String(), "personal-token") {
		t.Fatalf("connect stdout leaked personal token: %s", stdout.String())
	}
	if !strings.Contains(stdout.String(), "Open: "+server.URL+"/device/capabilities?agent_id=agent-1&code=ABCD1234") ||
		!strings.Contains(stdout.String(), "Agent connected.") {
		t.Fatalf("connect stdout = %s", stdout.String())
	}
	if openedURL != server.URL+"/device/capabilities?agent_id=agent-1&code=ABCD1234" {
		t.Fatalf("opened URL = %q", openedURL)
	}
	if statusPolls != 1 {
		t.Fatalf("status polls = %d", statusPolls)
	}
	credentialPath, err := agentCredentialPath(defaultAgentProfileName)
	if err != nil {
		t.Fatalf("agentCredentialPath failed: %v", err)
	}
	credentialFile, err := os.ReadFile(credentialPath)
	if err != nil {
		t.Fatalf("agent credential read failed: %v", err)
	}
	if strings.Contains(string(credentialFile), "personal-token") {
		t.Fatalf("agent credential leaked personal token: %s", string(credentialFile))
	}
	if !strings.Contains(string(credentialFile), `"agent_id": "agent-1"`) ||
		!strings.Contains(string(credentialFile), `"host_id": "host-1"`) ||
		!strings.Contains(string(credentialFile), `"issuer": "`+server.URL+`"`) {
		t.Fatalf("agent credential file = %s", string(credentialFile))
	}
}

func TestMainAgentConnectJSONPrintsPendingApprovalToStderr(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	previousOpenBrowser := openBrowser
	previousAuthSleep := authSleep
	t.Cleanup(func() {
		openBrowser = previousOpenBrowser
		authSleep = previousAuthSleep
	})
	var openedURL string
	openBrowser = func(target string) error {
		openedURL = target
		return nil
	}
	authSleep = func(ctx context.Context, duration time.Duration) error {
		return nil
	}

	var statusPolls int
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		switch request.URL.Path {
		case "/.well-known/at-email.json":
			http.NotFound(writer, request)
		case "/.well-known/agent-configuration":
			writeJSON(t, writer, map[string]any{
				"issuer": server.URL,
				"modes":  []string{"delegated"},
			})
		case "/rpc/auth/api/agent/register":
			if request.Method != http.MethodPost {
				t.Fatalf("agent register method = %s", request.Method)
			}
			header, payload := decodeTestJWT(t, request.Header.Get("Authorization"))
			if header["typ"] != "host+jwt" || payload["iss"] == "" {
				t.Fatalf("host jwt header=%#v payload=%#v", header, payload)
			}
			writeJSON(t, writer, map[string]any{
				"agent_capability_grants": []map[string]any{
					{"capability": "email.status", "status": "pending"},
				},
				"agent_id": "agent-1",
				"approval": map[string]any{
					"expires_in":                60,
					"interval":                  1,
					"method":                    "device_authorization",
					"user_code":                 "QRST1234",
					"verification_uri":          server.URL + "/device/capabilities",
					"verification_uri_complete": server.URL + "/device/capabilities?agent_id=agent-1&code=QRST1234",
				},
				"host_id": "host-1",
				"mode":    "delegated",
				"name":    "JSON Agent",
				"status":  "pending",
			})
		case "/rpc/auth/api/agent/status":
			statusPolls++
			if request.URL.Query().Get("agent_id") != "agent-1" {
				t.Fatalf("agent status query = %s", request.URL.RawQuery)
			}
			writeJSON(t, writer, map[string]any{
				"agent_capability_grants": []map[string]any{
					{"capability": "email.status", "status": "active"},
				},
				"agent_id": "agent-1",
				"host_id":  "host-1",
				"mode":     "delegated",
				"name":     "JSON Agent",
				"status":   "active",
			})
		default:
			t.Fatalf("unexpected request path %s", request.URL.Path)
		}
	}))
	defer server.Close()

	var stdout, stderr bytes.Buffer
	code := Main(
		context.Background(),
		[]string{"agent", "connect", "--json", "--api-base-url", server.URL, "--name", "JSON Agent"},
		nil,
		strings.NewReader(""),
		&stdout,
		&stderr,
	)
	if code != 0 {
		t.Fatalf("connect code = %d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	if openedURL != "" {
		t.Fatalf("json connect opened URL = %q", openedURL)
	}
	if statusPolls != 1 {
		t.Fatalf("status polls = %d", statusPolls)
	}
	status, err := decodeJSONObject(stdout.Bytes())
	if err != nil {
		t.Fatalf("decode agent status json: %v", err)
	}
	if status["configured"] != true || status["status"] != "active" || status["agent_id"] != "agent-1" {
		t.Fatalf("agent status payload = %#v", status)
	}
	pending, err := decodeJSONObject(stderr.Bytes())
	if err != nil {
		t.Fatalf("decode pending approval json: %v", err)
	}
	if pending["event"] != "agent_authorization_pending" ||
		pending["operation"] != "agent_connect" ||
		pending["method"] != "device_authorization" ||
		pending["user_code"] != "QRST1234" ||
		pending["formatted_user_code"] != "QRST-1234" ||
		pending["verification_uri_complete"] != server.URL+"/device/capabilities?agent_id=agent-1&code=QRST1234" {
		t.Fatalf("pending approval event = %#v", pending)
	}
	assertNoAgentSecretsInOutput(t, stdout.String())
	assertNoAgentSecretsInOutput(t, stderr.String())
}

func TestMainAgentConnectRejectsCrossOriginDiscoveredEndpoint(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	var sawRegister bool
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		switch request.URL.Path {
		case "/.well-known/at-email.json":
			http.NotFound(writer, request)
		case "/.well-known/agent-configuration":
			writeJSON(t, writer, map[string]any{
				"issuer": server.URL,
				"modes":  []string{"delegated", "autonomous"},
				"endpoints": map[string]string{
					"register": "https://evil.example.test/api/auth/agent/register",
				},
			})
		case "/rpc/auth/api/agent/register", "/api/auth/agent/register":
			sawRegister = true
			t.Fatalf("agent register should not be called for cross-origin discovery endpoint")
		default:
			t.Fatalf("unexpected request path %s", request.URL.Path)
		}
	}))
	defer server.Close()

	var stdout, stderr bytes.Buffer
	code := Main(
		context.Background(),
		[]string{"agent", "connect", "--api-base-url", server.URL},
		nil,
		strings.NewReader(""),
		&stdout,
		&stderr,
	)
	if code != 70 {
		t.Fatalf("connect code = %d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	if sawRegister {
		t.Fatal("agent register was called")
	}
	if !strings.Contains(stdout.String(), "must use the same origin as the API base URL") {
		t.Fatalf("connect stdout = %s", stdout.String())
	}
	if stderr.String() != "" {
		t.Fatalf("connect stderr = %q", stderr.String())
	}
}

func TestMainAgentConnectReusesStoredHostCredential(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	hostKey, err := newAgentEd25519JWK()
	if err != nil {
		t.Fatalf("host key: %v", err)
	}

	var sawHostCreate bool
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		switch request.URL.Path {
		case "/.well-known/at-email.json":
			http.NotFound(writer, request)
		case "/.well-known/agent-configuration":
			writeJSON(t, writer, map[string]any{
				"issuer": server.URL,
				"modes":  []string{"delegated", "autonomous"},
			})
		case "/rpc/auth/api/host/create":
			sawHostCreate = true
			t.Fatalf("host create should not be called when a matching host credential exists")
		case "/rpc/auth/api/agent/register":
			header, payload := decodeTestJWT(t, request.Header.Get("Authorization"))
			if header["typ"] != "host+jwt" || payload["iss"] != "host-existing" {
				t.Fatalf("host jwt header=%#v payload=%#v", header, payload)
			}
			if header["kid"] != hostKey.Kid {
				t.Fatalf("host jwt did not use stored host key: header=%#v", header)
			}
			writeJSON(t, writer, map[string]any{
				"agent_capability_grants": []map[string]any{
					{"capability": "email.status", "status": "active"},
				},
				"agent_id": "agent-1",
				"host_id":  "host-existing",
				"mode":     "delegated",
				"name":     "Test Agent",
				"status":   "active",
			})
		default:
			t.Fatalf("unexpected request path %s", request.URL.Path)
		}
	}))
	defer server.Close()

	if err := saveAgentHostCredential(agentHostCredential{
		APIBaseURL:     server.URL,
		HostID:         "host-existing",
		HostPrivateKey: hostKey,
		Name:           "Stored Host",
		Status:         "active",
	}); err != nil {
		t.Fatalf("save host credential failed: %v", err)
	}

	var stdout, stderr bytes.Buffer
	code := Main(
		context.Background(),
		[]string{"agent", "connect", "--api-base-url", server.URL, "--name", "Test Agent"},
		nil,
		strings.NewReader(""),
		&stdout,
		&stderr,
	)
	if code != 0 {
		t.Fatalf("connect code = %d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	if sawHostCreate {
		t.Fatal("host create was called")
	}
	if !strings.Contains(stdout.String(), "Host: host-existing") {
		t.Fatalf("connect stdout = %s", stdout.String())
	}
	assertNoAgentSecretsInOutput(t, stdout.String())
}

func TestMainAgentConnectRequiresDelegatedProviderMode(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	var sawHostCreate bool
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		switch request.URL.Path {
		case "/.well-known/at-email.json":
			http.NotFound(writer, request)
		case "/.well-known/agent-configuration":
			writeJSON(t, writer, map[string]any{
				"issuer": request.Host,
				"modes":  []string{"autonomous"},
			})
		case "/rpc/auth/api/host/create":
			sawHostCreate = true
			t.Fatalf("host create should not be called when delegated mode is unavailable")
		default:
			t.Fatalf("unexpected request path %s", request.URL.Path)
		}
	}))
	defer server.Close()

	var stdout, stderr bytes.Buffer
	code := Main(
		context.Background(),
		[]string{"agent", "connect", "--api-base-url", server.URL},
		nil,
		strings.NewReader(""),
		&stdout,
		&stderr,
	)
	if code != 1 {
		t.Fatalf("connect code = %d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	if sawHostCreate {
		t.Fatal("host create was called")
	}
	if !strings.Contains(stdout.String(), "does not advertise delegated Agent Auth support") {
		t.Fatalf("connect stdout = %s", stdout.String())
	}
}

func assertCapabilityRequest(t *testing.T, capabilities []map[string]any, name string, mailboxAddress string) {
	t.Helper()
	for _, capability := range capabilities {
		if capability["name"] != name {
			continue
		}
		constraints := objectValue(capability["constraints"])
		if constraints["organizationId"] != nil {
			t.Fatalf("%s unexpectedly included organization constraint = %#v", name, constraints)
		}
		if mailboxAddress != "" && constraints["mailboxAddress"] != mailboxAddress {
			t.Fatalf("%s mailbox constraint = %#v", name, constraints)
		}
		if mailboxAddress == "" && constraints["mailboxAddress"] != nil {
			t.Fatalf("%s unexpected mailbox constraint = %#v", name, constraints)
		}
		return
	}
	t.Fatalf("missing capability request %s in %#v", name, capabilities)
}

func writeJSON(t *testing.T, writer http.ResponseWriter, payload any) {
	t.Helper()
	if err := json.NewEncoder(writer).Encode(payload); err != nil {
		t.Fatalf("write json failed: %v", err)
	}
}

func decodeTestJWT(t *testing.T, authorization string) (map[string]any, map[string]any) {
	t.Helper()
	token := strings.TrimPrefix(authorization, "Bearer ")
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		t.Fatalf("authorization is not a bearer JWT: %q", authorization)
	}
	return decodeTestJWTSegment(t, parts[0]), decodeTestJWTSegment(t, parts[1])
}

func decodeTestJWTSegment(t *testing.T, segment string) map[string]any {
	t.Helper()
	data, err := base64.RawURLEncoding.DecodeString(segment)
	if err != nil {
		t.Fatalf("jwt segment decode failed: %v", err)
	}
	var payload map[string]any
	if err := json.Unmarshal(data, &payload); err != nil {
		t.Fatalf("jwt segment json failed: %v", err)
	}
	return payload
}

func assertNoAgentSecretsInOutput(t *testing.T, output string) {
	t.Helper()
	for _, forbidden := range []string{
		"agent_private_key_jwk",
		"host_private_key_jwk",
		"enrollment-token",
		"host+jwt",
		"agent+jwt",
		`"d":`,
	} {
		if strings.Contains(output, forbidden) {
			t.Fatalf("output leaked %q: %s", forbidden, output)
		}
	}
}
