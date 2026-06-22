#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { platformManifest, rootManifest } from './manifests.mjs'
import {
  platformBinarySubpath,
  packageDirName,
  platformPackageName,
  platforms,
  rootPackageName
} from './platforms.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const cliRoot = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(cliRoot, '..', '..')

function parseArgs(argv) {
  const args = {
    dist: path.join(cliRoot, 'dist'),
    out: '',
    expectedVersion: ''
  }
  args.out = path.join(args.dist, 'npm')

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
      if (args.out === path.join(cliRoot, 'dist', 'npm')) {
        args.out = path.join(args.dist, 'npm')
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
    throw new Error(`invalid npm package version: ${version}`)
  }
}

async function readJSON(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function writeJSON(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function packageDir(outDir, packageName) {
  return path.join(outDir, ...packageDirName(packageName))
}

function assertInside(parent, child) {
  const relative = path.relative(parent, child)
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`refusing path outside ${parent}: ${child}`)
  }
}

function findBinaryArtifact({ artifacts, platform }) {
  const matches = artifacts.filter((artifact) => {
    return (
      artifact.type === 'Binary' &&
      artifact.extra?.Builder === 'go' &&
      artifact.goos === platform.goos &&
      artifact.goarch === platform.goarch
    )
  })

  if (matches.length !== 1) {
    throw new Error(
      `expected one Go binary artifact for ${platform.goos}/${platform.goarch}, found ${matches.length}`
    )
  }

  return matches[0]
}

async function copyExecutable(sourcePath, targetPath) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true })
  await fs.copyFile(sourcePath, targetPath)
  await fs.chmod(targetPath, 0o755)
}

async function copyPackageDocs(targetDir) {
  await fs.copyFile(path.join(repoRoot, 'LICENSE'), path.join(targetDir, 'LICENSE'))
  await fs.copyFile(path.join(cliRoot, 'README.md'), path.join(targetDir, 'README.md'))
}

async function generate({ dist, out, expectedVersion }) {
  const distDir = path.resolve(dist)
  const outDir = path.resolve(out)
  assertInside(distDir, outDir)

  const metadata = await readJSON(path.join(distDir, 'metadata.json'))
  const artifacts = await readJSON(path.join(distDir, 'artifacts.json'))
  const version = metadata.version
  assertSemver(version)
  if (expectedVersion && version !== expectedVersion) {
    throw new Error(`GoReleaser version ${version} did not match expected ${expectedVersion}`)
  }

  await fs.rm(outDir, { recursive: true, force: true })
  await fs.mkdir(outDir, { recursive: true })

  const rootDir = packageDir(outDir, rootPackageName)
  await writeJSON(path.join(rootDir, 'package.json'), rootManifest({ version, platforms }))
  await copyPackageDocs(rootDir)
  await copyExecutable(path.join(scriptDir, 'bin', 'at-email.js'), path.join(rootDir, 'bin', 'at-email.js'))

  const generatedPackages = []
  for (const platform of platforms) {
    const packageName = platformPackageName(platform)
    const dir = packageDir(outDir, packageName)
    const artifact = findBinaryArtifact({ artifacts, platform })
    const sourcePath = path.resolve(cliRoot, artifact.path)
    assertInside(cliRoot, sourcePath)

    const targetPath = path.join(dir, platformBinarySubpath(platform))
    await writeJSON(path.join(dir, 'package.json'), platformManifest({ version, platform }))
    await copyPackageDocs(dir)
    await copyExecutable(sourcePath, targetPath)

    generatedPackages.push({
      name: packageName,
      directory: path.relative(outDir, dir),
      platform: platform.suffix,
      binary: platformBinarySubpath(platform),
      sourceArtifact: artifact.name,
      publishOrder: generatedPackages.length + 1,
      root: false
    })
  }

  generatedPackages.push({
    name: rootPackageName,
    directory: path.relative(outDir, rootDir),
    binary: 'bin/at-email.js',
    publishOrder: generatedPackages.length + 1,
    root: true
  })

  await writeJSON(path.join(outDir, 'manifest.json'), {
    version,
    projectName: metadata.project_name,
    tag: metadata.tag,
    commit: metadata.commit,
    packages: generatedPackages
  })

  console.log(`Generated ${generatedPackages.length} npm packages in ${path.relative(cliRoot, outDir)}`)
}

try {
  await generate(parseArgs(process.argv.slice(2)))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
