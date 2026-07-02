import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const suiteRoot = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(suiteRoot, '../..')
const artifactSubmitWorkdir = path.posix.join(path.posix.sep, 'work')
const runId =
  process.env.TEST_RUN_ID || new Date().toISOString().replaceAll(/[-:]/g, '').replace(/\..+$/u, 'Z')
const runDir = path.resolve(process.env.TEST_RUN_DIR || path.join(suiteRoot, 'tmp', `run-${runId}`))
const logsDir = path.join(runDir, 'logs')
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
const stackEnv = createStackEnvironment()
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

if (!process.env.DOCKER_HOST && process.env.PODMAN_SOCK) {
  process.env.DOCKER_HOST = process.env.PODMAN_SOCK
}

if (process.env.DOCKER_HOST?.includes('podman')) {
  process.env.TESTCONTAINERS_RYUK_DISABLED ??= 'true'
}

const { DockerComposeEnvironment, GenericContainer, Network, Wait } = await import('testcontainers')

await mkdir(logsDir, { recursive: true })
await mkdir(diagnosticsDir, { recursive: true })
await mkdir(reportsDir, { recursive: true })
await mkdir(scenariosDir, { recursive: true })
await mkdir(generatedInputsDir, { recursive: true })

await log(`run directory: ${path.relative(suiteRoot, runDir)}`)
await log(`project: ${projectName}`)
await log(`web image: ${webServerImage}`)
await log(`mail-control image: ${mailControlServiceImage}`)
await writeJson(path.join(diagnosticsDir, 'stack-environment.json'), redactEnvironment(stackEnv))

let network
let fakeCloudflare
let composeEnvironment
let browserContainer
let setupFailure = null

try {
  network = await startNetwork()
  const composeOverrideFile = await writeComposeOverride(network.getName())
  await renderComposeConfigs(composeOverrideFile)
  fakeCloudflare = await startFakeCloudflare(network)
  composeEnvironment = await startComposeEnvironment(composeOverrideFile)
  browserContainer = await startBrowserContainer(network)
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
  await writeReports()
  await submitArtifacts()
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
  const composeCommand = await resolveComposeCommand()
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
  return new GenericContainer('docker.io/library/node:26.4.0-bookworm-slim')
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
}

async function startComposeEnvironment(composeOverrideFile) {
  await log('starting production-like Compose stack through Testcontainers')
  const composeFiles = ['compose.yaml', 'compose.dev.yaml', path.relative(repoRoot, composeOverrideFile)]
  const environment = new DockerComposeEnvironment(repoRoot, composeFiles)
    .withProjectName(projectName)
    .withEnvironment(stackEnv)
    .withStartupTimeout(600_000)

  return environment.up()
}

async function startBrowserContainer(startedNetwork) {
  await log('starting Playwright browser runner container')
  return new GenericContainer(browserImage)
    .withNetwork(startedNetwork)
    .withBindMounts([{ source: repoRoot, target: '/work', mode: 'Z' }])
    .withWorkingDir('/work')
    .withSharedMemorySize(2 * 1024 * 1024 * 1024)
    .withCommand(['bash', '-lc', 'tail -f /dev/null'])
    .withWaitStrategy(Wait.forSuccessfulCommand('node --version'))
    .withStartupTimeout(180_000)
    .start()
}

async function runBrowserScenario(container) {
  await log('running recorded browser scenario')
  const containerRunDir = path.posix.join(
    '/work',
    path.relative(repoRoot, runDir).split(path.sep).join(path.posix.sep)
  )
  const result = await container.exec(['node', './test-containers/full-stack-browser-e2e/browser-flow.mjs'], {
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
  })

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
  if (composeEnvironment) {
    for (const containerName of composeServices) {
      try {
        const container = composeEnvironment.getContainer(containerName)
        await writeContainerLogs(container, path.join(logsDir, `container-${containerName}.log`))
      } catch (error) {
        await writeFile(
          path.join(logsDir, `container-${containerName}.log`),
          `container log unavailable: ${stringifyError(error)}\n`
        )
      }
    }
  }

  if (fakeCloudflare) {
    await writeContainerLogs(fakeCloudflare, path.join(logsDir, 'container-fake-cloudflare.log'))
    await fetchDiagnosticJson(
      'http://127.0.0.1',
      fakeCloudflare.getMappedPort(8788),
      '/__requests',
      'fake-cloudflare-requests.json'
    )
  }

  if (browserContainer) {
    await writeContainerLogs(browserContainer, path.join(logsDir, 'container-browser-runner.log'))
  }
}

async function stopRuntime() {
  await log('stopping containers')
  if (browserContainer) {
    await browserContainer
      .stop()
      .catch((error) => log(`browser container stop failed: ${stringifyError(error)}`))
  }
  if (composeEnvironment) {
    await composeEnvironment.down({ removeVolumes: true, timeout: 0 }).catch((error) => {
      log(`compose down failed: ${stringifyError(error)}`)
    })
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

async function submitArtifacts() {
  if (process.env.TEST_ARTIFACT_SUBMIT_SKIP) {
    await log('artifact submission skipped by TEST_ARTIFACT_SUBMIT_SKIP')
    return
  }
  await runCommand(
    containerEngine,
    [
      'run',
      '--rm',
      '--userns',
      'keep-id',
      '--user',
      `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
      '--env-host',
      '-v',
      `${suiteRoot}:${artifactSubmitWorkdir}:Z`,
      '-w',
      artifactSubmitWorkdir,
      'system.registry.test/agentteam/test-artifact-ctl:latest',
      'submit',
      '--namespace',
      'agentteam-email/full-stack-browser-e2e',
      '--suite',
      'full-stack-browser-e2e',
      '--run-dir',
      path.posix.join(artifactSubmitWorkdir, 'tmp', `run-${runId}`),
      '--event-id',
      `run-${runId}`
    ],
    {
      allowFailure: true,
      logName: 'artifact-submit'
    }
  )
}

async function resolveComposeCommand() {
  if (await commandSucceeds(containerEngine, ['compose', 'version'])) {
    return { command: containerEngine, prefix: ['compose'] }
  }
  const composeExecutable = `${containerEngine}-compose`
  if (await commandSucceeds(composeExecutable, ['--version'])) {
    return { command: composeExecutable, prefix: [] }
  }
  throw new Error(`missing Compose CLI for CONTAINER_ENGINE=${containerEngine}`)
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

async function writeContainerLogs(container, targetPath) {
  const stream = await container.logs({ tail: 20_000 })
  await new Promise((resolve, reject) => {
    const writer = createWriteStream(targetPath)
    stream.on('error', reject)
    writer.on('error', reject)
    writer.on('finish', resolve)
    stream.pipe(writer)
  })
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
  const stdoutChunks = []
  const stderrChunks = []
  child.stdout.on('data', (chunk) => stdoutChunks.push(Buffer.from(chunk)))
  child.stderr.on('data', (chunk) => stderrChunks.push(Buffer.from(chunk)))

  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', resolve)
  })
  const stdout = Buffer.concat(stdoutChunks).toString('utf8')
  const stderr = Buffer.concat(stderrChunks).toString('utf8')
  await writeFile(stdoutFile, stdout)
  await writeFile(stderrFile, stderr)

  if (exitCode !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(' ')} exited ${exitCode}: ${bodySnippet(stderr || stdout)}`)
  }

  await log(`command finished: ${command} ${args[0] || ''} exit=${exitCode}`)
  return { exitCode, stderr, stdout }
}

function createStackEnvironment() {
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
    AT_EMAIL_ADMIN_DEV_HARAKA_SMTP_PORT: '0',
    AT_EMAIL_ADMIN_DEV_MAILPIT_HTTP_PORT: '0',
    AT_EMAIL_ADMIN_DEV_MAILPIT_SMTP_PORT: '0',
    AT_EMAIL_ADMIN_DEV_MINIO_CONSOLE_PORT: '0',
    AT_EMAIL_ADMIN_DEV_MINIO_PORT: '0',
    AT_EMAIL_ADMIN_DEV_MONGO_PORT: '0',
    AT_EMAIL_ADMIN_DEV_NETWORK: `${projectName}-network`,
    AT_EMAIL_ADMIN_DEV_REDIS_PORT: '0',
    AT_EMAIL_ADMIN_DEV_RSPAMD_PORT: '0',
    AT_EMAIL_ADMIN_DEV_WILDDUCK_API_PORT: '0',
    AT_EMAIL_ADMIN_DEV_WILDDUCK_IMAP_PORT: '0',
    AT_EMAIL_ADMIN_DEV_ZONEMTA_DSN_PORT: '0',
    AT_EMAIL_ADMIN_ENCRYPT_SECRET_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    AT_EMAIL_ADMIN_FEEDBACK_MAILBOX_PASSWORD: 'full-stack-browser-e2e-feedback-password',
    AT_EMAIL_ADMIN_FRONTEND_PORT: '0',
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
