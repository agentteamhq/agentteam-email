package atemailskill

import _ "embed"

// Markdown is the operator skill bundled into the at-email binary.
// The canonical source is skills/at-email-cli/SKILL.md; container and host
// release builds stage it under tmp/ before compilation.
//
//go:embed tmp/SKILL.md
var Markdown string
