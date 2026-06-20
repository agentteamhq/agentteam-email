# Release Versioning

One SemVer Git tag controls each published release.

The source of truth for release `X.Y.Z` is Git tag `vX.Y.Z`. Published
first-party artifacts use version `X.Y.Z`; the leading `v` is only part of the
Git tag name.

## Published Artifacts

Stable release `vX.Y.Z` publishes:

- GitHub Release `vX.Y.Z`
- `ghcr.io/agentteamhq/agentteam-email/atemail-mail-control-service:X.Y.Z`
- `ghcr.io/agentteamhq/agentteam-email/atemail-web-server:X.Y.Z`
- `ghcr.io/agentteamhq/agentteam-email/atemail-mail-control-service:latest`
- `ghcr.io/agentteamhq/agentteam-email/atemail-web-server:latest`
- Helm chart OCI artifact `oci://ghcr.io/agentteamhq/agentteam-email --version X.Y.Z`

Prerelease `vX.Y.Z-rc.N` publishes image and Helm chart versions as
`X.Y.Z-rc.N` without the leading `v`.

## Source Tree Versions

`charts/agentteam-email/Chart.yaml` must keep a development placeholder version
in the source tree. Helm requires `Chart.yaml version`, but unreleased source
must not claim to be a published release.

First-party Helm images default to `latest`. Operators can override image
repositories, tags, pull policies, or digests in values.

Workspace `package.json` versions are npm metadata only. Packages in this repo
are not published as npm release artifacts, so package versions stay at `1.0.0`
and are not bumped for AgentTeam Email releases.

## Compose

Compose uses `latest` unless `AGENTTEAM_EMAIL_VERSION` is set:

```yaml
image: ghcr.io/agentteamhq/agentteam-email/atemail-mail-control-service:${AGENTTEAM_EMAIL_VERSION:-latest}
image: ghcr.io/agentteamhq/agentteam-email/atemail-web-server:${AGENTTEAM_EMAIL_VERSION:-latest}
```

Pin a release with:

```bash
AGENTTEAM_EMAIL_VERSION=X.Y.Z docker compose up -d
```

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

The chart defaults first-party images to `latest` with `imagePullPolicy:
Always`. Operators can override image repositories, tags, pull policies, or
digests in values.

## Release Workflow

The release flow is tag first, then GitHub Release.

1. Merge the release-ready commit.
2. Create and push an annotated SemVer tag with a leading `v`.
3. Let the tag workflow publish images and the Helm chart from that exact tag.
4. Create the GitHub Release with generated notes.

Stable release:

```bash
VERSION=X.Y.Z
git tag -a "v${VERSION}" -m "v${VERSION}"
git push origin "v${VERSION}"
gh release create "v${VERSION}" --verify-tag --generate-notes --title "v${VERSION}"
```

Prerelease:

```bash
VERSION=X.Y.Z-rc.N
git tag -a "v${VERSION}" -m "v${VERSION}"
git push origin "v${VERSION}"
gh release create "v${VERSION}" --verify-tag --generate-notes --prerelease --latest=false --title "v${VERSION}"
```

The tag workflow publishes:

- exact first-party image tags without the leading `v`
- `latest` image tags for stable releases only
- the Helm chart OCI artifact with the same version

Main branch builds publish `edge` and `sha-*` image tags. Prerelease workflows
publish exact prerelease image tags only and must not update `latest`.

Release packaging stamps the Helm chart version and app version from the Git
tag. The workflow must not require npm package version bumps.

The workflow attaches GitHub artifact attestations to the published image
digests and Helm chart OCI digest.

If release creation is automated in CI, the workflow must run the equivalent
`gh release create` command after artifacts publish.

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
Helm chart: oci://ghcr.io/agentteamhq/agentteam-email --version X.Y.Z
Helm chart digest: sha256:...
```
