#!/usr/bin/env node
import childProcess from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const cliRoot = path.resolve(scriptDir, '..')

function parseArgs(argv) {
  const args = {
    packRoot: path.join(cliRoot, 'dist', 'npm-packages'),
    tag: ''
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

    if (token === '--pack-root') {
      args.packRoot = path.resolve(next())
    } else if (token === '--tag') {
      args.tag = next()
    } else {
      throw new Error(`unknown argument: ${token}`)
    }
  }

  return args
}

async function readJSON(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

function assertValidNpmTag(tag) {
  if (!/^[0-9A-Za-z][0-9A-Za-z._-]{0,127}$/.test(tag)) {
    throw new Error(`invalid npm dist-tag: ${tag}`)
  }
}

function compareVersions(actual, minimum) {
  const actualParts = actual.split('.').map((part) => Number.parseInt(part, 10))
  const minimumParts = minimum.split('.').map((part) => Number.parseInt(part, 10))
  for (let i = 0; i < minimumParts.length; i += 1) {
    const actualPart = actualParts[i] || 0
    const minimumPart = minimumParts[i] || 0
    if (actualPart > minimumPart) return 1
    if (actualPart < minimumPart) return -1
  }
  return 0
}

function assertNpmSupportsTrustedPublishing() {
  const npmVersion = childProcess.execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim()
  if (compareVersions(npmVersion, '11.5.1') < 0) {
    throw new Error(`npm ${npmVersion} is too old for trusted publishing; npm 11.5.1 or newer is required`)
  }
}

function defaultTagForVersion(version) {
  return version.includes('-') ? 'next' : 'latest'
}

function npmPublish({ tarball, tag }) {
  const result = childProcess.spawnSync(
    'npm',
    ['publish', tarball, '--tag', tag, '--access', 'public', '--provenance'],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        NPM_CONFIG_PROVENANCE: 'true'
      }
    }
  )
  if (result.status !== 0) {
    throw new Error(`npm publish failed for ${tarball}`)
  }
}

async function publish({ packRoot, tag }) {
  const packRootDir = path.resolve(packRoot)
  const manifest = await readJSON(path.join(packRootDir, 'manifest.json'))
  const npmTag = tag || defaultTagForVersion(manifest.version)

  assertValidNpmTag(npmTag)
  assertNpmSupportsTrustedPublishing()

  for (const entry of manifest.packages) {
    const tarball = path.join(packRootDir, entry.tarball)
    console.log(`Publishing ${entry.name}@${manifest.version} with dist-tag ${npmTag}`)
    npmPublish({ tarball, tag: npmTag })
  }
}

try {
  await publish(parseArgs(process.argv.slice(2)))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
