# Release Versioning

One SemVer Git tag controls each published release. Main publishes nothing;
release tags publish the complete release set.

The source of truth for release `X.Y.Z` is Git tag `vX.Y.Z`. Published
first-party artifacts use version `X.Y.Z`; the leading `v` is only part of the
Git tag name.

## Published Artifacts

Stable release `vX.Y.Z` publishes:

- GitHub Release `vX.Y.Z`
- at-email CLI release binaries:
  - `at-email_X.Y.Z_linux_amd64`
  - `at-email_X.Y.Z_linux_arm64`
  - `at-email_X.Y.Z_darwin_amd64`
  - `at-email_X.Y.Z_darwin_arm64`
  - `at-email_X.Y.Z_windows_amd64.exe`
  - `at-email_X.Y.Z_windows_arm64.exe`
- at-email CLI `checksums.txt`
- at-email CLI plugin bundles:
  - `at-email_X.Y.Z_claude-plugin.tar.gz`
  - `at-email_X.Y.Z_codex-plugin.tar.gz`
- npm package `@agentteamhq/email@X.Y.Z`
- npm platform packages:
  - `@agentteamhq/email-linux-x64-gnu@X.Y.Z`
  - `@agentteamhq/email-linux-x64-musl@X.Y.Z`
  - `@agentteamhq/email-linux-arm64-gnu@X.Y.Z`
  - `@agentteamhq/email-linux-arm64-musl@X.Y.Z`
  - `@agentteamhq/email-darwin-x64@X.Y.Z`
  - `@agentteamhq/email-darwin-arm64@X.Y.Z`
  - `@agentteamhq/email-win32-x64@X.Y.Z`
  - `@agentteamhq/email-win32-arm64@X.Y.Z`
- `ghcr.io/agentteamhq/agentteam-email/atemail-mail-control-service:X.Y.Z`
- `ghcr.io/agentteamhq/agentteam-email/atemail-web-server:X.Y.Z`
- `ghcr.io/agentteamhq/agentteam-email/atemail-cli:X.Y.Z`
- `ghcr.io/agentteamhq/agentteam-email/atemail-mail-control-service:latest`
- `ghcr.io/agentteamhq/agentteam-email/atemail-web-server:latest`
- `ghcr.io/agentteamhq/agentteam-email/atemail-cli:latest`
- Helm chart OCI artifact `oci://ghcr.io/agentteamhq/agentteam-email --version X.Y.Z`

Prerelease `vX.Y.Z-rc.N` publishes image and Helm chart versions as
`X.Y.Z-rc.N` without the leading `v`. It also moves these first-party image tags
to the same image digests:

- `ghcr.io/agentteamhq/agentteam-email/atemail-mail-control-service:next`
- `ghcr.io/agentteamhq/agentteam-email/atemail-web-server:next`
- `ghcr.io/agentteamhq/agentteam-email/atemail-cli:next`

Prerelease workflows must not update `latest`. The `next` image tag tracks the
most recently published RC candidate only; stable releases move `latest` and
leave `next` untouched.

## Source Tree Versions

`charts/agentteam-email/Chart.yaml` must keep a development placeholder version
in the source tree. Helm requires `Chart.yaml version`, but unreleased source
must not claim to be a published release.

First-party Helm images default to `latest`. Operators can override image
repositories, tags, pull policies, or digests in values.

Workspace `package.json` versions are development metadata only and are not
bumped for AgentTeam Email releases. The public `@agentteamhq/email` npm packages
are generated into `apps/at-email-cli/dist/` during the tag workflow from the
Git tag version and GoReleaser output.

The at-email CLI plugin bundles are also generated into
`apps/at-email-cli/dist/` during the tag workflow. Their plugin manifest
versions and tarball names are derived from the same Git tag version; committed
source files do not carry release version bumps for those bundles.

The discoverable at-email CLI skill is committed under `skills/at-email-cli` for
skills.sh, Hermes taps, LobeHub-style GitHub indexing, and ClawHub publishing.
It is the only committed skill source. Container builds copy it directly, and
host GoReleaser builds stage it into `apps/at-email-cli/tmp/SKILL.md` with
`mise run //apps/at-email-cli:skills:stage` before compilation.

## Compose

Compose uses `latest` unless `AT_EMAIL_ADMIN_VERSION` is set:

```yaml
image: ghcr.io/agentteamhq/agentteam-email/atemail-mail-control-service:${AT_EMAIL_ADMIN_VERSION:-latest}
image: ghcr.io/agentteamhq/agentteam-email/atemail-web-server:${AT_EMAIL_ADMIN_VERSION:-latest}
```

Pin a release with:

```bash
AT_EMAIL_ADMIN_VERSION=X.Y.Z docker compose up -d
```

Track the latest RC image set with:

```bash
AT_EMAIL_ADMIN_VERSION=next docker compose up -d
```

Use `next` only for RC validation. Production installs should pin an exact
release version or use the default stable `latest` tag.

## Helm

Public docs may omit `--version` to install the latest stable chart:

```bash
helm upgrade --install atemail \
  oci://ghcr.io/agentteamhq/agentteam-email \
  --namespace agentteam-email \
  --create-namespace \
  -f values.yaml
```

Operators can pin a chart version:

```bash
helm upgrade --install atemail \
  oci://ghcr.io/agentteamhq/agentteam-email \
  --version X.Y.Z \
  --namespace agentteam-email \
  --create-namespace \
  -f values.yaml
```

There is no moving `next` Helm chart tag. RC charts are installed by exact chart
version. To run the latest RC images with Helm, set the first-party image tags to
`next` in values:

```yaml
images:
  mailControlService:
    tag: next
  webServer:
    tag: next
```

The chart defaults first-party images to `latest` with `imagePullPolicy:
Always`. Operators can override image repositories, tags, pull policies, or
digests in values.

## at-email CLI

The at-email CLI release is owned by
`apps/at-email-cli/.goreleaser.yml`. GoReleaser builds raw binaries rather than
archives so `at-email self-update` can download and replace one executable
directly. The binary asset name format is:

```text
at-email_X.Y.Z_<os>_<arch>[.exe]
```

`at-email version` and `at-email --version` print the build version stamped by
GoReleaser. Container image builds stamp the same version, commit, and build date
from the release workflow.

`at-email self-update [version]` resolves release assets from
`github.com/agentteamhq/agentteam-email`, downloads `checksums.txt`, verifies the
selected binary checksum, and replaces the current executable. Windows binaries
are published for direct download, but in-place self-update is disabled on
Windows.

The npm distribution exposes `npx @agentteamhq/email` and installs platform
packages through npm `optionalDependencies`. The root package `@agentteamhq/email`
contains the JavaScript `at-email` wrapper, while platform packages contain the
compiled Go binaries. Linux glibc and musl packages publish separate npm package
metadata and copy the same static `CGO_ENABLED=0` Linux binary. The wrapper sets
`AT_EMAIL_DISTRIBUTION=npm`, and `at-email self-update` is disabled for that
distribution because npm owns the installed version. Update notices still check
GitHub Releases, but npm installs tell users to update `@agentteamhq/email`
through their package manager.

The plugin bundle distribution packages the same embedded `SKILL.md` as simple
Claude Code and Codex plugins. The generated bundle roots are named `at-email`
and contain one host-specific plugin manifest, `skills/at-email-cli/SKILL.md`,
and `LICENSE`. Marketplace catalog JSON is managed separately from the versioned
release bundle generation.

## Release Workflow

The release flow is tag first. The tag workflow creates and populates the GitHub
Release through GoReleaser.

1. Merge the release-ready commit.
2. Create and push an annotated SemVer tag with a leading `v`.
3. Let the tag workflow publish CLI binaries, checksums, images, and the Helm
   chart from that exact tag.

Stable release:

```bash
VERSION=X.Y.Z
git tag -a "v${VERSION}" -m "v${VERSION}"
git push origin "v${VERSION}"
```

Prerelease:

```bash
VERSION=X.Y.Z-rc.N
git tag -a "v${VERSION}" -m "v${VERSION}"
git push origin "v${VERSION}"
```

The tag workflow publishes:

- exact first-party image tags without the leading `v`
- `latest` image tags for stable releases only
- `next` image tags for RC prereleases only
- the Helm chart OCI artifact with the same version
- at-email CLI binaries and `checksums.txt` attached to the GitHub Release
- at-email CLI Claude Code and Codex plugin bundles attached to the GitHub
  Release
- `@agentteamhq/email` npm packages with the same version
- npm package tarball provenance through npm trusted publishing and GitHub
  artifact attestations for the generated tarballs

Prerelease workflows publish exact prerelease versions, move first-party image
`next` tags, and must not update `latest` image tags. Prerelease npm packages
use the `next` dist-tag; stable npm packages use the `latest` dist-tag.

Release packaging stamps the Helm chart version and app version from the Git
tag. The workflow must not require npm package version bumps.

The workflow attaches GitHub artifact attestations to the at-email CLI binaries,
the checksum manifest, the generated plugin bundle tarballs, the generated npm
package tarballs, the published image digests, and the Helm chart OCI digest.
The `@agentteamhq/email` npm packages are configured for npm trusted publishing
from the `.github/workflows/build-test-deploy.yml` workflow in the `production`
environment, so automated publishing does not require `NODE_AUTH_TOKEN` or an
npm token secret.

## Skill Marketplace Publishing

Skill marketplace publishing is intentionally manual because the marketplaces
index GitHub paths or use separate publisher tooling instead of the release tag
workflow.

The canonical skill source is:

```text
skills/at-email-cli/SKILL.md
```

Do not maintain a second committed copy under `apps/at-email-cli`. Container
builds copy the root skill into the Go build stage. Host GoReleaser builds run
`mise run //apps/at-email-cli:skills:stage`, which writes an ignored
`apps/at-email-cli/tmp/SKILL.md` for `go:embed`.

### Skill Versioning

The skill version is the `version:` field in
`skills/at-email-cli/SKILL.md` frontmatter. Bump it when the published skill
instructions, metadata, or runtime assumptions change.

Skill versions are independent from repository release tags. Most skill
directories index GitHub content directly, so release automation does not
publish the skill automatically.

### Publishing Surfaces

Current skill distribution surfaces:

- GitHub canonical path:
  `https://github.com/agentteamhq/agentteam-email/tree/main/skills/at-email-cli`
- skills.sh listing configured by root `skills.sh.json`.
- Hermes tap and direct GitHub path install.
- ClawHub/OpenClaw package: `@agentteamhq/at-email-cli`.
- LobeHub submission that references the canonical GitHub skill path.
- Claude Code and Codex plugin bundles generated during the normal at-email CLI
  release workflow from the canonical skill.

### Skill Update Procedure

1. Edit `skills/at-email-cli/SKILL.md`.
2. Bump the frontmatter `version:`.
3. Run the skill validation:

   ```bash
   mise run //apps/at-email-cli:skills:check
   ```

4. Run the plugin bundle validation when the skill affects plugin packaging:

   ```bash
   mise run //apps/at-email-cli:release:plugins:check
   ```

5. Merge and push the repository change.
6. Re-seed skills.sh from a temporary directory so it reads the pushed GitHub
   path:

   ```bash
   tmpdir="$(mktemp -d)"
   cd "${tmpdir}"
   env -u DO_NOT_TRACK -u DISABLE_TELEMETRY npx --yes skills add \
     https://github.com/agentteamhq/agentteam-email/tree/main/skills/at-email-cli \
     --skill at-email-cli -y
   ```

7. Publish the same version to ClawHub:

   ```bash
   VERSION=X.Y.Z
   npx --yes clawhub@latest whoami
   npx --yes clawhub@latest skill publish skills/at-email-cli \
     --owner agentteamhq \
     --version "${VERSION}" \
     --dry-run \
     --json
   npx --yes clawhub@latest skill publish skills/at-email-cli \
     --owner agentteamhq \
     --version "${VERSION}" \
     --json
   npx --yes clawhub@latest inspect at-email-cli --files
   ```

8. Check the LobeHub submission page. If it has not picked up the updated
   GitHub content, resubmit the canonical GitHub skill path.

### Skill Install Checks

Direct skills CLI install:

```bash
npx skills add https://github.com/agentteamhq/agentteam-email/tree/main/skills/at-email-cli
```

Hermes direct install:

```bash
hermes skills install agentteamhq/agentteam-email/skills/at-email-cli
```

Hermes tap:

```bash
hermes skills tap add agentteamhq/agentteam-email
```

OpenClaw/ClawHub install:

```bash
openclaw skills install @agentteamhq/at-email-cli
```

## Release Notes

GitHub generated release notes are the changelog. Add the artifact summary to
the release body when image digests are available:

```text
Git tag: vX.Y.Z
Commit: <sha>
Mail Control Service image: ghcr.io/agentteamhq/agentteam-email/atemail-mail-control-service:X.Y.Z
Mail Control Service digest: sha256:...
Web server image: ghcr.io/agentteamhq/agentteam-email/atemail-web-server:X.Y.Z
Web server digest: sha256:...
at-email CLI image: ghcr.io/agentteamhq/agentteam-email/atemail-cli:X.Y.Z
at-email CLI image digest: sha256:...
at-email CLI assets: at-email_X.Y.Z_<os>_<arch>[.exe], checksums.txt
at-email plugin bundles: at-email_X.Y.Z_claude-plugin.tar.gz, at-email_X.Y.Z_codex-plugin.tar.gz
at-email npm package: @agentteamhq/email@X.Y.Z
Helm chart: oci://ghcr.io/agentteamhq/agentteam-email --version X.Y.Z
Helm chart digest: sha256:...
```
