package mailprovisioner

import (
	"context"
	"fmt"
	"log"
	"time"

	"agent-mail/internal/control/controlstate"
	"agent-mail/internal/provisioning/cloudflareprovisioner"
	"agent-mail/internal/provisioning/wildduckprovisioner"
)

type Service struct {
	store            controlstate.Store
	selectedProvider string
	cloudflare       CloudflareApplier
	wildduck         FeedbackApplier
}

type Option func(*Service)

type CloudflareApplier interface {
	Provision(ctx context.Context, params cloudflareprovisioner.CloudflareProvisionParams, now time.Time) (cloudflareprovisioner.ProvisionResult, error)
}

type FeedbackApplier interface {
	EnsureFeedback(ctx context.Context, records []controlstate.DomainRecord, now time.Time) (wildduckprovisioner.Result, error)
}

type DomainConfigResult struct {
	Domain  controlstate.DomainRecord `json:"domain"`
	Changed bool                      `json:"changed"`
}

type ControlProvisionResult struct {
	OK         bool                                  `json:"ok"`
	Steps      []ProvisionStep                       `json:"steps"`
	Cloudflare cloudflareprovisioner.ProvisionResult `json:"cloudflare"`
	WildDuck   wildduckprovisioner.Result            `json:"wildduck"`
	Domains    []controlstate.DomainRecord           `json:"domains"`
	Issues     []string                              `json:"issues,omitempty"`
}

type ProvisionStep struct {
	Name    string `json:"name"`
	Status  string `json:"status"`
	Changed bool   `json:"changed"`
	Detail  string `json:"detail,omitempty"`
	Error   string `json:"error,omitempty"`
}

type ApplyResult = DomainConfigResult
type DeactivateResult = DomainConfigResult

type ReprovisionResult struct {
	Domain controlstate.DomainRecord `json:"domain"`
}

func New(store controlstate.Store, options ...Option) *Service {
	service := &Service{store: store}
	for _, option := range options {
		option(service)
	}
	return service
}

func WithSelectedProvider(provider string) Option {
	return func(s *Service) {
		s.selectedProvider = provider
	}
}

func WithCloudflare(applier CloudflareApplier) Option {
	return func(s *Service) {
		s.cloudflare = applier
	}
}

func WithWildDuck(applier FeedbackApplier) Option {
	return func(s *Service) {
		s.wildduck = applier
	}
}

func (s *Service) State(ctx context.Context) (controlstate.State, error) {
	return s.store.State(ctx)
}

func (s *Service) AddDomain(ctx context.Context, params controlstate.DomainConfigParams, now time.Time) (DomainConfigResult, error) {
	domain, changed, err := controlstate.AddDomain(ctx, s.store, s.selectedProvider, params, now)
	if err != nil {
		return DomainConfigResult{}, err
	}
	return DomainConfigResult{Domain: domain, Changed: changed}, nil
}

func (s *Service) ModifyDomain(ctx context.Context, params controlstate.DomainConfigParams, now time.Time) (DomainConfigResult, error) {
	domain, changed, err := controlstate.ModifyDomain(ctx, s.store, s.selectedProvider, params, now)
	if err != nil {
		return DomainConfigResult{}, err
	}
	return DomainConfigResult{Domain: domain, Changed: changed}, nil
}

func (s *Service) RemoveDomain(ctx context.Context, params controlstate.DomainRemoveParams, now time.Time) (DomainConfigResult, error) {
	domain, changed, err := controlstate.RemoveDomain(ctx, s.store, params, now)
	if err != nil {
		return DomainConfigResult{}, err
	}
	return DomainConfigResult{Domain: domain, Changed: changed}, nil
}

func (s *Service) Provision(ctx context.Context, now time.Time) (ControlProvisionResult, error) {
	state, err := s.store.State(ctx)
	if err != nil {
		return ControlProvisionResult{}, err
	}
	enabled, err := controlstate.ActiveDomainRecords(ctx, s.store, nil)
	if err != nil {
		return ControlProvisionResult{}, err
	}
	result := ControlProvisionResult{
		OK:      true,
		Domains: state.Domains,
	}
	result.addStep(ProvisionStep{
		Name:    "desired_domain_config",
		Status:  "applied",
		Changed: false,
		Detail:  fmt.Sprintf("domains=%d enabled=%d", len(state.Domains), len(enabled)),
	})
	if len(enabled) == 0 {
		result.OK = false
		result.Issues = append(result.Issues, "no_enabled_domains")
		result.addStep(ProvisionStep{Name: "domain_precondition", Status: "failed", Error: "no enabled domains in desired state"})
		return result, fmt.Errorf("no enabled domains in desired state")
	}

	if s.wildduck == nil {
		result.OK = false
		result.Issues = append(result.Issues, "wildduck_feedback_provisioner_missing")
		result.addStep(ProvisionStep{Name: "wildduck_feedback", Status: "failed", Error: "WildDuck feedback provisioner is not configured"})
	} else {
		wildDuckResult, err := s.wildduck.EnsureFeedback(ctx, enabled, now)
		result.WildDuck = wildDuckResult
		if err != nil {
			result.OK = false
			result.Issues = append(result.Issues, "wildduck_feedback_failed")
			result.addStep(ProvisionStep{Name: "wildduck_feedback", Status: "failed", Error: err.Error()})
		} else {
			result.addStep(ProvisionStep{Name: "wildduck_feedback", Status: statusFromOK(wildDuckResult.OK), Changed: feedbackChanged(wildDuckResult)})
			if !wildDuckResult.OK {
				result.OK = false
				result.Issues = append(result.Issues, wildDuckResult.Issues...)
			}
		}
	}

	if s.cloudflare == nil {
		result.OK = false
		result.Issues = append(result.Issues, "cloudflare_provisioner_missing")
		result.addStep(ProvisionStep{Name: "cloudflare_routing", Status: "failed", Error: "Cloudflare provisioner is not configured"})
	} else {
		cloudflareResult, err := s.cloudflare.Provision(ctx, cloudflareprovisioner.CloudflareProvisionParams{}, now)
		result.Cloudflare = cloudflareResult
		if err != nil {
			result.OK = false
			result.Issues = append(result.Issues, "cloudflare_routing_failed")
			result.addStep(ProvisionStep{Name: "cloudflare_routing", Status: "failed", Error: err.Error()})
		} else {
			result.addStep(ProvisionStep{Name: "cloudflare_routing", Status: statusFromOK(cloudflareResult.OK), Changed: cloudflareChanged(cloudflareResult)})
			if !cloudflareResult.OK {
				result.OK = false
				result.Issues = append(result.Issues, cloudflareResult.Issues...)
			}
		}
	}

	result.addStep(ProvisionStep{
		Name:    "runtime_registry_projection",
		Status:  "applied",
		Changed: false,
		Detail:  "control state is the runtime registry source for control status",
	})
	for _, step := range result.Steps {
		log.Printf("agent-mail-control-provision step=%s status=%s changed=%t detail=%q error=%q", step.Name, step.Status, step.Changed, step.Detail, step.Error)
	}
	return result, nil
}

func (r *ControlProvisionResult) addStep(step ProvisionStep) {
	r.Steps = append(r.Steps, step)
}

func (s *Service) ApplyDomain(ctx context.Context, params controlstate.DomainApplyParams, now time.Time) (ApplyResult, error) {
	domain, changed, err := controlstate.ApplyDomain(ctx, s.store, params, now)
	if err != nil {
		return ApplyResult{}, err
	}
	return ApplyResult{Domain: domain, Changed: changed}, nil
}

func (s *Service) DeactivateDomain(ctx context.Context, params controlstate.DomainDeactivateParams, now time.Time) (DeactivateResult, error) {
	domain, changed, err := controlstate.DeactivateDomain(ctx, s.store, params, now)
	if err != nil {
		return DeactivateResult{}, err
	}
	return DeactivateResult{Domain: domain, Changed: changed}, nil
}

func (s *Service) ReprovisionDomain(ctx context.Context, params controlstate.DomainReprovisionParams, now time.Time) (ReprovisionResult, error) {
	domain, err := controlstate.ReprovisionDomain(ctx, s.store, params, now)
	if err != nil {
		return ReprovisionResult{}, err
	}
	return ReprovisionResult{Domain: domain}, nil
}

func statusFromOK(ok bool) string {
	if ok {
		return "applied"
	}
	return "failed"
}

func feedbackChanged(result wildduckprovisioner.Result) bool {
	for _, domain := range result.Domains {
		if domain.Changed {
			return true
		}
	}
	return false
}

func cloudflareChanged(result cloudflareprovisioner.ProvisionResult) bool {
	for _, domain := range result.Domains {
		if domain.Applied || len(domain.DeletedRules) > 0 {
			return true
		}
	}
	return false
}
