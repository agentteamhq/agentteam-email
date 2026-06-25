package poller

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"strings"
	"testing"
	"time"

	"agent-mail/internal/archive/r2archive"
	"agent-mail/internal/stores/wildduck"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

func TestValidateConfigRequiresExactlyTwoRetries(t *testing.T) {
	cfg := validTestConfig()
	cfg.MaxRetries = 1
	if _, err := validateConfig(cfg, false); err == nil {
		t.Fatal("expected max_retries validation error")
	}

	cfg.MaxRetries = 2
	if _, err := validateConfig(cfg, false); err != nil {
		t.Fatalf("validateConfig returned error for max_retries=2: %v", err)
	}
}

func TestDecodeManifestAcceptsCloudflareEdgeEvidence(t *testing.T) {
	ingestID := mustUUIDv7(t)
	receivedAt := time.Date(2026, 6, 17, 20, 0, 0, 0, time.UTC)
	bundle, err := r2archive.InboundBundleKeys("example.com", receivedAt, ingestID)
	if err != nil {
		t.Fatalf("InboundBundleKeys returned error: %v", err)
	}
	data, err := json.Marshal(map[string]any{
		"schema":               r2archive.InboundEdgeSchema,
		"ingest_id":            ingestID,
		"raw_key":              bundle.RawKey,
		"edge_key":             bundle.EdgeKey,
		"mailbox":              "agent@example.com",
		"envelope_from":        "sender@example.net",
		"envelope_to":          "agent@example.com",
		"recipient_domain":     "example.com",
		"cloudflare_zone_name": "example.com",
		"worker_name":          "agent-mail-ingress",
		"received_at":          receivedAt.Format(time.RFC3339Nano),
		"raw_sha256":           strings.Repeat("a", 64),
		"atmcf_headers":        map[string]string{"X-ATMCF-Edge-Status": "received"},
		"cloudflare_edge_evidence": map[string]any{
			"schema": "agent-mail.cloudflare-edge-evidence.v1",
			"worker_message_fields": map[string]any{
				"envelope_to": "agent@example.com",
			},
		},
		"cloudflare_routing_activity": map[string]any{
			"schema": "agent-mail.cloudflare-routing-activity.v1",
			"match":  map[string]any{"status": "not_found", "count": 0},
		},
	})
	if err != nil {
		t.Fatalf("Marshal manifest fixture: %v", err)
	}

	manifest, err := decodeManifest(data)
	if err != nil {
		t.Fatalf("decodeManifest returned error: %v", err)
	}
	if len(manifest.CloudflareEdgeEvidence) == 0 {
		t.Fatalf("CloudflareEdgeEvidence was not retained")
	}
	if !strings.Contains(string(manifest.CloudflareEdgeEvidence), "worker_message_fields") {
		t.Fatalf("CloudflareEdgeEvidence missing worker fields: %s", manifest.CloudflareEdgeEvidence)
	}
	if !strings.Contains(string(manifest.CloudflareRoutingActivity), "not_found") {
		t.Fatalf("CloudflareRoutingActivity was not retained: %s", manifest.CloudflareRoutingActivity)
	}
}

func TestValidateConfigRequiresDSNFeedbackForEachDomain(t *testing.T) {
	cfg := validTestConfig()
	cfg.DSN.Domains = nil
	if _, err := validateConfig(cfg, false); err == nil {
		t.Fatal("expected missing dsn domain validation error")
	}

	cfg = validTestConfig()
	cfg.DSN.Domains[0].FeedbackAddress = "bounces@other.example"
	if _, err := validateConfig(cfg, false); err == nil {
		t.Fatal("expected mismatched feedback address validation error")
	}
}

func TestRetryPolicyBlocksAfterInitialAttemptAndTwoRetries(t *testing.T) {
	cfg := validTestConfig()
	runtimeCfg, err := validateConfig(cfg, false)
	if err != nil {
		t.Fatalf("validateConfig returned error: %v", err)
	}
	p := &Poller{cfg: runtimeCfg}
	item := workItem{IngestID: mustUUIDv7(t), RecipientDomain: "example.com"}
	failure := classifiedError{class: failureTransient, retryable: true, err: errTestFailure{}}

	if shouldBlockAfterAttempt(p, item, 1, failure) {
		t.Fatal("initial failure should retry")
	}
	if shouldBlockAfterAttempt(p, item, 2, failure) {
		t.Fatal("second failure should retry")
	}
	if !shouldBlockAfterAttempt(p, item, 3, failure) {
		t.Fatal("third failure should block")
	}
}

func TestNextRetryAtReturnsEarliestRetryWait(t *testing.T) {
	store := newTestStateStore()
	p := &Poller{state: store}
	now := time.Date(2026, 5, 21, 19, 0, 0, 0, time.UTC)
	later := now.Add(2 * time.Minute)
	earlier := now.Add(time.Minute)
	for _, entry := range []struct {
		ingestID string
		next     time.Time
	}{
		{ingestID: mustUUIDv7(t), next: later},
		{ingestID: mustUUIDv7(t), next: earlier},
	} {
		bundle := mustInboundBundle(t, "example.com", entry.ingestID)
		if err := p.upsertPending(context.Background(), bundle); err != nil {
			t.Fatalf("upsert pending bundle: %v", err)
		}
		doc := store.items[entry.ingestID]
		doc.Status = statusRetryWait
		doc.NextAttemptAt = &entry.next
		store.items[entry.ingestID] = doc
	}

	next, ok, err := p.nextRetryAt(context.Background())
	if err != nil {
		t.Fatalf("nextRetryAt returned error: %v", err)
	}
	if !ok {
		t.Fatal("expected retry_wait item")
	}
	if !next.Equal(earlier) {
		t.Fatalf("next retry = %s, want %s", next.Format(time.RFC3339Nano), earlier.Format(time.RFC3339Nano))
	}
}

func TestSweepDomainFollowsR2ContinuationPages(t *testing.T) {
	ctx := context.Background()
	first := mustInboundBundle(t, "example.com", mustUUIDv7(t))
	second := mustInboundBundle(t, "example.com", mustUUIDv7(t))
	sweepStart := first.UTCDate
	sweepEnd := first.UTCDate.AddDate(0, 0, 1).Add(-time.Nanosecond)
	prefix, err := r2archive.InboundDailyPrefix("example.com", first.UTCDate)
	if err != nil {
		t.Fatalf("build daily prefix: %v", err)
	}
	nextToken := "second-page"
	state := newTestStateStore()
	r2 := &testR2Client{
		pages: map[string]*s3.ListObjectsV2Output{
			"": {
				Contents: []types.Object{
					{Key: &first.EdgeKey},
					{Key: &first.RawKey},
				},
				IsTruncated:           boolPtr(true),
				NextContinuationToken: &nextToken,
			},
			nextToken: {
				Contents:    []types.Object{{Key: &second.EdgeKey}},
				IsTruncated: boolPtr(false),
			},
		},
		bytesByKey: map[string][]byte{
			first.EdgeKey:  []byte(`{"schema":"agent-mail.inbound.edge.v1"}`),
			second.EdgeKey: []byte(`{"schema":"agent-mail.inbound.edge.v1"}`),
		},
		existsByKey: map[string]bool{
			first.ResultKey:  false,
			second.ResultKey: false,
		},
		wantPrefix: prefix,
	}
	p := &Poller{r2: r2, state: state}

	if err := p.sweepDomain(ctx, Domain{Name: "example.com"}, sweepStart, sweepEnd); err != nil {
		t.Fatalf("sweepDomain returned error: %v", err)
	}

	if _, ok := state.items[first.IngestID]; !ok {
		t.Fatalf("first-page ingest %s was not queued", first.IngestID)
	}
	if _, ok := state.items[second.IngestID]; !ok {
		t.Fatalf("second-page ingest %s was not queued", second.IngestID)
	}
	if got, want := r2.listContinuations, []string{"", nextToken}; strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("R2 list continuations = %#v, want %#v", got, want)
	}
}

func TestValidateConfigRequiresStateMongo(t *testing.T) {
	cfg := validTestConfig()
	cfg.State.Mongo.URI = ""
	if _, err := validateConfig(cfg, false); err == nil {
		t.Fatal("expected missing state mongo uri validation error")
	}
}

func TestIngestIDHeaderRegexIsCaseInsensitive(t *testing.T) {
	ingestID := mustUUIDv7(t)
	regex := ingestIDHeaderRegex(ingestID)

	if regex.Options != "i" {
		t.Fatalf("expected case-insensitive regex option, got %q", regex.Options)
	}
	want := "^X-ATM-Ingest-ID: " + ingestID + "$"
	if regex.Pattern != want {
		t.Fatalf("unexpected regex pattern: got %q want %q", regex.Pattern, want)
	}
}

func TestPermanentDeliveryFailureFromSMTPClassifiesRecipient550(t *testing.T) {
	err := smtpCommandError{
		command: "RCPT",
		err:     textprotoError(550, "5.1.1 No such user"),
	}
	failure, ok := permanentDeliveryFailureFromSMTP(err)
	if !ok {
		t.Fatal("expected permanent delivery failure")
	}
	if failure.status != "5.1.1" {
		t.Fatalf("status = %q", failure.status)
	}
	if failure.diagnosticCode != "smtp; 550 5.1.1 No such user" {
		t.Fatalf("diagnostic = %q", failure.diagnosticCode)
	}
}

func TestFindDeliveredMessageTreatsForwardedAddressAsForwardOnly(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.HasSuffix(r.URL.Path, "/forward@example.com") || strings.HasSuffix(r.URL.EscapedPath(), "/forward%40example.com"):
			_, _ = w.Write([]byte(`{"success":true,"id":"forward-id","address":"forward@example.com","targets":["outside@example.net"]}`))
		default:
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"success":false,"error":"Address not found","code":"AddressNotFound"}`))
		}
	}))
	defer server.Close()

	client, err := wildduck.New(server.URL, "access-token")
	if err != nil {
		t.Fatalf("wildduck.New returned error: %v", err)
	}
	p := &Poller{wd: client}

	_, delivered, forwardOnly, err := p.findDeliveredMessage(context.Background(), "forward@example.com", mustUUIDv7(t))
	if err != nil {
		t.Fatalf("findDeliveredMessage returned error: %v", err)
	}
	if delivered {
		t.Fatal("forward-only address should not report a local mailbox delivery")
	}
	if !forwardOnly {
		t.Fatal("expected forwarded address without user to be reported as forward-only")
	}
}

func shouldBlockAfterAttempt(p *Poller, _ workItem, attempt int, failure classifiedError) bool {
	return !failure.retryable || attempt > p.cfg.MaxRetries
}

type errTestFailure struct{}

func (errTestFailure) Error() string { return "test failure" }

type testR2Client struct {
	pages             map[string]*s3.ListObjectsV2Output
	bytesByKey        map[string][]byte
	existsByKey       map[string]bool
	wantPrefix        string
	listContinuations []string
}

func (c *testR2Client) List(_ context.Context, prefix string, continuationToken *string) (*s3.ListObjectsV2Output, error) {
	if prefix != c.wantPrefix {
		return nil, errUnexpectedR2Prefix{got: prefix, want: c.wantPrefix}
	}
	token := ""
	if continuationToken != nil {
		token = *continuationToken
	}
	c.listContinuations = append(c.listContinuations, token)
	result, ok := c.pages[token]
	if !ok {
		return nil, errUnexpectedR2Continuation{token: token}
	}
	return result, nil
}

func (c *testR2Client) Exists(_ context.Context, key string) (bool, error) {
	return c.existsByKey[key], nil
}

func (c *testR2Client) GetBytes(_ context.Context, key string) ([]byte, error) {
	data, ok := c.bytesByKey[key]
	if !ok {
		return nil, errUnexpectedR2Key{key: key}
	}
	return data, nil
}

func (c *testR2Client) PutBytes(context.Context, string, string, []byte) error {
	return errUnexpectedR2Write{}
}

func (c *testR2Client) PutJSON(context.Context, string, any) error {
	return errUnexpectedR2Write{}
}

type errUnexpectedR2Prefix struct {
	got  string
	want string
}

func (e errUnexpectedR2Prefix) Error() string {
	return "unexpected R2 prefix " + e.got + ", want " + e.want
}

type errUnexpectedR2Continuation struct {
	token string
}

func (e errUnexpectedR2Continuation) Error() string {
	return "unexpected R2 continuation " + e.token
}

type errUnexpectedR2Key struct {
	key string
}

func (e errUnexpectedR2Key) Error() string {
	return "unexpected R2 key " + e.key
}

type errUnexpectedR2Write struct{}

func (errUnexpectedR2Write) Error() string { return "unexpected R2 write" }

func validTestConfig() Config {
	var cfg Config
	cfg.SweepInterval = "24h"
	cfg.RetryDelay = "5m"
	cfg.MaxRetries = 2
	cfg.ArchiveStartAt = time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC).Format(time.RFC3339)
	cfg.SweepSafetyLag = "1h"
	cfg.SweepOverlap = "24h"
	cfg.Domains = []string{"example.com"}
	cfg.State.Mongo.URI = "mongodb://mongodb:27017/agent_mail_control?directConnection=true"
	cfg.State.Mongo.Database = "agent_mail_control"
	cfg.Haraka.Address = "haraka:25"
	cfg.Haraka.HelloName = "poller.example.test"
	cfg.DSN.SMTPAddress = "zonemta-feeder:2525"
	cfg.DSN.HelloName = "poller.example.test"
	cfg.DSN.Domains = append(cfg.DSN.Domains, struct {
		Name            string `yaml:"name"`
		FeedbackAddress string `yaml:"feedback_address"`
	}{
		Name:            "example.com",
		FeedbackAddress: "bounces@example.com",
	})
	cfg.WildDuck.APIBaseURL = "http://wildduck-api:8080"
	cfg.WildDuck.MongoURI = "mongodb://mongodb:27017/wildduck"
	cfg.WildDuck.MongoDatabase = "wildduck"
	return cfg
}

func textprotoError(code int, msg string) error {
	return &textproto.Error{Code: code, Msg: msg}
}

func boolPtr(value bool) *bool {
	return &value
}

func mustUUIDv7(t *testing.T) string {
	t.Helper()
	id, err := r2archive.NewUUIDv7String()
	if err != nil {
		t.Fatalf("generate uuidv7: %v", err)
	}
	return id
}

func mustInboundBundle(t *testing.T, domain string, ingestID string) r2archive.InboundBundle {
	t.Helper()
	createdAt, err := r2archive.UUIDv7Time(ingestID)
	if err != nil {
		t.Fatalf("decode uuidv7 time: %v", err)
	}
	bundle, err := r2archive.InboundBundleKeys(domain, createdAt, ingestID)
	if err != nil {
		t.Fatalf("build inbound bundle: %v", err)
	}
	return bundle
}
