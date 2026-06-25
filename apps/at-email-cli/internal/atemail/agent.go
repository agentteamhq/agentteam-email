package atemail

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"
)

const (
	agentCredentialsDirName = "agents"
	defaultAgentProfileName = "default"
	agentCredentialFileName = "agent.json"
)

var defaultAgentConnectMessageCapabilities = []string{
	"email.message.list",
	"email.message.read",
	"email.message.search",
}

type agentCredential struct {
	APIBaseURL      string      `json:"api_base_url,omitempty"`
	AgentID         string      `json:"agent_id"`
	AgentPrivateKey agentKeyJWK `json:"agent_private_key_jwk"`
	Capabilities    []string    `json:"capabilities,omitempty"`
	ExpiresAt       string      `json:"expires_at,omitempty"`
	HostID          string      `json:"host_id"`
	HostPrivateKey  agentKeyJWK `json:"host_private_key_jwk"`
	Issuer          string      `json:"issuer,omitempty"`
	Mode            string      `json:"mode,omitempty"`
	Name            string      `json:"name,omitempty"`
	Status          string      `json:"status,omitempty"`
}

func handleAgent(ctx context.Context, args parsedArgs, env []string, stdout io.Writer, stderr io.Writer) error {
	switch args.AgentAction {
	case "connect":
		return handleAgentConnect(ctx, args, env, stdout, stderr)
	case "trial":
		return handleAgentTrial(ctx, args, env, stdout)
	case "enroll":
		return handleAgentEnroll(ctx, args, env, stdout, stderr)
	case "status":
		return handleAgentStatus(ctx, args, stdout)
	case "disconnect":
		return handleAgentDisconnect(ctx, args, stdout)
	default:
		return newCommandUsageError(commandAgent, "the following arguments are required: agent_command")
	}
}

func handleAgentConnect(ctx context.Context, args parsedArgs, env []string, stdout io.Writer, stderr io.Writer) error {
	if err := requireAgentCredentialReplacementAllowed(args.Force); err != nil {
		return err
	}
	resolution, err := resolveAppAuthResolution(ctx, env, args.APIBaseURL)
	if err != nil {
		return err
	}
	client := newAgentAuthClient(resolution.APIBaseURL)
	agentConfiguration, err := client.discoverConfiguration(ctx)
	if err != nil {
		return err
	}
	client = client.withConfiguration(agentConfiguration)
	if !agentConfigurationSupportsMode(agentConfiguration, "delegated") {
		return newAgentMailError("AgentTeam Email does not advertise delegated Agent Auth support")
	}
	issuer := agentConfigurationIssuer(agentConfiguration, resolution.APIBaseURL)

	mailboxAddress := strings.TrimSpace(args.MailboxAddress)
	if mailboxAddress == "" {
		mailboxAddress = strings.TrimSpace(lookupEnv(envMap(env), "AT_EMAIL_MAILBOX_ADDRESS"))
	}
	capabilities, err := agentConnectCapabilityRequests(args.AgentCapabilities, mailboxAddress)
	if err != nil {
		return err
	}

	name := strings.TrimSpace(args.AgentName)
	if name == "" {
		name = defaultAgentName()
	}
	if err := replaceAgentCredential(ctx, args.Force); err != nil {
		return err
	}
	agentKey, err := newAgentEd25519JWK()
	if err != nil {
		return err
	}
	host, err := resolveLocalAgentHostKey(resolution.APIBaseURL, name)
	if err != nil {
		return err
	}
	host.Issuer = stringValueOrDefault(host.Issuer, issuer)
	credential := agentCredential{
		APIBaseURL:      resolution.APIBaseURL,
		AgentPrivateKey: agentKey,
		HostID:          host.HostID,
		HostPrivateKey:  host.HostPrivateKey,
		Issuer:          issuer,
		Name:            name,
		Status:          host.Status,
	}
	preferredMethod := ""
	if args.Device {
		preferredMethod = "device_authorization"
	}
	registeredAgent, err := client.registerAgent(ctx, credential, agentKey.publicJWK(), name, agentRegistrationOptions{
		Capabilities:    capabilities,
		Mode:            "delegated",
		PreferredMethod: preferredMethod,
		Reason:          strings.TrimSpace(args.AgentReason),
	})
	if err != nil {
		return err
	}
	credential.AgentID = stringValue(registeredAgent["agent_id"])
	if credential.AgentID == "" {
		return newProtocolError("AgentTeam Email agent registration returned an incomplete response")
	}
	updateAgentCredentialFromStatus(&credential, registeredAgent)
	if credential.HostID == "" {
		return newProtocolError("AgentTeam Email agent registration returned an incomplete host response")
	}
	if err := saveAgentHostCredential(agentHostCredential{
		APIBaseURL:     credential.APIBaseURL,
		HostID:         credential.HostID,
		HostPrivateKey: credential.HostPrivateKey,
		Issuer:         credential.Issuer,
		Name:           stringValueOrDefault(credential.Name, name),
		Status:         credential.Status,
	}); err != nil {
		return err
	}
	if stringValue(registeredAgent["status"]) == "pending" {
		progress := stdout
		if args.JSON {
			progress = stderr
		}
		approval := objectValue(registeredAgent["approval"])
		if err := renderAgentConnectApproval(args, progress, approval); err != nil {
			return err
		}
		status, err := waitForAgentConnectApproval(ctx, client, credential, approval, progress, args.JSON)
		if err != nil {
			return err
		}
		updateAgentCredentialFromStatus(&credential, status)
	}
	if credential.Status != "active" {
		return newAgentMailError("agent authorization did not become active")
	}
	if err := saveAgentCredential(defaultAgentProfileName, credential); err != nil {
		return err
	}

	if args.JSON {
		return printJSON(stdout, safeAgentCredentialStatus(credential, true))
	}

	fmt.Fprintln(stdout, "Agent connected.")
	renderAgentCredential(stdout, credential)
	return nil
}

func handleAgentTrial(ctx context.Context, args parsedArgs, env []string, stdout io.Writer) error {
	if err := requireAgentCredentialReplacementAllowed(args.Force); err != nil {
		return err
	}
	resolution, err := resolveAppAuthResolution(ctx, env, args.APIBaseURL)
	if err != nil {
		return err
	}
	client := newAgentAuthClient(resolution.APIBaseURL)
	agentConfiguration, err := client.discoverConfiguration(ctx)
	if err != nil {
		return err
	}
	client = client.withConfiguration(agentConfiguration)
	if !agentConfigurationSupportsMode(agentConfiguration, "autonomous") {
		return newAgentMailError("AgentTeam Email does not advertise autonomous Agent Auth support")
	}
	issuer := agentConfigurationIssuer(agentConfiguration, resolution.APIBaseURL)
	name := strings.TrimSpace(args.AgentName)
	if name == "" {
		name = defaultAgentName()
	}
	if err := replaceAgentCredential(ctx, args.Force); err != nil {
		return err
	}
	host, err := newLocalAgentHostKey(resolution.APIBaseURL, name)
	if err != nil {
		return err
	}
	host.Issuer = stringValueOrDefault(host.Issuer, issuer)
	agentKey, err := newAgentEd25519JWK()
	if err != nil {
		return err
	}
	admissionToken := lookupEnv(envMap(env), "AT_EMAIL_TRIAL_ADMISSION_TOKEN")
	trial, err := client.startTrial(ctx, host.HostPrivateKey.publicJWK(), agentKey.publicJWK(), name, args.AgentCapabilities, args.AgentPostClaimCapabilities, admissionToken)
	if err != nil {
		return err
	}
	credential := agentCredential{
		APIBaseURL:      resolution.APIBaseURL,
		AgentPrivateKey: agentKey,
		HostPrivateKey:  host.HostPrivateKey,
		Issuer:          issuer,
		Name:            name,
	}
	updateAgentCredentialFromStatus(&credential, trial)
	if credential.AgentID == "" || credential.HostID == "" {
		return newProtocolError("AgentTeam Email trial returned an incomplete agent credential response")
	}
	if err := saveAgentHostCredential(agentHostCredential{
		APIBaseURL:     resolution.APIBaseURL,
		HostID:         credential.HostID,
		HostPrivateKey: credential.HostPrivateKey,
		Issuer:         credential.Issuer,
		Name:           name,
		Status:         credential.Status,
	}); err != nil {
		return err
	}
	if credential.Status != "active" {
		return newAgentMailError("agent trial did not become active")
	}
	if err := saveAgentCredential(defaultAgentProfileName, credential); err != nil {
		return err
	}

	if args.JSON {
		payload := safeAgentCredentialStatus(credential, true)
		if claim := safeAgentTrialClaim(trial["claim"]); len(claim) > 0 {
			payload["claim"] = claim
		}
		if mailboxAddress := stringValue(objectValue(trial["mailbox"])["address"]); mailboxAddress != "" {
			payload["mailbox"] = map[string]any{"address": mailboxAddress}
		}
		payload["trial_id"] = stringValue(trial["trial_id"])
		return printJSON(stdout, payload)
	}

	fmt.Fprintln(stdout, "Agent trial started.")
	renderAgentCredential(stdout, credential)
	if mailbox := objectValue(trial["mailbox"]); len(mailbox) > 0 {
		renderOptionalLine(stdout, "Mailbox", stringValue(mailbox["address"]))
	}
	if claim := objectValue(trial["claim"]); len(claim) > 0 {
		renderOptionalLine(stdout, "Claim", stringValue(claim["url"]))
		renderOptionalLine(stdout, "Claim expires", stringValue(claim["expires_at"]))
	}
	return nil
}

func handleAgentEnroll(ctx context.Context, args parsedArgs, env []string, stdout io.Writer, stderr io.Writer) error {
	token := strings.TrimSpace(args.AgentToken)
	if token == "" {
		return newCommandUsageError(commandAgentEnroll, "the following arguments are required: enrollment_token")
	}
	if err := requireAgentCredentialReplacementAllowed(args.Force); err != nil {
		return err
	}
	resolution, err := resolveAppAuthResolution(ctx, env, args.APIBaseURL)
	if err != nil {
		return err
	}
	name := strings.TrimSpace(args.AgentName)
	if name == "" {
		name = defaultAgentName()
	}
	host, err := resolveLocalAgentHostKey(resolution.APIBaseURL, name)
	if err != nil {
		return err
	}
	agentKey, err := newAgentEd25519JWK()
	if err != nil {
		return err
	}
	client := newAgentAuthClient(resolution.APIBaseURL)
	agentConfiguration, err := client.discoverConfiguration(ctx)
	if err != nil {
		return err
	}
	client = client.withConfiguration(agentConfiguration)
	if !agentConfigurationSupportsMode(agentConfiguration, "delegated") {
		return newAgentMailError("AgentTeam Email does not advertise delegated Agent Auth support")
	}
	issuer := agentConfigurationIssuer(agentConfiguration, resolution.APIBaseURL)
	if err := replaceAgentCredential(ctx, args.Force); err != nil {
		return err
	}
	host.Issuer = stringValueOrDefault(host.Issuer, issuer)
	enrolledHost, err := client.enrollHost(ctx, token, host.HostPrivateKey.publicJWK(), name)
	if err != nil {
		return err
	}
	hostID := stringValue(enrolledHost["hostId"])
	if hostID == "" {
		return newProtocolError("AgentTeam Email host enrollment returned an incomplete response")
	}
	host.HostID = hostID
	host.Name = stringValueOrDefault(enrolledHost["name"], name)
	host.Status = stringValue(enrolledHost["status"])
	host.Issuer = stringValueOrDefault(host.Issuer, issuer)
	if err := saveAgentHostCredential(host); err != nil {
		return err
	}
	credential := agentCredential{
		APIBaseURL:      resolution.APIBaseURL,
		AgentPrivateKey: agentKey,
		HostID:          hostID,
		HostPrivateKey:  host.HostPrivateKey,
		Issuer:          issuer,
		Name:            name,
		Status:          stringValue(enrolledHost["status"]),
	}
	registeredAgent, err := client.registerAgent(ctx, credential, agentKey.publicJWK(), name, agentRegistrationOptions{
		Mode: "delegated",
	})
	if err != nil {
		return err
	}
	credential.AgentID = stringValue(registeredAgent["agent_id"])
	if credential.AgentID == "" {
		return newProtocolError("AgentTeam Email agent registration returned an incomplete response")
	}
	updateAgentCredentialFromStatus(&credential, registeredAgent)
	if stringValue(registeredAgent["status"]) == "pending" {
		progress := stdout
		if args.JSON {
			progress = stderr
		}
		approval := objectValue(registeredAgent["approval"])
		if err := renderAgentConnectApproval(args, progress, approval); err != nil {
			return err
		}
		status, err := waitForAgentConnectApproval(ctx, client, credential, approval, progress, args.JSON)
		if err != nil {
			return err
		}
		updateAgentCredentialFromStatus(&credential, status)
	}
	if credential.Status != "active" {
		return newAgentMailError("agent enrollment did not become active")
	}
	if err := saveAgentCredential(defaultAgentProfileName, credential); err != nil {
		return err
	}

	if args.JSON {
		return printJSON(stdout, safeAgentCredentialStatus(credential, true))
	}

	fmt.Fprintln(stdout, "Agent enrolled.")
	renderAgentCredential(stdout, credential)
	return nil
}

func handleAgentStatus(ctx context.Context, args parsedArgs, stdout io.Writer) error {
	credential, found, err := loadAgentCredential(defaultAgentProfileName)
	if err != nil {
		return err
	}
	if !found {
		if args.JSON {
			return printJSON(stdout, map[string]any{
				"configured": false,
				"profile":    defaultAgentProfileName,
			})
		}
		fmt.Fprintln(stdout, "No agent configured.")
		return nil
	}

	client := newAgentAuthClient(credential.APIBaseURL)
	agentConfiguration, err := client.discoverConfiguration(ctx)
	if err != nil {
		return err
	}
	client = client.withConfiguration(agentConfiguration)
	status, err := client.agentStatus(ctx, credential)
	if err != nil {
		return err
	}
	updateAgentCredentialFromStatus(&credential, status)
	if err := saveAgentCredential(defaultAgentProfileName, credential); err != nil {
		return err
	}
	if args.JSON {
		payload := safeAgentCredentialStatus(credential, true)
		payload["remote"] = safeAgentStatusPayload(status)
		return printJSON(stdout, payload)
	}

	fmt.Fprintln(stdout, "Agent configured.")
	renderAgentCredential(stdout, credential)
	return nil
}

func handleAgentDisconnect(ctx context.Context, args parsedArgs, stdout io.Writer) error {
	credential, found, err := loadAgentCredential(defaultAgentProfileName)
	if err != nil {
		return err
	}
	if !found {
		if args.JSON {
			return printJSON(stdout, map[string]any{
				"remote_revoked": false,
				"status":         "already_disconnected",
			})
		}
		fmt.Fprintln(stdout, "Already disconnected.")
		return nil
	}
	client := newAgentAuthClient(credential.APIBaseURL)
	agentConfiguration, err := client.discoverConfiguration(ctx)
	if err != nil {
		return err
	}
	client = client.withConfiguration(agentConfiguration)
	result, err := client.revokeAgent(ctx, credential)
	if err != nil {
		return err
	}
	if err := deleteAgentCredential(defaultAgentProfileName); err != nil {
		return err
	}
	if args.JSON {
		return printJSON(stdout, map[string]any{
			"agent_id":       credential.AgentID,
			"remote_revoked": true,
			"status":         stringValueOrDefault(result["status"], "disconnected"),
		})
	}
	fmt.Fprintln(stdout, "Agent disconnected.")
	return nil
}

func agentConnectCapabilityRequests(capabilityArgs []string, mailboxAddress string) ([]any, error) {
	capabilities := make([]string, 0, len(capabilityArgs)+1+len(defaultAgentConnectMessageCapabilities))
	for _, capability := range capabilityArgs {
		capability = strings.TrimSpace(capability)
		if capability != "" {
			capabilities = append(capabilities, capability)
		}
	}
	if len(capabilities) == 0 {
		capabilities = append(capabilities, "email.status")
		if mailboxAddress != "" {
			capabilities = append(capabilities, defaultAgentConnectMessageCapabilities...)
		}
	}
	requests := make([]any, 0, len(capabilities))
	seen := map[string]struct{}{}
	for _, capability := range capabilities {
		if _, ok := seen[capability]; ok {
			continue
		}
		seen[capability] = struct{}{}
		constraints := map[string]any{}
		if strings.HasPrefix(capability, "email.message.") {
			if mailboxAddress == "" {
				return nil, newCommandUsageError(commandAgentConnect, "argument --mailbox-address is required for email.message.* capabilities")
			}
			constraints["mailboxAddress"] = mailboxAddress
		}
		requests = append(requests, map[string]any{
			"constraints": constraints,
			"name":        capability,
		})
	}
	return requests, nil
}

func agentConfigurationSupportsMode(configuration map[string]any, mode string) bool {
	for _, value := range anySlice(configuration["modes"]) {
		if stringValue(value) == mode {
			return true
		}
	}
	return false
}

func agentConfigurationIssuer(configuration map[string]any, fallback string) string {
	return stringValueOrDefault(configuration["issuer"], strings.TrimRight(fallback, "/"))
}

func renderAgentConnectApproval(args parsedArgs, progress io.Writer, approval map[string]any) error {
	if len(approval) == 0 {
		return nil
	}
	verificationURL := stringValue(approval["verification_uri_complete"])
	if verificationURL == "" {
		verificationURL = stringValue(approval["verification_uri"])
	}
	if args.JSON {
		return printJSON(progress, map[string]any{
			"event":                     "agent_authorization_pending",
			"expires_in":                intValueOrDefault(approval["expires_in"], 0),
			"formatted_user_code":       formatAuthUserCode(stringValue(approval["user_code"])),
			"interval":                  intValueOrDefault(approval["interval"], 0),
			"method":                    stringValue(approval["method"]),
			"operation":                 "agent_connect",
			"user_code":                 stringValue(approval["user_code"]),
			"verification_uri":          stringValue(approval["verification_uri"]),
			"verification_uri_complete": verificationURL,
		})
	}
	if verificationURL != "" {
		fmt.Fprintf(progress, "Open: %s\n\n", verificationURL)
	}
	if userCode := stringValue(approval["user_code"]); userCode != "" {
		fmt.Fprintf(progress, "Code: %s\n\n", formatAuthUserCode(userCode))
	}
	if verificationURL != "" && !args.Device && !args.NoOpen {
		_ = openBrowser(verificationURL)
	}
	fmt.Fprintln(progress, "Waiting for agent approval...")
	return nil
}

func waitForAgentConnectApproval(ctx context.Context, client agentAuthClient, credential agentCredential, approval map[string]any, progress io.Writer, jsonMode bool) (map[string]any, error) {
	interval := time.Duration(intValueOrDefault(approval["interval"], 5)) * time.Second
	if interval <= 0 {
		interval = defaultPollingInterval
	}
	expiresIn := intValueOrDefault(approval["expires_in"], 300)
	expiresAt := time.Now().Add(time.Duration(expiresIn) * time.Second)
	lastHeartbeat := time.Now()

	for {
		if time.Now().After(expiresAt) {
			return nil, newAgentMailError("agent approval expired; run `at-email agent connect` again")
		}
		if err := authSleep(ctx, interval); err != nil {
			return nil, err
		}
		status, err := client.hostAgentStatus(ctx, credential, credential.AgentID)
		if err != nil {
			return nil, err
		}
		switch stringValue(status["status"]) {
		case "active":
			return status, nil
		case "pending":
			if !jsonMode && time.Since(lastHeartbeat) >= 10*time.Second {
				fmt.Fprintln(progress, "Still waiting for agent approval...")
				lastHeartbeat = time.Now()
			}
		case "rejected":
			return nil, newAgentMailError("agent approval was denied")
		case "revoked":
			return nil, newAgentMailError("agent was revoked before approval completed")
		case "expired":
			return nil, newAgentMailError("agent approval expired; run `at-email agent connect` again")
		default:
			return nil, newAgentMailError("agent authorization did not become active")
		}
	}
}

func agentCredentialPath(profile string) (string, error) {
	base, err := authUserConfigDir()
	if err != nil {
		return "", newConfigError("could not resolve user config directory for at-email agent credentials")
	}
	return filepath.Join(base, authConfigDirName, agentCredentialsDirName, profile, agentCredentialFileName), nil
}

func requireAgentCredentialReplacementAllowed(force bool) error {
	path, err := agentCredentialPath(defaultAgentProfileName)
	if err != nil {
		return err
	}
	_, err = os.Stat(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return newAgentMailError("could not inspect local at-email agent credential")
	}
	if !force {
		return newAgentMailError("local at-email agent credential already exists; run `at-email agent disconnect` first or pass `--force` to replace it")
	}
	return nil
}

func replaceAgentCredential(ctx context.Context, force bool) error {
	if !force {
		return nil
	}
	credential, found, err := loadAgentCredential(defaultAgentProfileName)
	if err != nil {
		return err
	}
	if !found {
		return nil
	}
	client := newAgentAuthClient(credential.APIBaseURL)
	agentConfiguration, err := client.discoverConfiguration(ctx)
	if err != nil {
		return err
	}
	client = client.withConfiguration(agentConfiguration)
	if _, err := client.revokeAgent(ctx, credential); err != nil {
		return newAgentMailError("could not revoke existing remote agent before replacing it: " + err.Error())
	}
	if err := deleteAgentCredential(defaultAgentProfileName); err != nil {
		return err
	}
	return nil
}

func loadAgentCredential(profile string) (agentCredential, bool, error) {
	path, err := agentCredentialPath(profile)
	if err != nil {
		return agentCredential{}, false, err
	}
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return agentCredential{}, false, nil
	}
	if err != nil {
		return agentCredential{}, false, newAgentMailError("could not read local at-email agent credential")
	}
	var credential agentCredential
	if err := json.Unmarshal(raw, &credential); err != nil {
		return agentCredential{}, false, newAgentMailError("local at-email agent credential is invalid")
	}
	if credential.AgentID == "" || credential.HostID == "" {
		return agentCredential{}, false, newAgentMailError("local at-email agent credential is incomplete")
	}
	if credential.APIBaseURL == "" {
		return agentCredential{}, false, newAgentMailError("local at-email agent credential is missing its API base URL")
	}
	if credential.Issuer == "" {
		credential.Issuer = trimTrailingSlash(credential.APIBaseURL)
	}
	return credential, true, nil
}

func saveAgentCredential(profile string, credential agentCredential) error {
	path, err := agentCredentialPath(profile)
	if err != nil {
		return err
	}
	if err := ensurePrivateCredentialDirectory(
		filepath.Dir(path),
		"could not create local at-email agent directory",
	); err != nil {
		return err
	}
	data, err := json.MarshalIndent(credential, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return newAgentMailError("could not write local at-email agent credential")
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return newAgentMailError("could not save local at-email agent credential")
	}
	if err := ensurePrivateCredentialFile(path, "could not save local at-email agent credential"); err != nil {
		return err
	}
	return nil
}

func deleteAgentCredential(profile string) error {
	path, err := agentCredentialPath(profile)
	if err != nil {
		return err
	}
	err = os.Remove(path)
	if err == nil || errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return newAgentMailError("could not remove local at-email agent credential")
}

func updateAgentCredentialFromStatus(credential *agentCredential, status map[string]any) {
	credential.AgentID = stringValueOrDefault(status["agent_id"], credential.AgentID)
	credential.HostID = stringValueOrDefault(status["host_id"], credential.HostID)
	credential.Mode = stringValueOrDefault(status["mode"], credential.Mode)
	credential.Name = stringValueOrDefault(status["name"], credential.Name)
	credential.Status = stringValueOrDefault(status["status"], credential.Status)
	credential.ExpiresAt = stringValueOrDefault(status["expires_at"], credential.ExpiresAt)
	credential.Capabilities = agentCapabilitiesFromStatus(status)
}

func safeAgentCredentialStatus(credential agentCredential, configured bool) map[string]any {
	capabilities := append([]string(nil), credential.Capabilities...)
	sort.Strings(capabilities)
	return map[string]any{
		"agent_id":     credential.AgentID,
		"api_base_url": credential.APIBaseURL,
		"capabilities": capabilities,
		"configured":   configured,
		"expires_at":   credential.ExpiresAt,
		"host_id":      credential.HostID,
		"issuer":       credential.Issuer,
		"mode":         credential.Mode,
		"name":         credential.Name,
		"profile":      defaultAgentProfileName,
		"status":       credential.Status,
	}
}

func safeAgentTrialClaim(value any) map[string]any {
	claim := objectValue(value)
	result := map[string]any{}
	copyStringField(result, claim, "expires_at")
	copyStringField(result, claim, "url")
	return result
}

func renderAgentCredential(stdout io.Writer, credential agentCredential) {
	capabilities := append([]string(nil), credential.Capabilities...)
	sort.Strings(capabilities)
	renderOptionalLine(stdout, "Name", credential.Name)
	fmt.Fprintf(stdout, "Agent: %s\n", credential.AgentID)
	fmt.Fprintf(stdout, "Host: %s\n", credential.HostID)
	renderOptionalLine(stdout, "Mode", credential.Mode)
	renderOptionalLine(stdout, "Status", credential.Status)
	renderOptionalLine(stdout, "Issuer", credential.Issuer)
	renderOptionalLine(stdout, "API", credential.APIBaseURL)
	renderOptionalLine(stdout, "Expires", credential.ExpiresAt)
	fmt.Fprintf(stdout, "Capabilities: %d\n", len(capabilities))
}

func defaultAgentName() string {
	return fmt.Sprintf("at-email CLI (%s/%s)", runtime.GOOS, runtime.GOARCH)
}

func stringValueOrDefault(value any, fallback string) string {
	if parsed := stringValue(value); parsed != "" {
		return parsed
	}
	return fallback
}

func renderOptionalLine(stdout io.Writer, label string, value string) {
	if value == "" {
		return
	}
	fmt.Fprintf(stdout, "%s: %s\n", label, value)
}
