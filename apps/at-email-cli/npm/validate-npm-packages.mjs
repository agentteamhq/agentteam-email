#!/usr/bin/env node
import childProcess from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { platformManifest, rootManifest } from './manifests.mjs'
import {
  binaryAliases,
  platformBinarySubpath,
  platformPackageName,
  platforms,
  rootPackageName
} from './platforms.mjs'
import { createSmokeTree, packagePath, readGeneratedManifest } from './smoke-tree.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const cliRoot = path.resolve(scriptDir, '..')

function parseArgs(argv) {
  const args = {
    npmRoot: path.join(cliRoot, 'dist', 'npm'),
    smokeDir: path.join(cliRoot, 'dist', 'npm-smoke'),
    skipSmoke: false
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

    if (token === '--npm-root') {
      args.npmRoot = path.resolve(next())
    } else if (token === '--smoke-dir') {
      args.smokeDir = path.resolve(next())
    } else if (token === '--skip-smoke') {
      args.skipSmoke = true
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

async function assertExecutable(filePath) {
  const stat = await fs.stat(filePath)
  if ((stat.mode & 0o111) === 0) {
    throw new Error(`${filePath} is not executable`)
  }
}

function npmPackDryRun(packageDir) {
  const result = childProcess.spawnSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: packageDir,
    encoding: 'utf8'
  })
  if (result.status !== 0) {
    throw new Error(`npm pack --dry-run failed in ${packageDir}:\n${result.stderr || result.stdout}`)
  }
  const parsed = JSON.parse(result.stdout)
  return parsed[0]?.files?.map((entry) => entry.path) ?? []
}

function assertPackedFiles(packageDir, expectedPath) {
  const files = npmPackDryRun(packageDir)
  if (!files.includes('package.json')) {
    throw new Error(`npm pack omitted package.json in ${packageDir}`)
  }
  if (!files.includes(expectedPath)) {
    throw new Error(`npm pack omitted ${expectedPath} in ${packageDir}`)
  }
}

async function smokeCurrentPlatform({ npmRoot, smokeDir, version }) {
  const { rootBinAliases } = await createSmokeTree({ npmRoot, outDir: smokeDir })
  for (const alias of binaryAliases) {
    const result = childProcess.spawnSync(rootBinAliases[alias], ['--version'], {
      cwd: smokeDir,
      encoding: 'utf8'
    })
    if (result.status !== 0) {
      throw new Error(`npm wrapper smoke failed for ${alias}:\n${result.stderr || result.stdout}`)
    }
    if (result.stdout.trim() !== version) {
      throw new Error(
        `npm wrapper ${alias} version smoke returned ${JSON.stringify(result.stdout.trim())}, want ${version}`
      )
    }
  }
}

async function validate({ npmRoot, smokeDir, skipSmoke }) {
  const manifest = await readGeneratedManifest(npmRoot)
  const version = manifest.version

  const rootDir = packagePath(npmRoot, rootPackageName)
  const actualRoot = await readJSON(path.join(rootDir, 'package.json'))
  assertDeepEqual(actualRoot, rootManifest({ version, platforms }), rootPackageName)
  await assertExecutable(path.join(rootDir, 'bin', 'at-email.js'))
  assertPackedFiles(rootDir, 'bin/at-email.js')

  for (const platform of platforms) {
    const packageName = platformPackageName(platform)
    const packageDir = packagePath(npmRoot, packageName)
    const binary = platformBinarySubpath(platform)
    const actual = await readJSON(path.join(packageDir, 'package.json'))

    assertDeepEqual(actual, platformManifest({ version, platform }), packageName)
    await assertExecutable(path.join(packageDir, binary))
    assertPackedFiles(packageDir, binary)
  }

  if (!skipSmoke) {
    await smokeCurrentPlatform({ npmRoot, smokeDir, version })
  }

  console.log(`Validated ${platforms.length + 1} npm packages for ${version}`)
}

try {
  await validate(parseArgs(process.argv.slice(2)))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
