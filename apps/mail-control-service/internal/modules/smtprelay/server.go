package smtprelay

import (
	"bytes"
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/smtp"
	"net/url"
	"regexp"
	"slices"
	"strings"
	"time"

	"mail-control-service/internal/archive/r2archive"
	"mail-control-service/internal/config/configfile"
	"mail-control-service/internal/mail/rfc822"
	"mail-control-service/internal/mail/structured"
	"mail-control-service/internal/providers/cloudflaremail"
	"mail-control-service/internal/providers/sesmail"
	"mail-control-service/internal/stores/wildduck"

	"github.com/emersion/go-sasl"
	smtpserver "github.com/emersion/go-smtp"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const (
	outboundProviderCloudflare = "cloudflare"
	outboundProviderSES        = "ses"
)

var relayLogEmailPattern = regexp.MustCompile(`[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}`)

type Config struct {
	ListenAddress string              `yaml:"listen_address"`
	Hostname      string              `yaml:"hostname"`
	RelayAuth     RelayAuthConfig     `yaml:"relay_auth"`
	WebServer     WebServerConfig     `yaml:"web_server"`
	LocalDelivery LocalDeliveryConfig `yaml:"local_delivery"`
	// Delivery is checked-in operator reference data for mail identity setup.
	// The SES sender consumes the feedback return-path mapping from this config
	// so provider-bound raw mail can direct feedback into the structural mailbox.
	Delivery DeliveryConfig `yaml:"delivery"`
}

type RelayAuthConfig struct {
	Username string `yaml:"username"`
	Password string `yaml:"password"`
}

type WebServerConfig struct {
	APIBaseURL        string `yaml:"api_base_url"`
	ControlToWebToken string `yaml:"control_to_web_token"`
}

type DeliveryConfig struct {
	Domains []DeliveryDomain `yaml:"domains"`
}

type LocalDeliveryConfig struct {
	SMTPAddress   string `yaml:"smtp_address"`
	HelloName     string `yaml:"hello_name"`
	APIBaseURL    string `yaml:"api_base_url"`
	MongoURI      string `yaml:"mongo_uri"`
	MongoDatabase string `yaml:"mongo_database"`
}

type DeliveryDomain struct {
	Name     string           `yaml:"name"`
	Inbound  DeliveryInbound  `yaml:"inbound"`
	Outbound DeliveryOutbound `yaml:"outbound"`
}

type DeliveryInbound struct {
	Provider           string `yaml:"provider"`
	CloudflareZoneName string `yaml:"cloudflare_zone_name"`
}

type DeliveryOutbound struct {
	SenderDomain string                     `yaml:"sender_domain"`
	Cloudflare   DeliveryCloudflareOutbound `yaml:"cloudflare"`
	SES          DeliverySESOutbound        `yaml:"ses"`
}

type DeliveryCloudflareOutbound struct {
	SendingDomain string `yaml:"sending_domain"`
	BounceDomain  string `yaml:"bounce_domain"`
}

type DeliverySESOutbound struct {
	IdentityDomain     string `yaml:"identity_domain"`
	MailFromDomain     string `yaml:"mail_from_domain"`
	FeedbackReturnPath string `yaml:"feedback_return_path"`
}

type runtimeConfig struct {
	ListenAddress   string
	Hostname        string
	Provider        string
	MaxMessageBytes int64
	RelayUsername   string
	RelayPassword   string
	R2              r2archive.Config
	WebServer       webServerRuntimeConfig
	LocalDelivery   localDeliveryRuntimeConfig
}

type Server struct {
	cfg                  runtimeConfig
	sender               outboundSender
	r2                   *r2archive.Client
	localDomainResolver  LocalRecipientDomainResolver
	activeDomainResolver ActiveDomainResolver
	localDeliverer       localDeliverer
	localProof           *localDeliveryProof
	mongo                *mongo.Client
}

type Status struct {
	OK              bool     `json:"ok"`
	Configured      bool     `json:"configured"`
	Issues          []string `json:"issues,omitempty"`
	ListenAddress   string   `json:"listen_address"`
	Hostname        string   `json:"hostname"`
	Provider        string   `json:"provider"`
	MaxMessageBytes int64    `json:"max_message_bytes"`
}

type Session struct {
	server           *Server
	authenticated    bool
	envelopeFrom     string
	mailFromAccepted bool
	recipients       []string
}

type OutboundReceipt struct {
	Schema                  string    `json:"schema"`
	SendID                  string    `json:"send_id"`
	RouteType               string    `json:"route_type"`
	LocalRouteID            string    `json:"local_route_id,omitempty"`
	Status                  string    `json:"status"`
	ZoneMTAQueueID          string    `json:"zonemta_queue_id"`
	EnvelopeFrom            string    `json:"envelope_from"`
	EnvelopeTo              []string  `json:"envelope_to"`
	SenderDomain            string    `json:"sender_domain"`
	ArchiveDomain           string    `json:"archive_domain,omitempty"`
	SourceMailbox           string    `json:"source_mailbox,omitempty"`
	SourceDomain            string    `json:"source_domain,omitempty"`
	TargetMailbox           string    `json:"target_mailbox,omitempty"`
	TargetDomain            string    `json:"target_domain,omitempty"`
	VisibleFrom             string    `json:"visible_from,omitempty"`
	VisibleSenderDomain     string    `json:"visible_sender_domain,omitempty"`
	MessageID               string    `json:"message_id,omitempty"`
	IsDSN                   bool      `json:"is_dsn,omitempty"`
	DSNID                   string    `json:"dsn_id,omitempty"`
	SourceIngestID          string    `json:"source_ingest_id,omitempty"`
	Provider                string    `json:"provider"`
	ProviderMessageID       string    `json:"provider_message_id,omitempty"`
	ProviderRawSHA256       string    `json:"provider_raw_sha256,omitempty"`
	ProviderPayloadKey      string    `json:"provider_payload_key,omitempty"`
	ProviderRawKey          string    `json:"provider_raw_key,omitempty"`
	ProviderBoundarySender  string    `json:"provider_boundary_sender,omitempty"`
	ProviderReversePathMode string    `json:"provider_reverse_path_mode,omitempty"`
	RelayRawKey             string    `json:"relay_raw_key"`
	RawKey                  string    `json:"raw_key"`
	SourceInboundRawKey     string    `json:"source_inbound_raw_key,omitempty"`
	SourceInboundResultKey  string    `json:"source_inbound_result_key,omitempty"`
	TargetInboundRawKey     string    `json:"target_inbound_raw_key,omitempty"`
	TargetInboundEdgeKey    string    `json:"target_inbound_edge_key,omitempty"`
	TargetInboundResultKey  string    `json:"target_inbound_result_key,omitempty"`
	SubmittedAt             time.Time `json:"submitted_at"`
	CompletedAt             time.Time `json:"completed_at"`
	To                      []string  `json:"to"`
	CC                      []string  `json:"cc,omitempty"`
	BCC                     []string  `json:"bcc,omitempty"`
	Delivered               []string  `json:"delivered,omitempty"`
	Queued                  []string  `json:"queued,omitempty"`
	Error                   string    `json:"error,omitempty"`
}

type OutboundRelayMetadata struct {
	Schema                 string    `json:"schema"`
	SendID                 string    `json:"send_id"`
	RouteType              string    `json:"route_type"`
	LocalRouteID           string    `json:"local_route_id,omitempty"`
	RelayRawKey            string    `json:"relay_raw_key"`
	RelayRawSHA256         string    `json:"relay_raw_sha256"`
	ZoneMTAQueueID         string    `json:"zonemta_queue_id"`
	EnvelopeFrom           string    `json:"envelope_from"`
	EnvelopeTo             []string  `json:"envelope_to"`
	SenderDomain           string    `json:"sender_domain"`
	ArchiveDomain          string    `json:"archive_domain,omitempty"`
	SourceMailbox          string    `json:"source_mailbox,omitempty"`
	SourceDomain           string    `json:"source_domain,omitempty"`
	TargetMailbox          string    `json:"target_mailbox,omitempty"`
	TargetDomain           string    `json:"target_domain,omitempty"`
	VisibleFrom            string    `json:"visible_from,omitempty"`
	VisibleSenderDomain    string    `json:"visible_sender_domain,omitempty"`
	DeliveryDomain         string    `json:"delivery_domain"`
	MessageID              string    `json:"message_id,omitempty"`
	IsDSN                  bool      `json:"is_dsn,omitempty"`
	DSNID                  string    `json:"dsn_id,omitempty"`
	SourceIngestID         string    `json:"source_ingest_id,omitempty"`
	SourceInboundRawKey    string    `json:"source_inbound_raw_key,omitempty"`
	SourceInboundResultKey string    `json:"source_inbound_result_key,omitempty"`
	TargetInboundRawKey    string    `json:"target_inbound_raw_key,omitempty"`
	TargetInboundEdgeKey   string    `json:"target_inbound_edge_key,omitempty"`
	TargetInboundResultKey string    `json:"target_inbound_result_key,omitempty"`
	Provider               string    `json:"provider"`
	SubmittedAt            time.Time `json:"submitted_at"`
}

type outboundArchive struct {
	SendID        string
	SubmittedAt   time.Time
	SenderDomain  string
	Bundle        r2archive.OutboundBundle
	RelayMetadata OutboundRelayMetadata
}

type localRouteContext struct {
	LocalRouteID           string
	SourceMailbox          string
	SourceDomain           string
	TargetMailbox          string
	TargetDomain           string
	VisibleFrom            string
	VisibleSenderDomain    string
	SourceIngestID         string
	SourceInboundRawKey    string
	SourceInboundResultKey string
	TargetInboundRawKey    string
	TargetInboundEdgeKey   string
	TargetInboundResultKey string
	ExistingDelivery       localDeliveryRecord
}

type localDeliveryRecord struct {
	RouteID   string
	UserID    string
	MailboxID string
	MessageID string
	Headers   []string
}

type localInboundEdge struct {
	Schema                  string    `json:"schema"`
	LocalRouteID            string    `json:"local_route_id"`
	RawKey                  string    `json:"raw_key"`
	RawSHA256               string    `json:"raw_sha256"`
	SourceMailbox           string    `json:"source_mailbox"`
	SourceDomain            string    `json:"source_domain"`
	TargetMailbox           string    `json:"target_mailbox"`
	TargetDomain            string    `json:"target_domain"`
	VisibleFrom             string    `json:"visible_from,omitempty"`
	VisibleSenderDomain     string    `json:"visible_sender_domain,omitempty"`
	ZoneMTAQueueID          string    `json:"zonemta_queue_id"`
	SourceIngestID          string    `json:"source_ingest_id,omitempty"`
	SourceOutboundRelayKey  string    `json:"source_outbound_relay_key"`
	SourceOutboundResultKey string    `json:"source_outbound_result_key"`
	RoutedAt                time.Time `json:"routed_at"`
}

type localInboundResult struct {
	Schema                  string    `json:"schema"`
	LocalRouteID            string    `json:"local_route_id"`
	Status                  string    `json:"status"`
	DeliverySource          string    `json:"delivery_source"`
	RawKey                  string    `json:"raw_key"`
	EdgeKey                 string    `json:"edge_key"`
	SourceOutboundRelayKey  string    `json:"source_outbound_relay_key"`
	SourceOutboundResultKey string    `json:"source_outbound_result_key"`
	SourceMailbox           string    `json:"source_mailbox"`
	TargetMailbox           string    `json:"target_mailbox"`
	TargetDomain            string    `json:"target_domain"`
	WildDuckUserID          string    `json:"wildduck_user_id,omitempty"`
	WildDuckMailboxID       string    `json:"wildduck_mailbox_id,omitempty"`
	WildDuckMessageID       string    `json:"wildduck_message_id,omitempty"`
	CompletedAt             time.Time `json:"completed_at"`
	Error                   string    `json:"error,omitempty"`
}

type outboundSendResult struct {
	Provider                string
	ProviderMessageID       string
	ProviderRawSHA256       string
	ProviderRaw             []byte
	ProviderContentType     string
	ProviderBoundarySender  string
	ProviderReversePathMode string
	Delivered               []string
	Queued                  []string
}

type outboundSender interface {
	Send(ctx context.Context, submission rfc822.Submission, envelopeRecipients []string) (outboundSendResult, error)
}

type ActiveDomainContext struct {
	OrganizationID       string
	OrganizationPublicID string
	Domain               string
	ArchivePrefix        string
}

type ActiveDomainResolver interface {
	ActiveDomain(ctx context.Context, domain string) (ActiveDomainContext, error)
}

type localDeliveryRuntimeConfig struct {
	Enabled       bool
	SMTPAddress   string
	HelloName     string
	APIBaseURL    string
	MongoURI      string
	MongoDatabase string
}

type webServerRuntimeConfig struct {
	APIBaseURL        string
	ControlToWebToken string
}

type localDeliverer interface {
	Deliver(ctx context.Context, envelopeFrom string, recipients []string, rawMessage []byte) error
}

type localDeliveryProof struct {
	wd       *wildduck.Client
	messages *mongo.Collection
}

type localRouteProofQuery struct {
	RouteID        string
	ZoneMTAQueueID string
	SourceIngestID string
	MessageID      string
}

type smtpLocalDeliverer struct {
	address  string
	heloName string
}

type webCloudflareSender struct {
	baseURL        *url.URL
	controlToken   string
	domainResolver ActiveDomainResolver
	httpClient     *http.Client
}

type webCloudflareSendRequest struct {
	OrganizationID       string   `json:"organization_id"`
	OrganizationPublicID string   `json:"organization_public_id"`
	Domain               string   `json:"domain"`
	From                 string   `json:"from"`
	Recipients           []string `json:"recipients"`
	MIMEMessage          string   `json:"mime_message"`
	ZoneMTAQueueID       string   `json:"zonemta_queue_id,omitempty"`
}

type webCloudflareSendResult struct {
	Delivered        []string `json:"delivered"`
	PermanentBounces []string `json:"permanent_bounces"`
	Queued           []string `json:"queued"`
}

type sesSender struct {
	client              *sesmail.Client
	feedbackReturnPaths map[string]string
	returnPathResolver  SESReturnPathResolver
}

type SESReturnPathResolver interface {
	SESFeedbackReturnPath(ctx context.Context, senderDomain string) (string, error)
}

type LocalRecipientDomainResolver interface {
	LocalRecipientDomain(ctx context.Context, recipientDomain string) (bool, error)
}

type staticLocalDomainResolver map[string]struct{}

func New(ctx context.Context, configPath string) (*Server, error) {
	return newServerFromPath(ctx, configPath, nil)
}

func NewWithSESReturnPathResolver(ctx context.Context, configPath string, resolver SESReturnPathResolver) (*Server, error) {
	if resolver == nil {
		return nil, fmt.Errorf("missing SES return-path resolver")
	}
	return newServerFromPath(ctx, configPath, resolver)
}

func NewWithSESReturnPathResolverConfig(ctx context.Context, cfg Config, resolver SESReturnPathResolver) (*Server, error) {
	if resolver == nil {
		return nil, fmt.Errorf("missing SES return-path resolver")
	}
	return newServer(ctx, cfg, resolver)
}

func newServerFromPath(ctx context.Context, configPath string, resolver SESReturnPathResolver) (*Server, error) {
	var cfg Config
	if err := configfile.LoadYAML(configPath, &cfg); err != nil {
		return nil, err
	}
	return newServer(ctx, cfg, resolver)
}

func newServer(ctx context.Context, cfg Config, resolver SESReturnPathResolver) (*Server, error) {
	runtimeCfg, err := validateConfig(cfg)
	if err != nil {
		return nil, err
	}

	runtimeCfg.Provider = outboundProviderCloudflare
	runtimeCfg.MaxMessageBytes = maxMessageBytesForProvider(runtimeCfg.Provider)
	activeDomainResolver, _ := resolver.(ActiveDomainResolver)
	if runtimeCfg.Provider == outboundProviderCloudflare && activeDomainResolver == nil {
		return nil, fmt.Errorf("missing active domain resolver for Cloudflare outbound relay")
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

	sender, err := newOutboundSender(runtimeCfg.Provider, runtimeCfg.WebServer, activeDomainResolver)
	if err != nil {
		return nil, err
	}
	localDomainResolver, _ := resolver.(LocalRecipientDomainResolver)
	if runtimeCfg.LocalDelivery.Enabled && localDomainResolver == nil {
		localDomainResolver, err = staticLocalDomainResolverFromDelivery(cfg.Delivery)
		if err != nil {
			return nil, err
		}
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
	var wdClient *wildduck.Client
	var mongoClient *mongo.Client
	var localProof *localDeliveryProof
	if runtimeCfg.LocalDelivery.Enabled {
		accessToken, err := configfile.RequireEnv("AT_EMAIL_ADMIN_WILDDUCK_ADMIN_ACCESS_TOKEN")
		if err != nil {
			return nil, err
		}
		wdClient, err = wildduck.New(runtimeCfg.LocalDelivery.APIBaseURL, accessToken)
		if err != nil {
			return nil, fmt.Errorf("initialize local delivery WildDuck client: %w", err)
		}
		mongoClient, err = mongo.Connect(options.Client().ApplyURI(runtimeCfg.LocalDelivery.MongoURI))
		if err != nil {
			return nil, fmt.Errorf("connect local delivery mongodb: %w", err)
		}
		localProof = &localDeliveryProof{
			wd:       wdClient,
			messages: mongoClient.Database(runtimeCfg.LocalDelivery.MongoDatabase).Collection("messages"),
		}
	}

	return &Server{
		cfg:                  runtimeCfg,
		sender:               sender,
		r2:                   r2Client,
		localDomainResolver:  localDomainResolver,
		activeDomainResolver: activeDomainResolver,
		localDeliverer:       newLocalDeliverer(runtimeCfg.LocalDelivery),
		localProof:           localProof,
		mongo:                mongoClient,
	}, nil
}

func (s *Server) Close(ctx context.Context) error {
	if s == nil || s.mongo == nil {
		return nil
	}
	return s.mongo.Disconnect(ctx)
}

func (s *Server) Run(ctx context.Context) error {
	backend := &backend{server: s}
	srv := smtpserver.NewServer(backend)
	srv.Addr = s.cfg.ListenAddress
	srv.Domain = s.cfg.Hostname
	srv.MaxRecipients = 50
	srv.MaxMessageBytes = s.cfg.MaxMessageBytes
	srv.AllowInsecureAuth = true

	errCh := make(chan error, 1)
	go func() {
		log.Printf("agent-mail-provider-relay listening on %s", s.cfg.ListenAddress)
		errCh <- srv.ListenAndServe()
	}()

	select {
	case <-ctx.Done():
		_ = srv.Close()
		return ctx.Err()
	case err := <-errCh:
		if err == nil || errors.Is(err, net.ErrClosed) {
			return nil
		}
		return err
	}
}

func (s *Server) Status() Status {
	status := Status{
		OK:              true,
		Configured:      true,
		ListenAddress:   s.cfg.ListenAddress,
		Hostname:        s.cfg.Hostname,
		Provider:        s.cfg.Provider,
		MaxMessageBytes: s.cfg.MaxMessageBytes,
	}
	if s.cfg.ListenAddress == "" {
		status.OK = false
		status.Issues = append(status.Issues, "listen_address_missing")
	}
	if s.cfg.Provider == "" {
		status.OK = false
		status.Issues = append(status.Issues, "provider_missing")
	}
	return status
}

type backend struct {
	server *Server
}

func (b *backend) NewSession(_ *smtpserver.Conn) (smtpserver.Session, error) {
	return &Session{
		server: b.server,
	}, nil
}

func (s *Session) AuthMechanisms() []string {
	return []string{sasl.Plain}
}

func (s *Session) Auth(mech string) (sasl.Server, error) {
	if mech != sasl.Plain {
		return nil, fmt.Errorf("unsupported smtp auth mechanism %q", mech)
	}

	return sasl.NewPlainServer(func(identity string, username string, password string) error {
		if identity != "" && identity != username {
			return fmt.Errorf("smtp auth identity %q does not match username %q", identity, username)
		}
		if subtle.ConstantTimeCompare([]byte(username), []byte(s.server.cfg.RelayUsername)) != 1 ||
			subtle.ConstantTimeCompare([]byte(password), []byte(s.server.cfg.RelayPassword)) != 1 {
			return fmt.Errorf("smtp auth failed")
		}
		s.authenticated = true
		return nil
	}), nil
}

func (s *Session) Mail(from string, _ *smtpserver.MailOptions) error {
	if !s.authenticated {
		return fmt.Errorf("smtp auth is required before MAIL FROM")
	}
	if from != "" && normalizeAddress(from) == "" {
		return fmt.Errorf("invalid smtp envelope from %q", from)
	}

	s.envelopeFrom = from
	s.mailFromAccepted = true
	s.recipients = s.recipients[:0]
	return nil
}

func (s *Session) Rcpt(to string, _ *smtpserver.RcptOptions) error {
	if !s.mailFromAccepted {
		return fmt.Errorf("MAIL FROM must be accepted before RCPT TO")
	}
	normalized := normalizeAddress(to)
	if normalized == "" {
		return fmt.Errorf("empty RCPT TO address")
	}
	s.recipients = append(s.recipients, normalized)
	return nil
}

func (s *Session) Data(reader io.Reader) error {
	if !s.authenticated {
		return fmt.Errorf("smtp auth is required before DATA")
	}
	if !s.mailFromAccepted {
		return fmt.Errorf("MAIL FROM must be accepted before DATA")
	}
	if len(s.recipients) == 0 {
		return fmt.Errorf("at least one RCPT TO is required before DATA")
	}

	rawMessage, err := io.ReadAll(io.LimitReader(reader, s.server.cfg.MaxMessageBytes+1))
	if err != nil {
		return fmt.Errorf("read smtp data: %w", err)
	}
	if int64(len(rawMessage)) > s.server.cfg.MaxMessageBytes {
		return fmt.Errorf("message exceeds the %d byte size limit for provider %s", s.server.cfg.MaxMessageBytes, s.server.cfg.Provider)
	}

	submission, err := rfc822.BuildProviderRelaySubmission(rawMessage, s.envelopeFrom, s.recipients)
	if err != nil {
		return err
	}
	if s.envelopeFrom == "" && !submission.IsDSN {
		return fmt.Errorf("empty smtp envelope from is allowed only for delivery-status notifications")
	}
	if submission.IsDSN && len(uniqueStrings(s.recipients)) != 1 {
		return fmt.Errorf("delivery-status notifications must have exactly one smtp envelope recipient")
	}
	senderDomain := domainPart(submission.From.Address)
	if senderDomain == "" {
		return fmt.Errorf("sender address %q does not contain a canonical domain", submission.From.Address)
	}

	localDisposition, err := s.server.localDeliveryDisposition(context.Background(), s.recipients)
	if err != nil {
		return err
	}

	if localDisposition == localDeliveryMixed {
		return fmt.Errorf("provider relay transaction mixes active local and external recipient domains; ZoneMTA must split local and provider delivery")
	}

	if localDisposition != localDeliveryAll {
		if err := validateSubmissionForProvider(s.server.cfg.Provider, submission); err != nil {
			return err
		}
	}

	var localRoute *localRouteContext
	archiveDomain := senderDomain
	relayProvider := s.server.cfg.Provider
	if localDisposition == localDeliveryAll {
		relayProvider = "local"
		localRoute, err = s.prepareLocalRoute(context.Background(), submission)
		if err != nil {
			return err
		}
		archiveDomain = localRoute.SourceDomain
	}
	archive, err := s.writeRelayArchive(context.Background(), submission, archiveDomain, relayProvider, localRoute)
	if err != nil {
		return err
	}

	if localDisposition == localDeliveryAll {
		return s.deliverLocal(context.Background(), archive, submission, localRoute)
	}

	return s.deliverProvider(context.Background(), archive, submission)
}

func (s *Session) writeRelayArchive(ctx context.Context, submission rfc822.Submission, archiveDomain string, relayProvider string, localRoute *localRouteContext) (outboundArchive, error) {
	sendID := ""
	routeType := "provider"
	if localRoute != nil {
		sendID = localRoute.LocalRouteID
		routeType = "local"
	}
	if sendID == "" {
		var err error
		sendID, err = r2archive.NewUUIDv7String()
		if err != nil {
			return outboundArchive{}, err
		}
	}
	submittedAt := time.Now().UTC()
	bundleAt := submittedAt
	if localRoute != nil {
		routeAt, err := r2archive.UUIDv7Time(sendID)
		if err != nil {
			return outboundArchive{}, fmt.Errorf("decode local route id time: %w", err)
		}
		bundleAt = routeAt
	}
	bundle, err := r2archive.OutboundBundleKeys(archiveDomain, bundleAt, sendID, relayProvider)
	if err != nil {
		return outboundArchive{}, err
	}

	if err := s.server.r2.PutBytes(ctx, bundle.RelayKey, "message/rfc822", submission.RawMessage); err != nil {
		return outboundArchive{}, err
	}
	relayMeta := OutboundRelayMetadata{
		Schema:         r2archive.OutboundRelaySchema,
		SendID:         sendID,
		RouteType:      routeType,
		RelayRawKey:    bundle.RelayKey,
		RelayRawSHA256: sha256Hex(submission.RawMessage),
		ZoneMTAQueueID: submission.ZoneMTAQueueID,
		EnvelopeFrom:   s.envelopeFrom,
		EnvelopeTo:     append([]string{}, s.recipients...),
		SenderDomain:   domainPart(submission.From.Address),
		DeliveryDomain: archiveDomain,
		MessageID:      submission.MessageID,
		IsDSN:          submission.IsDSN,
		DSNID:          submission.InternalDSNID,
		SourceIngestID: submission.InternalSourceIngestID,
		Provider:       relayProvider,
		SubmittedAt:    submittedAt,
	}
	if localRoute != nil {
		relayMeta.LocalRouteID = localRoute.LocalRouteID
		relayMeta.ArchiveDomain = localRoute.SourceDomain
		relayMeta.SourceMailbox = localRoute.SourceMailbox
		relayMeta.SourceDomain = localRoute.SourceDomain
		relayMeta.TargetMailbox = localRoute.TargetMailbox
		relayMeta.TargetDomain = localRoute.TargetDomain
		relayMeta.VisibleFrom = localRoute.VisibleFrom
		relayMeta.VisibleSenderDomain = localRoute.VisibleSenderDomain
		relayMeta.SourceIngestID = localRoute.SourceIngestID
		relayMeta.SourceInboundRawKey = localRoute.SourceInboundRawKey
		relayMeta.SourceInboundResultKey = localRoute.SourceInboundResultKey
		relayMeta.TargetInboundRawKey = localRoute.TargetInboundRawKey
		relayMeta.TargetInboundEdgeKey = localRoute.TargetInboundEdgeKey
		relayMeta.TargetInboundResultKey = localRoute.TargetInboundResultKey
	}
	if err := s.server.r2.PutJSON(ctx, bundle.RelayMetaKey, relayMeta); err != nil {
		return outboundArchive{}, err
	}

	return outboundArchive{
		SendID:        sendID,
		SubmittedAt:   submittedAt,
		SenderDomain:  archiveDomain,
		Bundle:        bundle,
		RelayMetadata: relayMeta,
	}, nil
}

func (s *Session) deliverProvider(ctx context.Context, archive outboundArchive, submission rfc822.Submission) error {
	result, sendErr := s.server.sender.Send(ctx, submission, s.recipients)

	providerRawKey := ""
	if len(result.ProviderRaw) > 0 {
		providerRawKey = archive.Bundle.ProviderKey
		contentType := result.ProviderContentType
		if contentType == "" {
			contentType = "application/octet-stream"
		}
		if err := s.server.r2.PutBytes(ctx, providerRawKey, contentType, result.ProviderRaw); err != nil {
			return err
		}
	}

	status := "provider_accepted"
	errorMessage := ""
	if sendErr != nil {
		status = "provider_failed"
		errorMessage = sendErr.Error()
	}
	provider := result.Provider
	if provider == "" {
		provider = s.server.cfg.Provider
	}
	receipt := OutboundReceipt{
		Schema:                  r2archive.OutboundResultSchema,
		SendID:                  archive.SendID,
		RouteType:               "provider",
		Status:                  status,
		ZoneMTAQueueID:          submission.ZoneMTAQueueID,
		EnvelopeFrom:            s.envelopeFrom,
		EnvelopeTo:              append([]string{}, s.recipients...),
		SenderDomain:            archive.SenderDomain,
		MessageID:               submission.MessageID,
		IsDSN:                   submission.IsDSN,
		DSNID:                   submission.InternalDSNID,
		SourceIngestID:          submission.InternalSourceIngestID,
		Provider:                provider,
		ProviderMessageID:       result.ProviderMessageID,
		ProviderRawSHA256:       result.ProviderRawSHA256,
		ProviderPayloadKey:      providerRawKey,
		ProviderRawKey:          providerRawKey,
		ProviderBoundarySender:  result.ProviderBoundarySender,
		ProviderReversePathMode: result.ProviderReversePathMode,
		RelayRawKey:             archive.Bundle.RelayKey,
		RawKey:                  archive.Bundle.RelayKey,
		SubmittedAt:             archive.SubmittedAt,
		CompletedAt:             time.Now().UTC(),
		To:                      submission.To,
		CC:                      submission.CC,
		BCC:                     submission.BCC,
		Delivered:               result.Delivered,
		Queued:                  result.Queued,
		Error:                   errorMessage,
	}
	if err := s.server.r2.PutJSON(ctx, archive.Bundle.ResultKey, receipt); err != nil {
		return err
	}
	if sendErr != nil {
		log.Printf("agent-mail-provider-relay event=provider_failed send_id=%s zonemta_queue_id=%s sender_domain=%s provider=%s has_result_key=%t error=%q", archive.SendID, submission.ZoneMTAQueueID, archive.SenderDomain, provider, archive.Bundle.ResultKey != "", sanitizeRelayLogError(sendErr))
		return sendErr
	}
	log.Printf("agent-mail-provider-relay event=provider_accepted send_id=%s zonemta_queue_id=%s sender_domain=%s provider=%s has_result_key=%t provider_message_id=%s", archive.SendID, submission.ZoneMTAQueueID, archive.SenderDomain, provider, archive.Bundle.ResultKey != "", result.ProviderMessageID)

	return nil
}

func (s *Session) prepareLocalRoute(ctx context.Context, submission rfc822.Submission) (*localRouteContext, error) {
	if s.server.localProof == nil {
		return nil, fmt.Errorf("local delivery proof is not configured")
	}
	recipients := uniqueStrings(s.recipients)
	if len(recipients) != 1 {
		return nil, fmt.Errorf("local relay transaction must contain exactly one unique recipient")
	}
	sourceMailbox := normalizeAddress(submission.ReplayEnvelopeTo)
	if sourceMailbox == "" {
		return nil, fmt.Errorf("local route requires X-ATMCF-Edge-Envelope-To source mailbox provenance")
	}
	sourceDomain := domainPart(sourceMailbox)
	if sourceDomain == "" {
		return nil, fmt.Errorf("local route source mailbox %q does not contain a canonical domain", sourceMailbox)
	}
	targetMailbox := recipients[0]
	targetDomain := domainPart(targetMailbox)
	if targetDomain == "" {
		return nil, fmt.Errorf("local route target mailbox %q does not contain a canonical domain", targetMailbox)
	}
	sourceIngestID := strings.TrimSpace(submission.ReplayIngestID)
	sourceRawKey := ""
	sourceResultKey := ""
	if sourceIngestID != "" {
		if s.server.activeDomainResolver == nil {
			return nil, fmt.Errorf("local route source archive prefix resolver is not configured")
		}
		sourceCreatedAt, err := r2archive.UUIDv7Time(sourceIngestID)
		if err != nil {
			return nil, fmt.Errorf("local route source ingest id is invalid: %w", err)
		}
		sourceActiveDomain, err := s.server.activeDomainResolver.ActiveDomain(ctx, sourceDomain)
		if err != nil {
			return nil, fmt.Errorf("resolve source archive prefix: %w", err)
		}
		sourceBundle, err := r2archive.InboundBundleKeysFromArchivePrefix(sourceActiveDomain.ArchivePrefix, sourceCreatedAt, sourceIngestID)
		if err != nil {
			return nil, fmt.Errorf("build source inbound keys: %w", err)
		}
		sourceRawKey = sourceBundle.RawKey
		sourceResultKey = sourceBundle.ResultKey
	}

	existing, found, err := s.server.localProof.FindExisting(ctx, targetMailbox, localRouteProofQuery{
		ZoneMTAQueueID: submission.ZoneMTAQueueID,
		SourceIngestID: sourceIngestID,
		MessageID:      submission.MessageID,
	})
	if err != nil {
		return nil, err
	}

	localRouteID := existing.RouteID
	if found && localRouteID == "" {
		return nil, fmt.Errorf("existing local target copy is missing X-Agent-Mail-Local-Route-ID")
	}
	if localRouteID == "" {
		localRouteID, err = r2archive.NewUUIDv7String()
		if err != nil {
			return nil, err
		}
	}
	routeCreatedAt, err := r2archive.UUIDv7Time(localRouteID)
	if err != nil {
		return nil, fmt.Errorf("local route id is invalid: %w", err)
	}
	if s.server.activeDomainResolver == nil {
		return nil, fmt.Errorf("local route target archive prefix resolver is not configured")
	}
	targetActiveDomain, err := s.server.activeDomainResolver.ActiveDomain(ctx, targetDomain)
	if err != nil {
		return nil, fmt.Errorf("resolve target archive prefix: %w", err)
	}
	targetBundle, err := r2archive.InboundBundleKeysFromArchivePrefix(targetActiveDomain.ArchivePrefix, routeCreatedAt, localRouteID)
	if err != nil {
		return nil, fmt.Errorf("build target inbound keys: %w", err)
	}

	return &localRouteContext{
		LocalRouteID:           localRouteID,
		SourceMailbox:          sourceMailbox,
		SourceDomain:           sourceDomain,
		TargetMailbox:          targetMailbox,
		TargetDomain:           targetDomain,
		VisibleFrom:            rfc822.FormatAddress(submission.From),
		VisibleSenderDomain:    domainPart(submission.From.Address),
		SourceIngestID:         sourceIngestID,
		SourceInboundRawKey:    sourceRawKey,
		SourceInboundResultKey: sourceResultKey,
		TargetInboundRawKey:    targetBundle.RawKey,
		TargetInboundEdgeKey:   targetBundle.EdgeKey,
		TargetInboundResultKey: targetBundle.ResultKey,
		ExistingDelivery:       existing,
	}, nil
}

func (s *Session) deliverLocal(ctx context.Context, archive outboundArchive, submission rfc822.Submission, route *localRouteContext) error {
	if route == nil {
		return fmt.Errorf("missing local route context")
	}

	routeHeaders := map[string]string{
		"X-Agent-Mail-Local-Route-ID":   route.LocalRouteID,
		"X-Agent-Mail-Source-Mailbox":   route.SourceMailbox,
		"X-Agent-Mail-Target-Mailbox":   route.TargetMailbox,
		"X-Agent-Mail-ZoneMTA-Queue-ID": submission.ZoneMTAQueueID,
	}
	if route.SourceIngestID != "" {
		routeHeaders["X-Agent-Mail-Source-Ingest-ID"] = route.SourceIngestID
	}
	localRaw, err := rfc822.ProjectLocalRouteHeaders(submission.RawMessage, routeHeaders)
	if err != nil {
		return err
	}

	delivery := route.ExistingDelivery
	deliverySource := "existing"
	deliverErr := error(nil)
	if delivery.RouteID == "" {
		deliverySource = "local_route"
		deliverErr = s.server.localDeliverer.Deliver(ctx, localRouteEnvelopeFrom(submission, s.envelopeFrom), []string{route.TargetMailbox}, localRaw)
		if deliverErr == nil {
			delivery, deliverErr = s.server.localProof.WaitForRoute(ctx, route.TargetMailbox, route.LocalRouteID)
		}
	}

	targetStatus := "local_routed_delivered"
	sourceStatus := "local_routed"
	errorMessage := ""
	delivered := []string{route.TargetMailbox}
	if deliverErr != nil {
		targetStatus = "local_route_failed"
		sourceStatus = "local_route_failed"
		errorMessage = deliverErr.Error()
		delivered = nil
	}

	if err := s.server.r2.PutBytes(ctx, route.TargetInboundRawKey, "message/rfc822", localRaw); err != nil {
		return err
	}
	routedAt := time.Now().UTC()
	targetEdge := localInboundEdge{
		Schema:                  r2archive.InboundLocalRouteEdgeSchema,
		LocalRouteID:            route.LocalRouteID,
		RawKey:                  route.TargetInboundRawKey,
		RawSHA256:               sha256Hex(localRaw),
		SourceMailbox:           route.SourceMailbox,
		SourceDomain:            route.SourceDomain,
		TargetMailbox:           route.TargetMailbox,
		TargetDomain:            route.TargetDomain,
		VisibleFrom:             route.VisibleFrom,
		VisibleSenderDomain:     route.VisibleSenderDomain,
		ZoneMTAQueueID:          submission.ZoneMTAQueueID,
		SourceIngestID:          route.SourceIngestID,
		SourceOutboundRelayKey:  archive.Bundle.RelayKey,
		SourceOutboundResultKey: archive.Bundle.ResultKey,
		RoutedAt:                routedAt,
	}
	if err := s.server.r2.PutJSON(ctx, route.TargetInboundEdgeKey, targetEdge); err != nil {
		return err
	}
	targetResult := localInboundResult{
		Schema:                  r2archive.InboundLocalRouteResultSchema,
		LocalRouteID:            route.LocalRouteID,
		Status:                  targetStatus,
		DeliverySource:          deliverySource,
		RawKey:                  route.TargetInboundRawKey,
		EdgeKey:                 route.TargetInboundEdgeKey,
		SourceOutboundRelayKey:  archive.Bundle.RelayKey,
		SourceOutboundResultKey: archive.Bundle.ResultKey,
		SourceMailbox:           route.SourceMailbox,
		TargetMailbox:           route.TargetMailbox,
		TargetDomain:            route.TargetDomain,
		WildDuckUserID:          delivery.UserID,
		WildDuckMailboxID:       delivery.MailboxID,
		WildDuckMessageID:       delivery.MessageID,
		CompletedAt:             time.Now().UTC(),
		Error:                   errorMessage,
	}
	if err := s.server.r2.PutJSON(ctx, route.TargetInboundResultKey, targetResult); err != nil {
		return err
	}

	receipt := OutboundReceipt{
		Schema:                 r2archive.OutboundResultSchema,
		SendID:                 archive.SendID,
		RouteType:              "local",
		LocalRouteID:           route.LocalRouteID,
		Status:                 sourceStatus,
		ZoneMTAQueueID:         submission.ZoneMTAQueueID,
		EnvelopeFrom:           s.envelopeFrom,
		EnvelopeTo:             append([]string{}, s.recipients...),
		SenderDomain:           route.VisibleSenderDomain,
		ArchiveDomain:          route.SourceDomain,
		SourceMailbox:          route.SourceMailbox,
		SourceDomain:           route.SourceDomain,
		TargetMailbox:          route.TargetMailbox,
		TargetDomain:           route.TargetDomain,
		VisibleFrom:            route.VisibleFrom,
		VisibleSenderDomain:    route.VisibleSenderDomain,
		MessageID:              submission.MessageID,
		IsDSN:                  submission.IsDSN,
		DSNID:                  submission.InternalDSNID,
		SourceIngestID:         route.SourceIngestID,
		Provider:               "local",
		RelayRawKey:            archive.Bundle.RelayKey,
		RawKey:                 archive.Bundle.RelayKey,
		SourceInboundRawKey:    route.SourceInboundRawKey,
		SourceInboundResultKey: route.SourceInboundResultKey,
		TargetInboundRawKey:    route.TargetInboundRawKey,
		TargetInboundEdgeKey:   route.TargetInboundEdgeKey,
		TargetInboundResultKey: route.TargetInboundResultKey,
		SubmittedAt:            archive.SubmittedAt,
		CompletedAt:            time.Now().UTC(),
		To:                     submission.To,
		CC:                     submission.CC,
		BCC:                    submission.BCC,
		Delivered:              delivered,
		Error:                  errorMessage,
	}
	if err := s.server.r2.PutJSON(ctx, archive.Bundle.ResultKey, receipt); err != nil {
		return err
	}
	if deliverErr != nil {
		log.Printf("agent-mail-provider-relay event=local_route_failed send_id=%s local_route_id=%s zonemta_queue_id=%s source_domain=%s target_domain=%s has_result_key=%t error=%q", archive.SendID, route.LocalRouteID, submission.ZoneMTAQueueID, route.SourceDomain, mailboxDomain(route.TargetMailbox), archive.Bundle.ResultKey != "", sanitizeRelayLogError(deliverErr))
		return deliverErr
	}
	log.Printf("agent-mail-provider-relay event=local_routed send_id=%s local_route_id=%s zonemta_queue_id=%s source_domain=%s target_domain=%s has_result_key=%t has_target_result_key=%t delivery_source=%s", archive.SendID, route.LocalRouteID, submission.ZoneMTAQueueID, route.SourceDomain, mailboxDomain(route.TargetMailbox), archive.Bundle.ResultKey != "", route.TargetInboundResultKey != "", deliverySource)
	return nil
}

func mailboxDomain(address string) string {
	domain, err := structured.DomainFromMailbox(address)
	if err != nil {
		return ""
	}
	return domain
}

func sanitizeRelayLogError(err error) string {
	if err == nil {
		return ""
	}
	message := strings.TrimSpace(strings.Join(strings.Fields(err.Error()), " "))
	message = relayLogEmailPattern.ReplaceAllString(message, "[email]")
	if len(message) > 240 {
		return message[:240]
	}
	return message
}

func (p *localDeliveryProof) FindExisting(ctx context.Context, targetMailbox string, query localRouteProofQuery) (localDeliveryRecord, bool, error) {
	if p == nil {
		return localDeliveryRecord{}, false, fmt.Errorf("local delivery proof is not configured")
	}
	if strings.TrimSpace(query.RouteID) != "" {
		return p.find(ctx, targetMailbox, localRouteProofQuery{RouteID: query.RouteID})
	}
	return p.find(ctx, targetMailbox, query)
}

func (p *localDeliveryProof) WaitForRoute(ctx context.Context, targetMailbox string, localRouteID string) (localDeliveryRecord, error) {
	deadline := time.Now().Add(15 * time.Second)
	for {
		record, found, err := p.find(ctx, targetMailbox, localRouteProofQuery{RouteID: localRouteID})
		if err != nil {
			return localDeliveryRecord{}, err
		}
		if found {
			return record, nil
		}
		if time.Now().After(deadline) {
			return localDeliveryRecord{}, fmt.Errorf("wildduck did not expose delivered message ids for local route id %q before receipt deadline", localRouteID)
		}
		select {
		case <-ctx.Done():
			return localDeliveryRecord{}, ctx.Err()
		case <-time.After(250 * time.Millisecond):
		}
	}
}

func (p *localDeliveryProof) find(ctx context.Context, targetMailbox string, query localRouteProofQuery) (localDeliveryRecord, bool, error) {
	target := normalizeAddress(targetMailbox)
	if target == "" {
		return localDeliveryRecord{}, false, fmt.Errorf("missing target mailbox")
	}
	resolved, err := p.wd.ResolveAddress(ctx, target)
	if err != nil {
		return localDeliveryRecord{}, false, err
	}
	if resolved.User == "" {
		return localDeliveryRecord{}, false, fmt.Errorf("wildduck target mailbox %q resolved without user id", target)
	}
	userID, err := bson.ObjectIDFromHex(resolved.User)
	if err != nil {
		return localDeliveryRecord{}, false, fmt.Errorf("wildduck user id %q is not a valid ObjectID: %w", resolved.User, err)
	}

	headerConstraints := make([]any, 0, 4)
	if strings.TrimSpace(query.RouteID) != "" {
		headerConstraints = append(headerConstraints, exactHeaderRegex("X-Agent-Mail-Local-Route-ID", query.RouteID))
	} else {
		if strings.TrimSpace(query.ZoneMTAQueueID) == "" {
			return localDeliveryRecord{}, false, fmt.Errorf("missing ZoneMTA queue id for local route proof")
		}
		headerConstraints = append(headerConstraints, exactHeaderRegex("X-Agent-Mail-ZoneMTA-Queue-ID", query.ZoneMTAQueueID))
		if strings.TrimSpace(query.SourceIngestID) != "" {
			headerConstraints = append(headerConstraints, exactHeaderRegex("X-Agent-Mail-Source-Ingest-ID", query.SourceIngestID))
		}
		if strings.TrimSpace(query.MessageID) != "" {
			headerConstraints = append(headerConstraints, messageIDHeaderRegex(query.MessageID))
		}
	}

	filter := bson.M{"user": userID}
	if len(headerConstraints) == 1 {
		filter["mimeTree.header"] = headerConstraints[0]
	} else {
		filter["mimeTree.header"] = bson.M{"$all": headerConstraints}
	}

	var record struct {
		ID       bson.ObjectID `bson:"_id"`
		Mailbox  bson.ObjectID `bson:"mailbox"`
		MimeTree struct {
			Header []string `bson:"header"`
		} `bson:"mimeTree"`
	}
	err = p.messages.FindOne(ctx, filter, options.FindOne().SetProjection(bson.M{
		"_id":             1,
		"mailbox":         1,
		"mimeTree.header": 1,
	})).Decode(&record)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return localDeliveryRecord{}, false, nil
		}
		return localDeliveryRecord{}, false, fmt.Errorf("query local route delivery proof: %w", err)
	}
	return localDeliveryRecord{
		RouteID:   rfc822.HeaderValue(record.MimeTree.Header, "X-Agent-Mail-Local-Route-ID"),
		UserID:    resolved.User,
		MailboxID: record.Mailbox.Hex(),
		MessageID: record.ID.Hex(),
		Headers:   append([]string{}, record.MimeTree.Header...),
	}, true, nil
}

func (s *Session) Reset() {
	s.envelopeFrom = ""
	s.mailFromAccepted = false
	s.recipients = nil
}

func (s *Session) Logout() error {
	s.Reset()
	s.authenticated = false
	return nil
}

func (s webCloudflareSender) Send(ctx context.Context, submission rfc822.Submission, envelopeRecipients []string) (outboundSendResult, error) {
	recipients := uniqueStrings(envelopeRecipients)
	providerRawMessage, err := rfc822.BuildProviderRaw(submission.RawMessage, rfc822.ProviderRawOptions{})
	if err != nil {
		return outboundSendResult{}, err
	}
	payload, err := cloudflaremail.BuildRawPayload(cloudflaremail.RawSendRequest{
		From:        submission.From.Address,
		Recipients:  recipients,
		MIMEMessage: providerRawMessage,
	})
	if err != nil {
		return outboundSendResult{}, err
	}
	baseResult := outboundSendResult{
		Provider:                outboundProviderCloudflare,
		ProviderRawSHA256:       sha256Hex(payload),
		ProviderRaw:             payload,
		ProviderContentType:     "application/json",
		ProviderBoundarySender:  submission.From.Address,
		ProviderReversePathMode: "cloudflare_send_raw_from",
	}
	senderDomain := domainPart(submission.From.Address)
	if senderDomain == "" {
		return baseResult, fmt.Errorf("sender address %q does not contain a canonical domain", submission.From.Address)
	}
	activeDomain, err := s.domainResolver.ActiveDomain(ctx, senderDomain)
	if err != nil {
		return baseResult, err
	}
	result, err := s.sendRawThroughWeb(ctx, activeDomain, submission, recipients, string(providerRawMessage))
	if err != nil {
		return baseResult, err
	}
	if len(result.PermanentBounces) > 0 {
		baseResult.Delivered = result.Delivered
		baseResult.Queued = result.Queued
		return baseResult, fmt.Errorf("cloudflare permanently bounced recipients: %s", strings.Join(result.PermanentBounces, ", "))
	}
	if len(result.Delivered)+len(result.Queued) != len(recipients) {
		baseResult.Delivered = result.Delivered
		baseResult.Queued = result.Queued
		return baseResult, fmt.Errorf("cloudflare accepted %d recipients but smtp envelope contained %d recipients", len(result.Delivered)+len(result.Queued), len(recipients))
	}

	baseResult.Delivered = result.Delivered
	baseResult.Queued = result.Queued
	return baseResult, nil
}

func (s webCloudflareSender) sendRawThroughWeb(ctx context.Context, activeDomain ActiveDomainContext, submission rfc822.Submission, recipients []string, mimeMessage string) (webCloudflareSendResult, error) {
	requestBody, err := json.Marshal(webCloudflareSendRequest{
		OrganizationID:       activeDomain.OrganizationID,
		OrganizationPublicID: activeDomain.OrganizationPublicID,
		Domain:               activeDomain.Domain,
		From:                 submission.From.Address,
		Recipients:           recipients,
		MIMEMessage:          mimeMessage,
		ZoneMTAQueueID:       submission.ZoneMTAQueueID,
	})
	if err != nil {
		return webCloudflareSendResult{}, fmt.Errorf("marshal web Cloudflare send request: %w", err)
	}

	sendURL := *s.baseURL
	sendURL.Path = strings.TrimRight(sendURL.Path, "/") + "/rpc/internal/agent-mail/cloudflare/send-raw"
	sendURL.RawQuery = ""
	sendURL.Fragment = ""
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, sendURL.String(), bytes.NewReader(requestBody))
	if err != nil {
		return webCloudflareSendResult{}, fmt.Errorf("build web Cloudflare send request: %w", err)
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Agent-Mail-Control-Web-Token", s.controlToken)

	response, err := s.httpClient.Do(request)
	if err != nil {
		return webCloudflareSendResult{}, fmt.Errorf("web Cloudflare send request: %w", err)
	}
	defer response.Body.Close()

	var result webCloudflareSendResult
	if response.StatusCode >= 200 && response.StatusCode < 300 {
		if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
			return webCloudflareSendResult{}, fmt.Errorf("decode web Cloudflare send response: %w", err)
		}
		return result, nil
	}

	_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
	return webCloudflareSendResult{}, fmt.Errorf("web Cloudflare send failed with HTTP %d", response.StatusCode)
}

func (s sesSender) Send(ctx context.Context, submission rfc822.Submission, envelopeRecipients []string) (outboundSendResult, error) {
	recipients := uniqueStrings(envelopeRecipients)
	returnPath, err := s.feedbackReturnPath(ctx, submission.From.Address)
	if err != nil {
		return outboundSendResult{}, err
	}
	reversePathMode := "configured_return_path"
	if submission.IsDSN {
		reversePathMode = "provider_feedback_fallback"
	}
	// Only the provider-bound copy is sanitized. The relay-received R2 archive
	// uses submission.RawMessage so operator-visible provenance remains the
	// exact SMTP DATA bytes accepted from ZoneMTA.
	providerRaw, err := rfc822.BuildProviderRaw(submission.RawMessage, rfc822.ProviderRawOptions{
		ReturnPath: returnPath,
	})
	if err != nil {
		return outboundSendResult{}, err
	}
	if len(providerRaw) > sesmail.MaxRawMessageBytes {
		return outboundSendResult{}, fmt.Errorf("ses provider raw message exceeds the %d byte limit", sesmail.MaxRawMessageBytes)
	}
	providerRawSHA256 := sha256Hex(providerRaw)
	baseResult := outboundSendResult{
		Provider:                outboundProviderSES,
		ProviderRawSHA256:       providerRawSHA256,
		ProviderRaw:             providerRaw,
		ProviderContentType:     "message/rfc822",
		ProviderBoundarySender:  returnPath,
		ProviderReversePathMode: reversePathMode,
	}
	result, err := s.client.SendRaw(ctx, sesmail.SendRequest{
		RawMessage: providerRaw,
		Recipients: recipients,
	})
	if err != nil {
		return baseResult, err
	}

	baseResult.ProviderMessageID = result.MessageID
	baseResult.Queued = result.Queued
	return baseResult, nil
}

func (s sesSender) feedbackReturnPath(ctx context.Context, fromAddress string) (string, error) {
	domain := domainPart(fromAddress)
	if domain == "" {
		return "", fmt.Errorf("sender address %q does not contain a domain", fromAddress)
	}
	if s.returnPathResolver != nil {
		returnPath, err := s.returnPathResolver.SESFeedbackReturnPath(ctx, domain)
		if err != nil {
			return "", err
		}
		return returnPath, nil
	}
	returnPath := strings.TrimSpace(s.feedbackReturnPaths[domain])
	if returnPath == "" {
		return "", fmt.Errorf("missing SES feedback return path for sender domain %q", domain)
	}
	return returnPath, nil
}

func newOutboundSender(provider string, webServer webServerRuntimeConfig, activeDomainResolver ActiveDomainResolver) (outboundSender, error) {
	switch provider {
	case outboundProviderCloudflare:
		baseURL, err := url.Parse(webServer.APIBaseURL)
		if err != nil {
			return nil, fmt.Errorf("parse web_server.api_base_url: %w", err)
		}
		if baseURL.Scheme == "" || baseURL.Host == "" {
			return nil, fmt.Errorf("web_server.api_base_url must include scheme and host")
		}
		if activeDomainResolver == nil {
			return nil, fmt.Errorf("missing active domain resolver")
		}
		return webCloudflareSender{
			baseURL:        baseURL,
			controlToken:   webServer.ControlToWebToken,
			domainResolver: activeDomainResolver,
			httpClient:     &http.Client{Timeout: 30 * time.Second},
		}, nil
	default:
		return nil, fmt.Errorf("unsupported outbound provider %q", provider)
	}
}

func validateSubmissionForProvider(provider string, submission rfc822.Submission) error {
	switch provider {
	case outboundProviderCloudflare:
		return nil
	case outboundProviderSES:
		return nil
	default:
		return fmt.Errorf("unsupported outbound provider %q", provider)
	}
	return nil
}

func sesFeedbackReturnPathsBySenderDomain(delivery DeliveryConfig) (map[string]string, error) {
	if len(delivery.Domains) == 0 {
		return nil, fmt.Errorf("delivery.domains must configure at least one sender domain for SES")
	}

	paths := make(map[string]string, len(delivery.Domains))
	for _, domain := range delivery.Domains {
		senderDomain, err := canonicalDomain(domain.Outbound.SenderDomain)
		if err != nil {
			return nil, fmt.Errorf("delivery domain %q has invalid outbound.sender_domain: %w", domain.Name, err)
		}
		if senderDomain == "" {
			return nil, fmt.Errorf("delivery domain %q is missing outbound.sender_domain", domain.Name)
		}
		returnPath := normalizeAddress(domain.Outbound.SES.FeedbackReturnPath)
		if returnPath == "" {
			return nil, fmt.Errorf("delivery domain %q is missing outbound.ses.feedback_return_path", domain.Name)
		}
		if existing := paths[senderDomain]; existing != "" {
			return nil, fmt.Errorf("delivery config contains duplicate sender domain %q", senderDomain)
		}
		if domainPart(returnPath) == "" {
			return nil, fmt.Errorf("delivery domain %q has invalid SES feedback return path %q", domain.Name, domain.Outbound.SES.FeedbackReturnPath)
		}
		paths[senderDomain] = returnPath
	}
	return paths, nil
}

type localDeliveryDisposition string

const (
	localDeliveryExternal localDeliveryDisposition = "external"
	localDeliveryAll      localDeliveryDisposition = "all_local"
	localDeliveryMixed    localDeliveryDisposition = "mixed"
)

func (s *Server) localDeliveryDisposition(ctx context.Context, recipients []string) (localDeliveryDisposition, error) {
	if !s.cfg.LocalDelivery.Enabled || s.localDomainResolver == nil || s.localDeliverer == nil {
		return localDeliveryExternal, nil
	}
	uniqueRecipients := uniqueStrings(recipients)
	if len(uniqueRecipients) == 0 {
		return localDeliveryExternal, nil
	}

	localCount := 0
	for _, recipient := range uniqueRecipients {
		domain := domainPart(recipient)
		if domain == "" {
			return "", fmt.Errorf("recipient address %q does not contain a canonical domain", recipient)
		}
		local, err := s.localDomainResolver.LocalRecipientDomain(ctx, domain)
		if err != nil {
			return "", fmt.Errorf("classify local recipient domain %q: %w", domain, err)
		}
		if local {
			localCount++
		}
	}

	switch localCount {
	case 0:
		return localDeliveryExternal, nil
	case len(uniqueRecipients):
		return localDeliveryAll, nil
	default:
		return localDeliveryMixed, nil
	}
}

func newLocalDeliverer(cfg localDeliveryRuntimeConfig) localDeliverer {
	if !cfg.Enabled {
		return nil
	}
	return smtpLocalDeliverer{address: cfg.SMTPAddress, heloName: cfg.HelloName}
}

func (d smtpLocalDeliverer) Deliver(ctx context.Context, envelopeFrom string, recipients []string, rawMessage []byte) error {
	uniqueRecipients := uniqueStrings(recipients)
	if len(uniqueRecipients) == 0 {
		return fmt.Errorf("missing local delivery recipients")
	}
	dialer := &net.Dialer{Timeout: 15 * time.Second}
	connection, err := dialer.DialContext(ctx, "tcp", d.address)
	if err != nil {
		return fmt.Errorf("dial local smtp %s: %w", d.address, err)
	}
	client, err := smtp.NewClient(connection, smtpHost(d.address))
	if err != nil {
		_ = connection.Close()
		return fmt.Errorf("create local smtp client for %s: %w", d.address, err)
	}
	defer client.Close()

	if err := client.Hello(d.heloName); err != nil {
		return fmt.Errorf("local smtp HELO %q: %w", d.heloName, err)
	}
	if err := client.Mail(envelopeFrom); err != nil {
		return fmt.Errorf("local smtp MAIL FROM %q: %w", envelopeFrom, err)
	}
	for _, recipient := range uniqueRecipients {
		if err := client.Rcpt(recipient); err != nil {
			return fmt.Errorf("local smtp RCPT TO %q: %w", recipient, err)
		}
	}
	writer, err := client.Data()
	if err != nil {
		return fmt.Errorf("local smtp DATA: %w", err)
	}
	if _, err := writer.Write(rawMessage); err != nil {
		_ = writer.Close()
		return fmt.Errorf("write local smtp message body: %w", err)
	}
	if err := writer.Close(); err != nil {
		return fmt.Errorf("close local smtp message body: %w", err)
	}
	if err := client.Quit(); err != nil {
		return fmt.Errorf("local smtp QUIT: %w", err)
	}
	return nil
}

func localRouteEnvelopeFrom(submission rfc822.Submission, fallback string) string {
	// Local routing is a target-mailbox delivery, not a provider handoff. When a
	// forwarded message came from Cloudflare replay, Haraka must validate the
	// original replay envelope sender instead of ZoneMTA's SRS reverse path.
	replayEnvelopeFrom := strings.TrimSpace(submission.ReplayEnvelopeFrom)
	if replayEnvelopeFrom == "" {
		return fallback
	}
	if replayEnvelopeFrom == "<>" {
		return ""
	}
	normalized := normalizeAddress(replayEnvelopeFrom)
	if normalized == "" {
		return fallback
	}
	return normalized
}

func staticLocalDomainResolverFromDelivery(delivery DeliveryConfig) (LocalRecipientDomainResolver, error) {
	domains := staticLocalDomainResolver{}
	for _, domain := range delivery.Domains {
		for _, value := range []string{domain.Name, domain.Outbound.SenderDomain} {
			canonical, err := canonicalDomain(value)
			if err != nil {
				return nil, fmt.Errorf("invalid static local delivery domain %q: %w", value, err)
			}
			if canonical == "" {
				continue
			}
			domains[canonical] = struct{}{}
		}
	}
	return domains, nil
}

func (r staticLocalDomainResolver) LocalRecipientDomain(_ context.Context, recipientDomain string) (bool, error) {
	domain, err := canonicalDomain(recipientDomain)
	if err != nil {
		return false, err
	}
	if domain == "" {
		return false, fmt.Errorf("recipient domain is required")
	}
	_, ok := r[domain]
	return ok, nil
}

func validateConfig(cfg Config) (runtimeConfig, error) {
	var runtimeCfg runtimeConfig

	if cfg.ListenAddress == "" {
		return runtimeCfg, fmt.Errorf("missing listen_address")
	}
	if cfg.Hostname == "" {
		return runtimeCfg, fmt.Errorf("missing hostname")
	}
	if cfg.RelayAuth.Username == "" {
		return runtimeCfg, fmt.Errorf("missing relay_auth.username")
	}
	if cfg.RelayAuth.Password == "" {
		return runtimeCfg, fmt.Errorf("missing relay_auth.password")
	}
	if cfg.WebServer.APIBaseURL == "" {
		return runtimeCfg, fmt.Errorf("missing web_server.api_base_url")
	}
	if cfg.WebServer.ControlToWebToken == "" {
		return runtimeCfg, fmt.Errorf("missing web_server.control_to_web_token")
	}
	if cfg.LocalDelivery.SMTPAddress != "" || cfg.LocalDelivery.HelloName != "" {
		if cfg.LocalDelivery.SMTPAddress == "" {
			return runtimeCfg, fmt.Errorf("missing local_delivery.smtp_address")
		}
		if cfg.LocalDelivery.HelloName == "" {
			return runtimeCfg, fmt.Errorf("missing local_delivery.hello_name")
		}
		if cfg.LocalDelivery.APIBaseURL == "" {
			return runtimeCfg, fmt.Errorf("missing local_delivery.api_base_url")
		}
		if cfg.LocalDelivery.MongoURI == "" {
			return runtimeCfg, fmt.Errorf("missing local_delivery.mongo_uri")
		}
		if cfg.LocalDelivery.MongoDatabase == "" {
			return runtimeCfg, fmt.Errorf("missing local_delivery.mongo_database")
		}
		runtimeCfg.LocalDelivery = localDeliveryRuntimeConfig{
			Enabled:       true,
			SMTPAddress:   cfg.LocalDelivery.SMTPAddress,
			HelloName:     cfg.LocalDelivery.HelloName,
			APIBaseURL:    cfg.LocalDelivery.APIBaseURL,
			MongoURI:      cfg.LocalDelivery.MongoURI,
			MongoDatabase: cfg.LocalDelivery.MongoDatabase,
		}
	}
	runtimeCfg.ListenAddress = cfg.ListenAddress
	runtimeCfg.Hostname = cfg.Hostname
	runtimeCfg.RelayUsername = cfg.RelayAuth.Username
	runtimeCfg.RelayPassword = cfg.RelayAuth.Password
	runtimeCfg.WebServer = webServerRuntimeConfig{
		APIBaseURL:        cfg.WebServer.APIBaseURL,
		ControlToWebToken: cfg.WebServer.ControlToWebToken,
	}
	return runtimeCfg, nil
}

func maxMessageBytesForProvider(provider string) int64 {
	switch provider {
	case outboundProviderSES:
		return sesmail.MaxRawMessageBytes
	case outboundProviderCloudflare:
		return cloudflaremail.MaxRequestPayloadBytes
	default:
		return 0
	}
}

func domainPart(address string) string {
	domain, err := structured.DomainFromAddrSpec(address)
	if err != nil {
		return ""
	}
	return domain
}

func normalizeAddress(value string) string {
	address, err := structured.NormalizeMailbox(value)
	if err != nil {
		return ""
	}
	return address
}

func canonicalDomain(value string) (string, error) {
	return structured.CanonicalDomain(value)
}

func smtpHost(address string) string {
	host, _, err := net.SplitHostPort(address)
	if err == nil {
		return host
	}
	return address
}

func uniqueStrings(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		normalized := normalizeAddress(value)
		if normalized == "" {
			continue
		}
		if _, ok := seen[normalized]; ok {
			continue
		}
		seen[normalized] = struct{}{}
		result = append(result, normalized)
	}
	slices.Sort(result)
	return result
}

func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func exactHeaderRegex(name string, value string) bson.Regex {
	pattern := "^" + regexp.QuoteMeta(name) + `:\s*` + regexp.QuoteMeta(strings.TrimSpace(value)) + "$"
	return bson.Regex{Pattern: pattern, Options: "i"}
}

func messageIDHeaderRegex(messageID string) bson.Regex {
	trimmed := strings.Trim(strings.TrimSpace(messageID), "<>")
	pattern := "^" + regexp.QuoteMeta("Message-ID") + `:\s*<?` + regexp.QuoteMeta(trimmed) + ">?$"
	return bson.Regex{Pattern: pattern, Options: "i"}
}
