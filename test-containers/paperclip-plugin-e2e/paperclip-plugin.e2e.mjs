import { spawn } from 'node:child_process'
import { access, mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const harnessRoot = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(harnessRoot, '..', '..')
const pluginRoot = path.join(repoRoot, 'packages', 'paperclip-email-plugin')
const runRoot = path.join(harnessRoot, 'tmp', `run-${Date.now()}`)
const pluginSdkRoot = path.join(pluginRoot, 'node_modules', '@paperclipai', 'plugin-sdk')
const pluginSdkPath = path.join(pluginSdkRoot, 'dist', 'index.js')
const pluginSdkRealRoot = await realpath(pluginSdkRoot)
const sharedPath = path.join(pluginSdkRealRoot, '..', 'shared', 'dist', 'index.js')
const { createTestHarness } = await import(pathToFileURL(pluginSdkPath).href)
const { pluginManifestV1Schema } = await import(pathToFileURL(sharedPath).href)

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

if (!Array.isArray(manifest.tools) || manifest.tools.length !== 1 || manifest.tools[0].name !== 'email') {
  throw new Error('Manifest must declare exactly one Paperclip tool named email.')
}

if (!manifest.capabilities.includes('agent.tools.register')) {
  throw new Error('Manifest must request agent.tools.register for the email tool.')
}

if (typeof workerModule.createAgentTeamEmailPaperclipPlugin !== 'function') {
  throw new Error('Worker bundle does not export createAgentTeamEmailPaperclipPlugin.')
}

if (typeof workerModule.createEmailToolHandler !== 'function') {
  throw new Error('Worker bundle does not export createEmailToolHandler.')
}

const cliCommand = workerModule.buildAgentTeamEmailCliCommand({ command: 'at-email', args: ['--profile', 'paperclip'] })
if (cliCommand.command !== 'at-email') {
  throw new Error('CLI wrapper must preserve the command separately from args.')
}
if (JSON.stringify(cliCommand.args) !== JSON.stringify(['--profile', 'paperclip', 'paperclip-tool', '--json'])) {
  throw new Error(`CLI wrapper must build an argument array, got ${JSON.stringify(cliCommand.args)}.`)
}

let invokedEnvelope = null
const pluginWithFakeCli = workerModule.createAgentTeamEmailPaperclipPlugin({
  runCli: async (envelope) => {
    invokedEnvelope = envelope
    return {
      content: `operation ${envelope.operation}`,
      data: {
        agentId: envelope.context.agentId,
        operation: envelope.operation
      }
    }
  }
})
const harness = createTestHarness({
  manifest,
  config: {
    serviceBaseUrl: 'https://app.agentteam.email'
  }
})
await pluginWithFakeCli.definition.setup(harness.ctx)

const oauthConnect = await harness.performAction(
  'start-oauth-connect',
  { serviceBaseUrl: 'https://app.agentteam.email' },
  {
    actor: { type: 'user', userId: 'paperclip-user-1' },
    companyId: 'paperclip-company-1'
  }
)
if (!oauthConnect.ok || typeof oauthConnect.connectUrl !== 'string') {
  throw new Error(`OAuth connect action must return a service-owned URL, got ${JSON.stringify(oauthConnect)}`)
}
const oauthConnectUrl = new URL(oauthConnect.connectUrl)
if (
  oauthConnectUrl.origin !== 'https://app.agentteam.email' ||
  oauthConnectUrl.pathname !== '/settings/agent-access/' ||
  oauthConnectUrl.searchParams.get('source') !== 'paperclip' ||
  oauthConnectUrl.searchParams.get('paperclip_company_id') !== 'paperclip-company-1' ||
  oauthConnectUrl.searchParams.get('paperclip_plugin_id') !== 'agentteam.paperclip-email-plugin'
) {
  throw new Error(`OAuth connect URL did not preserve the expected safe context: ${oauthConnect.connectUrl}`)
}
if (/token|secret|key/iu.test(oauthConnect.connectUrl)) {
  throw new Error(`OAuth connect URL must not expose credentials: ${oauthConnect.connectUrl}`)
}

let invalidCliInvoked = false
const invalidPlugin = workerModule.createAgentTeamEmailPaperclipPlugin({
  runCli: async () => {
    invalidCliInvoked = true
    return { content: 'unexpected' }
  }
})
const invalidHarness = createTestHarness({ manifest })
await invalidPlugin.definition.setup(invalidHarness.ctx)
const invalidSend = await invalidHarness.executeTool('email', { operation: 'send', to: ['user@example.test'] })
if (!invalidSend.error || invalidCliInvoked) {
  throw new Error('Email tool must reject invalid operation arguments before invoking the CLI.')
}

const invalidProvision = await invalidHarness.executeTool('email', { operation: 'provision' })
if (!invalidProvision.error || invalidCliInvoked) {
  throw new Error('Email tool must reject provisioning without a mailbox before invoking the CLI.')
}

const spoofedAgent = await invalidHarness.executeTool('email', { agentId: 'attacker-agent', operation: 'status' })
if (!spoofedAgent.error || invalidCliInvoked) {
  throw new Error('Email tool must reject agent-supplied agent identifiers before invoking the CLI.')
}

const provision = await harness.executeTool(
  'email',
  { dryRun: true, mailbox: 'new-agent@example.test', name: 'New Agent', operation: 'provision' },
  {
    agentId: 'paperclip-agent-1',
    companyId: 'paperclip-company-1',
    projectId: 'paperclip-project-1',
    runId: 'paperclip-run-1'
  }
)
if (provision.error || invokedEnvelope?.operation !== 'provision') {
  throw new Error(`Email tool did not invoke provisioning correctly: ${JSON.stringify(provision)}`)
}
if (
  invokedEnvelope.parameters.mailbox !== 'new-agent@example.test' ||
  invokedEnvelope.parameters.name !== 'New Agent' ||
  invokedEnvelope.parameters.dryRun !== true
) {
  throw new Error(`Email tool provisioning envelope was not preserved: ${JSON.stringify(invokedEnvelope)}`)
}

const status = await harness.executeTool(
  'email',
  { operation: 'status' },
  {
    agentId: 'paperclip-agent-1',
    companyId: 'paperclip-company-1',
    projectId: 'paperclip-project-1',
    runId: 'paperclip-run-1'
  }
)
if (status.error || status.content !== 'operation status') {
  throw new Error(`Email tool did not return successful CLI output: ${JSON.stringify(status)}`)
}
if (invokedEnvelope?.context?.agentId !== 'paperclip-agent-1') {
  throw new Error('Email tool must pass Paperclip ToolRunContext.agentId to the CLI envelope.')
}
if (invokedEnvelope.context.pluginId !== 'agentteam.paperclip-email-plugin') {
  throw new Error('Email tool envelope must include the plugin tool id.')
}
if (invokedEnvelope.schema !== 'agentteam-email.paperclip-tool.v1') {
  throw new Error('Email tool envelope schema is missing or invalid.')
}

const redacted = workerModule.mapCliOutputToToolResult({
  ok: false,
  error: 'Authorization: Bearer secret-token api_key=raw-key'
})
if (!redacted.error?.includes('[REDACTED]') || redacted.error.includes('secret-token') || redacted.error.includes('raw-key')) {
  throw new Error(`Email tool errors must be redacted, got ${JSON.stringify(redacted)}`)
}

const successScript = `
let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => { input += chunk })
process.stdin.on('end', () => {
  const envelope = JSON.parse(input)
  process.stdout.write(JSON.stringify({
    ok: true,
    content: 'Paperclip email status ready',
    data: { agentId: envelope.context.agentId, operation: envelope.operation }
  }))
})
`
const wrapperSuccess = await workerModule.runAgentTeamEmailCli(
  {
    schema: 'agentteam-email.paperclip-tool.v1',
    operation: 'status',
    context: {
      agentId: 'paperclip-agent-2',
      companyId: 'paperclip-company-1',
      pluginId: 'email',
      projectId: 'paperclip-project-1',
      runId: 'paperclip-run-2'
    },
    parameters: {}
  },
  {
    command: process.execPath,
    args: ['-e', successScript],
    timeoutMs: 5000
  }
)
if (wrapperSuccess.error || wrapperSuccess.data?.agentId !== 'paperclip-agent-2') {
  throw new Error(`CLI wrapper must map successful JSON output, got ${JSON.stringify(wrapperSuccess)}`)
}

const failureScript = `process.stderr.write('Authorization: Bearer secret-token access_token=raw-token'); process.exit(1)`
const wrapperFailure = await workerModule.runAgentTeamEmailCli(
  {
    schema: 'agentteam-email.paperclip-tool.v1',
    operation: 'status',
    context: {
      agentId: 'paperclip-agent-3',
      companyId: 'paperclip-company-1',
      pluginId: 'email',
      projectId: 'paperclip-project-1',
      runId: 'paperclip-run-3'
    },
    parameters: {}
  },
  {
    command: process.execPath,
    args: ['-e', failureScript],
    timeoutMs: 5000
  }
)
if (
  !wrapperFailure.error ||
  !wrapperFailure.error.includes('[REDACTED]') ||
  wrapperFailure.error.includes('secret-token') ||
  wrapperFailure.error.includes('raw-token')
) {
  throw new Error(`CLI wrapper must redact non-zero errors, got ${JSON.stringify(wrapperFailure)}`)
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
