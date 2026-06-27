package cloudflaremail

import (
	"encoding/json"
	"fmt"
)

const MaxRequestPayloadBytes = 5 * 1024 * 1024

type Attachment struct {
	Content     string `json:"content"`
	Filename    string `json:"filename"`
	Type        string `json:"type"`
	Disposition string `json:"disposition"`
	ContentID   string `json:"content_id,omitempty"`
}

type RawSendRequest struct {
	From        string
	Recipients  []string
	MIMEMessage []byte
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
