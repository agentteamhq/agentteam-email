package atemailskill

import _ "embed"

// Markdown is the operator skill bundled into the at-email binary.
// The canonical source is skills/at-email-cli/SKILL.md; container and host
// release builds stage it here as SKILL.md before compilation.
//
//go:embed SKILL.md
var Markdown string
