package fastpathgate

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"
	"time"
)

const (
	defaultListenAddr = ":9003"
	defaultTargetURL  = "http://127.0.0.1:8080/agent-mail/ingest/v1"
	notifyPath        = "/agent-mail/ingest/v1"
)

type Config struct {
	ListenAddr string
	TargetURL  string
}

func Main(ctx context.Context, args []string) error {
	flags := flag.NewFlagSet("agent-mail-control-service fastpath-gate", flag.ContinueOnError)
	cfg := Config{}
	flags.StringVar(&cfg.ListenAddr, "listen-addr", envOrDefault("AGENT_MAIL_FASTPATH_GATE_LISTEN_ADDR", defaultListenAddr), "HTTP listen address")
	flags.StringVar(&cfg.TargetURL, "target-url", envOrDefault("AGENT_MAIL_FASTPATH_GATE_TARGET_URL", defaultTargetURL), "poller fast-path target URL")
	if err := flags.Parse(args); err != nil {
		return err
	}
	return Run(ctx, cfg)
}

func Run(ctx context.Context, cfg Config) error {
	listenAddr := strings.TrimSpace(cfg.ListenAddr)
	if listenAddr == "" {
		listenAddr = defaultListenAddr
	}
	target, err := parseTargetURL(cfg.TargetURL)
	if err != nil {
		return err
	}
	proxy := httputil.NewSingleHostReverseProxy(&url.URL{Scheme: target.Scheme, Host: target.Host})
	proxy.Director = func(req *http.Request) {
		req.URL.Scheme = target.Scheme
		req.URL.Host = target.Host
		req.URL.Path = target.Path
		req.URL.RawPath = ""
		req.URL.RawQuery = ""
		req.Host = target.Host
	}
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		log.Printf("agent-mail-fastpath-gate event=proxy_failed method=%s path=%s error=%q", r.Method, r.URL.Path, err)
		http.Error(w, "bad gateway\n", http.StatusBadGateway)
	}

	server := &http.Server{
		Addr:              listenAddr,
		Handler:           Handler(proxy),
		ReadHeaderTimeout: 10 * time.Second,
	}
	errCh := make(chan error, 1)
	go func() {
		log.Printf("agent-mail-fastpath-gate event=start listen_addr=%s target_url=%s", listenAddr, target.String())
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- err
			return
		}
		errCh <- nil
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			return fmt.Errorf("shutdown fast-path gate: %w", err)
		}
		return <-errCh
	case err := <-errCh:
		return err
	}
}

func Handler(proxy http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		lw := &statusResponseWriter{ResponseWriter: w, status: http.StatusOK}
		// Regression context: TLS-terminated TCP Funnel forwards every public
		// path on the hostname. Keep the gate route-only so changing transport
		// cannot expose poller health, admin, or future debug endpoints.
		if r.Method != http.MethodPost || r.URL.Path != notifyPath || r.URL.RawQuery != "" {
			http.NotFound(lw, r)
		} else {
			proxy.ServeHTTP(lw, r)
		}
		log.Printf("agent-mail-fastpath-gate event=request method=%s path=%s status=%d duration_ms=%d", r.Method, r.URL.Path, lw.status, time.Since(start).Milliseconds())
	})
}

func parseTargetURL(value string) (*url.URL, error) {
	raw := strings.TrimSpace(value)
	if raw == "" {
		raw = defaultTargetURL
	}
	target, err := url.Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("parse fast-path gate target URL: %w", err)
	}
	if target.Scheme != "http" || target.Host == "" || target.Path != notifyPath {
		return nil, fmt.Errorf("fast-path gate target URL must be http://host%s", notifyPath)
	}
	target.RawQuery = ""
	target.Fragment = ""
	return target, nil
}

func envOrDefault(name string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback
	}
	return value
}

type statusResponseWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusResponseWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}
