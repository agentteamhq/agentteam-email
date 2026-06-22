package cloudflareprovisioner

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"agent-mail/internal/control/controlstate"
)

func TestProvisionAppliesCatchAllAndDeletesRegularRules(t *testing.T) {
	ctx := context.Background()
	store := seededDomainStore(t)
	mock := newCloudflareMock(t)
	defer mock.server.Close()

	service, err := New(Config{
		APIBaseURL:       mock.server.URL + "/client/v4",
		AccountID:        "account-1",
		APIToken:         "token-1",
		WorkerScriptName: DefaultWorkerScriptName,
	}, store)
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	before, err := service.Status(ctx, CloudflareStatusParams{})
	if err != nil {
		t.Fatalf("Status before provision: %v", err)
	}
	if before.OK {
		t.Fatalf("pre-provision status OK = true, want false because regular rules remain and provision has not run")
	}

	result, err := service.Provision(ctx, CloudflareProvisionParams{}, time.Date(2026, 5, 21, 12, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("Provision: %v", err)
	}
	if !result.OK {
		t.Fatalf("Provision OK = false: %#v", result)
	}
	if len(result.Domains) != 1 || !result.Domains[0].Applied {
		t.Fatalf("unexpected provision result: %#v", result.Domains)
	}
	if !mock.catchAll.Enabled {
		t.Fatalf("catch-all was not enabled: %#v", mock.catchAll)
	}
	if len(mock.regularRules) != 0 {
		t.Fatalf("regular rules remain after provision: %#v", mock.regularRules)
	}

	state, err := store.State(ctx)
	if err != nil {
		t.Fatalf("store.State: %v", err)
	}
	if state.Domains[0].CloudflareProvision.LastProvisionStatus != "applied" {
		t.Fatalf("last provision status = %q", state.Domains[0].CloudflareProvision.LastProvisionStatus)
	}
	if state.Domains[0].CloudflareProvision.ZoneID != "zone-1" {
		t.Fatalf("stored zone id = %q", state.Domains[0].CloudflareProvision.ZoneID)
	}

	after, err := service.Status(ctx, CloudflareStatusParams{})
	if err != nil {
		t.Fatalf("Status after provision: %v", err)
	}
	if !after.OK {
		t.Fatalf("post-provision status OK = false: %#v", after)
	}
}

func TestProvisionFailsWhenServiceOwnedDomainConfigIsEmpty(t *testing.T) {
	service, err := New(Config{
		APIBaseURL:       "https://api.cloudflare.test/client/v4",
		AccountID:        "account-1",
		APIToken:         "token-1",
		WorkerScriptName: DefaultWorkerScriptName,
	}, controlstate.NewMemoryStore())
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := service.Provision(context.Background(), CloudflareProvisionParams{}, time.Now().UTC()); err == nil {
		t.Fatal("Provision succeeded without service-owned domain config")
	}
}

func seededDomainStore(t *testing.T) *controlstate.MemoryStore {
	t.Helper()
	store := controlstate.NewMemoryStore()
	_, _, err := controlstate.AddDomain(context.Background(), store, controlstate.ProviderCloudflare, controlstate.DomainConfigParams{
		OrganizationID:       "org-1",
		OrganizationPublicID: "org_pub_123",
		Domain:               "example.com",
		Enabled:              true,
		CloudflareZoneName:   "example.com",
		ArchivePrefix:        "orgs/org_pub_123/domains/example.com/mail/inbound",
		WorkerConnectionID:   "worker-connection-1",
		WorkerDeploymentID:   "worker-deployment-1",
		MailFromDomain:       "ei.example.com",
	}, time.Date(2026, 5, 21, 11, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("AddDomain: %v", err)
	}
	return store
}

type cloudflareMock struct {
	server       *httptest.Server
	catchAll     cloudflareRule
	regularRules []cloudflareRule
}

func newCloudflareMock(t *testing.T) *cloudflareMock {
	t.Helper()
	mock := &cloudflareMock{
		catchAll: cloudflareRule{
			ID:      "catch-all-1",
			Name:    "old catch all",
			Enabled: false,
		},
		regularRules: []cloudflareRule{
			{
				ID:      "literal-1",
				Name:    "literal support",
				Enabled: true,
				Actions: []RuleAction{
					{Type: "forward", Value: []string{"support@example.net"}},
				},
				Matchers: []RuleMatcher{{Type: "literal"}},
			},
		},
	}
	mock.server = httptest.NewServer(http.HandlerFunc(mock.handle))
	return mock
}

func (m *cloudflareMock) handle(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Authorization") != "Bearer token-1" {
		writeCloudflareFailure(w, http.StatusUnauthorized, "bad token")
		return
	}
	switch {
	case r.Method == http.MethodGet && r.URL.Path == "/client/v4/accounts/account-1/workers/scripts/agent-mail-ingress/settings":
		writeCloudflareSuccess(w, map[string]any{"script": "agent-mail-ingress"})
	case r.Method == http.MethodGet && r.URL.Path == "/client/v4/zones" && r.URL.Query().Get("name") == "example.com":
		writeCloudflareSuccess(w, []map[string]string{{"id": "zone-1"}})
	case r.Method == http.MethodGet && r.URL.Path == "/client/v4/zones/zone-1/email/routing/rules/catch_all":
		writeCloudflareSuccess(w, m.catchAll)
	case r.Method == http.MethodPut && r.URL.Path == "/client/v4/zones/zone-1/email/routing/rules/catch_all":
		var body struct {
			Actions  []RuleAction  `json:"actions"`
			Enabled  bool          `json:"enabled"`
			Matchers []RuleMatcher `json:"matchers"`
			Name     string        `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeCloudflareFailure(w, http.StatusBadRequest, err.Error())
			return
		}
		m.catchAll = cloudflareRule{
			ID:       "catch-all-1",
			Name:     body.Name,
			Enabled:  body.Enabled,
			Actions:  body.Actions,
			Matchers: body.Matchers,
		}
		writeCloudflareSuccess(w, m.catchAll)
	case r.Method == http.MethodGet && r.URL.Path == "/client/v4/zones/zone-1/email/routing/rules":
		writeCloudflareSuccess(w, m.regularRules)
	case r.Method == http.MethodDelete && r.URL.Path == "/client/v4/zones/zone-1/email/routing/rules/literal-1":
		m.regularRules = nil
		writeCloudflareSuccess(w, map[string]string{"id": "literal-1"})
	default:
		writeCloudflareFailure(w, http.StatusNotFound, r.Method+" "+r.URL.String())
	}
}

func writeCloudflareSuccess(w http.ResponseWriter, result any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"success": true,
		"result":  result,
		"errors":  []any{},
	})
}

func writeCloudflareFailure(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"success": false,
		"errors": []map[string]any{
			{"code": status, "message": message},
		},
	})
}
