package atemail

import (
	"context"
	"fmt"
	"io"
	"strings"

	atemailskill "at-email-cli"
)

func handleStatus(ctx context.Context, args parsedArgs, client *wildDuckClient, cfg config, stdout io.Writer) error {
	mailboxes, err := client.listMailboxes(ctx, true, false)
	if err != nil {
		return err
	}
	payload := map[string]any{
		"user_id":         cfg.UserID,
		"mailbox_address": nil,
		"api_base_url":    cfg.APIBaseURL,
		"mailboxes":       mailboxes,
	}
	if cfg.MailboxAddress != "" {
		payload["mailbox_address"] = cfg.MailboxAddress
	}
	if args.JSON {
		return printJSON(stdout, payload)
	}

	fmt.Fprintf(stdout, "User: %s\n", cfg.UserID)
	fmt.Fprintf(stdout, "API: %s\n", cfg.APIBaseURL)
	if cfg.MailboxAddress != "" {
		fmt.Fprintf(stdout, "Mailbox: %s\n", cfg.MailboxAddress)
	}
	fmt.Fprintf(stdout, "Folders: %d\n", len(mailboxes))
	for _, mailbox := range mailboxes {
		bits := []string{mailboxLabel(mailbox)}
		if value, ok := mailbox["total"]; ok && value != nil {
			bits = append(bits, "total="+stringValue(value))
		}
		if value, ok := mailbox["unseen"]; ok && value != nil {
			bits = append(bits, "unseen="+stringValue(value))
		}
		fmt.Fprintln(stdout, "  "+strings.Join(bits, "  "))
	}
	return nil
}

func handleInbox(ctx context.Context, args parsedArgs, client *wildDuckClient, stdout io.Writer) error {
	mailboxes, err := client.listMailboxes(ctx, false, false)
	if err != nil {
		return err
	}
	mailbox, err := resolveMailbox(mailboxes, args.Folder)
	if err != nil {
		return err
	}
	messages, err := client.listMessages(ctx, stringValue(mailbox["id"]), args.Limit, args.Unseen, nil)
	if err != nil {
		return err
	}
	payload := map[string]any{"mailbox": mailboxSummary(mailbox), "messages": messages}
	if args.JSON {
		return printJSON(stdout, payload)
	}
	renderMessageList(stdout, messages, mailboxLabel(mailbox), false, args.Unseen, nil)
	return nil
}

func handleRead(ctx context.Context, args parsedArgs, client *wildDuckClient, cfg config, stdout io.Writer) error {
	mailboxes, err := client.listMailboxes(ctx, false, false)
	if err != nil {
		return err
	}
	mailbox, err := resolveMailbox(mailboxes, args.Folder)
	if err != nil {
		return err
	}
	message, err := client.getMessage(ctx, stringValue(mailbox["id"]), args.MessageID, true)
	if err != nil {
		return err
	}
	control, err := newControlAPIClient(cfg)
	if err != nil {
		return err
	}
	params := safeMessageParams(cfg, mailbox, message, args.MessageID)
	viewParams := map[string]any{}
	for key, value := range params {
		viewParams[key] = value
	}
	viewParams["remoteImages"] = "block"
	view, err := control.messageView(ctx, viewParams)
	if err != nil {
		return err
	}
	security, err := control.messageSecurity(ctx, params)
	if err != nil {
		return err
	}
	if args.JSON {
		return printJSON(stdout, map[string]any{
			"mailbox":  mailboxSummary(mailbox),
			"message":  safeMessageMetadata(message),
			"view":     view,
			"security": security,
		})
	}

	fmt.Fprintf(stdout, "Message: %s\n", stringValue(message["id"]))
	fmt.Fprintf(stdout, "Mailbox: %s\n", mailboxLabel(mailbox))
	fmt.Fprintf(stdout, "From: %s\n", formatAddress(message["from"]))
	fmt.Fprintf(stdout, "To: %s\n", formatAddresses(message["to"]))
	if truthy(message["cc"]) {
		fmt.Fprintf(stdout, "Cc: %s\n", formatAddresses(message["cc"]))
	}
	fmt.Fprintf(stdout, "Subject: %s\n", stringValue(message["subject"]))
	if date := stringValue(message["date"]); date != "" {
		fmt.Fprintf(stdout, "Date: %s\n", date)
	}
	seen := "no"
	if truthy(message["seen"]) {
		seen = "yes"
	}
	fmt.Fprintf(stdout, "Seen: %s\n", seen)
	attachments := objectSlice(message["attachments"])
	fmt.Fprintf(stdout, "Attachments: %d\n", len(attachments))
	for _, attachment := range attachments {
		label := stringValue(attachment["filename"])
		if label == "" {
			label = stringValue(attachment["id"])
		}
		if label == "" {
			label = "attachment"
		}
		fmt.Fprintf(stdout, "  - %s\n", label)
	}
	renderSecuritySummary(stdout, view, security)
	fmt.Fprintln(stdout)
	body := strings.TrimRight(stringValue(view["plainText"]), "\r\n\t ")
	if body != "" {
		fmt.Fprintln(stdout, body)
	} else {
		fmt.Fprintln(stdout, "[message has no safe text body]")
	}
	return nil
}

func handleSearch(ctx context.Context, args parsedArgs, client *wildDuckClient, stdout io.Writer) error {
	messages, err := client.searchMessages(ctx, args.Query, args.Limit)
	if err != nil {
		return err
	}
	mailboxes, err := client.listMailboxes(ctx, false, false)
	if err != nil {
		return err
	}
	mailboxNames := map[string]string{}
	for _, mailbox := range mailboxes {
		mailboxNames[stringValue(mailbox["id"])] = mailboxLabel(mailbox)
	}
	payload := map[string]any{"query": args.Query, "messages": messages}
	if args.JSON {
		return printJSON(stdout, payload)
	}
	renderMessageList(stdout, messages, "search results for "+pythonStringRepr(args.Query), true, false, mailboxNames)
	return nil
}

func handleMarkRead(ctx context.Context, args parsedArgs, client *wildDuckClient, stdout io.Writer) error {
	mailboxes, err := client.listMailboxes(ctx, false, false)
	if err != nil {
		return err
	}
	mailbox, err := resolveMailbox(mailboxes, args.Folder)
	if err != nil {
		return err
	}
	seen := true
	response, err := client.updateMessage(ctx, stringValue(mailbox["id"]), args.MessageID, &seen, "")
	if err != nil {
		return err
	}
	payload := map[string]any{"mailbox": mailboxSummary(mailbox), "message_id": args.MessageID, "response": response}
	if args.JSON {
		return printJSON(stdout, payload)
	}
	fmt.Fprintf(stdout, "Marked message %d as read in %s.\n", args.MessageID, mailboxLabel(mailbox))
	return nil
}

func handleArchive(ctx context.Context, args parsedArgs, client *wildDuckClient, stdout io.Writer) error {
	mailboxes, err := client.listMailboxes(ctx, false, false)
	if err != nil {
		return err
	}
	sourceMailbox, err := resolveMailbox(mailboxes, args.Folder)
	if err != nil {
		return err
	}
	archiveMailbox, err := resolveSpecialUseMailbox(mailboxes, "\\Archive", "Archive")
	if err != nil {
		return err
	}
	response, err := client.updateMessage(ctx, stringValue(sourceMailbox["id"]), args.MessageID, nil, stringValue(archiveMailbox["id"]))
	if err != nil {
		return err
	}
	payload := map[string]any{
		"source_mailbox":  mailboxSummary(sourceMailbox),
		"archive_mailbox": mailboxSummary(archiveMailbox),
		"message_id":      args.MessageID,
		"response":        response,
	}
	if args.JSON {
		return printJSON(stdout, payload)
	}
	fmt.Fprintf(stdout, "Archived message %d from %s to %s.\n", args.MessageID, mailboxLabel(sourceMailbox), mailboxLabel(archiveMailbox))
	return nil
}

func handleSend(ctx context.Context, args parsedArgs, client *wildDuckClient, stdin io.Reader, stdout io.Writer) error {
	body, err := readBody(args, stdin)
	if err != nil {
		return err
	}
	subject := args.Subject
	response, err := client.submitMessage(ctx, outboundMessage{
		To:      args.To,
		Cc:      args.Cc,
		Bcc:     args.Bcc,
		Subject: &subject,
		Text:    body,
		ReplyTo: args.ReplyTo,
	})
	if err != nil {
		return err
	}
	payload := map[string]any{
		"subject": args.Subject,
		"to":      stringSliceOrEmpty(args.To),
		"cc":      stringSliceOrEmpty(args.Cc),
		"bcc":     stringSliceOrEmpty(args.Bcc),
		"message": response,
	}
	if args.JSON {
		return printJSON(stdout, payload)
	}
	fmt.Fprintln(stdout, "Sent message.")
	renderSubmitResponse(stdout, response)
	return nil
}

func handleReply(ctx context.Context, args parsedArgs, client *wildDuckClient, cfg config, stdin io.Reader, stdout io.Writer) error {
	mailboxes, err := client.listMailboxes(ctx, false, false)
	if err != nil {
		return err
	}
	sourceMailbox, err := resolveMailbox(mailboxes, args.Folder)
	if err != nil {
		return err
	}
	original, err := client.getMessage(ctx, stringValue(sourceMailbox["id"]), args.MessageID, false)
	if err != nil {
		return err
	}
	recipients, err := resolveReplyRecipients(original, args.All, cfg.MailboxAddress)
	if err != nil {
		return err
	}
	body, err := readBody(args, stdin)
	if err != nil {
		return err
	}
	action := "reply"
	if args.All {
		action = "replyAll"
	}
	response, err := client.submitMessage(ctx, outboundMessage{
		To:   recipients.To,
		Cc:   recipients.Cc,
		Text: body,
		Reference: map[string]any{
			"mailbox": stringValue(sourceMailbox["id"]),
			"id":      args.MessageID,
			"action":  action,
		},
	})
	if err != nil {
		return err
	}
	payload := map[string]any{
		"source_mailbox": mailboxSummary(sourceMailbox),
		"message_id":     args.MessageID,
		"action":         action,
		"to":             stringSliceOrEmpty(recipients.To),
		"cc":             stringSliceOrEmpty(recipients.Cc),
		"message":        response,
	}
	if args.JSON {
		return printJSON(stdout, payload)
	}
	fmt.Fprintf(stdout, "Replied to message %d.\n", args.MessageID)
	renderSubmitResponse(stdout, response)
	return nil
}

func handleVersion(args parsedArgs, stdout io.Writer) error {
	if args.JSON {
		return printJSON(stdout, versionPayload())
	}
	fmt.Fprintln(stdout, Version)
	return nil
}

func handleSelfUpdate(ctx context.Context, args parsedArgs, stdout io.Writer) error {
	version, err := runSelfUpdate(ctx, Version, args.TargetVersion)
	if err != nil {
		return err
	}
	if args.JSON {
		return printJSON(stdout, map[string]any{
			"status":  "updated",
			"version": version,
		})
	}
	fmt.Fprintf(stdout, "Updated at-email to %s.\n", version)
	return nil
}

func handleSkill(stdout io.Writer) error {
	_, err := io.WriteString(stdout, atemailskill.Markdown)
	return err
}

func renderSubmitResponse(stdout io.Writer, response map[string]any) {
	if mailbox := stringValue(response["mailbox"]); mailbox != "" {
		fmt.Fprintf(stdout, "Mailbox: %s\n", mailbox)
	}
	if hasNonNullNonFalse(response["id"]) {
		fmt.Fprintf(stdout, "Message: %s\n", stringValue(response["id"]))
	}
	if hasNonNullNonFalse(response["queueId"]) {
		fmt.Fprintf(stdout, "Queue: %s\n", stringValue(response["queueId"]))
	}
}
