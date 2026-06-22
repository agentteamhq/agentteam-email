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
	openBrowser = func(target string) error {
		t.Fatalf("browser open called for %s", target)
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
		"Code: ABCD-1234\n\n",
		"Waiting for approval...\n",
		"Logged in.\n",
		"Account: agent@example.com\n",
	} {
		if !strings.Contains(stdout.String(), want) {
			t.Fatalf("login stdout missing %q:\n%s", want, stdout.String())
		}
	}
	if strings.Contains(stdout.String(), "session-token-secret") {
		t.Fatalf("login stdout exposed token:\n%s", stdout.String())
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
		"Code: EFGH-5678\n\n",
		"Logged in.\n",
	} {
		if !strings.Contains(stdout.String(), want) {
			t.Fatalf("login stdout missing %q:\n%s", want, stdout.String())
		}
	}
	if strings.Contains(stdout.String(), "discovered-session-token") {
		t.Fatalf("login stdout exposed token:\n%s", stdout.String())
	}
	if stderr.String() != "" {
		t.Fatalf("login stderr = %q", stderr.String())
	}
}

func TestMainTextCommandWritesUpdateNotice(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.RequestURI() != "/users/user-1/mailboxes?counters=true" {
			t.Fatalf("request URI = %s", r.URL.RequestURI())
		}
		_, _ = w.Write([]byte(`{"results":[{"id":"inbox-1","path":"INBOX","total":2,"unseen":1}]}`))
	}))
	defer server.Close()

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
	code := Main(context.Background(), []string{"status"}, testEnv(server.URL), strings.NewReader(""), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("code = %d stdout=%s stderr=%s", code, stdout.String(), stderr.String())
	}
	if !strings.Contains(stdout.String(), "User: user-1\n") {
		t.Fatalf("stdout = %q", stdout.String())
	}
	wantErr := "update available: v1.2.3 -> run `at-email self-update`\n"
	if stderr.String() != wantErr {
		t.Fatalf("stderr = %q, want %q", stderr.String(), wantErr)
	}
}

func TestMainJSONCommandSuppressesUpdateNotice(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.RequestURI() != "/users/user-1/mailboxes?counters=true" {
			t.Fatalf("request URI = %s", r.URL.RequestURI())
		}
		_, _ = w.Write([]byte(`{"results":[{"id":"inbox-1","path":"INBOX","total":2,"unseen":1}]}`))
	}))
	defer server.Close()

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
	code := Main(context.Background(), []string{"status", "--json"}, testEnv(server.URL), strings.NewReader(""), &stdout, &stderr)
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

func TestMainMissingConfigUsesSysexitsConfig(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"status"}, nil, strings.NewReader(""), &stdout, &stderr)
	if code != 78 {
		t.Fatalf("code = %d", code)
	}
	wantOut := "error: missing required runtime environment: AT_EMAIL_WILDDUCK_API_BASE_URL, AT_EMAIL_WILDDUCK_ACCESS_TOKEN, AT_EMAIL_WILDDUCK_USER_ID\nhint: this is a managed-runtime setup issue; report the command and context instead of creating local credentials\n"
	if stdout.String() != wantOut {
		t.Fatalf("stdout = %q, want %q", stdout.String(), wantOut)
	}
	if stderr.String() != "" {
		t.Fatalf("stderr = %q", stderr.String())
	}
}

func TestMainReadMissingControlConfigUsesSysexitsConfig(t *testing.T) {
	var (
		mu       sync.Mutex
		requests []string
	)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		requests = append(requests, r.URL.RequestURI())
		mu.Unlock()
		switch r.URL.RequestURI() {
		case "/users/user-1/mailboxes":
			_, _ = w.Write([]byte(`{"results":[{"id":"inbox-1","path":"INBOX","specialUse":"\\Inbox"}]}`))
		case "/users/user-1/mailboxes/inbox-1/messages/7?markAsSeen=true":
			_, _ = w.Write([]byte(`{"id":7,"mailbox":"inbox-1","subject":"Hello"}`))
		default:
			t.Fatalf("request URI = %s", r.URL.RequestURI())
		}
	}))
	defer server.Close()

	env := []string{
		"AT_EMAIL_WILDDUCK_API_BASE_URL=" + server.URL,
		"AT_EMAIL_WILDDUCK_ACCESS_TOKEN=token-1",
		"AT_EMAIL_WILDDUCK_USER_ID=user-1",
	}
	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"read", "7"}, env, strings.NewReader(""), &stdout, &stderr)
	if code != 78 {
		t.Fatalf("code = %d", code)
	}
	if !strings.Contains(stdout.String(), "AT_EMAIL_CONTROL_API_BASE_URL") {
		t.Fatalf("stdout = %q", stdout.String())
	}
	mu.Lock()
	gotRequests := append([]string(nil), requests...)
	mu.Unlock()
	wantRequests := []string{
		"/users/user-1/mailboxes",
		"/users/user-1/mailboxes/inbox-1/messages/7?markAsSeen=true",
	}
	if strings.Join(gotRequests, "\n") != strings.Join(wantRequests, "\n") {
		t.Fatalf("requests = %#v, want %#v", gotRequests, wantRequests)
	}
	if stderr.String() != "" {
		t.Fatalf("stderr = %q", stderr.String())
	}
}

func TestMainTransportFailureUsesServiceUnavailableExit(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("closed server should not receive requests")
	}))
	baseURL := server.URL
	server.Close()

	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"status"}, testEnv(baseURL), strings.NewReader(""), &stdout, &stderr)
	if code != 69 {
		t.Fatalf("code = %d", code)
	}
	wantOut := "error: WildDuck service unavailable while sending GET request\n"
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

func TestMainJSONTransportFailureKeepsStdoutClean(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("closed server should not receive requests")
	}))
	baseURL := server.URL
	server.Close()

	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"status", "--json"}, testEnv(baseURL), strings.NewReader(""), &stdout, &stderr)
	if code != 69 {
		t.Fatalf("code = %d", code)
	}
	if stdout.String() != "" {
		t.Fatalf("stdout = %q", stdout.String())
	}
	wantErr := "error: WildDuck service unavailable while sending GET request\n"
	if stderr.String() != wantErr {
		t.Fatalf("stderr = %q, want %q", stderr.String(), wantErr)
	}
	if strings.Contains(stderr.String(), baseURL) || strings.Contains(stderr.String(), "connect:") {
		t.Fatalf("stderr exposed transport detail: %q", stderr.String())
	}
}

func TestMainStatusJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.RequestURI() != "/users/user-1/mailboxes?counters=true" {
			t.Fatalf("request URI = %s", r.URL.RequestURI())
		}
		_, _ = w.Write([]byte(`{"results":[{"id":"inbox-1","path":"INBOX","total":2,"unseen":1}]}`))
	}))
	defer server.Close()

	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"status", "--json"}, testEnv(server.URL), strings.NewReader(""), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("code = %d stderr=%s", code, stderr.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(stdout.Bytes(), &payload); err != nil {
		t.Fatalf("decode stdout: %v\n%s", err, stdout.String())
	}
	if payload["user_id"] != "user-1" || payload["mailbox_address"] != "agent@example.com" {
		t.Fatalf("payload = %#v", payload)
	}
}

func TestMainInboxUnseenEmptyStateUsesUnreadCopy(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.RequestURI() {
		case "/users/user-1/mailboxes":
			_, _ = w.Write([]byte(`{"results":[{"id":"inbox-1","path":"INBOX","specialUse":"\\Inbox"}]}`))
		case "/users/user-1/mailboxes/inbox-1/messages?limit=20&order=desc&unseen=true":
			_, _ = w.Write([]byte(`{"results":[]}`))
		default:
			t.Fatalf("request URI = %s", r.URL.RequestURI())
		}
	}))
	defer server.Close()

	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"inbox", "--unseen"}, testEnv(server.URL), strings.NewReader(""), &stdout, &stderr)
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
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.RequestURI() {
		case "/users/user-1/mailboxes":
			_, _ = w.Write([]byte(`{"results":[{"id":"inbox-1","path":"INBOX","specialUse":"\\Inbox"}]}`))
		case "/users/user-1/mailboxes/inbox-1/messages?limit=20&order=desc":
			_, _ = w.Write([]byte(`{}`))
		default:
			t.Fatalf("request URI = %s", r.URL.RequestURI())
		}
	}))
	defer server.Close()

	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"inbox", "--json"}, testEnv(server.URL), strings.NewReader(""), &stdout, &stderr)
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
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`[]`))
	}))
	defer server.Close()

	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{"status", "--json"}, testEnv(server.URL), strings.NewReader(""), &stdout, &stderr)
	if code != 70 {
		t.Fatalf("code = %d", code)
	}
	if stdout.String() != "" {
		t.Fatalf("stdout = %q", stdout.String())
	}
	wantErr := "error: WildDuck GET /users/user-1/mailboxes returned malformed service response: expected JSON object\n"
	if stderr.String() != wantErr {
		t.Fatalf("stderr = %q, want %q", stderr.String(), wantErr)
	}
}

func TestMainSendUsesBodyAndRendersSubmitResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/users/user-1/submit" {
			t.Fatalf("path = %s", r.URL.Path)
		}
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if payload["text"] != "Body" || payload["subject"] != "Hello" {
			t.Fatalf("payload = %#v", payload)
		}
		_, _ = w.Write([]byte(`{"message":{"mailbox":"sent","id":9,"queueId":"queue-1"}}`))
	}))
	defer server.Close()

	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{
		"send",
		"--to", "alice@example.com",
		"--subject", "Hello",
		"--body", "Body",
	}, testEnv(server.URL), strings.NewReader(""), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("code = %d stderr=%s", code, stderr.String())
	}
	want := "Sent message.\nMailbox: sent\nMessage: 9\nQueue: queue-1\n"
	if stdout.String() != want {
		t.Fatalf("stdout = %q, want %q", stdout.String(), want)
	}
}

func TestMainSendAllowsExplicitEmptySubject(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if subject, ok := payload["subject"].(string); !ok || subject != "" {
			t.Fatalf("subject = %#v", payload["subject"])
		}
		_, _ = w.Write([]byte(`{"message":{"mailbox":"sent","id":9}}`))
	}))
	defer server.Close()

	var stdout, stderr bytes.Buffer
	code := Main(context.Background(), []string{
		"send",
		"--to", "alice@example.com",
		"--subject=",
		"--body", "Body",
	}, testEnv(server.URL), strings.NewReader(""), &stdout, &stderr)
	if code != 0 {
		t.Fatalf("code = %d stderr=%s", code, stderr.String())
	}
	if !strings.Contains(stdout.String(), "Sent message.") {
		t.Fatalf("stdout = %q", stdout.String())
	}
}

func testEnv(wildDuckURL string) []string {
	return []string{
		"AT_EMAIL_WILDDUCK_API_BASE_URL=" + wildDuckURL,
		"AT_EMAIL_WILDDUCK_ACCESS_TOKEN=token-1",
		"AT_EMAIL_WILDDUCK_USER_ID=user-1",
		"AT_EMAIL_MAILBOX_ADDRESS=agent@example.com",
		"AT_EMAIL_CONTROL_API_BASE_URL=http://control.example",
		"AT_EMAIL_MESSAGE_READ_TOKEN=read-token",
	}
}
