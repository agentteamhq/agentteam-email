#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const cliRoot = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(cliRoot, '..', '..')
const canonicalSkill = path.join(repoRoot, 'skills', 'at-email-cli', 'SKILL.md')
const stagedSkill = path.join(cliRoot, 'tmp', 'SKILL.md')

try {
  await fs.mkdir(path.dirname(stagedSkill), { recursive: true })
  await fs.copyFile(canonicalSkill, stagedSkill)
  console.log(`Staged ${path.relative(repoRoot, canonicalSkill)} as ${path.relative(repoRoot, stagedSkill)}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
