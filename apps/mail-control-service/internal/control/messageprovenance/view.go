package messageprovenance

import (
	"bytes"
	"context"
	"fmt"
	htmltemplate "html/template"
	"net/url"
	"regexp"
	"strings"

	"mail-control-service/internal/mail/rfc822"

	"github.com/jhillyerd/enmime"
	"github.com/microcosm-cc/bluemonday"
	xhtml "golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

var (
	agentMailTokenValue  = regexp.MustCompile(`^[A-Za-z0-9._:-]+$`)
	linkRelValue         = regexp.MustCompile(`^noopener noreferrer$`)
	remoteImageURLValue  = regexp.MustCompile(`^https?://[^\s<>"']+$`)
	displayHTMLSanitizer = newDisplayHTMLSanitizer()
)

func (s *Service) View(ctx context.Context, params ViewParams) (MessageViewResult, error) {
	identity, err := normalizeParams(Params{
		WildDuckUserID:    params.WildDuckUserID,
		WildDuckMailboxID: params.WildDuckMailboxID,
		WildDuckUID:       params.WildDuckUID,
		WildDuckMessageID: params.WildDuckMessageID,
	})
	if err != nil {
		return MessageViewResult{}, err
	}
	remoteImagesAllowed, err := normalizeRemoteImagesPolicy(params.RemoteImages)
	if err != nil {
		return MessageViewResult{}, err
	}
	raw, err := s.fetcher.FetchMessageSource(ctx, identity.UserID, identity.MailboxID, identity.UID)
	if err != nil {
		return MessageViewResult{}, fmt.Errorf("fetch WildDuck message source: %w", err)
	}
	provenance, err := rfc822.ParseProvenanceHeaders(raw)
	if err != nil {
		return MessageViewResult{}, err
	}
	archiveEvidence, _ := s.resolveCloudflareArchiveEvidence(ctx, provenance)
	authResults, _, _, err := parseSecurityHeaders(raw, provenance, archiveEvidence)
	if err != nil {
		return MessageViewResult{}, err
	}
	deliveryKey, basis := deliveryKey(identity, provenance.IngestID)
	return buildMessageView(identity, deliveryKey, basis, raw, remoteImagesAllowed, summarizeSecurity(authResults), archiveEvidence)
}

func normalizeRemoteImagesPolicy(value string) (bool, error) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", "block":
		return false, nil
	case "allow":
		return true, nil
	default:
		return false, fmt.Errorf("remoteImages must be block or allow")
	}
}

func buildMessageView(identity WildDuckIdentity, deliveryKey string, idempotencyBasis string, raw []byte, remoteImagesAllowed bool, securitySummary MessageSecuritySummary, archiveEvidence *CloudflareArchiveEvidence) (MessageViewResult, error) {
	env, err := enmime.ReadEnvelope(bytes.NewReader(raw))
	if err != nil {
		return MessageViewResult{}, fmt.Errorf("parse message body: %w", err)
	}

	bodyKind := "html"
	body := strings.TrimSpace(env.HTML)
	plainText := env.Text
	if body == "" {
		bodyKind = "text"
		body = plainTextToHTML(env.Text)
	} else if strings.TrimSpace(plainText) == "" {
		plainText = htmlToPlainText(env.HTML)
	}
	transform, err := transformDisplayHTML(body, remoteImagesAllowed, ownedInlineContentIDs(env))
	if err != nil {
		return MessageViewResult{}, err
	}
	return MessageViewResult{
		DeliveryKey:         deliveryKey,
		IdempotencyBasis:    idempotencyBasis,
		Source:              sourceEvidenceFromArchive(archiveEvidence),
		WildDuck:            identity,
		BodyKind:            bodyKind,
		DisplayHTML:         transform.HTML,
		PlainText:           plainText,
		ExternalLinks:       transform.ExternalLinks,
		RemoteImages:        transform.RemoteImages,
		InlineImages:        transform.InlineImages,
		Attachments:         messageAttachments(env),
		RemoteImagesAllowed: remoteImagesAllowed,
		SecuritySummary:     securitySummary,
	}, nil
}

func sourceEvidenceFromArchive(archive *CloudflareArchiveEvidence) MessageSourceEvidence {
	source := MessageSourceEvidence{
		DisplaySource:         "wildduck-message-eml",
		DisplaySourceExactRaw: false,
	}
	if archive == nil {
		return source
	}
	source.CloudflareArchiveState = archive.Status
	source.CloudflareArchiveReason = archive.Reason
	source.CloudflareRawKey = archive.RawKey
	source.CloudflareEdgeKey = archive.EdgeKey
	source.CloudflareRawSHA256 = archive.RawSHA256
	return source
}

func messageAttachments(env *enmime.Envelope) []MessageAttachment {
	if env == nil {
		return nil
	}
	parts := append([]*enmime.Part{}, env.Attachments...)
	parts = append(parts, env.Inlines...)
	attachments := make([]MessageAttachment, 0, len(parts))
	for _, part := range parts {
		if part == nil {
			continue
		}
		attachments = append(attachments, MessageAttachment{
			ID:          part.PartID,
			Filename:    part.FileName,
			ContentType: part.ContentType,
			ContentID:   part.ContentID,
			Disposition: part.Disposition,
			Size:        len(part.Content),
		})
	}
	if len(attachments) == 0 {
		return nil
	}
	return attachments
}

type inlineImagePart struct {
	AttachmentID string
	ContentID    string
	Source       string
}

func ownedInlineContentIDs(env *enmime.Envelope) map[string]inlineImagePart {
	ids := map[string]inlineImagePart{}
	if env == nil {
		return ids
	}
	for _, part := range env.Inlines {
		if part == nil {
			continue
		}
		contentID := normalizeContentID(part.ContentID)
		if contentID != "" {
			ids[contentID] = inlineImagePart{
				AttachmentID: part.PartID,
				ContentID:    contentID,
				Source:       "cid:" + contentID,
			}
		}
	}
	return ids
}

func plainTextToHTML(value string) string {
	if value == "" {
		return ""
	}
	escaped := htmltemplate.HTMLEscapeString(value)
	return strings.ReplaceAll(escaped, "\n", "<br>\n")
}

func htmlToPlainText(value string) string {
	contextNode := &xhtml.Node{Type: xhtml.ElementNode, Data: "body", DataAtom: atom.Body}
	nodes, err := xhtml.ParseFragment(strings.NewReader(value), contextNode)
	if err != nil {
		return ""
	}
	var builder strings.Builder
	var walk func(*xhtml.Node)
	walk = func(node *xhtml.Node) {
		switch node.Type {
		case xhtml.TextNode:
			text := strings.TrimSpace(node.Data)
			if text != "" {
				if builder.Len() > 0 {
					builder.WriteByte(' ')
				}
				builder.WriteString(text)
			}
		case xhtml.ElementNode:
			switch strings.ToLower(node.Data) {
			case "br", "p", "div", "li", "tr", "table", "blockquote", "section", "article":
				if builder.Len() > 0 {
					builder.WriteByte('\n')
				}
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	for _, node := range nodes {
		walk(node)
	}
	lines := strings.Split(builder.String(), "\n")
	kept := lines[:0]
	for _, line := range lines {
		line = strings.Join(strings.Fields(line), " ")
		if line != "" {
			kept = append(kept, line)
		}
	}
	return strings.Join(kept, "\n")
}

type htmlTransformResult struct {
	HTML          string
	ExternalLinks []ExternalLink
	RemoteImages  []RemoteImage
	InlineImages  []InlineImage
}

func transformDisplayHTML(body string, remoteImagesAllowed bool, inlineContentIDs map[string]inlineImagePart) (htmlTransformResult, error) {
	contextNode := &xhtml.Node{Type: xhtml.ElementNode, Data: "body", DataAtom: atom.Body}
	nodes, err := xhtml.ParseFragment(strings.NewReader(body), contextNode)
	if err != nil {
		return htmlTransformResult{}, fmt.Errorf("parse message html: %w", err)
	}
	result := htmlTransformResult{
		ExternalLinks: []ExternalLink{},
		RemoteImages:  []RemoteImage{},
		InlineImages:  []InlineImage{},
	}
	for _, node := range nodes {
		transformHTMLNode(node, &result, remoteImagesAllowed, inlineContentIDs)
	}

	var rendered strings.Builder
	for _, node := range nodes {
		if err := xhtml.Render(&rendered, node); err != nil {
			return htmlTransformResult{}, fmt.Errorf("render transformed message html: %w", err)
		}
	}
	result.HTML = displayHTMLSanitizer.Sanitize(rendered.String())
	return result, nil
}

func transformHTMLNode(node *xhtml.Node, result *htmlTransformResult, remoteImagesAllowed bool, inlineContentIDs map[string]inlineImagePart) {
	if node.Type == xhtml.ElementNode {
		stripMessageControlledAttributes(node)
		switch strings.ToLower(node.Data) {
		case "a":
			transformAnchor(node, result)
		case "img":
			transformImage(node, result, remoteImagesAllowed, inlineContentIDs)
		}
	}
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		transformHTMLNode(child, result, remoteImagesAllowed, inlineContentIDs)
	}
}

func transformAnchor(node *xhtml.Node, result *htmlTransformResult) {
	rawHref, ok := getHTMLAttr(node, "href")
	delHTMLAttr(node, "target")
	if !ok {
		return
	}
	parsed, external := parseExternalLink(rawHref)
	if !external {
		if parsed == nil || disallowedURLScheme(parsed.Scheme) || !strings.HasPrefix(strings.TrimSpace(rawHref), "#") {
			delHTMLAttr(node, "href")
		}
		return
	}
	id := fmt.Sprintf("link-%d", len(result.ExternalLinks)+1)
	result.ExternalLinks = append(result.ExternalLinks, ExternalLink{
		ID:     id,
		URL:    parsed.String(),
		Scheme: parsed.Scheme,
		Host:   parsed.Host,
		Text:   strings.TrimSpace(nodeText(node)),
	})
	// Email links previously navigated the sandboxed iframe. Keep a harmless
	// in-document target and let the parent UI open confirmed destinations.
	setHTMLAttr(node, "href", "#agent-mail-external-"+id)
	setHTMLAttr(node, "data-agent-mail-external-link-id", id)
	setHTMLAttr(node, "rel", "noopener noreferrer")
}

func transformImage(node *xhtml.Node, result *htmlTransformResult, remoteImagesAllowed bool, inlineContentIDs map[string]inlineImagePart) {
	alt, _ := getHTMLAttr(node, "alt")
	delHTMLAttr(node, "sizes")
	delHTMLAttr(node, "srcset")
	rawSrc, ok := getHTMLAttr(node, "src")
	if !ok {
		return
	}
	parsed, err := url.Parse(strings.TrimSpace(rawSrc))
	if err != nil {
		delHTMLAttr(node, "src")
		return
	}
	if isRemoteURL(parsed) {
		id := addRemoteImage(result, rawSrc, alt)
		if !remoteImagesAllowed {
			delHTMLAttr(node, "src")
			setHTMLAttr(node, "data-agent-mail-remote-image-id", id)
			setHTMLAttr(node, "data-agent-mail-remote-image-src", rawSrc)
		}
		return
	}
	if parsed.Scheme == "cid" {
		if inline, ok := inlineContentIDs[normalizeContentID(parsed.Opaque)]; ok {
			result.InlineImages = append(result.InlineImages, InlineImage{
				Source:       rawSrc,
				AttachmentID: inline.AttachmentID,
				ContentID:    inline.ContentID,
				Alt:          alt,
			})
			return
		}
		delHTMLAttr(node, "src")
		return
	}
	delHTMLAttr(node, "src")
}

func addRemoteImage(result *htmlTransformResult, rawURL string, alt string) string {
	parsed, _ := url.Parse(strings.TrimSpace(rawURL))
	id := fmt.Sprintf("image-%d", len(result.RemoteImages)+1)
	result.RemoteImages = append(result.RemoteImages, RemoteImage{
		ID:     id,
		URL:    strings.TrimSpace(rawURL),
		Scheme: parsed.Scheme,
		Host:   parsed.Host,
		Alt:    alt,
	})
	return id
}

func normalizeContentID(value string) string {
	return strings.Trim(strings.TrimSpace(value), "<>")
}

func parseExternalLink(raw string) (*url.URL, bool) {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return nil, false
	}
	if parsed.Host != "" && parsed.Scheme == "" {
		parsed.Scheme = "https"
	}
	switch strings.ToLower(parsed.Scheme) {
	case "http", "https", "mailto":
		return parsed, true
	default:
		return parsed, false
	}
}

func disallowedURLScheme(scheme string) bool {
	switch strings.ToLower(strings.TrimSpace(scheme)) {
	case "", "cid", "data", "http", "https", "mailto":
		return false
	default:
		return true
	}
}

func isRemoteURL(parsed *url.URL) bool {
	if parsed == nil {
		return false
	}
	if parsed.Host != "" && parsed.Scheme == "" {
		return true
	}
	switch strings.ToLower(parsed.Scheme) {
	case "http", "https":
		return true
	default:
		return false
	}
}

func getHTMLAttr(node *xhtml.Node, key string) (string, bool) {
	for _, attr := range node.Attr {
		if htmlAttrMatches(attr, key) {
			return attr.Val, true
		}
	}
	return "", false
}

func setHTMLAttr(node *xhtml.Node, key string, value string) {
	for i := range node.Attr {
		if htmlAttrMatches(node.Attr[i], key) {
			node.Attr[i].Namespace = ""
			node.Attr[i].Key = key
			node.Attr[i].Val = value
			return
		}
	}
	node.Attr = append(node.Attr, xhtml.Attribute{Key: key, Val: value})
}

func delHTMLAttr(node *xhtml.Node, key string) {
	attrs := node.Attr[:0]
	for _, attr := range node.Attr {
		if htmlAttrMatches(attr, key) {
			continue
		}
		attrs = append(attrs, attr)
	}
	node.Attr = attrs
}

func htmlAttrMatches(attr xhtml.Attribute, key string) bool {
	if strings.EqualFold(attr.Key, key) {
		return true
	}
	if strings.EqualFold(key, "xlink:href") {
		return strings.EqualFold(attr.Namespace, "xlink") && strings.EqualFold(attr.Key, "href")
	}
	return false
}

func stripMessageControlledAttributes(node *xhtml.Node) {
	attrs := node.Attr[:0]
	for _, attr := range node.Attr {
		key := strings.ToLower(attr.Key)
		if strings.HasPrefix(key, "data-agent-mail-") {
			continue
		}
		switch key {
		case "background", "poster", "sizes", "srcset", "style":
			continue
		default:
			attrs = append(attrs, attr)
		}
	}
	node.Attr = attrs
}

func newDisplayHTMLSanitizer() *bluemonday.Policy {
	policy := bluemonday.NewPolicy()
	policy.AllowElements(
		"a",
		"abbr",
		"address",
		"article",
		"aside",
		"b",
		"blockquote",
		"br",
		"caption",
		"cite",
		"code",
		"col",
		"colgroup",
		"dd",
		"del",
		"details",
		"dfn",
		"div",
		"dl",
		"dt",
		"em",
		"figcaption",
		"figure",
		"h1",
		"h2",
		"h3",
		"h4",
		"h5",
		"h6",
		"hr",
		"i",
		"img",
		"ins",
		"kbd",
		"li",
		"mark",
		"ol",
		"p",
		"picture",
		"pre",
		"q",
		"s",
		"samp",
		"section",
		"small",
		"span",
		"strong",
		"sub",
		"summary",
		"sup",
		"table",
		"tbody",
		"td",
		"tfoot",
		"th",
		"thead",
		"time",
		"tr",
		"u",
		"ul",
		"var",
	)
	policy.RequireParseableURLs(true)
	policy.AllowRelativeURLs(true)
	policy.AllowURLSchemes("cid", "http", "https", "mailto")

	policy.AllowAttrs("href").OnElements("a")
	policy.AllowAttrs("rel").Matching(linkRelValue).OnElements("a")
	policy.AllowAttrs("data-agent-mail-external-link-id").Matching(agentMailTokenValue).OnElements("a")
	policy.AllowAttrs("data-agent-mail-remote-image-id").Matching(agentMailTokenValue).OnElements("img")
	policy.AllowAttrs("data-agent-mail-remote-image-src").Matching(remoteImageURLValue).OnElements("img")
	policy.AllowAttrs("src").OnElements("img")
	policy.AllowAttrs("alt").Matching(bluemonday.Paragraph).OnElements("img")
	policy.AllowAttrs("height", "width").Matching(bluemonday.NumberOrPercent).OnElements("img", "table", "td", "th", "col", "colgroup")
	policy.AllowAttrs("colspan", "rowspan").Matching(bluemonday.Integer).OnElements("td", "th")
	policy.AllowAttrs("title").Matching(bluemonday.Paragraph).Globally()
	policy.AllowAttrs("dir").Matching(bluemonday.Direction).Globally()
	policy.AllowAttrs("lang").Matching(regexp.MustCompile(`^[a-zA-Z]{2,20}$`)).Globally()
	return policy
}

func nodeText(node *xhtml.Node) string {
	var builder strings.Builder
	var walk func(*xhtml.Node)
	walk = func(n *xhtml.Node) {
		if n.Type == xhtml.TextNode {
			builder.WriteString(n.Data)
		}
		for child := n.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(node)
	return builder.String()
}
