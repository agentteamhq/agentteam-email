#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const cliRoot = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(cliRoot, '..', '..')
const canonicalSkillPath = path.join(cliRoot, 'SKILL.md')
const discoverableSkillPath = path.join(repoRoot, 'skills', 'at-email-cli', 'SKILL.md')
const skillsConfigPath = path.join(repoRoot, 'skills.sh.json')

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function parseFrontmatter(markdown, label) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/)
  assert(match, `${label} must start with YAML frontmatter`)
  const values = new Map()
  for (const line of match[1].split('\n')) {
    const colon = line.indexOf(':')
    if (colon === -1 || line.startsWith(' ') || line.startsWith('\t')) {
      continue
    }
    values.set(line.slice(0, colon), line.slice(colon + 1).trim())
  }
  return values
}

async function readJSON(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function validate() {
  const [canonicalSkill, discoverableSkill, skillsConfig] = await Promise.all([
    fs.readFile(canonicalSkillPath, 'utf8'),
    fs.readFile(discoverableSkillPath, 'utf8'),
    readJSON(skillsConfigPath)
  ])

  assert(
    discoverableSkill === canonicalSkill,
    'skills/at-email-cli/SKILL.md must match apps/at-email-cli/SKILL.md. Run mise run //apps/at-email-cli:skills:sync.'
  )

  const frontmatter = parseFrontmatter(discoverableSkill, 'skills/at-email-cli/SKILL.md')
  assert(
    frontmatter.get('name') === 'at-email-cli',
    'discoverable skill frontmatter name must be at-email-cli'
  )
  assert(frontmatter.has('description'), 'discoverable skill frontmatter must include description')

  assert(
    skillsConfig.$schema === 'https://skills.sh/schemas/skills.sh.schema.json',
    'skills.sh.json must declare the skills.sh schema'
  )
  assert(
    skillsConfig.notGrouped === undefined || ['top', 'bottom'].includes(skillsConfig.notGrouped),
    'skills.sh.json notGrouped must be top or bottom'
  )
  assert(Array.isArray(skillsConfig.groupings), 'skills.sh.json groupings must be an array')
  assert(skillsConfig.groupings.length > 0, 'skills.sh.json must include at least one grouping')

  let listed = false
  for (const [index, group] of skillsConfig.groupings.entries()) {
    assert(
      typeof group.title === 'string' && group.title.trim() !== '',
      `skills.sh.json group ${index} needs a title`
    )
    assert(
      Array.isArray(group.skills) && group.skills.length > 0,
      `skills.sh.json group ${index} needs skills`
    )
    listed ||= group.skills.includes('at-email-cli')
  }

  assert(listed, 'skills.sh.json must list at-email-cli in a grouping')
  console.log('Validated at-email CLI skill discovery files')
}

try {
  await validate()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
