package smoke

import (
	"bytes"
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"agent-mail/internal/archive/r2archive"
	"agent-mail/internal/modules/poller"
	gotestingcontainer "agent-mail/test-containers/go-testing-container"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func TestInboundReplaySweepQueueContracts(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	suite := sweepContractNewSuite(t, ctx)

	t.Run("dropped fast-path notification is recovered by sweep", func(t *testing.T) {
		scenario := suite.newScenario(t, "sweep-delivers", sweepContractScenarioOptions{
			SweepInterval: "100ms",
			RetryDelay:    "30s",
			MaxRetries:    2,
			StartSMTP:     true,
		})
		bundle := scenario.writeWorkerBundle(t, "Dropped fast path", "<sweep-delivers@example.net>", "")

		p := scenario.startPoller(t)
		_ = p

		receipt := waitForSmokeReceipt(t, ctx, suite.archive, bundle.Bundle.ResultKey)
		if receipt.IngestID != bundle.IngestID {
			t.Fatalf("result ingest_id = %q, want %q", receipt.IngestID, bundle.IngestID)
		}
		deliveries := scenario.smtp.Deliveries()
		if len(deliveries) != 1 {
			t.Fatalf("smtp deliveries = %d, want 1", len(deliveries))
		}
		work := scenario.waitForWorkStatus(t, bundle.IngestID, "delivered", "completed")
		if status := sweepContractStringField(work, "status"); status != "delivered" && status != "completed" {
			t.Fatalf("work status = %q, want delivered or completed", status)
		}
	})

	t.Run("existing result is terminal and is not replayed or rewritten", func(t *testing.T) {
		scenario := suite.newScenario(t, "existing-result", sweepContractScenarioOptions{
			SweepInterval: "100ms",
			RetryDelay:    "30s",
			MaxRetries:    2,
			StartSMTP:     true,
		})
		bundle := scenario.writeWorkerBundle(t, "Existing result", "<existing-result@example.net>", "")
		resultBefore := []byte(fmt.Sprintf(`{
  "schema": "agent-mail.inbound.result.v1",
  "ingest_id": %q,
  "status": "delivered",
  "attempt": 1,
  "processed_at": "2026-06-18T06:56:10Z",
  "raw_key": %q,
  "edge_key": %q,
  "wildduck_user_id": "existing-user",
  "wildduck_mailbox_id": "existing-mailbox",
  "wildduck_message_id": "existing-message",
  "delivery_source": "replayed"
}
`, bundle.IngestID, bundle.Bundle.RawKey, bundle.Bundle.EdgeKey))
		if err := suite.archive.PutBytes(ctx, bundle.Bundle.ResultKey, "application/json", resultBefore); err != nil {
			t.Fatalf("write preexisting result: %v", err)
		}

		p := scenario.startPoller(t)
		scenario.waitForSweep(t, p)

		if deliveries := scenario.smtp.Deliveries(); len(deliveries) != 0 {
			t.Fatalf("smtp deliveries = %d, want 0 for completed bundle", len(deliveries))
		}
		resultAfter, err := suite.archive.GetBytes(ctx, bundle.Bundle.ResultKey)
		if err != nil {
			t.Fatalf("read result after sweep: %v", err)
		}
		if !bytes.Equal(resultAfter, resultBefore) {
			t.Fatalf("preexisting result was rewritten\nbefore:\n%s\nafter:\n%s", resultBefore, resultAfter)
		}
	})

	t.Run("local-route edge schema is skipped without replay", func(t *testing.T) {
		scenario := suite.newScenario(t, "local-route-skip", sweepContractScenarioOptions{
			SweepInterval: "100ms",
			RetryDelay:    "30s",
			MaxRetries:    2,
			StartSMTP:     true,
		})
		bundle := scenario.writeLocalRouteBundle(t)

		p := scenario.startPoller(t)
		scenario.waitForSweep(t, p)

		if deliveries := scenario.smtp.Deliveries(); len(deliveries) != 0 {
			t.Fatalf("smtp deliveries = %d, want 0 for local-route archive marker", len(deliveries))
		}
		scenario.assertNoWorkItem(t, bundle.IngestID)
		scenario.assertObjectAbsent(t, bundle.Bundle.ResultKey)
	})

	t.Run("malformed and unsupported edge records do not block a later valid object", func(t *testing.T) {
		scenario := suite.newScenario(t, "bad-edge-continues", sweepContractScenarioOptions{
			SweepInterval: "100ms",
			RetryDelay:    "30s",
			MaxRetries:    2,
			StartSMTP:     true,
		})
		malformed := scenario.writeMalformedEdgeBundle(t)
		unsupported := scenario.writeUnsupportedEdgeBundle(t)
		valid := scenario.writeWorkerBundle(t, "Valid after bad edge", "<valid-after-bad-edge@example.net>", "")

		p := scenario.startPoller(t)
		_ = p

		receipt := waitForSmokeReceipt(t, ctx, suite.archive, valid.Bundle.ResultKey)
		if receipt.IngestID != valid.IngestID {
			t.Fatalf("valid result ingest_id = %q, want %q", receipt.IngestID, valid.IngestID)
		}
		if deliveries := scenario.smtp.Deliveries(); len(deliveries) != 1 {
			t.Fatalf("smtp deliveries = %d, want exactly the later valid object delivered once", len(deliveries))
		}
		scenario.assertNoWorkItem(t, malformed.IngestID)
		scenario.assertNoWorkItem(t, unsupported.IngestID)
		scenario.assertObjectAbsent(t, malformed.Bundle.ResultKey)
		scenario.assertObjectAbsent(t, unsupported.Bundle.ResultKey)
		scenario.waitForDiagnostic(t, malformed.Bundle.EdgeKey)
		scenario.waitForDiagnostic(t, unsupported.Bundle.EdgeKey)
	})

	t.Run("edge before raw is retryable without result or delivery", func(t *testing.T) {
		scenario := suite.newScenario(t, "missing-raw-retry", sweepContractScenarioOptions{
			SweepInterval: "100ms",
			RetryDelay:    "30s",
			MaxRetries:    2,
			StartSMTP:     true,
		})
		bundle := scenario.writeEdgeOnlyBundle(t, "Missing raw", "<missing-raw@example.net>", sha256Hex([]byte("not-yet-written")))

		p := scenario.startPoller(t)
		_ = p

		work := scenario.waitForWorkStatus(t, bundle.IngestID, "retry_wait")
		if status := sweepContractStringField(work, "status"); status != "retry_wait" {
			t.Fatalf("work status = %q, want retry_wait", status)
		}
		scenario.assertRetryWaitState(t, work, 1)
		if deliveries := scenario.smtp.Deliveries(); len(deliveries) != 0 {
			t.Fatalf("smtp deliveries = %d, want 0 while raw.eml is missing", len(deliveries))
		}
		scenario.assertObjectAbsent(t, bundle.Bundle.ResultKey)
	})

	t.Run("raw sha mismatch is terminal blocked without delivery or successful result", func(t *testing.T) {
		scenario := suite.newScenario(t, "sha-mismatch", sweepContractScenarioOptions{
			SweepInterval: "100ms",
			RetryDelay:    "30s",
			MaxRetries:    2,
			StartSMTP:     true,
		})
		bundle := scenario.writeWorkerBundle(t, "SHA mismatch", "<sha-mismatch@example.net>", strings.Repeat("0", sha256.Size*2))

		p := scenario.startPoller(t)
		_ = p

		work := scenario.waitForWorkStatus(t, bundle.IngestID, "blocked")
		if status := sweepContractStringField(work, "status"); status != "blocked" {
			t.Fatalf("work status = %q, want blocked", status)
		}
		scenario.assertBlockedState(t, work, 1, "invariant")
		if deliveries := scenario.smtp.Deliveries(); len(deliveries) != 0 {
			t.Fatalf("smtp deliveries = %d, want 0 for raw sha mismatch", len(deliveries))
		}
		scenario.assertObjectAbsent(t, bundle.Bundle.ResultKey)
	})

	t.Run("retry exhaustion blocks after initial attempt plus two retries", func(t *testing.T) {
		scenario := suite.newScenario(t, "retry-exhaustion", sweepContractScenarioOptions{
			SweepInterval: "100ms",
			RetryDelay:    "10ms",
			MaxRetries:    2,
			StartSMTP:     false,
		})
		bundle := scenario.writeWorkerBundle(t, "Retry exhaustion", "<retry-exhaustion@example.net>", "")

		p := scenario.startPoller(t)
		_ = p

		work := scenario.waitForWorkStatus(t, bundle.IngestID, "blocked")
		if status := sweepContractStringField(work, "status"); status != "blocked" {
			t.Fatalf("work status = %q, want blocked", status)
		}
		if attempts := sweepContractIntField(work, "attempt_count"); attempts != 3 {
			t.Fatalf("attempt_count = %d, want exactly 3 initial attempt plus two retries", attempts)
		}
		scenario.assertBlockedState(t, work, 3, "transient")
		scenario.assertObjectAbsent(t, bundle.Bundle.ResultKey)
	})

	t.Run("blocked rediscovery by sweep does not reset item to pending", func(t *testing.T) {
		scenario := suite.newScenario(t, "blocked-rediscovery", sweepContractScenarioOptions{
			SweepInterval: "100ms",
			RetryDelay:    "30s",
			MaxRetries:    2,
			StartSMTP:     true,
		})
		bundle := scenario.writeWorkerBundle(t, "Blocked rediscovery", "<blocked-rediscovery@example.net>", strings.Repeat("f", sha256.Size*2))

		p := scenario.startPoller(t)
		_ = p

		scenario.waitForWorkStatus(t, bundle.IngestID, "blocked")
		time.Sleep(350 * time.Millisecond)
		work := scenario.readWorkItem(t, bundle.IngestID)
		if status := sweepContractStringField(work, "status"); status != "blocked" {
			t.Fatalf("rediscovered blocked work status = %q, want blocked", status)
		}
		scenario.assertBlockedState(t, work, 1, "invariant")
		if deliveries := scenario.smtp.Deliveries(); len(deliveries) != 0 {
			t.Fatalf("smtp deliveries = %d, want 0 for rediscovered blocked item", len(deliveries))
		}
		scenario.assertObjectAbsent(t, bundle.Bundle.ResultKey)
	})

	t.Run("duplicate sweep discovery remains idempotent", func(t *testing.T) {
		scenario := suite.newScenario(t, "duplicate-sweep", sweepContractScenarioOptions{
			SweepInterval: "100ms",
			RetryDelay:    "30s",
			MaxRetries:    2,
			StartSMTP:     true,
		})
		bundle := scenario.writeWorkerBundle(t, "Duplicate sweep", "<duplicate-sweep@example.net>", "")

		p := scenario.startPoller(t)
		_ = p

		waitForSmokeReceipt(t, ctx, suite.archive, bundle.Bundle.ResultKey)
		resultBefore, err := suite.archive.GetBytes(ctx, bundle.Bundle.ResultKey)
		if err != nil {
			t.Fatalf("read duplicate sweep result: %v", err)
		}
		time.Sleep(350 * time.Millisecond)
		resultAfter, err := suite.archive.GetBytes(ctx, bundle.Bundle.ResultKey)
		if err != nil {
			t.Fatalf("read duplicate sweep result after rediscovery: %v", err)
		}
		if !bytes.Equal(resultAfter, resultBefore) {
			t.Fatalf("result was rewritten by duplicate sweep discovery\nbefore:\n%s\nafter:\n%s", resultBefore, resultAfter)
		}
		if deliveries := scenario.smtp.Deliveries(); len(deliveries) != 1 {
			t.Fatalf("smtp deliveries = %d, want 1 after duplicate sweep discovery", len(deliveries))
		}
		scenario.assertOneWorkItem(t, bundle.IngestID)
	})

	t.Run("fast-path and sweep race remains idempotent", func(t *testing.T) {
		scenario := suite.newScenario(t, "fastpath-sweep-race", sweepContractScenarioOptions{
			SweepInterval: "100ms",
			RetryDelay:    "30s",
			MaxRetries:    2,
			StartSMTP:     true,
		})
		bundle := scenario.writeWorkerBundle(t, "Fast path sweep race", "<fastpath-sweep-race@example.net>", "")

		p := scenario.startPoller(t)
		_ = p
		if err := postSmokeNotification(suite.ctx, scenario.notifyEndpoint, scenario.notification(bundle), scenario.notifyHMACSecret); err != nil {
			t.Fatalf("post racing fast-path notification: %v", err)
		}

		waitForSmokeReceipt(t, ctx, suite.archive, bundle.Bundle.ResultKey)
		resultBefore, err := suite.archive.GetBytes(ctx, bundle.Bundle.ResultKey)
		if err != nil {
			t.Fatalf("read fast-path sweep race result: %v", err)
		}
		time.Sleep(350 * time.Millisecond)
		resultAfter, err := suite.archive.GetBytes(ctx, bundle.Bundle.ResultKey)
		if err != nil {
			t.Fatalf("read fast-path sweep race result after rediscovery: %v", err)
		}
		if !bytes.Equal(resultAfter, resultBefore) {
			t.Fatalf("result was rewritten by fast-path/sweep race\nbefore:\n%s\nafter:\n%s", resultBefore, resultAfter)
		}
		if deliveries := scenario.smtp.Deliveries(); len(deliveries) != 1 {
			t.Fatalf("smtp deliveries = %d, want 1 after fast-path/sweep race", len(deliveries))
		}
		scenario.assertOneWorkItem(t, bundle.IngestID)
	})
}

type sweepContractSuite struct {
	ctx         context.Context
	mongoURI    string
	archive     *r2archive.Client
	mongoClient *mongo.Client
}

func sweepContractNewSuite(t *testing.T, ctx context.Context) *sweepContractSuite {
	t.Helper()

	run := gotestingcontainer.NewRunArtifacts(t)
	scenarioDir := run.ScenarioDir(t, "inbound-replay-sweep-contract")
	if err := os.MkdirAll(filepath.Join(scenarioDir, "objects"), 0o755); err != nil {
		t.Fatalf("create sweep contract artifact dir: %v", err)
	}

	network := gotestingcontainer.NewScopedNetwork(t, ctx)
	mongoURI := startSmokeMongo(t, ctx, run, network)
	minio := startSmokeMinIO(t, ctx, run, network)
	if err := createSmokeBucket(ctx, minio.Endpoint, minio.Region, minio.Bucket, minio.AccessKeyID, minio.SecretAccessKey); err != nil {
		t.Fatalf("create sweep contract bucket: %v", err)
	}

	t.Setenv("AGENT_MAIL_R2_ENDPOINT", minio.Endpoint)
	t.Setenv("AGENT_MAIL_R2_REGION", minio.Region)
	t.Setenv("AGENT_MAIL_R2_BUCKET", minio.Bucket)
	t.Setenv("AGENT_MAIL_R2_ACCESS_KEY_ID", minio.AccessKeyID)
	t.Setenv("AGENT_MAIL_R2_SECRET_ACCESS_KEY", minio.SecretAccessKey)

	archive, err := r2archive.New(ctx, r2archive.Config{
		Endpoint: minio.Endpoint,
		Region:   minio.Region,
		Bucket:   minio.Bucket,
	}, minio.AccessKeyID, minio.SecretAccessKey)
	if err != nil {
		t.Fatalf("create sweep contract archive client: %v", err)
	}
	mongoClient, err := mongo.Connect(options.Client().ApplyURI(mongoURI))
	if err != nil {
		t.Fatalf("connect sweep contract MongoDB: %v", err)
	}
	t.Cleanup(func() {
		_ = mongoClient.Disconnect(context.Background())
	})

	return &sweepContractSuite{
		ctx:         ctx,
		mongoURI:    mongoURI,
		archive:     archive,
		mongoClient: mongoClient,
	}
}

type sweepContractScenarioOptions struct {
	SweepInterval string
	RetryDelay    string
	MaxRetries    int
	StartSMTP     bool
}

type sweepContractScenario struct {
	suite            *sweepContractSuite
	domain           string
	mailbox          string
	controlDB        string
	wildduckDB       string
	wdServer         *httptest.Server
	smtp             *smokeSMTPServer
	smtpAddr         string
	notifyEndpoint   string
	notifyHMACSecret string
	options          sweepContractScenarioOptions
}

func (s *sweepContractSuite) newScenario(t *testing.T, name string, opts sweepContractScenarioOptions) *sweepContractScenario {
	t.Helper()

	slug := sweepContractSlug(name)
	domain := slug + "." + smokeDomain
	controlDB := "agent_mail_control_" + slug + "_" + smokeRunID()
	wildduckDB := "wildduck_" + slug + "_" + smokeRunID()
	userID := bson.NewObjectID()
	mailboxID := bson.NewObjectID()
	mailbox := "agent@" + domain
	wildduckAccessToken := randomSmokeToken(t, "wildduck")

	t.Setenv("AGENT_MAIL_WILDDUCK_ADMIN_ACCESS_TOKEN", wildduckAccessToken)
	wdServer := sweepContractWildDuckServer(t, wildduckAccessToken, userID.Hex(), mailbox)
	t.Cleanup(wdServer.Close)

	scenario := &sweepContractScenario{
		suite:      s,
		domain:     domain,
		mailbox:    mailbox,
		controlDB:  controlDB,
		wildduckDB: wildduckDB,
		wdServer:   wdServer,
		options:    opts,
	}
	if opts.StartSMTP {
		scenario.smtp = newSmokeSMTPServer(t, s.mongoClient.Database(wildduckDB).Collection("messages"), userID, mailboxID)
		scenario.smtpAddr = scenario.smtp.Addr()
		t.Cleanup(scenario.smtp.Close)
	} else {
		scenario.smtpAddr = freeSmokeAddress(t)
	}
	return scenario
}

func (s *sweepContractScenario) startPoller(t *testing.T) *poller.Poller {
	t.Helper()

	notifyListenURL := "http://" + freeSmokeAddress(t)
	notifyHMACSecret := randomSmokeToken(t, "notify")
	t.Setenv("AGENT_MAIL_CF_TUNNEL_LISTEN_URL", notifyListenURL)
	t.Setenv("AGENT_MAIL_CF_TUNNEL_EXTERNAL_URL", "https://mail-ingress."+s.domain+"/agent-mail/ingest/v1")
	t.Setenv("AGENT_MAIL_CF_TUNNEL_HMAC_SECRET", notifyHMACSecret)
	s.notifyEndpoint = notifyListenURL + poller.NotifyPath
	s.notifyHMACSecret = notifyHMACSecret

	cfg := smokePollerConfig(s.suite.mongoURI, s.controlDB, s.wildduckDB, s.wdServer.URL, s.smtpAddr)
	cfg.SweepInterval = s.options.SweepInterval
	cfg.RetryDelay = s.options.RetryDelay
	cfg.MaxRetries = s.options.MaxRetries
	cfg.SweepSafetyLag = "0s"
	cfg.SweepOverlap = "1h"
	cfg.ArchiveStartAt = "2026-01-01T00:00:00Z"

	p, err := poller.NewWithDomainSourceConfig(s.suite.ctx, cfg, sweepContractDomainSource{domain: s.domain})
	if err != nil {
		t.Fatalf("initialize sweep contract poller: %v", err)
	}
	pollerCtx, stopPoller := context.WithCancel(s.suite.ctx)
	errCh := make(chan error, 1)
	go func() {
		errCh <- p.Run(pollerCtx)
	}()
	waitForSmokeHealth(t, notifyListenURL+poller.HealthPath)
	t.Cleanup(func() {
		stopPoller()
		err := <-errCh
		if err != nil && !errors.Is(err, context.Canceled) {
			t.Errorf("poller stopped with error: %v", err)
		}
		if err := p.Close(context.Background()); err != nil {
			t.Errorf("close poller: %v", err)
		}
	})
	return p
}

func (s *sweepContractScenario) writeWorkerBundle(t *testing.T, subject string, messageID string, rawSHAOverride string) sweepContractBundle {
	t.Helper()

	bundle := s.newBundle(t, subject, messageID)
	if err := s.suite.archive.PutBytes(s.suite.ctx, bundle.Bundle.RawKey, "message/rfc822", bundle.RawMessage); err != nil {
		t.Fatalf("write raw archive: %v", err)
	}
	rawSHA := bundle.RawSHA256
	if rawSHAOverride != "" {
		rawSHA = rawSHAOverride
	}
	if err := s.suite.archive.PutJSON(s.suite.ctx, bundle.Bundle.EdgeKey, s.workerManifest(bundle, rawSHA)); err != nil {
		t.Fatalf("write edge archive: %v", err)
	}
	return bundle
}

func (s *sweepContractScenario) writeEdgeOnlyBundle(t *testing.T, subject string, messageID string, rawSHA string) sweepContractBundle {
	t.Helper()

	bundle := s.newBundle(t, subject, messageID)
	if err := s.suite.archive.PutJSON(s.suite.ctx, bundle.Bundle.EdgeKey, s.workerManifest(bundle, rawSHA)); err != nil {
		t.Fatalf("write edge-only archive: %v", err)
	}
	return bundle
}

func (s *sweepContractScenario) writeUnsupportedEdgeBundle(t *testing.T) sweepContractBundle {
	t.Helper()

	bundle := s.newBundle(t, "Unsupported edge", "<unsupported-edge@example.net>")
	if err := s.suite.archive.PutBytes(s.suite.ctx, bundle.Bundle.RawKey, "message/rfc822", bundle.RawMessage); err != nil {
		t.Fatalf("write unsupported raw archive: %v", err)
	}
	manifest := s.workerManifest(bundle, bundle.RawSHA256)
	manifest.Schema = "agent-mail.inbound.edge.v999"
	if err := s.suite.archive.PutJSON(s.suite.ctx, bundle.Bundle.EdgeKey, manifest); err != nil {
		t.Fatalf("write unsupported edge archive: %v", err)
	}
	return bundle
}

func (s *sweepContractScenario) writeMalformedEdgeBundle(t *testing.T) sweepContractBundle {
	t.Helper()

	bundle := s.newBundle(t, "Malformed edge", "<malformed-edge@example.net>")
	if err := s.suite.archive.PutBytes(s.suite.ctx, bundle.Bundle.RawKey, "message/rfc822", bundle.RawMessage); err != nil {
		t.Fatalf("write malformed raw archive: %v", err)
	}
	if err := s.suite.archive.PutBytes(s.suite.ctx, bundle.Bundle.EdgeKey, "application/json", []byte(`{"schema":`)); err != nil {
		t.Fatalf("write malformed edge archive: %v", err)
	}
	return bundle
}

func (s *sweepContractScenario) writeLocalRouteBundle(t *testing.T) sweepContractBundle {
	t.Helper()

	bundle := s.newBundle(t, "Local route marker", "<local-route@example.net>")
	if err := s.suite.archive.PutBytes(s.suite.ctx, bundle.Bundle.RawKey, "message/rfc822", bundle.RawMessage); err != nil {
		t.Fatalf("write local-route raw archive: %v", err)
	}
	edge := map[string]any{
		"schema":                     "agent-mail.inbound.local-route.edge.v1",
		"local_route_id":             bundle.IngestID,
		"raw_key":                    bundle.Bundle.RawKey,
		"raw_sha256":                 bundle.RawSHA256,
		"source_mailbox":             "media@" + s.domain,
		"source_domain":              s.domain,
		"target_mailbox":             s.mailbox,
		"target_domain":              s.domain,
		"visible_from":               "Sender <sender@example.net>",
		"visible_sender_domain":      "example.net",
		"zonemta_queue_id":           "local-route-queue-id",
		"source_ingest_id":           bundle.IngestID,
		"source_outbound_relay_key":  "mail/outbound/" + s.domain + "/2026/06/18/" + bundle.IngestID + "/relay.eml",
		"source_outbound_result_key": "mail/outbound/" + s.domain + "/2026/06/18/" + bundle.IngestID + "/result.json",
		"routed_at":                  bundle.ReceivedAt.Format(time.RFC3339),
	}
	if err := s.suite.archive.PutJSON(s.suite.ctx, bundle.Bundle.EdgeKey, edge); err != nil {
		t.Fatalf("write local-route edge archive: %v", err)
	}
	return bundle
}

func (s *sweepContractScenario) newBundle(t *testing.T, subject string, messageID string) sweepContractBundle {
	t.Helper()

	ingestID, err := r2archive.NewUUIDv7String()
	if err != nil {
		t.Fatalf("generate ingest id: %v", err)
	}
	receivedAt, err := r2archive.UUIDv7Time(ingestID)
	if err != nil {
		t.Fatalf("decode ingest id time: %v", err)
	}
	bundle, err := r2archive.InboundBundleKeys(s.domain, receivedAt, ingestID)
	if err != nil {
		t.Fatalf("build inbound bundle keys: %v", err)
	}
	raw := sweepContractRawMessage(s.mailbox, subject, messageID)
	return sweepContractBundle{
		IngestID:   ingestID,
		ReceivedAt: receivedAt,
		Bundle:     bundle,
		RawMessage: raw,
		RawSHA256:  sha256Hex(raw),
		MessageID:  messageID,
	}
}

func (s *sweepContractScenario) workerManifest(bundle sweepContractBundle, rawSHA string) poller.Manifest {
	return poller.Manifest{
		Schema:             r2archive.InboundEdgeSchema,
		IngestID:           bundle.IngestID,
		RawKey:             bundle.Bundle.RawKey,
		EdgeKey:            bundle.Bundle.EdgeKey,
		Mailbox:            s.mailbox,
		EnvelopeFrom:       "sender@example.net",
		EnvelopeTo:         s.mailbox,
		RecipientDomain:    s.domain,
		CloudflareZoneName: s.domain,
		WorkerName:         "sweep-contract-worker",
		ReceivedAt:         bundle.ReceivedAt,
		RawSHA256:          rawSHA,
		MessageID:          bundle.MessageID,
		ATMCFHeaders: map[string]string{
			"X-ATMCF-Edge-Action":        "worker",
			"X-ATMCF-Edge-Status":        "received",
			"X-ATMCF-Edge-Envelope-From": "sender@example.net",
			"X-ATMCF-Edge-Envelope-To":   s.mailbox,
			"X-ATMCF-Edge-Message-ID":    bundle.MessageID,
		},
	}
}

func (s *sweepContractScenario) notification(bundle sweepContractBundle) poller.Notification {
	return poller.Notification{
		Schema:          poller.FastPathSchema,
		IngestID:        bundle.IngestID,
		RecipientDomain: s.domain,
		RawKey:          bundle.Bundle.RawKey,
		EdgeKey:         bundle.Bundle.EdgeKey,
		ResultKey:       bundle.Bundle.ResultKey,
		ReceivedAt:      bundle.ReceivedAt,
		RawSHA256:       bundle.RawSHA256,
	}
}

func (s *sweepContractScenario) waitForSweep(t *testing.T, p *poller.Poller) {
	t.Helper()

	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		status := p.Status(s.suite.ctx)
		if status.LastSweepAt != nil {
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatal("timed out waiting for sweep pass")
}

func (s *sweepContractScenario) waitForWorkStatus(t *testing.T, ingestID string, want ...string) bson.M {
	t.Helper()

	wantSet := make(map[string]struct{}, len(want))
	for _, status := range want {
		wantSet[status] = struct{}{}
	}
	deadline := time.Now().Add(20 * time.Second)
	var lastStatus string
	var lastErr error
	for time.Now().Before(deadline) {
		work, err := s.findWorkItem(ingestID)
		if err == nil {
			lastStatus = sweepContractStringField(work, "status")
			if _, ok := wantSet[lastStatus]; ok {
				return work
			}
		} else {
			lastErr = err
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for work item %s status in %v; last status %q; last error %v", ingestID, want, lastStatus, lastErr)
	return nil
}

func (s *sweepContractScenario) readWorkItem(t *testing.T, ingestID string) bson.M {
	t.Helper()

	work, err := s.findWorkItem(ingestID)
	if err != nil {
		t.Fatalf("read work item %s: %v", ingestID, err)
	}
	return work
}

func (s *sweepContractScenario) findWorkItem(ingestID string) (bson.M, error) {
	var work bson.M
	err := s.suite.mongoClient.Database(s.controlDB).Collection("inbound_work_items").FindOne(s.suite.ctx, bson.D{{Key: "_id", Value: ingestID}}).Decode(&work)
	if err != nil {
		return nil, err
	}
	return work, nil
}

func (s *sweepContractScenario) assertNoWorkItem(t *testing.T, ingestID string) {
	t.Helper()

	collection := s.suite.mongoClient.Database(s.controlDB).Collection("inbound_work_items")
	count, err := collection.CountDocuments(s.suite.ctx, bson.D{{Key: "_id", Value: ingestID}})
	if err != nil {
		t.Fatalf("count work item %s: %v", ingestID, err)
	}
	if count != 0 {
		t.Fatalf("work item %s exists, want skipped without queue mutation", ingestID)
	}
}

func (s *sweepContractScenario) assertOneWorkItem(t *testing.T, ingestID string) {
	t.Helper()

	collection := s.suite.mongoClient.Database(s.controlDB).Collection("inbound_work_items")
	count, err := collection.CountDocuments(s.suite.ctx, bson.D{{Key: "_id", Value: ingestID}})
	if err != nil {
		t.Fatalf("count work item %s: %v", ingestID, err)
	}
	if count != 1 {
		t.Fatalf("work item %s count = %d, want 1", ingestID, count)
	}
}

func (s *sweepContractScenario) assertObjectAbsent(t *testing.T, key string) {
	t.Helper()

	exists, err := s.suite.archive.Exists(s.suite.ctx, key)
	if err != nil {
		t.Fatalf("head object %s: %v", key, err)
	}
	if exists {
		t.Fatalf("object %s exists, want absent", key)
	}
}

func (s *sweepContractScenario) waitForDiagnostic(t *testing.T, objectKey string) bson.M {
	t.Helper()

	collection := s.suite.mongoClient.Database(s.controlDB).Collection("discovery_diagnostics")
	deadline := time.Now().Add(10 * time.Second)
	var lastErr error
	for time.Now().Before(deadline) {
		var diagnostic bson.M
		err := collection.FindOne(s.suite.ctx, bson.D{{Key: "object_key", Value: objectKey}}).Decode(&diagnostic)
		if err == nil {
			if got := sweepContractStringField(diagnostic, "canonical_domain"); got != s.domain {
				t.Fatalf("diagnostic canonical_domain = %q, want %q", got, s.domain)
			}
			if got := sweepContractStringField(diagnostic, "failure_class"); got == "" {
				t.Fatalf("diagnostic %s missing failure_class: %#v", objectKey, diagnostic)
			}
			if got := sweepContractStringField(diagnostic, "last_error"); got == "" {
				t.Fatalf("diagnostic %s missing last_error: %#v", objectKey, diagnostic)
			}
			return diagnostic
		}
		lastErr = err
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for discovery diagnostic %s: %v", objectKey, lastErr)
	return nil
}

func (s *sweepContractScenario) assertRetryWaitState(t *testing.T, work bson.M, wantAttempts int) {
	t.Helper()

	if status := sweepContractStringField(work, "status"); status != "retry_wait" {
		t.Fatalf("work status = %q, want retry_wait", status)
	}
	if attempts := sweepContractIntField(work, "attempt_count"); attempts != wantAttempts {
		t.Fatalf("attempt_count = %d, want %d", attempts, wantAttempts)
	}
	sweepContractAssertNonEmptyStringField(t, work, "failure_class")
	sweepContractAssertNonEmptyStringField(t, work, "last_error")
	sweepContractAssertTimeField(t, work, "next_attempt_at")
	sweepContractAssertNoLease(t, work)
	if _, exists := work["blocked_at"]; exists && work["blocked_at"] != nil {
		t.Fatalf("blocked_at = %#v, want absent for retry_wait state", work["blocked_at"])
	}
}

func (s *sweepContractScenario) assertBlockedState(t *testing.T, work bson.M, wantAttempts int, wantFailureClass string) {
	t.Helper()

	if status := sweepContractStringField(work, "status"); status != "blocked" {
		t.Fatalf("work status = %q, want blocked", status)
	}
	if attempts := sweepContractIntField(work, "attempt_count"); attempts != wantAttempts {
		t.Fatalf("attempt_count = %d, want %d", attempts, wantAttempts)
	}
	if got := sweepContractStringField(work, "failure_class"); got != wantFailureClass {
		t.Fatalf("failure_class = %q, want %q", got, wantFailureClass)
	}
	sweepContractAssertNonEmptyStringField(t, work, "last_error")
	sweepContractAssertTimeField(t, work, "blocked_at")
	sweepContractAssertNoLease(t, work)
}

type sweepContractBundle struct {
	IngestID   string
	ReceivedAt time.Time
	Bundle     r2archive.InboundBundle
	RawMessage []byte
	RawSHA256  string
	MessageID  string
}

type sweepContractDomainSource struct {
	domain string
}

func (s sweepContractDomainSource) ActivePollerDomains(context.Context) ([]poller.Domain, error) {
	return []poller.Domain{{Name: s.domain, FeedbackAddress: "bounces@" + s.domain}}, nil
}

func sweepContractWildDuckServer(t *testing.T, expectedAccessToken string, userID string, mailbox string) *httptest.Server {
	t.Helper()

	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Header.Get("X-Access-Token") != expectedAccessToken {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"success":false,"error":"Unauthorized","code":"Unauthorized"}`))
			return
		}

		addressPath := "/addresses/resolve/"
		if r.Method != http.MethodGet || !strings.HasPrefix(r.URL.Path, addressPath) {
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"success":false,"error":"not found","code":"NotFound"}`))
			return
		}
		address := strings.TrimPrefix(r.URL.Path, addressPath)
		escapedAddress := strings.TrimPrefix(r.URL.EscapedPath(), addressPath)
		if address != mailbox && escapedAddress != strings.ReplaceAll(mailbox, "@", "%40") {
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"success":false,"error":"Address not found","code":"AddressNotFound"}`))
			return
		}
		_, _ = fmt.Fprintf(w, `{"success":true,"id":"address-sweep-contract","address":%q,"user":%q}`, mailbox, userID)
	}))
}

func sweepContractRawMessage(to string, subject string, messageID string) []byte {
	return []byte(strings.ReplaceAll(fmt.Sprintf(`From: Sender <sender@example.net>
To: Agent <%s>
Subject: %s
Message-ID: %s
Date: Thu, 18 Jun 2026 06:56:10 +0000
Content-Type: text/plain; charset=utf-8

hello from sweep contract
`, to, subject, messageID), "\n", "\r\n"))
}

func sweepContractStringField(doc bson.M, name string) string {
	value, _ := doc[name].(string)
	return value
}

func sweepContractIntField(doc bson.M, name string) int {
	switch value := doc[name].(type) {
	case int:
		return value
	case int32:
		return int(value)
	case int64:
		return int(value)
	case float64:
		return int(value)
	default:
		return 0
	}
}

func sweepContractAssertNonEmptyStringField(t *testing.T, doc bson.M, name string) {
	t.Helper()
	if value := sweepContractStringField(doc, name); value == "" {
		t.Fatalf("%s is empty in document %#v", name, doc)
	}
}

func sweepContractAssertTimeField(t *testing.T, doc bson.M, name string) {
	t.Helper()
	value, exists := doc[name]
	if !exists || value == nil {
		t.Fatalf("%s is missing in document %#v", name, doc)
	}
	switch value.(type) {
	case time.Time, bson.DateTime:
		return
	default:
		t.Fatalf("%s has type %T, want date/time in document %#v", name, value, doc)
	}
}

func sweepContractAssertNoLease(t *testing.T, doc bson.M) {
	t.Helper()
	if value, exists := doc["lease_id"]; exists && value != "" && value != nil {
		t.Fatalf("lease_id = %#v, want cleared in document %#v", value, doc)
	}
	if value, exists := doc["lease_until"]; exists && value != nil {
		t.Fatalf("lease_until = %#v, want cleared in document %#v", value, doc)
	}
}

func sweepContractSlug(value string) string {
	value = strings.ToLower(value)
	value = regexp.MustCompile(`[^a-z0-9-]+`).ReplaceAllString(value, "-")
	value = strings.Trim(value, "-")
	if value == "" {
		return "scenario"
	}
	if len(value) > 24 {
		return value[:24]
	}
	return value
}
