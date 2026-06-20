package cloudflaremail

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

const MaxRequestPayloadBytes = 5 * 1024 * 1024

type Address struct {
	Address string `json:"address"`
	Name    string `json:"name,omitempty"`
}

type Attachment struct {
	Content     string `json:"content"`
	Filename    string `json:"filename"`
	Type        string `json:"type"`
	Disposition string `json:"disposition"`
	ContentID   string `json:"content_id,omitempty"`
}

type SendRequest struct {
	To      []string          `json:"to"`
	CC      []string          `json:"cc,omitempty"`
	BCC     []string          `json:"bcc,omitempty"`
	From    Address           `json:"from"`
	ReplyTo *Address          `json:"reply_to,omitempty"`
	Subject string            `json:"subject"`
	HTML    string            `json:"html,omitempty"`
	Text    string            `json:"text,omitempty"`
	Headers map[string]string `json:"headers,omitempty"`
	Attach  []Attachment      `json:"attachments,omitempty"`
}

type RawSendRequest struct {
	From        string
	Recipients  []string
	MIMEMessage []byte
}

type SendResult struct {
	Delivered        []string `json:"delivered"`
	PermanentBounces []string `json:"permanent_bounces"`
	Queued           []string `json:"queued"`
}

type Client struct {
	baseURL    *url.URL
	accountID  string
	apiToken   string
	httpClient *http.Client
}

func New(baseURL string, accountID string, apiToken string) (*Client, error) {
	if baseURL == "" {
		return nil, fmt.Errorf("missing cloudflare api base url")
	}
	if accountID == "" {
		return nil, fmt.Errorf("missing cloudflare account id")
	}
	if apiToken == "" {
		return nil, fmt.Errorf("missing cloudflare api token")
	}
	parsedBaseURL, err := url.Parse(baseURL)
	if err != nil {
		return nil, fmt.Errorf("parse cloudflare api base url: %w", err)
	}
	if parsedBaseURL.Scheme == "" || parsedBaseURL.Host == "" {
		return nil, fmt.Errorf("cloudflare api base url must include scheme and host")
	}

	return &Client{
		baseURL:   parsedBaseURL,
		accountID: accountID,
		apiToken:  apiToken,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}, nil
}

func (c *Client) Send(ctx context.Context, req SendRequest) (SendResult, error) {
	body, err := BuildPayload(req)
	if err != nil {
		return SendResult{}, err
	}
	return c.SendPayload(ctx, body)
}

func BuildPayload(req SendRequest) ([]byte, error) {
	if len(req.To)+len(req.CC)+len(req.BCC) == 0 {
		return nil, fmt.Errorf("cloudflare send request is missing recipients")
	}
	if req.From.Address == "" {
		return nil, fmt.Errorf("cloudflare send request is missing from address")
	}
	if req.Subject == "" {
		return nil, fmt.Errorf("cloudflare send request is missing subject")
	}
	if req.Text == "" && req.HTML == "" {
		return nil, fmt.Errorf("cloudflare send request is missing text and html bodies")
	}

	type payload struct {
		To          []string          `json:"to"`
		CC          []string          `json:"cc,omitempty"`
		BCC         []string          `json:"bcc,omitempty"`
		From        Address           `json:"from"`
		ReplyTo     *Address          `json:"reply_to,omitempty"`
		Subject     string            `json:"subject"`
		HTML        string            `json:"html,omitempty"`
		Text        string            `json:"text,omitempty"`
		Headers     map[string]string `json:"headers,omitempty"`
		Attachments []Attachment      `json:"attachments,omitempty"`
	}

	body, err := json.Marshal(payload{
		To:          req.To,
		CC:          req.CC,
		BCC:         req.BCC,
		From:        req.From,
		ReplyTo:     req.ReplyTo,
		Subject:     req.Subject,
		HTML:        req.HTML,
		Text:        req.Text,
		Headers:     req.Headers,
		Attachments: req.Attach,
	})
	if err != nil {
		return nil, fmt.Errorf("marshal cloudflare send request: %w", err)
	}
	if len(body) > MaxRequestPayloadBytes {
		return nil, fmt.Errorf("cloudflare send request payload exceeds the %d byte limit", MaxRequestPayloadBytes)
	}
	return body, nil
}

func (c *Client) SendPayload(ctx context.Context, body []byte) (SendResult, error) {
	if len(body) == 0 {
		return SendResult{}, fmt.Errorf("cloudflare send request is missing payload")
	}
	if len(body) > MaxRequestPayloadBytes {
		return SendResult{}, fmt.Errorf("cloudflare send request payload exceeds the %d byte limit", MaxRequestPayloadBytes)
	}
	sendURL := c.baseURL.JoinPath("accounts", c.accountID, "email", "sending", "send")
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, sendURL.String(), bytes.NewReader(body))
	if err != nil {
		return SendResult{}, fmt.Errorf("build cloudflare send request: %w", err)
	}
	request.Header.Set("Authorization", "Bearer "+c.apiToken)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")

	response, err := c.httpClient.Do(request)
	if err != nil {
		return SendResult{}, fmt.Errorf("cloudflare send request: %w", err)
	}
	defer response.Body.Close()

	responseBody, err := io.ReadAll(response.Body)
	if err != nil {
		return SendResult{}, fmt.Errorf("read cloudflare send response: %w", err)
	}

	var envelope struct {
		Success bool `json:"success"`
		Result  struct {
			Delivered        []string `json:"delivered"`
			PermanentBounces []string `json:"permanent_bounces"`
			Queued           []string `json:"queued"`
		} `json:"result"`
		Errors []struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"errors"`
	}
	if err := json.Unmarshal(responseBody, &envelope); err != nil {
		return SendResult{}, fmt.Errorf("decode cloudflare send response: %w", err)
	}

	if response.StatusCode >= 400 || !envelope.Success {
		if len(envelope.Errors) > 0 {
			return SendResult{}, fmt.Errorf("cloudflare send failed: %s (%d)", envelope.Errors[0].Message, envelope.Errors[0].Code)
		}
		return SendResult{}, fmt.Errorf("cloudflare send failed with status %s", response.Status)
	}

	return SendResult{
		Delivered:        envelope.Result.Delivered,
		PermanentBounces: envelope.Result.PermanentBounces,
		Queued:           envelope.Result.Queued,
	}, nil
}

func BuildRawPayload(req RawSendRequest) ([]byte, error) {
	if req.From == "" {
		return nil, fmt.Errorf("cloudflare raw send request is missing from address")
	}
	if len(req.Recipients) == 0 {
		return nil, fmt.Errorf("cloudflare raw send request is missing recipients")
	}
	if len(req.MIMEMessage) == 0 {
		return nil, fmt.Errorf("cloudflare raw send request is missing mime message")
	}

	type payload struct {
		From        string   `json:"from"`
		MIMEMessage string   `json:"mime_message"`
		Recipients  []string `json:"recipients"`
	}
	body, err := json.Marshal(payload{
		From:        req.From,
		MIMEMessage: string(req.MIMEMessage),
		Recipients:  req.Recipients,
	})
	if err != nil {
		return nil, fmt.Errorf("marshal cloudflare raw send request: %w", err)
	}
	if len(body) > MaxRequestPayloadBytes {
		return nil, fmt.Errorf("cloudflare raw send request payload exceeds the %d byte limit", MaxRequestPayloadBytes)
	}
	return body, nil
}

func (c *Client) SendRawPayload(ctx context.Context, body []byte) (SendResult, error) {
	if len(body) == 0 {
		return SendResult{}, fmt.Errorf("cloudflare raw send request is missing payload")
	}
	if len(body) > MaxRequestPayloadBytes {
		return SendResult{}, fmt.Errorf("cloudflare raw send request payload exceeds the %d byte limit", MaxRequestPayloadBytes)
	}
	sendURL := c.baseURL.JoinPath("accounts", c.accountID, "email", "sending", "send_raw")
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, sendURL.String(), bytes.NewReader(body))
	if err != nil {
		return SendResult{}, fmt.Errorf("build cloudflare raw send request: %w", err)
	}
	request.Header.Set("Authorization", "Bearer "+c.apiToken)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")

	return c.doSend(request, "cloudflare raw send")
}

func (c *Client) doSend(request *http.Request, label string) (SendResult, error) {
	response, err := c.httpClient.Do(request)
	if err != nil {
		return SendResult{}, fmt.Errorf("%s request: %w", label, err)
	}
	defer response.Body.Close()

	responseBody, err := io.ReadAll(response.Body)
	if err != nil {
		return SendResult{}, fmt.Errorf("read %s response: %w", label, err)
	}

	var envelope struct {
		Success bool `json:"success"`
		Result  struct {
			Delivered        []string `json:"delivered"`
			PermanentBounces []string `json:"permanent_bounces"`
			Queued           []string `json:"queued"`
		} `json:"result"`
		Errors []struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"errors"`
	}
	if err := json.Unmarshal(responseBody, &envelope); err != nil {
		return SendResult{}, fmt.Errorf("decode %s response: %w", label, err)
	}

	if response.StatusCode >= 400 || !envelope.Success {
		if len(envelope.Errors) > 0 {
			return SendResult{}, fmt.Errorf("%s failed: %s (%d)", label, envelope.Errors[0].Message, envelope.Errors[0].Code)
		}
		return SendResult{}, fmt.Errorf("%s failed with status %s", label, response.Status)
	}

	return SendResult{
		Delivered:        envelope.Result.Delivered,
		PermanentBounces: envelope.Result.PermanentBounces,
		Queued:           envelope.Result.Queued,
	}, nil
}
