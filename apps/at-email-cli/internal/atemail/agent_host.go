package atemail

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
)

const agentHostCredentialFileName = "host.json"

type agentHostCredential struct {
	APIBaseURL     string      `json:"api_base_url"`
	HostID         string      `json:"host_id"`
	HostPrivateKey agentKeyJWK `json:"host_private_key_jwk"`
	Issuer         string      `json:"issuer,omitempty"`
	Name           string      `json:"name,omitempty"`
	Status         string      `json:"status,omitempty"`
}

func resolveLocalAgentHostKey(apiBaseURL string, name string) (agentHostCredential, error) {
	if host, found, err := loadAgentHostCredentialForAPIBaseURL(apiBaseURL); err != nil {
		return agentHostCredential{}, err
	} else if found {
		return host, nil
	}

	return newLocalAgentHostKey(apiBaseURL, name)
}

func newLocalAgentHostKey(apiBaseURL string, name string) (agentHostCredential, error) {
	hostKey, err := newAgentEd25519JWK()
	if err != nil {
		return agentHostCredential{}, err
	}
	return agentHostCredential{
		APIBaseURL:     apiBaseURL,
		HostPrivateKey: hostKey,
		Name:           name,
	}, nil
}

func agentHostCredentialPath() (string, error) {
	base, err := authUserConfigDir()
	if err != nil {
		return "", newConfigError("could not resolve user config directory for at-email agent host credentials")
	}
	return filepath.Join(base, authConfigDirName, agentCredentialsDirName, agentHostCredentialFileName), nil
}

func loadAgentHostCredentialForAPIBaseURL(apiBaseURL string) (agentHostCredential, bool, error) {
	host, found, err := loadAgentHostCredential()
	if err != nil || !found {
		return agentHostCredential{}, false, err
	}
	if trimTrailingSlash(host.APIBaseURL) != trimTrailingSlash(apiBaseURL) {
		return agentHostCredential{}, false, nil
	}
	return host, true, nil
}

func loadAgentHostCredential() (agentHostCredential, bool, error) {
	path, err := agentHostCredentialPath()
	if err != nil {
		return agentHostCredential{}, false, err
	}
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return agentHostCredential{}, false, nil
	}
	if err != nil {
		return agentHostCredential{}, false, newAgentMailError("could not read local at-email agent host credential")
	}
	var host agentHostCredential
	if err := json.Unmarshal(raw, &host); err != nil {
		return agentHostCredential{}, false, newAgentMailError("local at-email agent host credential is invalid")
	}
	if trimTrailingSlash(host.APIBaseURL) == "" {
		return agentHostCredential{}, false, newAgentMailError("local at-email agent host credential is missing its API base URL")
	}
	if err := requireAgentKeyLabel(host.HostPrivateKey, "host"); err != nil {
		return agentHostCredential{}, false, err
	}
	if strings.TrimSpace(host.HostID) == "" {
		return agentHostCredential{}, false, newAgentMailError("local at-email agent host credential is incomplete")
	}
	if host.Issuer == "" {
		host.Issuer = trimTrailingSlash(host.APIBaseURL)
	}
	return host, true, nil
}

func saveAgentHostCredential(host agentHostCredential) error {
	path, err := agentHostCredentialPath()
	if err != nil {
		return err
	}
	if trimTrailingSlash(host.APIBaseURL) == "" {
		return newAgentMailError("local at-email agent host credential is missing its API base URL")
	}
	if strings.TrimSpace(host.HostID) == "" {
		return newAgentMailError("local at-email agent host credential is incomplete")
	}
	if err := requireAgentKeyLabel(host.HostPrivateKey, "host"); err != nil {
		return err
	}
	if err := ensurePrivateCredentialDirectory(
		filepath.Dir(path),
		"could not create local at-email agent host directory",
	); err != nil {
		return err
	}
	host.APIBaseURL = trimTrailingSlash(host.APIBaseURL)
	data, err := json.MarshalIndent(host, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return newAgentMailError("could not write local at-email agent host credential")
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return newAgentMailError("could not save local at-email agent host credential")
	}
	if err := ensurePrivateCredentialFile(path, "could not save local at-email agent host credential"); err != nil {
		return err
	}
	return nil
}

func trimTrailingSlash(value string) string {
	return strings.TrimRight(strings.TrimSpace(value), "/")
}
