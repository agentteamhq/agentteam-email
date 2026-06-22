package atemail

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type queryParam struct {
	Key   string
	Value string
}

type wildDuckClient struct {
	config config
	client *http.Client
}

type controlAPIClient struct {
	baseURL          string
	messageReadToken string
	client           *http.Client
}

func newWildDuckClient(cfg config) *wildDuckClient {
	return &wildDuckClient{
		config: cfg,
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

func newControlAPIClient(cfg config) (*controlAPIClient, error) {
	if cfg.ControlAPIBaseURL == "" {
		return nil, newConfigError("missing required runtime environment for safe message read: AT_EMAIL_CONTROL_API_BASE_URL")
	}
	if cfg.MessageReadToken == "" {
		return nil, newConfigError("missing required runtime environment for safe message read: AT_EMAIL_MESSAGE_READ_TOKEN")
	}
	return &controlAPIClient{
		baseURL:          strings.TrimRight(cfg.ControlAPIBaseURL, "/"),
		messageReadToken: cfg.MessageReadToken,
		client:           &http.Client{Timeout: 30 * time.Second},
	}, nil
}

func (c *wildDuckClient) listMailboxes(ctx context.Context, counters bool, specialUseOnly bool) ([]map[string]any, error) {
	query := make([]queryParam, 0, 2)
	if counters {
		query = append(query, queryParam{Key: "counters", Value: "true"})
	}
	if specialUseOnly {
		query = append(query, queryParam{Key: "specialUse", Value: "true"})
	}
	response, err := c.requestJSON(ctx, http.MethodGet, "/users/"+c.config.UserID+"/mailboxes", query, nil)
	if err != nil {
		return nil, err
	}
	return objectSliceOrEmpty(response["results"]), nil
}

func (c *wildDuckClient) listMessages(ctx context.Context, mailboxID string, limit int, unseen bool, includeHeaders []string) ([]map[string]any, error) {
	query := []queryParam{
		{Key: "limit", Value: fmt.Sprint(limit)},
		{Key: "order", Value: "desc"},
	}
	if unseen {
		query = append(query, queryParam{Key: "unseen", Value: "true"})
	}
	if len(includeHeaders) > 0 {
		query = append(query, queryParam{Key: "includeHeaders", Value: sortedLowerHeaders(includeHeaders)})
	}
	response, err := c.requestJSON(ctx, http.MethodGet, "/users/"+c.config.UserID+"/mailboxes/"+mailboxID+"/messages", query, nil)
	if err != nil {
		return nil, err
	}
	return objectSliceOrEmpty(response["results"]), nil
}

func (c *wildDuckClient) getMessage(ctx context.Context, mailboxID string, messageID int, markAsSeen bool) (map[string]any, error) {
	query := make([]queryParam, 0, 1)
	if markAsSeen {
		query = append(query, queryParam{Key: "markAsSeen", Value: "true"})
	}
	return c.requestJSON(ctx, http.MethodGet, "/users/"+c.config.UserID+"/mailboxes/"+mailboxID+"/messages/"+fmt.Sprint(messageID), query, nil)
}

func (c *wildDuckClient) searchMessages(ctx context.Context, queryText string, limit int) ([]map[string]any, error) {
	response, err := c.requestJSON(ctx, http.MethodGet, "/users/"+c.config.UserID+"/search", []queryParam{
		{Key: "query", Value: queryText},
		{Key: "limit", Value: fmt.Sprint(limit)},
		{Key: "order", Value: "desc"},
	}, nil)
	if err != nil {
		return nil, err
	}
	return objectSliceOrEmpty(response["results"]), nil
}

func (c *wildDuckClient) updateMessage(ctx context.Context, mailboxID string, messageID int, seen *bool, moveTo string) (map[string]any, error) {
	payload := map[string]any{}
	if seen != nil {
		payload["seen"] = *seen
	}
	if moveTo != "" {
		payload["moveTo"] = moveTo
	}
	if len(payload) == 0 {
		return nil, newAgentMailError("refusing to update a message without any changes")
	}
	return c.requestJSON(ctx, http.MethodPut, "/users/"+c.config.UserID+"/mailboxes/"+mailboxID+"/messages/"+fmt.Sprint(messageID), nil, payload)
}

func (c *wildDuckClient) submitMessage(ctx context.Context, message outboundMessage) (map[string]any, error) {
	if err := validateOutboundMessage(message.Subject, message.Text, c.config); err != nil {
		return nil, err
	}
	payload := map[string]any{"text": message.Text}
	if len(message.To) > 0 {
		payload["to"] = addressObjects(message.To)
	}
	if len(message.Cc) > 0 {
		payload["cc"] = addressObjects(message.Cc)
	}
	if len(message.Bcc) > 0 {
		payload["bcc"] = addressObjects(message.Bcc)
	}
	if message.Subject != nil {
		payload["subject"] = *message.Subject
	}
	if message.ReplyTo != "" {
		payload["replyTo"] = map[string]any{"address": message.ReplyTo}
	}
	if message.Reference != nil {
		payload["reference"] = message.Reference
	}
	response, err := c.requestJSON(ctx, http.MethodPost, "/users/"+c.config.UserID+"/submit", nil, payload)
	if err != nil {
		return nil, err
	}
	return objectValue(response["message"]), nil
}

func (c *wildDuckClient) requestJSON(ctx context.Context, method string, path string, query []queryParam, body map[string]any) (map[string]any, error) {
	requestURL := strings.TrimRight(c.config.APIBaseURL, "/") + path
	if len(query) > 0 {
		requestURL += "?" + encodeQuery(query)
	}

	var reader io.Reader
	if body != nil {
		data, err := encodeJSONBody(body)
		if err != nil {
			return nil, err
		}
		reader = bytes.NewReader(data)
	}

	request, err := http.NewRequestWithContext(ctx, method, requestURL, reader)
	if err != nil {
		return nil, newServiceTransportError("WildDuck", "preparing "+method+" request")
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("X-Access-Token", c.config.AccessToken)
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}

	response, err := c.client.Do(request)
	if err != nil {
		return nil, newServiceTransportError("WildDuck", "sending "+method+" request")
	}
	defer response.Body.Close()
	raw, readErr := io.ReadAll(response.Body)
	if readErr != nil {
		return nil, newServiceTransportError("WildDuck", "reading "+method+" response")
	}
	if response.StatusCode >= 400 {
		message := http.StatusText(response.StatusCode)
		var envelope map[string]any
		if err := json.Unmarshal(raw, &envelope); err == nil {
			if value, ok := envelope["error"]; ok && value != nil {
				message = stringValue(value)
			}
		}
		return nil, newAgentMailError(fmt.Sprintf("WildDuck %s %s failed: %s", method, path, message))
	}
	if len(raw) == 0 {
		return map[string]any{}, nil
	}
	payload, err := decodeJSONObject(raw)
	if err != nil {
		return nil, newProtocolError(fmt.Sprintf("WildDuck %s %s returned malformed service response: %s", method, path, err.Error()))
	}
	return payload, nil
}

func (c *controlAPIClient) messageView(ctx context.Context, params map[string]any) (map[string]any, error) {
	return c.rpc(ctx, "agentMail.message.view.get", params)
}

func (c *controlAPIClient) messageSecurity(ctx context.Context, params map[string]any) (map[string]any, error) {
	return c.rpc(ctx, "agentMail.message.security.get", params)
}

func (c *controlAPIClient) rpc(ctx context.Context, method string, params map[string]any) (map[string]any, error) {
	payload := map[string]any{
		"jsonrpc": "2.0",
		"id":      "agent-mail-cli",
		"method":  method,
		"params":  params,
	}
	data, err := encodeJSONBody(payload)
	if err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/rpc/"+method, bytes.NewReader(data))
	if err != nil {
		return nil, newServiceTransportError("Control API", "preparing "+method+" request")
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Agent-Mail-Message-Read-Token", c.messageReadToken)

	response, err := c.client.Do(request)
	if err != nil {
		return nil, newServiceTransportError("Control API", "calling "+method)
	}
	defer response.Body.Close()
	raw, readErr := io.ReadAll(response.Body)
	if readErr != nil {
		return nil, newServiceTransportError("Control API", "reading "+method+" response")
	}
	if response.StatusCode >= 400 {
		message := http.StatusText(response.StatusCode)
		var envelope map[string]any
		if err := json.Unmarshal(raw, &envelope); err == nil {
			for _, key := range []string{"detail", "title", "error"} {
				if value, ok := envelope[key]; ok && value != nil {
					message = stringValue(value)
					break
				}
			}
		}
		return nil, newAgentMailError(fmt.Sprintf("Control API %s failed: %s", method, message))
	}

	envelope, err := decodeJSONObject(raw)
	if err != nil {
		return nil, newProtocolError(fmt.Sprintf("Control API %s returned malformed service response: %s", method, err.Error()))
	}
	if value, ok := envelope["error"]; ok {
		return nil, newAgentMailError(fmt.Sprintf("Control API %s failed: %s", method, stringValue(value)))
	}
	result, ok := envelope["result"].(map[string]any)
	if !ok || result == nil {
		return nil, newProtocolError(fmt.Sprintf("Control API %s returned malformed service response: field result must be an object", method))
	}
	return result, nil
}

func encodeQuery(params []queryParam) string {
	values := make([]string, 0, len(params))
	for _, param := range params {
		values = append(values, url.QueryEscape(param.Key)+"="+url.QueryEscape(param.Value))
	}
	return strings.Join(values, "&")
}

func newServiceTransportError(service string, action string) error {
	return newTransportError(fmt.Sprintf("%s service unavailable while %s", service, action))
}

func addressObjects(addresses []string) []map[string]string {
	objects := make([]map[string]string, 0, len(addresses))
	for _, address := range addresses {
		objects = append(objects, map[string]string{"address": address})
	}
	return objects
}

type outboundMessage struct {
	To        []string
	Cc        []string
	Bcc       []string
	Subject   *string
	Text      string
	ReplyTo   string
	Reference map[string]any
}
