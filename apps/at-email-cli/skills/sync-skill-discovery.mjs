#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const cliRoot = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(cliRoot, '..', '..')
const canonicalSkill = path.join(cliRoot, 'SKILL.md')
const discoverableSkill = path.join(repoRoot, 'skills', 'at-email-cli', 'SKILL.md')

try {
  await fs.mkdir(path.dirname(discoverableSkill), { recursive: true })
  await fs.copyFile(canonicalSkill, discoverableSkill)
  console.log(
    `Synced ${path.relative(repoRoot, discoverableSkill)} from ${path.relative(repoRoot, canonicalSkill)}`
  )
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
