package poller

import (
	"context"
	"fmt"
	"sort"
	"time"

	"agent-mail/internal/archive/r2archive"
)

type testStateStore struct {
	items map[string]inboundWorkDocument
}

func newTestStateStore() *testStateStore {
	return &testStateStore{items: map[string]inboundWorkDocument{}}
}

func (s *testStateStore) Ping(context.Context) error { return nil }

func (s *testStateStore) UpsertPending(_ context.Context, bundle r2archive.InboundBundle) error {
	now := time.Now().UTC()
	if existing, ok := s.items[bundle.IngestID]; ok {
		existing.LastSeenAt = now
		existing.UpdatedAt = now
		switch existing.Status {
		case statusLeased, statusRetryWait, statusBlocked, statusDelivered, statusCompleted:
		default:
			existing.Status = statusPending
		}
		s.items[bundle.IngestID] = existing
		return nil
	}
	s.items[bundle.IngestID] = inboundWorkDocument{
		ID:              bundle.IngestID,
		IngestID:        bundle.IngestID,
		RecipientDomain: bundle.RecipientDomain,
		UTCDate:         bundle.UTCDate.Format(time.DateOnly),
		BundlePrefix:    bundle.Prefix,
		EdgeKey:         bundle.EdgeKey,
		RawKey:          bundle.RawKey,
		ResultKey:       bundle.ResultKey,
		Status:          statusPending,
		FirstSeenAt:     now,
		LastSeenAt:      now,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	return nil
}

func (s *testStateStore) UpsertDelivered(ctx context.Context, bundle r2archive.InboundBundle) error {
	if err := s.UpsertPending(ctx, bundle); err != nil {
		return err
	}
	doc := s.items[bundle.IngestID]
	doc.Status = statusCompleted
	s.items[bundle.IngestID] = doc
	return nil
}

func (s *testStateStore) LeaseNext(context.Context, time.Time) (workItem, bool, error) {
	return workItem{}, false, nil
}

func (s *testStateStore) NextRetryAt(context.Context) (time.Time, bool, error) {
	var docs []inboundWorkDocument
	for _, item := range s.items {
		if item.Status == statusRetryWait && item.NextAttemptAt != nil {
			docs = append(docs, item)
		}
	}
	if len(docs) == 0 {
		return time.Time{}, false, nil
	}
	sort.Slice(docs, func(i, j int) bool {
		if !docs[i].NextAttemptAt.Equal(*docs[j].NextAttemptAt) {
			return docs[i].NextAttemptAt.Before(*docs[j].NextAttemptAt)
		}
		if !docs[i].FirstSeenAt.Equal(docs[j].FirstSeenAt) {
			return docs[i].FirstSeenAt.Before(docs[j].FirstSeenAt)
		}
		return docs[i].ID < docs[j].ID
	})
	return docs[0].NextAttemptAt.UTC(), true, nil
}

func (s *testStateStore) MarkDelivered(context.Context, workItem) error { return nil }
func (s *testStateStore) MarkCompleted(context.Context, workItem) error { return nil }

func (s *testStateStore) RecordProcessingFailure(context.Context, workItem, int, classifiedError, int, time.Duration) error {
	return nil
}

func (s *testStateStore) EnsureDSNState(context.Context, workItem, string) (dsnState, error) {
	return dsnState{}, fmt.Errorf("not implemented")
}

func (s *testStateStore) SweepStart(context.Context, string, time.Time, time.Duration, time.Time) (time.Time, error) {
	return time.Time{}, nil
}

func (s *testStateStore) AdvanceSweepCursor(context.Context, string, time.Time) error { return nil }
func (s *testStateStore) QueueStatus(context.Context) (QueueStatus, error)            { return QueueStatus{}, nil }
func (s *testStateStore) LastSweepAt(context.Context) (*time.Time, error)             { return nil, nil }
func (s *testStateStore) RecordDiscoveryDiagnostic(context.Context, string, string, string, error) error {
	return nil
}
