package atemail

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

const (
	updateRepoOwner        = "agentteamhq"
	updateRepoName         = "agentteam-email"
	updateBinaryName       = "at-email"
	updateChecksumAsset    = "checksums.txt"
	updateCheckTimeout     = 5 * time.Second
	updateDownloadTimeout  = 30 * time.Second
	updateUserAgent        = "at-email"
	updateCacheDirName     = "at-email"
	updateCacheFileName    = "update.json"
	updateCacheMaxDuration = 24 * time.Hour
	updateDistributionEnv  = "AT_EMAIL_DISTRIBUTION"
)

var (
	updateHTTPClient          = &http.Client{Timeout: updateCheckTimeout}
	updateLatestReleaseAPIURL = githubLatestReleaseAPIURL()
	runSelfUpdate             = selfUpdate
	runUpdateNotice           = updateNotice
)

type updateRelease struct {
	TagName string `json:"tag_name"`
}

type updateCacheEntry struct {
	CheckedAt     time.Time `json:"checked_at"`
	LatestVersion string    `json:"latest_version"`
}

func selfUpdate(ctx context.Context, currentVersion string, targetVersion string) (string, error) {
	if isNPMDistribution() {
		return "", errors.New("self-update is disabled for the npm distribution; update @agentteamhq/email with npm or run `npx @agentteamhq/email@latest`")
	}
	if runtime.GOOS == "windows" {
		return "", errors.New("self-update is not supported on windows yet")
	}

	version := normalizeReleaseVersion(targetVersion)
	if version == "" {
		latest, err := latestReleaseVersion(ctx)
		if err != nil {
			return "", err
		}
		version = normalizeReleaseVersion(latest)
	}
	if version == "" {
		return "", errors.New("could not determine release version")
	}
	if sameReleaseVersion(currentVersion, version) {
		return version, nil
	}

	assetName, err := releaseAssetName(version, runtime.GOOS, runtime.GOARCH)
	if err != nil {
		return "", err
	}
	checksums, err := downloadUpdateText(ctx, releaseChecksumsURL(version))
	if err != nil {
		return "", err
	}
	binaryData, err := downloadUpdateBinary(ctx, releaseAssetURL(version, assetName))
	if err != nil {
		return "", err
	}
	if err := verifyReleaseChecksum(binaryData, checksums, assetName); err != nil {
		return "", err
	}

	exePath, err := os.Executable()
	if err != nil {
		return "", err
	}
	dir := filepath.Dir(exePath)
	tmp, err := os.CreateTemp(dir, ".at-email-update-*")
	if err != nil {
		return "", err
	}
	tmpPath := tmp.Name()
	defer func() {
		_ = tmp.Close()
		_ = os.Remove(tmpPath)
	}()
	if _, err := tmp.Write(binaryData); err != nil {
		return "", err
	}
	if err := tmp.Close(); err != nil {
		return "", err
	}
	if err := os.Chmod(tmpPath, 0o755); err != nil {
		return "", err
	}
	if err := os.Rename(tmpPath, exePath); err != nil {
		return "", err
	}

	return version, nil
}

func updateNotice(ctx context.Context, currentVersion string) (string, error) {
	if currentVersion == "" || strings.Contains(currentVersion, "dev") {
		return "", nil
	}
	latest, err := cachedLatestReleaseVersion(ctx)
	if err != nil || latest == "" {
		return "", err
	}
	if !isNewerReleaseVersion(currentVersion, latest) {
		return "", nil
	}
	return fmt.Sprintf("update available: %s -> %s", normalizeReleaseVersion(latest), updateNoticeInstruction()), nil
}

func isNPMDistribution() bool {
	return strings.EqualFold(os.Getenv(updateDistributionEnv), "npm")
}

func updateNoticeInstruction() string {
	if isNPMDistribution() {
		return "update `@agentteamhq/email` with your package manager or run `npx @agentteamhq/email@latest`"
	}
	return "run `at-email self-update`"
}

func latestReleaseVersion(ctx context.Context) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, updateLatestReleaseAPIURL, nil)
	if err != nil {
		return "", err
	}
	client := *updateHTTPClient
	client.Timeout = updateCheckTimeout
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", updateUserAgent)
	resp, err := client.Do(req)
	if err != nil {
		return "", newTransportError("GitHub Releases service unavailable while checking latest at-email version")
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", newAgentMailError(fmt.Sprintf("GitHub Releases latest version lookup failed with status %d", resp.StatusCode))
	}
	var release updateRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return "", newProtocolError("GitHub Releases latest version response was malformed")
	}
	return release.TagName, nil
}

func cachedLatestReleaseVersion(ctx context.Context) (string, error) {
	cachePath, err := updateCacheFilePath()
	if err != nil {
		return "", err
	}
	if data, err := os.ReadFile(cachePath); err == nil {
		var entry updateCacheEntry
		if json.Unmarshal(data, &entry) == nil && time.Since(entry.CheckedAt) < updateCacheMaxDuration {
			return entry.LatestVersion, nil
		}
	}

	latest, err := latestReleaseVersion(ctx)
	if err != nil {
		return "", err
	}
	entry := updateCacheEntry{
		CheckedAt:     time.Now().UTC(),
		LatestVersion: latest,
	}
	if err := os.MkdirAll(filepath.Dir(cachePath), 0o755); err == nil {
		if data, err := json.Marshal(entry); err == nil {
			_ = os.WriteFile(cachePath, data, 0o644)
		}
	}
	return latest, nil
}

func updateCacheFilePath() (string, error) {
	if cacheDir := os.Getenv("XDG_CACHE_HOME"); cacheDir != "" {
		return filepath.Join(cacheDir, updateCacheDirName, updateCacheFileName), nil
	}
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(homeDir, ".cache", updateCacheDirName, updateCacheFileName), nil
}

func githubLatestReleaseAPIURL() string {
	return fmt.Sprintf("https://api.github.com/repos/%s/%s/releases/latest", updateRepoOwner, updateRepoName)
}

func releaseChecksumsURL(version string) string {
	return fmt.Sprintf("https://github.com/%s/%s/releases/download/%s/%s", updateRepoOwner, updateRepoName, version, updateChecksumAsset)
}

func releaseAssetURL(version string, assetName string) string {
	return fmt.Sprintf("https://github.com/%s/%s/releases/download/%s/%s", updateRepoOwner, updateRepoName, version, assetName)
}

func releaseAssetName(version string, goos string, goarch string) (string, error) {
	switch goos {
	case "linux", "darwin":
	case "windows":
	default:
		return "", fmt.Errorf("unsupported OS %q for self-update", goos)
	}
	switch goarch {
	case "amd64", "arm64":
	default:
		return "", fmt.Errorf("unsupported architecture %q for self-update", goarch)
	}
	name := fmt.Sprintf("%s_%s_%s_%s", updateBinaryName, strings.TrimPrefix(version, "v"), goos, goarch)
	if goos == "windows" {
		name += ".exe"
	}
	return name, nil
}

func downloadUpdateText(ctx context.Context, url string) (string, error) {
	data, err := downloadUpdateBinary(ctx, url)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func downloadUpdateBinary(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	client := *updateHTTPClient
	client.Timeout = updateDownloadTimeout
	req.Header.Set("Accept", "application/octet-stream")
	req.Header.Set("User-Agent", updateUserAgent)
	resp, err := client.Do(req)
	if err != nil {
		return nil, newTransportError("GitHub Releases service unavailable while downloading at-email release asset")
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, newAgentMailError(fmt.Sprintf("GitHub Releases asset download failed with status %d", resp.StatusCode))
	}
	return io.ReadAll(resp.Body)
}

func verifyReleaseChecksum(binaryData []byte, checksums string, assetName string) error {
	sum := sha256.Sum256(binaryData)
	want := hex.EncodeToString(sum[:])
	for _, line := range strings.Split(checksums, "\n") {
		fields := strings.Fields(strings.TrimSpace(line))
		if len(fields) < 2 {
			continue
		}
		name := strings.TrimPrefix(fields[1], "*")
		if name == assetName {
			if fields[0] != want {
				return fmt.Errorf("checksum mismatch for %s", assetName)
			}
			return nil
		}
	}
	return fmt.Errorf("checksum entry not found for %s", assetName)
}

func normalizeReleaseVersion(version string) string {
	cleaned := strings.TrimSpace(version)
	if cleaned == "" {
		return ""
	}
	if !strings.HasPrefix(cleaned, "v") {
		return "v" + cleaned
	}
	return cleaned
}

func sameReleaseVersion(current string, target string) bool {
	return normalizeReleaseVersion(current) == normalizeReleaseVersion(target)
}

func isNewerReleaseVersion(currentVersion string, latestVersion string) bool {
	current, okCurrent := parseReleaseVersion(currentVersion)
	latest, okLatest := parseReleaseVersion(latestVersion)
	if !okCurrent || !okLatest {
		return false
	}
	for i := 0; i < 3; i++ {
		if latest[i] > current[i] {
			return true
		}
		if latest[i] < current[i] {
			return false
		}
	}
	return false
}

func parseReleaseVersion(version string) ([3]int, bool) {
	cleaned := strings.TrimPrefix(normalizeReleaseVersion(version), "v")
	core, _, _ := strings.Cut(cleaned, "-")
	parts := strings.Split(core, ".")
	if len(parts) != 3 {
		return [3]int{}, false
	}
	var parsed [3]int
	for i, part := range parts {
		value, err := strconv.Atoi(part)
		if err != nil {
			return [3]int{}, false
		}
		parsed[i] = value
	}
	return parsed, true
}
