package controlstate

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"time"
)

const (
	BackendMemory              = "memory"
	BackendKubernetesConfigMap = "kubernetes-configmap"
	defaultConfigMapKey        = "state.json"
	serviceAccountRoot         = "/var/run/secrets/kubernetes.io/serviceaccount"
)

type KubernetesConfigMapConfig struct {
	Namespace string
	Name      string
	Key       string
	APIHost   string
	APIPort   string
	Token     string
	CACertPEM []byte
}

type KubernetesConfigMapStore struct {
	cfg        KubernetesConfigMapConfig
	httpClient *http.Client
	baseURL    *url.URL
}

type configMapObject struct {
	APIVersion string            `json:"apiVersion,omitempty"`
	Kind       string            `json:"kind,omitempty"`
	Metadata   configMapMetadata `json:"metadata"`
	Data       map[string]string `json:"data,omitempty"`
}

type configMapMetadata struct {
	Name            string            `json:"name"`
	Namespace       string            `json:"namespace,omitempty"`
	ResourceVersion string            `json:"resourceVersion,omitempty"`
	Labels          map[string]string `json:"labels,omitempty"`
}

type kubernetesStatus struct {
	Message string `json:"message"`
	Reason  string `json:"reason"`
	Code    int    `json:"code"`
}

func NewStoreFromEnv() (Store, error) {
	backend := os.Getenv("AGENT_MAIL_CONTROL_STATE_BACKEND")
	switch backend {
	case "", BackendMemory:
		return NewMemoryStore(), nil
	case BackendKubernetesConfigMap:
		return NewKubernetesConfigMapStoreFromEnv()
	default:
		return nil, fmt.Errorf("unsupported AGENT_MAIL_CONTROL_STATE_BACKEND %q", backend)
	}
}

func NewKubernetesConfigMapStoreFromEnv() (*KubernetesConfigMapStore, error) {
	name := os.Getenv("AGENT_MAIL_CONTROL_STATE_CONFIGMAP")
	if name == "" {
		return nil, fmt.Errorf("missing AGENT_MAIL_CONTROL_STATE_CONFIGMAP")
	}
	namespace, err := readServiceAccountFile("namespace")
	if err != nil {
		return nil, err
	}
	token, err := readServiceAccountFile("token")
	if err != nil {
		return nil, err
	}
	ca, err := os.ReadFile(serviceAccountRoot + "/ca.crt")
	if err != nil {
		return nil, fmt.Errorf("read Kubernetes service account CA certificate: %w", err)
	}
	host := os.Getenv("KUBERNETES_SERVICE_HOST")
	if host == "" {
		return nil, fmt.Errorf("missing KUBERNETES_SERVICE_HOST")
	}
	port := os.Getenv("KUBERNETES_SERVICE_PORT")
	if port == "" {
		return nil, fmt.Errorf("missing KUBERNETES_SERVICE_PORT")
	}
	return NewKubernetesConfigMapStore(KubernetesConfigMapConfig{
		Namespace: namespace,
		Name:      name,
		Key:       defaultConfigMapKey,
		APIHost:   host,
		APIPort:   port,
		Token:     token,
		CACertPEM: ca,
	})
}

func NewKubernetesConfigMapStore(cfg KubernetesConfigMapConfig) (*KubernetesConfigMapStore, error) {
	if cfg.Namespace == "" {
		return nil, fmt.Errorf("missing Kubernetes ConfigMap namespace")
	}
	if cfg.Name == "" {
		return nil, fmt.Errorf("missing Kubernetes ConfigMap name")
	}
	if cfg.Key == "" {
		cfg.Key = defaultConfigMapKey
	}
	if cfg.APIHost == "" {
		return nil, fmt.Errorf("missing Kubernetes API host")
	}
	if cfg.APIPort == "" {
		return nil, fmt.Errorf("missing Kubernetes API port")
	}
	if cfg.Token == "" {
		return nil, fmt.Errorf("missing Kubernetes API bearer token")
	}
	roots := x509.NewCertPool()
	if ok := roots.AppendCertsFromPEM(cfg.CACertPEM); !ok {
		return nil, fmt.Errorf("Kubernetes CA certificate PEM is invalid")
	}
	apiHost := net.JoinHostPort(cfg.APIHost, cfg.APIPort)
	baseURL := &url.URL{Scheme: "https", Host: apiHost}
	return &KubernetesConfigMapStore{
		cfg: cfg,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{
					RootCAs:    roots,
					MinVersion: tls.VersionTLS12,
				},
			},
		},
		baseURL: baseURL,
	}, nil
}

func (s *KubernetesConfigMapStore) State(ctx context.Context) (State, error) {
	object, exists, err := s.get(ctx)
	if err != nil {
		return State{}, err
	}
	if !exists {
		return emptyState(), nil
	}
	return s.decodeState(object)
}

func (s *KubernetesConfigMapStore) Metadata(ctx context.Context) (StoreMetadata, error) {
	object, exists, err := s.get(ctx)
	if err != nil {
		return StoreMetadata{}, err
	}
	metadata := StoreMetadata{
		Backend:         BackendKubernetesConfigMap,
		Namespace:       s.cfg.Namespace,
		ConfigMap:       s.cfg.Name,
		Key:             s.cfg.Key,
		ResourceVersion: object.Metadata.ResourceVersion,
		Exists:          exists,
		Configured:      exists,
	}
	if !exists {
		metadata.Issues = append(metadata.Issues, "control_state_configmap_missing")
	}
	return metadata, nil
}

func (s *KubernetesConfigMapStore) Update(ctx context.Context, update func(State) (State, error)) (State, error) {
	var lastConflict error
	for attempt := 0; attempt < 3; attempt++ {
		object, exists, err := s.get(ctx)
		if err != nil {
			return State{}, err
		}
		state := emptyState()
		if exists {
			state, err = s.decodeState(object)
			if err != nil {
				return State{}, err
			}
		}
		next, err := update(state)
		if err != nil {
			return State{}, err
		}
		next = normalizeState(next)
		object = s.objectForState(object, next)
		if exists {
			if err := s.put(ctx, object); err != nil {
				if isKubernetesConflict(err) {
					lastConflict = err
					continue
				}
				return State{}, err
			}
		} else {
			if err := s.create(ctx, object); err != nil {
				if isKubernetesConflict(err) || isKubernetesAlreadyExists(err) {
					lastConflict = err
					continue
				}
				return State{}, err
			}
		}
		return next, nil
	}
	return State{}, fmt.Errorf("update Kubernetes ConfigMap %s/%s conflicted after retries: %w", s.cfg.Namespace, s.cfg.Name, lastConflict)
}

func (s *KubernetesConfigMapStore) decodeState(object configMapObject) (State, error) {
	raw := ""
	if object.Data != nil {
		raw = object.Data[s.cfg.Key]
	}
	if raw == "" {
		return emptyState(), nil
	}
	var state State
	if err := json.Unmarshal([]byte(raw), &state); err != nil {
		return State{}, fmt.Errorf("decode control state ConfigMap %s/%s key %s: %w", s.cfg.Namespace, s.cfg.Name, s.cfg.Key, err)
	}
	return normalizeState(state), nil
}

func (s *KubernetesConfigMapStore) objectForState(existing configMapObject, state State) configMapObject {
	object := existing
	if object.APIVersion == "" {
		object.APIVersion = "v1"
	}
	if object.Kind == "" {
		object.Kind = "ConfigMap"
	}
	object.Metadata.Name = s.cfg.Name
	object.Metadata.Namespace = s.cfg.Namespace
	if object.Metadata.Labels == nil {
		object.Metadata.Labels = map[string]string{}
	}
	object.Metadata.Labels["app.kubernetes.io/name"] = "mail-control-service"
	object.Metadata.Labels["app.kubernetes.io/part-of"] = "agent-mail"
	object.Metadata.Labels["agent-mail-state"] = "domain-control"
	if object.Data == nil {
		object.Data = map[string]string{}
	}
	encoded, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		panic(fmt.Sprintf("marshal normalized control state: %v", err))
	}
	object.Data[s.cfg.Key] = string(encoded) + "\n"
	return object
}

func (s *KubernetesConfigMapStore) get(ctx context.Context) (configMapObject, bool, error) {
	var object configMapObject
	err := s.do(ctx, http.MethodGet, s.configMapPath(), nil, &object)
	if err == nil {
		return object, true, nil
	}
	if isKubernetesNotFound(err) {
		return configMapObject{}, false, nil
	}
	return configMapObject{}, false, err
}

func (s *KubernetesConfigMapStore) create(ctx context.Context, object configMapObject) error {
	return s.do(ctx, http.MethodPost, s.configMapsPath(), object, nil)
}

func (s *KubernetesConfigMapStore) put(ctx context.Context, object configMapObject) error {
	return s.do(ctx, http.MethodPut, s.configMapPath(), object, nil)
}

func (s *KubernetesConfigMapStore) do(ctx context.Context, method string, path string, requestBody any, responseBody any) error {
	var body io.Reader
	if requestBody != nil {
		encoded, err := json.Marshal(requestBody)
		if err != nil {
			return fmt.Errorf("marshal Kubernetes request %s %s: %w", method, path, err)
		}
		body = bytes.NewReader(encoded)
	}
	requestURL := s.baseURL.ResolveReference(&url.URL{Path: path})
	request, err := http.NewRequestWithContext(ctx, method, requestURL.String(), body)
	if err != nil {
		return fmt.Errorf("build Kubernetes request %s %s: %w", method, path, err)
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Authorization", "Bearer "+s.cfg.Token)
	if requestBody != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	response, err := s.httpClient.Do(request)
	if err != nil {
		return fmt.Errorf("Kubernetes request %s %s: %w", method, path, err)
	}
	defer response.Body.Close()
	data, err := io.ReadAll(response.Body)
	if err != nil {
		return fmt.Errorf("read Kubernetes response %s %s: %w", method, path, err)
	}
	if response.StatusCode >= 400 {
		var status kubernetesStatus
		if json.Unmarshal(data, &status) == nil && status.Reason != "" {
			return &KubernetesAPIError{
				StatusCode: response.StatusCode,
				Reason:     status.Reason,
				Message:    status.Message,
			}
		}
		return &KubernetesAPIError{
			StatusCode: response.StatusCode,
			Reason:     response.Status,
			Message:    string(data),
		}
	}
	if responseBody == nil {
		return nil
	}
	if err := json.Unmarshal(data, responseBody); err != nil {
		return fmt.Errorf("decode Kubernetes response %s %s: %w", method, path, err)
	}
	return nil
}

func (s *KubernetesConfigMapStore) configMapsPath() string {
	path, err := url.JoinPath("/api/v1/namespaces", s.cfg.Namespace, "configmaps")
	if err != nil {
		panic(err)
	}
	return path
}

func (s *KubernetesConfigMapStore) configMapPath() string {
	path, err := url.JoinPath("/api/v1/namespaces", s.cfg.Namespace, "configmaps", s.cfg.Name)
	if err != nil {
		panic(err)
	}
	return path
}

type KubernetesAPIError struct {
	StatusCode int
	Reason     string
	Message    string
}

func (e *KubernetesAPIError) Error() string {
	if e.Message != "" {
		return fmt.Sprintf("Kubernetes API status=%d reason=%s message=%s", e.StatusCode, e.Reason, e.Message)
	}
	return fmt.Sprintf("Kubernetes API status=%d reason=%s", e.StatusCode, e.Reason)
}

func isKubernetesNotFound(err error) bool {
	var apiErr *KubernetesAPIError
	return errors.As(err, &apiErr) && apiErr.StatusCode == http.StatusNotFound
}

func isKubernetesConflict(err error) bool {
	var apiErr *KubernetesAPIError
	return errors.As(err, &apiErr) && apiErr.StatusCode == http.StatusConflict
}

func isKubernetesAlreadyExists(err error) bool {
	var apiErr *KubernetesAPIError
	return errors.As(err, &apiErr) && apiErr.StatusCode == http.StatusConflict && apiErr.Reason == "AlreadyExists"
}

func readServiceAccountFile(name string) (string, error) {
	data, err := os.ReadFile(serviceAccountRoot + "/" + name)
	if err != nil {
		return "", fmt.Errorf("read Kubernetes service account %s: %w", name, err)
	}
	return string(bytes.TrimSpace(data)), nil
}
