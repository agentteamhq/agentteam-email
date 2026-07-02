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

type runtimeSnapshotResponse struct {
	Domains []controlstate.DomainConfigParams `json:"domains"`
}

type runtimeBootstrapConfig struct {
	BaseURL string
	Token   string
}

func bootstrapRuntimeProjectionFromWeb(ctx context.Context, store controlstate.Store, selectedProvider string, cfg runtimeBootstrapConfig) {
	bootstrapCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	snapshot, err := fetchRuntimeProjectionSnapshot(bootstrapCtx, cfg.BaseURL, cfg.Token)
	if err != nil {
		log.Printf("agent-mail-control-service event=runtime_bootstrap_failed error=%q", err)
		return
	}
	_, changed, err := controlstate.SyncRuntimeDomains(bootstrapCtx, store, selectedProvider, snapshot.Domains, time.Now().UTC())
	if err != nil {
		log.Printf("agent-mail-control-service event=runtime_bootstrap_apply_failed error=%q", err)
		return
	}
	log.Printf("agent-mail-control-service event=runtime_bootstrap_applied domains=%d changed=%t", len(snapshot.Domains), changed)
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
