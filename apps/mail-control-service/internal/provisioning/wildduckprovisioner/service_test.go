package wildduckprovisioner

import (
	"errors"
	"strings"
	"testing"
)

func TestSanitizeLogErrorRedactsMailbox(t *testing.T) {
	got := sanitizeLogError(errors.New("wildduck failed for Agent.One+tag@example.com\nwith details"))

	if strings.Contains(got, "Agent.One") || strings.Contains(got, "\n") {
		t.Fatalf("sanitized provisioner error retained sensitive or multiline value: %q", got)
	}
	if !strings.Contains(got, "[email]") {
		t.Fatalf("sanitized provisioner error did not include email redaction marker: %q", got)
	}
}
