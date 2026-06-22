#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pluginBundles, skillName } from './manifests.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const cliRoot = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(cliRoot, '..', '..')
const canonicalSkillPath = path.join(repoRoot, 'skills', skillName, 'SKILL.md')

function parseArgs(argv) {
  const args = {
    pluginsRoot: path.join(cliRoot, 'dist', 'plugins')
  }

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    const next = () => {
      i += 1
      if (i >= argv.length) {
        throw new Error(`${token} requires a value`)
      }
      return argv[i]
    }

    if (token === '--plugins-root') {
      args.pluginsRoot = path.resolve(next())
    } else {
      throw new Error(`unknown argument: ${token}`)
    }
  }

  return args
}

async function readJSON(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

function assertDeepEqual(actual, expected, label) {
  const actualJSON = JSON.stringify(actual)
  const expectedJSON = JSON.stringify(expected)
  if (actualJSON !== expectedJSON) {
    throw new Error(`${label} did not match expected manifest`)
  }
}

async function listFiles(dir, base = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath, base)))
    } else if (entry.isFile()) {
      files.push(path.relative(base, fullPath).split(path.sep).join('/'))
    }
  }
  return files.sort()
}

async function assertExpectedFiles(bundleRoot, manifestPath) {
  const files = await listFiles(bundleRoot)
  const expected = ['LICENSE', manifestPath, `skills/${skillName}/SKILL.md`].sort()
  assertDeepEqual(files, expected, bundleRoot)
}

function assertRelativePluginPaths(value, label) {
  if (typeof value === 'string' && (value.includes('/') || value.includes('.'))) {
    if (!value.startsWith('./')) {
      throw new Error(`${label} path must start with ./`)
    }
    if (value.includes('..')) {
      throw new Error(`${label} path must not traverse outside the plugin root`)
    }
  }
}

function validateManifestPaths(manifest, label) {
  assertRelativePluginPaths(manifest.skills, `${label}.skills`)
  assertRelativePluginPaths(manifest.mcpServers, `${label}.mcpServers`)
  assertRelativePluginPaths(manifest.apps, `${label}.apps`)
  if (manifest.interface?.composerIcon) {
    assertRelativePluginPaths(manifest.interface.composerIcon, `${label}.interface.composerIcon`)
  }
  if (manifest.interface?.logo) {
    assertRelativePluginPaths(manifest.interface.logo, `${label}.interface.logo`)
  }
}

async function validate({ pluginsRoot }) {
  const pluginsRootDir = path.resolve(pluginsRoot)
  const manifest = await readJSON(path.join(pluginsRootDir, 'manifest.json'))
  const canonicalSkill = await fs.readFile(canonicalSkillPath, 'utf8')

  for (const expectedBundle of pluginBundles) {
    const entry = manifest.bundles.find((bundle) => bundle.id === expectedBundle.id)
    if (!entry) {
      throw new Error(`missing generated bundle entry for ${expectedBundle.id}`)
    }

    const bundleRoot = path.join(pluginsRootDir, entry.directory)
    const actualManifest = await readJSON(path.join(bundleRoot, entry.manifest))
    assertDeepEqual(actualManifest, expectedBundle.manifest({ version: manifest.version }), entry.id)
    validateManifestPaths(actualManifest, entry.id)

    const skill = await fs.readFile(path.join(bundleRoot, entry.skill), 'utf8')
    if (skill !== canonicalSkill) {
      throw new Error(`${entry.id} bundle skill did not match skills/at-email-cli/SKILL.md`)
    }

    await assertExpectedFiles(bundleRoot, entry.manifest)
  }

  console.log(`Validated ${manifest.bundles.length} plugin bundles for ${manifest.version}`)
}

try {
  await validate(parseArgs(process.argv.slice(2)))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
