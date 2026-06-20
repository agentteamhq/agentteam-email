package messageprovenance

import (
	"testing"
)

func TestNewFromWildDuckAPIBaseURLUsesDirectRuntimeConfig(t *testing.T) {
	t.Setenv("AGENT_MAIL_WILDDUCK_ADMIN_ACCESS_TOKEN", "test-admin-token")

	if _, err := NewFromWildDuckAPIBaseURL("http://wildduck-api:8080", nil); err != nil {
		t.Fatalf("NewFromWildDuckAPIBaseURL: %v", err)
	}
}
