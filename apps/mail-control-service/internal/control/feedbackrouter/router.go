package feedbackrouter

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/smtp"
	"net/textproto"
	"net/url"
	"slices"
	"strings"
	"time"

	"agent-mail/internal/config/configfile"
	"agent-mail/internal/mail/structured"

	"github.com/emersion/go-imap/v2"
	"github.com/emersion/go-imap/v2/imapclient"
	"github.com/jhillyerd/enmime"
)

const reconnectDelay = 10 * time.Second

type Config struct {
	WildDuck struct {
		APIBaseURL string `yaml:"api_base_url"`
	} `yaml:"wildduck"`
	IMAP struct {
		Address     string `yaml:"address"`
		Username    string `yaml:"username"`
		Password    string `yaml:"password"`
		DisplayName string `yaml:"display_name"`
		SpamLevel   int    `yaml:"spam_level"`
		Mailbox     string `yaml:"mailbox"`
		Insecure    bool   `yaml:"insecure"`
		IdleTimeout string `yaml:"idle_timeout"`
	} `yaml:"imap"`
	Haraka struct {
		Address   string `yaml:"address"`
		HelloName string `yaml:"hello_name"`
	} `yaml:"haraka"`
	Routes []RouteConfig `yaml:"routes"`
}

type RouteConfig struct {
	FeedbackAddress      string   `yaml:"feedback_address"`
	SenderDomains        []string `yaml:"sender_domains"`
	MarkSeenOnParseError bool     `yaml:"mark_seen_on_parse_error"`
}

type runtimeConfig struct {
	WildDuckAPIBaseURL string
	WildDuckAdminToken string
	IMAPAddress        string
	IMAPUsername       string
	IMAPPassword       string
	IMAPDisplayName    string
	IMAPSpamLevel      int
	IMAPMailbox        string
	IMAPUsernameIsAddr bool
	IMAPInsecure       bool
	IdleTimeout        time.Duration
	HarakaAddress      string
	HarakaHelloName    string
	Routes             []route
}

type route struct {
	FeedbackAddress      string
	SenderDomains        []string
	MarkSeenOnParseError bool
}

type feedbackLogin struct {
	Username  string
	IsAddress bool
}

type Router struct {
	cfg         runtimeConfig
	routeSource RouteSource
	wd          *wildDuckAdmin
}

type RouteSource interface {
	ActiveFeedbackRoutes(ctx context.Context) ([]Route, error)
}

type Route struct {
	FeedbackAddress      string
	SenderDomains        []string
	MarkSeenOnParseError bool
}

func New(configPath string) (*Router, error) {
	return newRouterFromPath(configPath, nil)
}

func NewWithRouteSource(configPath string, source RouteSource) (*Router, error) {
	if source == nil {
		return nil, fmt.Errorf("missing feedback route source")
	}
	return newRouterFromPath(configPath, source)
}

func NewWithRouteSourceConfig(cfg Config, source RouteSource) (*Router, error) {
	if source == nil {
		return nil, fmt.Errorf("missing feedback route source")
	}
	return newRouter(cfg, source)
}

func newRouterFromPath(configPath string, source RouteSource) (*Router, error) {
	var cfg Config
	if err := configfile.LoadYAML(configPath, &cfg); err != nil {
		return nil, err
	}
	return newRouter(cfg, source)
}

func newRouter(cfg Config, source RouteSource) (*Router, error) {
	runtimeCfg, err := validateConfig(cfg, source != nil)
	if err != nil {
		return nil, err
	}
	adminToken, err := configfile.RequireEnv("AGENT_MAIL_WILDDUCK_ADMIN_ACCESS_TOKEN")
	if err != nil {
		return nil, err
	}
	runtimeCfg.WildDuckAdminToken = adminToken

	return &Router{
		cfg:         runtimeCfg,
		routeSource: source,
		wd:          newWildDuckAdmin(runtimeCfg.WildDuckAPIBaseURL, runtimeCfg.WildDuckAdminToken),
	}, nil
}

func (r *Router) Run(ctx context.Context) error {
	log.Printf("agent-mail-feedback-router starting username=%s mailbox=%s haraka=%s", r.cfg.IMAPUsername, r.cfg.IMAPMailbox, r.cfg.HarakaAddress)
	for {
		if err := r.runSession(ctx); err != nil {
			if errors.Is(err, context.Canceled) {
				return nil
			}
			log.Printf("feedback router session failed: %v", err)
		}

		select {
		case <-ctx.Done():
			return nil
		case <-time.After(reconnectDelay):
		}
	}
}

type Status struct {
	OK            bool
	Configured    bool
	Issues        []string
	DomainsSource string
	ActiveDomains int
	IMAPAddress   string
	Mailbox       string
}

func (r *Router) Status(ctx context.Context) Status {
	if r == nil {
		return Status{
			OK:     false,
			Issues: []string{"feedback_router_not_initialized"},
		}
	}
	status := Status{
		OK:            true,
		Configured:    true,
		DomainsSource: "config",
		IMAPAddress:   r.cfg.IMAPAddress,
		Mailbox:       r.cfg.IMAPMailbox,
	}
	if r.routeSource != nil {
		status.DomainsSource = "control-state"
	}
	routes, err := r.routes(ctx)
	if err != nil {
		status.OK = false
		status.Issues = append(status.Issues, "feedback_routes_failed: "+err.Error())
		return status
	}
	status.ActiveDomains = len(routes)
	return status
}

func (r *Router) runSession(ctx context.Context) error {
	login, err := r.feedbackLogin(ctx)
	if err != nil {
		return err
	}
	if err := r.ensureMailbox(ctx, login); err != nil {
		return err
	}

	updates := make(chan struct{}, 1)
	options := &imapclient.Options{
		UnilateralDataHandler: &imapclient.UnilateralDataHandler{
			Mailbox: func(data *imapclient.UnilateralDataMailbox) {
				if data.NumMessages != nil {
					select {
					case updates <- struct{}{}:
					default:
					}
				}
			},
		},
	}

	client, err := dialIMAP(r.cfg, options)
	if err != nil {
		return err
	}
	defer client.Close()
	go func() {
		<-ctx.Done()
		_ = client.Close()
	}()

	if err := client.Login(login.Username, r.cfg.IMAPPassword).Wait(); err != nil {
		return fmt.Errorf("imap login: %w", err)
	}
	if _, err := client.Select(r.cfg.IMAPMailbox, nil).Wait(); err != nil {
		return fmt.Errorf("imap select %s: %w", r.cfg.IMAPMailbox, err)
	}
	log.Printf("agent-mail-feedback-router watching mailbox=%s username=%s", r.cfg.IMAPMailbox, login.Username)
	if err := r.processUnseen(ctx, client); err != nil {
		return err
	}

	for {
		idleCommand, err := client.Idle()
		if err != nil {
			return fmt.Errorf("imap idle: %w", err)
		}
		idleDone := make(chan error, 1)
		go func() {
			idleDone <- idleCommand.Wait()
		}()

		var stopErr error
		idleAlreadyDone := false
		select {
		case <-ctx.Done():
			stopErr = context.Canceled
		case err := <-idleDone:
			idleAlreadyDone = true
			if err != nil {
				return fmt.Errorf("imap idle wait: %w", err)
			}
		case <-updates:
		case <-time.After(r.cfg.IdleTimeout):
		}

		if err := idleCommand.Close(); err != nil && stopErr == nil {
			stopErr = err
		}
		if !idleAlreadyDone {
			if err := <-idleDone; err != nil && stopErr == nil {
				stopErr = err
			}
		}
		if stopErr != nil && !errors.Is(stopErr, context.Canceled) {
			stopErr = fmt.Errorf("imap idle close: %w", stopErr)
		}
		if stopErr != nil {
			return stopErr
		}
		if err := r.processUnseen(ctx, client); err != nil {
			return err
		}
	}
}

func (r *Router) ensureMailbox(ctx context.Context, login feedbackLogin) error {
	userID, err := r.resolveFeedbackUser(ctx, login)
	if err == nil {
		if err := r.wd.updateUser(ctx, userID, wildDuckUserConfig{
			Password:  r.cfg.IMAPPassword,
			Name:      r.cfg.IMAPDisplayName,
			SpamLevel: r.cfg.IMAPSpamLevel,
		}); err != nil {
			return fmt.Errorf("update feedback mailbox %s: %w", r.cfg.IMAPUsername, err)
		}
		log.Printf("feedback mailbox %s already exists; managed login fields converged", login.Username)
		return nil
	}
	if !errors.Is(err, errWildDuckNotFound) {
		return fmt.Errorf("resolve feedback mailbox %s: %w", login.Username, err)
	}

	cfg := wildDuckUserConfig{
		Username:  r.feedbackUsername(login),
		Password:  r.cfg.IMAPPassword,
		Name:      r.cfg.IMAPDisplayName,
		SpamLevel: r.cfg.IMAPSpamLevel,
	}
	if login.IsAddress {
		cfg.Address = login.Username
	} else {
		cfg.EmptyAddress = true
	}
	userID, err = r.wd.createUser(ctx, cfg)
	if err != nil {
		return fmt.Errorf("create feedback mailbox %s: %w", login.Username, err)
	}
	log.Printf("created feedback mailbox %s user=%s", login.Username, userID)
	return nil
}

func (r *Router) resolveFeedbackUser(ctx context.Context, login feedbackLogin) (string, error) {
	if login.IsAddress {
		return r.wd.resolveAddress(ctx, login.Username)
	}
	return r.wd.resolveUser(ctx, login.Username)
}

func (r *Router) feedbackUsername(login feedbackLogin) string {
	if login.IsAddress {
		return mailboxUsername(login.Username)
	}
	return login.Username
}

func (r *Router) feedbackLogin(ctx context.Context) (feedbackLogin, error) {
	if r.cfg.IMAPUsername != "" {
		return feedbackLogin{Username: r.cfg.IMAPUsername, IsAddress: r.cfg.IMAPUsernameIsAddr}, nil
	}
	routes, err := r.routes(ctx)
	if err != nil {
		return feedbackLogin{}, err
	}
	if len(routes) == 0 {
		return feedbackLogin{}, fmt.Errorf("no active feedback routes available for dynamic mailbox login")
	}
	return feedbackLogin{Username: routes[0].FeedbackAddress, IsAddress: true}, nil
}

func dialIMAP(cfg runtimeConfig, options *imapclient.Options) (*imapclient.Client, error) {
	if cfg.IMAPInsecure {
		client, err := imapclient.DialInsecure(cfg.IMAPAddress, options)
		if err != nil {
			return nil, fmt.Errorf("dial imap insecure %s: %w", cfg.IMAPAddress, err)
		}
		return client, nil
	}
	client, err := imapclient.DialTLS(cfg.IMAPAddress, options)
	if err != nil {
		return nil, fmt.Errorf("dial imap tls %s: %w", cfg.IMAPAddress, err)
	}
	return client, nil
}

func (r *Router) processUnseen(ctx context.Context, client *imapclient.Client) error {
	searchData, err := client.UIDSearch(&imap.SearchCriteria{
		NotFlag: []imap.Flag{imap.FlagSeen},
	}, nil).Wait()
	if err != nil {
		return fmt.Errorf("imap search unseen: %w", err)
	}

	uids := searchData.AllUIDs()
	slices.Sort(uids)
	for _, uid := range uids {
		if err := ctx.Err(); err != nil {
			return err
		}
		markSeen, err := r.processUID(ctx, client, uid)
		if err != nil {
			log.Printf("failed to process feedback message uid=%d: %v", uid, err)
		}
		if markSeen {
			if err := markUIDSeen(client, uid); err != nil {
				return err
			}
		}
	}
	return nil
}

func (r *Router) processUID(ctx context.Context, client *imapclient.Client, uid imap.UID) (bool, error) {
	raw, err := fetchRaw(client, uid)
	if err != nil {
		return false, err
	}
	return r.processRawFeedback(ctx, uid, raw, deliverToHaraka)
}

func (r *Router) processRawFeedback(ctx context.Context, uid imap.UID, raw []byte, deliver func(context.Context, runtimeConfig, string, []byte) error) (bool, error) {
	match, originalSender, err := r.routeFor(ctx, raw)
	if err != nil {
		return match.MarkSeenOnParseError, err
	}
	if originalSender == "" {
		return true, fmt.Errorf("feedback message uid=%d did not match any configured sender domain", uid)
	}
	if err := deliver(ctx, r.cfg, originalSender, raw); err != nil {
		// Regression context: provider feedback can outlive the original local
		// mailbox, such as validation mailboxes cleaned up after a bounce arrives.
		// A permanent Haraka/WildDuck RCPT reject is terminal for that feedback
		// item; keeping it unseen caused infinite retries while no recipient could
		// ever accept it. Transient SMTP/network failures and non-recipient SMTP
		// failures must remain retryable because they can indicate service health
		// or configuration problems.
		if isPermanentSMTPRecipientFailure(err) {
			return true, err
		}
		return false, err
	}
	log.Printf("routed feedback uid=%d to original_sender=%s", uid, originalSender)
	return true, nil
}

func isPermanentSMTPRecipientFailure(err error) bool {
	var commandErr *smtpCommandError
	if !errors.As(err, &commandErr) || commandErr.command != "rcpt" {
		return false
	}
	var smtpErr *textproto.Error
	if !errors.As(err, &smtpErr) {
		return false
	}
	return smtpErr.Code >= 500 && smtpErr.Code < 600
}

type smtpCommandError struct {
	command string
	err     error
}

func (e *smtpCommandError) Error() string {
	return e.err.Error()
}

func (e *smtpCommandError) Unwrap() error {
	return e.err
}

func (r *Router) routeFor(ctx context.Context, raw []byte) (route, string, error) {
	routes, err := r.routes(ctx)
	if err != nil {
		return route{}, "", err
	}
	for _, candidate := range routes {
		sender, err := ExtractOriginalSender(raw, candidate.SenderDomains, candidate.FeedbackAddress)
		if err == nil {
			return candidate, sender, nil
		}
	}
	if len(routes) == 0 {
		return route{}, "", fmt.Errorf("no feedback routes configured")
	}
	return routes[0], "", nil
}

func (r *Router) routes(ctx context.Context) ([]route, error) {
	if r.routeSource == nil {
		return r.cfg.Routes, nil
	}
	routes, err := r.routeSource.ActiveFeedbackRoutes(ctx)
	if err != nil {
		return nil, fmt.Errorf("load feedback routes from control state: %w", err)
	}
	converted := make([]route, 0, len(routes))
	for _, item := range routes {
		feedbackAddress := normalizeAddress(item.FeedbackAddress)
		if feedbackAddress == "" {
			return nil, fmt.Errorf("control-state feedback route address is invalid")
		}
		domains := normalizeDomains(item.SenderDomains)
		if len(domains) == 0 {
			return nil, fmt.Errorf("control-state feedback route %s has no sender domains", feedbackAddress)
		}
		converted = append(converted, route{
			FeedbackAddress:      feedbackAddress,
			SenderDomains:        domains,
			MarkSeenOnParseError: item.MarkSeenOnParseError,
		})
	}
	return converted, nil
}

func fetchRaw(client *imapclient.Client, uid imap.UID) ([]byte, error) {
	bodySection := &imap.FetchItemBodySection{Peek: true}
	messages, err := client.Fetch(imap.UIDSetNum(uid), &imap.FetchOptions{
		UID:         true,
		BodySection: []*imap.FetchItemBodySection{bodySection},
	}).Collect()
	if err != nil {
		return nil, fmt.Errorf("imap fetch uid %d: %w", uid, err)
	}
	if len(messages) != 1 {
		return nil, fmt.Errorf("imap fetch uid %d returned %d messages", uid, len(messages))
	}
	raw := messages[0].FindBodySection(bodySection)
	if len(raw) == 0 {
		return nil, fmt.Errorf("imap fetch uid %d returned empty body", uid)
	}
	return raw, nil
}

func markUIDSeen(client *imapclient.Client, uid imap.UID) error {
	return client.Store(imap.UIDSetNum(uid), &imap.StoreFlags{
		Op:     imap.StoreFlagsAdd,
		Flags:  []imap.Flag{imap.FlagSeen},
		Silent: true,
	}, nil).Close()
}

func deliverToHaraka(ctx context.Context, cfg runtimeConfig, recipient string, raw []byte) error {
	var dialer net.Dialer
	conn, err := dialer.DialContext(ctx, "tcp", cfg.HarakaAddress)
	if err != nil {
		return fmt.Errorf("dial haraka %s: %w", cfg.HarakaAddress, err)
	}
	client, err := smtp.NewClient(conn, hostOnly(cfg.HarakaAddress))
	if err != nil {
		_ = conn.Close()
		return fmt.Errorf("create smtp client: %w", err)
	}
	defer client.Close()

	if err := client.Hello(cfg.HarakaHelloName); err != nil {
		return fmt.Errorf("smtp hello: %w", err)
	}
	if err := client.Mail(""); err != nil {
		return fmt.Errorf("smtp mail from empty reverse path: %w", err)
	}
	if err := client.Rcpt(recipient); err != nil {
		return &smtpCommandError{
			command: "rcpt",
			err:     fmt.Errorf("smtp rcpt %s: %w", recipient, err),
		}
	}
	writer, err := client.Data()
	if err != nil {
		return fmt.Errorf("smtp data: %w", err)
	}
	if _, err := writer.Write(raw); err != nil {
		_ = writer.Close()
		return fmt.Errorf("write smtp data: %w", err)
	}
	if err := writer.Close(); err != nil {
		return fmt.Errorf("close smtp data: %w", err)
	}
	if err := client.Quit(); err != nil {
		return fmt.Errorf("smtp quit: %w", err)
	}
	return nil
}

func hostOnly(address string) string {
	host, _, err := net.SplitHostPort(address)
	if err == nil {
		return host
	}
	return address
}

func validateConfig(cfg Config, allowDynamicRoutes bool) (runtimeConfig, error) {
	var out runtimeConfig
	out.WildDuckAPIBaseURL = strings.TrimRight(strings.TrimSpace(cfg.WildDuck.APIBaseURL), "/")
	out.IMAPAddress = strings.TrimSpace(cfg.IMAP.Address)
	var usernameIsAddr bool
	out.IMAPUsername, usernameIsAddr = normalizeIMAPUsername(cfg.IMAP.Username)
	out.IMAPUsernameIsAddr = usernameIsAddr
	out.IMAPMailbox = strings.TrimSpace(cfg.IMAP.Mailbox)
	out.IMAPInsecure = cfg.IMAP.Insecure
	out.IMAPDisplayName = strings.TrimSpace(cfg.IMAP.DisplayName)
	out.IMAPSpamLevel = cfg.IMAP.SpamLevel
	out.HarakaAddress = strings.TrimSpace(cfg.Haraka.Address)
	out.HarakaHelloName = strings.TrimSpace(cfg.Haraka.HelloName)

	if out.WildDuckAPIBaseURL == "" {
		return runtimeConfig{}, fmt.Errorf("missing wildduck.api_base_url")
	}
	if out.IMAPAddress == "" {
		return runtimeConfig{}, fmt.Errorf("missing imap.address")
	}
	if out.IMAPUsername == "" && !allowDynamicRoutes {
		return runtimeConfig{}, fmt.Errorf("missing imap.username")
	}
	out.IMAPPassword = strings.TrimSpace(cfg.IMAP.Password)
	if out.IMAPPassword == "" {
		return runtimeConfig{}, fmt.Errorf("missing imap.password")
	}
	if out.IMAPDisplayName == "" {
		return runtimeConfig{}, fmt.Errorf("missing imap.display_name")
	}
	if out.IMAPMailbox == "" {
		return runtimeConfig{}, fmt.Errorf("missing imap.mailbox")
	}
	if out.HarakaAddress == "" {
		return runtimeConfig{}, fmt.Errorf("missing haraka.address")
	}
	if out.HarakaHelloName == "" {
		return runtimeConfig{}, fmt.Errorf("missing haraka.hello_name")
	}

	idleTimeout := 29 * time.Minute
	if strings.TrimSpace(cfg.IMAP.IdleTimeout) != "" {
		parsed, err := time.ParseDuration(cfg.IMAP.IdleTimeout)
		if err != nil {
			return runtimeConfig{}, fmt.Errorf("parse imap.idle_timeout: %w", err)
		}
		if parsed <= 0 {
			return runtimeConfig{}, fmt.Errorf("imap.idle_timeout must be positive")
		}
		idleTimeout = parsed
	}
	out.IdleTimeout = idleTimeout

	if len(cfg.Routes) == 0 && !allowDynamicRoutes {
		return runtimeConfig{}, fmt.Errorf("at least one feedback route is required")
	}
	for index, routeCfg := range cfg.Routes {
		feedbackAddress := normalizeAddress(routeCfg.FeedbackAddress)
		if feedbackAddress == "" {
			return runtimeConfig{}, fmt.Errorf("routes[%d].feedback_address is required", index)
		}
		if out.IMAPUsernameIsAddr && feedbackAddress != out.IMAPUsername {
			return runtimeConfig{}, fmt.Errorf("routes[%d].feedback_address must match imap.username for this narrow feedback router", index)
		}
		if len(routeCfg.SenderDomains) == 0 {
			return runtimeConfig{}, fmt.Errorf("routes[%d].sender_domains must not be empty", index)
		}
		domains := make([]string, 0, len(routeCfg.SenderDomains))
		for domainIndex, domain := range routeCfg.SenderDomains {
			normalized, err := canonicalDomain(domain)
			if err != nil {
				return runtimeConfig{}, fmt.Errorf("routes[%d].sender_domains[%d] is invalid: %w", index, domainIndex, err)
			}
			if normalized == "" {
				return runtimeConfig{}, fmt.Errorf("routes[%d].sender_domains[%d] is required", index, domainIndex)
			}
			domains = append(domains, normalized)
		}
		out.Routes = append(out.Routes, route{
			FeedbackAddress:      feedbackAddress,
			SenderDomains:        domains,
			MarkSeenOnParseError: routeCfg.MarkSeenOnParseError,
		})
	}

	return out, nil
}

func ExtractOriginalSender(raw []byte, allowedDomains []string, feedbackAddress string) (string, error) {
	normalizedDomains := normalizeDomains(allowedDomains)
	feedbackAddress = normalizeAddress(feedbackAddress)

	env, err := enmime.ReadEnvelope(bytes.NewReader(raw))
	if err != nil {
		return "", fmt.Errorf("parse feedback message: %w", err)
	}

	var candidates []string
	candidates = append(candidates, embeddedMessageSenders(env)...)
	candidates = append(candidates, envelopeHeaderCandidates(env)...)

	seen := map[string]struct{}{}
	for _, candidate := range candidates {
		parsed, ok := parseMailboxAddress(candidate)
		if !ok || parsed.address == feedbackAddress {
			continue
		}
		if _, ok := seen[parsed.address]; ok {
			continue
		}
		seen[parsed.address] = struct{}{}
		if domainAllowed(parsed.domain, normalizedDomains) {
			return parsed.address, nil
		}
	}
	return "", fmt.Errorf("no original sender found for allowed domains %s", strings.Join(normalizedDomains, ","))
}

func embeddedMessageSenders(env *enmime.Envelope) []string {
	if env == nil || env.Root == nil {
		return nil
	}
	var candidates []string
	walkParts(env.Root, func(part *enmime.Part) {
		switch strings.ToLower(part.ContentType) {
		case "message/rfc822", "text/rfc822-headers":
			candidates = append(candidates, messageHeaderCandidates(part.Content)...)
		}
	})
	return candidates
}

func messageHeaderCandidates(raw []byte) []string {
	env, err := enmime.ReadEnvelope(bytes.NewReader(raw))
	if err != nil {
		return nil
	}
	return envelopeHeaderCandidates(env)
}

func envelopeHeaderCandidates(env *enmime.Envelope) []string {
	if env == nil {
		return nil
	}
	var candidates []string
	for _, key := range []string{"From", "Sender", "Return-Path"} {
		candidates = append(candidates, env.GetHeaderValues(key)...)
	}
	return candidates
}

func walkParts(part *enmime.Part, visit func(*enmime.Part)) {
	if part == nil {
		return
	}
	visit(part)
	for child := part.FirstChild; child != nil; child = child.NextSibling {
		walkParts(child, visit)
	}
}

func normalizeDomains(domains []string) []string {
	normalized := make([]string, 0, len(domains))
	for _, domain := range domains {
		if value, err := canonicalDomain(domain); err == nil && value != "" {
			normalized = append(normalized, value)
		}
	}
	return normalized
}

func normalizeAddress(value string) string {
	parsed, ok := parseMailboxAddress(value)
	if !ok {
		return ""
	}
	return parsed.address
}

func normalizeIMAPUsername(value string) (string, bool) {
	if parsed, ok := parseMailboxAddress(value); ok {
		return parsed.address, true
	}
	username := strings.TrimSpace(value)
	if username == "" {
		return "", false
	}
	return username, false
}

func domainAllowed(domain string, domains []string) bool {
	canonical, err := canonicalDomain(domain)
	if err != nil {
		return false
	}
	for _, allowed := range domains {
		if canonical == allowed {
			return true
		}
	}
	return false
}

func mailboxUsername(address string) string {
	parsed, ok := parseMailboxAddress(address)
	if !ok {
		return address
	}
	localPart := strings.ReplaceAll(parsed.localPart, ".", "")
	if localPart == "" {
		return address
	}
	return localPart
}

type parsedMailboxAddress struct {
	address   string
	localPart string
	domain    string
}

func parseMailboxAddress(value string) (parsedMailboxAddress, bool) {
	mailbox, err := structured.ParseMailbox(value)
	if err != nil {
		return parsedMailboxAddress{}, false
	}
	if mailbox.Address == "" || mailbox.Domain == "" {
		return parsedMailboxAddress{}, false
	}
	return parsedMailboxAddress{
		address:   mailbox.Address,
		localPart: mailbox.LocalPart,
		domain:    mailbox.Domain,
	}, true
}

func canonicalDomain(value string) (string, error) {
	return structured.CanonicalDomain(value)
}

var errWildDuckNotFound = errors.New("wildduck resource not found")

type wildDuckAdmin struct {
	baseURL     string
	accessToken string
	httpClient  *http.Client
}

type wildDuckUserConfig struct {
	Username     string
	Address      string
	Password     string
	Name         string
	SpamLevel    int
	EmptyAddress bool
}

func newWildDuckAdmin(baseURL string, accessToken string) *wildDuckAdmin {
	return &wildDuckAdmin{
		baseURL:     strings.TrimRight(baseURL, "/"),
		accessToken: accessToken,
		httpClient:  &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *wildDuckAdmin) resolveAddress(ctx context.Context, address string) (string, error) {
	var result struct {
		User string `json:"user"`
	}
	if err := c.doJSON(ctx, http.MethodGet, "/addresses/resolve/"+url.PathEscape(address), nil, &result); err != nil {
		return "", err
	}
	if result.User == "" {
		return "", fmt.Errorf("wildduck resolve address %s returned empty user id", address)
	}
	return result.User, nil
}

func (c *wildDuckAdmin) resolveUser(ctx context.Context, username string) (string, error) {
	var result struct {
		ID string `json:"id"`
	}
	if err := c.doJSON(ctx, http.MethodGet, "/users/resolve/"+url.PathEscape(username), nil, &result); err != nil {
		return "", err
	}
	if result.ID == "" {
		return "", fmt.Errorf("wildduck resolve user %s returned empty user id", username)
	}
	return result.ID, nil
}

func (c *wildDuckAdmin) createUser(ctx context.Context, cfg wildDuckUserConfig) (string, error) {
	var result struct {
		ID string `json:"id"`
	}
	payload := map[string]any{
		"username":    cfg.Username,
		"password":    cfg.Password,
		"name":        cfg.Name,
		"spamLevel":   cfg.SpamLevel,
		"allowUnsafe": true,
	}
	if cfg.EmptyAddress {
		payload["emptyAddress"] = true
	} else {
		payload["address"] = cfg.Address
	}
	if err := c.doJSON(ctx, http.MethodPost, "/users", payload, &result); err != nil {
		return "", err
	}
	if result.ID == "" {
		return "", fmt.Errorf("wildduck create user %s returned empty id", cfg.Address)
	}
	return result.ID, nil
}

func (c *wildDuckAdmin) updateUser(ctx context.Context, userID string, cfg wildDuckUserConfig) error {
	payload := map[string]any{
		"password":    cfg.Password,
		"name":        cfg.Name,
		"spamLevel":   cfg.SpamLevel,
		"allowUnsafe": true,
	}
	return c.doJSON(ctx, http.MethodPut, "/users/"+url.PathEscape(userID), payload, nil)
}

func (c *wildDuckAdmin) doJSON(ctx context.Context, method string, path string, requestBody any, responseBody any) error {
	var body io.Reader
	if requestBody != nil {
		encoded, err := json.Marshal(requestBody)
		if err != nil {
			return fmt.Errorf("marshal wildduck request %s %s: %w", method, path, err)
		}
		body = bytes.NewReader(encoded)
	}

	request, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, body)
	if err != nil {
		return fmt.Errorf("build wildduck request %s %s: %w", method, path, err)
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("X-Access-Token", c.accessToken)
	if requestBody != nil {
		request.Header.Set("Content-Type", "application/json")
	}

	response, err := c.httpClient.Do(request)
	if err != nil {
		return fmt.Errorf("wildduck request %s %s: %w", method, path, err)
	}
	defer response.Body.Close()

	data, err := io.ReadAll(response.Body)
	if err != nil {
		return fmt.Errorf("read wildduck response %s %s: %w", method, path, err)
	}
	if response.StatusCode == http.StatusNotFound {
		return errWildDuckNotFound
	}
	if response.StatusCode >= 400 {
		var failure struct {
			Error string `json:"error"`
			Code  string `json:"code"`
		}
		if json.Unmarshal(data, &failure) == nil && failure.Error != "" {
			return fmt.Errorf("wildduck %s %s: %s (%s)", method, path, failure.Error, failure.Code)
		}
		return fmt.Errorf("wildduck %s %s: unexpected status %s", method, path, response.Status)
	}
	if responseBody == nil {
		return nil
	}
	if err := json.Unmarshal(data, responseBody); err != nil {
		return fmt.Errorf("decode wildduck response %s %s: %w", method, path, err)
	}
	return nil
}
