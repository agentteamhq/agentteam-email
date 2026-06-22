import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const harnessRoot = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(harnessRoot, '..', '..')

function requireWorktreeSlug() {
  const value = process.env.WT?.trim()
  if (!value) {
    throw new Error(
      'Missing WT. Set WT=<short-kebab-case-worktree> in the repo-local .env before running Paperclip container workflows. See SETUP.md.'
    )
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error(
      `WT must be a short kebab-case slug for Paperclip container workflows. Received: ${value}`
    )
  }
  return value
}

const worktreeSlug = requireWorktreeSlug()
const engine = process.env.CONTAINER_ENGINE ?? 'podman'
const isPodman = path.basename(engine).includes('podman')
const containerName =
  process.env.PAPERCLIP_PREVIEW_CONTAINER ?? `atemail.${worktreeSlug}.paperclip-plugin-preview`
const image = process.env.PAPERCLIP_PREVIEW_CADDY_IMAGE ?? 'docker.io/library/caddy:2.10.2-alpine'
const previewPort = Number(process.env.PAPERCLIP_PREVIEW_PORT ?? '4180')
const previewBind = process.env.PAPERCLIP_PREVIEW_BIND ?? '0.0.0.0'
const sandboxPort = Number(process.env.PAPERCLIP_SANDBOX_PORT ?? '4179')
const containerUser = `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`
const artifactRoot = path.resolve(
  process.env.PAPERCLIP_PREVIEW_ARTIFACT_ROOT ?? path.join(harnessRoot, 'tmp', 'preview')
)
const caddyfilePath = path.join(artifactRoot, 'Caddyfile')
const infoPath = path.join(artifactRoot, 'preview-info.json')
const dataVolume = process.env.PAPERCLIP_PREVIEW_DATA_VOLUME ?? `${containerName}.data`
const configVolume = process.env.PAPERCLIP_PREVIEW_CONFIG_VOLUME ?? `${containerName}.config`
const previewUrl = `http://127.0.0.1:${previewPort}`
const backendUrl = `http://127.0.0.1:${sandboxPort}`
const previewHealthUrl = `${previewUrl}/api/health`
const pluginKey = 'agentteam.paperclip-email-plugin'

if (!Number.isInteger(previewPort) || previewPort < 1 || previewPort > 65_535) {
  throw new Error(
    `PAPERCLIP_PREVIEW_PORT must be a TCP port number, received: ${process.env.PAPERCLIP_PREVIEW_PORT}`
  )
}
if (!Number.isInteger(sandboxPort) || sandboxPort < 1 || sandboxPort > 65_535) {
  throw new Error(
    `PAPERCLIP_SANDBOX_PORT must be a TCP port number, received: ${process.env.PAPERCLIP_SANDBOX_PORT}`
  )
}

function log(message) {
  console.log(`[paperclip-preview] ${message}`)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseJsonFromOutput(output) {
  const trimmed = output.trim()
  if (!trimmed) {
    throw new Error('Expected JSON output, received empty content.')
  }
  return JSON.parse(trimmed)
}

function lanUrls() {
  const urls = []
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) {
        continue
      }
      urls.push(`http://${entry.address}:${previewPort}`)
    }
  }
  return Array.from(new Set(urls)).sort()
}

async function run(command, args, options = {}) {
  const capture = options.capture === true
  const child = spawn(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: {
      ...process.env,
      ...options.env
    },
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
  })

  let stdout = ''
  let stderr = ''
  if (capture) {
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
  }

  await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      const detail = capture && stderr.trim() ? `\n${stderr.trim()}` : ''
      reject(new Error(`${command} ${args.join(' ')} exited with ${code ?? 'unknown status'}${detail}`))
    })
  })

  return { stdout, stderr }
}

async function containerExists() {
  try {
    await run(engine, ['inspect', containerName], { capture: true })
    return true
  } catch {
    return false
  }
}

async function containerRunning() {
  try {
    const result = await run(engine, ['inspect', '--format', '{{.State.Running}}', containerName], {
      capture: true
    })
    return result.stdout.trim() === 'true'
  } catch {
    return false
  }
}

async function volumeExists(volumeName) {
  try {
    await run(engine, ['volume', 'inspect', volumeName], { capture: true })
    return true
  } catch {
    return false
  }
}

async function ensureVolume(volumeName) {
  if (await volumeExists(volumeName)) {
    return
  }

  await run(engine, [
    'volume',
    'create',
    '--label',
    `com.agentteam.email.worktree=${worktreeSlug}`,
    '--label',
    'com.agentteam.email.workflow=paperclip-plugin-preview',
    volumeName
  ])
}

async function removeVolume(volumeName) {
  if (!(await volumeExists(volumeName))) {
    return
  }
  await run(engine, ['volume', 'rm', '-f', volumeName])
}

function volumeMount(volumeName, containerPath) {
  return `${volumeName}:${containerPath}${isPodman ? ':U' : ''}`
}

function canUsePodmanArtifactCleanup() {
  const tmpRoot = path.join(harnessRoot, 'tmp')
  const relative = path.relative(tmpRoot, artifactRoot)
  return isPodman && relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

async function removeArtifactRoot() {
  try {
    await rm(artifactRoot, { recursive: true, force: true })
    return
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'unknown'
    if (canUsePodmanArtifactCleanup() && ['EACCES', 'EPERM'].includes(code)) {
      await run(engine, ['unshare', 'rm', '-rf', artifactRoot])
      return
    }
    throw error
  }
}

async function waitForBackend(timeoutMs = 30_000) {
  const startedAt = Date.now()
  let lastError = ''

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${backendUrl}/api/health`)
      if (response.ok) {
        return
      }
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await sleep(1_000)
  }

  throw new Error(`Timed out waiting for Paperclip sandbox backend at ${backendUrl}: ${lastError}`)
}

async function waitForPreview(timeoutMs = 30_000) {
  const startedAt = Date.now()
  let lastError = ''

  while (Date.now() - startedAt < timeoutMs) {
    if (!(await containerRunning())) {
      const logs = await run(engine, ['logs', '--tail', '120', containerName], { capture: true }).catch(
        (error) => ({
          stdout: '',
          stderr: String(error)
        })
      )
      throw new Error(
        `Paperclip preview container exited before healthcheck passed.\n${logs.stdout}${logs.stderr}`
      )
    }

    try {
      const response = await fetch(previewHealthUrl)
      if (response.ok) {
        log(`healthcheck passed: ${previewHealthUrl}`)
        return
      }
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }

    await sleep(1_000)
  }

  throw new Error(`Timed out waiting for ${previewHealthUrl}: ${lastError}`)
}

async function writeCaddyfile() {
  await mkdir(artifactRoot, { recursive: true })

  const caddyfile = `{
\tadmin off
\tauto_https off
}

http://:${previewPort} {
\tbind ${previewBind}
\treverse_proxy 127.0.0.1:${sandboxPort} {
\t\theader_up Host 127.0.0.1:${sandboxPort}
\t\theader_up X-Forwarded-Host 127.0.0.1:${sandboxPort}
\t\theader_up X-Forwarded-Proto http
\t}
}
`

  await writeFile(caddyfilePath, caddyfile, 'utf8')
}

async function startContainer() {
  if (await containerRunning()) {
    log(`restarting container to refresh preview config: ${containerName}`)
    await run(engine, ['rm', '-f', containerName])
  } else if (await containerExists()) {
    log(`removing stopped container: ${containerName}`)
    await run(engine, ['rm', '-f', containerName])
  }

  await ensureVolume(dataVolume)
  await ensureVolume(configVolume)

  log(`starting ${containerName} from ${image}`)
  await run(engine, [
    'run',
    '-d',
    '--name',
    containerName,
    '--label',
    `com.agentteam.email.worktree=${worktreeSlug}`,
    '--label',
    'com.agentteam.email.workflow=paperclip-plugin-preview',
    '--network',
    'host',
    ...(isPodman ? ['--userns', 'keep-id'] : []),
    '--user',
    containerUser,
    '-v',
    `${caddyfilePath}:/etc/caddy/Caddyfile:ro`,
    '-v',
    volumeMount(dataVolume, '/data'),
    '-v',
    volumeMount(configVolume, '/config'),
    image,
    'caddy',
    'run',
    '--config',
    '/etc/caddy/Caddyfile',
    '--adapter',
    'caddyfile'
  ])
}

async function writeInfo() {
  await mkdir(artifactRoot, { recursive: true })

  const info = {
    worktreeSlug,
    containerName,
    engine,
    image,
    containerUser,
    previewBind,
    previewPort,
    sandboxPort,
    previewUrl,
    backendUrl,
    volumes: {
      data: dataVolume,
      config: configVolume
    },
    lanUrls: lanUrls(),
    artifactRoot: path.relative(repoRoot, artifactRoot),
    caddyfilePath: path.relative(repoRoot, caddyfilePath),
    updatedAt: new Date().toISOString()
  }
  await writeFile(infoPath, `${JSON.stringify(info, null, 2)}\n`, 'utf8')
}

async function start() {
  await waitForBackend()
  await writeCaddyfile()
  await startContainer()
  await waitForPreview()
  await writeInfo()
  log(`ready: ${previewUrl}`)
  for (const url of lanUrls()) {
    log(`lan: ${url}`)
  }
}

async function stop() {
  if (!(await containerExists())) {
    log(`container is not present: ${containerName}`)
    return
  }
  await run(engine, ['rm', '-f', containerName])
  log(`stopped: ${containerName}`)
}

async function status() {
  const exists = await containerExists()
  const running = exists ? await containerRunning() : false
  const info = existsSync(infoPath) ? parseJsonFromOutput(await readFile(infoPath, 'utf8')) : null

  console.log(
    JSON.stringify(
      {
        containerName,
        worktreeSlug,
        exists,
        running,
        previewUrl,
        backendUrl,
        lanUrls: lanUrls(),
        volumes: {
          data: dataVolume,
          config: configVolume
        },
        artifactRoot: path.relative(repoRoot, artifactRoot),
        info
      },
      null,
      2
    )
  )

  if (!running) {
    return
  }

  try {
    const response = await fetch(previewHealthUrl)
    log(`health: ${response.status} ${response.statusText}`)
  } catch (error) {
    log(`health request failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function smoke() {
  if (!(await containerRunning())) {
    throw new Error(
      `Preview is not running. Start it with: mise run //test-containers/paperclip-plugin-e2e:preview:start`
    )
  }

  await waitForPreview()
  const response = await fetch(`${previewUrl}/api/plugins`)
  if (!response.ok) {
    throw new Error(`Preview plugin list request failed: HTTP ${response.status}`)
  }

  const plugins = await response.json()
  const plugin = Array.isArray(plugins) ? plugins.find((entry) => entry.pluginKey === pluginKey) : null
  if (!plugin) {
    throw new Error(`Plugin ${pluginKey} is not visible through the preview proxy.`)
  }
  if (plugin.status !== 'ready') {
    throw new Error(`Plugin ${pluginKey} is visible through preview but not ready: ${plugin.status}`)
  }

  const summary = {
    ok: true,
    pluginKey,
    status: plugin.status,
    previewUrl,
    lanUrls: lanUrls(),
    checkedAt: new Date().toISOString()
  }
  await mkdir(artifactRoot, { recursive: true })
  await writeFile(
    path.join(artifactRoot, 'smoke-summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8'
  )
  log(`smoke passed for ${pluginKey}`)
}

async function logs() {
  await run(engine, ['logs', '-f', containerName])
}

async function reset() {
  await stop()
  await removeVolume(dataVolume)
  await removeVolume(configVolume)
  await removeArtifactRoot()
  log(`removed preview volumes: ${dataVolume}, ${configVolume}`)
  log(`removed preview artifacts: ${path.relative(repoRoot, artifactRoot)}`)
}

function help() {
  console.log(`Usage: node paperclip-preview.mjs <command>

Commands:
  start    Start an unauthenticated LAN preview proxy for the Paperclip sandbox
  stop     Stop and remove the preview proxy container, preserving named volumes
  status   Print preview proxy status and URLs
  smoke    Verify preview health and plugin visibility through the proxy
  logs     Follow preview proxy container logs
  reset    Stop the preview proxy and remove named volumes plus ignored artifacts

Environment:
  CONTAINER_ENGINE=${engine}
  WT=${worktreeSlug}
  PAPERCLIP_PREVIEW_CONTAINER=${containerName}
  PAPERCLIP_PREVIEW_DATA_VOLUME=${dataVolume}
  PAPERCLIP_PREVIEW_CONFIG_VOLUME=${configVolume}
  PAPERCLIP_PREVIEW_ARTIFACT_ROOT=${path.relative(repoRoot, artifactRoot)}
  PAPERCLIP_PREVIEW_CADDY_IMAGE=${image}
  PAPERCLIP_PREVIEW_BIND=${previewBind}
  PAPERCLIP_PREVIEW_PORT=${previewPort}
  PAPERCLIP_SANDBOX_PORT=${sandboxPort}`)
}

const command = process.argv[2] ?? 'help'

try {
  if (command === 'start') {
    await start()
  } else if (command === 'stop') {
    await stop()
  } else if (command === 'status') {
    await status()
  } else if (command === 'smoke') {
    await smoke()
  } else if (command === 'logs') {
    await logs()
  } else if (command === 'reset') {
    await reset()
  } else {
    help()
    process.exit(command === 'help' ? 0 : 1)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
