package gotestingcontainer

import (
	"context"
	"encoding/json"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	mobycontainer "github.com/moby/moby/api/types/container"
	mobynetwork "github.com/moby/moby/api/types/network"
	tc "github.com/testcontainers/testcontainers-go"
	tcexec "github.com/testcontainers/testcontainers-go/exec"
	tcnetwork "github.com/testcontainers/testcontainers-go/network"
	"github.com/testcontainers/testcontainers-go/wait"
)

type Container = tc.Container
type ContainerConfig = mobycontainer.Config
type DockerNetwork = tc.DockerNetwork
type HostConfig = mobycontainer.HostConfig

type FileCopy struct {
	ContainerPath string
	HostRelPath   string
}

type RunArtifacts struct {
	RunDir       string
	ArtifactsDir string
}

type ContainerRequest struct {
	Name                 string
	Image                string
	LogRelPath           string
	Network              *DockerNetwork
	NetworkAliases       []string
	NetworkMode          string
	ExposedPorts         []string
	Env                  map[string]string
	Cmd                  []string
	WaitStrategy         wait.Strategy
	Hostname             string
	User                 string
	Tmpfs                map[string]string
	ShmSize              int64
	ConfigModifier       func(*ContainerConfig)
	HostConfigModifier   func(*HostConfig)
	DisableLogCollection bool
}

type ExecStep struct {
	Name          string
	Command       []string
	OutputRelPath string
	RecordRelPath string
	Env           []string
	WorkingDir    string
	User          string
	AllowFailure  bool
}

type ExecStepRecord struct {
	Name          string   `json:"name"`
	Command       []string `json:"command"`
	ExitCode      int      `json:"exitCode"`
	OutputRelPath string   `json:"outputRelPath,omitempty"`
	StartedAt     string   `json:"startedAt"`
	FinishedAt    string   `json:"finishedAt"`
	DurationMS    int64    `json:"durationMs"`
}

type ExecResult struct {
	ExitCode int
	Output   string
}

type JSONContainerRun[T any] struct {
	Payload    T
	LogText    string
	OutputPath string
}

type JSONContainerRequest struct {
	TargetImage       string
	RunDir            string
	ArtifactsDir      string
	Command           []string
	ContainerEnv      map[string]string
	ContainerJSONPath string
	HostJSONRelPath   string
	ExtraCopies       []FileCopy
	Timeout           time.Duration
}

func RequiredEnv(t *testing.T, key string) string {
	t.Helper()
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		t.Fatalf("%s is required", key)
	}
	return value
}

func NewRunArtifacts(t *testing.T) RunArtifacts {
	t.Helper()
	t.Setenv("TESTCONTAINERS_RYUK_DISABLED", "true")

	runDir := RequiredEnv(t, "TEST_RUN_DIR")
	artifactsDir := RequiredEnv(t, "TEST_ARTIFACTS_DIR")
	if artifactsDir != runDir {
		t.Fatalf("TEST_ARTIFACTS_DIR must match TEST_RUN_DIR: %q != %q", artifactsDir, runDir)
	}
	run := RunArtifacts{RunDir: runDir, ArtifactsDir: artifactsDir}
	for _, rel := range []string{"containers", "reports", "scenarios"} {
		if err := os.MkdirAll(filepath.Join(run.RunDir, rel), 0o755); err != nil {
			t.Fatalf("create run artifact directory %q: %v", rel, err)
		}
	}
	return run
}

func (r RunArtifacts) Path(elem ...string) string {
	return filepath.Join(append([]string{r.RunDir}, elem...)...)
}

func (r RunArtifacts) ScenarioDir(t *testing.T, scenarioID string) string {
	t.Helper()
	dir := r.Path("scenarios", scenarioID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("create scenario artifact dir %q: %v", dir, err)
	}
	return dir
}

func (r RunArtifacts) ContainerLogPath(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		name = "container"
	}
	return r.Path("containers", name+".log")
}

func NewScopedNetwork(t *testing.T, ctx context.Context) *DockerNetwork {
	t.Helper()
	nw, err := tcnetwork.New(ctx)
	if err != nil {
		t.Fatalf("create scoped test network: %v", err)
	}
	tc.CleanupNetwork(t, nw)
	return nw
}

func WaitForHTTP(path string, port string, startupTimeout time.Duration) wait.Strategy {
	return wait.ForHTTP(path).WithPort(port).WithStartupTimeout(startupTimeout)
}

func WaitForExit(exitTimeout time.Duration) wait.Strategy {
	return wait.ForExit().WithExitTimeout(exitTimeout)
}

func WaitForLog(message string, startupTimeout time.Duration) wait.Strategy {
	return wait.ForLog(message).WithStartupTimeout(startupTimeout)
}

func WaitForListeningPort(port string, startupTimeout time.Duration) wait.Strategy {
	return wait.ForListeningPort(port).WithStartupTimeout(startupTimeout)
}

func (r RunArtifacts) StartContainer(t *testing.T, ctx context.Context, req ContainerRequest) Container {
	t.Helper()
	if strings.TrimSpace(req.Name) == "" {
		t.Fatal("container name is required")
	}
	if strings.TrimSpace(req.Image) == "" {
		t.Fatalf("image is required for container %q", req.Name)
	}
	if strings.TrimSpace(req.NetworkMode) != "" && (req.Network != nil || len(req.NetworkAliases) > 0) {
		t.Fatalf("container %q cannot set both network mode and aliases", req.Name)
	}

	opts := []tc.ContainerCustomizer{tc.WithProvider(tc.ProviderPodman)}
	if req.Network != nil || len(req.NetworkAliases) > 0 {
		if req.Network == nil {
			t.Fatalf("network is required when aliases are set for container %q", req.Name)
		}
		opts = append(opts, tcnetwork.WithNetwork(req.NetworkAliases, req.Network))
	}
	if strings.TrimSpace(req.NetworkMode) != "" {
		opts = append(opts, tc.WithEndpointSettingsModifier(func(settings map[string]*mobynetwork.EndpointSettings) {
			for name := range settings {
				delete(settings, name)
			}
		}))
	}
	if len(req.ExposedPorts) > 0 {
		opts = append(opts, tc.WithExposedPorts(req.ExposedPorts...))
	}
	if len(req.Env) > 0 {
		opts = append(opts, tc.WithEnv(req.Env))
	}
	if len(req.Cmd) > 0 {
		opts = append(opts, tc.WithCmd(req.Cmd...))
	}
	if req.WaitStrategy != nil {
		opts = append(opts, tc.WithWaitStrategy(req.WaitStrategy))
	}
	opts = append(opts, tc.WithConfigModifier(func(config *mobycontainer.Config) {
		if strings.TrimSpace(req.User) != "" {
			config.User = req.User
		}
		if strings.TrimSpace(req.Hostname) != "" {
			config.Hostname = req.Hostname
		}
		if req.ConfigModifier != nil {
			req.ConfigModifier(config)
		}
	}))
	opts = append(opts, tc.WithHostConfigModifier(func(hostConfig *mobycontainer.HostConfig) {
		if strings.TrimSpace(req.NetworkMode) != "" {
			hostConfig.NetworkMode = mobycontainer.NetworkMode(req.NetworkMode)
		}
		if len(req.Tmpfs) > 0 {
			hostConfig.Tmpfs = req.Tmpfs
		}
		if req.ShmSize > 0 {
			hostConfig.ShmSize = req.ShmSize
		}
		if req.HostConfigModifier != nil {
			req.HostConfigModifier(hostConfig)
		}
	}))

	container, err := tc.Run(ctx, req.Image, opts...)
	if err != nil {
		t.Fatalf("start %s container: %v", req.Name, err)
	}
	tc.CleanupContainer(t, container)
	if !req.DisableLogCollection {
		logPath := r.ContainerLogPath(req.Name)
		if strings.TrimSpace(req.LogRelPath) != "" {
			logPath = r.Path(filepath.FromSlash(req.LogRelPath))
		}
		t.Cleanup(func() {
			logCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			WriteLogs(t, logCtx, container, logPath)
		})
	}
	return container
}

func Exec(t *testing.T, ctx context.Context, container tc.Container, cmd []string, opts ...tcexec.ProcessOption) ExecResult {
	t.Helper()
	execOpts := append([]tcexec.ProcessOption{}, opts...)
	execOpts = append(execOpts, tcexec.Multiplexed())
	code, reader, err := container.Exec(ctx, cmd, execOpts...)
	if err != nil {
		t.Fatalf("exec container command %v: %v", cmd, err)
	}
	var output []byte
	if reader != nil {
		output, err = io.ReadAll(reader)
		if err != nil {
			t.Fatalf("read exec output for %v: %v", cmd, err)
		}
	}
	return ExecResult{ExitCode: code, Output: string(output)}
}

func ExecChecked(t *testing.T, ctx context.Context, container tc.Container, cmd []string, opts ...tcexec.ProcessOption) ExecResult {
	t.Helper()
	result := Exec(t, ctx, container, cmd, opts...)
	if result.ExitCode != 0 {
		t.Fatalf("container command %v failed with exit code %d\n%s", cmd, result.ExitCode, result.Output)
	}
	return result
}

func (r RunArtifacts) ExecStep(t *testing.T, ctx context.Context, container Container, step ExecStep) ExecResult {
	t.Helper()
	name := strings.TrimSpace(step.Name)
	if name == "" {
		t.Fatal("exec step name is required")
	}
	if len(step.Command) == 0 {
		t.Fatalf("exec step %q command is required", name)
	}
	opts := make([]tcexec.ProcessOption, 0, 3)
	if len(step.Env) > 0 {
		opts = append(opts, tcexec.WithEnv(step.Env))
	}
	if strings.TrimSpace(step.WorkingDir) != "" {
		opts = append(opts, tcexec.WithWorkingDir(step.WorkingDir))
	}
	if strings.TrimSpace(step.User) != "" {
		opts = append(opts, tcexec.WithUser(step.User))
	}

	startedAt := time.Now().UTC()
	result := Exec(t, ctx, container, step.Command, opts...)
	finishedAt := time.Now().UTC()
	if strings.TrimSpace(step.OutputRelPath) != "" {
		outputPath := r.Path(step.OutputRelPath)
		if err := os.MkdirAll(filepath.Dir(outputPath), 0o755); err != nil {
			t.Fatalf("create exec output dir: %v", err)
		}
		if err := os.WriteFile(outputPath, []byte(result.Output), 0o644); err != nil {
			t.Fatalf("write exec output: %v", err)
		}
	}
	if strings.TrimSpace(step.RecordRelPath) != "" {
		appendJSONLine(t, r.Path(step.RecordRelPath), ExecStepRecord{
			Name:          name,
			Command:       append([]string(nil), step.Command...),
			ExitCode:      result.ExitCode,
			OutputRelPath: step.OutputRelPath,
			StartedAt:     startedAt.Format(time.RFC3339Nano),
			FinishedAt:    finishedAt.Format(time.RFC3339Nano),
			DurationMS:    finishedAt.Sub(startedAt).Milliseconds(),
		})
	}
	if result.ExitCode != 0 && !step.AllowFailure {
		t.Fatalf("exec step %q failed with exit code %d\n%s", name, result.ExitCode, result.Output)
	}
	return result
}

func WriteLogs(t *testing.T, ctx context.Context, container tc.Container, hostPath string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(hostPath), 0o755); err != nil {
		t.Fatalf("create log artifact directory for %q: %v", hostPath, err)
	}
	logReader, err := container.Logs(ctx)
	if err != nil {
		t.Fatalf("read container logs: %v", err)
	}
	defer logReader.Close()
	logBytes, err := io.ReadAll(logReader)
	if err != nil {
		t.Fatalf("consume container logs: %v", err)
	}
	if err := os.WriteFile(hostPath, logBytes, 0o644); err != nil {
		t.Fatalf("write container logs to %q: %v", hostPath, err)
	}
}

func CopyFileFromContainer(t *testing.T, ctx context.Context, container tc.Container, containerPath string, hostPath string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(hostPath), 0o755); err != nil {
		t.Fatalf("create artifact directory for %q: %v", hostPath, err)
	}
	reader, err := container.CopyFileFromContainer(ctx, containerPath)
	if err != nil {
		t.Fatalf("copy %s from container: %v", containerPath, err)
	}
	defer reader.Close()
	file, err := os.OpenFile(hostPath, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, fs.FileMode(0o644))
	if err != nil {
		t.Fatalf("open host artifact file %s: %v", hostPath, err)
	}
	defer file.Close()
	if _, err := io.Copy(file, reader); err != nil {
		t.Fatalf("write host artifact file %s: %v", hostPath, err)
	}
}

func RunJSONContainer[T any](t *testing.T, req JSONContainerRequest) JSONContainerRun[T] {
	t.Helper()
	if strings.TrimSpace(req.TargetImage) == "" {
		t.Fatal("TargetImage is required")
	}
	if strings.TrimSpace(req.RunDir) == "" {
		t.Fatal("RunDir is required")
	}
	if strings.TrimSpace(req.ArtifactsDir) == "" {
		t.Fatal("ArtifactsDir is required")
	}
	if req.ArtifactsDir != req.RunDir {
		t.Fatalf("ArtifactsDir must match RunDir: %q != %q", req.ArtifactsDir, req.RunDir)
	}
	if len(req.Command) == 0 {
		t.Fatal("Command is required")
	}
	if strings.TrimSpace(req.ContainerJSONPath) == "" {
		t.Fatal("ContainerJSONPath is required")
	}
	if strings.TrimSpace(req.HostJSONRelPath) == "" {
		t.Fatal("HostJSONRelPath is required")
	}
	timeout := req.Timeout
	if timeout <= 0 {
		timeout = 2 * time.Minute
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	container, err := tc.Run(
		ctx,
		req.TargetImage,
		tc.WithProvider(tc.ProviderPodman),
		tc.WithEnv(req.ContainerEnv),
		tc.WithCmd(req.Command...),
		tc.WithWaitStrategyAndDeadline(timeout, wait.ForExit().WithExitTimeout(timeout)),
	)
	if err != nil {
		t.Fatalf("start target container: %v", err)
	}
	defer tc.CleanupContainer(t, container)

	logPath := filepath.Join(req.RunDir, "containers", "target.log")
	WriteLogs(t, ctx, container, logPath)
	hostJSONPath := filepath.Join(req.RunDir, req.HostJSONRelPath)
	CopyFileFromContainer(t, ctx, container, req.ContainerJSONPath, hostJSONPath)
	for _, extra := range req.ExtraCopies {
		CopyFileFromContainer(t, ctx, container, extra.ContainerPath, filepath.Join(req.RunDir, extra.HostRelPath))
	}
	state, err := container.State(ctx)
	if err != nil {
		t.Fatalf("inspect target container state: %v", err)
	}
	if state.ExitCode != 0 {
		t.Fatalf("expected target container exit code 0, got %d", state.ExitCode)
	}
	rawOutput, err := os.ReadFile(hostJSONPath)
	if err != nil {
		t.Fatalf("read json output from run directory: %v", err)
	}
	var payload T
	if err := json.Unmarshal(rawOutput, &payload); err != nil {
		t.Fatalf("decode json output: %v\nraw json:\n%s", err, string(rawOutput))
	}
	return JSONContainerRun[T]{
		Payload:    payload,
		LogText:    string(mustReadFile(t, logPath)),
		OutputPath: hostJSONPath,
	}
}

func mustReadFile(t *testing.T, path string) []byte {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read file %s: %v", path, err)
	}
	return data
}

func appendJSONLine(t *testing.T, hostPath string, value any) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(hostPath), 0o755); err != nil {
		t.Fatalf("create JSONL artifact directory for %q: %v", hostPath, err)
	}
	file, err := os.OpenFile(hostPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		t.Fatalf("open JSONL artifact %q: %v", hostPath, err)
	}
	defer file.Close()
	if err := json.NewEncoder(file).Encode(value); err != nil {
		t.Fatalf("append JSONL artifact %q: %v", hostPath, err)
	}
}
