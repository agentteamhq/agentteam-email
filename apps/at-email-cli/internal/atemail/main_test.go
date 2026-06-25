package atemail

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	atemailskill "at-email-cli"
)

func TestMainParseErrorBeforeConfig(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"inbox", "--limit", "0"}, nil, strings.NewReader(""), &stdout, &stderr)
	if code != 2 {
		t.Fatalf("code = %d", code)
	}
	wantOut := "error: argument --limit: value must be greater than zero\nusage: at-email inbox [-h] [--json] [--folder FOLDER] [--limit LIMIT] [--unseen]\nhint: run `at-email inbox --help`\n"
	if stdout.String() != wantOut {
		t.Fatalf("stdout = %q, want %q", stdout.String(), wantOut)
	}
	if stderr.String() != "" {
		t.Fatalf("stderr = %q", stderr.String())
	}
}

func TestMainJSONUsageErrorKeepsStdoutClean(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"inbox", "--json", "--limit", "0"}, nil, strings.NewReader(""), &stdout, &stderr)
	if code != 2 {
		t.Fatalf("code = %d", code)
	}
	if stdout.String() != "" {
		t.Fatalf("stdout = %q", stdout.String())
	}
	wantErr := "error: argument --limit: value must be greater than zero\nusage: at-email inbox [-h] [--json] [--folder FOLDER] [--limit LIMIT] [--unseen]\nhint: run `at-email inbox --help`\n"
	if stderr.String() != wantErr {
		t.Fatalf("stderr = %q, want %q", stderr.String(), wantErr)
	}
}

func TestMainUsageErrorsUseCommandUsage(t *testing.T) {
	cases := []struct {
		name      string
		argv      []string
		wantUsage string
	}{
		{name: "status", argv: []string{"status", "extra"}, wantUsage: commandUsage(commandStatus)},
		{name: "read", argv: []string{"read"}, wantUsage: commandUsage(commandRead)},
		{name: "search", argv: []string{"search"}, wantUsage: commandUsage(commandSearch)},
		{name: "mark-read", argv: []string{"mark-read"}, wantUsage: commandUsage(commandMarkRead)},
		{name: "archive", argv: []string{"archive"}, wantUsage: commandUsage(commandArchive)},
		{name: "send", argv: []string{"send", "--body", "hello"}, wantUsage: commandUsage(commandSend)},
		{name: "reply", argv: []string{"reply"}, wantUsage: commandUsage(commandReply)},
		{name: "auth", argv: []string{"auth"}, wantUsage: commandUsage(commandAuth)},
		{name: "auth login", argv: []string{"auth", "login", "extra"}, wantUsage: commandUsage(commandAuthLogin)},
		{name: "agent", argv: []string{"agent"}, wantUsage: commandUsage(commandAgent)},
		{name: "skill", argv: []string{"skill", "extra"}, wantUsage: commandUsage(commandSkill)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var stdout, stderr bytes.Buffer
			code := Main(context.Background(), tc.argv, nil, strings.NewReader(""), &stdout, &stderr)
			if code != 2 {
				t.Fatalf("code = %d", code)
			}
			if !strings.Contains(stdout.String(), tc.wantUsage) {
				t.Fatalf("stdout = %q, want usage %q", stdout.String(), tc.wantUsage)
			}
			if strings.Contains(stdout.String(), rootUsage()) && tc.wantUsage != rootUsage() {
				t.Fatalf("stdout used root usage: %q", stdout.String())
			}
			if stderr.String() != "" {
				t.Fatalf("stderr = %q", stderr.String())
			}
		})
	}
}

func TestMainAgentStatusDoesNotRequireMailConfig(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"agent", "status"}, nil, strings.NewReader(""), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("code = %d", code)
	}
	if stdout.String() != "No agent configured.\n" {
		t.Fatalf("stdout = %q", stdout.String())
	}
	if stderr.String() != "" {
		t.Fatalf("stderr = %q", stderr.String())
	}
}

func TestMainAgentStatusJSONDoesNotRequireMailConfig(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"agent", "status", "--json"}, nil, strings.NewReader(""), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("code = %d", code)
	}
	var payload map[string]any
	if err := json.Unmarshal(stdout.Bytes(), &payload); err != nil {
		t.Fatalf("json decode failed: %v", err)
	}
	if payload["configured"] != false || payload["profile"] != defaultAgentProfileName {
		t.Fatalf("payload = %#v", payload)
	}
	if stderr.String() != "" {
		t.Fatalf("stderr = %q", stderr.String())
	}
}

func TestMainStatusUsesAgentMailRPCWithoutWildDuckConfig(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.RequestURI() != "/rpc/mail/workspace" {
			t.Fatalf("request URI = %s", r.URL.RequestURI())
		}
		header, payload := decodeTestJWT(t, r.Header.Get("Authorization"))
		if header["typ"] != "agent+jwt" {
			t.Fatalf("jwt header = %#v", header)
		}
		if payload["iss"] != "host-1" || payload["sub"] != "agent-1" || payload["aud"] != server.URL {
			t.Fatalf("jwt payload = %#v", payload)
		}
		if payload["htm"] != http.MethodGet || payload["htu"] != server.URL+"/rpc/mail/workspace" {
			t.Fatalf("jwt payload = %#v", payload)
		}
		if r.Header.Get("X-Access-Token") != "" {
			t.Fatalf("forwarded WildDuck access token header")
		}
		_, _ = w.Write([]byte(`{
			"accounts":[{"id":"agent@example.com","address":"agent@example.com","name":"Agent","state":"ready"}],
			"activeAccountId":"agent@example.com",
			"activeFolderId":"inbox-1",
			"folders":[{"id":"inbox-1","name":"Inbox","path":"INBOX","specialUse":"\\Inbox","total":2,"unread":1}],
			"messages":[],
			"pagination":{"limit":25,"nextCursor":null,"previousCursor":null,"total":0},
			"selectedMessage":null
		}`))
	}))
	defer server.Close()
	saveTestAgentCredential(t, server.URL)

	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"status", "--json"}, nil, strings.NewReader(""), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("code = %d stdout=%s stderr=%s", code, stdout.String(), stderr.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(stdout.Bytes(), &payload); err != nil {
		t.Fatalf("decode stdout: %v\n%s", err, stdout.String())
	}
	if payload["user_id"] != "agent-1" || payload["api_base_url"] != server.URL {
		t.Fatalf("payload = %#v", payload)
	}
	if len(objectSlice(payload["mailboxes"])) != 1 {
		t.Fatalf("payload = %#v", payload)
	}
	if strings.Contains(stdout.String(), "agent_private_key_jwk") || strings.Contains(stdout.String(), "host_private_key_jwk") {
		t.Fatalf("stdout exposed agent credential: %s", stdout.String())
	}
	if stderr.String() != "" {
		t.Fatalf("stderr = %q", stderr.String())
	}
}

func TestMainInboxUsesAgentMailRPCWithoutWildDuckConfig(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	var seen []string
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = append(seen, r.URL.RequestURI())
		_, payload := decodeTestJWT(t, r.Header.Get("Authorization"))
		if payload["aud"] != server.URL || payload["iss"] != "host-1" || payload["sub"] != "agent-1" {
			t.Fatalf("jwt payload = %#v", payload)
		}
		if payload["htu"] != server.URL+r.URL.RequestURI() {
			t.Fatalf("htu = %#v, want %s", payload["htu"], server.URL+r.URL.RequestURI())
		}
		switch r.URL.RequestURI() {
		case "/rpc/mail/workspace":
			_, _ = w.Write([]byte(`{
				"accounts":[{"id":"agent@example.com","address":"agent@example.com","name":"Agent","state":"ready"}],
				"activeAccountId":"agent@example.com",
				"activeFolderId":"inbox-1",
				"folders":[{"id":"inbox-1","name":"Inbox","path":"INBOX","specialUse":"\\Inbox","total":2,"unread":1}],
				"messages":[],
				"pagination":{"limit":25,"nextCursor":null,"previousCursor":null,"total":0},
				"selectedMessage":null
			}`))
		case "/rpc/mail/workspace?folderId=inbox-1&limit=20":
			_, _ = w.Write([]byte(`{
				"accounts":[{"id":"agent@example.com","address":"agent@example.com","name":"Agent","state":"ready"}],
				"activeAccountId":"agent@example.com",
				"activeFolderId":"inbox-1",
				"folders":[{"id":"inbox-1","name":"Inbox","path":"INBOX","specialUse":"\\Inbox","total":2,"unread":1}],
				"messages":[{"id":"7","mailboxId":"inbox-1","from":"Sender <sender@example.net>","subject":"Hello","teaser":"Body","unread":true,"isDraft":false,"isStarred":false,"attachmentCount":0,"receivedAt":"2026-06-22T12:00:00.000Z"}],
				"pagination":{"limit":20,"nextCursor":null,"previousCursor":null,"total":1},
				"selectedMessage":null
			}`))
		default:
			t.Fatalf("request URI = %s", r.URL.RequestURI())
		}
	}))
	defer server.Close()
	saveTestAgentCredential(t, server.URL)

	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"inbox"}, nil, strings.NewReader(""), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("code = %d stdout=%s stderr=%s", code, stdout.String(), stderr.String())
	}
	if !strings.Contains(stdout.String(), "1 message(s) in INBOX") || !strings.Contains(stdout.String(), "Hello") {
		t.Fatalf("stdout = %q", stdout.String())
	}
	if strings.Join(seen, "\n") != "/rpc/mail/workspace\n/rpc/mail/workspace?folderId=inbox-1&limit=20" {
		t.Fatalf("seen = %#v", seen)
	}
	if stderr.String() != "" {
		t.Fatalf("stderr = %q", stderr.String())
	}
}

func TestMainSendUsesAgentMailRPCWithoutWildDuckConfig(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	var seen []string
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = append(seen, r.URL.RequestURI())
		_, payload := decodeTestJWT(t, r.Header.Get("Authorization"))
		if payload["aud"] != server.URL || payload["iss"] != "host-1" || payload["sub"] != "agent-1" {
			t.Fatalf("jwt payload = %#v", payload)
		}
		if payload["htu"] != server.URL+r.URL.RequestURI() {
			t.Fatalf("htu = %#v, want %s", payload["htu"], server.URL+r.URL.RequestURI())
		}
		switch r.URL.RequestURI() {
		case "/rpc/mail/workspace":
			_, _ = w.Write([]byte(`{
				"accounts":[{"id":"agent@example.com","address":"agent@example.com","name":"Agent","state":"ready"}],
				"activeAccountId":"agent@example.com",
				"activeFolderId":"inbox-1",
				"folders":[{"id":"inbox-1","name":"Inbox","path":"INBOX","specialUse":"\\Inbox","total":0,"unread":0}],
				"messages":[],
				"pagination":{"limit":25,"nextCursor":null,"previousCursor":null,"total":0},
				"selectedMessage":null
			}`))
		case "/rpc/mail/accounts/" + pathEscape("agent@example.com") + "/messages":
			if r.Method != http.MethodPost {
				t.Fatalf("method = %s", r.Method)
			}
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode body: %v", err)
			}
			if body["to"] != "recipient@example.net" || body["replyTo"] != "replies@example.com" || body["body"] != "Hello" {
				t.Fatalf("body = %#v", body)
			}
			_, _ = w.Write([]byte(`{"success":true}`))
		default:
			t.Fatalf("request URI = %s", r.URL.RequestURI())
		}
	}))
	defer server.Close()
	saveTestAgentCredential(t, server.URL)

	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{
		"send",
		"--json",
		"--to", "recipient@example.net",
		"--reply-to", "replies@example.com",
		"--subject", "Hello",
		"--body", "Hello",
	}, nil, strings.NewReader(""), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("code = %d stdout=%s stderr=%s", code, stdout.String(), stderr.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(stdout.Bytes(), &payload); err != nil {
		t.Fatalf("decode stdout: %v\n%s", err, stdout.String())
	}
	if objectValue(payload["message"])["success"] != true {
		t.Fatalf("payload = %#v", payload)
	}
	if strings.Join(seen, "\n") != "/rpc/mail/workspace\n/rpc/mail/accounts/"+pathEscape("agent@example.com")+"/messages" {
		t.Fatalf("seen = %#v", seen)
	}
	if stderr.String() != "" {
		t.Fatalf("stderr = %q", stderr.String())
	}
}

func TestMainSkillDoesNotRequireConfig(t *testing.T) {
	prevRunUpdateNotice := runUpdateNotice
	runUpdateNotice = func(_ context.Context, currentVersion string) (string, error) {
		t.Fatalf("skill command attempted update notice for %q", currentVersion)
		return "", nil
	}
	defer func() {
		runUpdateNotice = prevRunUpdateNotice
	}()

	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"skill"}, nil, strings.NewReader(""), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("code = %d", code)
	}
	if stdout.String() != atemailskill.Markdown {
		t.Fatalf("stdout did not match embedded skill")
	}
	if stderr.String() != "" {
		t.Fatalf("stderr = %q", stderr.String())
	}
}

func TestMainSkillHelpDoesNotRequireConfig(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"skill", "--help"}, nil, strings.NewReader(""), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("code = %d", code)
	}
	for _, want := range []string{
		commandUsage(commandSkill),
		"at-email skill > at-email-cli/SKILL.md",
		"Pipe stdout to the SKILL.md destination",
	} {
		if !strings.Contains(stdout.String(), want) {
			t.Fatalf("stdout missing %q:\n%s", want, stdout.String())
		}
	}
	if stderr.String() != "" {
		t.Fatalf("stderr = %q", stderr.String())
	}
}

func TestMainVersionDoesNotRequireConfig(t *testing.T) {
	prevVersion := Version
	Version = "1.2.3"
	prevRunUpdateNotice := runUpdateNotice
	runUpdateNotice = func(_ context.Context, currentVersion string) (string, error) {
		t.Fatalf("version command attempted update notice for %q", currentVersion)
		return "", nil
	}
	defer func() {
		Version = prevVersion
		runUpdateNotice = prevRunUpdateNotice
	}()

	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"version"}, nil, strings.NewReader(""), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("code = %d", code)
	}
	if stdout.String() != "1.2.3\n" {
		t.Fatalf("stdout = %q", stdout.String())
	}
	if stderr.String() != "" {
		t.Fatalf("stderr = %q", stderr.String())
	}
}

func TestMainGlobalVersionJSONDoesNotRequireConfig(t *testing.T) {
	prevVersion, prevCommit, prevDate := Version, Commit, Date
	Version = "1.2.3"
	Commit = "abc123"
	Date = "2026-06-20T00:00:00Z"
	defer func() {
		Version = prevVersion
		Commit = prevCommit
		Date = prevDate
	}()

	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"--version", "--json"}, nil, strings.NewReader(""), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("code = %d", code)
	}
	var payload map[string]string
	if err := json.Unmarshal(stdout.Bytes(), &payload); err != nil {
		t.Fatalf("json decode failed: %v", err)
	}
	if payload["version"] != "1.2.3" || payload["commit"] != "abc123" || payload["date"] == "" {
		t.Fatalf("payload = %#v", payload)
	}
	if stderr.String() != "" {
		t.Fatalf("stderr = %q", stderr.String())
	}
}

func TestMainSelfUpdateDoesNotRequireConfig(t *testing.T) {
	prevVersion := Version
	Version = "1.2.2"
	prevRunSelfUpdate := runSelfUpdate
	runSelfUpdate = func(_ context.Context, currentVersion string, targetVersion string) (string, error) {
		if currentVersion != "1.2.2" || targetVersion != "v1.2.3" {
			t.Fatalf("current=%q target=%q", currentVersion, targetVersion)
		}
		return "v1.2.3", nil
	}
	defer func() {
		Version = prevVersion
		runSelfUpdate = prevRunSelfUpdate
	}()

	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"self-update", "v1.2.3"}, nil, strings.NewReader(""), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("code = %d", code)
	}
	if stdout.String() != "Updated at-email to v1.2.3.\n" {
		t.Fatalf("stdout = %q", stdout.String())
	}
	if stderr.String() != "" {
		t.Fatalf("stderr = %q", stderr.String())
	}
}

func TestMainSelfUpdateJSONKeepsStdoutMachineReadable(t *testing.T) {
	prevRunSelfUpdate := runSelfUpdate
	runSelfUpdate = func(_ context.Context, _ string, targetVersion string) (string, error) {
		if targetVersion != "" {
			t.Fatalf("target = %q", targetVersion)
		}
		return "v1.2.3", nil
	}
	defer func() {
		runSelfUpdate = prevRunSelfUpdate
	}()

	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"self-update", "--json"}, nil, strings.NewReader(""), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("code = %d", code)
	}
	var payload map[string]string
	if err := json.Unmarshal(stdout.Bytes(), &payload); err != nil {
		t.Fatalf("json decode failed: %v", err)
	}
	if payload["status"] != "updated" || payload["version"] != "v1.2.3" {
		t.Fatalf("payload = %#v", payload)
	}
	if stderr.String() != "" {
		t.Fatalf("stderr = %q", stderr.String())
	}
}

func TestMainAuthLoginStatusAndLogout(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	prevVersion := Version
	prevOpenBrowser := openBrowser
	prevAuthSleep := authSleep
	Version = "1.2.3"
	var tokenPolls int
	var sleepCalls int
	var openedURL string
	openBrowser = func(target string) error {
		openedURL = target
		return nil
	}
	authSleep = func(ctx context.Context, duration time.Duration) error {
		sleepCalls++
		if sleepCalls == 1 && tokenPolls != 0 {
			t.Fatalf("first sleep happened after %d token polls", tokenPolls)
		}
		if duration != time.Second {
			t.Fatalf("sleep duration = %s, want 1s", duration)
		}
		return nil
	}
	defer func() {
		Version = prevVersion
		openBrowser = prevOpenBrowser
		authSleep = prevAuthSleep
	}()

	var revoked bool
	expectedUserAgent := "at-email/1.2.3 (" + runtime.GOOS + "; " + runtime.GOARCH + ")"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("User-Agent"); got != expectedUserAgent {
			t.Fatalf("user-agent = %q", got)
		}
		switch r.URL.RequestURI() {
		case "/.well-known/at-email.json":
			w.WriteHeader(http.StatusNotFound)
		case "/rpc/auth/api/device/code":
			if r.Method != http.MethodPost {
				t.Fatalf("method = %s", r.Method)
			}
			_, _ = w.Write([]byte(`{"device_code":"device-1","user_code":"ABCD1234","verification_uri":"https://app.example/device","verification_uri_complete":"https://app.example/device?user_code=ABCD1234","expires_in":60,"interval":1}`))
		case "/rpc/auth/api/device/token":
			tokenPolls++
			if tokenPolls == 1 {
				w.WriteHeader(http.StatusBadRequest)
				_, _ = w.Write([]byte(`{"error":"authorization_pending","error_description":"Authorization is pending"}`))
				return
			}
			_, _ = w.Write([]byte(`{"access_token":"session-token-secret","token_type":"Bearer","expires_in":3600,"scope":"openid profile email"}`))
		case "/rpc/auth/api/get-session":
			if r.Header.Get("Authorization") != "Bearer session-token-secret" {
				t.Fatalf("authorization header = %q", r.Header.Get("Authorization"))
			}
			_, _ = w.Write([]byte(`{"session":{"id":"sess-1","expiresAt":"2026-12-19T12:00:00Z","userAgent":"at-email/1.2.3 (linux; amd64)"},"user":{"id":"user-1","email":"agent@example.com","name":"Agent"}}`))
		case "/rpc/auth/api/revoke-session":
			if r.Header.Get("Authorization") != "Bearer session-token-secret" {
				t.Fatalf("authorization header = %q", r.Header.Get("Authorization"))
			}
			var body map[string]string
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode revoke body: %v", err)
			}
			if body["token"] != "session-token-secret" {
				t.Fatalf("revoke token = %q", body["token"])
			}
			revoked = true
			_, _ = w.Write([]byte(`{"status":true}`))
		default:
			t.Fatalf("request URI = %s", r.URL.RequestURI())
		}
	}))
	defer server.Close()

	env := []string{"AT_EMAIL_API_BASE_URL=" + server.URL}
	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"auth", "login"}, env, strings.NewReader(""), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("login code = %d stdout=%s stderr=%s", code, stdout.String(), stderr.String())
	}
	for _, want := range []string{
		"Open: https://app.example/device?user_code=ABCD1234\n\n",
		"Waiting for approval...\n",
		"Logged in.\n",
		"Account: agent@example.com\n",
	} {
		if !strings.Contains(stdout.String(), want) {
			t.Fatalf("login stdout missing %q:\n%s", want, stdout.String())
		}
	}
	if strings.Contains(stdout.String(), "Code:") {
		t.Fatalf("default login stdout exposed device code:\n%s", stdout.String())
	}
	if strings.Contains(stdout.String(), "session-token-secret") {
		t.Fatalf("login stdout exposed token:\n%s", stdout.String())
	}
	if openedURL != "https://app.example/device?user_code=ABCD1234" {
		t.Fatalf("opened URL = %q", openedURL)
	}
	if stderr.String() != "" {
		t.Fatalf("login stderr = %q", stderr.String())
	}
	if sleepCalls < 2 {
		t.Fatalf("sleep calls = %d, want at least 2", sleepCalls)
	}

	stdout.Reset()
	stderr.Reset()
	code = Main(context.Background(), []string{"auth", "status", "--json"}, nil, strings.NewReader(""), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("status code = %d stdout=%s stderr=%s", code, stdout.String(), stderr.String())
	}
	if strings.Contains(stdout.String(), "session-token-secret") {
		t.Fatalf("status stdout exposed token:\n%s", stdout.String())
	}
	var statusPayload map[string]any
	if err := json.Unmarshal(stdout.Bytes(), &statusPayload); err != nil {
		t.Fatalf("decode status json: %v", err)
	}
	if statusPayload["authenticated"] != true {
		t.Fatalf("status payload = %#v", statusPayload)
	}

	stdout.Reset()
	stderr.Reset()
	code = Main(context.Background(), []string{"auth", "logout", "--json"}, nil, strings.NewReader(""), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("logout code = %d stdout=%s stderr=%s", code, stdout.String(), stderr.String())
	}
	if !revoked {
		t.Fatal("remote session was not revoked")
	}
	var logoutPayload map[string]any
	if err := json.Unmarshal(stdout.Bytes(), &logoutPayload); err != nil {
		t.Fatalf("decode logout json: %v", err)
	}
	if logoutPayload["status"] != "logged_out" || logoutPayload["remote_revoked"] != true {
		t.Fatalf("logout payload = %#v", logoutPayload)
	}
}

func TestMainAuthLogoutLeavesAgentCredentialConfigured(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	var revoked bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.RequestURI() {
		case "/rpc/auth/api/revoke-session":
			if r.Header.Get("Authorization") != "Bearer personal-session-token" {
				t.Fatalf("authorization header = %q", r.Header.Get("Authorization"))
			}
			var body map[string]string
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode revoke body: %v", err)
			}
			if body["token"] != "personal-session-token" {
				t.Fatalf("revoke token = %q", body["token"])
			}
			revoked = true
			_, _ = w.Write([]byte(`{"status":true}`))
		default:
			t.Fatalf("auth logout should not call agent endpoints, got %s", r.URL.RequestURI())
		}
	}))
	defer server.Close()

	if err := saveAuthCredential(authCredential{
		AccessToken: "personal-session-token",
		APIBaseURL:  server.URL,
		ClientID:    deviceClientID,
		TokenType:   "Bearer",
	}); err != nil {
		t.Fatalf("save auth credential: %v", err)
	}
	saveTestAgentCredential(t, server.URL)

	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"auth", "logout", "--json"}, nil, strings.NewReader(""), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("logout code = %d stdout=%s stderr=%s", code, stdout.String(), stderr.String())
	}
	if !revoked {
		t.Fatal("remote personal session was not revoked")
	}
	if _, found, err := loadAuthCredential(); err != nil || found {
		t.Fatalf("auth credential found=%v err=%v, want deleted", found, err)
	}
	agentCredential, found, err := loadAgentCredential(defaultAgentProfileName)
	if err != nil || !found {
		t.Fatalf("agent credential found=%v err=%v, want preserved", found, err)
	}
	if agentCredential.AgentID != "agent-1" || agentCredential.HostID != "host-1" {
		t.Fatalf("agent credential changed = %#v", agentCredential)
	}

	var payload map[string]any
	if err := json.Unmarshal(stdout.Bytes(), &payload); err != nil {
		t.Fatalf("decode logout json: %v", err)
	}
	if payload["status"] != "logged_out" || payload["remote_revoked"] != true {
		t.Fatalf("logout payload = %#v", payload)
	}
}

func TestMainAgentDisconnectLeavesPersonalAuthConfigured(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	var revoked bool
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/.well-known/agent-configuration":
			if r.Method != http.MethodGet {
				t.Fatalf("agent configuration method = %s", r.Method)
			}
			writeJSON(t, w, map[string]any{
				"issuer": server.URL,
				"modes":  []string{"delegated", "autonomous"},
			})
		case "/rpc/auth/api/agent/revoke":
			if r.Method != http.MethodPost {
				t.Fatalf("agent revoke method = %s", r.Method)
			}
			if r.Header.Get("Authorization") == "Bearer personal-session-token" {
				t.Fatal("agent disconnect used the personal auth credential")
			}
			header, payload := decodeTestJWT(t, r.Header.Get("Authorization"))
			if header["typ"] != "agent+jwt" || payload["iss"] != "host-1" || payload["sub"] != "agent-1" {
				t.Fatalf("agent revoke jwt header=%#v payload=%#v", header, payload)
			}
			if payload["aud"] != server.URL ||
				payload["htm"] != http.MethodPost ||
				payload["htu"] != server.URL+"/rpc/auth/api/agent/revoke" {
				t.Fatalf("agent revoke request binding payload=%#v", payload)
			}
			var body map[string]string
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode agent revoke body: %v", err)
			}
			if body["agent_id"] != "agent-1" {
				t.Fatalf("agent revoke body = %#v", body)
			}
			revoked = true
			writeJSON(t, w, map[string]any{"status": "revoked"})
		case "/rpc/auth/api/revoke-session":
			t.Fatal("agent disconnect should not call personal session revoke")
		default:
			t.Fatalf("agent disconnect called unexpected path %s", r.URL.RequestURI())
		}
	}))
	defer server.Close()

	if err := saveAuthCredential(authCredential{
		AccessToken: "personal-session-token",
		APIBaseURL:  server.URL,
		ClientID:    deviceClientID,
		TokenType:   "Bearer",
	}); err != nil {
		t.Fatalf("save auth credential: %v", err)
	}
	saveTestAgentCredential(t, server.URL)

	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"agent", "disconnect", "--json"}, nil, strings.NewReader(""), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("disconnect code = %d stdout=%s stderr=%s", code, stdout.String(), stderr.String())
	}
	if !revoked {
		t.Fatal("remote agent was not revoked")
	}
	if _, found, err := loadAgentCredential(defaultAgentProfileName); err != nil || found {
		t.Fatalf("agent credential found=%v err=%v, want deleted", found, err)
	}
	authCredential, found, err := loadAuthCredential()
	if err != nil || !found {
		t.Fatalf("auth credential found=%v err=%v, want preserved", found, err)
	}
	if authCredential.AccessToken != "personal-session-token" || authCredential.APIBaseURL != server.URL {
		t.Fatalf("auth credential changed = %#v", authCredential)
	}

	var payload map[string]any
	if err := json.Unmarshal(stdout.Bytes(), &payload); err != nil {
		t.Fatalf("decode disconnect json: %v", err)
	}
	if payload["status"] != "revoked" || payload["remote_revoked"] != true || payload["agent_id"] != "agent-1" {
		t.Fatalf("disconnect payload = %#v", payload)
	}
}

func TestMainAuthLoginUsesDiscoveryAndExplicitOpen(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	prevVersion := Version
	prevOpenBrowser := openBrowser
	prevAuthSleep := authSleep
	Version = "1.2.3"
	var openedURL string
	openBrowser = func(target string) error {
		openedURL = target
		return nil
	}
	authSleep = func(ctx context.Context, duration time.Duration) error {
		return nil
	}
	defer func() {
		Version = prevVersion
		openBrowser = prevOpenBrowser
		authSleep = prevAuthSleep
	}()

	expectedUserAgent := "at-email/1.2.3 (" + runtime.GOOS + "; " + runtime.GOARCH + ")"
	apiServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("User-Agent"); got != expectedUserAgent {
			t.Fatalf("api user-agent = %q", got)
		}
		switch r.URL.RequestURI() {
		case "/rpc/auth/api/device/code":
			if r.Method != http.MethodPost {
				t.Fatalf("method = %s", r.Method)
			}
			_, _ = w.Write([]byte(`{"device_code":"device-2","user_code":"EFGH5678","verification_uri":"https://api.example/device","verification_uri_complete":"https://api.example/device?user_code=EFGH5678","expires_in":60,"interval":0}`))
		case "/rpc/auth/api/device/token":
			_, _ = w.Write([]byte(`{"access_token":"discovered-session-token","token_type":"Bearer","expires_in":3600,"scope":"openid profile email"}`))
		case "/rpc/auth/api/get-session":
			if r.Header.Get("Authorization") != "Bearer discovered-session-token" {
				t.Fatalf("authorization header = %q", r.Header.Get("Authorization"))
			}
			_, _ = w.Write([]byte(`{"session":{"id":"sess-2","expiresAt":"2026-12-19T12:00:00Z"},"user":{"id":"user-2","email":"agent@example.com"}}`))
		default:
			t.Fatalf("api request URI = %s", r.URL.RequestURI())
		}
	}))
	defer apiServer.Close()

	discoveryServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("User-Agent"); got != expectedUserAgent {
			t.Fatalf("discovery user-agent = %q", got)
		}
		if r.URL.RequestURI() != "/.well-known/at-email.json" {
			t.Fatalf("discovery request URI = %s", r.URL.RequestURI())
		}
		_, _ = w.Write([]byte(`{"apiBase":` + strconv.Quote(apiServer.URL) + `,"authBase":"https://auth.example"}`))
	}))
	defer discoveryServer.Close()

	env := []string{"AT_EMAIL_API_BASE_URL=" + discoveryServer.URL}
	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"auth", "login", "--open"}, env, strings.NewReader(""), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("login code = %d stdout=%s stderr=%s", code, stdout.String(), stderr.String())
	}
	if openedURL != "https://auth.example/device?user_code=EFGH5678" {
		t.Fatalf("opened URL = %q", openedURL)
	}
	for _, want := range []string{
		"Starting at-email login with " + apiServer.URL + "...\n\n",
		"Open: https://auth.example/device?user_code=EFGH5678\n\n",
		"Logged in.\n",
	} {
		if !strings.Contains(stdout.String(), want) {
			t.Fatalf("login stdout missing %q:\n%s", want, stdout.String())
		}
	}
	if strings.Contains(stdout.String(), "Code:") {
		t.Fatalf("default login stdout exposed device code:\n%s", stdout.String())
	}
	if strings.Contains(stdout.String(), "discovered-session-token") {
		t.Fatalf("login stdout exposed token:\n%s", stdout.String())
	}
	if stderr.String() != "" {
		t.Fatalf("login stderr = %q", stderr.String())
	}
}

func TestMainAuthLoginDeviceModePrintsCodeWithoutOpeningBrowser(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	prevVersion := Version
	prevOpenBrowser := openBrowser
	prevAuthSleep := authSleep
	Version = "1.2.3"
	var openedURL string
	openBrowser = func(target string) error {
		openedURL = target
		return nil
	}
	authSleep = func(ctx context.Context, duration time.Duration) error {
		return nil
	}
	defer func() {
		Version = prevVersion
		openBrowser = prevOpenBrowser
		authSleep = prevAuthSleep
	}()

	expectedUserAgent := "at-email/1.2.3 (" + runtime.GOOS + "; " + runtime.GOARCH + ")"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("User-Agent"); got != expectedUserAgent {
			t.Fatalf("user-agent = %q", got)
		}
		switch r.URL.RequestURI() {
		case "/.well-known/at-email.json":
			w.WriteHeader(http.StatusNotFound)
		case "/rpc/auth/api/device/code":
			if r.Method != http.MethodPost {
				t.Fatalf("method = %s", r.Method)
			}
			_, _ = w.Write([]byte(`{"device_code":"device-3","user_code":"IJKL9012","verification_uri":"https://app.example/device","verification_uri_complete":"https://app.example/device?user_code=IJKL9012","expires_in":60,"interval":0}`))
		case "/rpc/auth/api/device/token":
			_, _ = w.Write([]byte(`{"access_token":"device-session-token","token_type":"Bearer","expires_in":3600,"scope":"openid profile email"}`))
		case "/rpc/auth/api/get-session":
			if r.Header.Get("Authorization") != "Bearer device-session-token" {
				t.Fatalf("authorization header = %q", r.Header.Get("Authorization"))
			}
			_, _ = w.Write([]byte(`{"session":{"id":"sess-3","expiresAt":"2026-12-19T12:00:00Z"},"user":{"id":"user-3","email":"agent@example.com"}}`))
		default:
			t.Fatalf("request URI = %s", r.URL.RequestURI())
		}
	}))
	defer server.Close()

	var stdout, stderr bytes.Buffer
	code := Main(
		context.Background(),
		[]string{"auth", "login", "--device"},
		[]string{"AT_EMAIL_API_BASE_URL=" + server.URL},
		strings.NewReader(""),
		&stdout,
		&stderr,
	)
	if code != 0 {
		t.Fatalf("login code = %d stdout=%s stderr=%s", code, stdout.String(), stderr.String())
	}
	for _, want := range []string{
		"Open: https://app.example/device\n\n",
		"Code: IJKL-9012\n\n",
		"Waiting for approval...\n",
		"Logged in.\n",
	} {
		if !strings.Contains(stdout.String(), want) {
			t.Fatalf("login stdout missing %q:\n%s", want, stdout.String())
		}
	}
	if openedURL != "" {
		t.Fatalf("device login opened URL = %q", openedURL)
	}
	if strings.Contains(stdout.String(), "device-session-token") {
		t.Fatalf("login stdout exposed token:\n%s", stdout.String())
	}
	if stderr.String() != "" {
		t.Fatalf("login stderr = %q", stderr.String())
	}
}

func TestMainAuthLoginJSONPrintsPendingApprovalToStderr(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	prevOpenBrowser := openBrowser
	prevAuthSleep := authSleep
	var openedURL string
	openBrowser = func(target string) error {
		openedURL = target
		return nil
	}
	authSleep = func(ctx context.Context, duration time.Duration) error {
		return nil
	}
	defer func() {
		openBrowser = prevOpenBrowser
		authSleep = prevAuthSleep
	}()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.RequestURI() {
		case "/.well-known/at-email.json":
			w.WriteHeader(http.StatusNotFound)
		case "/rpc/auth/api/device/code":
			if r.Method != http.MethodPost {
				t.Fatalf("method = %s", r.Method)
			}
			_, _ = w.Write([]byte(`{"device_code":"device-json-secret","user_code":"MNOP3456","verification_uri":"https://app.example/device","verification_uri_complete":"https://app.example/device?user_code=MNOP3456","expires_in":60,"interval":0}`))
		case "/rpc/auth/api/device/token":
			_, _ = w.Write([]byte(`{"access_token":"json-session-token","token_type":"Bearer","expires_in":3600,"scope":"openid profile email"}`))
		case "/rpc/auth/api/get-session":
			if r.Header.Get("Authorization") != "Bearer json-session-token" {
				t.Fatalf("authorization header = %q", r.Header.Get("Authorization"))
			}
			_, _ = w.Write([]byte(`{"session":{"id":"sess-json","expiresAt":"2026-12-19T12:00:00Z"},"user":{"id":"user-json","email":"agent@example.com"}}`))
		default:
			t.Fatalf("request URI = %s", r.URL.RequestURI())
		}
	}))
	defer server.Close()

	var stdout, stderr bytes.Buffer
	code := Main(
		context.Background(),
		[]string{"auth", "login", "--json"},
		[]string{"AT_EMAIL_API_BASE_URL=" + server.URL},
		strings.NewReader(""),
		&stdout,
		&stderr,
	)
	if code != 0 {
		t.Fatalf("login code = %d stdout=%s stderr=%s", code, stdout.String(), stderr.String())
	}
	if openedURL != "" {
		t.Fatalf("json login opened URL = %q", openedURL)
	}
	var loginPayload map[string]any
	if err := json.Unmarshal(stdout.Bytes(), &loginPayload); err != nil {
		t.Fatalf("decode login json: %v", err)
	}
	if loginPayload["authenticated"] != true {
		t.Fatalf("login payload = %#v", loginPayload)
	}
	pending, err := decodeJSONObject(stderr.Bytes())
	if err != nil {
		t.Fatalf("decode pending approval json: %v", err)
	}
	if pending["event"] != "browser_authorization_pending" ||
		pending["operation"] != "auth_login" ||
		pending["verification_uri_complete"] != "https://app.example/device?user_code=MNOP3456" {
		t.Fatalf("pending approval event = %#v", pending)
	}
	if _, ok := pending["user_code"]; ok {
		t.Fatalf("default browser login exposed device user_code: %#v", pending)
	}
	if _, ok := pending["formatted_user_code"]; ok {
		t.Fatalf("default browser login exposed formatted_user_code: %#v", pending)
	}
	for _, secret := range []string{"device-json-secret", "json-session-token"} {
		if strings.Contains(stdout.String(), secret) || strings.Contains(stderr.String(), secret) {
			t.Fatalf("json login output exposed %q stdout=%s stderr=%s", secret, stdout.String(), stderr.String())
		}
	}
}

func TestMainAuthLoginDeviceJSONPrintsDeviceApprovalToStderr(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	prevAuthSleep := authSleep
	authSleep = func(ctx context.Context, duration time.Duration) error {
		return nil
	}
	defer func() {
		authSleep = prevAuthSleep
	}()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.RequestURI() {
		case "/.well-known/at-email.json":
			w.WriteHeader(http.StatusNotFound)
		case "/rpc/auth/api/device/code":
			if r.Method != http.MethodPost {
				t.Fatalf("method = %s", r.Method)
			}
			_, _ = w.Write([]byte(`{"device_code":"device-json-secret","user_code":"QRST7890","verification_uri":"https://app.example/device","verification_uri_complete":"https://app.example/device?user_code=QRST7890","expires_in":60,"interval":0}`))
		case "/rpc/auth/api/device/token":
			_, _ = w.Write([]byte(`{"access_token":"device-json-session-token","token_type":"Bearer","expires_in":3600,"scope":"openid profile email"}`))
		case "/rpc/auth/api/get-session":
			if r.Header.Get("Authorization") != "Bearer device-json-session-token" {
				t.Fatalf("authorization header = %q", r.Header.Get("Authorization"))
			}
			_, _ = w.Write([]byte(`{"session":{"id":"sess-device-json","expiresAt":"2026-12-19T12:00:00Z"},"user":{"id":"user-device-json","email":"agent@example.com"}}`))
		default:
			t.Fatalf("request URI = %s", r.URL.RequestURI())
		}
	}))
	defer server.Close()

	var stdout, stderr bytes.Buffer
	code := Main(
		context.Background(),
		[]string{"auth", "login", "--json", "--device"},
		[]string{"AT_EMAIL_API_BASE_URL=" + server.URL},
		strings.NewReader(""),
		&stdout,
		&stderr,
	)
	if code != 0 {
		t.Fatalf("login code = %d stdout=%s stderr=%s", code, stdout.String(), stderr.String())
	}
	var loginPayload map[string]any
	if err := json.Unmarshal(stdout.Bytes(), &loginPayload); err != nil {
		t.Fatalf("decode login json: %v", err)
	}
	if loginPayload["authenticated"] != true {
		t.Fatalf("login payload = %#v", loginPayload)
	}
	pending, err := decodeJSONObject(stderr.Bytes())
	if err != nil {
		t.Fatalf("decode pending approval json: %v", err)
	}
	if pending["event"] != "device_authorization_pending" ||
		pending["operation"] != "auth_login" ||
		pending["user_code"] != "QRST7890" ||
		pending["formatted_user_code"] != "QRST-7890" ||
		pending["verification_uri"] != "https://app.example/device" ||
		pending["verification_uri_complete"] != "https://app.example/device" {
		t.Fatalf("pending approval event = %#v", pending)
	}
	for _, secret := range []string{"device-json-secret", "device-json-session-token"} {
		if strings.Contains(stdout.String(), secret) || strings.Contains(stderr.String(), secret) {
			t.Fatalf("json login output exposed %q stdout=%s stderr=%s", secret, stdout.String(), stderr.String())
		}
	}
}

func TestMainAuthLoginErrorDoesNotEchoServerSecretText(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.RequestURI() {
		case "/.well-known/at-email.json":
			w.WriteHeader(http.StatusNotFound)
		case "/rpc/auth/api/device/code":
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error":"access_denied","error_description":"server secret session-token-secret should not be printed"}`))
		default:
			t.Fatalf("request URI = %s", r.URL.RequestURI())
		}
	}))
	defer server.Close()

	var stdout, stderr bytes.Buffer
	code := Main(
		context.Background(),
		[]string{"auth", "login", "--json", "--api-base-url", server.URL},
		nil,
		strings.NewReader(""),
		&stdout,
		&stderr,
	)
	if code != 1 {
		t.Fatalf("code = %d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
	if stdout.String() != "" {
		t.Fatalf("stdout = %q", stdout.String())
	}
	if !strings.Contains(stderr.String(), "AgentTeam Email auth failed (access_denied)") {
		t.Fatalf("stderr = %q", stderr.String())
	}
	if strings.Contains(stderr.String(), "session-token-secret") || strings.Contains(stderr.String(), "server secret") {
		t.Fatalf("stderr exposed server-provided secret text: %s", stderr.String())
	}
}

func TestMainTextCommandWritesUpdateNotice(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.RequestURI() != "/rpc/mail/workspace" {
			t.Fatalf("request URI = %s", r.URL.RequestURI())
		}
		_, _ = w.Write([]byte(`{
			"accounts":[{"id":"agent@example.com","address":"agent@example.com","name":"Agent","state":"ready"}],
			"activeAccountId":"agent@example.com",
			"activeFolderId":"inbox-1",
			"folders":[{"id":"inbox-1","name":"Inbox","path":"INBOX","total":2,"unread":1}],
			"messages":[],
			"pagination":{"limit":25,"nextCursor":null,"previousCursor":null,"total":0},
			"selectedMessage":null
		}`))
	}))
	defer server.Close()
	saveTestAgentCredential(t, server.URL)

	prevVersion := Version
	Version = "1.2.2"
	prevRunUpdateNotice := runUpdateNotice
	runUpdateNotice = func(_ context.Context, currentVersion string) (string, error) {
		if currentVersion != "1.2.2" {
			t.Fatalf("currentVersion = %q", currentVersion)
		}
		return "update available: v1.2.3 -> run `at-email self-update`", nil
	}
	defer func() {
		Version = prevVersion
		runUpdateNotice = prevRunUpdateNotice
	}()

	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"status"}, nil, strings.NewReader(""), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("code = %d stdout=%s stderr=%s", code, stdout.String(), stderr.String())
	}
	if !strings.Contains(stdout.String(), "User: agent-1\n") {
		t.Fatalf("stdout = %q", stdout.String())
	}
	wantErr := "update available: v1.2.3 -> run `at-email self-update`\n"
	if stderr.String() != wantErr {
		t.Fatalf("stderr = %q, want %q", stderr.String(), wantErr)
	}
}

func TestMainJSONCommandSuppressesUpdateNotice(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.RequestURI() != "/rpc/mail/workspace" {
			t.Fatalf("request URI = %s", r.URL.RequestURI())
		}
		_, _ = w.Write([]byte(`{
			"accounts":[{"id":"agent@example.com","address":"agent@example.com","name":"Agent","state":"ready"}],
			"activeAccountId":"agent@example.com",
			"activeFolderId":"inbox-1",
			"folders":[{"id":"inbox-1","name":"Inbox","path":"INBOX","total":2,"unread":1}],
			"messages":[],
			"pagination":{"limit":25,"nextCursor":null,"previousCursor":null,"total":0},
			"selectedMessage":null
		}`))
	}))
	defer server.Close()
	saveTestAgentCredential(t, server.URL)

	prevVersion := Version
	Version = "1.2.2"
	prevRunUpdateNotice := runUpdateNotice
	called := false
	runUpdateNotice = func(_ context.Context, _ string) (string, error) {
		called = true
		return "update available: v1.2.3 -> run `at-email self-update`", nil
	}
	defer func() {
		Version = prevVersion
		runUpdateNotice = prevRunUpdateNotice
	}()

	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"status", "--json"}, nil, strings.NewReader(""), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("code = %d stdout=%s stderr=%s", code, stdout.String(), stderr.String())
	}
	if called {
		t.Fatalf("JSON command attempted update notice")
	}
	if stderr.String() != "" {
		t.Fatalf("stderr = %q", stderr.String())
	}
}

func TestMainMissingSendBodyIsUsageBeforeConfig(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{
		"send",
		"--to", "alice@example.com",
		"--subject", "Hello",
	}, nil, strings.NewReader(""), &stdout, &stderr)
	if code != 2 {
		t.Fatalf("code = %d", code)
	}
	wantOut := "error: missing message body; use --body, --body-file, or pipe stdin\nusage: at-email send [-h] [--json] --to TO [--cc CC] [--bcc BCC] [--reply-to REPLY_TO] --subject SUBJECT [--body BODY | --body-file PATH]\nhint: run `at-email send --help`\n"
	if stdout.String() != wantOut {
		t.Fatalf("stdout = %q, want %q", stdout.String(), wantOut)
	}
	if stderr.String() != "" {
		t.Fatalf("stderr = %q", stderr.String())
	}
}

func TestMainJSONMissingSendBodyKeepsStdoutClean(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{
		"send",
		"--json",
		"--to", "alice@example.com",
		"--subject", "Hello",
	}, nil, strings.NewReader(""), &stdout, &stderr)
	if code != 2 {
		t.Fatalf("code = %d", code)
	}
	if stdout.String() != "" {
		t.Fatalf("stdout = %q", stdout.String())
	}
	wantErr := "error: missing message body; use --body, --body-file, or pipe stdin\nusage: at-email send [-h] [--json] --to TO [--cc CC] [--bcc BCC] [--reply-to REPLY_TO] --subject SUBJECT [--body BODY | --body-file PATH]\nhint: run `at-email send --help`\n"
	if stderr.String() != wantErr {
		t.Fatalf("stderr = %q, want %q", stderr.String(), wantErr)
	}
}

func TestMainSendBodyConflictIsUsageBeforeConfig(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{
		"send",
		"--to", "alice@example.com",
		"--subject", "Hello",
		"--body", "Body",
		"--body-file", "missing.txt",
	}, nil, strings.NewReader(""), &stdout, &stderr)
	if code != 2 {
		t.Fatalf("code = %d", code)
	}
	if !strings.Contains(stdout.String(), "error: use either --body or --body-file, not both\n") {
		t.Fatalf("stdout = %q", stdout.String())
	}
	if !strings.Contains(stdout.String(), commandUsage(commandSend)) {
		t.Fatalf("stdout = %q", stdout.String())
	}
	if stderr.String() != "" {
		t.Fatalf("stderr = %q", stderr.String())
	}
}

func TestMainMissingReplyBodyIsUsageBeforeConfig(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"reply", "7"}, nil, strings.NewReader(""), &stdout, &stderr)
	if code != 2 {
		t.Fatalf("code = %d", code)
	}
	if !strings.Contains(stdout.String(), "error: missing message body; use --body, --body-file, or pipe stdin\n") {
		t.Fatalf("stdout = %q", stdout.String())
	}
	if !strings.Contains(stdout.String(), commandUsage(commandReply)) {
		t.Fatalf("stdout = %q", stdout.String())
	}
	if stderr.String() != "" {
		t.Fatalf("stderr = %q", stderr.String())
	}
}

func TestMainMailboxCommandRequiresAgentCredential(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"status"}, nil, strings.NewReader(""), &stdout, &stderr)
	if code != 78 {
		t.Fatalf("code = %d", code)
	}
	wantOut := "error: missing local Agent Auth credential; run `at-email agent connect`, `at-email agent trial`, or `at-email agent enroll TOKEN` before using mailbox commands\nhint: mailbox commands use the webserver Agent Auth boundary; personal auth sessions and WildDuck environment variables are not accepted.\n"
	if stdout.String() != wantOut {
		t.Fatalf("stdout = %q, want %q", stdout.String(), wantOut)
	}
	if stderr.String() != "" {
		t.Fatalf("stderr = %q", stderr.String())
	}
}

func TestMainMailboxCommandIgnoresWildDuckRuntimeEnvWithoutAgentCredential(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	var (
		mu       sync.Mutex
		requests []string
	)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		requests = append(requests, r.URL.RequestURI())
		mu.Unlock()
		t.Fatalf("WildDuck server should not receive request %s", r.URL.RequestURI())
	}))
	defer server.Close()

	env := []string{
		"AT_EMAIL_WILDDUCK_API_BASE_URL=" + server.URL,
		"AT_EMAIL_WILDDUCK_ACCESS_TOKEN=token-1",
		"AT_EMAIL_WILDDUCK_USER_ID=user-1",
	}
	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"status"}, env, strings.NewReader(""), &stdout, &stderr)
	if code != 78 {
		t.Fatalf("code = %d", code)
	}
	if !strings.Contains(stdout.String(), "missing local Agent Auth credential") {
		t.Fatalf("stdout = %q", stdout.String())
	}
	mu.Lock()
	gotRequests := append([]string(nil), requests...)
	mu.Unlock()
	if len(gotRequests) != 0 {
		t.Fatalf("requests = %#v, want none", gotRequests)
	}
	if stderr.String() != "" {
		t.Fatalf("stderr = %q", stderr.String())
	}
}

func TestMainAgentMailTransportFailureUsesServiceUnavailableExit(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("closed server should not receive requests")
	}))
	baseURL := server.URL
	server.Close()
	saveTestAgentCredential(t, baseURL)

	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"status"}, nil, strings.NewReader(""), &stdout, &stderr)
	if code != 69 {
		t.Fatalf("code = %d", code)
	}
	wantOut := "error: AgentTeam Email service unavailable while sending GET request\n"
	if stdout.String() != wantOut {
		t.Fatalf("stdout = %q, want %q", stdout.String(), wantOut)
	}
	if strings.Contains(stdout.String(), baseURL) || strings.Contains(stdout.String(), "connect:") {
		t.Fatalf("stdout exposed transport detail: %q", stdout.String())
	}
	if stderr.String() != "" {
		t.Fatalf("stderr = %q", stderr.String())
	}
}

func TestMainAgentMailJSONTransportFailureKeepsStdoutClean(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("closed server should not receive requests")
	}))
	baseURL := server.URL
	server.Close()
	saveTestAgentCredential(t, baseURL)

	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"status", "--json"}, nil, strings.NewReader(""), &stdout, &stderr)
	if code != 69 {
		t.Fatalf("code = %d", code)
	}
	if stdout.String() != "" {
		t.Fatalf("stdout = %q", stdout.String())
	}
	wantErr := "error: AgentTeam Email service unavailable while sending GET request\n"
	if stderr.String() != wantErr {
		t.Fatalf("stderr = %q, want %q", stderr.String(), wantErr)
	}
	if strings.Contains(stderr.String(), baseURL) || strings.Contains(stderr.String(), "connect:") {
		t.Fatalf("stderr exposed transport detail: %q", stderr.String())
	}
}

func TestMainStatusJSON(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.RequestURI() != "/rpc/mail/workspace?accountId=agent%40example.com" {
			t.Fatalf("request URI = %s", r.URL.RequestURI())
		}
		_, _ = w.Write([]byte(`{
			"accounts":[{"id":"agent@example.com","address":"agent@example.com","name":"Agent","state":"ready"}],
			"activeAccountId":"agent@example.com",
			"activeFolderId":"inbox-1",
			"folders":[{"id":"inbox-1","name":"Inbox","path":"INBOX","total":2,"unread":1}],
			"messages":[],
			"pagination":{"limit":25,"nextCursor":null,"previousCursor":null,"total":0},
			"selectedMessage":null
		}`))
	}))
	defer server.Close()
	saveTestAgentCredential(t, server.URL)

	var stdout, stderr bytes.Buffer
	code := Main(
		context.Background(),
		[]string{"status", "--json"},
		[]string{"AT_EMAIL_MAILBOX_ADDRESS=agent@example.com"},
		strings.NewReader(""),
		&stdout,
		&stderr,
	)
	if code != 0 {
		t.Fatalf("code = %d stderr=%s", code, stderr.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(stdout.Bytes(), &payload); err != nil {
		t.Fatalf("decode stdout: %v\n%s", err, stdout.String())
	}
	if payload["user_id"] != "agent-1" || payload["mailbox_address"] != "agent@example.com" {
		t.Fatalf("payload = %#v", payload)
	}
}

func TestMainInboxUnseenEmptyStateUsesUnreadCopy(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.RequestURI() {
		case "/rpc/mail/workspace":
			_, _ = w.Write([]byte(`{
				"accounts":[{"id":"agent@example.com","address":"agent@example.com","name":"Agent","state":"ready"}],
				"activeAccountId":"agent@example.com",
				"activeFolderId":"inbox-1",
				"folders":[{"id":"inbox-1","name":"Inbox","path":"INBOX","specialUse":"\\Inbox","total":0,"unread":0}],
				"messages":[],
				"pagination":{"limit":25,"nextCursor":null,"previousCursor":null,"total":0},
				"selectedMessage":null
			}`))
		case "/rpc/mail/workspace?folderId=inbox-1&limit=20&unreadOnly=true":
			_, _ = w.Write([]byte(`{
				"accounts":[{"id":"agent@example.com","address":"agent@example.com","name":"Agent","state":"ready"}],
				"activeAccountId":"agent@example.com",
				"activeFolderId":"inbox-1",
				"folders":[{"id":"inbox-1","name":"Inbox","path":"INBOX","specialUse":"\\Inbox","total":0,"unread":0}],
				"messages":[],
				"pagination":{"limit":20,"nextCursor":null,"previousCursor":null,"total":0},
				"selectedMessage":null
			}`))
		default:
			t.Fatalf("request URI = %s", r.URL.RequestURI())
		}
	}))
	defer server.Close()
	saveTestAgentCredential(t, server.URL)

	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"inbox", "--unseen"}, nil, strings.NewReader(""), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("code = %d stderr=%s", code, stderr.String())
	}
	want := "No unread in INBOX.\n"
	if stdout.String() != want {
		t.Fatalf("stdout = %q, want %q", stdout.String(), want)
	}
	if stderr.String() != "" {
		t.Fatalf("stderr = %q", stderr.String())
	}
}

func TestMainInboxJSONMissingResultsSerializesEmptyArray(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.RequestURI() {
		case "/rpc/mail/workspace":
			_, _ = w.Write([]byte(`{
				"accounts":[{"id":"agent@example.com","address":"agent@example.com","name":"Agent","state":"ready"}],
				"activeAccountId":"agent@example.com",
				"activeFolderId":"inbox-1",
				"folders":[{"id":"inbox-1","name":"Inbox","path":"INBOX","specialUse":"\\Inbox"}],
				"messages":[],
				"pagination":{"limit":25,"nextCursor":null,"previousCursor":null,"total":0},
				"selectedMessage":null
			}`))
		case "/rpc/mail/workspace?folderId=inbox-1&limit=20":
			_, _ = w.Write([]byte(`{
				"accounts":[{"id":"agent@example.com","address":"agent@example.com","name":"Agent","state":"ready"}],
				"activeAccountId":"agent@example.com",
				"activeFolderId":"inbox-1",
				"folders":[{"id":"inbox-1","name":"Inbox","path":"INBOX","specialUse":"\\Inbox"}],
				"pagination":{"limit":20,"nextCursor":null,"previousCursor":null,"total":0},
				"selectedMessage":null
			}`))
		default:
			t.Fatalf("request URI = %s", r.URL.RequestURI())
		}
	}))
	defer server.Close()
	saveTestAgentCredential(t, server.URL)

	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"inbox", "--json"}, nil, strings.NewReader(""), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("code = %d stderr=%s", code, stderr.String())
	}
	var payload struct {
		Messages []map[string]any `json:"messages"`
	}
	if err := json.Unmarshal(stdout.Bytes(), &payload); err != nil {
		t.Fatalf("decode stdout: %v\n%s", err, stdout.String())
	}
	if payload.Messages == nil || len(payload.Messages) != 0 {
		t.Fatalf("messages = %#v, want non-nil empty slice", payload.Messages)
	}
}

func TestMainStatusJSONProtocolErrorKeepsStdoutClean(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`[]`))
	}))
	defer server.Close()
	saveTestAgentCredential(t, server.URL)

	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"status", "--json"}, nil, strings.NewReader(""), &stdout, &stderr)
	if code != 70 {
		t.Fatalf("code = %d", code)
	}
	if stdout.String() != "" {
		t.Fatalf("stdout = %q", stdout.String())
	}
	wantErr := "error: AgentTeam Email GET /rpc/mail/workspace returned malformed service response: expected JSON object\n"
	if stderr.String() != wantErr {
		t.Fatalf("stderr = %q, want %q", stderr.String(), wantErr)
	}
}

func TestMainSendUsesBodyAndRendersSubmitResponse(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.RequestURI() {
		case "/rpc/mail/workspace":
			_, _ = w.Write([]byte(`{
				"accounts":[{"id":"agent@example.com","address":"agent@example.com","name":"Agent","state":"ready"}],
				"activeAccountId":"agent@example.com",
				"activeFolderId":"inbox-1",
				"folders":[{"id":"inbox-1","name":"Inbox","path":"INBOX"}],
				"messages":[],
				"pagination":{"limit":25,"nextCursor":null,"previousCursor":null,"total":0},
				"selectedMessage":null
			}`))
		case "/rpc/mail/accounts/" + pathEscape("agent@example.com") + "/messages":
			var payload map[string]any
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				t.Fatalf("decode request: %v", err)
			}
			if payload["body"] != "Body" || payload["subject"] != "Hello" {
				t.Fatalf("payload = %#v", payload)
			}
			_, _ = w.Write([]byte(`{"mailbox":"sent","id":9,"queueId":"queue-1"}`))
		default:
			t.Fatalf("request URI = %s", r.URL.RequestURI())
		}
	}))
	defer server.Close()
	saveTestAgentCredential(t, server.URL)

	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{
		"send",
		"--to", "alice@example.com",
		"--subject", "Hello",
		"--body", "Body",
	}, nil, strings.NewReader(""), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("code = %d stderr=%s", code, stderr.String())
	}
	want := "Sent message.\nMailbox: sent\nMessage: 9\nQueue: queue-1\n"
	if stdout.String() != want {
		t.Fatalf("stdout = %q, want %q", stdout.String(), want)
	}
}

func TestMainSendAllowsExplicitEmptySubject(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.RequestURI() {
		case "/rpc/mail/workspace":
			_, _ = w.Write([]byte(`{
				"accounts":[{"id":"agent@example.com","address":"agent@example.com","name":"Agent","state":"ready"}],
				"activeAccountId":"agent@example.com",
				"activeFolderId":"inbox-1",
				"folders":[{"id":"inbox-1","name":"Inbox","path":"INBOX"}],
				"messages":[],
				"pagination":{"limit":25,"nextCursor":null,"previousCursor":null,"total":0},
				"selectedMessage":null
			}`))
		case "/rpc/mail/accounts/" + pathEscape("agent@example.com") + "/messages":
			var payload map[string]any
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				t.Fatalf("decode request: %v", err)
			}
			if subject, ok := payload["subject"].(string); !ok || subject != "" {
				t.Fatalf("subject = %#v", payload["subject"])
			}
			_, _ = w.Write([]byte(`{"success":true}`))
		default:
			t.Fatalf("request URI = %s", r.URL.RequestURI())
		}
	}))
	defer server.Close()
	saveTestAgentCredential(t, server.URL)

	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{
		"send",
		"--to", "alice@example.com",
		"--subject=",
		"--body", "Body",
	}, nil, strings.NewReader(""), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("code = %d stderr=%s", code, stderr.String())
	}
	if !strings.Contains(stdout.String(), "Sent message.") {
		t.Fatalf("stdout = %q", stdout.String())
	}
}

func TestMainPaperclipToolMissingCredentialReturnsToolError(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	input := `{
		"schema":"agentteam-email.paperclip-tool.v1",
		"operation":"status",
		"context":{
			"companyId":"company-1",
			"agentId":"paperclip-agent-1",
			"projectId":"project-1",
			"runId":"run-1",
			"pluginId":"agentteam.paperclip-email-plugin"
		},
		"parameters":{}
	}`
	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"paperclip-tool", "--json"}, nil, strings.NewReader(input), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("code = %d stderr=%s", code, stderr.String())
	}
	if stderr.String() != "" {
		t.Fatalf("stderr = %q", stderr.String())
	}
	var result paperclipToolResult
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		t.Fatalf("decode stdout: %v\n%s", err, stdout.String())
	}
	if result.Ok || !strings.Contains(result.Error, "missing local Agent Auth credential") {
		t.Fatalf("result = %#v", result)
	}
}

func TestDecodePaperclipToolEnvelopeRejectsUnsupportedOperation(t *testing.T) {
	input := `{
		"schema":"agentteam-email.paperclip-tool.v1",
		"operation":"delete",
		"context":{
			"companyId":"company-1",
			"agentId":"paperclip-agent-1",
			"projectId":"project-1",
			"runId":"run-1",
			"pluginId":"agentteam.paperclip-email-plugin"
		},
		"parameters":{}
	}`

	_, err := decodePaperclipToolEnvelope(strings.NewReader(input))
	if err == nil || !strings.Contains(err.Error(), "unsupported operation delete") {
		t.Fatalf("err = %v", err)
	}
}

func TestDecodePaperclipToolEnvelopeRejectsUnexpectedPluginID(t *testing.T) {
	input := `{
		"schema":"agentteam-email.paperclip-tool.v1",
		"operation":"status",
		"context":{
			"companyId":"company-1",
			"agentId":"paperclip-agent-1",
			"projectId":"project-1",
			"runId":"run-1",
			"pluginId":"unexpected.paperclip-plugin"
		},
		"parameters":{}
	}`

	_, err := decodePaperclipToolEnvelope(strings.NewReader(input))
	if err == nil || !strings.Contains(err.Error(), "context.pluginId must be agentteam.paperclip-email-plugin") {
		t.Fatalf("err = %v", err)
	}
}

func TestDecodePaperclipToolEnvelopeRejectsUnsafeContextValues(t *testing.T) {
	input := `{
		"schema":"agentteam-email.paperclip-tool.v1",
		"operation":"status",
		"context":{
			"companyId":"company-1",
			"agentId":"paperclip-agent-1",
			"projectId":"project-1",
			"runId":"Bearer raw-secret",
			"pluginId":"agentteam.paperclip-email-plugin"
		},
		"parameters":{}
	}`

	_, err := decodePaperclipToolEnvelope(strings.NewReader(input))
	if err == nil || !strings.Contains(err.Error(), "context.runId contains unsupported characters") {
		t.Fatalf("err = %v", err)
	}
	if strings.Contains(err.Error(), "raw-secret") {
		t.Fatalf("error leaked raw context value: %v", err)
	}
}

func TestMainPaperclipToolStatusPassesRunContextHeaders(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.RequestURI() != "/rpc/mail/workspace?accountId=agent%40example.com" {
			t.Fatalf("request URI = %s", r.URL.RequestURI())
		}
		for key, want := range map[string]string{
			"X-Agentteam-Paperclip-Agent-Id":   "paperclip-agent-1",
			"X-Agentteam-Paperclip-Company-Id": "company-1",
			"X-Agentteam-Paperclip-Operation":  "status",
			"X-Agentteam-Paperclip-Plugin-Id":  "agentteam.paperclip-email-plugin",
			"X-Agentteam-Paperclip-Project-Id": "project-1",
			"X-Agentteam-Paperclip-Run-Id":     "run-1",
		} {
			if got := r.Header.Get(key); got != want {
				t.Fatalf("%s = %q, want %q", key, got, want)
			}
		}
		_, _ = w.Write([]byte(`{
			"accounts":[{"id":"agent@example.com","address":"agent@example.com","name":"Agent","state":"ready"}],
			"activeAccountId":"agent@example.com",
			"activeFolderId":"inbox-1",
			"folders":[{"id":"inbox-1","name":"Inbox","path":"INBOX","total":2,"unread":1}],
			"messages":[],
			"pagination":{"limit":25,"nextCursor":null,"previousCursor":null,"total":0},
			"selectedMessage":null
		}`))
	}))
	defer server.Close()
	saveTestAgentCredential(t, server.URL)

	input := `{
		"schema":"agentteam-email.paperclip-tool.v1",
		"operation":"status",
		"context":{
			"companyId":"company-1",
			"agentId":"paperclip-agent-1",
			"projectId":"project-1",
			"runId":"run-1",
			"pluginId":"agentteam.paperclip-email-plugin"
		},
		"parameters":{"mailbox":"agent@example.com"}
	}`
	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"paperclip-tool", "--json"}, nil, strings.NewReader(input), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("code = %d stderr=%s stdout=%s", code, stderr.String(), stdout.String())
	}
	var result paperclipToolResult
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		t.Fatalf("decode stdout: %v\n%s", err, stdout.String())
	}
	if !result.Ok || result.Content != "AgentTeam Email status is available." {
		t.Fatalf("result = %#v", result)
	}
}

func TestMainPaperclipToolSendDryRunDoesNotCallWebserver(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatalf("dry run should not call webserver: %s", r.URL.RequestURI())
	}))
	defer server.Close()
	saveTestAgentCredential(t, server.URL)

	input := `{
		"schema":"agentteam-email.paperclip-tool.v1",
		"operation":"send",
		"context":{
			"companyId":"company-1",
			"agentId":"paperclip-agent-1",
			"projectId":"project-1",
			"runId":"run-1",
			"pluginId":"agentteam.paperclip-email-plugin"
		},
		"parameters":{
			"to":["alice@example.com"],
			"subject":"Hello",
			"body":"Body",
			"dryRun":true
		}
	}`
	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"paperclip-tool", "--json"}, nil, strings.NewReader(input), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("code = %d stderr=%s stdout=%s", code, stderr.String(), stdout.String())
	}
	var result paperclipToolResult
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		t.Fatalf("decode stdout: %v\n%s", err, stdout.String())
	}
	data, ok := result.Data.(map[string]any)
	if !result.Ok || !ok || data["dryRun"] != true {
		t.Fatalf("result = %#v", result)
	}
}

func TestMainPaperclipToolProvisionDryRunDoesNotCallWebserver(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatalf("dry run should not call webserver: %s", r.URL.RequestURI())
	}))
	defer server.Close()
	saveTestAgentCredential(t, server.URL)

	input := `{
		"schema":"agentteam-email.paperclip-tool.v1",
		"operation":"provision",
		"context":{
			"companyId":"company-1",
			"agentId":"paperclip-agent-1",
			"projectId":"project-1",
			"runId":"run-1",
			"pluginId":"agentteam.paperclip-email-plugin"
		},
		"parameters":{
			"mailbox":"new-agent@example.com",
			"name":"New Agent",
			"dryRun":true
		}
	}`
	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"paperclip-tool", "--json"}, nil, strings.NewReader(input), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("code = %d stderr=%s stdout=%s", code, stderr.String(), stdout.String())
	}
	var result paperclipToolResult
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		t.Fatalf("decode stdout: %v\n%s", err, stdout.String())
	}
	data, ok := result.Data.(map[string]any)
	if !result.Ok || !ok || data["dryRun"] != true || data["address"] != "new-agent@example.com" || data["name"] != "New Agent" {
		t.Fatalf("result = %#v", result)
	}
}

func TestMainPaperclipToolProvisionUsesMailAdminRPC(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.RequestURI() != "/rpc/mail/admin/accounts" {
			t.Fatalf("request URI = %s", r.URL.RequestURI())
		}
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s", r.Method)
		}
		_, payload := decodeTestJWT(t, r.Header.Get("Authorization"))
		if payload["iss"] != "host-1" || payload["sub"] != "agent-1" || payload["aud"] != "http://"+r.Host {
			t.Fatalf("jwt payload = %#v", payload)
		}
		if payload["htm"] != http.MethodPost || payload["htu"] != "http://"+r.Host+"/rpc/mail/admin/accounts" {
			t.Fatalf("jwt payload = %#v", payload)
		}
		for key, want := range map[string]string{
			"X-Agentteam-Paperclip-Agent-Id":   "paperclip-agent-1",
			"X-Agentteam-Paperclip-Company-Id": "company-1",
			"X-Agentteam-Paperclip-Operation":  "provision",
			"X-Agentteam-Paperclip-Plugin-Id":  "agentteam.paperclip-email-plugin",
			"X-Agentteam-Paperclip-Project-Id": "project-1",
			"X-Agentteam-Paperclip-Run-Id":     "run-1",
		} {
			if got := r.Header.Get(key); got != want {
				t.Fatalf("%s = %q, want %q", key, got, want)
			}
		}
		if r.Header.Get("X-Access-Token") != "" {
			t.Fatalf("forwarded WildDuck access token header")
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode body: %v", err)
		}
		if body["address"] != "new-agent@example.com" || body["name"] != "New Agent" || body["type"] != "mailbox" {
			t.Fatalf("body = %#v", body)
		}
		_, _ = w.Write([]byte(`{
			"success":true,
			"account":{"id":"new-agent@example.com","address":"new-agent@example.com","name":"New Agent","state":"ready","grants":[]}
		}`))
	}))
	defer server.Close()
	saveTestAgentCredential(t, server.URL)

	input := `{
		"schema":"agentteam-email.paperclip-tool.v1",
		"operation":"provision",
		"context":{
			"companyId":"company-1",
			"agentId":"paperclip-agent-1",
			"projectId":"project-1",
			"runId":"run-1",
			"pluginId":"agentteam.paperclip-email-plugin"
		},
		"parameters":{
			"mailbox":"new-agent@example.com",
			"name":"New Agent"
		}
	}`
	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"paperclip-tool", "--json"}, nil, strings.NewReader(input), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("code = %d stderr=%s stdout=%s", code, stderr.String(), stdout.String())
	}
	var result paperclipToolResult
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		t.Fatalf("decode stdout: %v\n%s", err, stdout.String())
	}
	if !result.Ok || !strings.Contains(result.Content, "Provisioned mailbox new-agent@example.com.") {
		t.Fatalf("result = %#v", result)
	}
	data, ok := result.Data.(map[string]any)
	if !ok || data["success"] != true || objectValue(data["account"])["address"] != "new-agent@example.com" {
		t.Fatalf("result = %#v", result)
	}
}

func saveTestAgentCredential(t *testing.T, apiBaseURL string) {
	t.Helper()
	hostKey, err := newAgentEd25519JWK()
	if err != nil {
		t.Fatalf("host key: %v", err)
	}
	agentKey, err := newAgentEd25519JWK()
	if err != nil {
		t.Fatalf("agent key: %v", err)
	}
	if err := saveAgentCredential(defaultAgentProfileName, agentCredential{
		AgentID:         "agent-1",
		AgentPrivateKey: agentKey,
		APIBaseURL:      apiBaseURL,
		HostID:          "host-1",
		HostPrivateKey:  hostKey,
		Status:          "active",
	}); err != nil {
		t.Fatalf("save credential: %v", err)
	}
}
