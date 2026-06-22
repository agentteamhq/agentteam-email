import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
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
const containerName = process.env.PAPERCLIP_SANDBOX_CONTAINER ?? `atemail.${worktreeSlug}.paperclip-plugin`
const image = process.env.PAPERCLIP_SANDBOX_IMAGE ?? 'docker.io/library/node:24.16.0-bookworm'
const paperclipVersion = process.env.PAPERCLIP_SANDBOX_PAPERCLIP_VERSION ?? '2026.618.0'
const hostPort = Number(process.env.PAPERCLIP_SANDBOX_PORT ?? '4179')
const databasePort = Number(process.env.PAPERCLIP_SANDBOX_DB_PORT ?? '54179')
const containerUser = `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`
const artifactRoot = path.resolve(
  process.env.PAPERCLIP_SANDBOX_ARTIFACT_ROOT ?? path.join(harnessRoot, 'tmp', 'sandbox')
)
const configPath = path.join(artifactRoot, 'config', 'config.json')
const configEnvPath = path.join(path.dirname(configPath), '.env')
const infoPath = path.join(artifactRoot, 'sandbox-info.json')
const dataVolume = process.env.PAPERCLIP_SANDBOX_DATA_VOLUME ?? `${containerName}.data`
const homeVolume = process.env.PAPERCLIP_SANDBOX_HOME_VOLUME ?? `${containerName}.home`
const seedEnabled = (process.env.PAPERCLIP_SANDBOX_SEED ?? 'true') !== 'false'
const healthUrl = `http://127.0.0.1:${hostPort}/api/health`
const uiUrl = `http://127.0.0.1:${hostPort}`
const pluginKey = 'agentteam.paperclip-email-plugin'

if (!Number.isInteger(hostPort) || hostPort < 1 || hostPort > 65_535) {
  throw new Error(
    `PAPERCLIP_SANDBOX_PORT must be a TCP port number, received: ${process.env.PAPERCLIP_SANDBOX_PORT}`
  )
}
if (!Number.isInteger(databasePort) || databasePort < 1 || databasePort > 65_535) {
  throw new Error(
    `PAPERCLIP_SANDBOX_DB_PORT must be a TCP port number, received: ${process.env.PAPERCLIP_SANDBOX_DB_PORT}`
  )
}

function log(message) {
  console.log(`[paperclip-sandbox] ${message}`)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`
}

function parseJsonFromOutput(output) {
  const trimmed = output.trim()
  if (!trimmed) {
    throw new Error('Expected JSON output, received empty stdout.')
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    // Fall back to the last JSON-looking line if the CLI emitted diagnostics.
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  for (const line of lines.toReversed()) {
    if (!line.startsWith('{') && !line.startsWith('[')) {
      continue
    }
    try {
      return JSON.parse(line)
    } catch {
      // Keep looking for a clean JSON line if Paperclip emitted diagnostics first.
    }
  }

  throw new Error(`Expected JSON output, received: ${trimmed}`)
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

async function prepareSandboxConfig() {
  await mkdir(artifactRoot, { recursive: true })
  await mkdir(path.dirname(configPath), { recursive: true })

  const config = {
    $meta: {
      version: 1,
      updatedAt: new Date().toISOString(),
      source: 'configure'
    },
    database: {
      mode: 'embedded-postgres',
      embeddedPostgresDataDir: '/sandbox/paperclip/db',
      embeddedPostgresPort: databasePort,
      backup: {
        enabled: false,
        intervalMinutes: 60,
        retentionDays: 30,
        dir: '/sandbox/paperclip/backups'
      }
    },
    logging: {
      mode: 'file',
      logDir: '/sandbox/paperclip/logs'
    },
    server: {
      deploymentMode: 'local_trusted',
      exposure: 'private',
      bind: 'loopback',
      host: '127.0.0.1',
      port: hostPort,
      allowedHostnames: [],
      serveUi: true
    },
    auth: {
      baseUrlMode: 'auto',
      disableSignUp: false
    },
    storage: {
      provider: 'local_disk',
      localDisk: {
        baseDir: '/sandbox/paperclip/storage'
      },
      s3: {
        bucket: 'paperclip',
        region: 'us-east-1',
        prefix: '',
        forcePathStyle: false
      }
    },
    secrets: {
      provider: 'local_encrypted',
      strictMode: false,
      localEncrypted: {
        keyFilePath: '/sandbox/paperclip/secrets/master.key'
      }
    }
  }

  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')

  if (!existsSync(configEnvPath)) {
    const agentJwtSecret = randomBytes(32).toString('base64url')
    await writeFile(configEnvPath, `PAPERCLIP_AGENT_JWT_SECRET=${agentJwtSecret}\n`, {
      encoding: 'utf8',
      mode: 0o600
    })
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

async function ensureVolume(volumeName, workflow) {
  if (await volumeExists(volumeName)) {
    return
  }

  await run(engine, [
    'volume',
    'create',
    '--label',
    `com.agentteam.email.worktree=${worktreeSlug}`,
    '--label',
    `com.agentteam.email.workflow=${workflow}`,
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

async function buildPlugin() {
  log('building plugin package')
  await run('pnpm', ['--filter', '@agentteam/paperclip-email-plugin', 'build'])
}

function paperclipDlxCommand(args) {
  return `corepack pnpm dlx --allow-build=sqlite3 ${shellQuote(`paperclipai@${paperclipVersion}`)} ${args.map(shellQuote).join(' ')}`
}

function paperclipCliArgs(args) {
  return [
    ...args,
    '--api-base',
    uiUrl,
    '--config',
    '/sandbox/config/config.json',
    '--data-dir',
    '/sandbox/home'
  ]
}

async function runPaperclipCliInContainer(args, options = {}) {
  return run(
    engine,
    ['exec', containerName, 'bash', '-lc', paperclipDlxCommand(paperclipCliArgs(args))],
    options
  )
}

async function startContainer() {
  if (await containerRunning()) {
    log(`container already running: ${containerName}`)
    return
  }

  if (await containerExists()) {
    log(`removing stopped container: ${containerName}`)
    await run(engine, ['rm', '-f', containerName])
  }

  await ensureVolume(dataVolume, 'paperclip-plugin-sandbox')
  await ensureVolume(homeVolume, 'paperclip-plugin-sandbox')

  log(`starting ${containerName} from ${image}`)
  await run(engine, [
    'run',
    '-d',
    '--name',
    containerName,
    '--label',
    `com.agentteam.email.worktree=${worktreeSlug}`,
    '--label',
    'com.agentteam.email.workflow=paperclip-plugin-sandbox',
    '--network',
    'host',
    ...(isPodman ? ['--userns', 'keep-id'] : []),
    '--user',
    containerUser,
    '-v',
    `${repoRoot}:/workspace:ro`,
    '-v',
    `${path.dirname(configPath)}:/sandbox/config:ro`,
    '-v',
    volumeMount(dataVolume, '/sandbox/paperclip'),
    '-v',
    volumeMount(homeVolume, '/sandbox/home'),
    '-w',
    '/workspace',
    '-e',
    'HOME=/sandbox/home',
    '-e',
    'PAPERCLIP_CONFIG=/sandbox/config/config.json',
    '-e',
    'PAPERCLIP_HOME=/sandbox/home',
    '-e',
    'PAPERCLIP_INSTANCE_ID=agentteam-email-plugin',
    '-e',
    'PAPERCLIP_CONTEXT=/sandbox/home/context.json',
    '-e',
    'PAPERCLIP_AUTH_STORE=/sandbox/home/auth.json',
    '-e',
    'HOST=127.0.0.1',
    '-e',
    `PORT=${hostPort}`,
    '-e',
    'SERVE_UI=true',
    '-e',
    'PAPERCLIP_DB_BACKUP_ENABLED=false',
    '-e',
    'HEARTBEAT_SCHEDULER_ENABLED=false',
    '-e',
    'PAPERCLIP_MIGRATION_AUTO_APPLY=true',
    '-e',
    'PAPERCLIP_UI_DEV_MIDDLEWARE=false',
    image,
    'bash',
    '-lc',
    paperclipDlxCommand(['run', '--config', '/sandbox/config/config.json', '--data-dir', '/sandbox/home'])
  ])
}

async function waitForHealth(timeoutMs = 120_000) {
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
        `Paperclip sandbox container exited before healthcheck passed.\n${logs.stdout}${logs.stderr}`
      )
    }

    try {
      const response = await fetch(healthUrl)
      if (response.ok) {
        log(`healthcheck passed: ${healthUrl}`)
        return
      }
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }

    if ((Date.now() - startedAt) % 10_000 < 1_000) {
      log(`waiting for Paperclip healthcheck (${lastError})`)
    }
    await sleep(1_000)
  }

  throw new Error(`Timed out waiting for ${healthUrl}: ${lastError}`)
}

async function listPlugins() {
  const list = await runPaperclipCliInContainer(['plugin', 'list', '--json'], { capture: true })
  await writeFile(path.join(artifactRoot, 'plugin-list.stdout.log'), list.stdout, 'utf8')
  await writeFile(path.join(artifactRoot, 'plugin-list.stderr.log'), list.stderr, 'utf8')

  return parseJsonFromOutput(list.stdout)
}

function findPlugin(plugins) {
  return Array.isArray(plugins) ? plugins.find((plugin) => plugin.pluginKey === pluginKey) : null
}

async function installPlugin({ force = false } = {}) {
  const existing = findPlugin(await listPlugins())
  if (existing && !force) {
    if (existing.status !== 'ready') {
      throw new Error(`Plugin ${pluginKey} is already installed but not ready: ${existing.status}`)
    }
    log(`plugin already installed and ready: ${pluginKey}`)
    return
  }

  if (existing && force) {
    log(`uninstalling existing sandbox plugin: ${pluginKey}`)
    const uninstall = await runPaperclipCliInContainer(
      ['plugin', 'uninstall', pluginKey, '--force', '--json'],
      {
        capture: true
      }
    )
    await writeFile(path.join(artifactRoot, 'plugin-uninstall.stdout.log'), uninstall.stdout, 'utf8')
    await writeFile(path.join(artifactRoot, 'plugin-uninstall.stderr.log'), uninstall.stderr, 'utf8')
  }

  log('installing local plugin into sandbox')
  const install = await runPaperclipCliInContainer(
    ['plugin', 'install', '/workspace/packages/paperclip-email-plugin', '--local', '--json'],
    { capture: true }
  )
  await writeFile(path.join(artifactRoot, 'plugin-install.stdout.log'), install.stdout, 'utf8')
  await writeFile(path.join(artifactRoot, 'plugin-install.stderr.log'), install.stderr, 'utf8')

  const installed = findPlugin(await listPlugins())
  if (!installed) {
    throw new Error(`Plugin ${pluginKey} was not returned by paperclipai plugin list.`)
  }
  if (installed.status !== 'ready') {
    throw new Error(`Plugin ${pluginKey} is installed but not ready: ${installed.status}`)
  }
}

async function requestPaperclipApi(apiPath, options = {}) {
  const response = await fetch(`${uiUrl}${apiPath}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' })
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(
      `Paperclip API ${options.method ?? 'GET'} ${apiPath} failed: ${response.status} ${detail}`
    )
  }

  if (response.status === 204) {
    return null
  }

  return response.json()
}

async function seedExampleWorkspace() {
  if (!seedEnabled) {
    log('example workspace seed disabled by PAPERCLIP_SANDBOX_SEED=false')
    return
  }

  await mkdir(artifactRoot, { recursive: true })

  const companies = await requestPaperclipApi('/api/companies')
  if (!Array.isArray(companies)) {
    throw new Error('Paperclip API /api/companies did not return an array.')
  }
  if (companies.length > 0) {
    log(`example workspace seed skipped; ${companies.length} company record(s) already exist`)
    return
  }

  log('seeding example Paperclip workspace')
  const company = await requestPaperclipApi('/api/companies', {
    method: 'POST',
    body: {
      name: 'AgentTeam Email Preview',
      description: 'Example workspace for trying the AgentTeam Email Paperclip plugin.',
      budgetMonthlyCents: 50000
    }
  })

  const ceo = await requestPaperclipApi(`/api/companies/${company.id}/agents`, {
    method: 'POST',
    body: {
      name: 'Preview CEO',
      role: 'ceo',
      title: 'Example Workspace Owner',
      icon: 'crown',
      capabilities: 'Owns the preview workspace and delegates email-oriented work.',
      adapterType: 'process',
      adapterConfig: { command: 'echo', args: ['hello from preview ceo'] },
      budgetMonthlyCents: 15000
    }
  })

  const emailAgent = await requestPaperclipApi(`/api/companies/${company.id}/agents`, {
    method: 'POST',
    body: {
      name: 'Email Ops Agent',
      role: 'general',
      title: 'Email Operations Agent',
      icon: 'mail',
      reportsTo: ceo.id,
      capabilities: 'Uses the AgentTeam Email plugin to request and inspect mailbox provisioning.',
      adapterType: 'process',
      adapterConfig: { command: 'echo', args: ['hello from email ops agent'] },
      budgetMonthlyCents: 10000,
      metadata: {
        agentteamEmailPreview: true
      }
    }
  })

  const goal = await requestPaperclipApi(`/api/companies/${company.id}/goals`, {
    method: 'POST',
    body: {
      title: 'Validate agent email provisioning',
      description: 'Exercise the local Paperclip plugin with a small example agent team.',
      level: 'company',
      status: 'active',
      ownerAgentId: ceo.id
    }
  })

  const project = await requestPaperclipApi(`/api/companies/${company.id}/projects`, {
    method: 'POST',
    body: {
      name: 'Email Plugin Preview',
      description: 'Try provisioning and managing agent email through the local plugin scaffold.',
      status: 'in_progress',
      goalIds: [goal.id],
      leadAgentId: ceo.id,
      icon: 'mail'
    }
  })

  const firstIssue = await requestPaperclipApi(`/api/companies/${company.id}/issues`, {
    method: 'POST',
    body: {
      projectId: project.id,
      goalId: goal.id,
      title: 'Inspect the AgentTeam Email plugin status',
      description: 'Open the plugin surface and confirm the local scaffold is installed and ready.',
      status: 'todo',
      priority: 'high',
      assigneeAgentId: emailAgent.id
    }
  })

  const secondIssue = await requestPaperclipApi(`/api/companies/${company.id}/issues`, {
    method: 'POST',
    body: {
      projectId: project.id,
      goalId: goal.id,
      title: 'Plan mailbox provisioning defaults',
      description:
        'Decide which agents should receive preview mailboxes once upstream provisioning is connected.',
      status: 'backlog',
      priority: 'medium',
      assigneeAgentId: ceo.id
    }
  })

  const summary = {
    ok: true,
    companyId: company.id,
    companyName: company.name,
    agents: [
      { id: ceo.id, name: ceo.name },
      { id: emailAgent.id, name: emailAgent.name }
    ],
    goalId: goal.id,
    projectId: project.id,
    issues: [
      { id: firstIssue.id, title: firstIssue.title },
      { id: secondIssue.id, title: secondIssue.title }
    ],
    seededAt: new Date().toISOString()
  }
  await writeFile(
    path.join(artifactRoot, 'seed-summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8'
  )
  log(`seeded example workspace: ${company.name}`)
}

async function writeInfo() {
  await mkdir(artifactRoot, { recursive: true })

  const configPathRelative = path.relative(repoRoot, configPath)
  const info = {
    worktreeSlug,
    containerName,
    dataVolume,
    homeVolume,
    engine,
    image,
    paperclipVersion,
    containerUser,
    pluginKey,
    uiUrl,
    healthUrl,
    databasePort,
    artifactRoot: path.relative(repoRoot, artifactRoot),
    configPath: configPathRelative,
    configEnvPath: path.relative(repoRoot, configEnvPath),
    pluginPathInContainer: '/workspace/packages/paperclip-email-plugin',
    updatedAt: new Date().toISOString()
  }
  await writeFile(infoPath, `${JSON.stringify(info, null, 2)}\n`, 'utf8')
}

async function start() {
  await buildPlugin()
  await prepareSandboxConfig()
  await startContainer()
  await waitForHealth()
  await installPlugin()
  await seedExampleWorkspace()
  await writeInfo()
  log(`ready: ${uiUrl}`)
  log(`sandbox volumes: ${dataVolume}, ${homeVolume}`)
  log(`sandbox artifacts: ${path.relative(repoRoot, artifactRoot)}`)
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
        uiUrl,
        healthUrl,
        volumes: {
          data: dataVolume,
          home: homeVolume
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
    const response = await fetch(healthUrl)
    log(`health: ${response.status} ${response.statusText}`)
  } catch (error) {
    log(`health request failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function smoke() {
  if (!(await containerRunning())) {
    throw new Error(
      `Sandbox is not running. Start it with: mise run //test-containers/paperclip-plugin-e2e:sandbox:start`
    )
  }

  await waitForHealth(30_000)
  const list = await runPaperclipCliInContainer(['plugin', 'list', '--json'], { capture: true })
  const plugins = parseJsonFromOutput(list.stdout)
  const plugin = Array.isArray(plugins) ? plugins.find((entry) => entry.pluginKey === pluginKey) : null

  if (!plugin) {
    throw new Error(`Plugin ${pluginKey} is not installed in the sandbox.`)
  }
  if (plugin.status !== 'ready') {
    throw new Error(`Plugin ${pluginKey} is installed but not ready: ${plugin.status}`)
  }

  const summary = {
    ok: true,
    pluginKey,
    status: plugin.status,
    uiUrl,
    dataVolume,
    homeVolume,
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
  await removeVolume(homeVolume)
  await removeArtifactRoot()
  log(`removed sandbox volumes: ${dataVolume}, ${homeVolume}`)
  log(`removed sandbox artifacts: ${path.relative(repoRoot, artifactRoot)}`)
}

function help() {
  console.log(`Usage: node paperclip-sandbox.mjs <command>

Commands:
  start    Build the plugin, start Paperclip in a container, and install the plugin
  stop     Stop and remove the sandbox container, preserving named volumes
  status   Print sandbox container and URL status
  smoke    Verify the running sandbox health and installed plugin state
  logs     Follow sandbox container logs
  install  Rebuild and reinstall the plugin into the running sandbox
  seed     Seed the example workspace when no companies exist
  reset    Stop the sandbox and remove named volumes plus ignored artifacts

Environment:
  CONTAINER_ENGINE=${engine}
  WT=${worktreeSlug}
  PAPERCLIP_SANDBOX_CONTAINER=${containerName}
  PAPERCLIP_SANDBOX_DATA_VOLUME=${dataVolume}
  PAPERCLIP_SANDBOX_HOME_VOLUME=${homeVolume}
  PAPERCLIP_SANDBOX_ARTIFACT_ROOT=${path.relative(repoRoot, artifactRoot)}
  PAPERCLIP_SANDBOX_SEED=${seedEnabled}
  PAPERCLIP_SANDBOX_PORT=${hostPort}
  PAPERCLIP_SANDBOX_DB_PORT=${databasePort}
  PAPERCLIP_SANDBOX_IMAGE=${image}
  PAPERCLIP_SANDBOX_PAPERCLIP_VERSION=${paperclipVersion}`)
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
  } else if (command === 'install') {
    await buildPlugin()
    await waitForHealth(30_000)
    await installPlugin({ force: true })
    await writeInfo()
  } else if (command === 'seed') {
    await waitForHealth(30_000)
    await seedExampleWorkspace()
    await writeInfo()
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
