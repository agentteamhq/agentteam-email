#!/usr/bin/env node
import childProcess from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const cliRoot = path.resolve(scriptDir, '..')

function parseArgs(argv) {
  const args = {
    pluginsRoot: path.join(cliRoot, 'dist', 'plugins'),
    out: path.join(cliRoot, 'dist', 'plugin-bundles')
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
    } else if (token === '--out') {
      args.out = path.resolve(next())
    } else {
      throw new Error(`unknown argument: ${token}`)
    }
  }

  return args
}

async function readJSON(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function writeJSON(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256')
  hash.update(await fs.readFile(filePath))
  return hash.digest('hex')
}

function createTarball({ sourceParent, sourceRoot, target }) {
  const result = childProcess.spawnSync(
    'tar',
    ['--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner', '-czf', target, sourceRoot],
    {
      cwd: sourceParent,
      encoding: 'utf8'
    }
  )
  if (result.status !== 0) {
    throw new Error(`tar failed for ${sourceRoot}:\n${result.stderr || result.stdout}`)
  }
}

async function pack({ pluginsRoot, out }) {
  const pluginsRootDir = path.resolve(pluginsRoot)
  const outDir = path.resolve(out)
  const manifest = await readJSON(path.join(pluginsRootDir, 'manifest.json'))

  await fs.rm(outDir, { recursive: true, force: true })
  await fs.mkdir(outDir, { recursive: true })

  const bundles = []
  for (const entry of manifest.bundles) {
    const bundleRoot = path.join(pluginsRootDir, entry.directory)
    const archive = path.join(outDir, entry.archive)
    createTarball({
      sourceParent: path.dirname(bundleRoot),
      sourceRoot: path.basename(bundleRoot),
      target: archive
    })

    bundles.push({
      id: entry.id,
      title: entry.title,
      name: entry.name,
      archive: path.basename(archive),
      sha256: await sha256File(archive)
    })
  }

  await writeJSON(path.join(outDir, 'manifest.json'), {
    version: manifest.version,
    bundles
  })

  console.log(`Packed ${bundles.length} plugin bundles in ${path.relative(cliRoot, outDir)}`)
}

try {
  await pack(parseArgs(process.argv.slice(2)))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
