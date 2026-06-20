package poller

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"agent-mail/internal/archive/r2archive"
)

func TestNotifyEnqueuesInboundBundleAndWakesPoller(t *testing.T) {
	handler, store, notification, body, wakeCh := newTestNotifyHandlerAndNotification(t)
	handler.now = func() time.Time { return notification.ReceivedAt.Add(time.Minute) }

	request := httptest.NewRequest(http.MethodPost, NotifyPath, bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(HeaderTimestamp, notification.ReceivedAt.Format(time.RFC3339Nano))
	request.Header.Set(HeaderSignature, hex.EncodeToString(expectedSignature([]byte(handler.cfg.NotifyHMACSecret), request.Header.Get(HeaderTimestamp), body)))

	response := httptest.NewRecorder()
	handler.routes().ServeHTTP(response, request)

	if response.Code != http.StatusAccepted {
		t.Fatalf("unexpected status %d: %s", response.Code, response.Body.String())
	}
	assertWorkItem(t, store, notification.IngestID, notification.EdgeKey)
	select {
	case <-wakeCh:
	default:
		t.Fatal("expected fast-path notification to wake poller processing")
	}
}

func TestNotifyRejectsInvalidSignature(t *testing.T) {
	handler, _, notification, body, _ := newTestNotifyHandlerAndNotification(t)
	handler.now = func() time.Time { return notification.ReceivedAt.Add(time.Minute) }

	request := httptest.NewRequest(http.MethodPost, NotifyPath, bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(HeaderTimestamp, notification.ReceivedAt.Format(time.RFC3339Nano))
	request.Header.Set(HeaderSignature, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")

	response := httptest.NewRecorder()
	handler.routes().ServeHTTP(response, request)

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("unexpected status %d: %s", response.Code, response.Body.String())
	}
}

func TestValidateNotificationRejectsInconsistentBundleKeys(t *testing.T) {
	_, _, notification, _, _ := newTestNotifyHandlerAndNotification(t)
	notification.ResultKey = "mail/inbound/example.com/2026/04/18/not-the-same/result.json"

	if _, err := ValidateNotification(notification); err == nil {
		t.Fatal("expected inconsistent result_key to be rejected")
	}
}

func newTestNotifyHandlerAndNotification(t *testing.T) (*notifyHandler, *testStateStore, Notification, []byte, <-chan struct{}) {
	t.Helper()

	ingestID, err := r2archive.NewUUIDv7String()
	if err != nil {
		t.Fatal(err)
	}
	receivedAt, err := r2archive.UUIDv7Time(ingestID)
	if err != nil {
		t.Fatal(err)
	}
	bundle, err := r2archive.InboundBundleKeys("example.com", receivedAt, ingestID)
	if err != nil {
		t.Fatal(err)
	}
	notification := Notification{
		Schema:          FastPathSchema,
		IngestID:        ingestID,
		RecipientDomain: "example.com",
		RawKey:          bundle.RawKey,
		EdgeKey:         bundle.EdgeKey,
		ResultKey:       bundle.ResultKey,
		ReceivedAt:      receivedAt,
		RawSHA256:       "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
	}
	body, err := json.Marshal(notification)
	if err != nil {
		t.Fatal(err)
	}

	store := newTestStateStore()
	wakeCh := make(chan struct{}, 1)
	p := &Poller{state: store}
	handler := &notifyHandler{
		cfg: runtimeConfig{
			NotifyHMACSecret: "test-secret",
			NotifyClockSkew:  5 * time.Minute,
		},
		state:          store,
		enqueuePending: p.upsertPending,
		wakeProcess: func() {
			wakeCh <- struct{}{}
		},
	}
	return handler, store, notification, body, wakeCh
}

func assertWorkItem(t *testing.T, store *testStateStore, ingestID string, edgeKey string) {
	t.Helper()

	doc, ok := store.items[ingestID]
	if !ok {
		t.Fatalf("missing work item %s", ingestID)
	}
	if doc.EdgeKey != edgeKey {
		t.Fatalf("edge_key = %q, want %q", doc.EdgeKey, edgeKey)
	}
	if doc.Status != statusPending {
		t.Fatalf("unexpected status %q", doc.Status)
	}
}
