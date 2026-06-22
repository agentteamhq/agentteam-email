#!/usr/bin/env node
import childProcess from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { packagePath, readGeneratedManifest } from './smoke-tree.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const cliRoot = path.resolve(scriptDir, '..')

function parseArgs(argv) {
  const args = {
    npmRoot: path.join(cliRoot, 'dist', 'npm'),
    out: path.join(cliRoot, 'dist', 'npm-packages')
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
    } else if (token === '--out') {
      args.out = path.resolve(next())
    } else {
      throw new Error(`unknown argument: ${token}`)
    }
  }

  return args
}

async function writeJSON(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function npmPack(packageDir, tarballDir) {
  const result = childProcess.spawnSync('npm', ['pack', '--json', '--pack-destination', tarballDir], {
    cwd: packageDir,
    encoding: 'utf8'
  })
  if (result.status !== 0) {
    throw new Error(`npm pack failed in ${packageDir}:\n${result.stderr || result.stdout}`)
  }
  const parsed = JSON.parse(result.stdout)
  const filename = parsed[0]?.filename
  if (!filename) {
    throw new Error(`npm pack did not report a filename for ${packageDir}`)
  }
  return path.join(tarballDir, filename)
}

async function pack({ npmRoot, out }) {
  const npmRootDir = path.resolve(npmRoot)
  const outDir = path.resolve(out)
  const manifest = await readGeneratedManifest(npmRootDir)

  await fs.rm(outDir, { recursive: true, force: true })
  await fs.mkdir(outDir, { recursive: true })

  const packages = []
  for (const entry of manifest.packages) {
    const packageDir = packagePath(npmRootDir, entry.name)
    const tarball = npmPack(packageDir, outDir)
    packages.push({
      name: entry.name,
      root: entry.root,
      tarball: path.relative(outDir, tarball)
    })
  }

  await writeJSON(path.join(outDir, 'manifest.json'), {
    version: manifest.version,
    packages
  })

  console.log(`Packed ${packages.length} npm packages in ${path.relative(cliRoot, outDir)}`)
}

try {
  await pack(parseArgs(process.argv.slice(2)))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
