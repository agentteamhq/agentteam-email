package wildduckprovisioner

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"agent-mail/internal/control/controlstate"
	"agent-mail/internal/mail/structured"
)

var errNotFound = errors.New("wildduck resource not found")

type Config struct {
	APIBaseURL      string
	AdminToken      string
	PrimaryUsername string
	Password        string
	DisplayName     string
	SpamLevel       int
}

type Service struct {
	cfg        Config
	baseURL    *url.URL
	httpClient *http.Client
}

type Result struct {
	OK      bool           `json:"ok"`
	Domains []DomainResult `json:"domains"`
	Issues  []string       `json:"issues,omitempty"`
}

type StatusResult struct {
	OK      bool                   `json:"ok"`
	Config  RuntimeConfigStatus    `json:"config"`
	Domains []FeedbackDomainStatus `json:"domains"`
	Issues  []string               `json:"issues,omitempty"`
}

type RuntimeConfigStatus struct {
	APIBaseURL string `json:"api_base_url"`
	Configured bool   `json:"configured"`
}

type FeedbackDomainStatus struct {
	Domain          string   `json:"domain"`
	FeedbackAddress string   `json:"feedback_address"`
	UserID          string   `json:"user_id,omitempty"`
	Exists          bool     `json:"exists"`
	OK              bool     `json:"ok"`
	Issues          []string `json:"issues,omitempty"`
}

type DomainResult struct {
	Domain          string `json:"domain"`
	FeedbackAddress string `json:"feedback_address"`
	UserID          string `json:"user_id,omitempty"`
	Action          string `json:"action"`
	Changed         bool   `json:"changed"`
	Error           string `json:"error,omitempty"`
}

func New(cfg Config) (*Service, error) {
	if cfg.APIBaseURL == "" {
		return nil, fmt.Errorf("missing WildDuck API base URL")
	}
	baseURL, err := url.Parse(cfg.APIBaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse WildDuck API base URL: %w", err)
	}
	if baseURL.Scheme == "" || baseURL.Host == "" {
		return nil, fmt.Errorf("WildDuck API base URL must include scheme and host")
	}
	if cfg.AdminToken == "" {
		return nil, fmt.Errorf("missing WildDuck admin token")
	}
	if cfg.Password == "" {
		return nil, fmt.Errorf("missing primary feedback mailbox password")
	}
	if cfg.DisplayName == "" {
		return nil, fmt.Errorf("missing primary feedback mailbox display name")
	}
	return &Service{
		cfg:     cfg,
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}, nil
}

func (s *Service) EnsureFeedback(ctx context.Context, records []controlstate.DomainRecord, now time.Time) (Result, error) {
	_ = now
	result := Result{OK: true, Domains: make([]DomainResult, 0, len(records))}
	if len(records) == 0 {
		return result, nil
	}
	userID, _, err := s.ensurePrimaryMailbox(ctx, records)
	if err != nil {
		return Result{}, err
	}
	for _, record := range records {
		item := DomainResult{
			Domain:          record.Domain,
			FeedbackAddress: record.FeedbackAddress,
			UserID:          userID,
			Action:          "unchanged",
		}
		changed, err := s.ensureAddress(ctx, userID, record.FeedbackAddress)
		if err != nil {
			item.Error = err.Error()
			item.Action = "failed"
			result.OK = false
			result.Issues = append(result.Issues, "feedback_address_failed")
			result.Domains = append(result.Domains, item)
			continue
		}
		if changed {
			item.Action = "created_alias"
			item.Changed = true
		}
		result.Domains = append(result.Domains, item)
	}
	return result, nil
}

func (s *Service) Status(ctx context.Context, records []controlstate.DomainRecord) StatusResult {
	result := StatusResult{
		OK: true,
		Config: RuntimeConfigStatus{
			APIBaseURL: s.cfg.APIBaseURL,
			Configured: s.cfg.APIBaseURL != "" && s.cfg.AdminToken != "",
		},
		Domains: make([]FeedbackDomainStatus, 0, len(records)),
	}
	if !result.Config.Configured {
		result.OK = false
		result.Issues = append(result.Issues, "wildduck_api_not_configured")
		return result
	}
	for _, record := range records {
		status := FeedbackDomainStatus{
			Domain:          record.Domain,
			FeedbackAddress: record.FeedbackAddress,
			OK:              true,
		}
		if record.FeedbackAddress == "" {
			status.OK = false
			status.Issues = append(status.Issues, "feedback_address_missing")
		} else {
			userID, err := s.resolveAddress(ctx, record.FeedbackAddress)
			switch {
			case err == nil:
				status.Exists = true
				status.UserID = userID
			case errors.Is(err, errNotFound):
				status.OK = false
				status.Issues = append(status.Issues, "feedback_address_not_found")
			default:
				status.OK = false
				status.Issues = append(status.Issues, "feedback_address_lookup_failed: "+err.Error())
			}
		}
		if !status.OK {
			result.OK = false
			result.Issues = append(result.Issues, "one_or_more_feedback_addresses_not_ready")
		}
		result.Domains = append(result.Domains, status)
	}
	return result
}

func (s *Service) ensurePrimaryMailbox(ctx context.Context, records []controlstate.DomainRecord) (string, bool, error) {
	primary, err := s.primaryMailbox(records)
	if err != nil {
		return "", false, err
	}
	userID, err := s.resolvePrimary(ctx, primary)
	if err == nil {
		if err := s.updateUser(ctx, userID, userConfig{
			Password:  s.cfg.Password,
			Name:      s.cfg.DisplayName,
			SpamLevel: s.cfg.SpamLevel,
		}); err != nil {
			return "", false, err
		}
		return userID, false, nil
	}
	if !errors.Is(err, errNotFound) {
		return "", false, err
	}
	userID, err = s.createUser(ctx, userConfig{
		Username:     primary.Username,
		Address:      primary.Address,
		Password:     s.cfg.Password,
		Name:         s.cfg.DisplayName,
		SpamLevel:    s.cfg.SpamLevel,
		EmptyAddress: primary.Address == "",
	})
	if err != nil {
		return "", false, err
	}
	return userID, true, nil
}

type primaryMailbox struct {
	Username string
	Address  string
}

func (s *Service) primaryMailbox(records []controlstate.DomainRecord) (primaryMailbox, error) {
	if s.cfg.PrimaryUsername != "" {
		if mailbox, err := structured.ParseMailbox(s.cfg.PrimaryUsername); err == nil {
			return primaryMailbox{Username: mailbox.LocalPart, Address: mailbox.Address}, nil
		}
		return primaryMailbox{Username: s.cfg.PrimaryUsername}, nil
	}
	if len(records) == 0 {
		return primaryMailbox{}, fmt.Errorf("feedback mailbox requires at least one active domain")
	}
	mailbox, err := structured.ParseMailbox(records[0].FeedbackAddress)
	if err != nil {
		return primaryMailbox{}, fmt.Errorf("primary feedback address: %w", err)
	}
	return primaryMailbox{Username: mailbox.LocalPart, Address: mailbox.Address}, nil
}

func (s *Service) resolvePrimary(ctx context.Context, primary primaryMailbox) (string, error) {
	if primary.Address != "" {
		return s.resolveAddress(ctx, primary.Address)
	}
	return s.resolveUser(ctx, primary.Username)
}

func (s *Service) ensureAddress(ctx context.Context, userID string, address string) (bool, error) {
	mailbox, err := structured.ParseMailbox(address)
	if err != nil {
		return false, err
	}
	existingUserID, err := s.resolveAddress(ctx, mailbox.Address)
	if err == nil {
		if existingUserID != userID {
			return false, fmt.Errorf("feedback address %q belongs to unexpected WildDuck user %q", mailbox.Address, existingUserID)
		}
		return false, nil
	}
	if !errors.Is(err, errNotFound) {
		return false, err
	}
	if err := s.addAddress(ctx, userID, mailbox.Address); err != nil {
		return false, err
	}
	return true, nil
}

type userConfig struct {
	Username     string
	Address      string
	Password     string
	Name         string
	SpamLevel    int
	EmptyAddress bool
}

func (s *Service) resolveUser(ctx context.Context, username string) (string, error) {
	var result struct {
		ID string `json:"id"`
	}
	if err := s.doJSON(ctx, http.MethodGet, []string{"users", "resolve", username}, nil, &result); err != nil {
		return "", err
	}
	if result.ID == "" {
		return "", fmt.Errorf("WildDuck resolve user %q returned empty id", username)
	}
	return result.ID, nil
}

func (s *Service) resolveAddress(ctx context.Context, address string) (string, error) {
	var result struct {
		User string `json:"user"`
	}
	if err := s.doJSON(ctx, http.MethodGet, []string{"addresses", "resolve", address}, nil, &result); err != nil {
		return "", err
	}
	if result.User == "" {
		return "", fmt.Errorf("WildDuck resolve address %q returned empty user id", address)
	}
	return result.User, nil
}

func (s *Service) createUser(ctx context.Context, cfg userConfig) (string, error) {
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
	if err := s.doJSON(ctx, http.MethodPost, []string{"users"}, payload, &result); err != nil {
		return "", err
	}
	if result.ID == "" {
		return "", fmt.Errorf("WildDuck create user %q returned empty id", cfg.Address)
	}
	return result.ID, nil
}

func (s *Service) updateUser(ctx context.Context, userID string, cfg userConfig) error {
	payload := map[string]any{
		"password":    cfg.Password,
		"name":        cfg.Name,
		"spamLevel":   cfg.SpamLevel,
		"allowUnsafe": true,
	}
	return s.doJSON(ctx, http.MethodPut, []string{"users", userID}, payload, nil)
}

func (s *Service) addAddress(ctx context.Context, userID string, address string) error {
	payload := map[string]any{"address": address}
	return s.doJSON(ctx, http.MethodPost, []string{"users", userID, "addresses"}, payload, nil)
}

func (s *Service) doJSON(ctx context.Context, method string, pathSegments []string, requestBody any, responseBody any) error {
	endpoint := s.baseURL.JoinPath(pathSegments...)
	var body io.Reader
	if requestBody != nil {
		encoded, err := json.Marshal(requestBody)
		if err != nil {
			return fmt.Errorf("marshal WildDuck request: %w", err)
		}
		body = bytes.NewReader(encoded)
	}
	request, err := http.NewRequestWithContext(ctx, method, endpoint.String(), body)
	if err != nil {
		return fmt.Errorf("build WildDuck request: %w", err)
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("X-Access-Token", s.cfg.AdminToken)
	if requestBody != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	response, err := s.httpClient.Do(request)
	if err != nil {
		return fmt.Errorf("WildDuck request: %w", err)
	}
	defer response.Body.Close()
	data, err := io.ReadAll(response.Body)
	if err != nil {
		return fmt.Errorf("read WildDuck response: %w", err)
	}
	if response.StatusCode == http.StatusNotFound {
		return errNotFound
	}
	if response.StatusCode >= 400 {
		var failure struct {
			Error string `json:"error"`
			Code  string `json:"code"`
		}
		if json.Unmarshal(data, &failure) == nil && failure.Error != "" {
			return fmt.Errorf("WildDuck %s failed: %s (%s)", method, failure.Error, failure.Code)
		}
		return fmt.Errorf("WildDuck %s failed: %s", method, response.Status)
	}
	if responseBody == nil {
		return nil
	}
	if err := json.Unmarshal(data, responseBody); err != nil {
		return fmt.Errorf("decode WildDuck response: %w", err)
	}
	return nil
}
