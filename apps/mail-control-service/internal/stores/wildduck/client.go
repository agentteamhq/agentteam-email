package wildduck

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"time"
)

type Client struct {
	baseURL     string
	accessToken string
	httpClient  *http.Client
}

type ResolveAddressResult struct {
	ID      string   `json:"id"`
	Address string   `json:"address"`
	User    string   `json:"user"`
	Targets []string `json:"targets,omitempty"`
}

type Mailbox struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Path       string `json:"path"`
	SpecialUse string `json:"specialUse"`
}

type MessageSummary struct {
	ID        int            `json:"id"`
	Mailbox   string         `json:"mailbox"`
	MessageID string         `json:"messageId"`
	Subject   string         `json:"subject"`
	Headers   map[string]any `json:"headers,omitempty"`
}

type UploadResult struct {
	Success bool `json:"success"`
	Message struct {
		ID      int    `json:"id"`
		Mailbox string `json:"mailbox"`
		Size    int    `json:"size"`
	} `json:"message"`
}

type errorEnvelope struct {
	Success bool   `json:"success"`
	Error   string `json:"error"`
	Code    string `json:"code"`
}

type APIError struct {
	Method     string
	Path       string
	StatusCode int
	Status     string
	Message    string
	Code       string
}

func (e *APIError) Error() string {
	if e.Message != "" {
		return fmt.Sprintf("wildduck %s %s: %s (%s)", e.Method, e.Path, e.Message, e.Code)
	}
	return fmt.Sprintf("wildduck %s %s: unexpected status %s", e.Method, e.Path, e.Status)
}

func IsNotFound(err error) bool {
	var apiErr *APIError
	if !errors.As(err, &apiErr) {
		return false
	}
	return apiErr.StatusCode == http.StatusNotFound || strings.EqualFold(apiErr.Code, "NotFound") || strings.EqualFold(apiErr.Code, "AddressNotFound")
}

func New(baseURL string, accessToken string) (*Client, error) {
	if baseURL == "" {
		return nil, fmt.Errorf("missing wildduck api base url")
	}
	if accessToken == "" {
		return nil, fmt.Errorf("missing wildduck access token")
	}

	return &Client{
		baseURL:     strings.TrimRight(baseURL, "/"),
		accessToken: accessToken,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}, nil
}

func (c *Client) ResolveAddress(ctx context.Context, address string) (ResolveAddressResult, error) {
	if address == "" {
		return ResolveAddressResult{}, fmt.Errorf("missing mailbox address")
	}

	var result ResolveAddressResult
	path, err := wildduckPath("addresses", "resolve", address)
	if err != nil {
		return ResolveAddressResult{}, err
	}
	if err := c.doJSON(ctx, http.MethodGet, path, nil, nil, &result); err != nil {
		return ResolveAddressResult{}, err
	}
	return result, nil
}

func (c *Client) ListMailboxes(ctx context.Context, userID string, specialUseOnly bool) ([]Mailbox, error) {
	if userID == "" {
		return nil, fmt.Errorf("missing user id")
	}

	path, err := wildduckPath("users", userID, "mailboxes")
	if err != nil {
		return nil, err
	}
	query := url.Values{}
	if specialUseOnly {
		query.Set("specialUse", "true")
	}

	var response struct {
		Success bool      `json:"success"`
		Results []Mailbox `json:"results"`
	}
	if err := c.doJSON(ctx, http.MethodGet, path, query, nil, &response); err != nil {
		return nil, err
	}

	return response.Results, nil
}

func (c *Client) ListMessages(ctx context.Context, userID string, mailboxID string, includeHeaders []string) ([]MessageSummary, error) {
	if userID == "" {
		return nil, fmt.Errorf("missing user id")
	}
	if mailboxID == "" {
		return nil, fmt.Errorf("missing mailbox id")
	}

	query := url.Values{
		"limit": {"50"},
		"order": {"desc"},
	}
	if len(includeHeaders) > 0 {
		headerKeys := make([]string, 0, len(includeHeaders))
		for _, header := range includeHeaders {
			normalized := strings.ToLower(strings.TrimSpace(header))
			if normalized == "" {
				return nil, fmt.Errorf("includeHeaders contains an empty header name")
			}
			headerKeys = append(headerKeys, normalized)
		}
		slices.Sort(headerKeys)
		query.Set("includeHeaders", strings.Join(headerKeys, ","))
	}
	path, err := wildduckPath("users", userID, "mailboxes", mailboxID, "messages")
	if err != nil {
		return nil, err
	}

	var response struct {
		Success bool             `json:"success"`
		Results []MessageSummary `json:"results"`
	}
	if err := c.doJSON(ctx, http.MethodGet, path, query, nil, &response); err != nil {
		return nil, err
	}

	return response.Results, nil
}

func (c *Client) FetchMessageSource(ctx context.Context, userID string, mailboxID string, uid int) ([]byte, error) {
	if userID == "" {
		return nil, fmt.Errorf("missing user id")
	}
	if mailboxID == "" {
		return nil, fmt.Errorf("missing mailbox id")
	}
	if uid <= 0 {
		return nil, fmt.Errorf("missing message uid")
	}

	path, err := wildduckPath("users", userID, "mailboxes", mailboxID, "messages", strconv.Itoa(uid), "message.eml")
	if err != nil {
		return nil, err
	}
	requestURL, err := c.requestURL(path, nil)
	if err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return nil, fmt.Errorf("build wildduck source fetch %s: %w", path, err)
	}
	request.Header.Set("Accept", "message/rfc822")
	request.Header.Set("X-Access-Token", c.accessToken)

	response, err := c.httpClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf("wildduck source fetch %s: %w", path, err)
	}
	defer response.Body.Close()

	data, err := io.ReadAll(response.Body)
	if err != nil {
		return nil, fmt.Errorf("read wildduck source fetch response %s: %w", path, err)
	}
	if response.StatusCode >= 400 {
		var failure errorEnvelope
		if json.Unmarshal(data, &failure) == nil && failure.Error != "" {
			return nil, &APIError{
				Method:     http.MethodGet,
				Path:       path,
				StatusCode: response.StatusCode,
				Status:     response.Status,
				Message:    failure.Error,
				Code:       failure.Code,
			}
		}
		return nil, &APIError{
			Method:     http.MethodGet,
			Path:       path,
			StatusCode: response.StatusCode,
			Status:     response.Status,
		}
	}
	return data, nil
}

func (c *Client) UploadRawMessage(ctx context.Context, userID string, mailboxID string, raw []byte, unseen bool) (UploadResult, error) {
	if userID == "" {
		return UploadResult{}, fmt.Errorf("missing user id")
	}
	if mailboxID == "" {
		return UploadResult{}, fmt.Errorf("missing mailbox id")
	}
	if len(raw) == 0 {
		return UploadResult{}, fmt.Errorf("refusing to upload empty raw message")
	}
	if unseen {
		return UploadResult{}, fmt.Errorf("wildduck raw uploads do not support unseen=true in the current client path")
	}

	var result UploadResult
	path, err := wildduckPath("users", userID, "mailboxes", mailboxID, "messages")
	if err != nil {
		return UploadResult{}, err
	}
	if err := c.doRawUpload(ctx, http.MethodPost, path, raw, &result); err != nil {
		return UploadResult{}, err
	}
	if !result.Success {
		return UploadResult{}, fmt.Errorf("wildduck upload to mailbox %s for user %s did not report success", mailboxID, userID)
	}
	return result, nil
}

func (c *Client) doJSON(ctx context.Context, method string, path string, query url.Values, requestBody any, responseBody any) error {
	var body io.Reader
	if requestBody != nil {
		encoded, err := json.Marshal(requestBody)
		if err != nil {
			return fmt.Errorf("marshal wildduck request %s %s: %w", method, path, err)
		}
		body = bytes.NewReader(encoded)
	}

	requestURL, err := c.requestURL(path, query)
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, method, requestURL, body)
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

	if response.StatusCode >= 400 {
		var failure errorEnvelope
		if json.Unmarshal(data, &failure) == nil && failure.Error != "" {
			return &APIError{
				Method:     method,
				Path:       path,
				StatusCode: response.StatusCode,
				Status:     response.Status,
				Message:    failure.Error,
				Code:       failure.Code,
			}
		}
		return &APIError{
			Method:     method,
			Path:       path,
			StatusCode: response.StatusCode,
			Status:     response.Status,
		}
	}

	if responseBody == nil {
		return nil
	}
	if err := json.Unmarshal(data, responseBody); err != nil {
		return fmt.Errorf("decode wildduck response %s %s: %w", method, path, err)
	}

	return nil
}

func (c *Client) doRawUpload(ctx context.Context, method string, path string, raw []byte, responseBody any) error {
	requestURL, err := c.requestURL(path, nil)
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, method, requestURL, bytes.NewReader(raw))
	if err != nil {
		return fmt.Errorf("build wildduck raw upload %s %s: %w", method, path, err)
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Content-Type", "message/rfc822")
	request.Header.Set("X-Access-Token", c.accessToken)

	response, err := c.httpClient.Do(request)
	if err != nil {
		return fmt.Errorf("wildduck raw upload %s %s: %w", method, path, err)
	}
	defer response.Body.Close()

	data, err := io.ReadAll(response.Body)
	if err != nil {
		return fmt.Errorf("read wildduck raw upload response %s %s: %w", method, path, err)
	}

	if response.StatusCode >= 400 {
		var failure errorEnvelope
		if json.Unmarshal(data, &failure) == nil && failure.Error != "" {
			return fmt.Errorf("wildduck raw upload %s %s: %s (%s)", method, path, failure.Error, failure.Code)
		}
		return fmt.Errorf("wildduck raw upload %s %s: unexpected status %s", method, path, response.Status)
	}

	if responseBody == nil {
		return nil
	}
	if err := json.Unmarshal(data, responseBody); err != nil {
		return fmt.Errorf("decode wildduck raw upload response %s %s: %w", method, path, err)
	}

	return nil
}

func (c *Client) requestURL(requestPath string, query url.Values) (string, error) {
	requestURL, err := url.JoinPath(c.baseURL, strings.TrimPrefix(requestPath, "/"))
	if err != nil {
		return "", fmt.Errorf("build wildduck URL %s: %w", requestPath, err)
	}
	parsed, err := url.Parse(requestURL)
	if err != nil {
		return "", fmt.Errorf("parse wildduck URL %s: %w", requestPath, err)
	}
	if len(query) > 0 {
		parsed.RawQuery = query.Encode()
	}
	return parsed.String(), nil
}

func wildduckPath(elements ...string) (string, error) {
	escaped := make([]string, 0, len(elements))
	for _, element := range elements {
		escaped = append(escaped, url.PathEscape(element))
	}
	return url.JoinPath("/", escaped...)
}
