package smoke

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
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

func TestFastpathContractRejectsInvalidNotificationsBeforeQueueMutation(t *testing.T) {
	harness := fastpathContractStartHarness(t, "fastpath-invalid-notifications")

	baseNotification, baseBundle := fastpathContractNotification(t, smokeDomain)
	inactiveNotification, inactiveBundle := fastpathContractNotification(t, "inactive.example.test")
	validBody := fastpathContractJSONBody(t, baseNotification)
	now := time.Now().UTC()

	tests := []struct {
		name               string
		body               []byte
		contentType        string
		timestamp          string
		signingSecret      string
		signatureOverride  string
		signatureTransform func(string) string
		omitTimestamp      bool
		omitSignature      bool
		resultKey          string
		wantStatus         int
	}{
		{
			name:          "missing timestamp",
			body:          validBody,
			contentType:   "application/json",
			signingSecret: harness.notifyHMACSecret,
			omitTimestamp: true,
			wantStatus:    http.StatusUnauthorized,
		},
		{
			name:          "missing signature",
			body:          validBody,
			contentType:   "application/json",
			timestamp:     now.Format(time.RFC3339Nano),
			signingSecret: harness.notifyHMACSecret,
			omitSignature: true,
			wantStatus:    http.StatusUnauthorized,
		},
		{
			name:              "malformed signature",
			body:              validBody,
			contentType:       "application/json",
			timestamp:         now.Format(time.RFC3339Nano),
			signingSecret:     harness.notifyHMACSecret,
			signatureOverride: "not-hex",
			wantStatus:        http.StatusUnauthorized,
		},
		{
			name:               "non lowercase signature",
			body:               validBody,
			contentType:        "application/json",
			timestamp:          now.Format(time.RFC3339Nano),
			signingSecret:      harness.notifyHMACSecret,
			signatureTransform: strings.ToUpper,
			wantStatus:         http.StatusUnauthorized,
		},
		{
			name:          "invalid HMAC",
			body:          validBody,
			contentType:   "application/json",
			timestamp:     now.Format(time.RFC3339Nano),
			signingSecret: harness.notifyHMACSecret + "-wrong",
			wantStatus:    http.StatusUnauthorized,
		},
		{
			name:          "stale timestamp",
			body:          validBody,
			contentType:   "application/json",
			timestamp:     now.Add(-1 * time.Hour).Format(time.RFC3339Nano),
			signingSecret: harness.notifyHMACSecret,
			wantStatus:    http.StatusUnauthorized,
		},
		{
			name:          "future timestamp",
			body:          validBody,
			contentType:   "application/json",
			timestamp:     now.Add(1 * time.Hour).Format(time.RFC3339Nano),
			signingSecret: harness.notifyHMACSecret,
			wantStatus:    http.StatusUnauthorized,
		},
		{
			name:          "malformed JSON",
			body:          []byte(`{"schema":`),
			contentType:   "application/json",
			timestamp:     now.Format(time.RFC3339Nano),
			signingSecret: harness.notifyHMACSecret,
			wantStatus:    http.StatusBadRequest,
		},
		{
			name: "unknown JSON field",
			body: fastpathContractJSONBody(t, map[string]any{
				"schema":                      baseNotification.Schema,
				"organization_id":             baseNotification.OrganizationID,
				"organization_public_id":      baseNotification.OrganizationPublicID,
				"archive_prefix":              baseNotification.ArchivePrefix,
				"worker_connection_id":        baseNotification.WorkerConnectionID,
				"worker_domain_deployment_id": baseNotification.WorkerDomainDeploymentID,
				"ingest_id":                   baseNotification.IngestID,
				"recipient_domain":            baseNotification.RecipientDomain,
				"raw_key":                     baseNotification.RawKey,
				"edge_key":                    baseNotification.EdgeKey,
				"result_key":                  baseNotification.ResultKey,
				"received_at":                 baseNotification.ReceivedAt,
				"raw_sha256":                  baseNotification.RawSHA256,
				"unexpected":                  "metadata-not-in-contract",
			}),
			contentType:   "application/json",
			timestamp:     now.Format(time.RFC3339Nano),
			signingSecret: harness.notifyHMACSecret,
			wantStatus:    http.StatusBadRequest,
		},
		{
			name: "raw mail payload field",
			body: fastpathContractJSONBody(t, map[string]any{
				"schema":                      baseNotification.Schema,
				"organization_id":             baseNotification.OrganizationID,
				"organization_public_id":      baseNotification.OrganizationPublicID,
				"archive_prefix":              baseNotification.ArchivePrefix,
				"worker_connection_id":        baseNotification.WorkerConnectionID,
				"worker_domain_deployment_id": baseNotification.WorkerDomainDeploymentID,
				"ingest_id":                   baseNotification.IngestID,
				"recipient_domain":            baseNotification.RecipientDomain,
				"raw_key":                     baseNotification.RawKey,
				"edge_key":                    baseNotification.EdgeKey,
				"result_key":                  baseNotification.ResultKey,
				"received_at":                 baseNotification.ReceivedAt,
				"raw_sha256":                  baseNotification.RawSHA256,
				"raw_eml":                     "From: attacker@example.net\r\nTo: agent@example.test\r\n\r\nmust not be trusted",
			}),
			contentType:   "application/json",
			timestamp:     now.Format(time.RFC3339Nano),
			signingSecret: harness.notifyHMACSecret,
			wantStatus:    http.StatusBadRequest,
		},
		{
			name:          "oversized metadata body",
			body:          fastpathContractOversizedBody(),
			contentType:   "application/json",
			timestamp:     now.Format(time.RFC3339Nano),
			signingSecret: harness.notifyHMACSecret,
			wantStatus:    http.StatusRequestEntityTooLarge,
		},
		{
			name:          "non JSON content type",
			body:          validBody,
			contentType:   "text/plain",
			timestamp:     now.Format(time.RFC3339Nano),
			signingSecret: harness.notifyHMACSecret,
			wantStatus:    http.StatusUnsupportedMediaType,
		},
		{
			name: "wrong schema",
			body: fastpathContractJSONBody(t, fastpathContractWithNotificationChange(baseNotification, func(n *poller.Notification) {
				n.Schema = "agent-mail.inbound.edge.v1"
			})),
			contentType:   "application/json",
			timestamp:     now.Format(time.RFC3339Nano),
			signingSecret: harness.notifyHMACSecret,
			wantStatus:    http.StatusBadRequest,
		},
		{
			name: "uppercase SHA digest",
			body: fastpathContractJSONBody(t, fastpathContractWithNotificationChange(baseNotification, func(n *poller.Notification) {
				n.RawSHA256 = strings.ToUpper(n.RawSHA256)
			})),
			contentType:   "application/json",
			timestamp:     now.Format(time.RFC3339Nano),
			signingSecret: harness.notifyHMACSecret,
			wantStatus:    http.StatusBadRequest,
		},
		{
			name:          "invalid UUIDv7 ingest id",
			body:          fastpathContractJSONBody(t, fastpathContractInvalidUUIDNotification(t, baseNotification.ReceivedAt, baseNotification.RawSHA256)),
			contentType:   "application/json",
			timestamp:     now.Format(time.RFC3339Nano),
			signingSecret: harness.notifyHMACSecret,
			wantStatus:    http.StatusBadRequest,
		},
		{
			name: "mismatched key domain",
			body: fastpathContractJSONBody(t, fastpathContractWithNotificationChange(baseNotification, func(n *poller.Notification) {
				n.RawKey = strings.Replace(n.RawKey, "/"+smokeDomain+"/", "/other.test/", 1)
			})),
			contentType:   "application/json",
			timestamp:     now.Format(time.RFC3339Nano),
			signingSecret: harness.notifyHMACSecret,
			wantStatus:    http.StatusBadRequest,
		},
		{
			name: "mismatched key family",
			body: fastpathContractJSONBody(t, fastpathContractWithNotificationChange(baseNotification, func(n *poller.Notification) {
				other, _ := fastpathContractNotification(t, smokeDomain)
				n.EdgeKey = other.EdgeKey
			})),
			contentType:   "application/json",
			timestamp:     now.Format(time.RFC3339Nano),
			signingSecret: harness.notifyHMACSecret,
			wantStatus:    http.StatusBadRequest,
		},
		{
			name:          "inactive domain",
			body:          fastpathContractJSONBody(t, inactiveNotification),
			contentType:   "application/json",
			timestamp:     now.Format(time.RFC3339Nano),
			signingSecret: harness.notifyHMACSecret,
			resultKey:     inactiveBundle.ResultKey,
			wantStatus:    http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			beforeQueue := fastpathContractQueueCount(t, harness)
			beforeDeliveries := len(harness.smtpServer.Deliveries())

			status, responseBody := fastpathContractPostRaw(t, harness, tt.body, fastpathContractRequestOptions{
				contentType:        tt.contentType,
				timestamp:          tt.timestamp,
				signingSecret:      tt.signingSecret,
				signatureOverride:  tt.signatureOverride,
				signatureTransform: tt.signatureTransform,
				omitTimestamp:      tt.omitTimestamp,
				omitSignature:      tt.omitSignature,
			})
			if status != tt.wantStatus {
				t.Fatalf("HTTP status = %d, want %d; body: %s", status, tt.wantStatus, string(responseBody))
			}

			fastpathContractAssertNoQueueMutation(t, harness, beforeQueue)
			if deliveries := harness.smtpServer.Deliveries(); len(deliveries) != beforeDeliveries {
				t.Fatalf("SMTP deliveries = %d, want %d after rejected notification", len(deliveries), beforeDeliveries)
			}
			resultKey := tt.resultKey
			if resultKey == "" {
				resultKey = baseBundle.ResultKey
			}
			if exists := fastpathContractObjectExists(t, harness, resultKey); exists {
				t.Fatalf("result archive %s exists after rejected notification", resultKey)
			}
		})
	}
}

func TestFastpathContractDuplicateValidNotificationIsIdempotent(t *testing.T) {
	harness := fastpathContractStartHarness(t, "fastpath-duplicate-valid")
	notification, bundle := fastpathContractNotification(t, smokeDomain)
	rawMessage := []byte(strings.ReplaceAll(`From: Sender <sender@example.net>
To: Agent <agent@example.test>
Subject: Duplicate fast path contract
Message-ID: <fastpath-duplicate@example.net>
Date: Thu, 18 Jun 2026 06:56:10 +0000
Content-Type: text/plain; charset=utf-8

duplicate fast path contract
`, "\n", "\r\n"))
	notification.RawSHA256 = sha256Hex(rawMessage)
	fastpathContractWriteCommittedBundle(t, harness, notification, bundle, rawMessage)

	for i := 0; i < 2; i++ {
		status, responseBody := fastpathContractPostNotification(t, harness, notification)
		if status != http.StatusAccepted {
			t.Fatalf("duplicate pre-processing POST %d returned HTTP %d, want %d; body: %s", i+1, status, http.StatusAccepted, string(responseBody))
		}
	}

	receipt := waitForSmokeReceipt(t, harness.ctx, harness.archive, bundle.ResultKey)
	if receipt.Status != "delivered" {
		t.Fatalf("receipt status = %q, want delivered", receipt.Status)
	}
	fastpathContractAssertSingleQueueItem(t, harness, notification.IngestID)
	fastpathContractAssertDeliveryCount(t, harness, 1)
	resultBefore := fastpathContractObjectBytes(t, harness, bundle.ResultKey)

	status, responseBody := fastpathContractPostNotification(t, harness, notification)
	if status != http.StatusAccepted {
		t.Fatalf("duplicate post-completion POST returned HTTP %d, want %d; body: %s", status, http.StatusAccepted, string(responseBody))
	}
	fastpathContractAssertEventuallyDeliveryCount(t, harness, 1)
	fastpathContractAssertSingleQueueItem(t, harness, notification.IngestID)
	resultAfter := fastpathContractObjectBytes(t, harness, bundle.ResultKey)
	if !bytes.Equal(resultAfter, resultBefore) {
		t.Fatalf("result archive %s was rewritten after delivered duplicate notification\nbefore:\n%s\nafter:\n%s", bundle.ResultKey, resultBefore, resultAfter)
	}
}

type fastpathContractHarness struct {
	ctx              context.Context
	archive          *r2archive.Client
	mongoClient      *mongo.Client
	controlDB        string
	notifyEndpoint   string
	notifyHMACSecret string
	smtpServer       *smokeSMTPServer
}

type fastpathContractRequestOptions struct {
	contentType        string
	timestamp          string
	signingSecret      string
	signatureOverride  string
	signatureTransform func(string) string
	omitTimestamp      bool
	omitSignature      bool
}

func fastpathContractStartHarness(t *testing.T, scenario string) fastpathContractHarness {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	t.Cleanup(cancel)

	run := gotestingcontainer.NewRunArtifacts(t)
	scenarioDir := run.ScenarioDir(t, scenario)
	if err := os.MkdirAll(filepath.Join(scenarioDir, "objects"), 0o755); err != nil {
		t.Fatalf("create scenario object artifact dir: %v", err)
	}

	network := gotestingcontainer.NewScopedNetwork(t, ctx)
	mongoURI := startSmokeMongo(t, ctx, run, network)
	minio := startSmokeMinIO(t, ctx, run, network)
	if err := createSmokeBucket(ctx, minio.Endpoint, minio.Region, minio.Bucket, minio.AccessKeyID, minio.SecretAccessKey); err != nil {
		t.Fatalf("create fastpath contract bucket: %v", err)
	}

	t.Setenv("AGENT_MAIL_R2_ENDPOINT", minio.Endpoint)
	t.Setenv("AGENT_MAIL_R2_REGION", minio.Region)
	t.Setenv("AGENT_MAIL_R2_BUCKET", minio.Bucket)
	t.Setenv("AGENT_MAIL_R2_ACCESS_KEY_ID", minio.AccessKeyID)
	t.Setenv("AGENT_MAIL_R2_SECRET_ACCESS_KEY", minio.SecretAccessKey)

	notifyListenURL := "http://" + freeSmokeAddress(t)
	notifyHMACSecret := randomSmokeToken(t, "notify")
	wildduckAccessToken := randomSmokeToken(t, "wildduck")
	t.Setenv("AGENT_MAIL_CF_TUNNEL_LISTEN_URL", notifyListenURL)
	t.Setenv("AGENT_MAIL_CF_TUNNEL_EXTERNAL_URL", "https://mail-ingress.example.test/agent-mail/ingest/v1")
	t.Setenv("AGENT_MAIL_CF_TUNNEL_HMAC_SECRET", notifyHMACSecret)
	t.Setenv("AGENT_MAIL_WILDDUCK_ADMIN_ACCESS_TOKEN", wildduckAccessToken)

	wildduckDB := "wildduck_" + smokeRunID() + "_" + fastpathContractSlug(scenario)
	controlDB := "agent_mail_control_" + smokeRunID() + "_" + fastpathContractSlug(scenario)
	userID := bson.NewObjectID()
	mailboxID := bson.NewObjectID()
	wdServer := newSmokeWildDuckServer(t, wildduckAccessToken, userID.Hex())
	t.Cleanup(wdServer.Close)

	mongoClient, err := mongo.Connect(options.Client().ApplyURI(mongoURI))
	if err != nil {
		t.Fatalf("connect fastpath contract MongoDB: %v", err)
	}
	t.Cleanup(func() {
		_ = mongoClient.Disconnect(context.Background())
	})

	smtpServer := newSmokeSMTPServer(t, mongoClient.Database(wildduckDB).Collection("messages"), userID, mailboxID)
	t.Cleanup(smtpServer.Close)

	cfg := smokePollerConfig(mongoURI, controlDB, wildduckDB, wdServer.URL, smtpServer.Addr())
	p, err := poller.NewWithDomainSourceConfig(ctx, cfg, smokeDomainSource{})
	if err != nil {
		t.Fatalf("initialize fastpath contract poller: %v", err)
	}
	t.Cleanup(func() {
		_ = p.Close(context.Background())
	})

	pollerCtx, stopPoller := context.WithCancel(ctx)
	pollerErrCh := make(chan error, 1)
	go func() {
		pollerErrCh <- p.Run(pollerCtx)
	}()
	t.Cleanup(func() {
		stopPoller()
		err := <-pollerErrCh
		if err != nil && !errors.Is(err, context.Canceled) {
			t.Errorf("poller stopped with error: %v", err)
		}
	})

	waitForSmokeHealth(t, notifyListenURL+poller.HealthPath)

	archive, err := r2archive.New(ctx, r2archive.Config{
		Endpoint: minio.Endpoint,
		Region:   minio.Region,
		Bucket:   minio.Bucket,
	}, minio.AccessKeyID, minio.SecretAccessKey)
	if err != nil {
		t.Fatalf("create fastpath contract archive client: %v", err)
	}

	return fastpathContractHarness{
		ctx:              ctx,
		archive:          archive,
		mongoClient:      mongoClient,
		controlDB:        controlDB,
		notifyEndpoint:   notifyListenURL + poller.NotifyPath,
		notifyHMACSecret: notifyHMACSecret,
		smtpServer:       smtpServer,
	}
}

func fastpathContractNotification(t *testing.T, domain string) (poller.Notification, r2archive.InboundBundle) {
	t.Helper()
	ingestID, err := r2archive.NewUUIDv7String()
	if err != nil {
		t.Fatalf("generate fastpath contract ingest id: %v", err)
	}
	receivedAt, err := r2archive.UUIDv7Time(ingestID)
	if err != nil {
		t.Fatalf("decode fastpath contract ingest id time: %v", err)
	}
	bundle := smokeInboundBundleKeys(t, domain, receivedAt, ingestID)
	rawSHA := sha256.Sum256([]byte("fastpath contract raw placeholder"))
	return smokeNotificationForBundle(bundle, receivedAt, hex.EncodeToString(rawSHA[:])), bundle
}

func fastpathContractInvalidUUIDNotification(t *testing.T, receivedAt time.Time, rawSHA256 string) poller.Notification {
	t.Helper()

	invalidID := "018f0000-0000-6000-8000-000000000000"
	prefix := smokeArchivePrefix(t, smokeDomain) + "/" + receivedAt.UTC().Format("2006/01/02") + "/" + invalidID
	return poller.Notification{
		Schema:                   poller.FastPathSchema,
		OrganizationID:           smokeOrganizationID,
		OrganizationPublicID:     smokeOrganizationPublicID,
		ArchivePrefix:            smokeArchivePrefix(t, smokeDomain),
		WorkerConnectionID:       smokeWorkerConnectionID,
		WorkerDomainDeploymentID: smokeWorkerDomainDeploymentID,
		IngestID:                 invalidID,
		RecipientDomain:          smokeDomain,
		RawKey:                   prefix + "/raw.eml",
		EdgeKey:                  prefix + "/edge.json",
		ResultKey:                prefix + "/result.json",
		ReceivedAt:               receivedAt,
		RawSHA256:                rawSHA256,
	}
}

func fastpathContractWithNotificationChange(notification poller.Notification, change func(*poller.Notification)) poller.Notification {
	change(&notification)
	return notification
}

func fastpathContractWriteCommittedBundle(t *testing.T, harness fastpathContractHarness, notification poller.Notification, bundle r2archive.InboundBundle, rawMessage []byte) {
	t.Helper()
	if err := harness.archive.PutBytes(harness.ctx, bundle.RawKey, "message/rfc822", rawMessage); err != nil {
		t.Fatalf("write fastpath contract raw archive: %v", err)
	}
	manifest := poller.Manifest{
		Schema:             r2archive.InboundEdgeSchema,
		IngestID:           notification.IngestID,
		OrganizationID:     notification.OrganizationID,
		OrgPublicID:        notification.OrganizationPublicID,
		ArchivePrefix:      notification.ArchivePrefix,
		ConnectionID:       notification.WorkerConnectionID,
		DomainID:           notification.WorkerDomainDeploymentID,
		RawKey:             bundle.RawKey,
		EdgeKey:            bundle.EdgeKey,
		Mailbox:            "agent@example.test",
		EnvelopeFrom:       "sender@example.net",
		EnvelopeTo:         "agent@example.test",
		RecipientDomain:    smokeDomain,
		CloudflareZoneName: smokeDomain,
		WorkerName:         "fastpath-contract-worker",
		ReceivedAt:         notification.ReceivedAt,
		RawSHA256:          sha256Hex(rawMessage),
		MessageID:          "<fastpath-contract@example.net>",
		ATMCFHeaders: map[string]string{
			"X-ATMCF-Edge-Action":        "worker",
			"X-ATMCF-Edge-Status":        "received",
			"X-ATMCF-Edge-Envelope-From": "sender@example.net",
			"X-ATMCF-Edge-Envelope-To":   "agent@example.test",
			"X-ATMCF-Edge-Message-ID":    "<fastpath-contract@example.net>",
		},
	}
	if err := harness.archive.PutJSON(harness.ctx, bundle.EdgeKey, manifest); err != nil {
		t.Fatalf("write fastpath contract edge archive: %v", err)
	}
}

func fastpathContractPostNotification(t *testing.T, harness fastpathContractHarness, notification poller.Notification) (int, []byte) {
	t.Helper()
	return fastpathContractPostRaw(t, harness, fastpathContractJSONBody(t, notification), fastpathContractRequestOptions{
		contentType:   "application/json",
		timestamp:     time.Now().UTC().Format(time.RFC3339Nano),
		signingSecret: harness.notifyHMACSecret,
	})
}

func fastpathContractPostRaw(t *testing.T, harness fastpathContractHarness, body []byte, opts fastpathContractRequestOptions) (int, []byte) {
	t.Helper()
	request, err := http.NewRequestWithContext(harness.ctx, http.MethodPost, harness.notifyEndpoint, bytes.NewReader(body))
	if err != nil {
		t.Fatalf("create fastpath contract request: %v", err)
	}
	if opts.contentType != "" {
		request.Header.Set("Content-Type", opts.contentType)
	}
	timestamp := opts.timestamp
	if timestamp == "" {
		timestamp = time.Now().UTC().Format(time.RFC3339Nano)
	}
	signingSecret := opts.signingSecret
	if signingSecret == "" {
		signingSecret = harness.notifyHMACSecret
	}
	signature := opts.signatureOverride
	if signature == "" {
		signature = hex.EncodeToString(expectedSmokeSignature([]byte(signingSecret), timestamp, body))
	}
	if opts.signatureTransform != nil {
		signature = opts.signatureTransform(signature)
	}
	if !opts.omitTimestamp {
		request.Header.Set(poller.HeaderTimestamp, timestamp)
	}
	if !opts.omitSignature {
		request.Header.Set(poller.HeaderSignature, signature)
	}

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post fastpath contract notification: %v", err)
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read fastpath contract response body: %v", err)
	}
	return response.StatusCode, responseBody
}

func fastpathContractJSONBody(t *testing.T, value any) []byte {
	t.Helper()
	body, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal fastpath contract JSON body: %v", err)
	}
	return body
}

func fastpathContractOversizedBody() []byte {
	return []byte(`{"schema":"agent-mail.inbound.fastpath.v1","padding":"` + strings.Repeat("A", 2<<20) + `"}`)
}

func fastpathContractQueueCount(t *testing.T, harness fastpathContractHarness) int64 {
	t.Helper()
	count, err := harness.mongoClient.Database(harness.controlDB).Collection("inbound_work_items").CountDocuments(harness.ctx, bson.D{})
	if err != nil {
		t.Fatalf("count fastpath contract queue items: %v", err)
	}
	return count
}

func fastpathContractAssertNoQueueMutation(t *testing.T, harness fastpathContractHarness, before int64) {
	t.Helper()
	deadline := time.Now().Add(300 * time.Millisecond)
	for {
		after := fastpathContractQueueCount(t, harness)
		if after != before {
			t.Fatalf("queue item count = %d, want %d after rejected notification", after, before)
		}
		if time.Now().After(deadline) {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
}

func fastpathContractAssertSingleQueueItem(t *testing.T, harness fastpathContractHarness, ingestID string) {
	t.Helper()
	total := fastpathContractQueueCount(t, harness)
	if total != 1 {
		t.Fatalf("queue item count = %d, want 1", total)
	}
	matching, err := harness.mongoClient.Database(harness.controlDB).Collection("inbound_work_items").CountDocuments(harness.ctx, bson.D{{"_id", ingestID}})
	if err != nil {
		t.Fatalf("count fastpath contract queue item by ingest id: %v", err)
	}
	if matching != 1 {
		t.Fatalf("queue items for ingest id %s = %d, want 1", ingestID, matching)
	}
}

func fastpathContractAssertDeliveryCount(t *testing.T, harness fastpathContractHarness, want int) {
	t.Helper()
	if deliveries := harness.smtpServer.Deliveries(); len(deliveries) != want {
		t.Fatalf("SMTP deliveries = %d, want %d", len(deliveries), want)
	}
}

func fastpathContractAssertEventuallyDeliveryCount(t *testing.T, harness fastpathContractHarness, want int) {
	t.Helper()
	deadline := time.Now().Add(1 * time.Second)
	for {
		deliveries := harness.smtpServer.Deliveries()
		if len(deliveries) != want {
			t.Fatalf("SMTP deliveries = %d, want %d", len(deliveries), want)
		}
		if time.Now().After(deadline) {
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
}

func fastpathContractObjectExists(t *testing.T, harness fastpathContractHarness, key string) bool {
	t.Helper()
	exists, err := harness.archive.Exists(harness.ctx, key)
	if err != nil {
		t.Fatalf("check fastpath contract archive object %s: %v", key, err)
	}
	return exists
}

func fastpathContractObjectBytes(t *testing.T, harness fastpathContractHarness, key string) []byte {
	t.Helper()
	data, err := harness.archive.GetBytes(harness.ctx, key)
	if err != nil {
		t.Fatalf("read fastpath contract archive object %s: %v", key, err)
	}
	return data
}

func fastpathContractSlug(value string) string {
	value = strings.ToLower(value)
	value = strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			return r
		}
		return '_'
	}, value)
	value = strings.Trim(value, "_")
	if value == "" {
		return "scenario"
	}
	if len(value) > 16 {
		return value[:16]
	}
	return value
}
