package atemail

import (
	"fmt"
	"io"
	"strconv"
	"strings"
)

func mailboxSummary(mailbox map[string]any) map[string]any {
	return map[string]any{
		"id":          mailbox["id"],
		"name":        mailbox["name"],
		"path":        mailbox["path"],
		"special_use": mailbox["specialUse"],
	}
}

func mailboxLabel(mailbox map[string]any) string {
	for _, key := range []string{"path", "name", "id"} {
		if value := stringValue(mailbox[key]); value != "" {
			return value
		}
	}
	return "mailbox"
}

func renderMessageList(writer io.Writer, messages []map[string]any, label string, showMailbox bool, unseenOnly bool, mailboxNames map[string]string) {
	if len(messages) == 0 {
		prefix := "messages"
		if unseenOnly {
			prefix = "unread"
		}
		fmt.Fprintf(writer, "No %s in %s.\n", prefix, label)
		return
	}

	fmt.Fprintf(writer, "%d message(s) in %s\n", len(messages), label)
	headers := []string{"ID", "SEEN", "DATE", "FROM"}
	if showMailbox {
		headers = append(headers, "MAILBOX")
	}
	headers = append(headers, "SUBJECT")

	rows := make([][]string, 0, len(messages))
	for _, message := range messages {
		row := []string{
			stringValue(message["id"]),
			"no",
			truncate(stringValue(message["date"]), 19),
			truncate(formatAddress(message["from"]), 24),
		}
		if truthy(message["seen"]) {
			row[1] = "yes"
		}
		if showMailbox {
			mailboxID := stringValue(message["mailbox"])
			mailboxValue := mailboxID
			if mailboxNames != nil {
				if value := mailboxNames[mailboxID]; value != "" {
					mailboxValue = value
				}
			}
			row = append(row, truncate(mailboxValue, 12))
		}
		row = append(row, truncate(stringValue(message["subject"]), 60))
		rows = append(rows, row)
	}
	fmt.Fprintln(writer, formatTable(headers, rows))
}

func formatTable(headers []string, rows [][]string) string {
	widths := make([]int, len(headers))
	for i, header := range headers {
		widths[i] = len([]rune(header))
	}
	for _, row := range rows {
		for i, value := range row {
			if width := len([]rune(value)); width > widths[i] {
				widths[i] = width
			}
		}
	}
	rendered := make([]string, 0, len(rows)+1)
	rendered = append(rendered, renderRow(headers, widths))
	for _, row := range rows {
		rendered = append(rendered, renderRow(row, widths))
	}
	return strings.Join(rendered, "\n")
}

func renderRow(row []string, widths []int) string {
	values := make([]string, len(row))
	for i, value := range row {
		values[i] = padRight(value, widths[i])
	}
	return strings.Join(values, "  ")
}

func padRight(value string, width int) string {
	padding := width - len([]rune(value))
	if padding <= 0 {
		return value
	}
	return value + strings.Repeat(" ", padding)
}

func truncate(value string, limit int) string {
	cleaned := strings.Join(strings.Fields(value), " ")
	runes := []rune(cleaned)
	if len(runes) <= limit {
		return cleaned
	}
	cut := limit - 1
	if cut < 0 {
		cut = 0
	}
	return string(runes[:cut]) + "\u2026"
}

func formatAddress(value any) string {
	if object, ok := value.(map[string]any); ok {
		name := strings.TrimSpace(stringValue(object["name"]))
		address := strings.TrimSpace(stringValue(object["address"]))
		if name != "" && address != "" {
			return name + " <" + address + ">"
		}
		if name != "" {
			return name
		}
		return address
	}
	if text, ok := value.(string); ok {
		return strings.TrimSpace(text)
	}
	return ""
}

func formatAddresses(value any) string {
	items, ok := value.([]any)
	if !ok {
		return ""
	}
	rendered := make([]string, 0, len(items))
	for _, item := range items {
		if address := formatAddress(item); address != "" {
			rendered = append(rendered, address)
		}
	}
	return strings.Join(rendered, ", ")
}

func renderSecuritySummary(writer io.Writer, view map[string]any, security map[string]any) {
	externalLinks := objectSlice(view["externalLinks"])
	remoteImages := objectSlice(view["remoteImages"])
	if len(externalLinks) > 0 {
		fmt.Fprintln(writer)
		fmt.Fprintln(writer, "Warning: External link(s) require confirmation before opening.")
		for _, link := range externalLinks {
			fmt.Fprintf(writer, "  - %s: %s\n", linkHostLabel(link), stringValue(link["url"]))
		}
	}
	if len(remoteImages) > 0 && !truthy(view["remoteImagesAllowed"]) {
		fmt.Fprintln(writer)
		fmt.Fprintln(writer, "Warning: Remote images are blocked by default.")
		for _, image := range remoteImages {
			fmt.Fprintf(writer, "  - %s: %s\n", linkHostLabel(image), stringValue(image["url"]))
		}
	}

	summary := objectValue(security["summary"])
	if len(summary) == 0 {
		summary = objectValue(view["securitySummary"])
	}
	harakaWildduck := objectValue(security["harakaWildduck"])
	fmt.Fprintln(writer)
	fmt.Fprintln(writer, "Security:")
	for _, name := range []string{"spf", "dkim", "dmarc", "arc"} {
		fmt.Fprintf(writer, "  %s: %s\n", strings.ToUpper(name), securitySignalLabel(objectValue(summary[name])))
	}
	if mailedBy := stringValue(summary["mailedBy"]); mailedBy != "" {
		fmt.Fprintf(writer, "  Mailed-by: %s\n", mailedBy)
	}
	if signedBy := stringValue(summary["signedBy"]); signedBy != "" {
		fmt.Fprintf(writer, "  Signed-by: %s\n", signedBy)
	}
	trusted := "untrusted"
	if truthy(harakaWildduck["trusted"]) {
		trusted = "trusted"
	}
	source := stringValue(harakaWildduck["source"])
	if source == "" {
		source = "unknown"
	}
	fmt.Fprintf(writer, "  Haraka/WildDuck: %s (%s)\n", trusted, source)
	archive, archiveOK := security["cloudflareArchive"].(map[string]any)
	if archiveOK && stringValue(archive["status"]) != "available" {
		reason := stringValue(archive["reason"])
		if reason == "" {
			reason = "not available"
		}
		status := stringValue(archive["status"])
		if status == "" {
			status = "unknown"
		}
		fmt.Fprintf(writer, "  Cloudflare archive: %s (%s)\n", status, reason)
	}
	for _, warning := range anySlice(security["warnings"]) {
		fmt.Fprintf(writer, "  Warning: %s\n", stringValue(warning))
	}
}

func linkHostLabel(item any) string {
	object, ok := item.(map[string]any)
	if !ok {
		return "unknown"
	}
	for _, key := range []string{"host", "scheme"} {
		if value := stringValue(object[key]); value != "" {
			return value
		}
	}
	return "unknown"
}

func securitySignalLabel(signal map[string]any) string {
	result := stringValue(signal["result"])
	if result == "" {
		result = "unknown"
	}
	details := make([]string, 0, 5)
	for _, key := range []string{"domain", "identifier", "source", "note", "reason"} {
		value := strings.TrimSpace(stringValue(signal[key]))
		if value != "" {
			details = append(details, value)
		}
	}
	if len(details) > 0 {
		return result + " (" + strings.Join(details, "; ") + ")"
	}
	return result
}

func pythonStringRepr(value string) string {
	if !strings.Contains(value, "'") && !strings.ContainsAny(value, "\n\r\t\\") {
		return "'" + value + "'"
	}
	if !strings.Contains(value, "\"") && !strings.ContainsAny(value, "\n\r\t\\") {
		return `"` + value + `"`
	}
	return strconv.Quote(value)
}
