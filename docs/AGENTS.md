# Documentation Requirements

This directory owns the Mintlify documentation site.

Agents must keep `docs.json` navigation in sync with every published page they
add, move, or remove.

Agents must run `mise run //docs:validate` and `mise run //docs:broken-links` after
changing `docs.json`, page frontmatter, links, or anchors.

Agents may run `mise run //docs:dev` from the repository root to preview the site
locally.

Canonical static example files must live under `examples/`. Generated code-viewer
snippets for those files must live under `snippets/generated/` and must be
regenerated with `mise run //docs:snippets`.

`AGENTS.md` and repo-only maintenance notes must stay excluded from published
docs through `.mintignore`.
