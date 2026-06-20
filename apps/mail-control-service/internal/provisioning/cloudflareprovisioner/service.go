package cloudflareprovisioner

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"slices"
	"time"

	"agent-mail/internal/control/controlstate"
	"agent-mail/internal/mail/structured"
)

const DefaultWorkerScriptName = "agent-mail-ingress"

type Config struct {
	APIBaseURL       string
	AccountID        string
	APIToken         string
	WorkerScriptName string
}

type Service struct {
	cfg        Config
	baseURL    *url.URL
	httpClient *http.Client
	store      controlstate.Store
	missing    []string
}

type CloudflareStatusParams struct{}

type CloudflareProvisionParams struct{}

type StatusResult struct {
	OK      bool                     `json:"ok"`
	Worker  WorkerStatus             `json:"worker"`
	Domains []CloudflareDomainStatus `json:"domains"`
	Issues  []string                 `json:"issues,omitempty"`
	Config  RuntimeAPIConfig         `json:"config"`
}

type ProvisionResult struct {
	OK      bool                    `json:"ok"`
	Domains []DomainProvisionResult `json:"domains"`
	Issues  []string                `json:"issues,omitempty"`
}

type RuntimeAPIConfig struct {
	Configured bool     `json:"configured"`
	Missing    []string `json:"missing,omitempty"`
}

type WorkerStatus struct {
	ScriptName string   `json:"script_name"`
	Exists     bool     `json:"exists"`
	Issues     []string `json:"issues,omitempty"`
}

type CloudflareDomainStatus struct {
	Domain              string        `json:"domain"`
	CloudflareZoneName  string        `json:"cloudflare_zone_name"`
	ZoneID              string        `json:"zone_id,omitempty"`
	OK                  bool          `json:"ok"`
	CatchAllConfigured  bool          `json:"catch_all_configured"`
	CatchAllRule        RuleSummary   `json:"catch_all_rule,omitempty"`
	RegularRules        []RuleSummary `json:"regular_rules,omitempty"`
	Issues              []string      `json:"issues,omitempty"`
	LastProvisionStatus string        `json:"last_provision_status,omitempty"`
	LastProvisionAt     *time.Time    `json:"last_provision_at,omitempty"`
	LastProvisionError  string        `json:"last_provision_error,omitempty"`
}

type DomainProvisionResult struct {
	Domain             string        `json:"domain"`
	CloudflareZoneName string        `json:"cloudflare_zone_name"`
	ZoneID             string        `json:"zone_id,omitempty"`
	Applied            bool          `json:"applied"`
	DeletedRules       []RuleSummary `json:"deleted_rules,omitempty"`
	CatchAllRule       RuleSummary   `json:"catch_all_rule,omitempty"`
	Issues             []string      `json:"issues,omitempty"`
	Error              string        `json:"error,omitempty"`
}

type RuleSummary struct {
	ID       string        `json:"id,omitempty"`
	Name     string        `json:"name,omitempty"`
	Enabled  bool          `json:"enabled"`
	Actions  []RuleAction  `json:"actions,omitempty"`
	Matchers []RuleMatcher `json:"matchers,omitempty"`
}

type RuleAction struct {
	Type  string   `json:"type,omitempty"`
	Value []string `json:"value,omitempty"`
}

type RuleMatcher struct {
	Type string `json:"type,omitempty"`
}

type cloudflareRule struct {
	ID       string          `json:"id,omitempty"`
	Name     string          `json:"name,omitempty"`
	Enabled  bool            `json:"enabled"`
	Actions  []RuleAction    `json:"actions,omitempty"`
	Matchers []RuleMatcher   `json:"matchers,omitempty"`
	Raw      json.RawMessage `json:"-"`
}

type cloudflareEnvelope[T any] struct {
	Success bool              `json:"success"`
	Result  T                 `json:"result"`
	Errors  []cloudflareError `json:"errors"`
}

type cloudflareError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type APIError struct {
	Method string
	URL    string
	Status string
	Code   int
	Detail string
}

func (e APIError) Error() string {
	if e.Detail != "" {
		return fmt.Sprintf("cloudflare %s %s failed: %s", e.Method, e.URL, e.Detail)
	}
	return fmt.Sprintf("cloudflare %s %s failed: %s", e.Method, e.URL, e.Status)
}

func NewFromEnv(store controlstate.Store) (*Service, error) {
	cfg := Config{
		APIBaseURL:       os.Getenv("AGENT_MAIL_CLOUDFLARE_API_BASE_URL"),
		AccountID:        os.Getenv("AGENT_MAIL_CLOUDFLARE_ACCOUNT_ID"),
		APIToken:         os.Getenv("AGENT_MAIL_CLOUDFLARE_API_TOKEN"),
		WorkerScriptName: os.Getenv("AGENT_MAIL_CLOUDFLARE_WORKER_SCRIPT_NAME"),
	}
	if cfg.WorkerScriptName == "" {
		cfg.WorkerScriptName = DefaultWorkerScriptName
	}
	return New(cfg, store)
}

func New(cfg Config, store controlstate.Store) (*Service, error) {
	if store == nil {
		return nil, fmt.Errorf("missing control state store")
	}
	if cfg.WorkerScriptName == "" {
		cfg.WorkerScriptName = DefaultWorkerScriptName
	}
	missing := missingConfig(cfg)
	if len(missing) > 0 {
		return &Service{cfg: cfg, store: store, missing: missing}, nil
	}
	baseURL, err := url.Parse(cfg.APIBaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse Cloudflare API base URL: %w", err)
	}
	if baseURL.Scheme == "" || baseURL.Host == "" {
		return nil, fmt.Errorf("Cloudflare API base URL must include scheme and host")
	}
	scriptName, err := requiredPlainValue(cfg.WorkerScriptName, "Cloudflare Worker script name")
	if err != nil {
		return nil, err
	}
	return &Service{
		cfg: Config{
			APIBaseURL:       cfg.APIBaseURL,
			AccountID:        cfg.AccountID,
			APIToken:         cfg.APIToken,
			WorkerScriptName: scriptName,
		},
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		store: store,
	}, nil
}

func (s *Service) Status(ctx context.Context, params CloudflareStatusParams) (StatusResult, error) {
	result := StatusResult{
		Worker: WorkerStatus{ScriptName: s.cfg.WorkerScriptName},
		Config: s.runtimeAPIConfig(),
	}
	if !result.Config.Configured {
		result.Issues = append(result.Issues, "cloudflare_api_not_configured")
		return result.withOK(), nil
	}

	worker, err := s.workerStatus(ctx)
	if err != nil {
		return StatusResult{}, err
	}
	result.Worker = worker
	if !worker.Exists {
		result.Issues = append(result.Issues, "worker_missing")
	}

	records, err := controlstate.ActiveDomainRecords(ctx, s.store, nil)
	if err != nil {
		return StatusResult{}, err
	}
	result.Domains = make([]CloudflareDomainStatus, 0, len(records))
	for _, record := range records {
		status, err := s.domainStatus(ctx, record)
		if err != nil {
			status = CloudflareDomainStatus{
				Domain:             record.Domain,
				CloudflareZoneName: record.CloudflareZoneName,
				Issues:             []string{err.Error()},
			}
		}
		result.Domains = append(result.Domains, status)
	}
	return result.withOK(), nil
}

func (s *Service) Provision(ctx context.Context, params CloudflareProvisionParams, now time.Time) (ProvisionResult, error) {
	// Cloudflare routing reads the service-owned active-domain config. The
	// caller triggers the primitive; it must not pass a second domain desired
	// state that can drift from the Mail Control Service ConfigMap.
	records, err := controlstate.ActiveDomainRecords(ctx, s.store, nil)
	if err != nil {
		return ProvisionResult{}, err
	}
	if len(records) == 0 {
		return ProvisionResult{}, fmt.Errorf("no active domains in service-owned domain config")
	}
	if !s.runtimeAPIConfig().Configured {
		return ProvisionResult{}, fmt.Errorf("Cloudflare API is not configured: missing %v", s.missing)
	}
	worker, err := s.workerStatus(ctx)
	if err != nil {
		return ProvisionResult{}, err
	}
	if !worker.Exists {
		return ProvisionResult{}, fmt.Errorf("Cloudflare Worker %q does not exist", s.cfg.WorkerScriptName)
	}
	result := ProvisionResult{OK: true, Domains: make([]DomainProvisionResult, 0, len(records))}
	for _, record := range records {
		applied := s.provisionDomain(ctx, record, now)
		if len(applied.Issues) > 0 || applied.Error != "" {
			result.OK = false
		}
		result.Domains = append(result.Domains, applied)
	}
	if !result.OK {
		result.Issues = append(result.Issues, "one_or_more_domains_failed")
	}
	return result, nil
}

func (s *Service) provisionDomain(ctx context.Context, record controlstate.DomainRecord, now time.Time) DomainProvisionResult {
	result := DomainProvisionResult{
		Domain:             record.Domain,
		CloudflareZoneName: record.CloudflareZoneName,
	}
	if !record.AuthoritativeRouting {
		result.Issues = append(result.Issues, "authoritative_routing_disabled")
		return result
	}
	zoneID, err := s.resolveZoneID(ctx, record.CloudflareZoneName)
	if err != nil {
		result.Error = err.Error()
		_ = s.recordProvisionError(ctx, record, result.Error, now)
		return result
	}
	result.ZoneID = zoneID

	catchAll, err := s.putCatchAllRule(ctx, zoneID)
	if err != nil {
		result.Error = err.Error()
		_ = s.recordProvisionError(ctx, record, result.Error, now)
		return result
	}
	result.CatchAllRule = summarizeRule(catchAll)

	rules, err := s.listRules(ctx, zoneID)
	if err != nil {
		result.Error = err.Error()
		_ = s.recordProvisionError(ctx, record, result.Error, now)
		return result
	}
	for _, rule := range rules {
		if isCatchAllWorkerRule(rule, s.cfg.WorkerScriptName) {
			continue
		}
		if err := s.deleteRule(ctx, zoneID, rule.ID); err != nil {
			result.Error = err.Error()
			_ = s.recordProvisionError(ctx, record, result.Error, now)
			return result
		}
		result.DeletedRules = append(result.DeletedRules, summarizeRule(rule))
	}
	result.Applied = true
	provisionedAt := now.UTC()
	_, err = controlstate.RecordCloudflareProvision(ctx, s.store, record.Domain, controlstate.CloudflareProvision{
		ZoneName:            record.CloudflareZoneName,
		ZoneID:              zoneID,
		CatchAllRuleID:      catchAll.ID,
		CatchAllEnabled:     isCatchAllWorkerRule(catchAll, s.cfg.WorkerScriptName),
		DeletedRegularRules: len(result.DeletedRules),
		LastProvisionStatus: "applied",
		LastProvisionAt:     &provisionedAt,
	}, now)
	if err != nil {
		result.Applied = false
		result.Error = err.Error()
	}
	return result
}

func (s *Service) domainStatus(ctx context.Context, record controlstate.DomainRecord) (CloudflareDomainStatus, error) {
	status := CloudflareDomainStatus{
		Domain:              record.Domain,
		CloudflareZoneName:  record.CloudflareZoneName,
		LastProvisionStatus: record.CloudflareProvision.LastProvisionStatus,
		LastProvisionAt:     record.CloudflareProvision.LastProvisionAt,
		LastProvisionError:  record.CloudflareProvision.LastProvisionError,
	}
	zoneID, err := s.resolveZoneID(ctx, record.CloudflareZoneName)
	if err != nil {
		return status, err
	}
	status.ZoneID = zoneID
	catchAll, err := s.getCatchAllRule(ctx, zoneID)
	if err != nil {
		return status, err
	}
	status.CatchAllRule = summarizeRule(catchAll)
	status.CatchAllConfigured = isCatchAllWorkerRule(catchAll, s.cfg.WorkerScriptName)
	if !status.CatchAllConfigured {
		status.Issues = append(status.Issues, "catch_all_worker_route_missing")
	}
	rules, err := s.listRules(ctx, zoneID)
	if err != nil {
		return status, err
	}
	for _, rule := range rules {
		if isCatchAllWorkerRule(rule, s.cfg.WorkerScriptName) {
			continue
		}
		status.RegularRules = append(status.RegularRules, summarizeRule(rule))
	}
	if len(status.RegularRules) > 0 {
		status.Issues = append(status.Issues, "non_catch_all_rules_remain")
	}
	if record.AuthoritativeRouting && record.CloudflareProvision.LastProvisionAt == nil {
		status.Issues = append(status.Issues, "cloudflare_provision_not_run")
	}
	if record.CloudflareProvision.LastProvisionError != "" {
		status.Issues = append(status.Issues, "cloudflare_provision_failed")
	}
	status.OK = len(status.Issues) == 0
	return status, nil
}

func (s *Service) recordProvisionError(ctx context.Context, record controlstate.DomainRecord, detail string, now time.Time) error {
	failedAt := now.UTC()
	_, err := controlstate.RecordCloudflareProvision(ctx, s.store, record.Domain, controlstate.CloudflareProvision{
		ZoneName:             record.CloudflareZoneName,
		LastProvisionStatus:  "failed",
		LastProvisionAt:      &failedAt,
		LastProvisionError:   detail,
		LastStatusObservedAt: record.CloudflareProvision.LastStatusObservedAt,
		LastStatusOK:         record.CloudflareProvision.LastStatusOK,
		LastStatusIssueCount: record.CloudflareProvision.LastStatusIssueCount,
	}, now)
	return err
}

func (s *Service) workerStatus(ctx context.Context) (WorkerStatus, error) {
	var raw json.RawMessage
	err := s.do(ctx, http.MethodGet, []string{"accounts", s.cfg.AccountID, "workers", "scripts", s.cfg.WorkerScriptName, "settings"}, nil, nil, &raw)
	status := WorkerStatus{ScriptName: s.cfg.WorkerScriptName, Exists: true}
	if err == nil {
		return status, nil
	}
	var apiErr APIError
	if errors.As(err, &apiErr) && apiErr.Code == http.StatusNotFound {
		status.Exists = false
		status.Issues = append(status.Issues, "worker_missing")
		return status, nil
	}
	return WorkerStatus{}, err
}

func (s *Service) resolveZoneID(ctx context.Context, zoneName string) (string, error) {
	canonical, err := structured.CanonicalDomain(zoneName)
	if err != nil {
		return "", fmt.Errorf("zone name: %w", err)
	}
	if canonical == "" {
		return "", fmt.Errorf("zone name is required")
	}
	query := url.Values{}
	query.Set("name", canonical)
	var zones []struct {
		ID string `json:"id"`
	}
	if err := s.do(ctx, http.MethodGet, []string{"zones"}, query, nil, &zones); err != nil {
		return "", err
	}
	if len(zones) == 0 {
		return "", fmt.Errorf("Cloudflare zone %q was not found", canonical)
	}
	if len(zones) > 1 {
		return "", fmt.Errorf("Cloudflare zone %q returned multiple matches", canonical)
	}
	if zones[0].ID == "" {
		return "", fmt.Errorf("Cloudflare zone %q returned an empty id", canonical)
	}
	return zones[0].ID, nil
}

func (s *Service) getCatchAllRule(ctx context.Context, zoneID string) (cloudflareRule, error) {
	var rule cloudflareRule
	err := s.do(ctx, http.MethodGet, []string{"zones", zoneID, "email", "routing", "rules", "catch_all"}, nil, nil, &rule)
	return rule, err
}

func (s *Service) putCatchAllRule(ctx context.Context, zoneID string) (cloudflareRule, error) {
	body := struct {
		Actions  []RuleAction  `json:"actions"`
		Enabled  bool          `json:"enabled"`
		Matchers []RuleMatcher `json:"matchers"`
		Name     string        `json:"name"`
	}{
		Actions:  []RuleAction{{Type: "worker", Value: []string{s.cfg.WorkerScriptName}}},
		Enabled:  true,
		Matchers: []RuleMatcher{{Type: "all"}},
		Name:     s.cfg.WorkerScriptName + ":catch-all",
	}
	var rule cloudflareRule
	err := s.do(ctx, http.MethodPut, []string{"zones", zoneID, "email", "routing", "rules", "catch_all"}, nil, body, &rule)
	return rule, err
}

func (s *Service) listRules(ctx context.Context, zoneID string) ([]cloudflareRule, error) {
	var rules []cloudflareRule
	err := s.do(ctx, http.MethodGet, []string{"zones", zoneID, "email", "routing", "rules"}, nil, nil, &rules)
	return rules, err
}

func (s *Service) deleteRule(ctx context.Context, zoneID string, ruleID string) error {
	if ruleID == "" {
		return fmt.Errorf("Cloudflare routing rule id is required for deletion")
	}
	var raw json.RawMessage
	return s.do(ctx, http.MethodDelete, []string{"zones", zoneID, "email", "routing", "rules", ruleID}, nil, nil, &raw)
}

func (s *Service) do(ctx context.Context, method string, segments []string, query url.Values, requestBody any, responseBody any) error {
	endpoint := s.baseURL.JoinPath(segments...)
	if len(query) > 0 {
		endpoint.RawQuery = query.Encode()
	}
	var body io.Reader
	if requestBody != nil {
		encoded, err := json.Marshal(requestBody)
		if err != nil {
			return fmt.Errorf("marshal Cloudflare request: %w", err)
		}
		body = bytes.NewReader(encoded)
	}
	request, err := http.NewRequestWithContext(ctx, method, endpoint.String(), body)
	if err != nil {
		return fmt.Errorf("build Cloudflare request: %w", err)
	}
	request.Header.Set("Authorization", "Bearer "+s.cfg.APIToken)
	request.Header.Set("Accept", "application/json")
	if requestBody != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	response, err := s.httpClient.Do(request)
	if err != nil {
		return fmt.Errorf("Cloudflare request: %w", err)
	}
	defer response.Body.Close()
	responseData, err := io.ReadAll(response.Body)
	if err != nil {
		return fmt.Errorf("read Cloudflare response: %w", err)
	}
	var envelope cloudflareEnvelope[json.RawMessage]
	if len(responseData) > 0 {
		if err := json.Unmarshal(responseData, &envelope); err != nil {
			return fmt.Errorf("decode Cloudflare response: %w", err)
		}
	}
	if response.StatusCode >= 400 || !envelope.Success {
		return APIError{
			Method: method,
			URL:    endpoint.String(),
			Status: response.Status,
			Code:   response.StatusCode,
			Detail: cloudflareErrorDetail(envelope.Errors, response.Status),
		}
	}
	if responseBody != nil && len(envelope.Result) > 0 {
		if err := json.Unmarshal(envelope.Result, responseBody); err != nil {
			return fmt.Errorf("decode Cloudflare result: %w", err)
		}
	}
	return nil
}

func (s *Service) runtimeAPIConfig() RuntimeAPIConfig {
	return RuntimeAPIConfig{
		Configured: len(s.missing) == 0,
		Missing:    append([]string{}, s.missing...),
	}
}

func (result StatusResult) withOK() StatusResult {
	result.OK = len(result.Issues) == 0
	if result.OK {
		for _, domain := range result.Domains {
			if !domain.OK {
				result.OK = false
				break
			}
		}
	}
	return result
}

func missingConfig(cfg Config) []string {
	var missing []string
	if cfg.APIBaseURL == "" {
		missing = append(missing, "AGENT_MAIL_CLOUDFLARE_API_BASE_URL")
	}
	if cfg.AccountID == "" {
		missing = append(missing, "AGENT_MAIL_CLOUDFLARE_ACCOUNT_ID")
	}
	if cfg.APIToken == "" {
		missing = append(missing, "AGENT_MAIL_CLOUDFLARE_API_TOKEN")
	}
	if cfg.WorkerScriptName == "" {
		cfg.WorkerScriptName = DefaultWorkerScriptName
	}
	if cfg.WorkerScriptName == "" {
		missing = append(missing, "AGENT_MAIL_CLOUDFLARE_WORKER_SCRIPT_NAME")
	}
	return missing
}

func cloudflareErrorDetail(errors []cloudflareError, fallback string) string {
	if len(errors) == 0 {
		return fallback
	}
	detail := errors[0].Message
	if errors[0].Code != 0 {
		detail = fmt.Sprintf("%s (%d)", detail, errors[0].Code)
	}
	return detail
}

func isCatchAllWorkerRule(rule cloudflareRule, scriptName string) bool {
	if !rule.Enabled {
		return false
	}
	hasWorkerAction := false
	for _, action := range rule.Actions {
		if action.Type == "worker" && slices.Contains(action.Value, scriptName) {
			hasWorkerAction = true
			break
		}
	}
	if !hasWorkerAction {
		return false
	}
	for _, matcher := range rule.Matchers {
		if matcher.Type == "all" {
			return true
		}
	}
	return false
}

func summarizeRule(rule cloudflareRule) RuleSummary {
	return RuleSummary{
		ID:       rule.ID,
		Name:     rule.Name,
		Enabled:  rule.Enabled,
		Actions:  append([]RuleAction{}, rule.Actions...),
		Matchers: append([]RuleMatcher{}, rule.Matchers...),
	}
}

func requiredPlainValue(value string, field string) (string, error) {
	if value == "" {
		return "", fmt.Errorf("%s is required", field)
	}
	return value, nil
}
