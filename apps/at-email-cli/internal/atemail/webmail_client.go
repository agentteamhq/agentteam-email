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

type webMailClient struct {
	baseURL               string
	client                *http.Client
	credential            agentCredential
	extraHeaders          map[string]string
	internalIdentityTerms []identityTerm
	preferredAccountID    string
}

func newWebMailClient(credential agentCredential, preferredAccountID string, internalIdentityTerms []identityTerm) *webMailClient {
	return &webMailClient{
		baseURL:               strings.TrimRight(credential.APIBaseURL, "/"),
		client:                &http.Client{Timeout: 30 * time.Second},
		credential:            credential,
		internalIdentityTerms: append([]identityTerm(nil), internalIdentityTerms...),
		preferredAccountID:    strings.TrimSpace(preferredAccountID),
	}
}

func (c *webMailClient) withExtraHeaders(headers map[string]string) *webMailClient {
	c.extraHeaders = map[string]string{}
	for key, value := range headers {
		cleanedKey := strings.TrimSpace(key)
		cleanedValue := strings.TrimSpace(value)
		if cleanedKey != "" && cleanedValue != "" {
			c.extraHeaders[cleanedKey] = cleanedValue
		}
	}
	return c
}

func (c *webMailClient) listMailboxes(ctx context.Context, _ bool, specialUseOnly bool) ([]map[string]any, error) {
	workspace, err := c.workspace(ctx, nil)
	if err != nil {
		return nil, err
	}
	folders := objectSliceOrEmpty(workspace["folders"])
	result := make([]map[string]any, 0, len(folders))
	for _, folder := range folders {
		mailbox := webFolderToMailbox(folder)
		if specialUseOnly && stringValue(mailbox["specialUse"]) == "" {
			continue
		}
		result = append(result, mailbox)
	}
	return result, nil
}

func (c *webMailClient) listMessages(ctx context.Context, mailboxID string, limit int, unseen bool, _ []string) ([]map[string]any, error) {
	query := []queryParam{
		{Key: "folderId", Value: mailboxID},
		{Key: "limit", Value: fmt.Sprint(limit)},
	}
	if unseen {
		query = append(query, queryParam{Key: "unreadOnly", Value: "true"})
	}
	workspace, err := c.workspace(ctx, query)
	if err != nil {
		return nil, err
	}
	return webMessagesToWildDuck(objectSliceOrEmpty(workspace["messages"])), nil
}

func (c *webMailClient) getMessage(ctx context.Context, mailboxID string, messageID int, markAsSeen bool) (map[string]any, error) {
	workspace, err := c.workspace(ctx, []queryParam{
		{Key: "folderId", Value: mailboxID},
		{Key: "messageId", Value: fmt.Sprint(messageID)},
	})
	if err != nil {
		return nil, err
	}
	message := objectValue(workspace["selectedMessage"])
	if len(message) == 0 {
		return nil, newAgentMailError(fmt.Sprintf("message %d was not found in %s", messageID, mailboxID))
	}
	if markAsSeen {
		seen := true
		if _, err := c.updateMessage(ctx, mailboxID, messageID, &seen, ""); err != nil {
			return nil, err
		}
		message["unread"] = false
	}
	return webMessageDetailToWildDuck(message), nil
}

func (c *webMailClient) searchMessages(ctx context.Context, queryText string, limit int) ([]map[string]any, error) {
	workspace, err := c.workspace(ctx, []queryParam{
		{Key: "query", Value: queryText},
		{Key: "limit", Value: fmt.Sprint(limit)},
	})
	if err != nil {
		return nil, err
	}
	return webMessagesToWildDuck(objectSliceOrEmpty(workspace["messages"])), nil
}

func (c *webMailClient) updateMessage(ctx context.Context, mailboxID string, messageID int, seen *bool, moveTo string) (map[string]any, error) {
	accountID, err := c.accountID(ctx)
	if err != nil {
		return nil, err
	}
	result := map[string]any{"success": true}
	if seen != nil {
		payload := map[string]any{"seen": *seen}
		response, err := c.requestJSON(
			ctx,
			http.MethodPatch,
			"/rpc/mail/accounts/"+pathEscape(accountID)+"/mailboxes/"+pathEscape(mailboxID)+"/messages/"+fmt.Sprint(messageID),
			nil,
			payload,
		)
		if err != nil {
			return nil, err
		}
		result["message_update"] = response
	}
	if moveTo != "" {
		response, err := c.requestJSON(
			ctx,
			http.MethodPost,
			"/rpc/mail/accounts/"+pathEscape(accountID)+"/mailboxes/"+pathEscape(mailboxID)+"/messages/"+fmt.Sprint(messageID)+"/move",
			nil,
			map[string]any{"targetMailboxId": moveTo},
		)
		if err != nil {
			return nil, err
		}
		result["move"] = response
	}
	if seen == nil && moveTo == "" {
		return nil, newAgentMailError("refusing to update a message without any changes")
	}
	return result, nil
}

func (c *webMailClient) submitMessage(ctx context.Context, message outboundMessage) (map[string]any, error) {
	if err := validateOutboundMessage(message.Subject, message.Text, config{
		InternalIdentityTerms: c.internalIdentityTerms,
	}); err != nil {
		return nil, err
	}
	accountID, err := c.accountID(ctx)
	if err != nil {
		return nil, err
	}
	body := map[string]any{
		"body": message.Text,
	}
	if len(message.To) > 0 {
		body["to"] = strings.Join(message.To, ", ")
	}
	if len(message.Cc) > 0 {
		body["cc"] = strings.Join(message.Cc, ", ")
	}
	if len(message.Bcc) > 0 {
		body["bcc"] = strings.Join(message.Bcc, ", ")
	}
	if message.Subject != nil {
		body["subject"] = *message.Subject
	}
	if message.ReplyTo != "" {
		body["replyTo"] = message.ReplyTo
	}
	if message.Reference != nil {
		body["reference"] = webComposeReference(message.Reference)
	}
	response, err := c.requestJSON(ctx, http.MethodPost, "/rpc/mail/accounts/"+pathEscape(accountID)+"/messages", nil, body)
	if err != nil {
		return nil, err
	}
	return response, nil
}

func (c *webMailClient) createAdminAccount(ctx context.Context, address string, name string) (map[string]any, error) {
	body := map[string]any{
		"address": address,
		"type":    "mailbox",
	}
	if strings.TrimSpace(name) != "" {
		body["name"] = strings.TrimSpace(name)
	}
	return c.requestJSON(ctx, http.MethodPost, "/rpc/mail/admin/accounts", nil, body)
}

func (c *webMailClient) workspace(ctx context.Context, query []queryParam) (map[string]any, error) {
	if c.preferredAccountID != "" && !hasQueryParam(query, "accountId") {
		query = append([]queryParam{{Key: "accountId", Value: c.preferredAccountID}}, query...)
	}
	return c.requestJSON(ctx, http.MethodGet, "/rpc/mail/workspace", query, nil)
}

func (c *webMailClient) accountID(ctx context.Context) (string, error) {
	if c.preferredAccountID != "" {
		return c.preferredAccountID, nil
	}
	workspace, err := c.workspace(ctx, nil)
	if err != nil {
		return "", err
	}
	if accountID := stringValue(workspace["activeAccountId"]); accountID != "" {
		return accountID, nil
	}
	for _, account := range objectSlice(workspace["accounts"]) {
		if accountID := stringValue(account["id"]); accountID != "" {
			return accountID, nil
		}
	}
	return "", newAgentMailError("no mailbox account is available to this agent")
}

func (c *webMailClient) requestJSON(ctx context.Context, method string, path string, query []queryParam, body map[string]any) (map[string]any, error) {
	requestURL := c.baseURL + path
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

	if err := requireAgentKeyLabel(c.credential.AgentPrivateKey, "agent"); err != nil {
		return nil, err
	}
	claims, err := newAgentAuthClaims(
		c.credential.HostID,
		c.credential.AgentID,
		agentAuthAudience(c.baseURL),
		method,
		requestURL,
	)
	if err != nil {
		return nil, err
	}
	token, err := signAgentAuthJWT(c.credential.AgentPrivateKey, "agent+jwt", claims)
	if err != nil {
		return nil, err
	}

	request, err := http.NewRequestWithContext(ctx, method, requestURL, reader)
	if err != nil {
		return nil, newServiceTransportError("AgentTeam Email", "preparing "+method+" request")
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("User-Agent", authUserAgent())
	for key, value := range c.extraHeaders {
		request.Header.Set(key, value)
	}
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}

	response, err := c.client.Do(request)
	if err != nil {
		return nil, newServiceTransportError("AgentTeam Email", "sending "+method+" request")
	}
	defer response.Body.Close()
	raw, readErr := io.ReadAll(response.Body)
	if readErr != nil {
		return nil, newServiceTransportError("AgentTeam Email", "reading "+method+" response")
	}
	if response.StatusCode >= 400 {
		return nil, newAgentMailError(fmt.Sprintf("AgentTeam Email %s %s failed: %s", method, path, webMailErrorMessage(raw, response.StatusCode)))
	}
	if len(raw) == 0 || strings.TrimSpace(string(raw)) == "null" {
		return map[string]any{}, nil
	}
	payload, err := decodeJSONObject(raw)
	if err != nil {
		return nil, newProtocolError(fmt.Sprintf("AgentTeam Email %s %s returned malformed service response: %s", method, path, err.Error()))
	}
	return payload, nil
}

func webMailErrorMessage(raw []byte, statusCode int) string {
	message := http.StatusText(statusCode)
	var envelope map[string]any
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return message
	}
	for _, key := range []string{"detail", "title", "error", "message"} {
		if value := stringValue(envelope[key]); value != "" {
			return value
		}
	}
	return message
}

func webFolderToMailbox(folder map[string]any) map[string]any {
	result := map[string]any{
		"id":          folder["id"],
		"name":        folder["name"],
		"path":        folder["path"],
		"specialUse":  folder["specialUse"],
		"total":       folder["total"],
		"unseen":      folder["unread"],
		"webmailView": true,
	}
	return result
}

func webMessagesToWildDuck(messages []map[string]any) []map[string]any {
	result := make([]map[string]any, 0, len(messages))
	for _, message := range messages {
		result = append(result, webMessageSummaryToWildDuck(message))
	}
	return result
}

func webMessageSummaryToWildDuck(message map[string]any) map[string]any {
	return map[string]any{
		"date":    message["receivedAt"],
		"from":    message["from"],
		"id":      message["id"],
		"intro":   message["teaser"],
		"mailbox": message["mailboxId"],
		"seen":    !truthy(message["unread"]),
		"subject": message["subject"],
		"thread":  message["threadId"],
	}
}

func webMessageDetailToWildDuck(message map[string]any) map[string]any {
	result := webMessageSummaryToWildDuck(message)
	result["attachments"] = objectSliceOrEmpty(message["attachments"])
	result["cc"] = stringAddressesToObjects(message["cc"])
	result["html"] = message["html"]
	result["messageId"] = message["messageId"]
	result["plainText"] = message["plainText"]
	result["replyTo"] = stringAddressesToObjects(message["replyTo"])
	result["to"] = stringAddressesToObjects(message["to"])
	return result
}

func stringAddressesToObjects(value any) []any {
	items := anySlice(value)
	result := make([]any, 0, len(items))
	for _, item := range items {
		address := strings.TrimSpace(stringValue(item))
		if address == "" {
			continue
		}
		result = append(result, map[string]any{"address": address})
	}
	return result
}

func webComposeReference(reference map[string]any) map[string]any {
	return map[string]any{
		"action":    stringValue(reference["action"]),
		"mailboxId": stringValue(reference["mailbox"]),
		"messageId": stringValue(reference["id"]),
	}
}

func hasQueryParam(query []queryParam, key string) bool {
	for _, param := range query {
		if param.Key == key {
			return true
		}
	}
	return false
}

func pathEscape(value string) string {
	return url.PathEscape(value)
}
