package messageprovenance

type ViewParams struct {
	WildDuckUserID    string `json:"wildDuckUserId" doc:"WildDuck user ObjectId"`
	WildDuckMailboxID string `json:"wildDuckMailboxId" doc:"WildDuck mailbox ObjectId"`
	WildDuckUID       int    `json:"wildDuckUid" doc:"WildDuck mailbox UID for the delivered message"`
	WildDuckMessageID string `json:"wildDuckMessageId,omitempty" doc:"Optional WildDuck message ObjectId from an update event"`
	RemoteImages      string `json:"remoteImages,omitempty" enum:"block,allow" doc:"Remote image policy for the rendered message body"`
}

type MessageViewResult struct {
	DeliveryKey         string                 `json:"deliveryKey"`
	IdempotencyBasis    string                 `json:"idempotencyBasis"`
	Source              MessageSourceEvidence  `json:"source"`
	WildDuck            WildDuckIdentity       `json:"wildDuck"`
	BodyKind            string                 `json:"bodyKind"`
	DisplayHTML         string                 `json:"displayHtml"`
	PlainText           string                 `json:"plainText,omitempty"`
	ExternalLinks       []ExternalLink         `json:"externalLinks"`
	RemoteImages        []RemoteImage          `json:"remoteImages"`
	InlineImages        []InlineImage          `json:"inlineImages"`
	Attachments         []MessageAttachment    `json:"attachments,omitempty"`
	RemoteImagesAllowed bool                   `json:"remoteImagesAllowed"`
	SecuritySummary     MessageSecuritySummary `json:"securitySummary"`
}

type MessageSourceEvidence struct {
	DisplaySource           string `json:"displaySource"`
	DisplaySourceExactRaw   bool   `json:"displaySourceExactRaw"`
	CloudflareRawKey        string `json:"cloudflareRawKey,omitempty"`
	CloudflareEdgeKey       string `json:"cloudflareEdgeKey,omitempty"`
	CloudflareRawSHA256     string `json:"cloudflareRawSha256,omitempty"`
	CloudflareArchiveState  string `json:"cloudflareArchiveState,omitempty"`
	CloudflareArchiveReason string `json:"cloudflareArchiveReason,omitempty"`
}

type ExternalLink struct {
	ID     string `json:"id"`
	URL    string `json:"url"`
	Scheme string `json:"scheme,omitempty"`
	Host   string `json:"host,omitempty"`
	Text   string `json:"text,omitempty"`
}

type RemoteImage struct {
	ID     string `json:"id"`
	URL    string `json:"url"`
	Scheme string `json:"scheme,omitempty"`
	Host   string `json:"host,omitempty"`
	Alt    string `json:"alt,omitempty"`
}

type InlineImage struct {
	Source       string `json:"source"`
	AttachmentID string `json:"attachmentId,omitempty"`
	ContentID    string `json:"contentId,omitempty"`
	Alt          string `json:"alt,omitempty"`
}

type MessageAttachment struct {
	ID          string `json:"id,omitempty"`
	Filename    string `json:"filename,omitempty"`
	ContentType string `json:"contentType,omitempty"`
	ContentID   string `json:"contentId,omitempty"`
	Disposition string `json:"disposition,omitempty"`
	Size        int    `json:"size,omitempty"`
}

type MessageSecurityResult struct {
	DeliveryKey           string                        `json:"deliveryKey"`
	IdempotencyBasis      string                        `json:"idempotencyBasis"`
	IngestID              string                        `json:"ingestId,omitempty"`
	WildDuck              WildDuckIdentity              `json:"wildDuck"`
	Source                MessageRawSource              `json:"source"`
	Cloudflare            CloudflareSecurityEvidence    `json:"cloudflare"`
	CloudflareArchive     *CloudflareArchiveEvidence    `json:"cloudflareArchive,omitempty"`
	HarakaWildDuck        HarakaWildDuckEvidence        `json:"harakaWildduck"`
	Headers               map[string]string             `json:"headers"`
	AuthenticationResults []AuthenticationResultsHeader `json:"authenticationResults"`
	ReceivedSPF           []string                      `json:"receivedSpf"`
	Rspamd                map[string]string             `json:"rspamd"`
	Warnings              []string                      `json:"warnings,omitempty"`
	Summary               MessageSecuritySummary        `json:"summary"`
}

type MessageRawSource struct {
	Source string             `json:"source"`
	Size   int                `json:"size"`
	Raw    string             `json:"raw"`
	Headers []MessageRawHeader `json:"headers"`
}

type MessageRawHeader struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

type EvidenceStatus struct {
	Status string `json:"status"`
	Reason string `json:"reason,omitempty"`
	Value  string `json:"value,omitempty"`
}

type CloudflareSecurityEvidence struct {
	ProvenanceHeaders      map[string]string             `json:"provenanceHeaders,omitempty"`
	RawKey                 string                        `json:"rawKey,omitempty"`
	EdgeKey                string                        `json:"edgeKey,omitempty"`
	RawSHA256              string                        `json:"rawSha256,omitempty"`
	EdgeEvidence           map[string]any                `json:"edgeEvidence,omitempty"`
	AuthservID             string                        `json:"authservId,omitempty"`
	MailedBy               string                        `json:"mailedBy,omitempty"`
	SignedBy               string                        `json:"signedBy,omitempty"`
	AuthenticationResults  []AuthenticationResultsHeader `json:"authenticationResults,omitempty"`
	ReceivedSPF            []string                      `json:"receivedSpf,omitempty"`
	Received               []string                      `json:"received,omitempty"`
	OriginalSmtpPeerIP     EvidenceStatus                `json:"originalSmtpPeerIp"`
	PerMessageAuthVerdicts CloudflareAuthVerdictSet      `json:"perMessageAuthVerdicts"`
}

type CloudflareAuthVerdictSet struct {
	SPF   EvidenceStatus `json:"spf"`
	DKIM  EvidenceStatus `json:"dkim"`
	ARC   EvidenceStatus `json:"arc"`
	DMARC EvidenceStatus `json:"dmarc"`
	BIMI  EvidenceStatus `json:"bimi"`
}

type CloudflareArchiveEvidence struct {
	Status                string                        `json:"status"`
	Reason                string                        `json:"reason,omitempty"`
	RawKey                string                        `json:"rawKey,omitempty"`
	EdgeKey               string                        `json:"edgeKey,omitempty"`
	RawSHA256             string                        `json:"rawSha256,omitempty"`
	EdgeEvidence          map[string]any                `json:"edgeEvidence,omitempty"`
	RawSource             *MessageRawSource             `json:"rawSource,omitempty"`
	AuthenticationResults []AuthenticationResultsHeader `json:"authenticationResults,omitempty"`
	ReceivedSPF           []string                      `json:"receivedSpf,omitempty"`
	Received              []string                      `json:"received,omitempty"`
}

type HarakaWildDuckEvidence struct {
	Source     string                      `json:"source"`
	AuthservID string                      `json:"authservId,omitempty"`
	Trusted    bool                        `json:"trusted"`
	MailAuth   map[string]MailAuthEvidence `json:"mailauth"`
}

type MailAuthEvidence struct {
	Result     string `json:"result"`
	Scope      string `json:"scope"`
	Domain     string `json:"domain,omitempty"`
	Identifier string `json:"identifier,omitempty"`
	Reason     string `json:"reason,omitempty"`
	Source     string `json:"source,omitempty"`
	Note       string `json:"note,omitempty"`
}

type AuthenticationResultsHeader struct {
	Index      int          `json:"index"`
	AuthservID string       `json:"authservId,omitempty"`
	Trusted    bool         `json:"trusted"`
	Raw        string       `json:"raw"`
	Methods    []AuthMethod `json:"methods,omitempty"`
	ParseError string       `json:"parseError,omitempty"`
}

type AuthMethod struct {
	Method     string            `json:"method"`
	Result     string            `json:"result"`
	Reason     string            `json:"reason,omitempty"`
	Properties map[string]string `json:"properties,omitempty"`
}

type MessageSecuritySummary struct {
	SPF        SecuritySignal `json:"spf"`
	DKIM       SecuritySignal `json:"dkim"`
	DMARC      SecuritySignal `json:"dmarc"`
	ARC        SecuritySignal `json:"arc"`
	MailedBy   string         `json:"mailedBy,omitempty"`
	SignedBy   string         `json:"signedBy,omitempty"`
	SPFContext string         `json:"spfContext,omitempty"`
}

type SecuritySignal struct {
	Result     string `json:"result"`
	Domain     string `json:"domain,omitempty"`
	Identifier string `json:"identifier,omitempty"`
	Reason     string `json:"reason,omitempty"`
	Source     string `json:"source,omitempty"`
	Note       string `json:"note,omitempty"`
}
