# Full-Stack Helm E2E

This suite installs the Helm chart into kind, applies test-only stack
dependencies, and records phase-by-phase assertions for the public web-server
boundary, domain provisioning, inbound mail, outbound mail, and failure matrix.

Run from the repository root:

```bash
TEST_ARTIFACT_SUBMIT_SKIP=1 mise run //test-containers/full-stack-e2e:test
```

One invocation writes one artifact directory under `tmp/run-<id>/`. The current
suite is expected to fail until the deployed chart and web-server-owned mail
flows implement the full P1 stack contract.
