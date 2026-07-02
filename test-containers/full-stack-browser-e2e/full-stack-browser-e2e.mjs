import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const suiteRoot = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(suiteRoot, '../..')
const runId =
  process.env.TEST_RUN_ID || new Date().toISOString().replaceAll(/[-:]/g, '').replace(/\..+$/u, 'Z')
const runDir = path.resolve(process.env.TEST_RUN_DIR || path.join(suiteRoot, 'tmp', `run-${runId}`))
const logsDir = path.join(runDir, 'logs')
const containersDir = path.join(runDir, 'containers')
const diagnosticsDir = path.join(runDir, 'diagnostics')
const reportsDir = path.join(runDir, 'reports')
const scenariosDir = path.join(runDir, 'scenarios')
const generatedInputsDir = path.join(runDir, 'generated-inputs')
const harnessLogPath = path.join(logsDir, 'harness.log')
const containerEngine = process.env.CONTAINER_ENGINE || 'podman'
const wt = process.env.WT || 'main'
const safeRunId = sanitizeIdentifier(runId)
const projectName = `atemail-${sanitizeIdentifier(wt)}-${safeRunId.slice(0, 32)}-browser-e2e`
const imageTag = process.env.AT_EMAIL_ADMIN_BROWSER_E2E_IMAGE_TAG || 'stage'
const mailControlServiceImage =
  process.env.AT_EMAIL_ADMIN_BROWSER_E2E_MAIL_CONTROL_SERVICE_IMAGE ||
  `atemail.${wt}.mail-control-service:${imageTag}`
const webServerImage =
  process.env.AT_EMAIL_ADMIN_BROWSER_E2E_WEB_SERVER_IMAGE || `atemail.${wt}.web-server:${imageTag}`
const browserImage =
  process.env.AT_EMAIL_ADMIN_BROWSER_E2E_PLAYWRIGHT_IMAGE || 'mcr.microsoft.com/playwright:v1.61.1-noble'
const minioAccessKey = 'full-stack-browser-e2e-minio'
const minioSecretKey = 'full-stack-browser-e2e-minio-secret'
const archiveBucket = 'full-stack-browser-e2e-archive'
const hostPortEnvKeys = [
  'AT_EMAIL_ADMIN_DEV_HARAKA_SMTP_PORT',
  'AT_EMAIL_ADMIN_DEV_MAILPIT_HTTP_PORT',
  'AT_EMAIL_ADMIN_DEV_MAILPIT_SMTP_PORT',
  'AT_EMAIL_ADMIN_DEV_MINIO_CONSOLE_PORT',
  'AT_EMAIL_ADMIN_DEV_MINIO_PORT',
  'AT_EMAIL_ADMIN_DEV_MONGO_PORT',
  'AT_EMAIL_ADMIN_DEV_REDIS_PORT',
  'AT_EMAIL_ADMIN_DEV_RSPAMD_PORT',
  'AT_EMAIL_ADMIN_DEV_WILDDUCK_API_PORT',
  'AT_EMAIL_ADMIN_DEV_WILDDUCK_IMAP_PORT',
  'AT_EMAIL_ADMIN_DEV_ZONEMTA_DSN_PORT',
  'AT_EMAIL_ADMIN_FRONTEND_PORT'
]
const hostPortAllocations = await allocateHostPorts(hostPortEnvKeys)
const stackEnv = createStackEnvironment(hostPortAllocations)
const composeServices = [
  'mongodb-1',
  'redis-1',
  'rspamd-1',
  'wildduck-1',
  'haraka-1',
  'atemail-mail-control-service-1',
  'zonemta-1',
  'mailpit-1',
  'minio-1',
  'atemail-web-server-1'
]
const results = []
const containerLogStreams = []
let resolvedComposeCommand

if (!process.env.DOCKER_HOST && process.env.PODMAN_SOCK) {
  process.env.DOCKER_HOST = process.env.PODMAN_SOCK
}

if (process.env.DOCKER_HOST?.includes('podman')) {
  process.env.TESTCONTAINERS_RYUK_DISABLED ??= 'true'
}

const { DockerComposeEnvironment, GenericContainer, Network, Wait } = await import('testcontainers')

await mkdir(logsDir, { recursive: true })
await mkdir(containersDir, { recursive: true })
await mkdir(diagnosticsDir, { recursive: true })
await mkdir(reportsDir, { recursive: true })
await mkdir(scenariosDir, { recursive: true })
await mkdir(generatedInputsDir, { recursive: true })

await log(`run directory: ${path.relative(suiteRoot, runDir)}`)
await log(`project: ${projectName}`)
await log(`web image: ${webServerImage}`)
await log(`mail-control image: ${mailControlServiceImage}`)
await log(`allocated host ports: ${Object.keys(hostPortAllocations).length}`)
await writeJson(path.join(diagnosticsDir, 'host-port-allocations.json'), hostPortAllocations)
await writeJson(path.join(diagnosticsDir, 'stack-environment.json'), redactEnvironment(stackEnv))
await writeRunContext()

let network
let fakeCloudflare
let composeEnvironment
let browserContainer
let composeOverrideFile
let composeLoggerHandle
let setupFailure = null

try {
  network = await startNetwork()
  composeOverrideFile = await writeComposeOverride(network.getName())
  await renderComposeConfigs(composeOverrideFile)
  fakeCloudflare = await startFakeCloudflare(network)
  await writeTopology()
  composeEnvironment = await startComposeEnvironment(composeOverrideFile)
  await writeTopology()
  browserContainer = await startBrowserContainer(network)
  await writeTopology()
  await runBrowserScenario(browserContainer)
  await recordResult({
    name: 'full-product-walkthrough',
    status: 'passed',
    details: 'Recorded browser flow completed.'
  })
} catch (error) {
  setupFailure = error
  await log(`failed: ${stringifyError(error)}`)
  await recordResult({
    name: 'full-product-walkthrough',
    status: 'failed',
    details: stringifyError(error)
  })
} finally {
  await collectDiagnostics()
  await stopRuntime()
  await finalizeContainerLogStreams()
  await writeReports()
}

const failed = results.filter((result) => result.status === 'failed')
if (failed.length > 0) {
  await log(`failed assertions: ${failed.length}/${results.length}`)
  throw setupFailure || new Error(`${failed.length} browser E2E assertion(s) failed`)
}

await log(`passed assertions: ${results.length}`)

async function startNetwork() {
  await log('starting isolated Testcontainers network')
  const startedNetwork = await new Network().start()
  await log(`network: ${startedNetwork.getName()}`)
  return startedNetwork
}

async function writeComposeOverride(networkName) {
  const overrideFile = path.join(generatedInputsDir, 'compose.browser-e2e.override.yaml')
  const content = [
    'services:',
    '  atemail-mail-control-service:',
    `    image: ${JSON.stringify(mailControlServiceImage)}`,
    '  atemail-web-server:',
    `    image: ${JSON.stringify(webServerImage)}`,
    'networks:',
    '  agentteam-email-network:',
    `    name: ${JSON.stringify(networkName)}`,
    '    external: true',
    ''
  ].join('\n')
  await writeFile(overrideFile, content)
  return overrideFile
}

async function renderComposeConfigs(composeOverrideFile) {
  await log('rendering Compose-owned service config files')
  const configDir = path.join(generatedInputsDir, 'compose-config')
  await mkdir(configDir, { recursive: true })
  const renderedCompose = path.join(configDir, 'compose.rendered.yaml')
  const composeCommand = await getResolvedComposeCommand()
  const composeArgs = [
    ...composeCommand.prefix,
    '-f',
    'compose.yaml',
    '-f',
    'compose.dev.yaml',
    '-f',
    path.relative(repoRoot, composeOverrideFile),
    'config'
  ]
  await runCommand(composeCommand.command, composeArgs, {
    env: { ...process.env, ...stackEnv },
    logName: 'compose-config',
    stdoutFile: renderedCompose
  })
  await runCommand(process.execPath, ['scripts/dev-render-compose-configs.mjs', renderedCompose, configDir], {
    env: { ...process.env, ...stackEnv },
    logName: 'render-compose-configs'
  })
}

async function startFakeCloudflare(startedNetwork) {
  await log('starting fake Cloudflare provider')
  const serverFile = path.join(repoRoot, 'test-containers/full-stack-e2e/fake-cloudflare/server.mjs')
  const container = await withHeartbeatLog('fake Cloudflare startup', () =>
    new GenericContainer('docker.io/library/node:26.4.0-bookworm-slim')
      .withNetwork(startedNetwork)
      .withNetworkAliases('fake-cloudflare')
      .withCopyFilesToContainer([{ source: serverFile, target: '/app/server.mjs' }])
      .withEnvironment({
        AT_EMAIL_ADMIN_FAKE_CF_OAUTH_EMAIL: `cloudflare-${safeRunId}@example.test`,
        AT_EMAIL_ADMIN_FAKE_CF_OAUTH_SUB: `cloudflare-user-${safeRunId}`,
        FAKE_CLOUDFLARE_INTERACTIVE_OAUTH: '1',
        PORT: '8788'
      })
      .withExposedPorts(8788)
      .withCommand(['node', '/app/server.mjs'])
      .withWaitStrategy(Wait.forHttp('/health', 8788).forStatusCode(200))
      .withStartupTimeout(120_000)
      .start()
  )
  await attachContainerLogs(container, 'fake-cloudflare')
  return container
}

async function startComposeEnvironment(composeOverrideFile) {
  await log('starting production-like Compose stack through Testcontainers')
  const composeCommand = await getResolvedComposeCommand()
  const composeFiles = ['compose.yaml', 'compose.dev.yaml', path.relative(repoRoot, composeOverrideFile)]
  composeLoggerHandle = createComposeLogger('compose-up')
  const environment = new DockerComposeEnvironment(repoRoot, composeFiles)
    .withProjectName(projectName)
    .withEnvironment(stackEnv)
    .withClientOptions({ executable: composeCommand.executable, logger: composeLoggerHandle.logger })
    .withStartupTimeout(600_000)

  const startedEnvironment = await withHeartbeatLog('Compose stack startup', () => environment.up())
  await attachComposeContainerLogs(startedEnvironment)
  return startedEnvironment
}

async function startBrowserContainer(startedNetwork) {
  await log('starting Playwright browser runner container')
  const container = await withHeartbeatLog('Playwright browser runner startup', () =>
    new GenericContainer(browserImage)
      .withNetwork(startedNetwork)
      .withBindMounts([{ source: repoRoot, target: '/work', mode: 'Z' }])
      .withWorkingDir('/work')
      .withSharedMemorySize(2 * 1024 * 1024 * 1024)
      .withCommand(['bash', '-lc', 'tail -f /dev/null'])
      .withWaitStrategy(Wait.forSuccessfulCommand('node --version'))
      .withStartupTimeout(180_000)
      .start()
  )
  await attachContainerLogs(container, 'browser-runner')
  return container
}

async function runBrowserScenario(container) {
  await log('running recorded browser scenario')
  const containerRunDir = path.posix.join(
    '/work',
    path.relative(repoRoot, runDir).split(path.sep).join(path.posix.sep)
  )
  const browserLiveLogPath = path.join(logsDir, 'browser-runner.live.log')
  const containerBrowserLiveLogPath = path.posix.join(containerRunDir, 'logs', 'browser-runner.live.log')
  await writeFile(browserLiveLogPath, '', { flag: 'a' })
  const tail = startFileTail(browserLiveLogPath, 'browser-runner')
  let result
  try {
    result = await container.exec(
      [
        'bash',
        '-lc',
        `set -o pipefail; node ./test-containers/full-stack-browser-e2e/browser-flow.mjs 2>&1 | tee -a ${shellQuote(
          containerBrowserLiveLogPath
        )}`
      ],
      {
        env: {
          ADMIN_EMAIL: `admin-${safeRunId}@example.test`,
          ADMIN_PASSWORD: 'BrowserE2E-admin-password-1!',
          APP_BASE_URL: 'http://atemail-web-server:4321',
          ARCHIVE_BUCKET: archiveBucket,
          INBOUND_SUBJECT: `Browser E2E inbound ${safeRunId}`,
          MAILBOX_DISPLAY_NAME: 'Browser E2E Agent',
          MAILBOX_LOCAL_PART: 'agent',
          MAILPIT_URL: 'http://mailpit:8025',
          MINIO_URL: 'http://minio:9000',
          R2_ACCESS_KEY_ID: minioAccessKey,
          R2_REGION: 'us-east-1',
          R2_SECRET_ACCESS_KEY: minioSecretKey,
          TEST_RUN_DIR: containerRunDir,
          TEST_RUN_ID: runId,
          USER_EMAIL: `user-${safeRunId}@example.test`,
          USER_NAME: 'Browser E2E User',
          USER_PASSWORD: 'BrowserE2E-user-password-1!',
          USER_USERNAME: `browser-${safeRunId.slice(0, 16)}`
        },
        workingDir: '/work'
      }
    )
  } finally {
    await stopFileTail(tail)
  }

  await writeFile(path.join(logsDir, 'browser-runner.stdout.log'), result.stdout || '')
  await writeFile(path.join(logsDir, 'browser-runner.stderr.log'), result.stderr || '')
  await writeFile(
    path.join(diagnosticsDir, 'browser-runner-exec.json'),
    `${JSON.stringify(result, null, 2)}\n`
  )
  if (result.exitCode !== 0) {
    throw new Error(
      `browser runner exited ${result.exitCode}: ${bodySnippet(result.stderr || result.stdout)}`
    )
  }
}

async function collectDiagnostics() {
  await log('collecting container logs and diagnostics')
  if (fakeCloudflare) {
    await fetchDiagnosticJson(
      'http://127.0.0.1',
      fakeCloudflare.getMappedPort(8788),
      '/__requests',
      'fake-cloudflare-requests.json'
    )
  }

  await writeContainerLogManifest()
}

async function stopRuntime() {
  await log('stopping containers')
  if (browserContainer) {
    await browserContainer
      .stop()
      .catch((error) => log(`browser container stop failed: ${stringifyError(error)}`))
  }
  let composeDownSucceeded = false
  if (composeEnvironment) {
    try {
      await composeEnvironment.down({ removeVolumes: true, timeout: 0 })
      composeDownSucceeded = true
    } catch (error) {
      await log(`compose down failed: ${stringifyError(error)}`)
    }
  }
  if (composeOverrideFile && !composeDownSucceeded) {
    await cleanupComposeProject(composeOverrideFile)
  }
  if (composeLoggerHandle) {
    await composeLoggerHandle.close()
    composeLoggerHandle = null
  }
  if (fakeCloudflare) {
    await fakeCloudflare.stop().catch((error) => log(`fake Cloudflare stop failed: ${stringifyError(error)}`))
  }
  if (network) {
    await network.stop().catch((error) => log(`network stop failed: ${stringifyError(error)}`))
  }
}

async function writeReports() {
  const summary = {
    failed: results.filter((result) => result.status === 'failed').length,
    passed: results.filter((result) => result.status === 'passed').length,
    results,
    runId,
    suite: 'full-stack-browser-e2e'
  }
  await writeJson(path.join(reportsDir, 'summary.json'), summary)
  await writeFile(path.join(reportsDir, 'junit.xml'), junitXml(summary))
  await writeFile(
    path.join(runDir, 'result-summary.txt'),
    `${summary.failed === 0 ? 'PASS' : 'FAIL'} full-stack-browser-e2e ${summary.passed}/${results.length} passed\n`
  )
}

async function resolveComposeCommand() {
  if (await commandSucceeds(containerEngine, ['compose', 'version'])) {
    return {
      command: containerEngine,
      executable: {
        executablePath: containerEngine,
        options: []
      },
      prefix: ['compose']
    }
  }
  const composeExecutable = `${containerEngine}-compose`
  if (await commandSucceeds(composeExecutable, ['--version'])) {
    return {
      command: composeExecutable,
      executable: {
        executablePath: composeExecutable,
        standalone: true
      },
      prefix: []
    }
  }
  throw new Error(`missing Compose CLI for CONTAINER_ENGINE=${containerEngine}`)
}

async function getResolvedComposeCommand() {
  resolvedComposeCommand ||= await resolveComposeCommand()
  return resolvedComposeCommand
}

async function commandSucceeds(command, args) {
  try {
    await runCommand(command, args, { allowFailure: false, logName: `probe-${sanitizeIdentifier(command)}` })
    return true
  } catch {
    return false
  }
}

async function fetchDiagnosticJson(origin, port, pathname, filename) {
  try {
    const response = await fetch(`${origin}:${port}${pathname}`, { headers: { accept: 'application/json' } })
    const text = await response.text()
    await writeFile(path.join(diagnosticsDir, filename), text)
  } catch (error) {
    await writeFile(
      path.join(diagnosticsDir, filename),
      `diagnostic fetch failed: ${stringifyError(error)}\n`
    )
  }
}

async function cleanupComposeProject(overrideFile) {
  const composeCommand = await getResolvedComposeCommand()
  const composeArgs = [
    ...composeCommand.prefix,
    '-f',
    'compose.yaml',
    '-f',
    'compose.dev.yaml',
    '-f',
    path.relative(repoRoot, overrideFile),
    'down',
    '-v'
  ]
  const result = await runCommand(composeCommand.command, composeArgs, {
    allowFailure: true,
    env: { ...process.env, ...stackEnv, COMPOSE_PROJECT_NAME: projectName },
    logName: 'compose-down',
    mirrorStderr: true
  })
  if (result.exitCode !== 0) {
    await log(`compose cleanup exited ${result.exitCode}`)
  }
}

async function attachComposeContainerLogs(startedEnvironment) {
  const entries = composeContainerEntries(startedEnvironment)
  for (const [containerName, container] of entries) {
    await attachContainerLogs(container, containerName)
  }
}

function composeContainerEntries(startedEnvironment) {
  if (
    startedEnvironment &&
    startedEnvironment.startedGenericContainers &&
    typeof startedEnvironment.startedGenericContainers === 'object'
  ) {
    return Object.entries(startedEnvironment.startedGenericContainers)
  }

  return composeServices.flatMap((containerName) => {
    try {
      return [[containerName, startedEnvironment.getContainer(containerName)]]
    } catch {
      return []
    }
  })
}

async function attachContainerLogs(container, containerName) {
  if (containerLogStreams.some((entry) => entry.containerName === containerName)) {
    return
  }

  const targetPath = path.join(containersDir, `${sanitizeIdentifier(containerName)}.log`)
  const writer = createWriteStream(targetPath, { flags: 'a' })
  const mirror = createPrefixedLineWriter(`[container:${containerName}]`)

  try {
    const stream = await container.logs({ since: 0 })
    const ended = new Promise((resolve) => {
      stream.on('data', (chunk) => {
        writer.write(chunk)
        if (process.env.AT_EMAIL_ADMIN_BROWSER_E2E_MIRROR_CONTAINER_LOGS === '1') {
          mirror.write(chunk)
        }
      })
      stream.on('error', (error) => {
        writer.write(`\n[container-log-error] ${stringifyError(error)}\n`)
        mirror.write(`\n[container-log-error] ${stringifyError(error)}\n`)
        resolve()
      })
      stream.on('end', resolve)
      stream.on('close', resolve)
    }).finally(async () => {
      mirror.flush()
      await finishWriter(writer)
    })

    containerLogStreams.push({
      containerId: safeContainerCall(container, 'getId'),
      containerName,
      file: path.relative(runDir, targetPath).split(path.sep).join(path.posix.sep),
      stream,
      writer,
      ended
    })
  } catch (error) {
    await finishWriter(writer)
    await writeFile(targetPath, `container log stream unavailable: ${stringifyError(error)}\n`, {
      flag: 'a'
    })
    containerLogStreams.push({
      containerId: safeContainerCall(container, 'getId'),
      containerName,
      error: stringifyError(error),
      file: path.relative(runDir, targetPath).split(path.sep).join(path.posix.sep)
    })
  }
}

async function finalizeContainerLogStreams() {
  const pending = containerLogStreams.filter((entry) => entry.ended).map((entry) => entry.ended)
  if (pending.length === 0) {
    return
  }

  await Promise.race([
    Promise.allSettled(pending),
    delay(5_000).then(() => {
      for (const entry of containerLogStreams) {
        entry.stream?.destroy?.()
        entry.writer?.end?.()
      }
    })
  ])
}

async function writeContainerLogManifest() {
  await writeJson(
    path.join(diagnosticsDir, 'container-logs.json'),
    containerLogStreams.map((entry) => ({
      containerId: entry.containerId,
      containerName: entry.containerName,
      error: entry.error,
      file: entry.file
    }))
  )
}

async function writeRunContext() {
  await writeJson(path.join(diagnosticsDir, 'run-context.json'), {
    archiveBucket,
    browserImage,
    containerEngine,
    endpoints: {
      appBaseUrl: 'http://atemail-web-server:4321',
      fakeCloudflareApiBaseUrl: stackEnv.AT_EMAIL_ADMIN_CF_API_BASE_URL,
      fakeCloudflareOAuthAuthorizationUrl: stackEnv.AT_EMAIL_ADMIN_CF_OAUTH_AUTHORIZATION_URL,
      mailpitUrl: 'http://mailpit:8025',
      minioUrl: 'http://minio:9000'
    },
    imageTag,
    hostPortAllocations,
    mailControlServiceImage,
    projectName,
    runDir: path.relative(suiteRoot, runDir).split(path.sep).join(path.posix.sep),
    runId,
    suite: 'full-stack-browser-e2e',
    webServerImage,
    wt
  })
}

async function writeTopology() {
  const containers = []
  if (composeEnvironment) {
    for (const [containerName, container] of composeContainerEntries(composeEnvironment)) {
      containers.push(containerTopology(containerName, container))
    }
  }
  if (fakeCloudflare) {
    containers.push(
      containerTopology('fake-cloudflare', fakeCloudflare, { hostPort: fakeCloudflare.getMappedPort(8788) })
    )
  }
  if (browserContainer) {
    containers.push(containerTopology('browser-runner', browserContainer))
  }

  await writeJson(path.join(diagnosticsDir, 'topology.json'), {
    containers,
    endpoints: {
      appBaseUrl: 'http://atemail-web-server:4321',
      fakeCloudflareInternalUrl: 'http://fake-cloudflare:8788',
      mailpitUrl: 'http://mailpit:8025',
      minioUrl: 'http://minio:9000'
    },
    network: network ? { name: network.getName() } : null,
    projectName,
    runId
  })
}

function containerTopology(containerName, container, extra = {}) {
  return {
    containerId: safeContainerCall(container, 'getId'),
    containerName,
    host: safeContainerCall(container, 'getHost'),
    networkNames: safeContainerCall(container, 'getNetworkNames') || [],
    ...extra
  }
}

function safeContainerCall(container, method) {
  try {
    return typeof container?.[method] === 'function' ? container[method]() : null
  } catch {
    return null
  }
}

async function recordResult(result) {
  results.push({
    details: result.details || '',
    name: result.name,
    status: result.status
  })
  await writeJson(path.join(reportsDir, 'results.json'), results)
}

async function log(message) {
  const line = `[full-stack-browser-e2e] ${new Date().toISOString()} ${message}`
  console.log(line)
  await mkdir(logsDir, { recursive: true })
  await writeFile(harnessLogPath, `${line}\n`, { flag: 'a' })
}

async function withHeartbeatLog(label, action, intervalMs = 30_000) {
  const started = Date.now()
  const timer = setInterval(() => {
    const elapsedSeconds = Math.round((Date.now() - started) / 1000)
    void log(`${label} heartbeat elapsed=${elapsedSeconds}s`)
  }, intervalMs)
  timer.unref?.()
  try {
    return await action()
  } finally {
    clearInterval(timer)
  }
}

async function runCommand(command, args, options = {}) {
  const logName = options.logName || sanitizeIdentifier(command)
  const stdoutFile = options.stdoutFile || path.join(logsDir, `${logName}.stdout.log`)
  const stderrFile = options.stderrFile || path.join(logsDir, `${logName}.stderr.log`)
  await mkdir(path.dirname(stdoutFile), { recursive: true })
  await mkdir(path.dirname(stderrFile), { recursive: true })
  await log(`command start: ${command} ${args.join(' ')}`)

  const child = spawn(command, args, {
    cwd: repoRoot,
    env: options.env || process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const stdoutWriter = createWriteStream(stdoutFile, { flags: 'w' })
  const stderrWriter = createWriteStream(stderrFile, { flags: 'w' })
  const stdoutChunks = []
  const stderrChunks = []
  const heartbeat = setInterval(() => {
    void log(`command heartbeat: ${command} ${args[0] || ''}`)
  }, 30_000)
  heartbeat.unref?.()
  child.stdout.on('data', (chunk) => {
    stdoutChunks.push(Buffer.from(chunk))
    stdoutWriter.write(chunk)
  })
  child.stderr.on('data', (chunk) => {
    stderrChunks.push(Buffer.from(chunk))
    stderrWriter.write(chunk)
    if (options.mirrorStderr) {
      process.stderr.write(chunk)
    }
  })

  let exitCode
  let spawnError
  try {
    exitCode = await new Promise((resolve, reject) => {
      child.on('error', reject)
      child.on('close', resolve)
    })
  } catch (error) {
    spawnError = error
  } finally {
    clearInterval(heartbeat)
    await Promise.all([finishWriter(stdoutWriter), finishWriter(stderrWriter)])
  }
  if (spawnError) {
    throw spawnError
  }
  const stdout = Buffer.concat(stdoutChunks).toString('utf8')
  const stderr = Buffer.concat(stderrChunks).toString('utf8')

  if (exitCode !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(' ')} exited ${exitCode}: ${bodySnippet(stderr || stdout)}`)
  }

  await log(`command finished: ${command} ${args[0] || ''} exit=${exitCode}`)
  return { exitCode, stderr, stdout }
}

function createStackEnvironment(hostPorts) {
  const hostPort = (key) => hostPorts[key]
  return {
    AT_EMAIL_ADMIN_APP_MONGODB_URI: 'mongodb://mongodb:27017/agentteam_email?replicaSet=rs0',
    AT_EMAIL_ADMIN_BETTER_AUTH_SECRET: 'full-stack-browser-e2e-better-auth-secret',
    AT_EMAIL_ADMIN_CF_API_BASE_URL: 'http://fake-cloudflare:8788/client/v4',
    AT_EMAIL_ADMIN_CF_OAUTH_AUTHORIZATION_URL: 'http://fake-cloudflare:8788/oauth2/auth',
    AT_EMAIL_ADMIN_CF_OAUTH_CLIENT_ID: 'full-stack-browser-e2e-cloudflare-client-id',
    AT_EMAIL_ADMIN_CF_OAUTH_ISSUER: 'http://fake-cloudflare:8788/oauth2',
    AT_EMAIL_ADMIN_CF_OAUTH_REVOKE_URL: 'http://fake-cloudflare:8788/oauth2/revoke',
    AT_EMAIL_ADMIN_CF_OAUTH_TOKEN_URL: 'http://fake-cloudflare:8788/oauth2/token',
    AT_EMAIL_ADMIN_CONTROL_MONGODB_URI:
      'mongodb://mongodb:27017/agent_mail_control?replicaSet=rs0&maxPoolSize=4&minPoolSize=0&maxIdleTimeMS=60000',
    AT_EMAIL_ADMIN_CONTROL_TO_WEB_API_BASE_URL: 'http://atemail-web-server:4321',
    AT_EMAIL_ADMIN_CONTROL_TO_WEB_API_TOKEN: 'full-stack-browser-e2e-control-token',
    AT_EMAIL_ADMIN_DATABASE_MAX_POOL_SIZE: '4',
    AT_EMAIL_ADMIN_DEV_CONFIG_DIR: path.join(generatedInputsDir, 'compose-config'),
    AT_EMAIL_ADMIN_DEV_HARAKA_SMTP_PORT: hostPort('AT_EMAIL_ADMIN_DEV_HARAKA_SMTP_PORT'),
    AT_EMAIL_ADMIN_DEV_MAILPIT_HTTP_PORT: hostPort('AT_EMAIL_ADMIN_DEV_MAILPIT_HTTP_PORT'),
    AT_EMAIL_ADMIN_DEV_MAILPIT_SMTP_PORT: hostPort('AT_EMAIL_ADMIN_DEV_MAILPIT_SMTP_PORT'),
    AT_EMAIL_ADMIN_DEV_MINIO_CONSOLE_PORT: hostPort('AT_EMAIL_ADMIN_DEV_MINIO_CONSOLE_PORT'),
    AT_EMAIL_ADMIN_DEV_MINIO_PORT: hostPort('AT_EMAIL_ADMIN_DEV_MINIO_PORT'),
    AT_EMAIL_ADMIN_DEV_MONGO_PORT: hostPort('AT_EMAIL_ADMIN_DEV_MONGO_PORT'),
    AT_EMAIL_ADMIN_DEV_NETWORK: `${projectName}-network`,
    AT_EMAIL_ADMIN_DEV_REDIS_PORT: hostPort('AT_EMAIL_ADMIN_DEV_REDIS_PORT'),
    AT_EMAIL_ADMIN_DEV_RSPAMD_PORT: hostPort('AT_EMAIL_ADMIN_DEV_RSPAMD_PORT'),
    AT_EMAIL_ADMIN_DEV_WILDDUCK_API_PORT: hostPort('AT_EMAIL_ADMIN_DEV_WILDDUCK_API_PORT'),
    AT_EMAIL_ADMIN_DEV_WILDDUCK_IMAP_PORT: hostPort('AT_EMAIL_ADMIN_DEV_WILDDUCK_IMAP_PORT'),
    AT_EMAIL_ADMIN_DEV_ZONEMTA_DSN_PORT: hostPort('AT_EMAIL_ADMIN_DEV_ZONEMTA_DSN_PORT'),
    AT_EMAIL_ADMIN_ENCRYPT_SECRET_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    AT_EMAIL_ADMIN_FEEDBACK_MAILBOX_PASSWORD: 'full-stack-browser-e2e-feedback-password',
    AT_EMAIL_ADMIN_FRONTEND_PORT: hostPort('AT_EMAIL_ADMIN_FRONTEND_PORT'),
    AT_EMAIL_ADMIN_HARAKA_SMTP_ADDRESS: 'haraka:10025',
    AT_EMAIL_ADMIN_MAIL_LOOP_SECRET: 'full-stack-browser-e2e-mail-loop-secret',
    AT_EMAIL_ADMIN_MONGODB_MAX_INCOMING_CONNECTIONS: '256',
    AT_EMAIL_ADMIN_MONGODB_REPLICA_SET_NAME: 'rs0',
    AT_EMAIL_ADMIN_PUBLIC_HOSTNAME: 'http://atemail-web-server:4321',
    AT_EMAIL_ADMIN_PULL_POLICY: 'missing',
    AT_EMAIL_ADMIN_R2_ACCESS_KEY_ID: minioAccessKey,
    AT_EMAIL_ADMIN_R2_ACCOUNT_ID: 'full-stack-browser-e2e-r2-account',
    AT_EMAIL_ADMIN_R2_API_TOKEN: 'full-stack-browser-e2e-r2-api-token',
    AT_EMAIL_ADMIN_R2_BUCKET: archiveBucket,
    AT_EMAIL_ADMIN_R2_ENDPOINT: 'http://minio:9000',
    AT_EMAIL_ADMIN_R2_REGION: 'us-east-1',
    AT_EMAIL_ADMIN_R2_SECRET_ACCESS_KEY: minioSecretKey,
    AT_EMAIL_ADMIN_REDIS_URL: 'redis://redis:6379/3',
    AT_EMAIL_ADMIN_SMTP_ADDRESS: 'mailpit',
    AT_EMAIL_ADMIN_SMTP_FROM_EMAIL: 'noreply@example.test',
    AT_EMAIL_ADMIN_SMTP_PORT: '1025',
    AT_EMAIL_ADMIN_SMTP_REPLY_TO_EMAIL: 'noreply@example.test',
    AT_EMAIL_ADMIN_SMTP_SECURE_TLS: 'false',
    AT_EMAIL_ADMIN_SMTP_SEND_AS_EMAIL: 'noreply@example.test',
    AT_EMAIL_ADMIN_TRIAL_ENABLED: 'false',
    AT_EMAIL_ADMIN_WILDDUCK_ACCESS_CONTROL_SECRET: 'full-stack-browser-e2e-wildduck-access-control',
    AT_EMAIL_ADMIN_WILDDUCK_ADMIN_ACCESS_TOKEN: 'full-stack-browser-e2e-wildduck-admin-token',
    AT_EMAIL_ADMIN_WILDDUCK_API_BASE_URL: 'http://wildduck:8080',
    AT_EMAIL_ADMIN_WILDDUCK_IMAP_ADDRESS: 'wildduck:10143',
    AT_EMAIL_ADMIN_WILDDUCK_MONGODB_URI:
      'mongodb://mongodb:27017/wildduck?replicaSet=rs0&maxPoolSize=4&minPoolSize=0&maxIdleTimeMS=60000',
    AT_EMAIL_ADMIN_ZONEMTA_DSN_ADDRESS: 'zonemta:2526',
    AT_EMAIL_ADMIN_ZONEMTA_RELAY_PASSWORD: 'full-stack-browser-e2e-zonemta-relay-password'
  }
}

function redactEnvironment(env) {
  return Object.fromEntries(
    Object.entries(env).map(([key, value]) => [
      key,
      /SECRET|TOKEN|PASSWORD|KEY/u.test(key) ? '<redacted-test-value>' : value
    ])
  )
}

function junitXml(summary) {
  const failures = summary.results.filter((result) => result.status === 'failed')
  const cases = summary.results
    .map((result) => {
      const failure =
        result.status === 'failed'
          ? `<failure message="${escapeXml(result.details)}">${escapeXml(result.details)}</failure>`
          : ''
      return `<testcase classname="full-stack-browser-e2e" name="${escapeXml(result.name)}">${failure}</testcase>`
    })
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="full-stack-browser-e2e" tests="${summary.results.length}" failures="${failures.length}">${cases}</testsuite>\n`
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function sanitizeIdentifier(value) {
  return String(value || 'run')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 64)
}

function bodySnippet(value) {
  return String(value || '')
    .replaceAll(/\s+/gu, ' ')
    .slice(0, 800)
}

async function allocateHostPorts(keys) {
  const ports = {}
  const used = new Set()
  for (const key of keys) {
    let port
    do {
      port = await allocateHostPort()
    } while (used.has(port))
    used.add(port)
    ports[key] = String(port)
  }
  return ports
}

function allocateHostPort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : null
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        if (!port) {
          reject(new Error('failed to allocate host port'))
          return
        }
        resolve(port)
      })
    })
  })
}

function createComposeLogger(logName) {
  const targetPath = path.join(logsDir, `${logName}.log`)
  const writer = createWriteStream(targetPath, { flags: 'a' })
  let closed = false

  function write(level, message) {
    if (closed) {
      return
    }
    const text = Buffer.isBuffer(message) ? message.toString('utf8') : String(message)
    for (const line of text.split(/\r?\n/u)) {
      if (!line) {
        continue
      }
      const entry = `[${new Date().toISOString()}] [${level}] ${line}`
      writer.write(`${entry}\n`)
      if (process.env.AT_EMAIL_ADMIN_BROWSER_E2E_MIRROR_COMPOSE_LOGS !== '0') {
        process.stdout.write(`[compose:${logName}] ${entry}\n`)
      }
    }
  }

  return {
    close: async () => {
      closed = true
      await finishWriter(writer)
    },
    logger: {
      debug: (message) => write('debug', message),
      enabled: () => true,
      error: (message) => write('error', message),
      info: (message) => write('info', message),
      trace: (message) => write('trace', message),
      warn: (message) => write('warn', message)
    }
  }
}

function createPrefixedLineWriter(prefix) {
  let pending = ''
  return {
    flush() {
      if (pending) {
        process.stdout.write(`${prefix} ${pending}\n`)
        pending = ''
      }
    },
    write(chunk) {
      const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
      const lines = `${pending}${text}`.split(/\r?\n/u)
      pending = lines.pop() || ''
      for (const line of lines) {
        process.stdout.write(`${prefix} ${line}\n`)
      }
    }
  }
}

function startFileTail(filePath, label) {
  const child = spawn('tail', ['-n', '+1', '-F', filePath], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const writer = createPrefixedLineWriter(`[${label}]`)
  child.stdout.on('data', (chunk) => writer.write(chunk))
  child.stderr.on('data', (chunk) => process.stderr.write(`[${label}:tail] ${chunk.toString('utf8')}`))
  child.on('error', (error) => {
    process.stderr.write(`[${label}:tail] ${stringifyError(error)}\n`)
  })
  return { child, writer }
}

async function stopFileTail(tail) {
  if (!tail) {
    return
  }
  tail.child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => tail.child.once('close', resolve)),
    delay(2_000).then(() => tail.child.kill('SIGKILL'))
  ])
  tail.writer.flush()
}

function finishWriter(writer) {
  return new Promise((resolve) => {
    if (writer.closed || writer.destroyed || writer.writableEnded) {
      resolve()
      return
    }
    writer.end(resolve)
  })
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function stringifyError(error) {
  return error instanceof Error ? error.stack || error.message : String(error)
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}
