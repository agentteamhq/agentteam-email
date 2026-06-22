package atemail

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestReleaseAssetName(t *testing.T) {
	got, err := releaseAssetName("v1.2.3", "linux", "amd64")
	if err != nil {
		t.Fatalf("releaseAssetName returned error: %v", err)
	}
	if got != "at-email_1.2.3_linux_amd64" {
		t.Fatalf("asset = %q", got)
	}
	got, err = releaseAssetName("v1.2.3", "windows", "arm64")
	if err != nil {
		t.Fatalf("releaseAssetName returned error: %v", err)
	}
	if got != "at-email_1.2.3_windows_arm64.exe" {
		t.Fatalf("asset = %q", got)
	}
}

func TestVerifyReleaseChecksum(t *testing.T) {
	data := []byte("hello")
	sum := sha256.Sum256(data)
	checksums := hex.EncodeToString(sum[:]) + "  at-email_1.2.3_linux_amd64\n"
	if err := verifyReleaseChecksum(data, checksums, "at-email_1.2.3_linux_amd64"); err != nil {
		t.Fatalf("verifyReleaseChecksum returned error: %v", err)
	}
}

func TestVerifyReleaseChecksumRejectsMismatch(t *testing.T) {
	checksums := strings.Repeat("0", 64) + "  at-email_1.2.3_linux_amd64\n"
	err := verifyReleaseChecksum([]byte("hello"), checksums, "at-email_1.2.3_linux_amd64")
	if err == nil || !strings.Contains(err.Error(), "checksum mismatch") {
		t.Fatalf("error = %v", err)
	}
}

func TestSelfUpdateRejectsNPMDistribution(t *testing.T) {
	t.Setenv(updateDistributionEnv, "npm")

	_, err := selfUpdate(context.Background(), "v1.2.2", "v1.2.3")
	if err == nil || !strings.Contains(err.Error(), "self-update is disabled for the npm distribution") {
		t.Fatalf("error = %v", err)
	}
}

func TestUpdateNoticeReportsNPMDistributionPackageUpdate(t *testing.T) {
	t.Setenv(updateDistributionEnv, "npm")
	t.Setenv("XDG_CACHE_HOME", t.TempDir())

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"tag_name":"v1.2.3"}`))
	}))
	defer server.Close()

	prevClient := updateHTTPClient
	prevURL := updateLatestReleaseAPIURL
	updateHTTPClient = server.Client()
	updateLatestReleaseAPIURL = server.URL
	defer func() {
		updateHTTPClient = prevClient
		updateLatestReleaseAPIURL = prevURL
	}()

	got, err := updateNotice(context.Background(), "v1.2.2")
	if err != nil {
		t.Fatalf("updateNotice returned error: %v", err)
	}
	want := "update available: v1.2.3 -> update `@agentteamhq/email` with your package manager or run `npx @agentteamhq/email@latest`"
	if got != want {
		t.Fatalf("notice = %q, want %q", got, want)
	}
}

func TestLatestReleaseVersion(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Accept") != "application/vnd.github+json" {
			t.Fatalf("Accept = %q", r.Header.Get("Accept"))
		}
		_, _ = w.Write([]byte(`{"tag_name":"v1.2.3"}`))
	}))
	defer server.Close()

	prevClient := updateHTTPClient
	prevURL := updateLatestReleaseAPIURL
	updateHTTPClient = server.Client()
	updateLatestReleaseAPIURL = server.URL
	defer func() {
		updateHTTPClient = prevClient
		updateLatestReleaseAPIURL = prevURL
	}()

	got, err := latestReleaseVersion(context.Background())
	if err != nil {
		t.Fatalf("latestReleaseVersion returned error: %v", err)
	}
	if got != "v1.2.3" {
		t.Fatalf("version = %q", got)
	}
}

func TestCachedLatestReleaseVersionUsesCache(t *testing.T) {
	dir := t.TempDir()
	prev := os.Getenv("XDG_CACHE_HOME")
	if err := os.Setenv("XDG_CACHE_HOME", dir); err != nil {
		t.Fatalf("Setenv returned error: %v", err)
	}
	defer func() {
		_ = os.Setenv("XDG_CACHE_HOME", prev)
	}()

	cachePath, err := updateCacheFilePath()
	if err != nil {
		t.Fatalf("updateCacheFilePath returned error: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(cachePath), 0o755); err != nil {
		t.Fatalf("MkdirAll returned error: %v", err)
	}
	entry := updateCacheEntry{CheckedAt: time.Now().UTC(), LatestVersion: "v9.9.9"}
	data, err := json.Marshal(entry)
	if err != nil {
		t.Fatalf("Marshal returned error: %v", err)
	}
	if err := os.WriteFile(cachePath, data, 0o644); err != nil {
		t.Fatalf("WriteFile returned error: %v", err)
	}

	got, err := cachedLatestReleaseVersion(context.Background())
	if err != nil {
		t.Fatalf("cachedLatestReleaseVersion returned error: %v", err)
	}
	if got != "v9.9.9" {
		t.Fatalf("version = %q", got)
	}
}

func TestUpdateNoticeReportsNewerVersion(t *testing.T) {
	prev := os.Getenv("XDG_CACHE_HOME")
	if err := os.Setenv("XDG_CACHE_HOME", t.TempDir()); err != nil {
		t.Fatalf("Setenv returned error: %v", err)
	}
	defer func() {
		if prev == "" {
			_ = os.Unsetenv("XDG_CACHE_HOME")
			return
		}
		_ = os.Setenv("XDG_CACHE_HOME", prev)
	}()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"tag_name":"v1.2.3"}`))
	}))
	defer server.Close()

	prevClient := updateHTTPClient
	prevURL := updateLatestReleaseAPIURL
	updateHTTPClient = server.Client()
	updateLatestReleaseAPIURL = server.URL
	defer func() {
		updateHTTPClient = prevClient
		updateLatestReleaseAPIURL = prevURL
	}()

	got, err := updateNotice(context.Background(), "v1.2.2")
	if err != nil {
		t.Fatalf("updateNotice returned error: %v", err)
	}
	want := "update available: v1.2.3 -> run `at-email self-update`"
	if got != want {
		t.Fatalf("notice = %q, want %q", got, want)
	}
}

func TestUpdateNoticeSkipsDevVersion(t *testing.T) {
	got, err := updateNotice(context.Background(), "0.1.0-dev")
	if err != nil {
		t.Fatalf("updateNotice returned error: %v", err)
	}
	if got != "" {
		t.Fatalf("notice = %q", got)
	}
}

func TestNormalizeAndCompareReleaseVersion(t *testing.T) {
	if got := normalizeReleaseVersion("1.2.3"); got != "v1.2.3" {
		t.Fatalf("normalized = %q", got)
	}
	if !sameReleaseVersion("1.2.3", "v1.2.3") {
		t.Fatalf("expected same release version")
	}
}

func TestIsNewerReleaseVersion(t *testing.T) {
	cases := []struct {
		name    string
		current string
		latest  string
		want    bool
	}{
		{name: "patch", current: "v1.2.2", latest: "v1.2.3", want: true},
		{name: "same", current: "v1.2.3", latest: "v1.2.3"},
		{name: "older", current: "v1.3.0", latest: "v1.2.9"},
		{name: "malformed", current: "dev", latest: "v1.2.3"},
		{name: "prerelease core", current: "v1.2.2", latest: "v1.2.3-rc.1", want: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := isNewerReleaseVersion(tc.current, tc.latest)
			if got != tc.want {
				t.Fatalf("isNewerReleaseVersion(%q, %q) = %v, want %v", tc.current, tc.latest, got, tc.want)
			}
		})
	}
}

func TestParseReleaseVersion(t *testing.T) {
	got, ok := parseReleaseVersion("v1.2.3-rc.1")
	if !ok || got != [3]int{1, 2, 3} {
		t.Fatalf("parsed = %#v ok=%v", got, ok)
	}
}
