# Skill Publishing

The at-email CLI skill has one committed source of truth:

```text
skills/at-email-cli/SKILL.md
```

Do not maintain a second committed copy under `apps/at-email-cli`. Container
builds copy the root skill into the Go build stage. Host GoReleaser builds run
`mise run //apps/at-email-cli:skills:stage`, which writes an ignored
`apps/at-email-cli/SKILL.md` for `go:embed`.

## Versioning

The skill version is the `version:` field in
`skills/at-email-cli/SKILL.md` frontmatter. Bump it when the published skill
instructions, metadata, or runtime assumptions change.

Skill versions are independent from repository release tags. Most skill
directories index GitHub content directly, so release automation does not
publish the skill automatically.

## Publishing Surfaces

Current skill distribution surfaces:

- GitHub canonical path:
  `https://github.com/agentteamhq/agentteam-email/tree/main/skills/at-email-cli`
- skills.sh listing configured by root `skills.sh.json`.
- Hermes tap and direct GitHub path install.
- ClawHub/OpenClaw package: `@agentteamhq/at-email-cli`.
- LobeHub submission that references the canonical GitHub skill path.
- Claude Code and Codex plugin bundles generated during the normal at-email CLI
  release workflow from the canonical skill.

## Update Procedure

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

## Install Checks

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
