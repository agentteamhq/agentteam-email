# Full-Stack Browser E2E

This opt-in suite starts the local production-like stack through Testcontainers,
runs a Playwright browser in a container on the same isolated network, records
the first-use product flow, and submits the complete run directory as one test
artifact bundle.

Run it from the repository root after installing dependencies:

```bash
mise run test:e2e:browser-recorded
```

The suite writes evidence to `test-containers/full-stack-browser-e2e/tmp/run-<id>/`.
Set `TEST_ARTIFACT_SUBMIT_SKIP=1` to keep the run local without uploading the
artifact bundle.
