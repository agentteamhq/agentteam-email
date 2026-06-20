package r2archive

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sort"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/smithy-go"
)

type Config struct {
	Endpoint string `yaml:"endpoint"`
	Region   string `yaml:"region"`
	Bucket   string `yaml:"bucket"`
}

type Client struct {
	bucket string
	s3     *s3.Client
}

func New(ctx context.Context, cfg Config, accessKeyID string, secretAccessKey string) (*Client, error) {
	if cfg.Endpoint == "" {
		return nil, fmt.Errorf("missing r2 endpoint")
	}
	if cfg.Region == "" {
		return nil, fmt.Errorf("missing r2 region")
	}
	if cfg.Bucket == "" {
		return nil, fmt.Errorf("missing r2 bucket")
	}
	if accessKeyID == "" {
		return nil, fmt.Errorf("missing r2 access key id")
	}
	if secretAccessKey == "" {
		return nil, fmt.Errorf("missing r2 secret access key")
	}

	awsCfg, err := awsconfig.LoadDefaultConfig(
		ctx,
		awsconfig.WithRegion(cfg.Region),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKeyID, secretAccessKey, "")),
	)
	if err != nil {
		return nil, fmt.Errorf("load aws config: %w", err)
	}

	client := s3.NewFromConfig(awsCfg, func(opts *s3.Options) {
		opts.BaseEndpoint = &cfg.Endpoint
		opts.UsePathStyle = true
	})

	return &Client{
		bucket: cfg.Bucket,
		s3:     client,
	}, nil
}

func (c *Client) List(ctx context.Context, prefix string, continuationToken *string) (*s3.ListObjectsV2Output, error) {
	result, err := c.s3.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
		Bucket:            &c.bucket,
		Prefix:            &prefix,
		ContinuationToken: continuationToken,
	})
	if err != nil {
		return nil, fmt.Errorf("list prefix %q: %w", prefix, err)
	}

	sort.Slice(result.Contents, func(i, j int) bool {
		return *result.Contents[i].Key < *result.Contents[j].Key
	})

	return result, nil
}

func (c *Client) GetBytes(ctx context.Context, key string) ([]byte, error) {
	result, err := c.s3.GetObject(ctx, &s3.GetObjectInput{
		Bucket: &c.bucket,
		Key:    &key,
	})
	if err != nil {
		return nil, fmt.Errorf("get object %q: %w", key, err)
	}
	defer result.Body.Close()

	data, err := io.ReadAll(result.Body)
	if err != nil {
		return nil, fmt.Errorf("read object %q: %w", key, err)
	}

	return data, nil
}

func (c *Client) PutBytes(ctx context.Context, key string, contentType string, data []byte) error {
	if len(data) == 0 {
		return fmt.Errorf("refusing to write empty object for key %q", key)
	}

	_, err := c.s3.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      &c.bucket,
		Key:         &key,
		Body:        bytes.NewReader(data),
		ContentType: &contentType,
	})
	if err != nil {
		return fmt.Errorf("put object %q: %w", key, err)
	}

	return nil
}

func (c *Client) PutJSON(ctx context.Context, key string, value any) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal json for %q: %w", key, err)
	}
	data = append(data, '\n')
	return c.PutBytes(ctx, key, "application/json", data)
}

func (c *Client) Delete(ctx context.Context, key string) error {
	_, err := c.s3.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: &c.bucket,
		Key:    &key,
	})
	if err != nil {
		return fmt.Errorf("delete object %q: %w", key, err)
	}
	return nil
}

func (c *Client) Exists(ctx context.Context, key string) (bool, error) {
	_, err := c.s3.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: &c.bucket,
		Key:    &key,
	})
	if err == nil {
		return true, nil
	}

	var apiErr smithy.APIError
	if errors.As(err, &apiErr) && (apiErr.ErrorCode() == "NotFound" || apiErr.ErrorCode() == "NoSuchKey") {
		return false, nil
	}
	return false, fmt.Errorf("head object %q: %w", key, err)
}
