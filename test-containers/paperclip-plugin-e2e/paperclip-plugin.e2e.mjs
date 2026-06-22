import { spawn } from 'node:child_process'
import { access, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { pluginManifestV1Schema } from '@paperclipai/shared'

const harnessRoot = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(harnessRoot, '..', '..')
const pluginRoot = path.join(repoRoot, 'packages', 'paperclip-email-plugin')
const runRoot = path.join(harnessRoot, 'tmp', `run-${Date.now()}`)

async function run(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: {
        ...process.env,
        ...options.env
      },
      stdio: 'inherit'
    })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${command} ${args.join(' ')} exited with ${code ?? 'unknown status'}`))
    })
  })
}

async function pathExists(targetPath) {
  try {
    await access(targetPath)
    return true
  } catch {
    return false
  }
}

async function readJson(targetPath) {
  return JSON.parse(await readFile(targetPath, 'utf8'))
}

function packageEntry(packageRoot, relativePath) {
  return path.join(packageRoot, relativePath.replace(/^\.\//, ''))
}

async function assertFile(targetPath, label) {
  const file = await stat(targetPath)
  if (!file.isFile()) {
    throw new Error(`${label} is not a file: ${targetPath}`)
  }
}

async function assertDirectory(targetPath, label) {
  const directory = await stat(targetPath)
  if (!directory.isDirectory()) {
    throw new Error(`${label} is not a directory: ${targetPath}`)
  }
}

async function runOptionalRealInstall() {
  if (process.env.AGENTTEAM_EMAIL_REAL_PAPERCLIP_INSTALL !== '1') {
    return
  }

  const cli = process.env.PAPERCLIP_CLI_BIN
  const apiBase = process.env.PAPERCLIP_API_URL

  if (!cli || !apiBase) {
    throw new Error('Real Paperclip install mode requires PAPERCLIP_CLI_BIN and PAPERCLIP_API_URL.')
  }

  await run(
    cli,
    [
      'plugin',
      'install',
      pluginRoot,
      '--local',
      '--api-base',
      apiBase,
      '--data-dir',
      path.join(runRoot, 'paperclip-data'),
      '--json'
    ],
    { cwd: repoRoot }
  )
}

await rm(runRoot, { recursive: true, force: true })
await mkdir(runRoot, { recursive: true })

await run('pnpm', ['--filter', '@agentteam/paperclip-email-plugin', 'build'])

const packageJson = await readJson(path.join(pluginRoot, 'package.json'))
const pluginConfig = packageJson.paperclipPlugin

if (!pluginConfig || typeof pluginConfig !== 'object') {
  throw new Error('paperclipPlugin package.json field is missing.')
}

const manifestPath = packageEntry(pluginRoot, pluginConfig.manifest)
const workerPath = packageEntry(pluginRoot, pluginConfig.worker)
const uiPath = packageEntry(pluginRoot, pluginConfig.ui)

await assertFile(manifestPath, 'Paperclip manifest entrypoint')
await assertFile(workerPath, 'Paperclip worker entrypoint')
await assertDirectory(uiPath, 'Paperclip UI entrypoint')
await assertFile(path.join(uiPath, 'index.js'), 'Paperclip UI bundle')

const manifestModule = await import(`${pathToFileURL(manifestPath).href}?run=${Date.now()}`)
const manifest = pluginManifestV1Schema.parse(manifestModule.default)

if (manifest.id !== 'agentteam.paperclip-email-plugin') {
  throw new Error(`Unexpected manifest id: ${manifest.id}`)
}

if (!manifest.instanceConfigSchema) {
  throw new Error('Manifest does not expose instanceConfigSchema.')
}

const workerModule = await import(`${pathToFileURL(workerPath).href}?run=${Date.now()}`)
if (!workerModule.default?.definition?.setup) {
  throw new Error('Worker bundle does not export a Paperclip plugin definition.')
}

const syntheticInstallRecord = {
  packageName: packageJson.name,
  pluginKey: manifest.id,
  version: manifest.version,
  status: 'ready',
  isLocalPath: true,
  packagePath: pluginRoot,
  manifestJson: manifest,
  entrypoints: {
    manifest: pluginConfig.manifest,
    worker: manifest.entrypoints.worker,
    ui: manifest.entrypoints.ui
  }
}

await writeFile(
  path.join(runRoot, 'synthetic-install-record.json'),
  `${JSON.stringify(syntheticInstallRecord, null, 2)}\n`,
  'utf8'
)

if (!(await pathExists(path.join(uiPath, 'index.js.map')))) {
  throw new Error('Paperclip UI bundle sourcemap is missing.')
}

await runOptionalRealInstall()

const relativeRecordPath = path.relative(repoRoot, path.join(runRoot, 'synthetic-install-record.json'))
console.log(`Paperclip plugin synthetic install verified: ${relativeRecordPath}`)
