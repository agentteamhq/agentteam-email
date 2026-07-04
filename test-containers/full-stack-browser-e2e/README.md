# Full-Stack Browser E2E

This suite starts the local production-like stack through Testcontainers,
runs a Playwright browser in a container on the same isolated network, records
the first-use product flow, and submits the complete run directory as one test
artifact bundle.

The suite is part of the root E2E aggregate:

```bash
mise run test:e2e
```

The recorded flow provisions the Cloudflare Email Worker through the fake
Cloudflare API, then delivers inbound mail by invoking the built Worker
`email()` handler with the provisioned runtime bindings. The harness adapts the
Worker's local R2 and ingest fetches to the isolated HTTP Testcontainers
services; production Worker URL validation is not changed.

Run only this suite from the repository root after installing dependencies:

```bash
mise run test:e2e:browser-recorded
```

That command creates the run directory first, builds the Worker package, then
records the required image build logs and browser harness logs into the same
bundle. To rerun only the browser harness against already-built `stage` images,
use:

```bash
mise run //test-containers/full-stack-browser-e2e:test:existing-images
pnpm --filter @main/full-stack-browser-e2e test
```

The suite writes evidence to `test-containers/full-stack-browser-e2e/tmp/run-<id>/`.
Artifact submission is skipped by default for public-checkout safety. Set
`TEST_ARTIFACT_SUBMIT_SKIP=0` in the ignored repo-local `.env` or shell
environment to upload the artifact bundle for a run.

Each invocation creates one run directory before the Node harness starts. The
runner tees the shell-visible test stream into `logs/test-run.log`, writes
harness logs to `logs/harness.log`, writes live container logs under
`containers/`, and keeps browser screenshots, video, subtitles, console
diagnostics, and network diagnostics under the same run directory.

Verbose container logs stream to their per-container files by default. Set
`AT_EMAIL_ADMIN_BROWSER_E2E_MIRROR_CONTAINER_LOGS=1` when the full container log
stream should also be mirrored to the terminal.

The browser recording uses Playwright screencast video with the native cursor
and action overlay enabled. The defaults add a small Playwright `slowMo`,
briefly hover before clicks, and pause on empty and filled forms before
submission. Tune these with:

```dotenv
AT_EMAIL_ADMIN_BROWSER_E2E_SLOW_MO_MS=10
AT_EMAIL_ADMIN_BROWSER_E2E_ACTION_OVERLAY_MS=500
AT_EMAIL_ADMIN_BROWSER_E2E_PRE_CLICK_PREVIEW_MS=150
AT_EMAIL_ADMIN_BROWSER_E2E_FORM_BLANK_PREVIEW_MS=350
AT_EMAIL_ADMIN_BROWSER_E2E_FORM_FILLED_PREVIEW_MS=700
```
