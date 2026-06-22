package smoke

import (
	"bufio"
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"agent-mail/internal/archive/r2archive"
	"agent-mail/internal/modules/poller"
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

const smokeDomain = "example.test"

func TestInboundReplaySmoke(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	run := gotestingcontainer.NewRunArtifacts(t)
	scenarioDir := run.ScenarioDir(t, "inbound-replay")
	objectsDir := filepath.Join(scenarioDir, "objects")
	if err := os.MkdirAll(objectsDir, 0o755); err != nil {
		t.Fatalf("create object artifact dir: %v", err)
	}

	network := gotestingcontainer.NewScopedNetwork(t, ctx)
	mongoURI := startSmokeMongo(t, ctx, run, network)
	minio := startSmokeMinIO(t, ctx, run, network)
	if err := createSmokeBucket(ctx, minio.Endpoint, minio.Region, minio.Bucket, minio.AccessKeyID, minio.SecretAccessKey); err != nil {
		t.Fatalf("create smoke bucket: %v", err)
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

	wildduckDB := "wildduck_" + smokeRunID()
	controlDB := "agent_mail_control_" + smokeRunID()
	userID := bson.NewObjectID()
	mailboxID := bson.NewObjectID()
	wdServer := newSmokeWildDuckServer(t, wildduckAccessToken, userID.Hex())
	defer wdServer.Close()

	mongoClient, err := mongo.Connect(options.Client().ApplyURI(mongoURI))
	if err != nil {
		t.Fatalf("connect smoke MongoDB: %v", err)
	}
	defer mongoClient.Disconnect(context.Background())

	smtpServer := newSmokeSMTPServer(t, mongoClient.Database(wildduckDB).Collection("messages"), userID, mailboxID)
	defer smtpServer.Close()

	cfg := smokePollerConfig(mongoURI, controlDB, wildduckDB, wdServer.URL, smtpServer.Addr())
	p, err := poller.NewWithDomainSourceConfig(ctx, cfg, smokeDomainSource{})
	if err != nil {
		t.Fatalf("initialize smoke poller: %v", err)
	}
	defer p.Close(context.Background())

	pollerCtx, stopPoller := context.WithCancel(ctx)
	defer stopPoller()
	pollerErrCh := make(chan error, 1)
	go func() {
		pollerErrCh <- p.Run(pollerCtx)
	}()
	defer func() {
		stopPoller()
		err := <-pollerErrCh
		if err != nil && !errors.Is(err, context.Canceled) {
			t.Errorf("poller stopped with error: %v", err)
		}
	}()

	waitForSmokeHealth(t, notifyListenURL+poller.HealthPath)

	rawMessage := []byte(strings.ReplaceAll(`From: Sender <sender@example.net>
To: Agent <agent@example.test>
Subject: Smoke inbound replay
Message-ID: <smoke-inbound@example.net>
Date: Thu, 18 Jun 2026 06:56:10 +0000
Content-Type: text/plain; charset=utf-8

hello from smoke
`, "\n", "\r\n"))
	ingestID, err := r2archive.NewUUIDv7String()
	if err != nil {
		t.Fatalf("generate ingest id: %v", err)
	}
	receivedAt, err := r2archive.UUIDv7Time(ingestID)
	if err != nil {
		t.Fatalf("decode ingest id time: %v", err)
	}
	bundle, err := r2archive.InboundBundleKeys(smokeDomain, receivedAt, ingestID)
	if err != nil {
		t.Fatalf("build inbound bundle keys: %v", err)
	}

	archive, err := r2archive.New(ctx, r2archive.Config{
		Endpoint: minio.Endpoint,
		Region:   minio.Region,
		Bucket:   minio.Bucket,
	}, minio.AccessKeyID, minio.SecretAccessKey)
	if err != nil {
		t.Fatalf("create archive client: %v", err)
	}
	if err := archive.PutBytes(ctx, bundle.RawKey, "message/rfc822", rawMessage); err != nil {
		t.Fatalf("write raw archive: %v", err)
	}
	rawSHA256 := sha256Hex(rawMessage)
	manifest := poller.Manifest{
		Schema:             r2archive.InboundEdgeSchema,
		IngestID:           ingestID,
		RawKey:             bundle.RawKey,
		EdgeKey:            bundle.EdgeKey,
		Mailbox:            "agent@example.test",
		EnvelopeFrom:       "sender@example.net",
		EnvelopeTo:         "agent@example.test",
		RecipientDomain:    smokeDomain,
		CloudflareZoneName: smokeDomain,
		WorkerName:         "smoke-worker",
		ReceivedAt:         receivedAt,
		RawSHA256:          rawSHA256,
		MessageID:          "<smoke-inbound@example.net>",
		ATMCFHeaders: map[string]string{
			"X-ATMCF-Edge-Action":        "worker",
			"X-ATMCF-Edge-Status":        "received",
			"X-ATMCF-Edge-Envelope-From": "sender@example.net",
			"X-ATMCF-Edge-Envelope-To":   "agent@example.test",
			"X-ATMCF-Edge-Message-ID":    "<smoke-inbound@example.net>",
		},
	}
	if err := archive.PutJSON(ctx, bundle.EdgeKey, manifest); err != nil {
		t.Fatalf("write edge archive: %v", err)
	}
	if err := os.WriteFile(filepath.Join(objectsDir, "raw.eml"), rawMessage, 0o644); err != nil {
		t.Fatalf("write raw artifact: %v", err)
	}

	if err := postSmokeNotification(ctx, notifyListenURL+poller.NotifyPath, poller.Notification{
		Schema:          poller.FastPathSchema,
		IngestID:        ingestID,
		RecipientDomain: smokeDomain,
		RawKey:          bundle.RawKey,
		EdgeKey:         bundle.EdgeKey,
		ResultKey:       bundle.ResultKey,
		ReceivedAt:      receivedAt,
		RawSHA256:       rawSHA256,
	}, notifyHMACSecret); err != nil {
		t.Fatalf("post fast-path notification: %v", err)
	}

	receipt := waitForSmokeReceipt(t, ctx, archive, bundle.ResultKey)
	deliveries := smtpServer.Deliveries()
	if len(deliveries) != 1 {
		t.Fatalf("smtp deliveries = %d, want 1", len(deliveries))
	}
	delivery := deliveries[0]
	if delivery.MailFrom != "sender@example.net" {
		t.Fatalf("smtp MAIL FROM = %q", delivery.MailFrom)
	}
	if len(delivery.RcptTo) != 1 || delivery.RcptTo[0] != "agent@example.test" {
		t.Fatalf("smtp RCPT TO = %#v", delivery.RcptTo)
	}
	if !messageHasHeader(delivery.RawMessage, "X-ATM-Ingest-ID", ingestID) {
		t.Fatalf("replayed message missing X-ATM-Ingest-ID:\n%s", string(delivery.RawMessage))
	}
	if !messageHasHeader(delivery.RawMessage, "X-ATMCF-Edge-Status", "received") {
		t.Fatalf("replayed message missing projected Cloudflare provenance:\n%s", string(delivery.RawMessage))
	}

	rawAgain, err := archive.GetBytes(ctx, bundle.RawKey)
	if err != nil {
		t.Fatalf("read raw archive: %v", err)
	}
	if !bytes.Equal(rawAgain, rawMessage) {
		t.Fatal("raw archive bytes changed during replay")
	}
	dsnExists, err := archive.Exists(ctx, bundle.DSNKey)
	if err != nil {
		t.Fatalf("head dsn object: %v", err)
	}
	if dsnExists {
		t.Fatalf("dsn object %s should not exist for happy path", bundle.DSNKey)
	}

	var work struct {
		Status       string `bson:"status"`
		AttemptCount int    `bson:"attempt_count"`
	}
	if err := mongoClient.Database(controlDB).Collection("inbound_work_items").FindOne(ctx, bson.D{{"_id", ingestID}}).Decode(&work); err != nil {
		t.Fatalf("read work item: %v", err)
	}
	if work.Status != "delivered" {
		t.Fatalf("work item status = %q, want delivered", work.Status)
	}
	if work.AttemptCount != 0 {
		t.Fatalf("work attempt_count = %d, want 0 before first retry failure", work.AttemptCount)
	}

	resultBytes, err := archive.GetBytes(ctx, bundle.ResultKey)
	if err != nil {
		t.Fatalf("read result archive: %v", err)
	}
	if err := os.WriteFile(filepath.Join(objectsDir, "result.json"), resultBytes, 0o644); err != nil {
		t.Fatalf("write result artifact: %v", err)
	}
	if err := writeSmokeReport(filepath.Join(scenarioDir, "inbound-replay-smoke.json"), map[string]any{
		"ingest_id":           ingestID,
		"raw_key":             bundle.RawKey,
		"edge_key":            bundle.EdgeKey,
		"result_key":          bundle.ResultKey,
		"status":              receipt.Status,
		"delivery_source":     receipt.DeliverySource,
		"wildduck_user_id":    receipt.WildDuckUserID,
		"wildduck_mailbox_id": receipt.WildDuckMailboxID,
		"wildduck_message_id": receipt.WildDuckMessageID,
		"smtp_deliveries":     len(deliveries),
		"queue_status":        work.Status,
	}); err != nil {
		t.Fatalf("write smoke report: %v", err)
	}
}

type smokeMinIO struct {
	Endpoint        string
	Region          string
	Bucket          string
	AccessKeyID     string
	SecretAccessKey string
}

func startSmokeMongo(t *testing.T, ctx context.Context, run gotestingcontainer.RunArtifacts, network *gotestingcontainer.DockerNetwork) string {
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
	host, port := mappedEndpoint(t, ctx, container, "27017/tcp")
	return fmt.Sprintf("mongodb://%s:%s/?directConnection=true", host, port)
}

func startSmokeMinIO(t *testing.T, ctx context.Context, run gotestingcontainer.RunArtifacts, network *gotestingcontainer.DockerNetwork) smokeMinIO {
	t.Helper()
	image := envDefault("AGENTTEAM_EMAIL_SMOKE_MINIO_IMAGE", "docker.io/minio/minio:RELEASE.2025-09-07T16-13-09Z")
	service := smokeMinIO{
		Region:          "us-east-1",
		Bucket:          "mail-control-smoke-" + smokeRunSlug(),
		AccessKeyID:     "minio" + randomSmokeHex(t, 8),
		SecretAccessKey: "minio" + randomSmokeHex(t, 24),
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
	host, port := mappedEndpoint(t, ctx, container, "9000/tcp")
	service.Endpoint = fmt.Sprintf("http://%s:%s", host, port)
	return service
}

func mappedEndpoint(t *testing.T, ctx context.Context, container gotestingcontainer.Container, port string) (string, string) {
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

func smokePollerConfig(mongoURI string, controlDB string, wildduckDB string, wildduckURL string, smtpAddr string) poller.Config {
	var cfg poller.Config
	cfg.SweepInterval = "1h"
	cfg.RetryDelay = "1s"
	cfg.MaxRetries = 2
	cfg.ArchiveStartAt = "2026-01-01T00:00:00Z"
	cfg.SweepSafetyLag = "0s"
	cfg.SweepOverlap = "1h"
	cfg.State.Mongo.URI = mongoURI
	cfg.State.Mongo.Database = controlDB
	cfg.Haraka.Address = smtpAddr
	cfg.Haraka.HelloName = "mail-control-smoke.test"
	cfg.DSN.SMTPAddress = smtpAddr
	cfg.DSN.HelloName = "mail-control-smoke.test"
	cfg.WildDuck.APIBaseURL = wildduckURL
	cfg.WildDuck.MongoURI = mongoURI
	cfg.WildDuck.MongoDatabase = wildduckDB
	return cfg
}

type smokeDomainSource struct{}

func (smokeDomainSource) ActivePollerDomains(context.Context) ([]poller.Domain, error) {
	return []poller.Domain{{Name: smokeDomain, FeedbackAddress: "bounces@" + smokeDomain}}, nil
}

func newSmokeWildDuckServer(t *testing.T, expectedAccessToken string, userID string) *httptest.Server {
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
		if address != "agent@example.test" && escapedAddress != "agent%40example.test" {
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"success":false,"error":"Address not found","code":"AddressNotFound"}`))
			return
		}
		_, _ = fmt.Fprintf(w, `{"success":true,"id":"address-smoke","address":"agent@example.test","user":%q}`, userID)
	}))
}

type smokeSMTPServer struct {
	t          *testing.T
	listener   net.Listener
	messages   *mongo.Collection
	userID     bson.ObjectID
	mailboxID  bson.ObjectID
	mu         sync.Mutex
	deliveries []smokeSMTPDelivery
	done       chan struct{}
}

type smokeSMTPDelivery struct {
	MailFrom   string
	RcptTo     []string
	RawMessage []byte
}

func newSmokeSMTPServer(t *testing.T, messages *mongo.Collection, userID bson.ObjectID, mailboxID bson.ObjectID) *smokeSMTPServer {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen fake SMTP: %v", err)
	}
	server := &smokeSMTPServer{
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

func (s *smokeSMTPServer) Addr() string {
	return s.listener.Addr().String()
}

func (s *smokeSMTPServer) Close() {
	_ = s.listener.Close()
	<-s.done
}

func (s *smokeSMTPServer) Deliveries() []smokeSMTPDelivery {
	s.mu.Lock()
	defer s.mu.Unlock()
	result := make([]smokeSMTPDelivery, len(s.deliveries))
	copy(result, s.deliveries)
	return result
}

func (s *smokeSMTPServer) serve() {
	defer close(s.done)
	for {
		conn, err := s.listener.Accept()
		if err != nil {
			return
		}
		go s.handleConn(conn)
	}
}

func (s *smokeSMTPServer) handleConn(conn net.Conn) {
	defer conn.Close()
	reader := textproto.NewReader(bufio.NewReader(conn))
	bufferedWriter := bufio.NewWriter(conn)
	writer := textproto.NewWriter(bufferedWriter)
	send := func(format string, args ...any) {
		_ = writer.PrintfLine(format, args...)
		_ = bufferedWriter.Flush()
	}
	send("220 smoke smtp ready")

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
			send("250 smoke smtp")
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

func (s *smokeSMTPServer) recordDelivery(ctx context.Context, mailFrom string, rcptTo []string, raw []byte) error {
	ingestID := extractSmokeIngestID(raw)
	if ingestID == "" {
		return fmt.Errorf("missing X-ATM-Ingest-ID")
	}
	messageID := bson.NewObjectID()
	_, err := s.messages.InsertOne(ctx, bson.D{
		{"_id", messageID},
		{"user", s.userID},
		{"mailbox", s.mailboxID},
		{"mimeTree", bson.D{{"header", bson.A{"X-ATM-Ingest-ID: " + ingestID}}}},
		{"created", time.Now().UTC()},
	})
	if err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.deliveries = append(s.deliveries, smokeSMTPDelivery{
		MailFrom:   mailFrom,
		RcptTo:     append([]string(nil), rcptTo...),
		RawMessage: append([]byte(nil), raw...),
	})
	return nil
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

var smokeIngestIDPattern = regexp.MustCompile(`(?im)^X-ATM-Ingest-ID:\s*([0-9a-f-]+)\s*$`)

func extractSmokeIngestID(raw []byte) string {
	match := smokeIngestIDPattern.FindSubmatch(raw)
	if len(match) != 2 {
		return ""
	}
	return string(match[1])
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

func postSmokeNotification(ctx context.Context, endpoint string, notification poller.Notification, secret string) error {
	body, err := json.Marshal(notification)
	if err != nil {
		return err
	}
	timestamp := time.Now().UTC().Format(time.RFC3339Nano)
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(poller.HeaderTimestamp, timestamp)
	request.Header.Set(poller.HeaderSignature, hex.EncodeToString(expectedSmokeSignature([]byte(secret), timestamp, body)))
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusAccepted {
		data, _ := io.ReadAll(response.Body)
		return fmt.Errorf("fast-path notification returned %s: %s", response.Status, string(data))
	}
	return nil
}

func waitForSmokeReceipt(t *testing.T, ctx context.Context, archive *r2archive.Client, resultKey string) poller.Receipt {
	t.Helper()
	deadline := time.Now().Add(30 * time.Second)
	var lastErr error
	for time.Now().Before(deadline) {
		data, err := archive.GetBytes(ctx, resultKey)
		if err == nil {
			var receipt poller.Receipt
			if err := json.Unmarshal(data, &receipt); err != nil {
				t.Fatalf("decode receipt: %v\n%s", err, string(data))
			}
			if receipt.Status != "delivered" {
				t.Fatalf("receipt status = %q, want delivered", receipt.Status)
			}
			if receipt.DeliverySource != "replayed" {
				t.Fatalf("receipt delivery_source = %q, want replayed", receipt.DeliverySource)
			}
			if receipt.WildDuckUserID == "" || receipt.WildDuckMailboxID == "" || receipt.WildDuckMessageID == "" {
				t.Fatalf("receipt missing WildDuck identifiers: %#v", receipt)
			}
			return receipt
		}
		lastErr = err
		time.Sleep(250 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for result %s: last error: %v", resultKey, lastErr)
	return poller.Receipt{}
}

func waitForSmokeHealth(t *testing.T, endpoint string) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		response, err := http.Get(endpoint)
		if err == nil {
			_ = response.Body.Close()
			if response.StatusCode == http.StatusOK {
				return
			}
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for notify health at %s", endpoint)
}

func createSmokeBucket(ctx context.Context, endpoint string, region string, bucket string, accessKeyID string, secretAccessKey string) error {
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

func freeSmokeAddress(t *testing.T) string {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("allocate free port: %v", err)
	}
	addr := listener.Addr().String()
	if err := listener.Close(); err != nil {
		t.Fatalf("close free port listener: %v", err)
	}
	return addr
}

func expectedSmokeSignature(secret []byte, timestamp string, body []byte) []byte {
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(timestamp))
	mac.Write([]byte("\n"))
	mac.Write(body)
	return mac.Sum(nil)
}

func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func writeSmokeReport(path string, value any) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	return os.WriteFile(path, data, 0o644)
}

func envDefault(name string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback
	}
	return value
}

func randomSmokeToken(t *testing.T, prefix string) string {
	t.Helper()
	return prefix + "-" + randomSmokeHex(t, 16)
}

func randomSmokeHex(t *testing.T, bytesLen int) string {
	t.Helper()
	data := make([]byte, bytesLen)
	if _, err := rand.Read(data); err != nil {
		t.Fatalf("generate random test token: %v", err)
	}
	return hex.EncodeToString(data)
}

func smokeRunID() string {
	value := os.Getenv("TEST_RUN_ID")
	if value == "" {
		value = fmt.Sprintf("%d", time.Now().UnixNano())
	}
	value = strings.ToLower(value)
	return regexp.MustCompile(`[^a-z0-9]+`).ReplaceAllString(value, "_")
}

func smokeRunSlug() string {
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
