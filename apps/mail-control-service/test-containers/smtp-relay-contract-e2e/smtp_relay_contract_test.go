package smtpcontract

import (
	"bufio"
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/smtp"
	"net/textproto"
	"os"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"agent-mail/internal/archive/r2archive"
	"agent-mail/internal/modules/smtprelay"
	gotestingcontainer "agent-mail/test-containers/go-testing-container"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/smithy-go"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func TestSMTPRelayProviderContracts(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	suite := newRelaySuite(t, ctx)
	fakeCloudflare := newFakeCloudflare(t)
	defer fakeCloudflare.Close()

	t.Run("unauthenticated MAIL FROM is rejected before archive mutation", func(t *testing.T) {
		server := suite.startRelay(t, relayScenarioConfig{
			CloudflareURL: fakeCloudflare.URL(),
		})
		err := smtpWithoutAuthMail(server.addr, "agent@example.com")
		if err == nil {
			t.Fatal("expected unauthenticated MAIL FROM rejection")
		}
		suite.assertNoOutboundResults(t, "example.com")
	})

	t.Run("external provider send archives relay provider payload and terminal result", func(t *testing.T) {
		fakeCloudflare.Enqueue(fakeCloudflareResponse{
			Delivered: []string{"recipient@example.net"},
		})
		server := suite.startRelay(t, relayScenarioConfig{
			CloudflareURL: fakeCloudflare.URL(),
		})

		raw := providerRelayMessage("provider-accepted-queue", "agent@example.com", "recipient@example.net", "Provider Accepted", []string{
			"X-ATM-Ingest-ID: internal-ingest-id",
			"X-ATMCF-Edge-Status: received",
			"X-Zone-Loop: loop",
			"X-Custom-Trace: keep-provider-trace",
		})
		if err := smtpSubmit(server.addr, relayUsername, relayPassword, "agent@example.com", []string{"recipient@example.net"}, raw); err != nil {
			t.Fatalf("provider SMTP submit returned error: %v", err)
		}

		receipt := suite.waitForOutboundReceipt(t, "example.com", "provider-accepted-queue", "provider_accepted")
		if receipt.RouteType != "provider" {
			t.Fatalf("route_type = %q, want provider", receipt.RouteType)
		}
		if receipt.Provider != "cloudflare" {
			t.Fatalf("provider = %q, want cloudflare", receipt.Provider)
		}
		if receipt.RelayRawKey == "" || receipt.ProviderPayloadKey == "" {
			t.Fatalf("provider receipt missing archive keys: %#v", receipt)
		}
		if receipt.ProviderBoundarySender != "agent@example.com" {
			t.Fatalf("provider boundary sender = %q, want agent@example.com", receipt.ProviderBoundarySender)
		}
		if len(receipt.Delivered) != 1 || receipt.Delivered[0] != "recipient@example.net" {
			t.Fatalf("delivered recipients = %#v, want recipient@example.net", receipt.Delivered)
		}

		relayRaw := suite.objectBytes(t, receipt.RelayRawKey)
		if !bytes.Equal(relayRaw, raw) {
			t.Fatalf("relay archive does not preserve exact accepted SMTP DATA\narchive:\n%s\nraw:\n%s", relayRaw, raw)
		}

		providerPayload := suite.objectBytes(t, receipt.ProviderPayloadKey)
		var payload struct {
			Headers map[string]string `json:"headers"`
		}
		if err := json.Unmarshal(providerPayload, &payload); err != nil {
			t.Fatalf("decode provider payload: %v\n%s", err, string(providerPayload))
		}
		if payload.Headers["X-Custom-Trace"] != "keep-provider-trace" {
			t.Fatalf("provider payload did not preserve allowed custom header: %#v", payload.Headers)
		}
		for _, forbidden := range []string{"X-ATM-Ingest-ID", "X-ATMCF-Edge-Status", "X-Zone-Loop", "X-Agent-Mail-ZoneMTA-Queue-ID"} {
			if _, ok := payload.Headers[forbidden]; ok {
				t.Fatalf("provider payload leaked forbidden header %s: %#v", forbidden, payload.Headers)
			}
		}
	})

	t.Run("provider permanent failure writes provider_failed result", func(t *testing.T) {
		fakeCloudflare.Enqueue(fakeCloudflareResponse{
			PermanentBounces: []string{"recipient@example.net"},
		})
		server := suite.startRelay(t, relayScenarioConfig{
			CloudflareURL: fakeCloudflare.URL(),
		})

		raw := providerRelayMessage("provider-failed-queue", "agent@example.com", "recipient@example.net", "Provider Failed", nil)
		err := smtpSubmit(server.addr, relayUsername, relayPassword, "agent@example.com", []string{"recipient@example.net"}, raw)
		if err == nil {
			t.Fatal("expected provider failure to surface to SMTP submit")
		}

		receipt := suite.waitForOutboundReceipt(t, "example.com", "provider-failed-queue", "provider_failed")
		if receipt.Error == "" {
			t.Fatalf("provider_failed receipt missing error: %#v", receipt)
		}
		if receipt.ProviderPayloadKey == "" {
			t.Fatalf("provider_failed receipt missing provider payload key: %#v", receipt)
		}
		if len(receipt.Delivered) != 0 {
			t.Fatalf("provider_failed delivered recipients = %#v, want none", receipt.Delivered)
		}
	})
}

func TestSMTPRelayLocalRoutingContracts(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	suite := newRelaySuite(t, ctx)
	fakeCloudflare := newFakeCloudflare(t)
	defer fakeCloudflare.Close()

	t.Run("all-local recipient routes internally without provider call", func(t *testing.T) {
		local := suite.newLocalRouteFixture(t, "local-route-delivered")
		server := suite.startRelay(t, relayScenarioConfig{
			CloudflareURL: fakeCloudflare.URL(),
			Local:         local,
		})
		sourceIngestID := newUUIDv7(t)
		raw := localRouteMessage(local.queueID, sourceIngestID, "sender@example.net", local.sourceMailbox, local.targetMailbox, "Local Route Delivered")

		beforeCloudflareCalls := len(fakeCloudflare.Calls())
		if err := smtpSubmit(server.addr, relayUsername, relayPassword, "srs@source.example.test", []string{local.targetMailbox}, raw); err != nil {
			t.Fatalf("local route SMTP submit returned error: %v", err)
		}

		if calls := fakeCloudflare.Calls(); len(calls) != beforeCloudflareCalls {
			t.Fatalf("cloudflare calls = %d, want unchanged %d for local route", len(calls), beforeCloudflareCalls)
		}
		receipt := suite.waitForOutboundReceipt(t, local.sourceDomain, local.queueID, "local_routed")
		if receipt.RouteType != "local" || receipt.Provider != "local" {
			t.Fatalf("local route receipt has route/provider %#v", receipt)
		}
		if receipt.ArchiveDomain != local.sourceDomain || receipt.TargetDomain != local.targetDomain {
			t.Fatalf("local route receipt wrong source/target domains: %#v", receipt)
		}
		if receipt.SourceInboundRawKey == "" || receipt.TargetInboundRawKey == "" || receipt.TargetInboundResultKey == "" {
			t.Fatalf("local route receipt missing inbound linkage keys: %#v", receipt)
		}

		deliveries := local.smtp.Deliveries()
		if len(deliveries) != 1 {
			t.Fatalf("local smtp deliveries = %d, want 1", len(deliveries))
		}
		if deliveries[0].MailFrom != "sender@example.net" {
			t.Fatalf("local smtp MAIL FROM = %q, want original replay envelope sender", deliveries[0].MailFrom)
		}
		if len(deliveries[0].RcptTo) != 1 || deliveries[0].RcptTo[0] != local.targetMailbox {
			t.Fatalf("local smtp RCPT TO = %#v, want %s", deliveries[0].RcptTo, local.targetMailbox)
		}

		targetRaw := suite.objectBytes(t, receipt.TargetInboundRawKey)
		if !messageHasHeader(targetRaw, "X-Agent-Mail-Local-Route-ID", receipt.LocalRouteID) {
			t.Fatalf("target raw missing local route id %q:\n%s", receipt.LocalRouteID, string(targetRaw))
		}
		if !messageHasHeader(targetRaw, "X-Agent-Mail-Source-Mailbox", local.sourceMailbox) {
			t.Fatalf("target raw missing source mailbox:\n%s", string(targetRaw))
		}
		targetEdge := suite.objectMap(t, receipt.TargetInboundEdgeKey)
		if targetEdge["schema"] != r2archive.InboundLocalRouteEdgeSchema {
			t.Fatalf("target edge schema = %#v, want %s", targetEdge["schema"], r2archive.InboundLocalRouteEdgeSchema)
		}
		targetResult := suite.objectMap(t, receipt.TargetInboundResultKey)
		if targetResult["status"] != "local_routed_delivered" || targetResult["delivery_source"] != "local_route" {
			t.Fatalf("target result did not record local route delivery: %#v", targetResult)
		}
	})

	t.Run("null replay sender becomes null local delivery reverse path", func(t *testing.T) {
		local := suite.newLocalRouteFixture(t, "local-route-null-sender")
		server := suite.startRelay(t, relayScenarioConfig{
			CloudflareURL: fakeCloudflare.URL(),
			Local:         local,
		})
		sourceIngestID := newUUIDv7(t)
		raw := localRouteMessage(local.queueID, sourceIngestID, "<>", local.sourceMailbox, local.targetMailbox, "Local Route Null Sender")

		if err := smtpSubmit(server.addr, relayUsername, relayPassword, "srs@source.example.test", []string{local.targetMailbox}, raw); err != nil {
			t.Fatalf("local route null sender SMTP submit returned error: %v", err)
		}

		receipt := suite.waitForOutboundReceipt(t, local.sourceDomain, local.queueID, "local_routed")
		if receipt.LocalRouteID == "" {
			t.Fatalf("local route receipt missing route id: %#v", receipt)
		}
		deliveries := local.smtp.Deliveries()
		if len(deliveries) != 1 {
			t.Fatalf("local smtp deliveries = %d, want 1", len(deliveries))
		}
		if deliveries[0].MailFrom != "" {
			t.Fatalf("local smtp MAIL FROM = %q, want null reverse path", deliveries[0].MailFrom)
		}
	})

	t.Run("existing local-route proof is reused without duplicate local delivery", func(t *testing.T) {
		local := suite.newLocalRouteFixture(t, "local-route-existing-proof")
		server := suite.startRelay(t, relayScenarioConfig{
			CloudflareURL: fakeCloudflare.URL(),
			Local:         local,
		})
		sourceIngestID := newUUIDv7(t)
		messageID := "<existing-local-route@" + local.sourceDomain + ">"
		existingRouteID := newUUIDv7(t)
		local.seedExistingRouteProof(t, existingRouteID, local.queueID, sourceIngestID, messageID)
		raw := localRouteMessageWithMessageID(local.queueID, sourceIngestID, "sender@example.net", local.sourceMailbox, local.targetMailbox, "Existing Local Route", messageID)

		if err := smtpSubmit(server.addr, relayUsername, relayPassword, "srs@source.example.test", []string{local.targetMailbox}, raw); err != nil {
			t.Fatalf("existing local route SMTP submit returned error: %v", err)
		}

		receipt := suite.waitForOutboundReceipt(t, local.sourceDomain, local.queueID, "local_routed")
		if receipt.LocalRouteID != existingRouteID {
			t.Fatalf("local route id = %q, want existing proof route id %q", receipt.LocalRouteID, existingRouteID)
		}
		if deliveries := local.smtp.Deliveries(); len(deliveries) != 0 {
			t.Fatalf("local smtp deliveries = %d, want 0 when existing proof is reused", len(deliveries))
		}
		targetResult := suite.objectMap(t, receipt.TargetInboundResultKey)
		if targetResult["delivery_source"] != "existing" {
			t.Fatalf("target result delivery_source = %#v, want existing: %#v", targetResult["delivery_source"], targetResult)
		}
	})
}

const (
	relayUsername = "zonemta"
	relayPassword = "agent-mail-zonemta-relay"
)

type relaySuite struct {
	ctx      context.Context
	run      gotestingcontainer.RunArtifacts
	archive  *r2archive.Client
	minio    relayMinIO
	mongo    *mongo.Client
	mongoURI string
}

type relayMinIO struct {
	Endpoint        string
	Region          string
	Bucket          string
	AccessKeyID     string
	SecretAccessKey string
}

func newRelaySuite(t *testing.T, ctx context.Context) *relaySuite {
	t.Helper()

	run := gotestingcontainer.NewRunArtifacts(t)
	_ = run.ScenarioDir(t, "smtp-relay-contract")
	network := gotestingcontainer.NewScopedNetwork(t, ctx)
	mongoURI := startRelayMongo(t, ctx, run, network)
	minio := startRelayMinIO(t, ctx, run, network)
	if err := createRelayBucket(ctx, minio.Endpoint, minio.Region, minio.Bucket, minio.AccessKeyID, minio.SecretAccessKey); err != nil {
		t.Fatalf("create relay bucket: %v", err)
	}
	archive, err := r2archive.New(ctx, r2archive.Config{
		Endpoint: minio.Endpoint,
		Region:   minio.Region,
		Bucket:   minio.Bucket,
	}, minio.AccessKeyID, minio.SecretAccessKey)
	if err != nil {
		t.Fatalf("create relay archive client: %v", err)
	}
	mongoClient, err := mongo.Connect(options.Client().ApplyURI(mongoURI))
	if err != nil {
		t.Fatalf("connect relay MongoDB: %v", err)
	}
	t.Cleanup(func() {
		_ = mongoClient.Disconnect(context.Background())
	})

	t.Setenv("AGENT_MAIL_R2_ENDPOINT", minio.Endpoint)
	t.Setenv("AGENT_MAIL_R2_REGION", minio.Region)
	t.Setenv("AGENT_MAIL_R2_BUCKET", minio.Bucket)
	t.Setenv("AGENT_MAIL_R2_ACCESS_KEY_ID", minio.AccessKeyID)
	t.Setenv("AGENT_MAIL_R2_SECRET_ACCESS_KEY", minio.SecretAccessKey)
	t.Setenv("AGENT_MAIL_OUTBOUND_PROVIDER", "cloudflare")
	t.Setenv("AGENT_MAIL_CLOUDFLARE_API_TOKEN", "relay-cloudflare-token")
	t.Setenv("AGENT_MAIL_CLOUDFLARE_ACCOUNT_ID", "relay-account")

	return &relaySuite{
		ctx:      ctx,
		run:      run,
		archive:  archive,
		minio:    minio,
		mongo:    mongoClient,
		mongoURI: mongoURI,
	}
}

type relayScenarioConfig struct {
	CloudflareURL string
	Local         *localRouteFixture
}

type runningRelay struct {
	addr string
}

func (s *relaySuite) startRelay(t *testing.T, scenario relayScenarioConfig) runningRelay {
	t.Helper()

	listenAddr := freeRelayAddress(t)
	cfg := smtprelay.Config{
		ListenAddress: listenAddr,
		Hostname:      "mail-control-relay.test",
		RelayAuth: smtprelay.RelayAuthConfig{
			Username: relayUsername,
			Password: relayPassword,
		},
	}
	cfg.Cloudflare.APIBaseURL = scenario.CloudflareURL
	cfg.Delivery.Domains = []smtprelay.DeliveryDomain{
		{
			Name: "example.com",
			Outbound: smtprelay.DeliveryOutbound{
				SenderDomain: "example.com",
			},
		},
	}
	resolver := relayResolver{}
	if scenario.Local != nil {
		local := scenario.Local
		t.Setenv("AGENT_MAIL_WILDDUCK_ADMIN_ACCESS_TOKEN", local.wildduckToken)
		cfg.LocalDelivery.SMTPAddress = local.smtp.Addr()
		cfg.LocalDelivery.HelloName = "mail-control-relay.test"
		cfg.LocalDelivery.APIBaseURL = local.wildduck.URL
		cfg.LocalDelivery.MongoURI = s.mongoURI
		cfg.LocalDelivery.MongoDatabase = local.wildduckDB
		cfg.Delivery.Domains = []smtprelay.DeliveryDomain{
			{Name: local.sourceDomain, Outbound: smtprelay.DeliveryOutbound{SenderDomain: local.sourceDomain}},
			{Name: local.targetDomain, Outbound: smtprelay.DeliveryOutbound{SenderDomain: local.targetDomain}},
		}
		resolver.localDomains = map[string]struct{}{
			local.sourceDomain: {},
			local.targetDomain: {},
		}
	}

	server, err := smtprelay.NewWithSESReturnPathResolverConfig(s.ctx, cfg, resolver)
	if err != nil {
		t.Fatalf("initialize SMTP relay: %v", err)
	}
	relayCtx, stopRelay := context.WithCancel(s.ctx)
	errCh := make(chan error, 1)
	go func() {
		errCh <- server.Run(relayCtx)
	}()
	waitForRelayListen(t, listenAddr)
	t.Cleanup(func() {
		stopRelay()
		err := <-errCh
		if err != nil && !errors.Is(err, context.Canceled) {
			t.Errorf("SMTP relay stopped with error: %v", err)
		}
		if err := server.Close(context.Background()); err != nil {
			t.Errorf("close SMTP relay: %v", err)
		}
	})
	return runningRelay{addr: listenAddr}
}

func (s *relaySuite) newLocalRouteFixture(t *testing.T, name string) *localRouteFixture {
	t.Helper()

	slug := relaySlug(name)
	sourceDomain := "source-" + slug + ".example.test"
	targetDomain := "target-" + slug + ".example.test"
	userID := bson.NewObjectID()
	mailboxID := bson.NewObjectID()
	wildduckDB := "wildduck_" + slug + "_" + relayRunID()
	wildduckToken := "wildduck-" + randomRelayHex(t, 16)
	targetMailbox := "target@" + targetDomain
	wildduck := newRelayWildDuckServer(t, wildduckToken, map[string]string{
		targetMailbox: userID.Hex(),
	})
	t.Cleanup(wildduck.Close)
	localSMTP := newRelayLocalSMTPServer(t, s.mongo.Database(wildduckDB).Collection("messages"), userID, mailboxID)
	t.Cleanup(localSMTP.Close)

	return &localRouteFixture{
		suite:         s,
		sourceDomain:  sourceDomain,
		targetDomain:  targetDomain,
		sourceMailbox: "media@" + sourceDomain,
		targetMailbox: targetMailbox,
		queueID:       "queue-" + slug,
		wildduckDB:    wildduckDB,
		wildduckToken: wildduckToken,
		wildduck:      wildduck,
		smtp:          localSMTP,
		userID:        userID,
		mailboxID:     mailboxID,
	}
}

func (s *relaySuite) waitForOutboundReceipt(t *testing.T, domain string, queueID string, wantStatus string) smtprelay.OutboundReceipt {
	t.Helper()

	prefix := "mail/outbound/" + domain + "/"
	deadline := time.Now().Add(30 * time.Second)
	var lastErr error
	for time.Now().Before(deadline) {
		list, err := s.archive.List(s.ctx, prefix, nil)
		if err != nil {
			lastErr = err
			time.Sleep(250 * time.Millisecond)
			continue
		}
		for _, object := range list.Contents {
			if object.Key == nil || !strings.HasSuffix(*object.Key, "/result.json") {
				continue
			}
			data, err := s.archive.GetBytes(s.ctx, *object.Key)
			if err != nil {
				lastErr = err
				continue
			}
			var receipt smtprelay.OutboundReceipt
			if err := json.Unmarshal(data, &receipt); err != nil {
				t.Fatalf("decode outbound receipt %s: %v\n%s", *object.Key, err, string(data))
			}
			if receipt.ZoneMTAQueueID != queueID {
				continue
			}
			if receipt.Status != wantStatus {
				t.Fatalf("outbound receipt status = %q, want %q\n%s", receipt.Status, wantStatus, string(data))
			}
			return receipt
		}
		time.Sleep(250 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for outbound result domain=%s queue=%s status=%s: %v", domain, queueID, wantStatus, lastErr)
	return smtprelay.OutboundReceipt{}
}

func (s *relaySuite) assertNoOutboundResults(t *testing.T, domain string) {
	t.Helper()
	list, err := s.archive.List(s.ctx, "mail/outbound/"+domain+"/", nil)
	if err != nil {
		t.Fatalf("list outbound archive: %v", err)
	}
	for _, object := range list.Contents {
		if object.Key != nil && strings.HasSuffix(*object.Key, "/result.json") {
			t.Fatalf("found outbound result %s, want none", *object.Key)
		}
	}
}

func (s *relaySuite) objectBytes(t *testing.T, key string) []byte {
	t.Helper()
	data, err := s.archive.GetBytes(s.ctx, key)
	if err != nil {
		t.Fatalf("read object %s: %v", key, err)
	}
	return data
}

func (s *relaySuite) objectMap(t *testing.T, key string) map[string]any {
	t.Helper()
	data := s.objectBytes(t, key)
	var decoded map[string]any
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("decode object %s: %v\n%s", key, err, string(data))
	}
	return decoded
}

type localRouteFixture struct {
	suite         *relaySuite
	sourceDomain  string
	targetDomain  string
	sourceMailbox string
	targetMailbox string
	queueID       string
	wildduckDB    string
	wildduckToken string
	wildduck      *httptest.Server
	smtp          *relayLocalSMTPServer
	userID        bson.ObjectID
	mailboxID     bson.ObjectID
}

func (f *localRouteFixture) seedExistingRouteProof(t *testing.T, routeID string, queueID string, sourceIngestID string, messageID string) {
	t.Helper()
	messageObjectID := bson.NewObjectID()
	_, err := f.suite.mongo.Database(f.wildduckDB).Collection("messages").InsertOne(f.suite.ctx, bson.D{
		{"_id", messageObjectID},
		{"user", f.userID},
		{"mailbox", f.mailboxID},
		{"mimeTree", bson.D{{"header", bson.A{
			"X-Agent-Mail-Local-Route-ID: " + routeID,
			"X-Agent-Mail-ZoneMTA-Queue-ID: " + queueID,
			"X-Agent-Mail-Source-Ingest-ID: " + sourceIngestID,
			"Message-ID: " + messageID,
		}}}},
		{"created", time.Now().UTC()},
	})
	if err != nil {
		t.Fatalf("seed existing local route proof: %v", err)
	}
}

type relayResolver struct {
	localDomains map[string]struct{}
}

func (r relayResolver) SESFeedbackReturnPath(_ context.Context, senderDomain string) (string, error) {
	return "bounces@" + senderDomain, nil
}

func (r relayResolver) LocalRecipientDomain(_ context.Context, recipientDomain string) (bool, error) {
	_, ok := r.localDomains[recipientDomain]
	return ok, nil
}

type fakeCloudflare struct {
	t         *testing.T
	server    *httptest.Server
	mu        sync.Mutex
	responses []fakeCloudflareResponse
	calls     []fakeCloudflareCall
}

type fakeCloudflareResponse struct {
	Delivered        []string
	Queued           []string
	PermanentBounces []string
}

type fakeCloudflareCall struct {
	Path string
	Body []byte
}

func newFakeCloudflare(t *testing.T) *fakeCloudflare {
	t.Helper()
	fake := &fakeCloudflare{t: t}
	fake.server = httptest.NewServer(http.HandlerFunc(fake.handle))
	return fake
}

func (f *fakeCloudflare) URL() string {
	return f.server.URL
}

func (f *fakeCloudflare) Close() {
	f.server.Close()
}

func (f *fakeCloudflare) Enqueue(response fakeCloudflareResponse) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.responses = append(f.responses, response)
}

func (f *fakeCloudflare) Calls() []fakeCloudflareCall {
	f.mu.Lock()
	defer f.mu.Unlock()
	calls := make([]fakeCloudflareCall, len(f.calls))
	copy(calls, f.calls)
	return calls
}

func (f *fakeCloudflare) handle(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		f.t.Fatalf("read fake Cloudflare request: %v", err)
	}
	f.mu.Lock()
	f.calls = append(f.calls, fakeCloudflareCall{Path: r.URL.Path, Body: append([]byte(nil), body...)})
	response := fakeCloudflareResponse{}
	if len(f.responses) > 0 {
		response = f.responses[0]
		f.responses = f.responses[1:]
	}
	f.mu.Unlock()

	if response.Delivered == nil && response.Queued == nil && response.PermanentBounces == nil {
		var payload struct {
			To         []string `json:"to"`
			CC         []string `json:"cc"`
			BCC        []string `json:"bcc"`
			Recipients []string `json:"recipients"`
		}
		_ = json.Unmarshal(body, &payload)
		response.Delivered = append(append(append([]string{}, payload.To...), payload.CC...), payload.BCC...)
		response.Delivered = append(response.Delivered, payload.Recipients...)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"success": true,
		"result": map[string]any{
			"delivered":         response.Delivered,
			"queued":            response.Queued,
			"permanent_bounces": response.PermanentBounces,
		},
	})
}

type relayLocalSMTPServer struct {
	t          *testing.T
	listener   net.Listener
	messages   *mongo.Collection
	userID     bson.ObjectID
	mailboxID  bson.ObjectID
	mu         sync.Mutex
	deliveries []relaySMTPDelivery
	done       chan struct{}
}

type relaySMTPDelivery struct {
	MailFrom   string
	RcptTo     []string
	RawMessage []byte
}

func newRelayLocalSMTPServer(t *testing.T, messages *mongo.Collection, userID bson.ObjectID, mailboxID bson.ObjectID) *relayLocalSMTPServer {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen local relay SMTP: %v", err)
	}
	server := &relayLocalSMTPServer{
		t:         t,
		listener:  listener,
		messages:  messages,
		userID:    userID,
		mailboxID: mailboxID,
		done:      make(chan struct{}),
	}
	go server.serve()
	return server
}

func (s *relayLocalSMTPServer) Addr() string {
	return s.listener.Addr().String()
}

func (s *relayLocalSMTPServer) Close() {
	_ = s.listener.Close()
	<-s.done
}

func (s *relayLocalSMTPServer) Deliveries() []relaySMTPDelivery {
	s.mu.Lock()
	defer s.mu.Unlock()
	deliveries := make([]relaySMTPDelivery, len(s.deliveries))
	copy(deliveries, s.deliveries)
	return deliveries
}

func (s *relayLocalSMTPServer) serve() {
	defer close(s.done)
	for {
		conn, err := s.listener.Accept()
		if err != nil {
			return
		}
		go s.handleConn(conn)
	}
}

func (s *relayLocalSMTPServer) handleConn(conn net.Conn) {
	defer conn.Close()
	reader := textproto.NewReader(bufio.NewReader(conn))
	bufferedWriter := bufio.NewWriter(conn)
	writer := textproto.NewWriter(bufferedWriter)
	send := func(format string, args ...any) {
		_ = writer.PrintfLine(format, args...)
		_ = bufferedWriter.Flush()
	}
	send("220 local relay smtp ready")

	var mailFrom string
	var rcptTo []string
	for {
		line, err := reader.ReadLine()
		if err != nil {
			return
		}
		upper := strings.ToUpper(line)
		switch {
		case strings.HasPrefix(upper, "HELO ") || strings.HasPrefix(upper, "EHLO "):
			send("250 local relay smtp")
		case strings.HasPrefix(upper, "MAIL FROM:"):
			mailFrom = cleanSMTPPath(line[len("MAIL FROM:"):])
			send("250 ok")
		case strings.HasPrefix(upper, "RCPT TO:"):
			rcptTo = append(rcptTo, cleanSMTPPath(line[len("RCPT TO:"):]))
			send("250 ok")
		case upper == "DATA":
			send("354 end with dot")
			raw, err := readSMTPData(reader)
			if err != nil {
				send("451 read failed")
				return
			}
			if err := s.recordDelivery(context.Background(), mailFrom, rcptTo, raw); err != nil {
				send("451 delivery failed")
				return
			}
			send("250 queued")
		case upper == "QUIT":
			send("221 bye")
			return
		case upper == "RSET":
			mailFrom = ""
			rcptTo = nil
			send("250 reset")
		default:
			send("250 ok")
		}
	}
}

func (s *relayLocalSMTPServer) recordDelivery(ctx context.Context, mailFrom string, rcptTo []string, raw []byte) error {
	headers := rawHeaderLines(raw)
	headerValues := make(bson.A, 0, len(headers))
	for _, header := range headers {
		headerValues = append(headerValues, header)
	}
	messageID := bson.NewObjectID()
	_, err := s.messages.InsertOne(ctx, bson.D{
		{"_id", messageID},
		{"user", s.userID},
		{"mailbox", s.mailboxID},
		{"mimeTree", bson.D{{"header", headerValues}}},
		{"created", time.Now().UTC()},
	})
	if err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.deliveries = append(s.deliveries, relaySMTPDelivery{
		MailFrom:   mailFrom,
		RcptTo:     append([]string(nil), rcptTo...),
		RawMessage: append([]byte(nil), raw...),
	})
	return nil
}

func startRelayMongo(t *testing.T, ctx context.Context, run gotestingcontainer.RunArtifacts, network *gotestingcontainer.DockerNetwork) string {
	t.Helper()
	image := envDefault("AGENTTEAM_EMAIL_DEV_MONGO_IMAGE", "docker.io/library/mongo:8.2.7")
	container := run.StartContainer(t, ctx, gotestingcontainer.ContainerRequest{
		Name:           "mongodb",
		Image:          image,
		LogRelPath:     "containers/mongodb.log",
		Network:        network,
		NetworkAliases: []string{"mongodb"},
		ExposedPorts:   []string{"27017/tcp"},
		WaitStrategy:   gotestingcontainer.WaitForListeningPort("27017/tcp", 60*time.Second),
	})
	host, port := mappedRelayEndpoint(t, ctx, container, "27017/tcp")
	return fmt.Sprintf("mongodb://%s:%s/?directConnection=true", host, port)
}

func startRelayMinIO(t *testing.T, ctx context.Context, run gotestingcontainer.RunArtifacts, network *gotestingcontainer.DockerNetwork) relayMinIO {
	t.Helper()
	image := envDefault("AGENTTEAM_EMAIL_SMOKE_MINIO_IMAGE", "docker.io/minio/minio:RELEASE.2025-09-07T16-13-09Z")
	service := relayMinIO{
		Region:          "us-east-1",
		Bucket:          "mail-relay-contract-" + relayRunSlug(),
		AccessKeyID:     "minio" + randomRelayHex(t, 8),
		SecretAccessKey: "minio" + randomRelayHex(t, 24),
	}
	container := run.StartContainer(t, ctx, gotestingcontainer.ContainerRequest{
		Name:           "minio",
		Image:          image,
		LogRelPath:     "containers/minio.log",
		Network:        network,
		NetworkAliases: []string{"minio"},
		ExposedPorts:   []string{"9000/tcp"},
		Env: map[string]string{
			"MINIO_ROOT_USER":     service.AccessKeyID,
			"MINIO_ROOT_PASSWORD": service.SecretAccessKey,
		},
		Cmd:          []string{"server", "/data", "--console-address", ":9001"},
		WaitStrategy: gotestingcontainer.WaitForHTTP("/minio/health/ready", "9000/tcp", 60*time.Second),
	})
	host, port := mappedRelayEndpoint(t, ctx, container, "9000/tcp")
	service.Endpoint = fmt.Sprintf("http://%s:%s", host, port)
	return service
}

func mappedRelayEndpoint(t *testing.T, ctx context.Context, container gotestingcontainer.Container, port string) (string, string) {
	t.Helper()
	host, err := container.Host(ctx)
	if err != nil {
		t.Fatalf("resolve container host for %s: %v", port, err)
	}
	mappedPort, err := container.MappedPort(ctx, port)
	if err != nil {
		t.Fatalf("resolve mapped port for %s: %v", port, err)
	}
	return host, mappedPort.Port()
}

func createRelayBucket(ctx context.Context, endpoint string, region string, bucket string, accessKeyID string, secretAccessKey string) error {
	awsCfg, err := awsconfig.LoadDefaultConfig(
		ctx,
		awsconfig.WithRegion(region),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKeyID, secretAccessKey, "")),
	)
	if err != nil {
		return err
	}
	client := s3.NewFromConfig(awsCfg, func(opts *s3.Options) {
		opts.BaseEndpoint = aws.String(endpoint)
		opts.UsePathStyle = true
	})
	_, err = client.CreateBucket(ctx, &s3.CreateBucketInput{Bucket: aws.String(bucket)})
	if err != nil {
		var apiErr smithy.APIError
		if errors.As(err, &apiErr) && (apiErr.ErrorCode() == "BucketAlreadyOwnedByYou" || apiErr.ErrorCode() == "BucketAlreadyExists") {
			return nil
		}
		return err
	}
	return nil
}

func newRelayWildDuckServer(t *testing.T, expectedAccessToken string, usersByAddress map[string]string) *httptest.Server {
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
		address := strings.TrimPrefix(r.URL.EscapedPath(), addressPath)
		address = strings.ReplaceAll(address, "%40", "@")
		userID := usersByAddress[address]
		if userID == "" {
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"success":false,"error":"Address not found","code":"AddressNotFound"}`))
			return
		}
		_, _ = fmt.Fprintf(w, `{"success":true,"id":"address-%s","address":%q,"user":%q}`, relaySlug(address), address, userID)
	}))
}

func smtpSubmit(addr string, username string, password string, mailFrom string, recipients []string, raw []byte) error {
	client, err := smtp.Dial(addr)
	if err != nil {
		return err
	}
	defer client.Close()
	if err := client.Hello("zonemta-relay-contract.test"); err != nil {
		return err
	}
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return err
	}
	if err := client.Auth(smtp.PlainAuth("", username, password, host)); err != nil {
		return err
	}
	if err := client.Mail(mailFrom); err != nil {
		return err
	}
	for _, recipient := range recipients {
		if err := client.Rcpt(recipient); err != nil {
			return err
		}
	}
	writer, err := client.Data()
	if err != nil {
		return err
	}
	if _, err := writer.Write(raw); err != nil {
		_ = writer.Close()
		return err
	}
	if err := writer.Close(); err != nil {
		return err
	}
	return client.Quit()
}

func smtpWithoutAuthMail(addr string, mailFrom string) error {
	client, err := smtp.Dial(addr)
	if err != nil {
		return err
	}
	defer client.Close()
	if err := client.Hello("zonemta-relay-contract.test"); err != nil {
		return err
	}
	return client.Mail(mailFrom)
}

func waitForRelayListen(t *testing.T, addr string) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	var lastErr error
	for time.Now().Before(deadline) {
		conn, err := net.DialTimeout("tcp", addr, 250*time.Millisecond)
		if err == nil {
			_ = conn.Close()
			return
		}
		lastErr = err
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for relay listener %s: %v", addr, lastErr)
}

func providerRelayMessage(queueID string, from string, to string, subject string, extraHeaders []string) []byte {
	lines := []string{
		"X-Agent-Mail-ZoneMTA-Queue-ID: " + queueID,
	}
	lines = append(lines, extraHeaders...)
	lines = append(lines,
		"From: Agent <"+from+">",
		"To: Recipient <"+to+">",
		"Subject: "+subject,
		"Message-ID: <"+relaySlug(queueID)+"@example.com>",
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=utf-8",
		"",
		"hello from relay contract",
		"",
	)
	return []byte(strings.Join(lines, "\r\n"))
}

func localRouteMessage(queueID string, sourceIngestID string, replayEnvelopeFrom string, sourceMailbox string, targetMailbox string, subject string) []byte {
	return localRouteMessageWithMessageID(queueID, sourceIngestID, replayEnvelopeFrom, sourceMailbox, targetMailbox, subject, "<"+relaySlug(queueID)+"@"+domainPartForTest(sourceMailbox)+">")
}

func localRouteMessageWithMessageID(queueID string, sourceIngestID string, replayEnvelopeFrom string, sourceMailbox string, targetMailbox string, subject string, messageID string) []byte {
	lines := []string{
		"X-Agent-Mail-ZoneMTA-Queue-ID: " + queueID,
		"X-ATM-Ingest-ID: " + sourceIngestID,
		"X-ATMCF-Edge-Envelope-From: " + replayEnvelopeFrom,
		"X-ATMCF-Edge-Envelope-To: " + sourceMailbox,
		"From: Media <" + sourceMailbox + ">",
		"To: Target <" + targetMailbox + ">",
		"Subject: " + subject,
		"Message-ID: " + messageID,
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=utf-8",
		"",
		"hello from local route contract",
		"",
	}
	return []byte(strings.Join(lines, "\r\n"))
}

func readSMTPData(reader *textproto.Reader) ([]byte, error) {
	var data bytes.Buffer
	for {
		line, err := reader.ReadLine()
		if err != nil {
			return nil, err
		}
		if line == "." {
			return data.Bytes(), nil
		}
		if strings.HasPrefix(line, "..") {
			line = line[1:]
		}
		data.WriteString(line)
		data.WriteString("\r\n")
	}
}

func cleanSMTPPath(value string) string {
	cleaned := strings.TrimSpace(value)
	if start := strings.Index(cleaned, "<"); start >= 0 {
		if end := strings.Index(cleaned[start+1:], ">"); end >= 0 {
			return cleaned[start+1 : start+1+end]
		}
	}
	fields := strings.Fields(cleaned)
	if len(fields) == 0 {
		return ""
	}
	return fields[0]
}

func rawHeaderLines(raw []byte) []string {
	text := strings.ReplaceAll(string(raw), "\r\n", "\n")
	lines := strings.Split(text, "\n")
	headers := make([]string, 0, len(lines))
	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			break
		}
		headers = append(headers, strings.TrimRight(line, "\r"))
	}
	return headers
}

func messageHasHeader(raw []byte, name string, value string) bool {
	targetName := strings.ToLower(name)
	targetValue := strings.TrimSpace(value)
	for _, line := range strings.Split(string(raw), "\r\n") {
		if line == "" {
			return false
		}
		headerName, headerValue, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		if strings.ToLower(strings.TrimSpace(headerName)) == targetName && strings.TrimSpace(headerValue) == targetValue {
			return true
		}
	}
	return false
}

func freeRelayAddress(t *testing.T) string {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("allocate free relay port: %v", err)
	}
	addr := listener.Addr().String()
	if err := listener.Close(); err != nil {
		t.Fatalf("close free relay listener: %v", err)
	}
	return addr
}

func envDefault(name string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback
	}
	return value
}

func newUUIDv7(t *testing.T) string {
	t.Helper()
	id, err := r2archive.NewUUIDv7String()
	if err != nil {
		t.Fatalf("generate uuidv7: %v", err)
	}
	return id
}

func randomRelayHex(t *testing.T, bytesLen int) string {
	t.Helper()
	data := make([]byte, bytesLen)
	if _, err := rand.Read(data); err != nil {
		t.Fatalf("generate random relay token: %v", err)
	}
	return fmt.Sprintf("%x", data)
}

func relayRunID() string {
	value := os.Getenv("TEST_RUN_ID")
	if value == "" {
		value = fmt.Sprintf("%d", time.Now().UnixNano())
	}
	value = strings.ToLower(value)
	return regexp.MustCompile(`[^a-z0-9]+`).ReplaceAllString(value, "_")
}

func relayRunSlug() string {
	value := os.Getenv("TEST_RUN_ID")
	if value == "" {
		value = fmt.Sprintf("%d", time.Now().UnixNano())
	}
	value = strings.ToLower(value)
	value = regexp.MustCompile(`[^a-z0-9-]+`).ReplaceAllString(value, "-")
	value = strings.Trim(value, "-")
	if value == "" {
		return "run"
	}
	if len(value) > 36 {
		return value[:36]
	}
	return value
}

func relaySlug(value string) string {
	value = strings.ToLower(value)
	value = regexp.MustCompile(`[^a-z0-9-]+`).ReplaceAllString(value, "-")
	value = strings.Trim(value, "-")
	if value == "" {
		return "scenario"
	}
	if len(value) > 32 {
		return value[:32]
	}
	return value
}

func domainPartForTest(address string) string {
	_, domain, ok := strings.Cut(address, "@")
	if !ok {
		return "example.test"
	}
	return domain
}
