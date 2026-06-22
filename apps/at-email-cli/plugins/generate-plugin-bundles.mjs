#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pluginBundles, skillName } from './manifests.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const cliRoot = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(cliRoot, '..', '..')
const canonicalSkill = path.join(repoRoot, 'skills', skillName, 'SKILL.md')

function parseArgs(argv) {
  const args = {
    dist: path.join(cliRoot, 'dist'),
    out: '',
    expectedVersion: ''
  }
  args.out = path.join(args.dist, 'plugins')

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    const next = () => {
      i += 1
      if (i >= argv.length) {
        throw new Error(`${token} requires a value`)
      }
      return argv[i]
    }

    if (token === '--dist') {
      args.dist = path.resolve(next())
      if (args.out === path.join(cliRoot, 'dist', 'plugins')) {
        args.out = path.join(args.dist, 'plugins')
      }
    } else if (token === '--out') {
      args.out = path.resolve(next())
    } else if (token === '--expected-version') {
      args.expectedVersion = next()
    } else {
      throw new Error(`unknown argument: ${token}`)
    }
  }

  return args
}

function assertSemver(version) {
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?$/.test(version)) {
    throw new Error(`invalid plugin bundle version: ${version}`)
  }
}

function assertInside(parent, child) {
  const relative = path.relative(parent, child)
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`refusing path outside ${parent}: ${child}`)
  }
}

async function readJSON(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function writeJSON(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

async function copySkill(targetDir) {
  const skillTarget = path.join(targetDir, 'skills', skillName, 'SKILL.md')
  await fs.mkdir(path.dirname(skillTarget), { recursive: true })
  await fs.copyFile(canonicalSkill, skillTarget)
  return path.relative(targetDir, skillTarget)
}

async function copyLicense(targetDir) {
  await fs.copyFile(path.join(repoRoot, 'LICENSE'), path.join(targetDir, 'LICENSE'))
}

async function generate({ dist, out, expectedVersion }) {
  const distDir = path.resolve(dist)
  const outDir = path.resolve(out)
  assertInside(distDir, outDir)

  const metadata = await readJSON(path.join(distDir, 'metadata.json'))
  const version = metadata.version
  assertSemver(version)
  if (expectedVersion && version !== expectedVersion) {
    throw new Error(`GoReleaser version ${version} did not match expected ${expectedVersion}`)
  }

  await fs.rm(outDir, { recursive: true, force: true })
  await fs.mkdir(outDir, { recursive: true })

  const bundles = []
  for (const bundle of pluginBundles) {
    const bundleRoot = path.join(outDir, bundle.id, bundle.root)
    const skill = await copySkill(bundleRoot)
    await copyLicense(bundleRoot)
    await writeJSON(path.join(bundleRoot, bundle.manifestPath), bundle.manifest({ version }))

    bundles.push({
      id: bundle.id,
      title: bundle.title,
      name: bundle.root,
      directory: path.relative(outDir, bundleRoot),
      manifest: bundle.manifestPath,
      skill,
      archive: `at-email_${version}_${bundle.archiveSuffix}.tar.gz`
    })
  }

  await writeJSON(path.join(outDir, 'manifest.json'), {
    version,
    projectName: metadata.project_name,
    tag: metadata.tag,
    commit: metadata.commit,
    bundles
  })

  console.log(`Generated ${bundles.length} plugin bundles in ${path.relative(cliRoot, outDir)}`)
}

try {
  await generate(parseArgs(process.argv.slice(2)))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
