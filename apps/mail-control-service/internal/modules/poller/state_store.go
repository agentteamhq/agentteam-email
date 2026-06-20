package poller

import (
	"context"
	"errors"
	"fmt"
	"time"

	"agent-mail/internal/archive/r2archive"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type stateStore interface {
	Ping(ctx context.Context) error
	UpsertPending(ctx context.Context, bundle r2archive.InboundBundle) error
	UpsertDelivered(ctx context.Context, bundle r2archive.InboundBundle) error
	LeaseNext(ctx context.Context, now time.Time) (workItem, bool, error)
	NextRetryAt(ctx context.Context) (time.Time, bool, error)
	MarkDelivered(ctx context.Context, item workItem) error
	MarkCompleted(ctx context.Context, item workItem) error
	RecordProcessingFailure(ctx context.Context, item workItem, attempt int, failure classifiedError, maxRetries int, retryDelay time.Duration) error
	EnsureDSNState(ctx context.Context, item workItem, recipientDomain string) (dsnState, error)
	SweepStart(ctx context.Context, domain string, archiveStartAt time.Time, sweepOverlap time.Duration, sweepEnd time.Time) (time.Time, error)
	AdvanceSweepCursor(ctx context.Context, domain string, sweepEnd time.Time) error
	QueueStatus(ctx context.Context) (QueueStatus, error)
	LastSweepAt(ctx context.Context) (*time.Time, error)
	RecordDiscoveryDiagnostic(ctx context.Context, objectKey string, domain string, class string, err error) error
}

type mongoStateStore struct {
	db          *mongo.Database
	work        *mongo.Collection
	cursors     *mongo.Collection
	diagnostics *mongo.Collection
}

type inboundWorkDocument struct {
	ID              string     `bson:"_id"`
	IngestID        string     `bson:"ingest_id"`
	RecipientDomain string     `bson:"recipient_domain"`
	UTCDate         string     `bson:"utc_date"`
	BundlePrefix    string     `bson:"bundle_prefix"`
	EdgeKey         string     `bson:"edge_key"`
	RawKey          string     `bson:"raw_key"`
	ResultKey       string     `bson:"result_key"`
	Status          string     `bson:"status"`
	AttemptCount    int        `bson:"attempt_count"`
	FirstSeenAt     time.Time  `bson:"first_seen_at"`
	LastSeenAt      time.Time  `bson:"last_seen_at"`
	FirstAttemptAt  *time.Time `bson:"first_attempt_at,omitempty"`
	LastAttemptAt   *time.Time `bson:"last_attempt_at,omitempty"`
	NextAttemptAt   *time.Time `bson:"next_attempt_at,omitempty"`
	LeaseID         string     `bson:"lease_id,omitempty"`
	LeaseUntil      *time.Time `bson:"lease_until,omitempty"`
	FailureClass    string     `bson:"failure_class,omitempty"`
	LastError       string     `bson:"last_error,omitempty"`
	DSNID           string     `bson:"dsn_id,omitempty"`
	DSNMessageID    string     `bson:"dsn_message_id,omitempty"`
	DSNRawKey       string     `bson:"dsn_raw_key,omitempty"`
	BlockedAt       *time.Time `bson:"blocked_at,omitempty"`
	CreatedAt       time.Time  `bson:"created_at"`
	UpdatedAt       time.Time  `bson:"updated_at"`
}

type sweepCursorDocument struct {
	ID              string     `bson:"_id"`
	Direction       string     `bson:"direction"`
	CanonicalDomain string     `bson:"canonical_domain"`
	LastSweepEndAt  time.Time  `bson:"last_sweep_end_at"`
	LastSuccessAt   *time.Time `bson:"last_success_at,omitempty"`
	LastError       string     `bson:"last_error,omitempty"`
	CreatedAt       time.Time  `bson:"created_at"`
	UpdatedAt       time.Time  `bson:"updated_at"`
}

type discoveryDiagnosticDocument struct {
	ID              string    `bson:"_id"`
	ObjectKey       string    `bson:"object_key"`
	CanonicalDomain string    `bson:"canonical_domain"`
	FirstSeenAt     time.Time `bson:"first_seen_at"`
	LastSeenAt      time.Time `bson:"last_seen_at"`
	FailureClass    string    `bson:"failure_class"`
	LastError       string    `bson:"last_error"`
	CreatedAt       time.Time `bson:"created_at"`
	UpdatedAt       time.Time `bson:"updated_at"`
}

func newMongoStateStore(ctx context.Context, client *mongo.Client, database string) (*mongoStateStore, error) {
	if database == "" {
		return nil, fmt.Errorf("missing state mongo database")
	}
	db := client.Database(database)
	if err := runMongoStateMigrations(ctx, db); err != nil {
		return nil, err
	}
	return &mongoStateStore{
		db:          db,
		work:        db.Collection("inbound_work_items"),
		cursors:     db.Collection("sweep_cursors"),
		diagnostics: db.Collection("discovery_diagnostics"),
	}, nil
}

func (s *mongoStateStore) Ping(ctx context.Context) error {
	return s.db.Client().Ping(ctx, nil)
}

func (s *mongoStateStore) UpsertPending(ctx context.Context, bundle r2archive.InboundBundle) error {
	now := time.Now().UTC()
	doc := inboundWorkDocument{
		ID:              bundle.IngestID,
		IngestID:        bundle.IngestID,
		RecipientDomain: bundle.RecipientDomain,
		UTCDate:         bundle.UTCDate.Format(time.DateOnly),
		BundlePrefix:    bundle.Prefix,
		EdgeKey:         bundle.EdgeKey,
		RawKey:          bundle.RawKey,
		ResultKey:       bundle.ResultKey,
		Status:          statusPending,
		AttemptCount:    0,
		FirstSeenAt:     now,
		LastSeenAt:      now,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	update := mongo.Pipeline{
		bson.D{{Key: "$set", Value: bson.D{
			{Key: "ingest_id", Value: bson.D{{Key: "$ifNull", Value: bson.A{"$ingest_id", doc.IngestID}}}},
			{Key: "recipient_domain", Value: bson.D{{Key: "$ifNull", Value: bson.A{"$recipient_domain", doc.RecipientDomain}}}},
			{Key: "utc_date", Value: bson.D{{Key: "$ifNull", Value: bson.A{"$utc_date", doc.UTCDate}}}},
			{Key: "bundle_prefix", Value: bson.D{{Key: "$ifNull", Value: bson.A{"$bundle_prefix", doc.BundlePrefix}}}},
			{Key: "edge_key", Value: bson.D{{Key: "$ifNull", Value: bson.A{"$edge_key", doc.EdgeKey}}}},
			{Key: "raw_key", Value: bson.D{{Key: "$ifNull", Value: bson.A{"$raw_key", doc.RawKey}}}},
			{Key: "result_key", Value: bson.D{{Key: "$ifNull", Value: bson.A{"$result_key", doc.ResultKey}}}},
			{Key: "attempt_count", Value: bson.D{{Key: "$ifNull", Value: bson.A{"$attempt_count", doc.AttemptCount}}}},
			{Key: "first_seen_at", Value: bson.D{{Key: "$ifNull", Value: bson.A{"$first_seen_at", doc.FirstSeenAt}}}},
			{Key: "last_seen_at", Value: now},
			{Key: "created_at", Value: bson.D{{Key: "$ifNull", Value: bson.A{"$created_at", doc.CreatedAt}}}},
			{Key: "updated_at", Value: now},
			{Key: "status", Value: bson.D{{Key: "$cond", Value: bson.A{
				bson.D{{Key: "$in", Value: bson.A{"$status", bson.A{statusLeased, statusRetryWait, statusBlocked, statusDelivered, statusCompleted}}}},
				"$status",
				statusPending,
			}}}},
		}}},
	}
	_, err := s.work.UpdateOne(ctx, bson.D{{"_id", bundle.IngestID}}, update, options.UpdateOne().SetUpsert(true))
	if err != nil {
		return fmt.Errorf("upsert inbound work item ingest_id=%s edge_key=%s: %w", bundle.IngestID, bundle.EdgeKey, err)
	}
	return nil
}

func (s *mongoStateStore) UpsertDelivered(ctx context.Context, bundle r2archive.InboundBundle) error {
	now := time.Now().UTC()
	update := bson.D{
		{"$set", bson.D{
			{"status", statusCompleted},
			{"last_seen_at", now},
			{"updated_at", now},
		}},
		{"$unset", bson.D{{"lease_id", ""}, {"lease_until", ""}}},
		{"$setOnInsert", bson.D{
			{"_id", bundle.IngestID},
			{"ingest_id", bundle.IngestID},
			{"recipient_domain", bundle.RecipientDomain},
			{"utc_date", bundle.UTCDate.Format(time.DateOnly)},
			{"bundle_prefix", bundle.Prefix},
			{"edge_key", bundle.EdgeKey},
			{"raw_key", bundle.RawKey},
			{"result_key", bundle.ResultKey},
			{"attempt_count", 0},
			{"first_seen_at", now},
			{"created_at", now},
		}},
	}
	_, err := s.work.UpdateOne(ctx, bson.D{{"_id", bundle.IngestID}}, update, options.UpdateOne().SetUpsert(true))
	return err
}

func (s *mongoStateStore) LeaseNext(ctx context.Context, now time.Time) (workItem, bool, error) {
	leaseID, err := r2archive.NewUUIDv7String()
	if err != nil {
		return workItem{}, false, err
	}
	now = now.UTC()
	filter := bson.D{{"$or", bson.A{
		bson.D{{"status", statusPending}},
		bson.D{{"status", statusRetryWait}, {"$or", bson.A{
			bson.D{{"next_attempt_at", bson.D{{"$exists", false}}}},
			bson.D{{"next_attempt_at", nil}},
			bson.D{{"next_attempt_at", bson.D{{"$lte", now}}}},
		}}},
		bson.D{{"status", statusLeased}, {"lease_until", bson.D{{"$lte", now}}}},
	}}}
	update := mongo.Pipeline{
		bson.D{{Key: "$set", Value: bson.D{
			{Key: "status", Value: statusLeased},
			{Key: "lease_id", Value: leaseID},
			{Key: "lease_until", Value: now.Add(5 * time.Minute)},
			{Key: "first_attempt_at", Value: bson.D{{Key: "$ifNull", Value: bson.A{"$first_attempt_at", now}}}},
			{Key: "last_attempt_at", Value: now},
			{Key: "updated_at", Value: now},
		}}},
	}
	opts := options.FindOneAndUpdate().
		SetSort(bson.D{{"first_seen_at", 1}, {"_id", 1}}).
		SetReturnDocument(options.After)

	var doc inboundWorkDocument
	err = s.work.FindOneAndUpdate(ctx, filter, update, opts).Decode(&doc)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return workItem{}, false, nil
	}
	if err != nil {
		return workItem{}, false, err
	}
	return workItem{
		IngestID:        doc.IngestID,
		RecipientDomain: doc.RecipientDomain,
		BundlePrefix:    doc.BundlePrefix,
		EdgeKey:         doc.EdgeKey,
		RawKey:          doc.RawKey,
		ResultKey:       doc.ResultKey,
		AttemptCount:    doc.AttemptCount,
		LeaseID:         doc.LeaseID,
	}, true, nil
}

func (s *mongoStateStore) NextRetryAt(ctx context.Context) (time.Time, bool, error) {
	var doc inboundWorkDocument
	err := s.work.FindOne(ctx,
		bson.D{{"status", statusRetryWait}, {"next_attempt_at", bson.D{{"$exists", true}, {"$ne", nil}}}},
		options.FindOne().SetSort(bson.D{{"next_attempt_at", 1}, {"first_seen_at", 1}, {"_id", 1}}).SetProjection(bson.D{{"next_attempt_at", 1}}),
	).Decode(&doc)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return time.Time{}, false, nil
	}
	if err != nil {
		return time.Time{}, false, err
	}
	if doc.NextAttemptAt == nil {
		return time.Time{}, false, nil
	}
	return doc.NextAttemptAt.UTC(), true, nil
}

func (s *mongoStateStore) MarkDelivered(ctx context.Context, item workItem) error {
	now := time.Now().UTC()
	result, err := s.work.UpdateOne(ctx, leasedWorkFilter(item), bson.D{
		{"$set", bson.D{{"status", statusDelivered}, {"updated_at", now}}},
		{"$unset", bson.D{{"lease_id", ""}, {"lease_until", ""}}},
	})
	if err == nil && result.MatchedCount == 0 {
		return fmt.Errorf("leased work item %s no longer owns lease %s", item.IngestID, item.LeaseID)
	}
	return err
}

func (s *mongoStateStore) MarkCompleted(ctx context.Context, item workItem) error {
	now := time.Now().UTC()
	result, err := s.work.UpdateOne(ctx, leasedWorkFilter(item), bson.D{
		{"$set", bson.D{{"status", statusCompleted}, {"updated_at", now}}},
		{"$unset", bson.D{{"lease_id", ""}, {"lease_until", ""}}},
	})
	if err == nil && result.MatchedCount == 0 {
		return fmt.Errorf("leased work item %s no longer owns lease %s", item.IngestID, item.LeaseID)
	}
	return err
}

func (s *mongoStateStore) RecordProcessingFailure(ctx context.Context, item workItem, attempt int, failure classifiedError, maxRetries int, retryDelay time.Duration) error {
	if failure.err == nil {
		failure.err = fmt.Errorf("unknown processing failure")
	}
	now := time.Now().UTC()
	filter := leasedWorkFilter(item)
	if failure.retryable && attempt <= maxRetries {
		nextAttempt := now.Add(retryDelay)
		_, err := s.work.UpdateOne(ctx, filter, bson.D{
			{"$set", bson.D{
				{"status", statusRetryWait},
				{"attempt_count", attempt},
				{"failure_class", failure.class},
				{"last_error", failure.err.Error()},
				{"next_attempt_at", nextAttempt},
				{"updated_at", now},
			}},
			{"$unset", bson.D{{"lease_id", ""}, {"lease_until", ""}}},
		})
		return err
	}
	_, err := s.work.UpdateOne(ctx, filter, bson.D{
		{"$set", bson.D{
			{"status", statusBlocked},
			{"attempt_count", attempt},
			{"failure_class", failure.class},
			{"last_error", failure.err.Error()},
			{"blocked_at", now},
			{"updated_at", now},
		}},
		{"$unset", bson.D{{"lease_id", ""}, {"lease_until", ""}}},
	})
	return err
}

func (s *mongoStateStore) EnsureDSNState(ctx context.Context, item workItem, recipientDomain string) (dsnState, error) {
	rawKey, err := r2archive.InboundDSNKey(item.BundlePrefix)
	if err != nil {
		return dsnState{}, err
	}
	var doc inboundWorkDocument
	if err := s.work.FindOne(ctx, bson.D{{"_id", item.IngestID}}, options.FindOne().SetProjection(bson.D{{"dsn_id", 1}, {"dsn_message_id", 1}, {"dsn_raw_key", 1}})).Decode(&doc); err != nil {
		return dsnState{}, err
	}
	state := dsnState{
		ID:        doc.DSNID,
		MessageID: doc.DSNMessageID,
		RawKey:    doc.DSNRawKey,
	}
	if state.ID == "" {
		state.ID, err = r2archive.NewUUIDv7String()
		if err != nil {
			return dsnState{}, err
		}
	}
	if state.MessageID == "" {
		state.MessageID = state.ID + "@" + recipientDomain
	}
	if state.RawKey == "" {
		state.RawKey = rawKey
	}
	_, err = s.work.UpdateOne(ctx, bson.D{{"_id", item.IngestID}}, bson.D{{"$set", bson.D{
		{"dsn_id", state.ID},
		{"dsn_message_id", state.MessageID},
		{"dsn_raw_key", state.RawKey},
		{"updated_at", time.Now().UTC()},
	}}})
	if err != nil {
		return dsnState{}, err
	}
	return state, nil
}

func (s *mongoStateStore) SweepStart(ctx context.Context, domain string, archiveStartAt time.Time, sweepOverlap time.Duration, sweepEnd time.Time) (time.Time, error) {
	var doc sweepCursorDocument
	err := s.cursors.FindOne(ctx, bson.D{{"_id", sweepCursorID("inbound", domain)}}).Decode(&doc)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return archiveStartAt, nil
	}
	if err != nil {
		return time.Time{}, err
	}
	start := doc.LastSweepEndAt.UTC().Add(-sweepOverlap)
	if start.Before(archiveStartAt) {
		start = archiveStartAt
	}
	if start.After(sweepEnd) {
		return sweepEnd, nil
	}
	return start, nil
}

func (s *mongoStateStore) AdvanceSweepCursor(ctx context.Context, domain string, sweepEnd time.Time) error {
	now := time.Now().UTC()
	_, err := s.cursors.UpdateOne(ctx, bson.D{{"_id", sweepCursorID("inbound", domain)}}, bson.D{
		{"$set", bson.D{
			{"direction", "inbound"},
			{"canonical_domain", domain},
			{"last_sweep_end_at", sweepEnd.UTC()},
			{"last_success_at", now},
			{"updated_at", now},
		}},
		{"$unset", bson.D{{"last_error", ""}}},
		{"$setOnInsert", bson.D{{"created_at", now}}},
	}, options.UpdateOne().SetUpsert(true))
	return err
}

func (s *mongoStateStore) QueueStatus(ctx context.Context) (QueueStatus, error) {
	cursor, err := s.work.Aggregate(ctx, mongo.Pipeline{
		bson.D{{Key: "$group", Value: bson.D{{Key: "_id", Value: "$status"}, {Key: "count", Value: bson.D{{Key: "$sum", Value: 1}}}}}},
	})
	if err != nil {
		return QueueStatus{}, err
	}
	defer cursor.Close(ctx)
	var status QueueStatus
	for cursor.Next(ctx) {
		var row struct {
			ID    string `bson:"_id"`
			Count int   `bson:"count"`
		}
		if err := cursor.Decode(&row); err != nil {
			return QueueStatus{}, err
		}
		switch row.ID {
		case statusPending:
			status.Pending = row.Count
		case statusLeased:
			status.Leased = row.Count
		case statusRetryWait:
			status.RetryWait = row.Count
		case statusBlocked:
			status.Blocked = row.Count
		case statusDelivered:
			status.Delivered = row.Count
		case statusCompleted:
			status.Completed = row.Count
		}
	}
	if err := cursor.Err(); err != nil {
		return QueueStatus{}, err
	}
	return status, nil
}

func (s *mongoStateStore) LastSweepAt(ctx context.Context) (*time.Time, error) {
	var doc sweepCursorDocument
	err := s.cursors.FindOne(ctx,
		bson.D{{"direction", "inbound"}, {"last_success_at", bson.D{{"$exists", true}, {"$ne", nil}}}},
		options.FindOne().SetSort(bson.D{{"last_success_at", -1}}).SetProjection(bson.D{{"last_success_at", 1}}),
	).Decode(&doc)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if doc.LastSuccessAt == nil {
		return nil, nil
	}
	utc := doc.LastSuccessAt.UTC()
	return &utc, nil
}

func (s *mongoStateStore) RecordDiscoveryDiagnostic(ctx context.Context, objectKey string, domain string, class string, recordErr error) error {
	now := time.Now().UTC()
	_, err := s.diagnostics.UpdateOne(ctx, bson.D{{"_id", objectKey}}, bson.D{
		{"$set", bson.D{
			{"object_key", objectKey},
			{"canonical_domain", domain},
			{"last_seen_at", now},
			{"failure_class", class},
			{"last_error", recordErr.Error()},
			{"updated_at", now},
		}},
		{"$setOnInsert", bson.D{
			{"first_seen_at", now},
			{"created_at", now},
		}},
	}, options.UpdateOne().SetUpsert(true))
	return err
}

func sweepCursorID(direction string, domain string) string {
	return direction + ":" + domain
}

func leasedWorkFilter(item workItem) bson.D {
	filter := bson.D{{"_id", item.IngestID}}
	if item.LeaseID != "" {
		// Terminal transitions must prove they still own the active lease, so a
		// stale worker cannot overwrite a newer lease after timeout recovery.
		filter = append(filter, bson.E{Key: "lease_id", Value: item.LeaseID})
	}
	return filter
}
