package wildduck

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestListMessagesBuildsQueryWithURLValues(t *testing.T) {
	var gotPath string
	var gotQuery string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.EscapedPath()
		gotQuery = r.URL.RawQuery
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"results":[]}`))
	}))
	defer server.Close()

	client, err := New(server.URL, "access-token")
	if err != nil {
		t.Fatalf("New returned error: %v", err)
	}
	if _, err := client.ListMessages(context.Background(), "user/one", "mailbox/one", []string{"X-ATM-Ingest-ID", "Message-ID"}); err != nil {
		t.Fatalf("ListMessages returned error: %v", err)
	}

	if gotPath != "/users/user%2Fone/mailboxes/mailbox%2Fone/messages" {
		t.Fatalf("path = %q", gotPath)
	}
	if gotQuery != "includeHeaders=message-id%2Cx-atm-ingest-id&limit=50&order=desc" {
		t.Fatalf("query = %q", gotQuery)
	}
}

func TestFetchMessageSourceGetsExactWildDuckSource(t *testing.T) {
	var gotPath string
	var gotAccept string
	var gotToken string
	source := []byte("Message-ID: <message-1@example.net>\r\n\r\nbody")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.EscapedPath()
		gotAccept = r.Header.Get("Accept")
		gotToken = r.Header.Get("X-Access-Token")
		w.Header().Set("Content-Type", "message/rfc822")
		_, _ = w.Write(source)
	}))
	defer server.Close()

	client, err := New(server.URL, "access-token")
	if err != nil {
		t.Fatalf("New returned error: %v", err)
	}
	got, err := client.FetchMessageSource(context.Background(), "user/one", "mailbox/one", 324)
	if err != nil {
		t.Fatalf("FetchMessageSource returned error: %v", err)
	}

	if gotPath != "/users/user%2Fone/mailboxes/mailbox%2Fone/messages/324/message.eml" {
		t.Fatalf("path = %q", gotPath)
	}
	if gotAccept != "message/rfc822" {
		t.Fatalf("Accept = %q", gotAccept)
	}
	if gotToken != "access-token" {
		t.Fatalf("token = %q", gotToken)
	}
	if string(got) != string(source) {
		t.Fatalf("source = %q", got)
	}
}

func TestResolveAddressNotFoundIsTyped(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"success":false,"error":"Address not found","code":"AddressNotFound"}`))
	}))
	defer server.Close()

	client, err := New(server.URL, "access-token")
	if err != nil {
		t.Fatalf("New returned error: %v", err)
	}
	_, err = client.ResolveAddress(context.Background(), "missing@example.com")
	if err == nil {
		t.Fatal("expected resolve error")
	}
	if !IsNotFound(err) {
		t.Fatalf("expected typed not found error, got %v", err)
	}
}

func TestResolveAddressAllowsForwardedAddressWithoutUser(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"id":"forward-id","address":"forward@example.com","targets":["target@example.com"]}`))
	}))
	defer server.Close()

	client, err := New(server.URL, "access-token")
	if err != nil {
		t.Fatalf("New returned error: %v", err)
	}
	result, err := client.ResolveAddress(context.Background(), "forward@example.com")
	if err != nil {
		t.Fatalf("ResolveAddress returned error for forwarded address: %v", err)
	}
	if result.User != "" {
		t.Fatalf("User = %q, want empty forwarded-address user", result.User)
	}
	if len(result.Targets) != 1 || result.Targets[0] != "target@example.com" {
		t.Fatalf("Targets = %#v", result.Targets)
	}
}
