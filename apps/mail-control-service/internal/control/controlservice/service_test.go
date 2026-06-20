package controlservice

import (
	"context"
	"strings"
	"testing"
	"time"

	"agent-mail/internal/control/controlstate"
)

func TestRuntimeSecretsFromEnvRequiresRelayPassword(t *testing.T) {
	t.Setenv("AGENT_MAIL_FEEDBACK_MAILBOX_PASSWORD", "feedback-password")

	_, err := runtimeSecretsFromEnv()
	if err == nil {
		t.Fatal("runtimeSecretsFromEnv succeeded without relay password")
	}
	if !strings.Contains(err.Error(), "AGENT_MAIL_ZONEMTA_RELAY_PASSWORD") {
		t.Fatalf("error = %q, want missing relay password", err)
	}
}

func TestRuntimeSecretsFromEnvRequiresFeedbackMailboxPassword(t *testing.T) {
	t.Setenv("AGENT_MAIL_ZONEMTA_RELAY_PASSWORD", "relay-password")

	_, err := runtimeSecretsFromEnv()
	if err == nil {
		t.Fatal("runtimeSecretsFromEnv succeeded without feedback mailbox password")
	}
	if !strings.Contains(err.Error(), "AGENT_MAIL_FEEDBACK_MAILBOX_PASSWORD") {
		t.Fatalf("error = %q, want missing feedback mailbox password", err)
	}
}

func TestCanonicalModuleConfigUsesRuntimeSecrets(t *testing.T) {
	config := canonicalModuleConfig(runtimeSecrets{
		ZoneMTARelayPassword:    "relay-password",
		FeedbackMailboxPassword: "feedback-password",
	}, runtimeDatabases{
		WildDuckMongoURI:      "mongodb://db.example/wildduck?authSource=admin",
		WildDuckMongoDatabase: "wildduck",
		ControlMongoURI:       "mongodb://db.example/agent_mail_control?authSource=admin",
		ControlMongoDatabase:  "agent_mail_control",
	})

	if config.ProviderRelay.RelayAuth.Password != "relay-password" {
		t.Fatalf("relay password = %q, want provided secret", config.ProviderRelay.RelayAuth.Password)
	}
	if config.FeedbackRouter.IMAP.Password != "feedback-password" {
		t.Fatalf("feedback password = %q, want provided secret", config.FeedbackRouter.IMAP.Password)
	}
}

func TestCanonicalModuleConfigUsesRuntimeDatabases(t *testing.T) {
	config := canonicalModuleConfig(runtimeSecrets{
		ZoneMTARelayPassword:    "relay-password",
		FeedbackMailboxPassword: "feedback-password",
	}, runtimeDatabases{
		WildDuckMongoURI:      "mongodb://db.example/wildduck?authSource=admin",
		WildDuckMongoDatabase: "wildduck",
		ControlMongoURI:       "mongodb://db.example/agent_mail_control?authSource=admin",
		ControlMongoDatabase:  "agent_mail_control",
	})

	if config.Poller.State.Mongo.URI != "mongodb://db.example/agent_mail_control?authSource=admin" {
		t.Fatalf("control mongo uri = %q, want provided uri", config.Poller.State.Mongo.URI)
	}
	if config.Poller.State.Mongo.Database != "agent_mail_control" {
		t.Fatalf("control mongo database = %q, want derived database", config.Poller.State.Mongo.Database)
	}
	if config.Poller.WildDuck.MongoURI != "mongodb://db.example/wildduck?authSource=admin" {
		t.Fatalf("poller wildduck mongo uri = %q, want provided uri", config.Poller.WildDuck.MongoURI)
	}
	if config.Poller.WildDuck.MongoDatabase != "wildduck" {
		t.Fatalf("poller wildduck mongo database = %q, want derived database", config.Poller.WildDuck.MongoDatabase)
	}
	if config.ProviderRelay.LocalDelivery.MongoURI != "mongodb://db.example/wildduck?authSource=admin" {
		t.Fatalf("relay wildduck mongo uri = %q, want provided uri", config.ProviderRelay.LocalDelivery.MongoURI)
	}
	if config.ProviderRelay.LocalDelivery.MongoDatabase != "wildduck" {
		t.Fatalf("relay wildduck mongo database = %q, want derived database", config.ProviderRelay.LocalDelivery.MongoDatabase)
	}
}

func TestMongoDatabaseFromURI(t *testing.T) {
	tests := []struct {
		name string
		uri  string
		want string
	}{
		{
			name: "standard uri",
			uri:  "mongodb://user:pass@mongo.example:27017/wildduck?authSource=admin&tls=true",
			want: "wildduck",
		},
		{
			name: "srv uri",
			uri:  "mongodb+srv://user:pass@cluster.example/agent_mail_control?retryWrites=true&w=majority",
			want: "agent_mail_control",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := mongoDatabaseFromURI(test.uri)
			if err != nil {
				t.Fatalf("mongoDatabaseFromURI returned error: %v", err)
			}
			if got != test.want {
				t.Fatalf("database = %q, want %q", got, test.want)
			}
		})
	}
}

func TestMongoDatabaseFromURIRejectsMissingDatabase(t *testing.T) {
	_, err := mongoDatabaseFromURI("mongodb://user:pass@mongo.example:27017?authSource=admin")
	if err == nil {
		t.Fatal("mongoDatabaseFromURI succeeded without database path")
	}
	if !strings.Contains(err.Error(), "missing database path") {
		t.Fatalf("error = %q, want missing database path", err)
	}
}

func TestControlStateRuntimeSourceClassifiesOnlyActiveOwnedDomainsAsLocal(t *testing.T) {
	ctx := context.Background()
	store := controlstate.NewMemoryStore()
	if _, _, err := controlstate.AddDomain(ctx, store, controlstate.ProviderCloudflare, controlstate.DomainConfigParams{
		Domain:             "Example.com",
		Enabled:            true,
		CloudflareZoneName: "example.com",
		MailFromDomain:     "ei.example.com",
	}, time.Now().UTC()); err != nil {
		t.Fatalf("seed active domain: %v", err)
	}

	source := controlStateRuntimeSource{store: store}
	local, err := source.LocalRecipientDomain(ctx, "EXAMPLE.com")
	if err != nil {
		t.Fatalf("LocalRecipientDomain returned error for active domain: %v", err)
	}
	if !local {
		t.Fatal("active owned domain should classify as local")
	}

	external, err := source.LocalRecipientDomain(ctx, "gmail.com")
	if err != nil {
		t.Fatalf("missing active domain should classify external without error: %v", err)
	}
	if external {
		t.Fatal("unowned domain should not classify as local")
	}
}
