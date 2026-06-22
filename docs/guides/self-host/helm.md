# Helm Self-Host

The Helm chart is the supported Kubernetes self-host setup path.
Operator-specific choices belong in a release-owned `values.yaml`.

Public repository:

```text
https://github.com/agentteamhq/agentteam-email
```

Chart OCI reference:

```text
oci://ghcr.io/agentteamhq/agentteam-email
```

Example install shape:

- namespace: `agentteam-email`
- frontend URL: `https://mail.company.example`
- Worker ingest URL: `https://mail.company.example/agent-mail/ingest/v1`
- inbound mail domain: `company.example`

## Chart Layout

```text
charts/
  agentteam-email/
    Chart.yaml
    values.yaml
    values.schema.json
    templates/
    files/config/
```

The chart renders:

- namespace
- MongoDB
- Redis
- Rspamd
- WildDuck
- Haraka
- ZoneMTA
- mail control service as `atemail-mail-control-service`
- web server as `atemail-web-server`
- packaged service config ConfigMaps
- PVCs
- optional frontend Ingress

## Values Model

The chart values are semantic service settings, not a raw environment-variable
bag. The chart owns stable in-cluster defaults such as service DNS names,
database URLs, container ports, and module config paths.

Operators provide only deployment-specific values:

- public frontend hostname
- frontend auth and encryption secrets
- control API token
- WildDuck admin credentials
- internal mail runtime secrets
- object-storage archive endpoint, bucket, and credentials
- Cloudflare account, API token, and worker script name
- outbound provider and provider-specific credentials
- persistence, ingress, scheduling, and resource policy

Most sensitive environment values support either an inline `value` or an
explicit `valueFrom` source:

```yaml
webServer:
  authSecret:
    valueFrom:
      secretKeyRef:
        name: mail-secrets
        key: BETTER_AUTH_SECRET
```

Non-secret operator values can use the same Kubernetes-native shape with a
ConfigMap:

```yaml
objectStorage:
  endpoint:
    valueFrom:
      configMapKeyRef:
        name: mail-config
        key: AGENT_MAIL_R2_ENDPOINT
```

Secrets rendered into bundled Haraka, WildDuck, and ZoneMTA config files must
use inline `mailRuntime.*.value` entries. Missing values fail chart rendering.

## Required Values

Baseline self-host values:

```yaml
namespace:
  create: true
  name: agentteam-email

publicHostname: https://mail.company.example

webServer:
  authSecret:
    value: '<random-secret>'
  encryptionKey:
    value: '<base64url-32-byte-key>'

controlApi:
  token:
    value: '<random-control-token>'

wildduck:
  adminAccessToken:
    value: '<random-wildduck-token>'
  accessControlSecret:
    value: '<random-wildduck-secret>'

mailRuntime:
  loopSecret:
    value: '<random-mail-loop-secret>'
  zonemtaRelayPassword:
    value: '<random-zonemta-relay-password>'
  feedbackMailboxPassword:
    value: '<random-feedback-mailbox-password>'

objectStorage:
  endpoint:
    value: 'https://<account-id>.r2.cloudflarestorage.com'
  region:
    value: auto
  bucket:
    value: company-agent-mail-archive
  accessKeyId:
    value: '<r2-access-key>'
  secretAccessKey:
    value: '<r2-secret-key>'

cloudflare:
  apiBaseUrl: https://api.cloudflare.com/client/v4
  accountId:
    value: '<cloudflare-account-id>'
  apiToken:
    value: '<cloudflare-token>'
  worker:
    scriptName: agent-mail-ingress
    archiveBucket:
      value: company-agent-mail-archive

outbound:
  provider:
    value: cloudflare
```

The control service stores its queue and domain-control state in the service
MongoDB. The chart does not expose a Kubernetes ConfigMap state backend.

## Persistence

The public chart renders `PersistentVolumeClaim` resources only. It does not
render static `PersistentVolume` resources, `hostPath`, node-local paths, or
node selector assumptions. If `persistence.storageClassName` is empty, the chart
omits `storageClassName` so the cluster default StorageClass can provision the
volume.

```yaml
persistence:
  enabled: true
  storageClassName: ''

  mongodb:
    size: 20Gi
    accessModes: ['ReadWriteOnce']
    existingClaim: ''
  redis:
    size: 2Gi
    accessModes: ['ReadWriteOnce']
    existingClaim: ''
  rspamd:
    size: 1Gi
    accessModes: ['ReadWriteOnce']
    existingClaim: ''
  harakaQueue:
    size: 5Gi
    accessModes: ['ReadWriteOnce']
    existingClaim: ''
```

Set `existingClaim` when an environment owns its PVCs separately. In that mode
the chart mounts the named claim and does not create a PVC for that service.

Setting `persistence.enabled=false` switches MongoDB, Redis, Rspamd, and the
Haraka queue to `emptyDir`; use that only for disposable dev/test installs.

## Install

Keep one environment-owned values file per install:

```text
helm/
  values.yaml
```

Render first:

```bash
helm template atemail \
  oci://ghcr.io/agentteamhq/agentteam-email \
  --namespace agentteam-email \
  -f helm/values.yaml
```

Install or upgrade:

```bash
helm upgrade --install atemail \
  oci://ghcr.io/agentteamhq/agentteam-email \
  --namespace agentteam-email \
  --create-namespace \
  -f helm/values.yaml
```

Omitting `--version` installs the latest stable chart. Pin a chart version for
reproducible production rollouts.

Wait for the main workloads:

```bash
kubectl rollout status deployment/atemail-mail-control-service -n agentteam-email --timeout=180s
kubectl rollout status deployment/atemail-web-server -n agentteam-email --timeout=180s
```

For a full rollout check:

```bash
kubectl -n agentteam-email rollout status deployment/mongodb --timeout=180s
kubectl -n agentteam-email rollout status deployment/redis --timeout=180s
kubectl -n agentteam-email rollout status deployment/wildduck --timeout=180s
kubectl -n agentteam-email rollout status deployment/haraka --timeout=180s
kubectl -n agentteam-email rollout status deployment/zonemta --timeout=180s
kubectl -n agentteam-email rollout status deployment/atemail-mail-control-service --timeout=180s
kubectl -n agentteam-email rollout status deployment/atemail-web-server --timeout=180s
```

## Worker Ingress

The chart does not install or configure Tailscale, `cloudflared`, or any other
operator-owned ingress workload.

The web server owns Worker ingest verification. Product Cloudflare provisioning
binds each generated Worker to:

```text
<publicHostname>/agent-mail/ingest/v1
```

Configure operator-owned ingress to forward that full request to the web server
service:

```text
https://mail.company.example/agent-mail/ingest/v1 -> http://atemail-web-server:80
```

The generated Worker signs notifications with a per-connection secret stored by
the web server. Do not configure a deployment-wide Worker HMAC secret for the
chart.

Do not expose the internal control API, WildDuck, MongoDB, Redis, Haraka,
ZoneMTA, or Rspamd.

## Examples

Raw values files are in `docs/examples/helm`:

- [Basic Helm values](/examples/helm/values-basic.yaml)
- [Existing Secret values](/examples/helm/values-existing-secret.yaml)

## Validation

When working from a local checkout, use Helm rendering and client-side dry-run
before applying changes:

```bash
mise run //charts:check
```

The Helm/kind e2e scaffold is available as:

```bash
mise run //test-containers/kind-e2e:test
```

After deploy, send a test email through Cloudflare Email Routing and verify the
message appears in the authenticated web app.
