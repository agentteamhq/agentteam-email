package sesmail

import (
	"context"
	"fmt"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/ses"
	"github.com/aws/aws-sdk-go-v2/service/ses/types"
)

const MaxRawMessageBytes = 10 * 1024 * 1024

type SendRequest struct {
	RawMessage []byte
	Recipients []string
}

type SendResult struct {
	MessageID string
	Queued    []string
}

type Client struct {
	ses *ses.Client
}

func New(ctx context.Context, region string, accessKeyID string, secretAccessKey string, endpoint string) (*Client, error) {
	if strings.TrimSpace(region) == "" {
		return nil, fmt.Errorf("missing aws region")
	}
	if strings.TrimSpace(accessKeyID) == "" {
		return nil, fmt.Errorf("missing aws access key id")
	}
	if strings.TrimSpace(secretAccessKey) == "" {
		return nil, fmt.Errorf("missing aws secret access key")
	}

	cfg, err := config.LoadDefaultConfig(ctx,
		config.WithRegion(strings.TrimSpace(region)),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			strings.TrimSpace(accessKeyID),
			strings.TrimSpace(secretAccessKey),
			"",
		)),
	)
	if err != nil {
		return nil, fmt.Errorf("load ses config: %w", err)
	}

	return &Client{ses: ses.NewFromConfig(cfg, func(opts *ses.Options) {
		if strings.TrimSpace(endpoint) != "" {
			opts.BaseEndpoint = aws.String(strings.TrimSpace(endpoint))
		}
	})}, nil
}

func (c *Client) SendRaw(ctx context.Context, req SendRequest) (SendResult, error) {
	if len(req.RawMessage) == 0 {
		return SendResult{}, fmt.Errorf("ses send request is missing raw message")
	}
	if len(req.RawMessage) > MaxRawMessageBytes {
		return SendResult{}, fmt.Errorf("ses raw message exceeds the %d byte limit", MaxRawMessageBytes)
	}
	if len(req.Recipients) == 0 {
		return SendResult{}, fmt.Errorf("ses send request is missing recipients")
	}

	// Do not set Source here. For SendRawEmail, leaving Source unset lets SES use
	// the raw message Return-Path header for email feedback forwarding when one is
	// present, otherwise SES falls back to the raw From header.
	result, err := c.ses.SendRawEmail(ctx, &ses.SendRawEmailInput{
		Destinations: req.Recipients,
		RawMessage: &types.RawMessage{
			Data: req.RawMessage,
		},
	})
	if err != nil {
		return SendResult{}, fmt.Errorf("ses send raw email: %w", err)
	}
	if result.MessageId == nil || strings.TrimSpace(*result.MessageId) == "" {
		return SendResult{}, fmt.Errorf("ses send raw email returned an empty message id")
	}

	return SendResult{
		MessageID: strings.TrimSpace(*result.MessageId),
		Queued:    append([]string{}, req.Recipients...),
	}, nil
}
