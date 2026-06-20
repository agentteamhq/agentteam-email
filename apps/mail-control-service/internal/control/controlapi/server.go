package controlapi

import (
	"context"
	"crypto/subtle"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"time"

	"agent-mail/internal/control/controlstate"
	"agent-mail/internal/control/messageprovenance"
	"agent-mail/internal/provisioning/mailprovisioner"
	"agent-mail/internal/registry/domainregistry"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humago"
)

const (
	TokenHeader = "X-Agent-Mail-Control-Token"

	statusRPCMethod         = "agentMail.status.get"
	domainAddRPCMethod      = "agentMail.domain.add"
	domainModifyRPCMethod   = "agentMail.domain.modify"
	domainRemoveRPCMethod   = "agentMail.domain.remove"
	provisionApplyRPCMethod = "agentMail.provision.apply"
	messageProvenanceMethod = "agentMail.message.provenance.get"
	messageViewMethod       = "agentMail.message.view.get"
	messageSecurityMethod   = "agentMail.message.security.get"
)

type Config struct {
	ListenAddress string
	AuthToken     string
}

type StatusProvider interface {
	Snapshot(now time.Time) (domainregistry.Snapshot, error)
}

type DomainProvisioner interface {
	AddDomain(ctx context.Context, params controlstate.DomainConfigParams, now time.Time) (mailprovisioner.DomainConfigResult, error)
	ModifyDomain(ctx context.Context, params controlstate.DomainConfigParams, now time.Time) (mailprovisioner.DomainConfigResult, error)
	RemoveDomain(ctx context.Context, params controlstate.DomainRemoveParams, now time.Time) (mailprovisioner.DomainConfigResult, error)
	Provision(ctx context.Context, now time.Time) (mailprovisioner.ControlProvisionResult, error)
}

type MessageProvenanceProvider interface {
	Get(ctx context.Context, params messageprovenance.Params) (messageprovenance.MessageProvenanceResult, error)
	View(ctx context.Context, params messageprovenance.ViewParams) (messageprovenance.MessageViewResult, error)
	Security(ctx context.Context, params messageprovenance.Params) (messageprovenance.MessageSecurityResult, error)
}

type Server struct {
	cfg         Config
	provider    StatusProvider
	provisioner DomainProvisioner
	provenance  MessageProvenanceProvider
}

func New(cfg Config, provider StatusProvider, provisioner DomainProvisioner, provenance MessageProvenanceProvider) (*Server, error) {
	if cfg.ListenAddress == "" {
		return nil, fmt.Errorf("missing admin API listen address")
	}
	if cfg.AuthToken == "" {
		return nil, fmt.Errorf("missing admin API auth token")
	}
	if provider == nil {
		return nil, fmt.Errorf("missing status provider")
	}
	if provisioner == nil {
		return nil, fmt.Errorf("missing domain provisioner")
	}
	if provenance == nil {
		return nil, fmt.Errorf("missing message provenance provider")
	}
	return &Server{cfg: cfg, provider: provider, provisioner: provisioner, provenance: provenance}, nil
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
		Description: "JSON-RPC-style status query for active domain registry projection, fast-path mapping, provider mapping, and source config state.",
		Tags:        []string{"status"},
	}, s.handleStatus)

	huma.Register(api, huma.Operation{
		OperationID: "agentMailDomainAdd",
		Method:      http.MethodPost,
		Path:        "/rpc/agentMail.domain.add",
		Summary:     "Add Agent Mail desired domain config",
		Description: "JSON-RPC-style desired-domain add. This updates service-owned desired state only.",
		Tags:        []string{"domains"},
	}, s.handleDomainAdd)

	huma.Register(api, huma.Operation{
		OperationID: "agentMailDomainModify",
		Method:      http.MethodPost,
		Path:        "/rpc/agentMail.domain.modify",
		Summary:     "Modify Agent Mail desired domain config",
		Description: "JSON-RPC-style desired-domain modify. This updates service-owned desired state only.",
		Tags:        []string{"domains"},
	}, s.handleDomainModify)

	huma.Register(api, huma.Operation{
		OperationID: "agentMailDomainRemove",
		Method:      http.MethodPost,
		Path:        "/rpc/agentMail.domain.remove",
		Summary:     "Soft-disable Agent Mail desired domain config",
		Description: "JSON-RPC-style desired-domain removal. This soft-disables service-owned desired state only.",
		Tags:        []string{"domains"},
	}, s.handleDomainRemove)

	huma.Register(api, huma.Operation{
		OperationID: "agentMailProvisionApply",
		Method:      http.MethodPost,
		Path:        "/rpc/agentMail.provision.apply",
		Summary:     "Apply Agent Mail desired domain config",
		Description: "JSON-RPC-style full provision apply. This reads service-owned desired domain state and applies Worker, Cloudflare, WildDuck feedback, and runtime registry steps.",
		Tags:        []string{"provision"},
	}, s.handleProvisionApply)

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
		Description: "JSON-RPC-style read-only view query for one delivered WildDuck message. The response exposes preserved-body display metadata plus link and remote image metadata; it is not a broad HTML sanitizer.",
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
	Token string           `header:"X-Agent-Mail-Control-Token" required:"true" doc:"Agent Mail control API token"`
	Body  StatusRPCRequest `contentType:"application/json"`
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

type DomainAddInput struct {
	Token string              `header:"X-Agent-Mail-Control-Token" required:"true" doc:"Agent Mail control API token"`
	Body  DomainAddRPCRequest `contentType:"application/json"`
}

type DomainAddRPCRequest struct {
	JSONRPC string                          `json:"jsonrpc" enum:"2.0" doc:"JSON-RPC protocol version"`
	ID      string                          `json:"id,omitempty" doc:"Caller-supplied request id"`
	Method  string                          `json:"method" enum:"agentMail.domain.add" doc:"RPC method name"`
	Params  controlstate.DomainConfigParams `json:"params"`
}

type DomainAddOutput struct {
	Body DomainAddRPCResponse `contentType:"application/json"`
}

type DomainAddRPCResponse struct {
	JSONRPC string                             `json:"jsonrpc"`
	ID      string                             `json:"id,omitempty"`
	Result  mailprovisioner.DomainConfigResult `json:"result"`
}

type DomainModifyInput struct {
	Token string                 `header:"X-Agent-Mail-Control-Token" required:"true" doc:"Agent Mail control API token"`
	Body  DomainModifyRPCRequest `contentType:"application/json"`
}

type DomainModifyRPCRequest struct {
	JSONRPC string                          `json:"jsonrpc" enum:"2.0" doc:"JSON-RPC protocol version"`
	ID      string                          `json:"id,omitempty" doc:"Caller-supplied request id"`
	Method  string                          `json:"method" enum:"agentMail.domain.modify" doc:"RPC method name"`
	Params  controlstate.DomainConfigParams `json:"params"`
}

type DomainModifyOutput struct {
	Body DomainModifyRPCResponse `contentType:"application/json"`
}

type DomainModifyRPCResponse struct {
	JSONRPC string                             `json:"jsonrpc"`
	ID      string                             `json:"id,omitempty"`
	Result  mailprovisioner.DomainConfigResult `json:"result"`
}

type DomainRemoveInput struct {
	Token string                 `header:"X-Agent-Mail-Control-Token" required:"true" doc:"Agent Mail control API token"`
	Body  DomainRemoveRPCRequest `contentType:"application/json"`
}

type DomainRemoveRPCRequest struct {
	JSONRPC string                          `json:"jsonrpc" enum:"2.0" doc:"JSON-RPC protocol version"`
	ID      string                          `json:"id,omitempty" doc:"Caller-supplied request id"`
	Method  string                          `json:"method" enum:"agentMail.domain.remove" doc:"RPC method name"`
	Params  controlstate.DomainRemoveParams `json:"params"`
}

type DomainRemoveOutput struct {
	Body DomainRemoveRPCResponse `contentType:"application/json"`
}

type DomainRemoveRPCResponse struct {
	JSONRPC string                             `json:"jsonrpc"`
	ID      string                             `json:"id,omitempty"`
	Result  mailprovisioner.DomainConfigResult `json:"result"`
}

type ProvisionApplyInput struct {
	Token string                   `header:"X-Agent-Mail-Control-Token" required:"true" doc:"Agent Mail control API token"`
	Body  ProvisionApplyRPCRequest `contentType:"application/json"`
}

type ProvisionApplyRPCRequest struct {
	JSONRPC string               `json:"jsonrpc" enum:"2.0" doc:"JSON-RPC protocol version"`
	ID      string               `json:"id,omitempty" doc:"Caller-supplied request id"`
	Method  string               `json:"method" enum:"agentMail.provision.apply" doc:"RPC method name"`
	Params  ProvisionApplyParams `json:"params"`
}

type ProvisionApplyParams struct{}

type ProvisionApplyOutput struct {
	Body ProvisionApplyRPCResponse `contentType:"application/json"`
}

type ProvisionApplyRPCResponse struct {
	JSONRPC string                                 `json:"jsonrpc"`
	ID      string                                 `json:"id,omitempty"`
	Result  mailprovisioner.ControlProvisionResult `json:"result"`
}

type MessageProvenanceInput struct {
	Token string                      `header:"X-Agent-Mail-Control-Token" required:"true" doc:"Agent Mail control API token"`
	Body  MessageProvenanceRPCRequest `contentType:"application/json"`
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
	Token string                `header:"X-Agent-Mail-Control-Token" required:"true" doc:"Agent Mail control API token"`
	Body  MessageViewRPCRequest `contentType:"application/json"`
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
	Token string                    `header:"X-Agent-Mail-Control-Token" required:"true" doc:"Agent Mail control API token"`
	Body  MessageSecurityRPCRequest `contentType:"application/json"`
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
	if err := s.requireToken(input.Token); err != nil {
		return nil, err
	}
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

func (s *Server) handleDomainAdd(ctx context.Context, input *DomainAddInput) (*DomainAddOutput, error) {
	if err := s.requireToken(input.Token); err != nil {
		return nil, err
	}
	if input.Body.JSONRPC != "2.0" {
		return nil, huma.Error400BadRequest("jsonrpc must be 2.0")
	}
	if input.Body.Method != domainAddRPCMethod {
		return nil, huma.Error400BadRequest("method must be agentMail.domain.add")
	}
	result, err := s.provisioner.AddDomain(ctx, input.Body.Params, time.Now().UTC())
	if err != nil {
		return nil, huma.Error400BadRequest("add desired domain", err)
	}
	return &DomainAddOutput{
		Body: DomainAddRPCResponse{
			JSONRPC: "2.0",
			ID:      input.Body.ID,
			Result:  result,
		},
	}, nil
}

func (s *Server) handleDomainModify(ctx context.Context, input *DomainModifyInput) (*DomainModifyOutput, error) {
	if err := s.requireToken(input.Token); err != nil {
		return nil, err
	}
	if input.Body.JSONRPC != "2.0" {
		return nil, huma.Error400BadRequest("jsonrpc must be 2.0")
	}
	if input.Body.Method != domainModifyRPCMethod {
		return nil, huma.Error400BadRequest("method must be agentMail.domain.modify")
	}
	result, err := s.provisioner.ModifyDomain(ctx, input.Body.Params, time.Now().UTC())
	if err != nil {
		return nil, huma.Error400BadRequest("modify desired domain", err)
	}
	return &DomainModifyOutput{
		Body: DomainModifyRPCResponse{
			JSONRPC: "2.0",
			ID:      input.Body.ID,
			Result:  result,
		},
	}, nil
}

func (s *Server) handleDomainRemove(ctx context.Context, input *DomainRemoveInput) (*DomainRemoveOutput, error) {
	if err := s.requireToken(input.Token); err != nil {
		return nil, err
	}
	if input.Body.JSONRPC != "2.0" {
		return nil, huma.Error400BadRequest("jsonrpc must be 2.0")
	}
	if input.Body.Method != domainRemoveRPCMethod {
		return nil, huma.Error400BadRequest("method must be agentMail.domain.remove")
	}
	result, err := s.provisioner.RemoveDomain(ctx, input.Body.Params, time.Now().UTC())
	if err != nil {
		return nil, huma.Error400BadRequest("remove desired domain", err)
	}
	return &DomainRemoveOutput{
		Body: DomainRemoveRPCResponse{
			JSONRPC: "2.0",
			ID:      input.Body.ID,
			Result:  result,
		},
	}, nil
}

func (s *Server) handleProvisionApply(ctx context.Context, input *ProvisionApplyInput) (*ProvisionApplyOutput, error) {
	if err := s.requireToken(input.Token); err != nil {
		return nil, err
	}
	if input.Body.JSONRPC != "2.0" {
		return nil, huma.Error400BadRequest("jsonrpc must be 2.0")
	}
	if input.Body.Method != provisionApplyRPCMethod {
		return nil, huma.Error400BadRequest("method must be agentMail.provision.apply")
	}
	result, err := s.provisioner.Provision(ctx, time.Now().UTC())
	if err != nil {
		return nil, huma.Error400BadRequest("apply desired domain provisioning", err)
	}
	return &ProvisionApplyOutput{
		Body: ProvisionApplyRPCResponse{
			JSONRPC: "2.0",
			ID:      input.Body.ID,
			Result:  result,
		},
	}, nil
}

func (s *Server) handleMessageProvenance(ctx context.Context, input *MessageProvenanceInput) (*MessageProvenanceOutput, error) {
	if err := s.requireToken(input.Token); err != nil {
		return nil, err
	}
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
	if err := s.requireToken(input.Token); err != nil {
		return nil, err
	}
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
	if err := s.requireToken(input.Token); err != nil {
		return nil, err
	}
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

func (s *Server) requireToken(value string) error {
	if s.adminTokenMatches(value) {
		return nil
	}
	return huma.Error401Unauthorized("invalid control API token")
}

func (s *Server) adminTokenMatches(value string) bool {
	if subtle.ConstantTimeCompare([]byte(value), []byte(s.cfg.AuthToken)) != 1 {
		return false
	}
	return true
}
