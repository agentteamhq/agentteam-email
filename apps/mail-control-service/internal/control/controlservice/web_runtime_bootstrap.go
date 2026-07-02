package controlservice

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"time"

	"mail-control-service/internal/control/controlstate"
)

const controlToWebRuntimeSnapshotPath = "/rpc/internal/agent-mail/runtime/snapshot"

const (
	runtimeBootstrapAttemptTimeout = 10 * time.Second
	runtimeBootstrapRetryInterval  = 10 * time.Second
	runtimeBootstrapRetryWindow    = 2 * time.Minute
)

type runtimeSnapshotResponse struct {
	Domains []controlstate.DomainConfigParams `json:"domains"`
}

type runtimeBootstrapConfig struct {
	BaseURL string
	Token   string
}

type runtimeBootstrapRetryPolicy struct {
	AttemptTimeout time.Duration
	RetryInterval  time.Duration
	RetryWindow    time.Duration
	Background     bool
}

type runtimeBootstrapResult struct {
	Domains int
	Changed bool
}

func bootstrapRuntimeProjectionFromWeb(ctx context.Context, store controlstate.Store, selectedProvider string, cfg runtimeBootstrapConfig) {
	bootstrapRuntimeProjectionFromWebWithRetryPolicy(ctx, store, selectedProvider, cfg, runtimeBootstrapRetryPolicy{
		AttemptTimeout: runtimeBootstrapAttemptTimeout,
		RetryInterval:  runtimeBootstrapRetryInterval,
		RetryWindow:    runtimeBootstrapRetryWindow,
		Background:     true,
	})
}

func bootstrapRuntimeProjectionFromWebWithRetryPolicy(ctx context.Context, store controlstate.Store, selectedProvider string, cfg runtimeBootstrapConfig, policy runtimeBootstrapRetryPolicy) {
	startedAt := time.Now()
	result, err := applyRuntimeProjectionSnapshotFromWeb(ctx, store, selectedProvider, cfg, policy.AttemptTimeout)
	if err == nil {
		logRuntimeBootstrapApplied(result)
		return
	}
	log.Printf("agent-mail-control-service event=runtime_bootstrap_failed error=%q", err)

	if policy.RetryInterval <= 0 || policy.RetryWindow <= 0 {
		return
	}
	remainingWindow := policy.RetryWindow - time.Since(startedAt)
	if remainingWindow <= 0 {
		log.Printf("agent-mail-control-service event=runtime_bootstrap_retry_exhausted attempts=0")
		return
	}

	retry := func() {
		retryRuntimeProjectionBootstrap(ctx, store, selectedProvider, cfg, policy, remainingWindow)
	}
	if policy.Background {
		go retry()
		return
	}
	retry()
}

func retryRuntimeProjectionBootstrap(ctx context.Context, store controlstate.Store, selectedProvider string, cfg runtimeBootstrapConfig, policy runtimeBootstrapRetryPolicy, retryWindow time.Duration) {
	retryCtx, cancel := context.WithTimeout(ctx, retryWindow)
	defer cancel()
	ticker := time.NewTicker(policy.RetryInterval)
	defer ticker.Stop()

	attempts := 0
	for {
		select {
		case <-retryCtx.Done():
			log.Printf("agent-mail-control-service event=runtime_bootstrap_retry_exhausted attempts=%d error=%q", attempts, retryCtx.Err())
			return
		case <-ticker.C:
			attempts++
			result, err := applyRuntimeProjectionSnapshotFromWeb(retryCtx, store, selectedProvider, cfg, policy.AttemptTimeout)
			if err != nil {
				log.Printf("agent-mail-control-service event=runtime_bootstrap_retry_failed attempt=%d error=%q", attempts, err)
				continue
			}
			logRuntimeBootstrapApplied(result)
			return
		}
	}
}

func applyRuntimeProjectionSnapshotFromWeb(ctx context.Context, store controlstate.Store, selectedProvider string, cfg runtimeBootstrapConfig, attemptTimeout time.Duration) (runtimeBootstrapResult, error) {
	if attemptTimeout <= 0 {
		attemptTimeout = runtimeBootstrapAttemptTimeout
	}
	bootstrapCtx, cancel := context.WithTimeout(ctx, attemptTimeout)
	defer cancel()

	snapshot, err := fetchRuntimeProjectionSnapshot(bootstrapCtx, cfg.BaseURL, cfg.Token)
	if err != nil {
		return runtimeBootstrapResult{}, err
	}
	_, changed, err := controlstate.SyncRuntimeDomains(bootstrapCtx, store, selectedProvider, snapshot.Domains, time.Now().UTC())
	if err != nil {
		return runtimeBootstrapResult{}, fmt.Errorf("apply web runtime snapshot: %w", err)
	}
	return runtimeBootstrapResult{
		Domains: len(snapshot.Domains),
		Changed: changed,
	}, nil
}

func logRuntimeBootstrapApplied(result runtimeBootstrapResult) {
	log.Printf("agent-mail-control-service event=runtime_bootstrap_applied domains=%d changed=%t", result.Domains, result.Changed)
}

func fetchRuntimeProjectionSnapshot(ctx context.Context, baseURL string, token string) (runtimeSnapshotResponse, error) {
	endpoint, err := url.JoinPath(baseURL, controlToWebRuntimeSnapshotPath)
	if err != nil {
		return runtimeSnapshotResponse{}, fmt.Errorf("build web runtime snapshot URL: %w", err)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return runtimeSnapshotResponse{}, fmt.Errorf("build web runtime snapshot request: %w", err)
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("X-Agent-Mail-Control-Web-Token", token)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return runtimeSnapshotResponse{}, fmt.Errorf("request web runtime snapshot: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return runtimeSnapshotResponse{}, fmt.Errorf("web runtime snapshot returned HTTP %d", response.StatusCode)
	}
	var snapshot runtimeSnapshotResponse
	if err := json.NewDecoder(response.Body).Decode(&snapshot); err != nil {
		return runtimeSnapshotResponse{}, fmt.Errorf("decode web runtime snapshot: %w", err)
	}
	return snapshot, nil
}
