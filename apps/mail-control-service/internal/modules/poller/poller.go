package poller

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/smtp"
	"net/textproto"
	"path"
	"regexp"
	"strings"
	"time"

	"agent-mail/internal/archive/r2archive"
	"agent-mail/internal/config/configfile"
	"agent-mail/internal/mail/dsn"
	"agent-mail/internal/mail/rfc822"
	"agent-mail/internal/mail/structured"
	"agent-mail/internal/stores/wildduck"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const (
	statusPending   = "pending"
	statusLeased    = "leased"
	statusRetryWait = "retry_wait"
	statusBlocked   = "blocked"
	statusDelivered = "delivered"
	statusCompleted = "completed"

	failureTransient  = "transient"
	failureDependency = "dependency"
	failureInvariant  = "invariant"
	failureBug        = "bug"

	deliveryExisting  = "existing"
	deliveryReplayed  = "replayed"
	deliveryForwarded = "forwarded"
)

type Config struct {
	SweepInterval  string   `yaml:"sweep_interval"`
	RetryDelay     string   `yaml:"retry_delay"`
	MaxRetries     int      `yaml:"max_retries"`
	ArchiveStartAt string   `yaml:"archive_start_at"`
	SweepSafetyLag string   `yaml:"sweep_safety_lag"`
	SweepOverlap   string   `yaml:"sweep_overlap"`
	Domains        []string `yaml:"domains"`
	State          struct {
		Mongo struct {
			URI      string `yaml:"uri"`
			Database string `yaml:"database"`
		} `yaml:"mongo"`
	} `yaml:"state"`
	Haraka struct {
		Address   string `yaml:"address"`
		HelloName string `yaml:"hello_name"`
	} `yaml:"haraka"`
	DSN struct {
		SMTPAddress string `yaml:"smtp_address"`
		HelloName   string `yaml:"hello_name"`
		Domains     []struct {
			Name            string `yaml:"name"`
			FeedbackAddress string `yaml:"feedback_address"`
		} `yaml:"domains"`
	} `yaml:"dsn"`
	WildDuck struct {
		APIBaseURL    string `yaml:"api_base_url"`
		MongoURI      string `yaml:"mongo_uri"`
		MongoDatabase string `yaml:"mongo_database"`
	} `yaml:"wildduck"`
}

type runtimeConfig struct {
	SweepInterval       time.Duration
	RetryDelay          time.Duration
	MaxRetries          int
	ArchiveStartAt      time.Time
	SweepSafetyLag      time.Duration
	SweepOverlap        time.Duration
	Domains             []string
	StateMongoURI       string
	StateMongoDatabase  string
	HarakaAddr          string
	HeloName            string
	DSNSMTPAddr         string
	DSNHeloName         string
	DSNFeedbackByDomain map[string]string
	MongoURI            string
	MongoDB             string
	R2                  r2archive.Config
}

type Manifest struct {
	Schema                 string            `json:"schema"`
	IngestID               string            `json:"ingest_id"`
	OrganizationID         string            `json:"organization_id,omitempty"`
	OrganizationPublicID   string            `json:"organization_public_id,omitempty"`
	OrgPublicID            string            `json:"org_public_id,omitempty"`
	ArchivePrefix          string            `json:"archive_prefix,omitempty"`
	ConnectionID           string            `json:"connection_id,omitempty"`
	WorkerConnectionID     string            `json:"worker_connection_id,omitempty"`
	DomainID               string            `json:"domain_id,omitempty"`
	Domain                 string            `json:"domain,omitempty"`
	RawKey                 string            `json:"raw_key"`
	EdgeKey                string            `json:"edge_key"`
	ResultKey              string            `json:"result_key,omitempty"`
	Mailbox                string            `json:"mailbox"`
	EnvelopeFrom           string            `json:"envelope_from"`
	EnvelopeTo             string            `json:"envelope_to"`
	RecipientDomain        string            `json:"recipient_domain"`
	CloudflareZoneName     string            `json:"cloudflare_zone_name"`
	WorkerName             string            `json:"worker_name"`
	ReceivedAt             time.Time         `json:"received_at"`
	RawSHA256              string            `json:"raw_sha256"`
	MessageID              string            `json:"message_id,omitempty"`
	ATMCFHeaders           map[string]string `json:"atmcf_headers"`
	CloudflareEdgeEvidence json.RawMessage   `json:"cloudflare_edge_evidence,omitempty"`
}

type Receipt struct {
	Schema                     string    `json:"schema"`
	IngestID                   string    `json:"ingest_id"`
	Status                     string    `json:"status"`
	Attempt                    int       `json:"attempt"`
	ProcessedAt                time.Time `json:"processed_at"`
	RawKey                     string    `json:"raw_key"`
	EdgeKey                    string    `json:"edge_key"`
	DSNRawKey                  string    `json:"dsn_raw_key,omitempty"`
	DSNRawSHA256               string    `json:"dsn_raw_sha256,omitempty"`
	DSNID                      string    `json:"dsn_id,omitempty"`
	DSNMessageID               string    `json:"dsn_message_id,omitempty"`
	DSNEnvelopeFrom            string    `json:"dsn_envelope_from,omitempty"`
	DSNEnvelopeTo              string    `json:"dsn_envelope_to,omitempty"`
	DSNFrom                    string    `json:"dsn_from,omitempty"`
	DSNStatus                  string    `json:"dsn_status,omitempty"`
	DSNAction                  string    `json:"dsn_action,omitempty"`
	DSNDiagnosticCode          string    `json:"dsn_diagnostic_code,omitempty"`
	DSNProviderBoundarySender  string    `json:"dsn_provider_boundary_sender,omitempty"`
	DSNProviderReversePathMode string    `json:"dsn_provider_reverse_path_mode,omitempty"`
	WildDuckUserID             string    `json:"wildduck_user_id,omitempty"`
	WildDuckMailboxID          string    `json:"wildduck_mailbox_id,omitempty"`
	WildDuckMessageID          string    `json:"wildduck_message_id,omitempty"`
	DeliverySource             string    `json:"delivery_source"`
	Detail                     string    `json:"detail,omitempty"`
}

type deliveryIdentifiers struct {
	UserID    string
	MailboxID string
	MessageID string
}

type workItem struct {
	IngestID        string
	RecipientDomain string
	BundlePrefix    string
	EdgeKey         string
	RawKey          string
	ResultKey       string
	AttemptCount    int
	LeaseID         string
}

type classifiedError struct {
	class     string
	retryable bool
	err       error
}

type permanentDeliveryFailure struct {
	status         string
	diagnosticCode string
	err            error
}

type smtpCommandError struct {
	command string
	err     error
}

type dsnState struct {
	ID        string
	MessageID string
	RawKey    string
}

type Poller struct {
	cfg          runtimeConfig
	domainSource DomainSource
	r2           r2Client
	wd           *wildduck.Client
	mongo        *mongo.Client
	stateMongo   *mongo.Client
	messages     *mongo.Collection
	state        stateStore
	wakeCh       chan struct{}
}

type r2Client interface {
	List(ctx context.Context, prefix string, continuationToken *string) (*s3.ListObjectsV2Output, error)
	Exists(ctx context.Context, key string) (bool, error)
	GetBytes(ctx context.Context, key string) ([]byte, error)
	PutBytes(ctx context.Context, key string, contentType string, data []byte) error
	PutJSON(ctx context.Context, key string, value any) error
}

type Status struct {
	OK            bool        `json:"ok"`
	Configured    bool        `json:"configured"`
	Issues        []string    `json:"issues,omitempty"`
	SweepInterval string      `json:"sweep_interval"`
	RetryDelay    string      `json:"retry_delay"`
	MaxRetries    int         `json:"max_retries"`
	StateMongoURI string      `json:"state_mongo_uri"`
	StateDatabase string      `json:"state_database"`
	DomainsSource string      `json:"domains_source"`
	ActiveDomains int         `json:"active_domains"`
	LastSweepAt   *time.Time  `json:"last_sweep_at,omitempty"`
	Queue         QueueStatus `json:"queue"`
}

type QueueStatus struct {
	Pending   int `json:"pending"`
	Leased    int `json:"leased"`
	RetryWait int `json:"retry_wait"`
	Blocked   int `json:"blocked"`
	Delivered int `json:"delivered"`
	Completed int `json:"completed"`
}

type DomainSource interface {
	ActivePollerDomains(ctx context.Context) ([]Domain, error)
}

type Domain struct {
	Name                     string
	OrganizationID           string
	OrganizationPublicID     string
	ArchivePrefix            string
	WorkerConnectionID       string
	WorkerDomainDeploymentID string
	FeedbackAddress          string
}

func New(ctx context.Context, configPath string) (*Poller, error) {
	return newPollerFromPath(ctx, configPath, nil)
}

func NewWithDomainSource(ctx context.Context, configPath string, source DomainSource) (*Poller, error) {
	if source == nil {
		return nil, fmt.Errorf("missing poller domain source")
	}
	var cfg Config
	if err := configfile.LoadYAML(configPath, &cfg); err != nil {
		return nil, err
	}
	return newPoller(ctx, cfg, source)
}

func NewWithDomainSourceConfig(ctx context.Context, cfg Config, source DomainSource) (*Poller, error) {
	if source == nil {
		return nil, fmt.Errorf("missing poller domain source")
	}
	return newPoller(ctx, cfg, source)
}

func newPollerFromPath(ctx context.Context, configPath string, source DomainSource) (*Poller, error) {
	var cfg Config
	if err := configfile.LoadYAML(configPath, &cfg); err != nil {
		return nil, err
	}
	return newPoller(ctx, cfg, source)
}

func newPoller(ctx context.Context, cfg Config, source DomainSource) (*Poller, error) {
	runtimeCfg, err := validateConfig(cfg, source != nil)
	if err != nil {
		return nil, err
	}

	r2KeyID, err := configfile.RequireEnv("AT_EMAIL_ADMIN_R2_ACCESS_KEY_ID")
	if err != nil {
		return nil, err
	}
	r2Secret, err := configfile.RequireEnv("AT_EMAIL_ADMIN_R2_SECRET_ACCESS_KEY")
	if err != nil {
		return nil, err
	}
	r2Endpoint, err := configfile.RequireEnv("AT_EMAIL_ADMIN_R2_ENDPOINT")
	if err != nil {
		return nil, err
	}
	r2Region, err := configfile.RequireEnv("AT_EMAIL_ADMIN_R2_REGION")
	if err != nil {
		return nil, err
	}
	r2Bucket, err := configfile.RequireEnv("AT_EMAIL_ADMIN_R2_BUCKET")
	if err != nil {
		return nil, err
	}
	accessToken, err := configfile.RequireEnv("AT_EMAIL_ADMIN_WILDDUCK_ADMIN_ACCESS_TOKEN")
	if err != nil {
		return nil, err
	}
	runtimeCfg.R2 = r2archive.Config{
		Endpoint: r2Endpoint,
		Region:   r2Region,
		Bucket:   r2Bucket,
	}

	r2Client, err := r2archive.New(ctx, runtimeCfg.R2, r2KeyID, r2Secret)
	if err != nil {
		return nil, err
	}
	wdClient, err := wildduck.New(cfg.WildDuck.APIBaseURL, accessToken)
	if err != nil {
		return nil, err
	}
	mongoClient, err := mongo.Connect(options.Client().ApplyURI(runtimeCfg.MongoURI))
	if err != nil {
		return nil, fmt.Errorf("connect to mongodb: %w", err)
	}
	stateMongoClient, err := mongo.Connect(options.Client().ApplyURI(runtimeCfg.StateMongoURI))
	if err != nil {
		_ = mongoClient.Disconnect(context.Background())
		return nil, fmt.Errorf("connect to state mongodb: %w", err)
	}
	state, err := newMongoStateStore(ctx, stateMongoClient, runtimeCfg.StateMongoDatabase)
	if err != nil {
		_ = stateMongoClient.Disconnect(context.Background())
		_ = mongoClient.Disconnect(context.Background())
		return nil, err
	}

	return &Poller{
		cfg:          runtimeCfg,
		domainSource: source,
		r2:           r2Client,
		wd:           wdClient,
		mongo:        mongoClient,
		stateMongo:   stateMongoClient,
		messages:     mongoClient.Database(runtimeCfg.MongoDB).Collection("messages"),
		state:        state,
		wakeCh:       make(chan struct{}, 1),
	}, nil
}

func (p *Poller) Close(ctx context.Context) error {
	var errs []error
	if p.mongo != nil {
		errs = append(errs, p.mongo.Disconnect(ctx))
	}
	if p.stateMongo != nil {
		errs = append(errs, p.stateMongo.Disconnect(ctx))
	}
	return errors.Join(errs...)
}

func (p *Poller) Status(ctx context.Context) Status {
	status := Status{
		OK:            true,
		Configured:    true,
		SweepInterval: p.cfg.SweepInterval.String(),
		RetryDelay:    p.cfg.RetryDelay.String(),
		MaxRetries:    p.cfg.MaxRetries,
		StateMongoURI: redactMongoURI(p.cfg.StateMongoURI),
		StateDatabase: p.cfg.StateMongoDatabase,
		DomainsSource: "static-config",
	}
	if p.domainSource != nil {
		status.DomainsSource = "control-state"
	}
	domains, err := p.activeDomains(ctx)
	if err != nil {
		status.OK = false
		status.Issues = append(status.Issues, "active_domain_load_failed: "+err.Error())
	} else {
		status.ActiveDomains = len(domains)
	}
	queue, err := p.queueStatus(ctx)
	if err != nil {
		status.OK = false
		status.Issues = append(status.Issues, "queue_status_failed: "+err.Error())
	} else {
		status.Queue = queue
		if queue.Blocked > 0 {
			status.OK = false
			status.Issues = append(status.Issues, "blocked_inbound_work_items")
		}
	}
	lastSweepAt, err := p.lastSweepAt(ctx)
	if err != nil {
		status.OK = false
		status.Issues = append(status.Issues, "sweep_cursor_status_failed: "+err.Error())
	} else {
		status.LastSweepAt = lastSweepAt
	}
	return status
}

func (p *Poller) Run(ctx context.Context) error {
	domainMode := strings.Join(p.cfg.Domains, ",")
	if p.domainSource != nil {
		domainMode = "control-state"
	}
	log.Printf("agent-mail-reconciler starting sweep_interval=%s state_database=%s domains=%s max_retries=%d", p.cfg.SweepInterval, p.cfg.StateMongoDatabase, domainMode, p.cfg.MaxRetries)

	sweepTicker := time.NewTicker(p.cfg.SweepInterval)
	defer sweepTicker.Stop()

	if err := p.runSweepCycle(ctx); err != nil {
		p.logServiceFailure("sweep", err)
	}
	if err := p.processDue(ctx); err != nil {
		return err
	}
	var retryTimer *time.Timer
	var retryCh <-chan time.Time
	defer stopTimer(retryTimer)
	resetRetryTimer := func() error {
		stopTimer(retryTimer)
		retryTimer = nil
		retryCh = nil
		nextRetry, ok, err := p.nextRetryAt(ctx)
		if err != nil {
			return err
		}
		if !ok {
			return nil
		}
		delay := time.Until(nextRetry)
		if delay < 0 {
			delay = 0
		}
		retryTimer = time.NewTimer(delay)
		retryCh = retryTimer.C
		return nil
	}
	if err := resetRetryTimer(); err != nil {
		return err
	}

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-p.wakeCh:
			if err := p.processDue(ctx); err != nil {
				return err
			}
			if err := resetRetryTimer(); err != nil {
				return err
			}
		case <-retryCh:
			// Regression guard: retry_wait is actionable queue state. The
			// six-hour sweep is only recovery; transient SMTP/R2/WildDuck
			// failures must retry at retry_delay without another external wake.
			if err := p.processDue(ctx); err != nil {
				return err
			}
			if err := resetRetryTimer(); err != nil {
				return err
			}
		case <-sweepTicker.C:
			if err := p.runSweepCycle(ctx); err != nil {
				p.logServiceFailure("sweep", err)
			}
			if err := p.processDue(ctx); err != nil {
				return err
			}
			if err := resetRetryTimer(); err != nil {
				return err
			}
		}
	}
}

func (p *Poller) runSweepCycle(ctx context.Context) error {
	start := time.Now()
	log.Printf("agent-mail-reconciler sweep_start")
	if err := p.sweep(ctx, time.Now().UTC()); err != nil {
		return err
	}
	log.Printf("agent-mail-reconciler sweep_end elapsed=%s", time.Since(start).Round(time.Millisecond))
	return nil
}

func (p *Poller) processDue(ctx context.Context) error {
	for {
		leased, ok, err := p.leaseNext(ctx, time.Now().UTC())
		if err != nil {
			return err
		}
		if !ok {
			break
		}
		p.processLeased(ctx, leased)
	}
	return nil
}

func (p *Poller) EnqueueNotification(ctx context.Context, notification Notification) (r2archive.InboundBundle, error) {
	bundle, err := ValidateNotification(notification)
	if err != nil {
		return r2archive.InboundBundle{}, err
	}
	if err := p.upsertPending(ctx, bundle); err != nil {
		return r2archive.InboundBundle{}, err
	}
	p.signalProcessDue()
	return bundle, nil
}

func (p *Poller) signalProcessDue() {
	select {
	case p.wakeCh <- struct{}{}:
	default:
	}
}

func stopTimer(timer *time.Timer) {
	if timer == nil {
		return
	}
	if timer.Stop() {
		return
	}
	select {
	case <-timer.C:
	default:
	}
}

func (p *Poller) sweep(ctx context.Context, now time.Time) error {
	sweepEnd := now.UTC().Add(-p.cfg.SweepSafetyLag)
	domains, err := p.activeDomains(ctx)
	if err != nil {
		return err
	}
	for _, domain := range domains {
		sweepStart, err := p.sweepStart(ctx, domain.Name, sweepEnd)
		if err != nil {
			return err
		}
		if !sweepStart.Before(sweepEnd) {
			continue
		}
		if err := p.sweepDomain(ctx, domain, sweepStart, sweepEnd); err != nil {
			return err
		}
		if err := p.advanceSweepCursor(ctx, domain.Name, sweepEnd); err != nil {
			return err
		}
	}
	return nil
}

func (p *Poller) activeDomains(ctx context.Context) ([]Domain, error) {
	if p.domainSource == nil {
		return nil, fmt.Errorf("poller domain source is required for org-prefixed archive prefixes")
	}
	domains, err := p.domainSource.ActivePollerDomains(ctx)
	if err != nil {
		return nil, fmt.Errorf("load active poller domains from control state: %w", err)
	}
	return domains, nil
}

func (p *Poller) sweepDomain(ctx context.Context, domain Domain, sweepStart time.Time, sweepEnd time.Time) error {
	for date := utcDate(sweepStart); !date.After(utcDate(sweepEnd)); date = date.AddDate(0, 0, 1) {
		parsed, err := r2archive.ParseInboundArchivePrefix(domain.ArchivePrefix)
		if err != nil {
			return fmt.Errorf("active domain archive_prefix: %w", err)
		}
		if parsed.RecipientDomain != domain.Name {
			return fmt.Errorf("archive_prefix domain %q does not match active domain %q", parsed.RecipientDomain, domain.Name)
		}
		prefix := path.Join(domain.ArchivePrefix, utcDate(date).Format("2006/01/02")) + "/"
		var continuation *string
		for {
			listResult, err := p.r2.List(ctx, prefix, continuation)
			if err != nil {
				return err
			}
			for _, object := range listResult.Contents {
				if object.Key == nil || !r2archive.IsInboundEdgeKey(*object.Key) {
					continue
				}
				if err := p.discoverEdgeKey(ctx, *object.Key, domain, sweepStart, sweepEnd); err != nil {
					p.logFailure("sweep_discovery", workItem{EdgeKey: *object.Key, RecipientDomain: domain.Name}, 0, failureInvariant, err, "")
					_ = p.recordDiscoveryDiagnostic(ctx, *object.Key, domain.Name, failureInvariant, err)
					continue
				}
			}
			if listResult.IsTruncated == nil || !*listResult.IsTruncated {
				break
			}
			continuation = listResult.NextContinuationToken
		}
	}
	return nil
}

func (p *Poller) discoverEdgeKey(ctx context.Context, edgeKey string, domain Domain, sweepStart time.Time, sweepEnd time.Time) error {
	bundle, err := r2archive.ParseInboundEdgeKey(edgeKey)
	if err != nil {
		return err
	}
	if bundle.ArchivePrefix != domain.ArchivePrefix {
		return fmt.Errorf("edge key archive_prefix %q does not match active domain archive_prefix %q", bundle.ArchivePrefix, domain.ArchivePrefix)
	}
	if bundle.RecipientDomain != domain.Name {
		return fmt.Errorf("edge key recipient domain %q does not match active domain %q", bundle.RecipientDomain, domain.Name)
	}
	createdAt, err := r2archive.UUIDv7Time(bundle.IngestID)
	if err != nil {
		return err
	}
	if createdAt.Before(sweepStart) || !createdAt.Before(sweepEnd) {
		return nil
	}
	schema, err := p.edgeSchema(ctx, edgeKey)
	if err != nil {
		return err
	}
	switch schema {
	case r2archive.InboundEdgeSchema:
	case r2archive.InboundLocalRouteEdgeSchema:
		log.Printf("agent-mail-reconciler event=local_route_edge_skipped edge_key=%s", edgeKey)
		return nil
	default:
		return fmt.Errorf("edge json schema %q is not supported for poller discovery", schema)
	}
	exists, err := p.r2.Exists(ctx, bundle.ResultKey)
	if err != nil {
		return err
	}
	if exists {
		return p.upsertDelivered(ctx, bundle)
	}
	return p.upsertPending(ctx, bundle)
}

func (p *Poller) edgeSchema(ctx context.Context, edgeKey string) (string, error) {
	data, err := p.r2.GetBytes(ctx, edgeKey)
	if err != nil {
		return "", err
	}
	var edge struct {
		Schema string `json:"schema"`
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	if err := decoder.Decode(&edge); err != nil {
		return "", fmt.Errorf("decode edge schema: %w", err)
	}
	if strings.TrimSpace(edge.Schema) == "" {
		return "", fmt.Errorf("edge json is missing schema")
	}
	return strings.TrimSpace(edge.Schema), nil
}

func (p *Poller) processLeased(ctx context.Context, item workItem) {
	attempt := item.AttemptCount + 1
	if err := p.processItem(ctx, item, attempt); err != nil {
		classified := classifyProcessingError(err)
		p.recordProcessingFailure(ctx, item, attempt, classified)
		return
	}
}

func (p *Poller) processItem(ctx context.Context, item workItem, attempt int) error {
	resultExists, err := p.r2.Exists(ctx, item.ResultKey)
	if err != nil {
		return retryable(failureTransient, err)
	}
	if resultExists {
		return p.markCompleted(ctx, item)
	}

	manifest, err := p.loadManifest(ctx, item.EdgeKey)
	if err != nil {
		return nonRetryable(failureInvariant, err)
	}
	if manifest.IngestID != item.IngestID {
		return nonRetryable(failureInvariant, fmt.Errorf("edge key ingest_id %q does not match manifest ingest_id %q", item.IngestID, manifest.IngestID))
	}
	if manifest.RawKey != item.RawKey {
		return nonRetryable(failureInvariant, fmt.Errorf("edge key raw_key %q does not match manifest raw_key %q", item.RawKey, manifest.RawKey))
	}

	rawMessage, err := p.r2.GetBytes(ctx, manifest.RawKey)
	if err != nil {
		return retryable(failureTransient, err)
	}
	sum := sha256.Sum256(rawMessage)
	if hex.EncodeToString(sum[:]) != strings.ToLower(strings.TrimSpace(manifest.RawSHA256)) {
		return nonRetryable(failureInvariant, fmt.Errorf("raw message sha256 mismatch for key %s", manifest.RawKey))
	}

	duplicateDelivery, duplicate, forwardOnly, err := p.findDeliveredMessage(ctx, manifest.Mailbox, manifest.IngestID)
	if err != nil {
		var permanent permanentDeliveryFailure
		if errors.As(err, &permanent) {
			return p.handlePermanentDeliveryFailure(ctx, item, manifest, rawMessage, attempt, permanent)
		}
		return retryable(failureDependency, err)
	}
	if duplicate {
		return p.writeReceipt(ctx, item, manifest, duplicateDelivery, attempt, deliveryExisting)
	}

	replayHeaders := make(map[string]string, len(manifest.ATMCFHeaders)+1)
	for key, value := range manifest.ATMCFHeaders {
		replayHeaders[key] = value
	}
	replayHeaders["X-ATM-Ingest-ID"] = manifest.IngestID

	projected, err := rfc822.ProjectReplayHeaders(rawMessage, replayHeaders)
	if err != nil {
		return nonRetryable(failureInvariant, err)
	}
	if err := p.replaySMTP(ctx, manifest.EnvelopeFrom, manifest.EnvelopeTo, projected); err != nil {
		permanent, ok := permanentDeliveryFailureFromSMTP(err)
		if ok {
			return p.handlePermanentDeliveryFailure(ctx, item, manifest, rawMessage, attempt, permanent)
		}
		return retryable(failureTransient, err)
	}
	if forwardOnly {
		// WildDuck forwarded-address primitives do not have mailbox IDs. Once
		// Haraka accepts the replay for that address, WildDuck owns native
		// forwarding fanout through its supported routing path; the poller must
		// not synthesize a mailbox-local fanout or invent delivery identifiers.
		return p.writeReceipt(ctx, item, manifest, deliveryIdentifiers{}, attempt, deliveryForwarded)
	}
	delivery, err := p.waitForDeliveredMessage(ctx, manifest.Mailbox, manifest.IngestID)
	if err != nil {
		return retryable(failureDependency, err)
	}
	return p.writeReceipt(ctx, item, manifest, delivery, attempt, deliveryReplayed)
}

func (p *Poller) loadManifest(ctx context.Context, edgeKey string) (Manifest, error) {
	data, err := p.r2.GetBytes(ctx, edgeKey)
	if err != nil {
		return Manifest{}, err
	}
	return decodeManifest(data)
}

func decodeManifest(data []byte) (Manifest, error) {
	var manifest Manifest
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&manifest); err != nil {
		return Manifest{}, fmt.Errorf("decode edge json: %w", err)
	}
	if manifest.Schema != r2archive.InboundEdgeSchema {
		return Manifest{}, fmt.Errorf("edge json schema %q does not match %q", manifest.Schema, r2archive.InboundEdgeSchema)
	}
	if manifest.IngestID == "" || manifest.RawKey == "" || manifest.EdgeKey == "" || manifest.Mailbox == "" || manifest.EnvelopeTo == "" || manifest.RecipientDomain == "" || manifest.RawSHA256 == "" {
		return Manifest{}, fmt.Errorf("edge json is missing required fields")
	}
	if manifest.ReceivedAt.IsZero() {
		return Manifest{}, fmt.Errorf("edge json is missing received_at")
	}
	return manifest, nil
}

func (p *Poller) writeReceipt(ctx context.Context, item workItem, manifest Manifest, delivery deliveryIdentifiers, attempt int, source string) error {
	receipt := Receipt{
		Schema:            r2archive.InboundResultSchema,
		IngestID:          manifest.IngestID,
		Status:            statusDelivered,
		Attempt:           attempt,
		ProcessedAt:       time.Now().UTC(),
		RawKey:            manifest.RawKey,
		EdgeKey:           manifest.EdgeKey,
		WildDuckUserID:    delivery.UserID,
		WildDuckMailboxID: delivery.MailboxID,
		WildDuckMessageID: delivery.MessageID,
		DeliverySource:    source,
	}
	if err := p.r2.PutJSON(ctx, item.ResultKey, receipt); err != nil {
		return retryable(failureTransient, err)
	}
	if err := p.markDelivered(ctx, item); err != nil {
		return err
	}
	log.Printf("agent-mail-reconciler event=delivered ingest_id=%s domain=%s result_key=%s attempt=%d delivery_source=%s wildduck_user_id=%s wildduck_mailbox_id=%s wildduck_message_id=%s", manifest.IngestID, item.RecipientDomain, item.ResultKey, attempt, source, delivery.UserID, delivery.MailboxID, delivery.MessageID)
	return nil
}

func (p *Poller) handlePermanentDeliveryFailure(ctx context.Context, item workItem, manifest Manifest, originalRaw []byte, attempt int, failure permanentDeliveryFailure) error {
	dsnRecipient, err := structured.ParseMailbox(manifest.EnvelopeFrom)
	if manifest.EnvelopeFrom == "" || err != nil {
		detail := "original envelope sender is null"
		if manifest.EnvelopeFrom != "" {
			detail = "original envelope sender is invalid"
		}
		return p.writeDSNSuppressedReceipt(ctx, item, manifest, attempt, failure, detail)
	}

	feedbackAddress, err := p.feedbackAddressForDomain(ctx, manifest.RecipientDomain)
	if err != nil {
		return retryable(failureInvariant, err)
	}
	if feedbackAddress == "" {
		return retryable(failureInvariant, fmt.Errorf("missing dsn feedback address for recipient domain %q", manifest.RecipientDomain))
	}
	state, err := p.ensureDSNState(ctx, item, manifest.RecipientDomain)
	if err != nil {
		return retryable(failureTransient, err)
	}

	raw, messageID, err := p.ensureDSNRaw(ctx, state, manifest, originalRaw, feedbackAddress, dsnRecipient.Address, failure)
	if err != nil {
		return retryable(failureTransient, err)
	}
	if err := p.sendDSN(ctx, dsnRecipient.Address, raw); err != nil {
		return retryable(failureTransient, err)
	}
	return p.writeDSNSubmittedReceipt(ctx, item, manifest, attempt, failure, state, messageID, feedbackAddress, dsnRecipient.Address, raw)
}

func (p *Poller) feedbackAddressForDomain(ctx context.Context, recipientDomain string) (string, error) {
	domain, err := r2archive.CanonicalDomain(recipientDomain)
	if err != nil {
		return "", fmt.Errorf("recipient domain %q is invalid: %w", recipientDomain, err)
	}
	if p.domainSource == nil {
		return p.cfg.DSNFeedbackByDomain[domain], nil
	}
	domains, err := p.activeDomains(ctx)
	if err != nil {
		return "", err
	}
	for _, record := range domains {
		if record.Name == domain {
			return record.FeedbackAddress, nil
		}
	}
	return "", fmt.Errorf("recipient domain %q is not active in control state", domain)
}

func (p *Poller) writeDSNSubmittedReceipt(ctx context.Context, item workItem, manifest Manifest, attempt int, failure permanentDeliveryFailure, state dsnState, messageID string, feedbackAddress string, recipient string, raw []byte) error {
	receipt := Receipt{
		Schema:            r2archive.InboundResultSchema,
		IngestID:          manifest.IngestID,
		Status:            "delivery_failed_dsn_submitted",
		Attempt:           attempt,
		ProcessedAt:       time.Now().UTC(),
		RawKey:            manifest.RawKey,
		EdgeKey:           manifest.EdgeKey,
		DSNRawKey:         state.RawKey,
		DSNRawSHA256:      sha256Hex(raw),
		DSNID:             state.ID,
		DSNMessageID:      messageID,
		DSNEnvelopeFrom:   "",
		DSNEnvelopeTo:     recipient,
		DSNFrom:           feedbackAddress,
		DSNStatus:         failure.status,
		DSNAction:         dsn.ActionFailed,
		DSNDiagnosticCode: failure.diagnosticCode,
		DeliverySource:    "dsn_submitted",
		Detail:            failure.err.Error(),
	}
	if err := p.r2.PutJSON(ctx, item.ResultKey, receipt); err != nil {
		return retryable(failureTransient, err)
	}
	if err := p.markCompleted(ctx, item); err != nil {
		return retryable(failureTransient, err)
	}
	log.Printf("agent-mail-reconciler event=delivery_failed_dsn_submitted ingest_id=%s domain=%s result_key=%s dsn_id=%s dsn_raw_key=%s dsn_envelope_to=%s attempt=%d status=%s diagnostic=%q", manifest.IngestID, item.RecipientDomain, item.ResultKey, state.ID, state.RawKey, recipient, attempt, failure.status, failure.diagnosticCode)
	return nil
}

func (p *Poller) writeDSNSuppressedReceipt(ctx context.Context, item workItem, manifest Manifest, attempt int, failure permanentDeliveryFailure, detail string) error {
	receipt := Receipt{
		Schema:            r2archive.InboundResultSchema,
		IngestID:          manifest.IngestID,
		Status:            "delivery_failed_dsn_suppressed",
		Attempt:           attempt,
		ProcessedAt:       time.Now().UTC(),
		RawKey:            manifest.RawKey,
		EdgeKey:           manifest.EdgeKey,
		DSNStatus:         failure.status,
		DSNAction:         dsn.ActionFailed,
		DSNDiagnosticCode: failure.diagnosticCode,
		DeliverySource:    "dsn_suppressed",
		Detail:            detail,
	}
	if err := p.r2.PutJSON(ctx, item.ResultKey, receipt); err != nil {
		return retryable(failureTransient, err)
	}
	if err := p.markCompleted(ctx, item); err != nil {
		return retryable(failureTransient, err)
	}
	log.Printf("agent-mail-reconciler event=delivery_failed_dsn_suppressed ingest_id=%s domain=%s result_key=%s attempt=%d status=%s reason=%q", manifest.IngestID, item.RecipientDomain, item.ResultKey, attempt, failure.status, detail)
	return nil
}

func (p *Poller) ensureDSNState(ctx context.Context, item workItem, recipientDomain string) (dsnState, error) {
	return p.state.EnsureDSNState(ctx, item, recipientDomain)
}

func (p *Poller) ensureDSNRaw(ctx context.Context, state dsnState, manifest Manifest, originalRaw []byte, feedbackAddress string, recipient string, failure permanentDeliveryFailure) ([]byte, string, error) {
	exists, err := p.r2.Exists(ctx, state.RawKey)
	if err != nil {
		return nil, "", err
	}
	if exists {
		raw, err := p.r2.GetBytes(ctx, state.RawKey)
		if err != nil {
			return nil, "", err
		}
		return raw, rfc822.FormatMessageID(state.MessageID), nil
	}

	built, err := dsn.BuildFailureMessage(dsn.FailureMessage{
		DSNID:           state.ID,
		SourceIngestID:  manifest.IngestID,
		FromAddress:     feedbackAddress,
		ToAddress:       recipient,
		ReportingDomain: manifest.RecipientDomain,
		FinalRecipient:  manifest.EnvelopeTo,
		OriginalMessage: originalRaw,
		Status:          failure.status,
		DiagnosticCode:  failure.diagnosticCode,
		ReceivedAt:      manifest.ReceivedAt,
		Now:             time.Now().UTC(),
	})
	if err != nil {
		return nil, "", err
	}
	if err := p.r2.PutBytes(ctx, state.RawKey, "message/rfc822", built.Raw); err != nil {
		return nil, "", err
	}
	return built.Raw, built.MessageID, nil
}

func (p *Poller) sendDSN(ctx context.Context, recipient string, raw []byte) error {
	if p.cfg.DSNSMTPAddr == "" {
		return fmt.Errorf("missing dsn smtp address")
	}
	if recipient == "" {
		return fmt.Errorf("missing dsn recipient")
	}
	return sendSMTP(ctx, p.cfg.DSNSMTPAddr, p.cfg.DSNHeloName, "", recipient, raw)
}

func (p *Poller) findDeliveredMessage(ctx context.Context, mailboxAddress string, ingestID string) (deliveryIdentifiers, bool, bool, error) {
	return p.findDeliveredMessageAtAddress(ctx, mailboxAddress, ingestID, make(map[string]struct{}))
}

func (p *Poller) findDeliveredMessageAtAddress(ctx context.Context, mailboxAddress string, ingestID string, visited map[string]struct{}) (deliveryIdentifiers, bool, bool, error) {
	normalizedAddress := strings.ToLower(strings.TrimSpace(mailboxAddress))
	if normalizedAddress == "" {
		return deliveryIdentifiers{}, false, false, fmt.Errorf("missing mailbox address")
	}
	if _, ok := visited[normalizedAddress]; ok {
		return deliveryIdentifiers{}, false, false, nil
	}
	visited[normalizedAddress] = struct{}{}

	resolved, err := p.wd.ResolveAddress(ctx, mailboxAddress)
	if err != nil {
		if wildduck.IsNotFound(err) {
			return deliveryIdentifiers{}, false, false, permanentDeliveryFailure{
				status:         "5.1.1",
				diagnosticCode: "smtp; 550 5.1.1 No such user",
				err:            fmt.Errorf("local recipient %q does not exist", mailboxAddress),
			}
		}
		return deliveryIdentifiers{}, false, false, err
	}
	forwardOnly := resolved.User == "" && len(resolved.Targets) > 0

	if resolved.User != "" {
		userID, err := bson.ObjectIDFromHex(resolved.User)
		if err != nil {
			return deliveryIdentifiers{}, false, forwardOnly, fmt.Errorf("wildduck user id %q is not a valid ObjectID: %w", resolved.User, err)
		}

		var record struct {
			ID      bson.ObjectID `bson:"_id"`
			Mailbox bson.ObjectID `bson:"mailbox"`
		}
		err = p.messages.FindOne(ctx, bson.M{
			"user":            userID,
			"mimeTree.header": ingestIDHeaderRegex(ingestID),
		}, options.FindOne().SetProjection(bson.M{"_id": 1, "mailbox": 1})).Decode(&record)
		if err == nil {
			return deliveryIdentifiers{UserID: resolved.User, MailboxID: record.Mailbox.Hex(), MessageID: record.ID.Hex()}, true, forwardOnly, nil
		}
		if !errors.Is(err, mongo.ErrNoDocuments) {
			return deliveryIdentifiers{}, false, forwardOnly, fmt.Errorf("query existing delivery by ingest id %q: %w", ingestID, err)
		}
	}

	for _, target := range resolved.Targets {
		targetDelivery, delivered, _, err := p.findDeliveredMessageAtAddress(ctx, target, ingestID, visited)
		if err != nil {
			if wildduck.IsNotFound(err) {
				continue
			}
			var permanent permanentDeliveryFailure
			if errors.As(err, &permanent) {
				continue
			}
			return deliveryIdentifiers{}, false, forwardOnly, err
		}
		if delivered {
			return targetDelivery, true, forwardOnly, nil
		}
	}

	if resolved.User == "" && len(resolved.Targets) == 0 {
		return deliveryIdentifiers{}, false, false, fmt.Errorf("wildduck address %q resolved without user or targets", mailboxAddress)
	}
	return deliveryIdentifiers{}, false, forwardOnly, nil
}

func (p *Poller) waitForDeliveredMessage(ctx context.Context, mailboxAddress string, ingestID string) (deliveryIdentifiers, error) {
	deadline := time.Now().Add(15 * time.Second)
	for {
		ids, delivered, _, err := p.findDeliveredMessage(ctx, mailboxAddress, ingestID)
		if err != nil {
			return deliveryIdentifiers{}, err
		}
		if delivered {
			return ids, nil
		}
		if time.Now().After(deadline) {
			return deliveryIdentifiers{}, fmt.Errorf("wildduck did not expose delivered message ids for ingest id %q before receipt deadline", ingestID)
		}
		select {
		case <-ctx.Done():
			return deliveryIdentifiers{}, ctx.Err()
		case <-time.After(250 * time.Millisecond):
		}
	}
}

func ingestIDHeaderRegex(ingestID string) bson.Regex {
	pattern := "^" + regexp.QuoteMeta("X-ATM-Ingest-ID: "+ingestID) + "$"
	return bson.Regex{Pattern: pattern, Options: "i"}
}

func (p *Poller) replaySMTP(ctx context.Context, envelopeFrom string, envelopeTo string, rawMessage []byte) error {
	if strings.TrimSpace(envelopeTo) == "" {
		return fmt.Errorf("missing smtp envelope recipient")
	}
	return sendSMTP(ctx, p.cfg.HarakaAddr, p.cfg.HeloName, envelopeFrom, envelopeTo, rawMessage)
}

func sendSMTP(ctx context.Context, address string, heloName string, envelopeFrom string, envelopeTo string, rawMessage []byte) error {
	dialer := &net.Dialer{Timeout: 15 * time.Second}
	connection, err := dialer.DialContext(ctx, "tcp", address)
	if err != nil {
		return fmt.Errorf("dial smtp %s: %w", address, err)
	}
	defer connection.Close()

	client, err := smtp.NewClient(connection, hostPart(address))
	if err != nil {
		return fmt.Errorf("create smtp client for %s: %w", address, err)
	}
	defer client.Close()

	if err := client.Hello(heloName); err != nil {
		return smtpCommandError{command: "HELO", err: fmt.Errorf("smtp HELO %q: %w", heloName, err)}
	}
	if err := client.Mail(envelopeFrom); err != nil {
		return smtpCommandError{command: "MAIL", err: fmt.Errorf("smtp MAIL FROM %q: %w", envelopeFrom, err)}
	}
	if err := client.Rcpt(envelopeTo); err != nil {
		return smtpCommandError{command: "RCPT", err: fmt.Errorf("smtp RCPT TO %q: %w", envelopeTo, err)}
	}
	writer, err := client.Data()
	if err != nil {
		return smtpCommandError{command: "DATA", err: fmt.Errorf("smtp DATA: %w", err)}
	}
	if _, err := writer.Write(rawMessage); err != nil {
		return fmt.Errorf("write smtp message body: %w", err)
	}
	if err := writer.Close(); err != nil {
		return fmt.Errorf("close smtp message body: %w", err)
	}
	if err := client.Quit(); err != nil {
		return fmt.Errorf("smtp QUIT: %w", err)
	}
	return nil
}

func validateConfig(cfg Config, allowDynamicDomains bool) (runtimeConfig, error) {
	var runtimeCfg runtimeConfig
	sweepInterval, err := parseRequiredDuration(cfg.SweepInterval, "sweep_interval")
	if err != nil {
		return runtimeCfg, err
	}
	retryDelay, err := parseRequiredDuration(cfg.RetryDelay, "retry_delay")
	if err != nil {
		return runtimeCfg, err
	}
	safetyLag, err := parseRequiredDuration(cfg.SweepSafetyLag, "sweep_safety_lag")
	if err != nil {
		return runtimeCfg, err
	}
	overlap, err := parseRequiredDuration(cfg.SweepOverlap, "sweep_overlap")
	if err != nil {
		return runtimeCfg, err
	}
	if cfg.MaxRetries != 2 {
		return runtimeCfg, fmt.Errorf("max_retries must be exactly 2")
	}
	archiveStartAt, err := time.Parse(time.RFC3339, cfg.ArchiveStartAt)
	if err != nil {
		return runtimeCfg, fmt.Errorf("parse archive_start_at as RFC3339: %w", err)
	}
	if cfg.State.Mongo.URI == "" {
		return runtimeCfg, fmt.Errorf("missing state.mongo.uri")
	}
	if cfg.State.Mongo.Database == "" {
		return runtimeCfg, fmt.Errorf("missing state.mongo.database")
	}
	if cfg.Haraka.Address == "" {
		return runtimeCfg, fmt.Errorf("missing haraka.address")
	}
	if cfg.Haraka.HelloName == "" {
		return runtimeCfg, fmt.Errorf("missing haraka.hello_name")
	}
	if cfg.DSN.SMTPAddress == "" {
		return runtimeCfg, fmt.Errorf("missing dsn.smtp_address")
	}
	if cfg.DSN.HelloName == "" {
		return runtimeCfg, fmt.Errorf("missing dsn.hello_name")
	}
	if cfg.WildDuck.APIBaseURL == "" {
		return runtimeCfg, fmt.Errorf("missing wildduck.api_base_url")
	}
	if cfg.WildDuck.MongoURI == "" {
		return runtimeCfg, fmt.Errorf("missing wildduck.mongo_uri")
	}
	if cfg.WildDuck.MongoDatabase == "" {
		return runtimeCfg, fmt.Errorf("missing wildduck.mongo_database")
	}
	if len(cfg.Domains) == 0 && !allowDynamicDomains {
		return runtimeCfg, fmt.Errorf("domains must contain at least one canonical mail domain")
	}
	domains := make([]string, 0, len(cfg.Domains))
	seen := map[string]struct{}{}
	for _, value := range cfg.Domains {
		domain, err := r2archive.CanonicalDomain(value)
		if err != nil {
			return runtimeCfg, fmt.Errorf("invalid domain %q: %w", value, err)
		}
		if domain == "" {
			return runtimeCfg, fmt.Errorf("domains must not contain empty values")
		}
		if _, exists := seen[domain]; exists {
			return runtimeCfg, fmt.Errorf("duplicate domain %q", domain)
		}
		seen[domain] = struct{}{}
		domains = append(domains, domain)
	}
	dsnFeedbackByDomain := map[string]string{}
	if len(domains) > 0 {
		dsnFeedbackByDomain, err = dsnFeedbackAddressesByDomain(cfg, domains)
		if err != nil {
			return runtimeCfg, err
		}
	}

	runtimeCfg.SweepInterval = sweepInterval
	runtimeCfg.RetryDelay = retryDelay
	runtimeCfg.MaxRetries = cfg.MaxRetries
	runtimeCfg.ArchiveStartAt = archiveStartAt.UTC()
	runtimeCfg.SweepSafetyLag = safetyLag
	runtimeCfg.SweepOverlap = overlap
	runtimeCfg.Domains = domains
	runtimeCfg.StateMongoURI = cfg.State.Mongo.URI
	runtimeCfg.StateMongoDatabase = cfg.State.Mongo.Database
	runtimeCfg.HarakaAddr = cfg.Haraka.Address
	runtimeCfg.HeloName = cfg.Haraka.HelloName
	runtimeCfg.DSNSMTPAddr = cfg.DSN.SMTPAddress
	runtimeCfg.DSNHeloName = cfg.DSN.HelloName
	runtimeCfg.DSNFeedbackByDomain = dsnFeedbackByDomain
	runtimeCfg.MongoURI = cfg.WildDuck.MongoURI
	runtimeCfg.MongoDB = cfg.WildDuck.MongoDatabase
	return runtimeCfg, nil
}

func parseRequiredDuration(value string, name string) (time.Duration, error) {
	if value == "" {
		return 0, fmt.Errorf("missing %s", name)
	}
	duration, err := time.ParseDuration(value)
	if err != nil {
		return 0, fmt.Errorf("parse %s: %w", name, err)
	}
	if duration < 0 {
		return 0, fmt.Errorf("%s must not be negative", name)
	}
	if duration == 0 && name != "sweep_safety_lag" {
		return 0, fmt.Errorf("%s must be greater than zero", name)
	}
	return duration, nil
}

func redactMongoURI(value string) string {
	if value == "" {
		return ""
	}
	if at := strings.LastIndex(value, "@"); at >= 0 {
		prefixEnd := strings.Index(value, "://")
		if prefixEnd >= 0 && prefixEnd < at {
			return value[:prefixEnd+3] + "redacted@" + value[at+1:]
		}
	}
	return value
}

func dsnFeedbackAddressesByDomain(cfg Config, domains []string) (map[string]string, error) {
	if len(cfg.DSN.Domains) == 0 {
		return nil, fmt.Errorf("dsn.domains must configure a feedback address for each mail domain")
	}
	required := make(map[string]struct{}, len(domains))
	for _, domain := range domains {
		required[domain] = struct{}{}
	}
	feedback := make(map[string]string, len(cfg.DSN.Domains))
	for index, entry := range cfg.DSN.Domains {
		domain, err := r2archive.CanonicalDomain(entry.Name)
		if err != nil {
			return nil, fmt.Errorf("dsn.domains[%d].name is invalid: %w", index, err)
		}
		if domain == "" {
			return nil, fmt.Errorf("dsn.domains[%d].name is required", index)
		}
		if _, ok := required[domain]; !ok {
			return nil, fmt.Errorf("dsn.domains[%d].name %q is not listed in domains", index, domain)
		}
		address, err := structured.NormalizeMailbox(entry.FeedbackAddress)
		if err != nil {
			return nil, fmt.Errorf("dsn.domains[%d].feedback_address is invalid: %w", index, err)
		}
		addressDomain, err := structured.DomainFromAddrSpec(address)
		if err != nil {
			return nil, fmt.Errorf("dsn.domains[%d].feedback_address domain is invalid: %w", index, err)
		}
		if addressDomain != domain {
			return nil, fmt.Errorf("dsn.domains[%d].feedback_address domain %q must match %q", index, addressDomain, domain)
		}
		if existing := feedback[domain]; existing != "" {
			return nil, fmt.Errorf("dsn.domains contains duplicate domain %q", domain)
		}
		feedback[domain] = address
	}
	for domain := range required {
		if feedback[domain] == "" {
			return nil, fmt.Errorf("dsn.domains is missing feedback address for %q", domain)
		}
	}
	return feedback, nil
}

func (p *Poller) upsertPending(ctx context.Context, bundle r2archive.InboundBundle) error {
	return p.state.UpsertPending(ctx, bundle)
}

func (p *Poller) leaseNext(ctx context.Context, now time.Time) (workItem, bool, error) {
	return p.state.LeaseNext(ctx, now)
}

func (p *Poller) nextRetryAt(ctx context.Context) (time.Time, bool, error) {
	return p.state.NextRetryAt(ctx)
}

func (p *Poller) markDelivered(ctx context.Context, item workItem) error {
	return p.state.MarkDelivered(ctx, item)
}

func (p *Poller) markCompleted(ctx context.Context, item workItem) error {
	return p.state.MarkCompleted(ctx, item)
}

func (p *Poller) upsertDelivered(ctx context.Context, bundle r2archive.InboundBundle) error {
	return p.state.UpsertDelivered(ctx, bundle)
}

func (p *Poller) recordProcessingFailure(ctx context.Context, item workItem, attempt int, failure classifiedError) {
	if failure.err == nil {
		failure.err = fmt.Errorf("unknown processing failure")
	}
	if failure.retryable && attempt <= p.cfg.MaxRetries {
		nextAttempt := time.Now().UTC().Add(p.cfg.RetryDelay)
		err := p.state.RecordProcessingFailure(ctx, item, attempt, failure, p.cfg.MaxRetries, p.cfg.RetryDelay)
		if err != nil {
			log.Printf("agent-mail-reconciler event=state_update_failed ingest_id=%s domain=%s operation=retry_wait attempt=%d failure_class=%s error=%q", item.IngestID, item.RecipientDomain, attempt, failure.class, err)
			return
		}
		p.logFailure("retry_wait", item, attempt, failure.class, failure.err, nextAttempt.Format(time.RFC3339))
		return
	}
	err := p.state.RecordProcessingFailure(ctx, item, attempt, failure, p.cfg.MaxRetries, p.cfg.RetryDelay)
	if err != nil {
		log.Printf("agent-mail-reconciler event=state_update_failed ingest_id=%s domain=%s operation=blocked attempt=%d failure_class=%s error=%q", item.IngestID, item.RecipientDomain, attempt, failure.class, err)
		return
	}
	p.logFailure("blocked", item, attempt, failure.class, failure.err, "")
}

func (p *Poller) sweepStart(ctx context.Context, domain string, sweepEnd time.Time) (time.Time, error) {
	return p.state.SweepStart(ctx, domain, p.cfg.ArchiveStartAt, p.cfg.SweepOverlap, sweepEnd)
}

func (p *Poller) advanceSweepCursor(ctx context.Context, domain string, sweepEnd time.Time) error {
	return p.state.AdvanceSweepCursor(ctx, domain, sweepEnd)
}

func (p *Poller) queueStatus(ctx context.Context) (QueueStatus, error) {
	return p.state.QueueStatus(ctx)
}

func (p *Poller) lastSweepAt(ctx context.Context) (*time.Time, error) {
	return p.state.LastSweepAt(ctx)
}

func (p *Poller) recordDiscoveryDiagnostic(ctx context.Context, objectKey string, domain string, class string, err error) error {
	return p.state.RecordDiscoveryDiagnostic(ctx, objectKey, domain, class, err)
}

func (p *Poller) logFailure(event string, item workItem, attempt int, class string, err error, nextAttempt string) {
	log.Printf("agent-mail-reconciler event=%s ingest_id=%s domain=%s bundle_prefix=%s edge_key=%s raw_key=%s result_key=%s attempt=%d failure_class=%s next_attempt_at=%s error=%q", event, item.IngestID, item.RecipientDomain, item.BundlePrefix, item.EdgeKey, item.RawKey, item.ResultKey, attempt, class, nextAttempt, err)
}

func (p *Poller) logServiceFailure(event string, err error) {
	log.Printf("agent-mail-reconciler event=%s failure_class=%s error=%q", event, failureTransient, err)
}

func classifyProcessingError(err error) classifiedError {
	var classified classifiedError
	if errors.As(err, &classified) {
		return classified
	}
	return classifiedError{class: failureBug, retryable: false, err: err}
}

func permanentDeliveryFailureFromSMTP(err error) (permanentDeliveryFailure, bool) {
	var commandErr smtpCommandError
	if !errors.As(err, &commandErr) {
		return permanentDeliveryFailure{}, false
	}
	if commandErr.command != "RCPT" && commandErr.command != "DATA" {
		return permanentDeliveryFailure{}, false
	}
	var response *textproto.Error
	if !errors.As(commandErr.err, &response) {
		return permanentDeliveryFailure{}, false
	}
	if response.Code < 500 || response.Code > 599 {
		return permanentDeliveryFailure{}, false
	}
	status := "5.0.0"
	if commandErr.command == "RCPT" && response.Code == 550 {
		status = "5.1.1"
	}
	return permanentDeliveryFailure{
		status:         status,
		diagnosticCode: fmt.Sprintf("smtp; %d %s", response.Code, response.Msg),
		err:            commandErr.err,
	}, true
}

func retryable(class string, err error) error {
	return classifiedError{class: class, retryable: true, err: err}
}

func nonRetryable(class string, err error) error {
	return classifiedError{class: class, retryable: false, err: err}
}

func (e classifiedError) Error() string {
	return e.err.Error()
}

func (e classifiedError) Unwrap() error {
	return e.err
}

func (e permanentDeliveryFailure) Error() string {
	if e.err == nil {
		return "permanent delivery failure"
	}
	return e.err.Error()
}

func (e permanentDeliveryFailure) Unwrap() error {
	return e.err
}

func (e smtpCommandError) Error() string {
	if e.err == nil {
		return "smtp command failure"
	}
	return e.err.Error()
}

func (e smtpCommandError) Unwrap() error {
	return e.err
}

func utcDate(ts time.Time) time.Time {
	utc := ts.UTC()
	return time.Date(utc.Year(), utc.Month(), utc.Day(), 0, 0, 0, 0, time.UTC)
}

func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func optionalEdgeMessageID(atmcfHeaders map[string]string) string {
	for key, value := range atmcfHeaders {
		if strings.EqualFold(key, "X-ATMCF-Edge-Message-ID") {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func hostPart(addr string) string {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return addr
	}
	return host
}
