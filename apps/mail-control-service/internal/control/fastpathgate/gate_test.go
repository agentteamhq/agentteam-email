package fastpathgate

import (
	"io"
	"net/http"
	"net/http/httptest"
	"net/http/httputil"
	"net/url"
	"strings"
	"testing"
)

func TestHandlerOnlyProxiesFastPathPost(t *testing.T) {
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("backend method = %s", r.Method)
		}
		if r.URL.Path != notifyPath {
			t.Fatalf("backend path = %s", r.URL.Path)
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("read backend body: %v", err)
		}
		if string(body) != `{"ok":true}` {
			t.Fatalf("backend body = %q", string(body))
		}
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"status":"enqueued"}`))
	}))
	defer backend.Close()

	target, err := parseTargetURL(backend.URL + notifyPath)
	if err != nil {
		t.Fatalf("parse target: %v", err)
	}
	proxy := buildTestProxy(target)
	request := httptest.NewRequest(http.MethodPost, notifyPath, strings.NewReader(`{"ok":true}`))
	recorder := httptest.NewRecorder()

	Handler(proxy).ServeHTTP(recorder, request)

	if recorder.Code != http.StatusAccepted {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
}

func TestHandlerRejectsEverythingExceptFastPathPost(t *testing.T) {
	backendHit := false
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		backendHit = true
		w.WriteHeader(http.StatusAccepted)
	}))
	defer backend.Close()
	target, err := parseTargetURL(backend.URL + notifyPath)
	if err != nil {
		t.Fatalf("parse target: %v", err)
	}
	handler := Handler(buildTestProxy(target))

	for _, test := range []struct {
		name   string
		method string
		path   string
	}{
		{name: "health", method: http.MethodGet, path: "/healthz"},
		{name: "root", method: http.MethodGet, path: "/"},
		{name: "notify_get", method: http.MethodGet, path: notifyPath},
		{name: "notify_query", method: http.MethodPost, path: notifyPath + "?ignored=true"},
		{name: "admin", method: http.MethodPost, path: "/rpc/agentMail.status.get"},
	} {
		t.Run(test.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, httptest.NewRequest(test.method, test.path, nil))
			if recorder.Code != http.StatusNotFound {
				t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
			}
		})
	}
	if backendHit {
		t.Fatal("backend was reached for a rejected request")
	}
}

func TestParseTargetURLRequiresPollerNotifyURL(t *testing.T) {
	for _, value := range []string{
		"https://127.0.0.1:8080/agent-mail/ingest/v1",
		"http://127.0.0.1:8080/healthz",
		"http:///agent-mail/ingest/v1",
	} {
		t.Run(value, func(t *testing.T) {
			if _, err := parseTargetURL(value); err == nil {
				t.Fatal("expected error")
			}
		})
	}
}

func buildTestProxy(target *url.URL) http.Handler {
	proxy := httputil.NewSingleHostReverseProxy(&url.URL{Scheme: target.Scheme, Host: target.Host})
	proxy.Director = func(req *http.Request) {
		req.URL.Scheme = target.Scheme
		req.URL.Host = target.Host
		req.URL.Path = target.Path
		req.URL.RawQuery = ""
		req.Host = target.Host
	}
	return proxy
}
