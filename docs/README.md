# Docs Maintenance

This directory is the Mintlify documentation root. Published pages are listed in
`docs/docs.json`; repo-only notes stay excluded through `docs/.mintignore`.

Public URLs:

- Website: `https://www.agentteam.email`
- App: `https://app.agentteam.email`
- Docs: `https://agentteamemail.mintlify.com`

## Examples and snippets

Canonical example files live under `docs/examples/`. Generated MDX snippets live
under `docs/snippets/generated/` and must be regenerated from their source
files:

```bash
mise run //docs:snippets
```

Use generated snippets when a published page needs to render a source file, for
example `docs/examples/self-host/email-routing.json` or
`skills/at-email-cli/SKILL.md`. Do not maintain a second committed copy of those
sources inside a docs page.

Raw example files are served from the deployed docs site at the same path below
the docs root, for example:

```text
/examples/self-host/email-routing.json
/examples/helm/values-basic.yaml
```

## Validation

After changing `docs.json`, page frontmatter, links, anchors, examples, or
generated snippets, run:

```bash
mise run //docs:validate
mise run //docs:broken-links
```
