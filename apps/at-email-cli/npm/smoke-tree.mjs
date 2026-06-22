import fs from 'node:fs/promises'
import path from 'node:path'
import { binaryAliases, packageDirName, rootPackageName } from './platforms.mjs'

export async function readGeneratedManifest(npmRoot) {
  return JSON.parse(await fs.readFile(path.join(npmRoot, 'manifest.json'), 'utf8'))
}

export function packagePath(baseDir, packageName) {
  return path.join(baseDir, ...packageDirName(packageName))
}

export async function createSmokeTree({ npmRoot, outDir }) {
  const manifest = await readGeneratedManifest(npmRoot)
  const nodeModules = path.join(outDir, 'node_modules')
  const binDir = path.join(nodeModules, '.bin')

  await fs.rm(outDir, { recursive: true, force: true })
  await fs.mkdir(nodeModules, { recursive: true })

  for (const entry of manifest.packages) {
    const source = path.join(npmRoot, entry.directory)
    const target = packagePath(nodeModules, entry.name)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.cp(source, target, { recursive: true })
  }

  await fs.mkdir(binDir, { recursive: true })
  const rootBin = path.join(packagePath(nodeModules, rootPackageName), 'bin', 'at-email.js')
  for (const alias of binaryAliases) {
    await fs.symlink(path.relative(binDir, rootBin), path.join(binDir, alias))
  }

  return {
    rootBin,
    rootBinAliases: Object.fromEntries(binaryAliases.map((alias) => [alias, path.join(binDir, alias)])),
    version: manifest.version
  }
}
