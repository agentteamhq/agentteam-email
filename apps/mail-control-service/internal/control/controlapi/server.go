package controlapi

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"time"

	"mail-control-service/internal/archive/r2archive"
	"mail-control-service/internal/control/controlstate"
	"mail-control-service/internal/control/messageprovenance"
	"mail-control-service/internal/modules/poller"
	"mail-control-service/internal/registry/domainregistry"

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
		return fmt.Errorf("listen for admin API: %w", err)
	}
	mux := http.NewServeMux()
	s.register(mux)
	server := &http.Server{
		Addr:              s.cfg.ListenAddress,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Printf("agent-mail-control-api event=listener_start listen_address=%s", s.cfg.ListenAddress)
		errCh <- server.Serve(listener)
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			return fmt.Errorf("shutdown admin API: %w", err)
		}
		err := <-errCh
		if err == nil || errors.Is(err, http.ErrServerClosed) {
			return ctx.Err()
		}
		return err
	case err := <-errCh:
		if err == nil || errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	s.register(mux)
	return mux
}

func (s *Server) register(mux *http.ServeMux) huma.API {
	config := huma.DefaultConfig("Agent Mail Control API", "0.1.0")
	config.OpenAPIPath = "/openapi"
	config.DocsPath = ""
	config.SchemasPath = "/schemas"
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
		Description: "JSON-RPC-style read-only view query for one delivered WildDuck message. The response exposes a sanitized display HTML fragment plus inert link and remote image metadata.",
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
	JSONRPC string       `json:"jsonrpc" enum:"2.0" doc:"JSON-RPC protocol version"`
	ID      string       `json:"id,omitempty" doc:"Caller-supplied request id"`
	Method  string       `json:"method" enum:"agentMail.status.get" doc:"RPC method name"`
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
	JSONRPC string            `json:"jsonrpc" enum:"2.0" doc:"JSON-RPC protocol version"`
	ID      string            `json:"id,omitempty" doc:"Caller-supplied request id"`
	Method  string            `json:"method" enum:"agentMail.runtime.sync" doc:"RPC method name"`
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
	JSONRPC string              `json:"jsonrpc" enum:"2.0" doc:"JSON-RPC protocol version"`
	ID      string              `json:"id,omitempty" doc:"Caller-supplied request id"`
	Method  string              `json:"method" enum:"agentMail.ingest.enqueue" doc:"RPC method name"`
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
	JSONRPC string                         `json:"jsonrpc" enum:"2.0" doc:"JSON-RPC protocol version"`
	ID      string                         `json:"id,omitempty" doc:"Caller-supplied request id"`
	Method  string                         `json:"method" enum:"agentMail.worker.archiveCredentials.issue" doc:"RPC method name"`
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
	JSONRPC string           `json:"jsonrpc" enum:"2.0" doc:"JSON-RPC protocol version"`
	ID      string           `json:"id,omitempty" doc:"Caller-supplied request id"`
	Method  string           `json:"method" enum:"agentMail.send.submit" doc:"RPC method name"`
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
	JSONRPC string                   `json:"jsonrpc" enum:"2.0" doc:"JSON-RPC protocol version"`
	ID      string                   `json:"id,omitempty" doc:"Caller-supplied request id"`
	Method  string                   `json:"method" enum:"agentMail.message.provenance.get" doc:"RPC method name"`
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
	JSONRPC string                       `json:"jsonrpc" enum:"2.0" doc:"JSON-RPC protocol version"`
	ID      string                       `json:"id,omitempty" doc:"Caller-supplied request id"`
	Method  string                       `json:"method" enum:"agentMail.message.view.get" doc:"RPC method name"`
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
	JSONRPC string                   `json:"jsonrpc" enum:"2.0" doc:"JSON-RPC protocol version"`
	ID      string                   `json:"id,omitempty" doc:"Caller-supplied request id"`
	Method  string                   `json:"method" enum:"agentMail.message.security.get" doc:"RPC method name"`
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
	if input.Body.JSONRPC != "2.0" {
		return nil, huma.Error400BadRequest("jsonrpc must be 2.0")
	}
	if input.Body.Method != statusRPCMethod {
		return nil, huma.Error400BadRequest("method must be agentMail.status.get")
	}
	snapshot, err := s.provider.Snapshot(time.Now().UTC())
	if err != nil {
		return nil, huma.Error500InternalServerError("build status snapshot", err)
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
	if input.Body.JSONRPC != "2.0" {
		return nil, huma.Error400BadRequest("jsonrpc must be 2.0")
	}
	if input.Body.Method != runtimeSyncMethod {
		return nil, huma.Error400BadRequest("method must be agentMail.runtime.sync")
	}
	if s.runtime == nil {
		return nil, huma.Error503ServiceUnavailable("runtime sync is not configured")
	}
	result, err := s.runtime.SyncRuntime(ctx, input.Body.Params, time.Now().UTC())
	if err != nil {
		return nil, huma.Error400BadRequest("sync runtime projection", err)
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
	if input.Body.JSONRPC != "2.0" {
		return nil, huma.Error400BadRequest("jsonrpc must be 2.0")
	}
	if input.Body.Method != ingestEnqueueMethod {
		return nil, huma.Error400BadRequest("method must be agentMail.ingest.enqueue")
	}
	if s.ingest == nil {
		return nil, huma.Error503ServiceUnavailable("ingest enqueue is not configured")
	}
	bundle, err := s.ingest.EnqueueNotification(ctx, input.Body.Params)
	if err != nil {
		log.Printf(
			"agent-mail-control-api event=ingest_enqueue_rejected ingest_id=%s recipient_domain=%s worker_connection_id=%s error=%q",
			input.Body.Params.IngestID,
			input.Body.Params.RecipientDomain,
			input.Body.Params.WorkerConnectionID,
			err,
		)
		return nil, huma.Error400BadRequest(fmt.Sprintf("enqueue verified ingest notification: %s", err.Error()))
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
	if input.Body.JSONRPC != "2.0" {
		return nil, huma.Error400BadRequest("jsonrpc must be 2.0")
	}
	if input.Body.Method != workerArchiveCredMethod {
		return nil, huma.Error400BadRequest("method must be agentMail.worker.archiveCredentials.issue")
	}
	if s.credentials == nil {
		return nil, huma.Error503ServiceUnavailable("worker archive credential issuer is not configured")
	}
	result, err := s.credentials.IssueWorkerArchiveCredentials(ctx, input.Body.Params, time.Now().UTC())
	if err != nil {
		return nil, huma.Error400BadRequest("issue worker archive credentials", err)
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
	if input.Body.JSONRPC != "2.0" {
		return nil, huma.Error400BadRequest("jsonrpc must be 2.0")
	}
	if input.Body.Method != sendSubmitMethod {
		return nil, huma.Error400BadRequest("method must be agentMail.send.submit")
	}
	if s.send == nil {
		return nil, huma.Error501NotImplemented("send submit is not configured")
	}
	result, err := s.send.SubmitSend(ctx, input.Body.Params, time.Now().UTC())
	if err != nil {
		return nil, huma.Error400BadRequest("submit send", err)
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
	if input.Body.JSONRPC != "2.0" {
		return nil, huma.Error400BadRequest("jsonrpc must be 2.0")
	}
	if input.Body.Method != messageProvenanceMethod {
		return nil, huma.Error400BadRequest("method must be agentMail.message.provenance.get")
	}
	result, err := s.provenance.Get(ctx, input.Body.Params)
	if err != nil {
		return nil, huma.Error502BadGateway("get message provenance", err)
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
	if input.Body.JSONRPC != "2.0" {
		return nil, huma.Error400BadRequest("jsonrpc must be 2.0")
	}
	if input.Body.Method != messageViewMethod {
		return nil, huma.Error400BadRequest("method must be agentMail.message.view.get")
	}
	result, err := s.provenance.View(ctx, input.Body.Params)
	if err != nil {
		return nil, huma.Error502BadGateway("get message view", err)
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
	if input.Body.JSONRPC != "2.0" {
		return nil, huma.Error400BadRequest("jsonrpc must be 2.0")
	}
	if input.Body.Method != messageSecurityMethod {
		return nil, huma.Error400BadRequest("method must be agentMail.message.security.get")
	}
	result, err := s.provenance.Security(ctx, input.Body.Params)
	if err != nil {
		return nil, huma.Error502BadGateway("get message security", err)
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
