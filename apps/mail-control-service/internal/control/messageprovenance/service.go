package messageprovenance

import (
	"context"
	"fmt"
	"os"
	"strings"

	"agent-mail/internal/archive/r2archive"
	"agent-mail/internal/config/configfile"
	"agent-mail/internal/mail/rfc822"
	"agent-mail/internal/stores/wildduck"
)

type Params struct {
	WildDuckUserID    string `json:"wildDuckUserId" doc:"WildDuck user ObjectId"`
	WildDuckMailboxID string `json:"wildDuckMailboxId" doc:"WildDuck mailbox ObjectId"`
	WildDuckUID       int    `json:"wildDuckUid" doc:"WildDuck mailbox UID for the delivered message"`
	WildDuckMessageID string `json:"wildDuckMessageId,omitempty" doc:"Optional WildDuck message ObjectId from an update event"`
}

type MessageProvenanceResult struct {
	DeliveryKey      string            `json:"deliveryKey"`
	IdempotencyBasis string            `json:"idempotencyBasis"`
	IngestID         string            `json:"ingestId,omitempty"`
	WildDuck         WildDuckIdentity  `json:"wildDuck"`
	Cloudflare       map[string]string `json:"cloudflare"`
	Headers          map[string]string `json:"headers"`
}

type WildDuckIdentity struct {
	UserID    string `json:"userId"`
	MailboxID string `json:"mailboxId"`
	UID       int    `json:"uid"`
	MessageID string `json:"messageId,omitempty"`
}

type SourceFetcher interface {
	FetchMessageSource(ctx context.Context, userID string, mailboxID string, uid int) ([]byte, error)
}

type ArchiveReader interface {
	GetBytes(ctx context.Context, key string) ([]byte, error)
}

type Service struct {
	fetcher SourceFetcher
	archive ArchiveReader
}

type Option func(*Service)

func WithArchiveReader(archive ArchiveReader) Option {
	return func(service *Service) {
		service.archive = archive
	}
}

func New(fetcher SourceFetcher, opts ...Option) (*Service, error) {
	if fetcher == nil {
		return nil, fmt.Errorf("missing WildDuck source fetcher")
	}
	service := &Service{fetcher: fetcher}
	for _, opt := range opts {
		if opt != nil {
			opt(service)
		}
	}
	return service, nil
}

func NewFromWildDuckAPIBaseURL(apiBaseURL string, archive ArchiveReader) (*Service, error) {
	adminToken, err := configfile.RequireEnv("AGENT_MAIL_WILDDUCK_ADMIN_ACCESS_TOKEN")
	if err != nil {
		return nil, err
	}
	client, err := wildduck.New(apiBaseURL, adminToken)
	if err != nil {
		return nil, err
	}
	return New(client, WithArchiveReader(archive))
}

func NewFromRuntimeEnv(ctx context.Context, wildDuckAPIBaseURL string) (*Service, error) {
	archive, err := newArchiveReaderFromEnv(ctx)
	if err != nil {
		return nil, err
	}
	return NewFromWildDuckAPIBaseURL(wildDuckAPIBaseURL, archive)
}

func newArchiveReaderFromEnv(ctx context.Context) (ArchiveReader, error) {
	keys := []string{
		"AGENT_MAIL_R2_ENDPOINT",
		"AGENT_MAIL_R2_REGION",
		"AGENT_MAIL_R2_BUCKET",
		"AGENT_MAIL_R2_ACCESS_KEY_ID",
		"AGENT_MAIL_R2_SECRET_ACCESS_KEY",
	}
	values := map[string]string{}
	missing := []string{}
	present := 0
	for _, key := range keys {
		value := strings.TrimSpace(os.Getenv(key))
		values[key] = value
		if strings.TrimSpace(value) == "" {
			missing = append(missing, key)
			continue
		}
		present++
	}
	if present == 0 {
		return nil, nil
	}
	if len(missing) > 0 {
		return nil, fmt.Errorf("incomplete R2 archive environment for message provenance: missing %s", strings.Join(missing, ", "))
	}
	return r2archive.New(ctx, r2archive.Config{
		Endpoint: values["AGENT_MAIL_R2_ENDPOINT"],
		Region:   values["AGENT_MAIL_R2_REGION"],
		Bucket:   values["AGENT_MAIL_R2_BUCKET"],
	}, values["AGENT_MAIL_R2_ACCESS_KEY_ID"], values["AGENT_MAIL_R2_SECRET_ACCESS_KEY"])
}

func (s *Service) Get(ctx context.Context, params Params) (MessageProvenanceResult, error) {
	identity, err := normalizeParams(params)
	if err != nil {
		return MessageProvenanceResult{}, err
	}
	raw, err := s.fetcher.FetchMessageSource(ctx, identity.UserID, identity.MailboxID, identity.UID)
	if err != nil {
		return MessageProvenanceResult{}, fmt.Errorf("fetch WildDuck message source: %w", err)
	}
	provenance, err := rfc822.ParseProvenanceHeaders(raw)
	if err != nil {
		return MessageProvenanceResult{}, err
	}

	deliveryKey, basis := deliveryKey(identity, provenance.IngestID)
	return MessageProvenanceResult{
		DeliveryKey:      deliveryKey,
		IdempotencyBasis: basis,
		IngestID:         provenance.IngestID,
		WildDuck:         identity,
		Cloudflare:       provenance.Cloudflare,
		Headers:          provenance.Headers,
	}, nil
}

func normalizeParams(params Params) (WildDuckIdentity, error) {
	identity := WildDuckIdentity{
		UserID:    strings.TrimSpace(params.WildDuckUserID),
		MailboxID: strings.TrimSpace(params.WildDuckMailboxID),
		UID:       params.WildDuckUID,
		MessageID: strings.TrimSpace(params.WildDuckMessageID),
	}
	if identity.UserID == "" {
		return WildDuckIdentity{}, fmt.Errorf("wildDuckUserId is required")
	}
	if identity.MailboxID == "" {
		return WildDuckIdentity{}, fmt.Errorf("wildDuckMailboxId is required")
	}
	if identity.UID <= 0 {
		return WildDuckIdentity{}, fmt.Errorf("wildDuckUid is required")
	}
	return identity, nil
}

func deliveryKey(identity WildDuckIdentity, ingestID string) (string, string) {
	uid := fmt.Sprintf("%d", identity.UID)
	if ingestID = strings.TrimSpace(ingestID); ingestID != "" {
		return strings.Join([]string{
			"agent-mail",
			"inbound",
			"v1",
			"ingest",
			ingestID,
			"wd",
			identity.UserID,
			"mb",
			identity.MailboxID,
			"uid",
			uid,
		}, ":"), "ingest+wildduck-delivery"
	}
	if identity.MessageID != "" {
		return strings.Join([]string{
			"agent-mail",
			"inbound",
			"v1",
			"wd-message",
			identity.MessageID,
			"wd",
			identity.UserID,
			"mb",
			identity.MailboxID,
			"uid",
			uid,
		}, ":"), "wildduck-message+delivery"
	}
	return strings.Join([]string{
		"agent-mail",
		"inbound",
		"v1",
		"wd",
		identity.UserID,
		"mb",
		identity.MailboxID,
		"uid",
		uid,
	}, ":"), "wildduck-delivery"
}
