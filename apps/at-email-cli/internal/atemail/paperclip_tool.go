package atemail

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"regexp"
	"strings"
)

const (
	paperclipToolEnvelopeSchema = "agentteam-email.paperclip-tool.v1"
	paperclipToolMaxInputBytes  = 1024 * 1024
	paperclipToolPluginID       = "agentteam.paperclip-email-plugin"
)

var paperclipSecretPattern = regexp.MustCompile(`(?i)(authorization\s*:\s*bearer\s+|bearer\s+|(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[=:]\s*)[^\s,;]+`)
var paperclipContextValuePattern = regexp.MustCompile(`^[A-Za-z0-9._:-]{1,256}$`)
var paperclipToolOperations = map[string]struct{}{
	"provision": {},
	"read":      {},
	"reply":     {},
	"search":    {},
	"send":      {},
	"status":    {},
}

type paperclipToolEnvelope struct {
	Schema     string                  `json:"schema"`
	Operation  string                  `json:"operation"`
	Context    paperclipToolContext    `json:"context"`
	Parameters paperclipToolParameters `json:"parameters"`
}

type paperclipToolContext struct {
	AgentID   string `json:"agentId"`
	CompanyID string `json:"companyId"`
	PluginID  string `json:"pluginId"`
	ProjectID string `json:"projectId"`
	RunID     string `json:"runId"`
}

type paperclipToolParameters struct {
	Bcc       []string `json:"bcc"`
	Body      string   `json:"body"`
	Cc        []string `json:"cc"`
	DryRun    bool     `json:"dryRun"`
	Limit     int      `json:"limit"`
	Mailbox   string   `json:"mailbox"`
	MessageID string   `json:"messageId"`
	Name      string   `json:"name"`
	Query     string   `json:"query"`
	Subject   string   `json:"subject"`
	ThreadID  string   `json:"threadId"`
	To        []string `json:"to"`
}

type paperclipToolResult struct {
	Ok      bool   `json:"ok"`
	Content string `json:"content,omitempty"`
	Data    any    `json:"data,omitempty"`
	Error   string `json:"error,omitempty"`
}

func handlePaperclipTool(ctx context.Context, env []string, stdin io.Reader, stdout io.Writer) error {
	envelope, err := decodePaperclipToolEnvelope(stdin)
	if err != nil {
		return writePaperclipToolError(stdout, err)
	}
	result, err := executePaperclipTool(ctx, env, envelope)
	if err != nil {
		return writePaperclipToolError(stdout, err)
	}
	return printJSON(stdout, result)
}

func decodePaperclipToolEnvelope(stdin io.Reader) (paperclipToolEnvelope, error) {
	decoder := json.NewDecoder(io.LimitReader(stdin, paperclipToolMaxInputBytes+1))
	decoder.DisallowUnknownFields()
	var envelope paperclipToolEnvelope
	if err := decoder.Decode(&envelope); err != nil {
		return paperclipToolEnvelope{}, newAgentMailError("invalid Paperclip email tool input: " + err.Error())
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return paperclipToolEnvelope{}, newAgentMailError("invalid Paperclip email tool input: expected a single JSON object")
		}
		return paperclipToolEnvelope{}, newAgentMailError("invalid Paperclip email tool input: " + err.Error())
	}
	if envelope.Schema != paperclipToolEnvelopeSchema {
		return paperclipToolEnvelope{}, newAgentMailError("invalid Paperclip email tool input: schema must be " + paperclipToolEnvelopeSchema)
	}
	if strings.TrimSpace(envelope.Operation) == "" {
		return paperclipToolEnvelope{}, newAgentMailError("invalid Paperclip email tool input: operation is required")
	}
	if _, ok := paperclipToolOperations[envelope.Operation]; !ok {
		return paperclipToolEnvelope{}, newAgentMailError("invalid Paperclip email tool input: unsupported operation " + envelope.Operation)
	}
	for label, value := range map[string]string{
		"agentId":   envelope.Context.AgentID,
		"companyId": envelope.Context.CompanyID,
		"pluginId":  envelope.Context.PluginID,
		"projectId": envelope.Context.ProjectID,
		"runId":     envelope.Context.RunID,
	} {
		if strings.TrimSpace(value) == "" {
			return paperclipToolEnvelope{}, newAgentMailError("invalid Paperclip email tool input: context." + label + " is required")
		}
		if !paperclipContextValuePattern.MatchString(value) {
			return paperclipToolEnvelope{}, newAgentMailError("invalid Paperclip email tool input: context." + label + " contains unsupported characters")
		}
	}
	if envelope.Context.PluginID != paperclipToolPluginID {
		return paperclipToolEnvelope{}, newAgentMailError("invalid Paperclip email tool input: context.pluginId must be " + paperclipToolPluginID)
	}
	return envelope, nil
}

func executePaperclipTool(ctx context.Context, env []string, envelope paperclipToolEnvelope) (paperclipToolResult, error) {
	credential, found, err := loadAgentCredential(defaultAgentProfileName)
	if err != nil {
		return paperclipToolResult{}, err
	}
	if !found {
		return paperclipToolResult{}, newAgentCredentialRequiredError()
	}

	params := envelope.Parameters
	values := envMap(env)
	preferredAccountID := strings.TrimSpace(params.Mailbox)
	if preferredAccountID == "" {
		preferredAccountID = lookupEnv(values, "AT_EMAIL_MAILBOX_ADDRESS")
	}
	client := newWebMailClient(credential, preferredAccountID, buildInternalIdentityTerms(values)).
		withExtraHeaders(paperclipToolHeaders(envelope))
	cfg := config{
		APIBaseURL:            credential.APIBaseURL,
		MailboxAddress:        preferredAccountID,
		UserID:                credential.AgentID,
		InternalIdentityTerms: buildInternalIdentityTerms(values),
	}

	switch envelope.Operation {
	case "status":
		data, err := capturePaperclipJSON(func(writer io.Writer) error {
			return handleStatus(ctx, parsedArgs{Command: commandStatus, JSON: true}, client, cfg, writer)
		})
		return paperclipToolResult{Ok: true, Content: "AgentTeam Email status is available.", Data: data}, err
	case "search":
		query := strings.TrimSpace(params.Query)
		if query == "" {
			return paperclipToolResult{}, newAgentMailError("Paperclip email search requires query")
		}
		limit := params.Limit
		if limit == 0 {
			limit = 20
		}
		data, err := capturePaperclipJSON(func(writer io.Writer) error {
			return handleSearch(ctx, parsedArgs{Command: commandSearch, JSON: true, Limit: limit, Query: query}, client, writer)
		})
		return paperclipToolResult{Ok: true, Content: paperclipSearchContent(data), Data: data}, err
	case "read":
		messageID, err := paperclipMessageID(params)
		if err != nil {
			return paperclipToolResult{}, err
		}
		data, err := capturePaperclipJSON(func(writer io.Writer) error {
			return handleRead(ctx, parsedArgs{Command: commandRead, JSON: true, Folder: "INBOX", MessageID: messageID}, client, writer)
		})
		return paperclipToolResult{Ok: true, Content: fmt.Sprintf("Read message %d.", messageID), Data: data}, err
	case "send":
		data, err := executePaperclipSend(ctx, params, client, cfg)
		return paperclipToolResult{Ok: true, Content: paperclipSendContent(params), Data: data}, err
	case "reply":
		messageID, err := paperclipMessageID(params)
		if err != nil {
			return paperclipToolResult{}, err
		}
		data, err := executePaperclipReply(ctx, params, messageID, client, cfg)
		return paperclipToolResult{Ok: true, Content: fmt.Sprintf("Replied to message %d.", messageID), Data: data}, err
	case "provision":
		data, err := executePaperclipProvision(ctx, params, client)
		return paperclipToolResult{
			Ok:      true,
			Content: fmt.Sprintf("Provisioned mailbox %s.", strings.TrimSpace(params.Mailbox)),
			Data:    data,
		}, err
	default:
		return paperclipToolResult{}, newAgentMailError("unsupported Paperclip email operation: " + envelope.Operation)
	}
}

func executePaperclipProvision(ctx context.Context, params paperclipToolParameters, client *webMailClient) (map[string]any, error) {
	address := strings.TrimSpace(params.Mailbox)
	if address == "" {
		return nil, newAgentMailError("Paperclip email provision requires mailbox")
	}
	name := strings.TrimSpace(params.Name)
	if params.DryRun {
		result := map[string]any{
			"address": address,
			"dryRun":  true,
			"type":    "mailbox",
		}
		if name != "" {
			result["name"] = name
		}
		return result, nil
	}
	return client.createAdminAccount(ctx, address, name)
}

func executePaperclipSend(ctx context.Context, params paperclipToolParameters, client mailCommandClient, cfg config) (map[string]any, error) {
	subject := strings.TrimSpace(params.Subject)
	body := strings.TrimSpace(params.Body)
	if len(params.To) == 0 {
		return nil, newAgentMailError("Paperclip email send requires at least one recipient in to")
	}
	if subject == "" {
		return nil, newAgentMailError("Paperclip email send requires subject")
	}
	if body == "" {
		return nil, newAgentMailError("Paperclip email send requires body")
	}
	if params.DryRun {
		if err := validateOutboundMessage(&subject, body, cfg); err != nil {
			return nil, err
		}
		return map[string]any{
			"dryRun":  true,
			"subject": subject,
			"to":      stringSliceOrEmpty(params.To),
			"cc":      stringSliceOrEmpty(params.Cc),
			"bcc":     stringSliceOrEmpty(params.Bcc),
		}, nil
	}
	return capturePaperclipJSON(func(writer io.Writer) error {
		return handleSend(ctx, parsedArgs{
			Command:    commandSend,
			JSON:       true,
			To:         params.To,
			Cc:         params.Cc,
			Bcc:        params.Bcc,
			Subject:    subject,
			SubjectSet: true,
			Body:       &body,
		}, client, strings.NewReader(body), writer)
	})
}

func executePaperclipReply(ctx context.Context, params paperclipToolParameters, messageID int, client mailCommandClient, cfg config) (map[string]any, error) {
	body := strings.TrimSpace(params.Body)
	if body == "" {
		return nil, newAgentMailError("Paperclip email reply requires body")
	}
	if params.DryRun {
		mailboxes, err := client.listMailboxes(ctx, false, false)
		if err != nil {
			return nil, err
		}
		sourceMailbox, err := resolveMailbox(mailboxes, "INBOX")
		if err != nil {
			return nil, err
		}
		original, err := client.getMessage(ctx, stringValue(sourceMailbox["id"]), messageID, false)
		if err != nil {
			return nil, err
		}
		recipients, err := resolveReplyRecipients(original, false, cfg.MailboxAddress)
		if err != nil {
			return nil, err
		}
		if err := validateOutboundMessage(nil, body, cfg); err != nil {
			return nil, err
		}
		return map[string]any{
			"dryRun":     true,
			"message_id": messageID,
			"to":         stringSliceOrEmpty(recipients.To),
			"cc":         stringSliceOrEmpty(recipients.Cc),
		}, nil
	}
	return capturePaperclipJSON(func(writer io.Writer) error {
		return handleReply(ctx, parsedArgs{
			Command:   commandReply,
			JSON:      true,
			Folder:    "INBOX",
			MessageID: messageID,
			Body:      &body,
		}, client, cfg, strings.NewReader(body), writer)
	})
}

func paperclipMessageID(params paperclipToolParameters) (int, error) {
	if strings.TrimSpace(params.MessageID) == "" {
		if strings.TrimSpace(params.ThreadID) != "" {
			return 0, newAgentMailError("Paperclip email operation currently requires messageId; threadId is not supported yet")
		}
		return 0, newAgentMailError("Paperclip email operation requires messageId")
	}
	messageID, err := positiveInt(strings.TrimSpace(params.MessageID))
	if err != nil {
		return 0, newAgentMailError("invalid Paperclip email messageId: " + err.Error())
	}
	return messageID, nil
}

func paperclipToolHeaders(envelope paperclipToolEnvelope) map[string]string {
	return map[string]string{
		"X-AgentTeam-Paperclip-Agent-Id":   envelope.Context.AgentID,
		"X-AgentTeam-Paperclip-Company-Id": envelope.Context.CompanyID,
		"X-AgentTeam-Paperclip-Operation":  envelope.Operation,
		"X-AgentTeam-Paperclip-Plugin-Id":  envelope.Context.PluginID,
		"X-AgentTeam-Paperclip-Project-Id": envelope.Context.ProjectID,
		"X-AgentTeam-Paperclip-Run-Id":     envelope.Context.RunID,
	}
}

func capturePaperclipJSON(run func(io.Writer) error) (map[string]any, error) {
	var buffer bytes.Buffer
	if err := run(&buffer); err != nil {
		return nil, err
	}
	return decodeJSONObject(buffer.Bytes())
}

func writePaperclipToolError(stdout io.Writer, err error) error {
	return printJSON(stdout, paperclipToolResult{Ok: false, Error: paperclipSafeError(err)})
}

func paperclipSafeError(err error) string {
	if err == nil {
		return "AgentTeam Email tool failed"
	}
	return paperclipSecretPattern.ReplaceAllString(err.Error(), "${1}[REDACTED]")
}

func paperclipSearchContent(data map[string]any) string {
	count := len(objectSlice(data["messages"]))
	if count == 1 {
		return "Found 1 email message."
	}
	return fmt.Sprintf("Found %d email messages.", count)
}

func paperclipSendContent(params paperclipToolParameters) string {
	if params.DryRun {
		return "Email send dry run completed."
	}
	return "Sent email message."
}
