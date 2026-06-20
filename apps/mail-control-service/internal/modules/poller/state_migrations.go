package poller

import (
	"context"
	"fmt"

	migrate "github.com/xakep666/mongo-migrate"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func runMongoStateMigrations(ctx context.Context, db *mongo.Database) error {
	m := migrate.NewMigrate(db, migrate.Migration{
		Version:     1,
		Description: "create inbound queue state collections",
		Up: func(ctx context.Context, db *mongo.Database) error {
			if err := ensureCollection(ctx, db, "inbound_work_items", inboundWorkValidator()); err != nil {
				return err
			}
			if err := ensureCollection(ctx, db, "sweep_cursors", sweepCursorValidator()); err != nil {
				return err
			}
			if err := ensureCollection(ctx, db, "discovery_diagnostics", discoveryDiagnosticValidator()); err != nil {
				return err
			}
			if _, err := db.Collection("inbound_work_items").Indexes().CreateMany(ctx, []mongo.IndexModel{
				{
					Keys:    bson.D{{"edge_key", 1}},
					Options: options.Index().SetName("edge_key_unique").SetUnique(true),
				},
				{
					Keys:    bson.D{{"status", 1}, {"first_seen_at", 1}, {"_id", 1}},
					Options: options.Index().SetName("status_first_seen_id"),
				},
				{
					Keys:    bson.D{{"status", 1}, {"next_attempt_at", 1}, {"first_seen_at", 1}, {"_id", 1}},
					Options: options.Index().SetName("status_next_attempt_first_seen_id"),
				},
				{
					Keys:    bson.D{{"status", 1}, {"lease_until", 1}},
					Options: options.Index().SetName("status_lease_until"),
				},
			}); err != nil {
				return fmt.Errorf("create inbound_work_items indexes: %w", err)
			}
			if _, err := db.Collection("sweep_cursors").Indexes().CreateOne(ctx, mongo.IndexModel{
				Keys:    bson.D{{"direction", 1}, {"canonical_domain", 1}},
				Options: options.Index().SetName("direction_domain_unique").SetUnique(true),
			}); err != nil {
				return fmt.Errorf("create sweep_cursors indexes: %w", err)
			}
			if _, err := db.Collection("discovery_diagnostics").Indexes().CreateMany(ctx, []mongo.IndexModel{
				{
					Keys:    bson.D{{"object_key", 1}},
					Options: options.Index().SetName("object_key_unique").SetUnique(true),
				},
				{
					Keys:    bson.D{{"canonical_domain", 1}, {"last_seen_at", 1}},
					Options: options.Index().SetName("domain_last_seen"),
				},
			}); err != nil {
				return fmt.Errorf("create discovery_diagnostics indexes: %w", err)
			}
			return nil
		},
	})
	m.SetMigrationsCollection("migrations")
	if err := m.Up(ctx, migrate.AllAvailable); err != nil {
		return fmt.Errorf("run agent_mail_control mongo migrations: %w", err)
	}
	return nil
}

func ensureCollection(ctx context.Context, db *mongo.Database, name string, validator bson.D) error {
	names, err := db.ListCollectionNames(ctx, bson.D{{"name", name}})
	if err != nil {
		return fmt.Errorf("list collection %s: %w", name, err)
	}
	if len(names) == 0 {
		return db.CreateCollection(ctx, name, options.CreateCollection().
			SetValidator(validator).
			SetValidationAction("error").
			SetValidationLevel("moderate"))
	}
	if err := db.RunCommand(ctx, bson.D{
		{"collMod", name},
		{"validator", validator},
		{"validationAction", "error"},
		{"validationLevel", "moderate"},
	}).Err(); err != nil {
		return fmt.Errorf("update collection validator %s: %w", name, err)
	}
	return nil
}

func inboundWorkValidator() bson.D {
	return bson.D{{"$jsonSchema", bson.D{
		{"bsonType", "object"},
		{"required", bson.A{
			"_id",
			"ingest_id",
			"recipient_domain",
			"utc_date",
			"bundle_prefix",
			"edge_key",
			"raw_key",
			"result_key",
			"status",
			"attempt_count",
			"first_seen_at",
			"last_seen_at",
			"created_at",
			"updated_at",
		}},
		{"properties", bson.D{
			{"_id", bson.D{{"bsonType", "string"}}},
			{"ingest_id", bson.D{{"bsonType", "string"}}},
			{"recipient_domain", bson.D{{"bsonType", "string"}}},
			{"utc_date", bson.D{{"bsonType", "string"}}},
			{"bundle_prefix", bson.D{{"bsonType", "string"}}},
			{"edge_key", bson.D{{"bsonType", "string"}}},
			{"raw_key", bson.D{{"bsonType", "string"}}},
			{"result_key", bson.D{{"bsonType", "string"}}},
			{"status", bson.D{{"enum", bson.A{statusPending, statusLeased, statusRetryWait, statusBlocked, statusDelivered, statusCompleted}}}},
			{"attempt_count", bson.D{{"bsonType", bson.A{"int", "long"}}}},
			{"first_seen_at", bson.D{{"bsonType", "date"}}},
			{"last_seen_at", bson.D{{"bsonType", "date"}}},
			{"first_attempt_at", bson.D{{"bsonType", bson.A{"date", "null"}}}},
			{"last_attempt_at", bson.D{{"bsonType", bson.A{"date", "null"}}}},
			{"next_attempt_at", bson.D{{"bsonType", bson.A{"date", "null"}}}},
			{"lease_id", bson.D{{"bsonType", "string"}}},
			{"lease_until", bson.D{{"bsonType", bson.A{"date", "null"}}}},
			{"failure_class", bson.D{{"bsonType", "string"}}},
			{"last_error", bson.D{{"bsonType", "string"}}},
			{"dsn_id", bson.D{{"bsonType", "string"}}},
			{"dsn_message_id", bson.D{{"bsonType", "string"}}},
			{"dsn_raw_key", bson.D{{"bsonType", "string"}}},
			{"blocked_at", bson.D{{"bsonType", bson.A{"date", "null"}}}},
			{"created_at", bson.D{{"bsonType", "date"}}},
			{"updated_at", bson.D{{"bsonType", "date"}}},
		}},
	}}}
}

func sweepCursorValidator() bson.D {
	return bson.D{{"$jsonSchema", bson.D{
		{"bsonType", "object"},
		{"required", bson.A{"_id", "direction", "canonical_domain", "last_sweep_end_at", "created_at", "updated_at"}},
		{"properties", bson.D{
			{"_id", bson.D{{"bsonType", "string"}}},
			{"direction", bson.D{{"enum", bson.A{"inbound"}}}},
			{"canonical_domain", bson.D{{"bsonType", "string"}}},
			{"last_sweep_end_at", bson.D{{"bsonType", "date"}}},
			{"last_success_at", bson.D{{"bsonType", bson.A{"date", "null"}}}},
			{"last_error", bson.D{{"bsonType", "string"}}},
			{"created_at", bson.D{{"bsonType", "date"}}},
			{"updated_at", bson.D{{"bsonType", "date"}}},
		}},
	}}}
}

func discoveryDiagnosticValidator() bson.D {
	return bson.D{{"$jsonSchema", bson.D{
		{"bsonType", "object"},
		{"required", bson.A{"_id", "object_key", "canonical_domain", "first_seen_at", "last_seen_at", "failure_class", "last_error", "created_at", "updated_at"}},
		{"properties", bson.D{
			{"_id", bson.D{{"bsonType", "string"}}},
			{"object_key", bson.D{{"bsonType", "string"}}},
			{"canonical_domain", bson.D{{"bsonType", "string"}}},
			{"first_seen_at", bson.D{{"bsonType", "date"}}},
			{"last_seen_at", bson.D{{"bsonType", "date"}}},
			{"failure_class", bson.D{{"bsonType", "string"}}},
			{"last_error", bson.D{{"bsonType", "string"}}},
			{"created_at", bson.D{{"bsonType", "date"}}},
			{"updated_at", bson.D{{"bsonType", "date"}}},
		}},
	}}}
}
