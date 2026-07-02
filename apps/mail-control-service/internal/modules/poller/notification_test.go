package poller

import (
	"context"
	"testing"

	"mail-control-service/internal/archive/r2archive"
)

func TestEnqueueNotificationPersistsInboundBundleAndWakesPoller(t *testing.T) {
	p, store, notification, wakeCh := newTestPollerAndNotification(t)

	bundle, err := p.EnqueueNotification(context.Background(), notification)
	if err != nil {
		t.Fatalf("EnqueueNotification returned error: %v", err)
	}
	if bundle.EdgeKey != notification.EdgeKey {
		t.Fatalf("bundle edge_key = %q, want %q", bundle.EdgeKey, notification.EdgeKey)
	}
	assertWorkItem(t, store, notification.IngestID, notification.EdgeKey)
	select {
	case <-wakeCh:
	default:
		t.Fatal("expected internal ingest enqueue to wake poller processing")
	}
}

func TestEnqueueNotificationRejectsInvalidBundleBeforeQueueMutation(t *testing.T) {
	p, store, notification, wakeCh := newTestPollerAndNotification(t)
	notification.ResultKey = "orgs/org_pub_123/domains/example.com/mail/inbound/2026/04/18/not-the-same/result.json"

	if _, err := p.EnqueueNotification(context.Background(), notification); err == nil {
		t.Fatal("expected inconsistent result_key to be rejected")
	}
	if len(store.items) != 0 {
		t.Fatalf("invalid notification mutated queue: %#v", store.items)
	}
	select {
	case <-wakeCh:
		t.Fatal("invalid notification woke poller processing")
	default:
	}
}

func TestValidateNotificationRejectsInconsistentBundleKeys(t *testing.T) {
	_, _, notification, _ := newTestPollerAndNotification(t)
	notification.ResultKey = "orgs/org_pub_123/domains/example.com/mail/inbound/2026/04/18/not-the-same/result.json"

	if _, err := ValidateNotification(notification); err == nil {
		t.Fatal("expected inconsistent result_key to be rejected")
	}
}

func newTestPollerAndNotification(t *testing.T) (*Poller, *testStateStore, Notification, <-chan struct{}) {
	t.Helper()

	ingestID, err := r2archive.NewUUIDv7String()
	if err != nil {
		t.Fatal(err)
	}
	receivedAt, err := r2archive.UUIDv7Time(ingestID)
	if err != nil {
		t.Fatal(err)
	}
	bundle, err := r2archive.OrganizationInboundBundleKeys("org_pub_123", "example.com", receivedAt, ingestID)
	if err != nil {
		t.Fatal(err)
	}
	notification := Notification{
		Schema:                   IngestNotificationSchema,
		OrganizationID:           "org-1",
		OrganizationPublicID:     "org_pub_123",
		ArchivePrefix:            bundle.ArchivePrefix,
		WorkerConnectionID:       "worker-connection-1",
		WorkerDomainDeploymentID: "worker-deployment-1",
		IngestID:                 ingestID,
		RecipientDomain:          "example.com",
		RawKey:                   bundle.RawKey,
		EdgeKey:                  bundle.EdgeKey,
		ResultKey:                bundle.ResultKey,
		ReceivedAt:               receivedAt,
		RawSHA256:                "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
	}

	store := newTestStateStore()
	wakeCh := make(chan struct{}, 1)
	p := &Poller{state: store, wakeCh: wakeCh}
	return p, store, notification, wakeCh
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
