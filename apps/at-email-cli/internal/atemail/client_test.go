package atemail

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestWildDuckClientRequestShapes(t *testing.T) {
	var seenPaths []string
	var submitPayload map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenPaths = append(seenPaths, r.URL.RequestURI())
		if r.Header.Get("Accept") != "application/json" {
			t.Fatalf("Accept header = %q", r.Header.Get("Accept"))
		}
		if r.Header.Get("X-Access-Token") != "token-1" {
			t.Fatalf("X-Access-Token = %q", r.Header.Get("X-Access-Token"))
		}
		switch r.URL.Path {
		case "/users/user-1/mailboxes":
			_, _ = w.Write([]byte(`{"results":[{"id":"inbox-1","path":"INBOX","specialUse":"\\Inbox"}]}`))
		case "/users/user-1/mailboxes/inbox-1/messages":
			if r.URL.RawQuery != "limit=2&order=desc&unseen=true&includeHeaders=from%2Csubject" {
				t.Fatalf("RawQuery = %q", r.URL.RawQuery)
			}
			_, _ = w.Write([]byte(`{"results":[]}`))
		case "/users/user-1/submit":
			if err := json.NewDecoder(r.Body).Decode(&submitPayload); err != nil {
				t.Fatalf("decode submit payload: %v", err)
			}
			_, _ = w.Write([]byte(`{"message":{"id":7,"mailbox":"sent","queueId":"queue-1"}}`))
		default:
			t.Fatalf("unexpected request path: %s", r.URL.Path)
		}
	}))
	defer server.Close()

	client := newWildDuckClient(config{APIBaseURL: server.URL, AccessToken: "token-1", UserID: "user-1"})
	if _, err := client.listMailboxes(context.Background(), false, false); err != nil {
		t.Fatalf("listMailboxes: %v", err)
	}
	if _, err := client.listMessages(context.Background(), "inbox-1", 2, true, []string{"Subject", "from", "from"}); err != nil {
		t.Fatalf("listMessages: %v", err)
	}
	subject := "Hello"
	if _, err := client.submitMessage(context.Background(), outboundMessage{To: []string{"alice@example.com"}, Subject: &subject, Text: "Body"}); err != nil {
		t.Fatalf("submitMessage: %v", err)
	}
	if submitPayload["subject"] != "Hello" || submitPayload["text"] != "Body" {
		t.Fatalf("submitPayload = %#v", submitPayload)
	}
	to := submitPayload["to"].([]any)
	if to[0].(map[string]any)["address"] != "alice@example.com" {
		t.Fatalf("to payload = %#v", to)
	}
	if len(seenPaths) != 3 {
		t.Fatalf("seenPaths = %#v", seenPaths)
	}
}

func TestControlAPIClientUsesMessageReadTokenHeader(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/rpc/agentMail.message.view.get" {
			t.Fatalf("path = %s", r.URL.Path)
		}
		if r.Header.Get("X-Agent-Mail-Message-Read-Token") != "read-token" {
			t.Fatalf("message read token header = %q", r.Header.Get("X-Agent-Mail-Message-Read-Token"))
		}
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode payload: %v", err)
		}
		if payload["id"] != "agent-mail-cli" || payload["method"] != "agentMail.message.view.get" {
			t.Fatalf("payload = %#v", payload)
		}
		_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":"agent-mail-cli","result":{"plainText":"safe"}}`))
	}))
	defer server.Close()

	client, err := newControlAPIClient(config{ControlAPIBaseURL: server.URL, MessageReadToken: "read-token"})
	if err != nil {
		t.Fatalf("newControlAPIClient: %v", err)
	}
	result, err := client.messageView(context.Background(), map[string]any{"wildDuckUid": 7})
	if err != nil {
		t.Fatalf("messageView: %v", err)
	}
	if result["plainText"] != "safe" {
		t.Fatalf("result = %#v", result)
	}
}

func TestWildDuckClientRejectsNonObjectJSONResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`[]`))
	}))
	defer server.Close()

	client := newWildDuckClient(config{APIBaseURL: server.URL, AccessToken: "token-1", UserID: "user-1"})
	_, err := client.listMailboxes(context.Background(), false, false)
	if err == nil {
		t.Fatal("expected protocol error")
	}
	var protoErr protocolError
	if !errors.As(err, &protoErr) {
		t.Fatalf("error type = %T, value = %v", err, err)
	}
}

func TestWildDuckClientWrapsTransportErrors(t *testing.T) {
	client := newWildDuckClient(config{APIBaseURL: "http://wildduck.example", AccessToken: "token-1", UserID: "user-1"})
	client.client = &http.Client{Transport: failingRoundTripper(func(*http.Request) (*http.Response, error) {
		return nil, errors.New("dial tcp 192.0.2.10:443: connect: connection refused")
	})}

	_, err := client.listMailboxes(context.Background(), false, false)
	if err == nil {
		t.Fatal("expected transport error")
	}
	var transportErr transportError
	if !errors.As(err, &transportErr) {
		t.Fatalf("error type = %T, value = %v", err, err)
	}
	if got := err.Error(); got != "WildDuck service unavailable while sending GET request" {
		t.Fatalf("error = %q", got)
	}
	if strings.Contains(err.Error(), "dial tcp") || strings.Contains(err.Error(), "wildduck.example") {
		t.Fatalf("error exposed raw transport detail: %q", err.Error())
	}
}

func TestWildDuckClientSubmitMessageDefaultsMalformedMessageToEmptyObject(t *testing.T) {
	cases := []struct {
		name string
		body string
	}{
		{name: "missing", body: `{}`},
		{name: "null", body: `{"message":null}`},
		{name: "array", body: `{"message":[]}`},
		{name: "string", body: `{"message":"queued"}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				_, _ = w.Write([]byte(tc.body))
			}))
			defer server.Close()

			client := newWildDuckClient(config{APIBaseURL: server.URL, AccessToken: "token-1", UserID: "user-1"})
			subject := "Hello"
			response, err := client.submitMessage(context.Background(), outboundMessage{To: []string{"alice@example.com"}, Subject: &subject, Text: "Body"})
			if err != nil {
				t.Fatalf("submitMessage: %v", err)
			}
			if len(response) != 0 {
				t.Fatalf("response = %#v, want empty object", response)
			}
		})
	}
}

func TestWildDuckClientListAPIsDefaultMalformedResultsToEmptySlice(t *testing.T) {
	resultsByPath := map[string]string{
		"/users/user-1/mailboxes":                  `{}`,
		"/users/user-1/mailboxes/inbox-1/messages": `{"results":null}`,
		"/users/user-1/search":                     `{"results":{"id":"message-1"}}`,
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, ok := resultsByPath[r.URL.Path]
		if !ok {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		_, _ = w.Write([]byte(body))
	}))
	defer server.Close()

	client := newWildDuckClient(config{APIBaseURL: server.URL, AccessToken: "token-1", UserID: "user-1"})
	mailboxes, err := client.listMailboxes(context.Background(), false, false)
	if err != nil {
		t.Fatalf("listMailboxes: %v", err)
	}
	if mailboxes == nil || len(mailboxes) != 0 {
		t.Fatalf("mailboxes = %#v, want non-nil empty slice", mailboxes)
	}
	messages, err := client.listMessages(context.Background(), "inbox-1", 20, false, nil)
	if err != nil {
		t.Fatalf("listMessages: %v", err)
	}
	if messages == nil || len(messages) != 0 {
		t.Fatalf("messages = %#v, want non-nil empty slice", messages)
	}
	searchResults, err := client.searchMessages(context.Background(), "hello", 20)
	if err != nil {
		t.Fatalf("searchMessages: %v", err)
	}
	if searchResults == nil || len(searchResults) != 0 {
		t.Fatalf("searchResults = %#v, want non-nil empty slice", searchResults)
	}
}

type failingRoundTripper func(*http.Request) (*http.Response, error)

func (f failingRoundTripper) RoundTrip(request *http.Request) (*http.Response, error) {
	return f(request)
}

func TestControlAPIClientRejectsNonObjectResult(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":"agent-mail-cli","result":[]}`))
	}))
	defer server.Close()

	client, err := newControlAPIClient(config{ControlAPIBaseURL: server.URL, MessageReadToken: "read-token"})
	if err != nil {
		t.Fatalf("newControlAPIClient: %v", err)
	}
	_, err = client.messageView(context.Background(), nil)
	if err == nil {
		t.Fatal("expected protocol error")
	}
	var protoErr protocolError
	if !errors.As(err, &protoErr) {
		t.Fatalf("error type = %T, value = %v", err, err)
	}
}
