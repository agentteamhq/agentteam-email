package controlapi

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"mail-control-service/internal/archive/r2archive"
	"mail-control-service/internal/control/controlstate"
	"mail-control-service/internal/control/messageprovenance"
	"mail-control-service/internal/modules/poller"
	"mail-control-service/internal/registry/domainregistry"
	"mail-control-service/internal/safelog"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humago"
)

const (
	statusRPCMethod         = "agentMail.status.get"
	runtimeSyncMethod       = "agentMail.runtime.sync"
	ingestEnqueueMethod     = "agentMail.ingest.enqueue"
	workerArchiveCredMethod = "agentMail.worker.archiveCredentials.issue"
	sendSubmitMethod        = "agentMail.send.submit"
	messageProvenanceMethod = "agentMail.message.provenance.get"
	messageViewMethod       = "agentMail.message.view.get"
	messageSecurityMethod   = "agentMail.message.security.get"

	publicControlAPIErrorMessage = "internal control API request failed"
)

type Config struct {
	ListenAddress string
}

type StatusProvider interface {
	Snapshot(now time.Time) (domainregistry.Snapshot, error)
}

type MessageProvenanceProvider interface {
	Get(ctx context.Context, params messageprovenance.Params) (messageprovenance.MessageProvenanceResult, error)
	View(ctx context.Context, params messageprovenance.ViewParams) (messageprovenance.MessageViewResult, error)
	Security(ctx context.Context, params messageprovenance.Params) (messageprovenance.MessageSecurityResult, error)
}

type IngestEnqueuer interface {
	EnqueueNotification(ctx context.Context, notification poller.Notification) (r2archive.InboundBundle, error)
}

type WorkerArchiveCredentialIssuer interface {
	IssueWorkerArchiveCredentials(ctx context.Context, params WorkerArchiveCredentialsParams, now time.Time) (WorkerArchiveCredentialsResult, error)
}

type RuntimeSyncer interface {
	SyncRuntime(ctx context.Context, params RuntimeSyncParams, now time.Time) (RuntimeSyncResult, error)
}

type SendSubmitter interface {
	SubmitSend(ctx context.Context, params SendSubmitParams, now time.Time) (SendSubmitResult, error)
}

type Option func(*Server)

type Server struct {
	cfg         Config
	provider    StatusProvider
	provenance  MessageProvenanceProvider
	ingest      IngestEnqueuer
	credentials WorkerArchiveCredentialIssuer
	runtime     RuntimeSyncer
	send        SendSubmitter
}

func New(cfg Config, provider StatusProvider, provenance MessageProvenanceProvider, options ...Option) (*Server, error) {
	if cfg.ListenAddress == "" {
		return nil, fmt.Errorf("missing admin API listen address")
	}
	if provider == nil {
		return nil, fmt.Errorf("missing status provider")
	}
	if provenance == nil {
		return nil, fmt.Errorf("missing message provenance provider")
	}
	server := &Server{cfg: cfg, provider: provider, provenance: provenance}
	for _, option := range options {
		option(server)
	}
	return server, nil
}

func WithIngestEnqueuer(ingest IngestEnqueuer) Option {
	return func(s *Server) {
		s.ingest = ingest
	}
}

func WithRuntimeSyncer(runtime RuntimeSyncer) Option {
	return func(s *Server) {
		s.runtime = runtime
	}
}

func WithWorkerArchiveCredentialIssuer(credentials WorkerArchiveCredentialIssuer) Option {
	return func(s *Server) {
		s.credentials = credentials
	}
}

func WithSendSubmitter(send SendSubmitter) Option {
	return func(s *Server) {
		s.send = send
	}
}

func (s *Server) Run(ctx context.Context) error {
	listener, err := net.Listen("tcp", s.cfg.ListenAddress)
	if err != nil {
		log.Printf("agent-mail-control-api event=listener_failed listen_address=%q error=%q", s.cfg.ListenAddress, safelog.Error(err))
		return fmt.Errorf("listen for admin API: %w", err)
	}
	mux := http.NewServeMux()
	s.register(mux)
	server := &http.Server{
		Addr:              s.cfg.ListenAddress,
		Handler:           requestLogMiddleware("agent-mail-control-api", mux),
		ReadHeaderTimeout: 5 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Printf("agent-mail-control-api event=listener_start listen_address=%q", s.cfg.ListenAddress)
		errCh <- server.Serve(listener)
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			log.Printf("agent-mail-control-api event=shutdown_failed error=%q", safelog.Error(err))
			return fmt.Errorf("shutdown admin API: %w", err)
		}
		err := <-errCh
		if err == nil || errors.Is(err, http.ErrServerClosed) {
			return ctx.Err()
		}
		log.Printf("agent-mail-control-api event=listener_failed listen_address=%q error=%q", s.cfg.ListenAddress, safelog.Error(err))
		return err
	case err := <-errCh:
		if err == nil || errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		log.Printf("agent-mail-control-api event=listener_failed listen_address=%q error=%q", s.cfg.ListenAddress, safelog.Error(err))
		return err
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	s.register(mux)
	return requestLogMiddleware("agent-mail-control-api", mux)
}

func (s *Server) register(mux *http.ServeMux) huma.API {
	config := huma.DefaultConfig("Agent Mail Control API", "0.1.0")
	config.OpenAPIPath = "/openapi"
	config.DocsPath = ""
	config.SchemasPath = "/schemas"
	config.Transformers = append(config.Transformers, redactControlRPCErrorTransformer)
	api := humago.New(mux, config)

	huma.Register(api, huma.Operation{
		OperationID: "agentMailStatusGet",
		Method:      http.MethodPost,
		Path:        "/rpc/agentMail.status.get",
		Summary:     "Get Agent Mail control status",
		Description: "JSON-RPC-style status query for active domain registry projection, provider mapping, and source config state.",
		Tags:        []string{"status"},
	}, s.handleStatus)

	huma.Register(api, huma.Operation{
		OperationID: "agentMailRuntimeSync",
		Method:      http.MethodPost,
		Path:        "/rpc/agentMail.runtime.sync",
		Summary:     "Sync Agent Mail runtime projection",
		Description: "JSON-RPC-style internal runtime projection sync from the web server.",
		Tags:        []string{"runtime"},
	}, s.handleRuntimeSync)

	huma.Register(api, huma.Operation{
		OperationID: "agentMailIngestEnqueue",
		Method:      http.MethodPost,
		Path:        "/rpc/agentMail.ingest.enqueue",
		Summary:     "Enqueue verified Agent Mail inbound archive bundle",
		Description: "JSON-RPC-style internal enqueue handoff for Worker notifications already verified by the web server.",
		Tags:        []string{"ingest"},
	}, s.handleIngestEnqueue)

	huma.Register(api, huma.Operation{
		OperationID: "agentMailWorkerArchiveCredentialsIssue",
		Method:      http.MethodPost,
		Path:        "/rpc/agentMail.worker.archiveCredentials.issue",
		Summary:     "Issue prefix-scoped Worker archive credentials",
		Description: "JSON-RPC-style internal credential handoff for a verified Worker domain deployment. Credential material is returned only through this internal control API response.",
		Tags:        []string{"worker"},
	}, s.handleWorkerArchiveCredentials)

	huma.Register(api, huma.Operation{
		OperationID: "agentMailSendSubmit",
		Method:      http.MethodPost,
		Path:        "/rpc/agentMail.send.submit",
		Summary:     "Submit an authorized Agent Mail send operation",
		Description: "JSON-RPC-style internal send handoff from the web server.",
		Tags:        []string{"send"},
	}, s.handleSendSubmit)

	huma.Register(api, huma.Operation{
		OperationID: "agentMailMessageProvenanceGet",
		Method:      http.MethodPost,
		Path:        "/rpc/agentMail.message.provenance.get",
		Summary:     "Get Agent Mail message provenance",
		Description: "JSON-RPC-style read-only provenance query for one delivered WildDuck message. The response provides the canonical delivery key and allowlisted Agent Mail inbound provenance headers.",
		Tags:        []string{"provenance"},
	}, s.handleMessageProvenance)

	huma.Register(api, huma.Operation{
		OperationID: "agentMailMessageViewGet",
		Method:      http.MethodPost,
		Path:        "/rpc/agentMail.message.view.get",
		Summary:     "Get Agent Mail message view metadata",
		Description: "JSON-RPC-style read-only view query for one delivered WildDuck message. The response exposes preserved display HTML plus inert link and remote image metadata.",
		Tags:        []string{"messages"},
	}, s.handleMessageView)

	huma.Register(api, huma.Operation{
		OperationID: "agentMailMessageSecurityGet",
		Method:      http.MethodPost,
		Path:        "/rpc/agentMail.message.security.get",
		Summary:     "Get Agent Mail message security details",
		Description: "JSON-RPC-style read-only security query for one delivered WildDuck message. The response exposes parsed receiver authentication headers, Agent Mail provenance, and Gmail-style mailed-by/signed-by summaries.",
		Tags:        []string{"provenance"},
	}, s.handleMessageSecurity)

	huma.Register(api, huma.Operation{
		OperationID: "agentMailControlHealth",
		Method:      http.MethodGet,
		Path:        "/healthz",
		Summary:     "Check admin API health",
		Tags:        []string{"health"},
	}, s.handleHealth)

	return api
}

type StatusInput struct {
	Body StatusRPCRequest `contentType:"application/json"`
}

type StatusRPCRequest struct {
	JSONRPC string       `json:"jsonrpc" doc:"JSON-RPC protocol version"`
	ID      string       `json:"id,omitempty" doc:"Caller-supplied request id"`
	Method  string       `json:"method" doc:"RPC method name"`
	Params  StatusParams `json:"params"`
}

type StatusParams struct {
	IncludeSourceFiles bool `json:"include_source_files,omitempty" doc:"Include service-local source config file paths in the response"`
}

type StatusOutput struct {
	Body StatusRPCResponse `contentType:"application/json"`
}

type StatusRPCResponse struct {
	JSONRPC string                  `json:"jsonrpc"`
	ID      string                  `json:"id,omitempty"`
	Result  domainregistry.Snapshot `json:"result"`
}

type RuntimeSyncInput struct {
	Body RuntimeSyncRPCRequest `contentType:"application/json"`
}

type RuntimeSyncRPCRequest struct {
	JSONRPC string            `json:"jsonrpc" doc:"JSON-RPC protocol version"`
	ID      string            `json:"id,omitempty" doc:"Caller-supplied request id"`
	Method  string            `json:"method" doc:"RPC method name"`
	Params  RuntimeSyncParams `json:"params"`
}

type RuntimeSyncParams struct {
	Domains []controlstate.DomainConfigParams `json:"domains"`
}

type RuntimeSyncOutput struct {
	Body RuntimeSyncRPCResponse `contentType:"application/json"`
}

type RuntimeSyncRPCResponse struct {
	JSONRPC string            `json:"jsonrpc"`
	ID      string            `json:"id,omitempty"`
	Result  RuntimeSyncResult `json:"result"`
}

type RuntimeSyncResult struct {
	Domains []controlstate.RuntimeDomainSyncResult `json:"domains"`
	Changed bool                                   `json:"changed"`
}

type IngestEnqueueInput struct {
	Body IngestEnqueueRPCRequest `contentType:"application/json"`
}

type IngestEnqueueRPCRequest struct {
	JSONRPC string              `json:"jsonrpc" doc:"JSON-RPC protocol version"`
	ID      string              `json:"id,omitempty" doc:"Caller-supplied request id"`
	Method  string              `json:"method" doc:"RPC method name"`
	Params  poller.Notification `json:"params"`
}

type IngestEnqueueOutput struct {
	Body IngestEnqueueRPCResponse `contentType:"application/json"`
}

type IngestEnqueueRPCResponse struct {
	JSONRPC string              `json:"jsonrpc"`
	ID      string              `json:"id,omitempty"`
	Result  IngestEnqueueResult `json:"result"`
}

type IngestEnqueueResult struct {
	Status   string `json:"status"`
	IngestID string `json:"ingest_id"`
}

type WorkerArchiveCredentialsInput struct {
	Body WorkerArchiveCredentialsRPCRequest `contentType:"application/json"`
}

type WorkerArchiveCredentialsRPCRequest struct {
	JSONRPC string                         `json:"jsonrpc" doc:"JSON-RPC protocol version"`
	ID      string                         `json:"id,omitempty" doc:"Caller-supplied request id"`
	Method  string                         `json:"method" doc:"RPC method name"`
	Params  WorkerArchiveCredentialsParams `json:"params"`
}

type WorkerArchiveCredentialsParams struct {
	OrganizationID           string `json:"organization_id"`
	OrganizationPublicID     string `json:"organization_public_id"`
	Domain                   string `json:"domain"`
	ArchivePrefix            string `json:"archive_prefix"`
	WorkerConnectionID       string `json:"worker_connection_id"`
	WorkerDomainDeploymentID string `json:"worker_domain_deployment_id"`
}

type WorkerArchiveCredentialsOutput struct {
	Body WorkerArchiveCredentialsRPCResponse `contentType:"application/json"`
}

type WorkerArchiveCredentialsRPCResponse struct {
	JSONRPC string                         `json:"jsonrpc"`
	ID      string                         `json:"id,omitempty"`
	Result  WorkerArchiveCredentialsResult `json:"result"`
}

type WorkerArchiveCredentialsResult struct {
	Status          string    `json:"status"`
	ArchivePrefix   string    `json:"archive_prefix"`
	Bucket          string    `json:"bucket"`
	Endpoint        string    `json:"endpoint"`
	Region          string    `json:"region"`
	AccessKeyID     string    `json:"access_key_id"`
	SecretAccessKey string    `json:"secret_access_key"`
	SessionToken    string    `json:"session_token,omitempty"`
	ExpiresAt       time.Time `json:"expires_at"`
	RotationDate    string    `json:"rotation_date"`
}

type SendSubmitInput struct {
	Body SendSubmitRPCRequest `contentType:"application/json"`
}

type SendSubmitRPCRequest struct {
	JSONRPC string           `json:"jsonrpc" doc:"JSON-RPC protocol version"`
	ID      string           `json:"id,omitempty" doc:"Caller-supplied request id"`
	Method  string           `json:"method" doc:"RPC method name"`
	Params  SendSubmitParams `json:"params"`
}

type SendSubmitParams struct {
	IdempotencyKey string `json:"idempotency_key"`
	Domain         string `json:"domain"`
	From           string `json:"from"`
	To             string `json:"to"`
	Raw            string `json:"raw"`
}

type SendSubmitOutput struct {
	Body SendSubmitRPCResponse `contentType:"application/json"`
}

type SendSubmitRPCResponse struct {
	JSONRPC string           `json:"jsonrpc"`
	ID      string           `json:"id,omitempty"`
	Result  SendSubmitResult `json:"result"`
}

type SendSubmitResult struct {
	Status         string `json:"status"`
	IdempotencyKey string `json:"idempotency_key,omitempty"`
}

type MessageProvenanceInput struct {
	Body MessageProvenanceRPCRequest `contentType:"application/json"`
}

type MessageProvenanceRPCRequest struct {
	JSONRPC string                   `json:"jsonrpc" doc:"JSON-RPC protocol version"`
	ID      string                   `json:"id,omitempty" doc:"Caller-supplied request id"`
	Method  string                   `json:"method" doc:"RPC method name"`
	Params  messageprovenance.Params `json:"params"`
}

type MessageProvenanceOutput struct {
	Body MessageProvenanceRPCResponse `contentType:"application/json"`
}

type MessageProvenanceRPCResponse struct {
	JSONRPC string                                    `json:"jsonrpc"`
	ID      string                                    `json:"id,omitempty"`
	Result  messageprovenance.MessageProvenanceResult `json:"result"`
}

type MessageViewInput struct {
	Body MessageViewRPCRequest `contentType:"application/json"`
}

type MessageViewRPCRequest struct {
	JSONRPC string                       `json:"jsonrpc" doc:"JSON-RPC protocol version"`
	ID      string                       `json:"id,omitempty" doc:"Caller-supplied request id"`
	Method  string                       `json:"method" doc:"RPC method name"`
	Params  messageprovenance.ViewParams `json:"params"`
}

type MessageViewOutput struct {
	Body MessageViewRPCResponse `contentType:"application/json"`
}

type MessageViewRPCResponse struct {
	JSONRPC string                              `json:"jsonrpc"`
	ID      string                              `json:"id,omitempty"`
	Result  messageprovenance.MessageViewResult `json:"result"`
}

type MessageSecurityInput struct {
	Body MessageSecurityRPCRequest `contentType:"application/json"`
}

type MessageSecurityRPCRequest struct {
	JSONRPC string                   `json:"jsonrpc" doc:"JSON-RPC protocol version"`
	ID      string                   `json:"id,omitempty" doc:"Caller-supplied request id"`
	Method  string                   `json:"method" doc:"RPC method name"`
	Params  messageprovenance.Params `json:"params"`
}

type MessageSecurityOutput struct {
	Body MessageSecurityRPCResponse `contentType:"application/json"`
}

type MessageSecurityRPCResponse struct {
	JSONRPC string                                  `json:"jsonrpc"`
	ID      string                                  `json:"id,omitempty"`
	Result  messageprovenance.MessageSecurityResult `json:"result"`
}

type HealthOutput struct {
	Body HealthResponse `contentType:"application/json"`
}

type HealthResponse struct {
	Status string `json:"status"`
}

func (s *Server) handleStatus(ctx context.Context, input *StatusInput) (*StatusOutput, error) {
	if err := validateRPCEnvelope(input.Body.JSONRPC, input.Body.Method, input.Body.ID, statusRPCMethod); err != nil {
		return nil, err
	}
	snapshot, err := s.provider.Snapshot(time.Now().UTC())
	if err != nil {
		logControlAPIError("status_snapshot_failed", statusRPCMethod, input.Body.ID, http.StatusInternalServerError, err)
		return nil, publicControlAPIError(http.StatusInternalServerError)
	}
	if !input.Body.Params.IncludeSourceFiles {
		snapshot.SourceFiles = domainregistry.SourceFiles{}
	}
	return &StatusOutput{
		Body: StatusRPCResponse{
			JSONRPC: "2.0",
			ID:      input.Body.ID,
			Result:  snapshot,
		},
	}, nil
}

func (s *Server) handleRuntimeSync(ctx context.Context, input *RuntimeSyncInput) (*RuntimeSyncOutput, error) {
	if err := validateRPCEnvelope(input.Body.JSONRPC, input.Body.Method, input.Body.ID, runtimeSyncMethod); err != nil {
		return nil, err
	}
	if s.runtime == nil {
		logControlAPIError(
			"runtime_sync_unavailable",
			runtimeSyncMethod,
			input.Body.ID,
			http.StatusServiceUnavailable,
			errors.New("control module unavailable"),
			logField{name: "module", value: "runtime_sync"},
		)
		return nil, publicControlAPIError(http.StatusServiceUnavailable)
	}
	result, err := s.runtime.SyncRuntime(ctx, input.Body.Params, time.Now().UTC())
	if err != nil {
		logControlAPIError(
			"runtime_sync_rejected",
			runtimeSyncMethod,
			input.Body.ID,
			http.StatusBadRequest,
			err,
			logField{name: "domains_count", value: fmt.Sprint(len(input.Body.Params.Domains))},
		)
		return nil, publicControlAPIError(http.StatusBadRequest)
	}
	return &RuntimeSyncOutput{
		Body: RuntimeSyncRPCResponse{
			JSONRPC: "2.0",
			ID:      input.Body.ID,
			Result:  result,
		},
	}, nil
}

func (s *Server) handleIngestEnqueue(ctx context.Context, input *IngestEnqueueInput) (*IngestEnqueueOutput, error) {
	if err := validateRPCEnvelope(input.Body.JSONRPC, input.Body.Method, input.Body.ID, ingestEnqueueMethod); err != nil {
		return nil, err
	}
	if s.ingest == nil {
		logControlAPIError(
			"ingest_enqueue_unavailable",
			ingestEnqueueMethod,
			input.Body.ID,
			http.StatusServiceUnavailable,
			errors.New("control module unavailable"),
			logField{name: "module", value: "ingest_enqueue"},
		)
		return nil, publicControlAPIError(http.StatusServiceUnavailable)
	}
	bundle, err := s.ingest.EnqueueNotification(ctx, input.Body.Params)
	if err != nil {
		logControlAPIError(
			"ingest_enqueue_rejected",
			ingestEnqueueMethod,
			input.Body.ID,
			http.StatusBadRequest,
			err,
			logField{name: "ingest_id", value: input.Body.Params.IngestID},
			logField{name: "recipient_domain", value: input.Body.Params.RecipientDomain},
			logField{name: "worker_connection_id", value: input.Body.Params.WorkerConnectionID},
		)
		return nil, publicControlAPIError(http.StatusBadRequest)
	}
	return &IngestEnqueueOutput{
		Body: IngestEnqueueRPCResponse{
			JSONRPC: "2.0",
			ID:      input.Body.ID,
			Result: IngestEnqueueResult{
				Status:   "enqueued",
				IngestID: bundle.IngestID,
			},
		},
	}, nil
}

func (s *Server) handleWorkerArchiveCredentials(ctx context.Context, input *WorkerArchiveCredentialsInput) (*WorkerArchiveCredentialsOutput, error) {
	if err := validateRPCEnvelope(input.Body.JSONRPC, input.Body.Method, input.Body.ID, workerArchiveCredMethod); err != nil {
		return nil, err
	}
	if s.credentials == nil {
		logControlAPIError(
			"worker_archive_credentials_unavailable",
			workerArchiveCredMethod,
			input.Body.ID,
			http.StatusServiceUnavailable,
			errors.New("control module unavailable"),
			logField{name: "module", value: "worker_archive_credentials"},
		)
		return nil, publicControlAPIError(http.StatusServiceUnavailable)
	}
	result, err := s.credentials.IssueWorkerArchiveCredentials(ctx, input.Body.Params, time.Now().UTC())
	if err != nil {
		logControlAPIError(
			"worker_archive_credentials_issue_failed",
			workerArchiveCredMethod,
			input.Body.ID,
			http.StatusBadRequest,
			err,
			logField{name: "organization_public_id", value: input.Body.Params.OrganizationPublicID},
			logField{name: "domain", value: input.Body.Params.Domain},
			logField{name: "worker_connection_id", value: input.Body.Params.WorkerConnectionID},
		)
		return nil, publicControlAPIError(http.StatusBadRequest)
	}
	return &WorkerArchiveCredentialsOutput{
		Body: WorkerArchiveCredentialsRPCResponse{
			JSONRPC: "2.0",
			ID:      input.Body.ID,
			Result:  result,
		},
	}, nil
}

func (s *Server) handleSendSubmit(ctx context.Context, input *SendSubmitInput) (*SendSubmitOutput, error) {
	if err := validateRPCEnvelope(input.Body.JSONRPC, input.Body.Method, input.Body.ID, sendSubmitMethod); err != nil {
		return nil, err
	}
	if s.send == nil {
		logControlAPIError(
			"send_submit_unimplemented",
			sendSubmitMethod,
			input.Body.ID,
			http.StatusNotImplemented,
			errors.New("control module unavailable"),
			logField{name: "module", value: "send_submit"},
		)
		return nil, publicControlAPIError(http.StatusNotImplemented)
	}
	result, err := s.send.SubmitSend(ctx, input.Body.Params, time.Now().UTC())
	if err != nil {
		logControlAPIError(
			"send_submit_rejected",
			sendSubmitMethod,
			input.Body.ID,
			http.StatusBadRequest,
			err,
			logField{name: "idempotency_key", value: input.Body.Params.IdempotencyKey},
			logField{name: "domain", value: input.Body.Params.Domain},
			logField{name: "from", value: input.Body.Params.From},
			logField{name: "to", value: input.Body.Params.To},
		)
		return nil, publicControlAPIError(http.StatusBadRequest)
	}
	return &SendSubmitOutput{
		Body: SendSubmitRPCResponse{
			JSONRPC: "2.0",
			ID:      input.Body.ID,
			Result:  result,
		},
	}, nil
}

func (s *Server) handleMessageProvenance(ctx context.Context, input *MessageProvenanceInput) (*MessageProvenanceOutput, error) {
	if err := validateRPCEnvelope(input.Body.JSONRPC, input.Body.Method, input.Body.ID, messageProvenanceMethod); err != nil {
		return nil, err
	}
	result, err := s.provenance.Get(ctx, input.Body.Params)
	if err != nil {
		logControlAPIError(
			"message_provenance_failed",
			messageProvenanceMethod,
			input.Body.ID,
			http.StatusBadGateway,
			err,
			logField{name: "wildduck_user_id", value: input.Body.Params.WildDuckUserID},
			logField{name: "wildduck_mailbox_id", value: input.Body.Params.WildDuckMailboxID},
			logField{name: "wildduck_uid", value: fmt.Sprint(input.Body.Params.WildDuckUID)},
			logField{name: "wildduck_message_id", value: input.Body.Params.WildDuckMessageID},
		)
		return nil, publicControlAPIError(http.StatusBadGateway)
	}
	return &MessageProvenanceOutput{
		Body: MessageProvenanceRPCResponse{
			JSONRPC: "2.0",
			ID:      input.Body.ID,
			Result:  result,
		},
	}, nil
}

func (s *Server) handleMessageView(ctx context.Context, input *MessageViewInput) (*MessageViewOutput, error) {
	if err := validateRPCEnvelope(input.Body.JSONRPC, input.Body.Method, input.Body.ID, messageViewMethod); err != nil {
		return nil, err
	}
	result, err := s.provenance.View(ctx, input.Body.Params)
	if err != nil {
		logControlAPIError(
			"message_view_failed",
			messageViewMethod,
			input.Body.ID,
			http.StatusBadGateway,
			err,
			logField{name: "wildduck_user_id", value: input.Body.Params.WildDuckUserID},
			logField{name: "wildduck_mailbox_id", value: input.Body.Params.WildDuckMailboxID},
			logField{name: "wildduck_uid", value: fmt.Sprint(input.Body.Params.WildDuckUID)},
			logField{name: "wildduck_message_id", value: input.Body.Params.WildDuckMessageID},
		)
		return nil, publicControlAPIError(http.StatusBadGateway)
	}
	return &MessageViewOutput{
		Body: MessageViewRPCResponse{
			JSONRPC: "2.0",
			ID:      input.Body.ID,
			Result:  result,
		},
	}, nil
}

func (s *Server) handleMessageSecurity(ctx context.Context, input *MessageSecurityInput) (*MessageSecurityOutput, error) {
	if err := validateRPCEnvelope(input.Body.JSONRPC, input.Body.Method, input.Body.ID, messageSecurityMethod); err != nil {
		return nil, err
	}
	result, err := s.provenance.Security(ctx, input.Body.Params)
	if err != nil {
		logControlAPIError(
			"message_security_failed",
			messageSecurityMethod,
			input.Body.ID,
			http.StatusBadGateway,
			err,
			logField{name: "wildduck_user_id", value: input.Body.Params.WildDuckUserID},
			logField{name: "wildduck_mailbox_id", value: input.Body.Params.WildDuckMailboxID},
			logField{name: "wildduck_uid", value: fmt.Sprint(input.Body.Params.WildDuckUID)},
			logField{name: "wildduck_message_id", value: input.Body.Params.WildDuckMessageID},
		)
		return nil, publicControlAPIError(http.StatusBadGateway)
	}
	return &MessageSecurityOutput{
		Body: MessageSecurityRPCResponse{
			JSONRPC: "2.0",
			ID:      input.Body.ID,
			Result:  result,
		},
	}, nil
}

func (s *Server) handleHealth(ctx context.Context, input *struct{}) (*HealthOutput, error) {
	return &HealthOutput{
		Body: HealthResponse{Status: "ok"},
	}, nil
}

func requestLogMiddleware(component string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		startedAt := time.Now()
		recorder := &statusRecordingResponseWriter{
			ResponseWriter: writer,
			status:         http.StatusOK,
		}
		defer func() {
			if recovered := recover(); recovered != nil {
				if !recorder.wroteHeader {
					http.Error(recorder, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
				}
				log.Printf(
					"%s event=http_panic method=%s path=%q status=%d duration_ms=%d error=%q",
					component,
					safeHTTPMethod(request.Method),
					safeRequestPath(request),
					recorder.status,
					elapsedMilliseconds(startedAt),
					safelog.Text(fmt.Sprint(recovered)),
				)
			}
			log.Printf(
				"%s event=http_request method=%s path=%q status=%d duration_ms=%d",
				component,
				safeHTTPMethod(request.Method),
				safeRequestPath(request),
				recorder.status,
				elapsedMilliseconds(startedAt),
			)
			if recorder.status >= http.StatusInternalServerError {
				log.Printf(
					"%s event=http_request_error method=%s path=%q status=%d duration_ms=%d",
					component,
					safeHTTPMethod(request.Method),
					safeRequestPath(request),
					recorder.status,
					elapsedMilliseconds(startedAt),
				)
			}
			safelog.Debugf(
				"%s event=http_request_debug method=%s path=%q proto=%q remote_addr=%q content_length=%d",
				component,
				safeHTTPMethod(request.Method),
				safeRequestPath(request),
				safelog.Field(request.Proto, 32),
				safelog.Field(request.RemoteAddr, 128),
				request.ContentLength,
			)
		}()
		next.ServeHTTP(recorder, request)
	})
}

type statusRecordingResponseWriter struct {
	http.ResponseWriter
	status      int
	wroteHeader bool
}

func (w *statusRecordingResponseWriter) WriteHeader(status int) {
	if w.wroteHeader {
		return
	}
	w.status = status
	w.wroteHeader = true
	w.ResponseWriter.WriteHeader(status)
}

func (w *statusRecordingResponseWriter) Write(data []byte) (int, error) {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	return w.ResponseWriter.Write(data)
}

func (w *statusRecordingResponseWriter) Unwrap() http.ResponseWriter {
	return w.ResponseWriter
}

func safeHTTPMethod(method string) string {
	return safelog.Field(method, 32)
}

func safeRequestPath(request *http.Request) string {
	if request == nil || request.URL == nil {
		return ""
	}
	path := request.URL.EscapedPath()
	if path == "" {
		path = "/"
	}
	return safelog.Field(path, 200)
}

func elapsedMilliseconds(startedAt time.Time) int64 {
	return time.Since(startedAt).Round(time.Millisecond).Milliseconds()
}

type logField struct {
	name  string
	value string
}

func validateRPCEnvelope(jsonrpc string, method string, rpcID string, expectedMethod string) error {
	if jsonrpc != "2.0" {
		logControlAPIError(
			"rpc_envelope_validation_failed",
			expectedMethod,
			rpcID,
			http.StatusUnprocessableEntity,
			errors.New("jsonrpc version mismatch"),
			logField{name: "field", value: "jsonrpc"},
		)
		return publicControlAPIError(http.StatusUnprocessableEntity)
	}
	if method != expectedMethod {
		logControlAPIError(
			"rpc_method_validation_failed",
			expectedMethod,
			rpcID,
			http.StatusUnprocessableEntity,
			errors.New("rpc method mismatch"),
			logField{name: "received_method", value: method},
		)
		return publicControlAPIError(http.StatusUnprocessableEntity)
	}
	return nil
}

func redactControlRPCErrorTransformer(ctx huma.Context, status string, value any) (any, error) {
	code, err := strconv.Atoi(status)
	if err != nil || code < http.StatusBadRequest {
		return value, nil
	}
	op := ctx.Operation()
	if op == nil || !strings.HasPrefix(op.Path, "/rpc/") {
		return value, nil
	}

	switch errModel := value.(type) {
	case *huma.ErrorModel:
		return genericControlRPCErrorModel(op, errModel), nil
	case huma.ErrorModel:
		return genericControlRPCErrorModel(op, &errModel), nil
	default:
		return value, nil
	}
}

func genericControlRPCErrorModel(op *huma.Operation, errModel *huma.ErrorModel) *huma.ErrorModel {
	status := errModel.Status
	if status == 0 {
		status = http.StatusInternalServerError
	}
	if errModel.Detail != publicControlAPIErrorMessage {
		logControlAPIError(
			"rpc_error_response_redacted",
			strings.TrimPrefix(op.Path, "/rpc/"),
			"",
			status,
			errors.New(errModel.Detail),
			logField{name: "operation_id", value: op.OperationID},
		)
	}
	return &huma.ErrorModel{
		Title:  http.StatusText(status),
		Status: status,
		Detail: publicControlAPIErrorMessage,
	}
}

func logControlAPIError(event string, rpcMethod string, rpcID string, status int, err error, fields ...logField) {
	var builder strings.Builder
	fmt.Fprintf(
		&builder,
		"agent-mail-control-api event=%s rpc_method=%s rpc_id=%s status=%d",
		safelog.Field(event, 80),
		safelog.Field(rpcMethod, 120),
		safelog.Field(rpcID, 120),
		status,
	)
	for _, field := range fields {
		if field.name == "" || field.value == "" {
			continue
		}
		fmt.Fprintf(&builder, " %s=%q", field.name, safelog.Field(field.value, 160))
	}
	fmt.Fprintf(&builder, " error=%q", safelog.Error(err))
	log.Print(builder.String())
}

func publicControlAPIError(status int) error {
	switch status {
	case http.StatusBadRequest:
		return huma.Error400BadRequest(publicControlAPIErrorMessage)
	case http.StatusBadGateway:
		return huma.Error502BadGateway(publicControlAPIErrorMessage)
	case http.StatusInternalServerError:
		return huma.Error500InternalServerError(publicControlAPIErrorMessage)
	default:
		return huma.NewError(status, publicControlAPIErrorMessage)
	}
}
