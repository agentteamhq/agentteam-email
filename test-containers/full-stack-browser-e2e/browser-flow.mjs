import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { AwsClient } from 'aws4fetch'
import { chromium } from 'playwright'
import { v7 as uuidv7 } from 'uuid'

const runId = requireEnv('TEST_RUN_ID')
const runDir = requireEnv('TEST_RUN_DIR')
const appBaseUrl = trimTrailingSlash(requireEnv('APP_BASE_URL'))
const mailpitUrl = trimTrailingSlash(requireEnv('MAILPIT_URL'))
const minioUrl = trimTrailingSlash(requireEnv('MINIO_URL'))
const archiveBucket = requireEnv('ARCHIVE_BUCKET')
const adminEmail = requireEnv('ADMIN_EMAIL')
const adminPassword = requireEnv('ADMIN_PASSWORD')
const userEmail = requireEnv('USER_EMAIL')
const userName = requireEnv('USER_NAME')
const userPassword = requireEnv('USER_PASSWORD')
const userUsername = requireEnv('USER_USERNAME')
const mailboxLocalPart = requireEnv('MAILBOX_LOCAL_PART')
const mailboxDisplayName = requireEnv('MAILBOX_DISPLAY_NAME')
const inboundSubject = requireEnv('INBOUND_SUBJECT')
const scenarioSlug = 'full-product-walkthrough'
const scenarioDir = path.join(runDir, 'scenarios', scenarioSlug)
const screenshotsDir = path.join(scenarioDir, 'screenshots')
const videosDir = path.join(scenarioDir, 'videos')
const reportsDir = path.join(runDir, 'reports')
const diagnosticsDir = path.join(runDir, 'diagnostics')
const scenarioLogPath = path.join(scenarioDir, 'scenario.log')
const browserConsoleJsonlPath = path.join(diagnosticsDir, 'browser-console.jsonl')
const browserNetworkJsonlPath = path.join(diagnosticsDir, 'browser-network.jsonl')
const videoPath = path.join(videosDir, `${scenarioSlug}.webm`)
const s3Client = new AwsClient({
  accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
  secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
  service: 's3',
  region: process.env.R2_REGION || 'us-east-1'
})
const consoleEvents = []
const networkEvents = []
const requestFailures = []
const cues = []
const startedAt = Date.now()
const attachedPages = new WeakSet()
const pendingDiagnosticWrites = new Set()
const recordingPacing = {
  actionOverlayMs: readNonNegativeIntegerEnv('AT_EMAIL_ADMIN_BROWSER_E2E_ACTION_OVERLAY_MS', 500),
  formBlankPreviewMs: readNonNegativeIntegerEnv('AT_EMAIL_ADMIN_BROWSER_E2E_FORM_BLANK_PREVIEW_MS', 350),
  formFilledPreviewMs: readNonNegativeIntegerEnv('AT_EMAIL_ADMIN_BROWSER_E2E_FORM_FILLED_PREVIEW_MS', 700),
  preClickPreviewMs: readNonNegativeIntegerEnv('AT_EMAIL_ADMIN_BROWSER_E2E_PRE_CLICK_PREVIEW_MS', 150),
  slowMoMs: readNonNegativeIntegerEnv('AT_EMAIL_ADMIN_BROWSER_E2E_SLOW_MO_MS', 10)
}

await mkdir(screenshotsDir, { recursive: true })
await mkdir(videosDir, { recursive: true })
await mkdir(reportsDir, { recursive: true })
await mkdir(diagnosticsDir, { recursive: true })
await writeScenarioLog(`scenario=${scenarioSlug}`)
await writeJson(path.join(diagnosticsDir, 'browser-recording-settings.json'), recordingPacing)

let browser
let context
let page
let screencastStarted = false
let verificationUrl

try {
  browser = await chromium.launch({
    args: ['--no-sandbox'],
    headless: true,
    slowMo: recordingPacing.slowMoMs
  })
  context = await browser.newContext({
    baseURL: appBaseUrl,
    viewport: { height: 900, width: 1280 }
  })
  context.on('page', attachPageDiagnostics)
  page = await context.newPage()
  attachPageDiagnostics(page)
  await page.screencast.start({
    path: videoPath,
    size: { height: 900, width: 1280 }
  })
  screencastStarted = true
  await page.screencast.showActions({
    cursor: 'pointer',
    duration: recordingPacing.actionOverlayMs,
    fontSize: 14,
    position: 'top-right'
  })

  await step('Open the first-admin setup screen.', async () => {
    await page.goto('/admin/setup/', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { exact: true, name: 'Set up instance' }).waitFor({ timeout: 60_000 })
  })

  await step('Create the first instance administrator.', async () => {
    await previewEmptyForm('first-admin setup form')
    await page.getByLabel('Admin email', { exact: true }).fill(adminEmail)
    await page.getByLabel('Admin password', { exact: true }).fill(adminPassword)
    await page.getByLabel('Confirm admin password', { exact: true }).fill(adminPassword)
    await previewFilledForm('first-admin setup form')
    await clickForVideo(page.getByRole('button', { exact: true, name: 'Set up instance' }))
    await page.waitForURL((url) => ['/signin', '/signin/', '/signup', '/signup/'].includes(url.pathname), {
      timeout: 60_000
    })
  })

  await step('Sign up a workspace user with email and password.', async () => {
    await page.goto('/signup/', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { exact: true, name: 'Sign Up' }).waitFor({ timeout: 60_000 })
    await previewEmptyForm('workspace signup form')
    await page.getByLabel('Name', { exact: true }).fill(userName)
    await page.getByLabel('Email', { exact: true }).fill(userEmail)
    const usernameField = page.getByLabel('Username', { exact: true })
    if ((await usernameField.count()) > 0) {
      await usernameField.fill(userUsername)
    }
    await page.getByLabel('Password', { exact: true }).fill(userPassword)
    await page.getByLabel('Confirm password', { exact: true }).fill(userPassword)
    await previewFilledForm('workspace signup form')
    await clickForVideo(page.getByRole('button', { exact: true, name: 'Sign Up' }))
    await page.getByText('Verify your email', { exact: true }).waitFor({ timeout: 60_000 })
  })

  await step('Open Mailpit and inspect the verification email.', async () => {
    verificationUrl = await waitForVerificationUrl()
    await page.goto(mailpitUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
    await page
      .getByText(userEmail)
      .first()
      .waitFor({ timeout: 30_000 })
      .catch(() => {})
  })

  await step('Follow the verification link and land in the dashboard.', async () => {
    assert(verificationUrl, 'verification URL was not captured')
    await page.goto(verificationUrl, { waitUntil: 'domcontentloaded' })
    await waitForDashboard()
  })

  await step('Start Cloudflare connection from the onboarding card.', async () => {
    await clickForVideo(page.getByRole('button', { name: /Continue with Cloudflare/u }))
    await page.getByRole('button', { name: 'Authorize AgentTeam Email' }).waitFor({ timeout: 60_000 })
  })

  await step('Approve the fake Cloudflare OAuth request.', async () => {
    await clickForVideo(page.getByRole('button', { name: 'Authorize AgentTeam Email' }))
    await waitForAnyButton([/Load Cloudflare domains/u, /Adopt example\.test/u, /Create mailbox/u], 120_000)
  })

  await step('Provision the Cloudflare domain from the dashboard.', async () => {
    const loadDomains = page.getByRole('button', { name: 'Load Cloudflare domains' })
    if (await isVisible(loadDomains, 5_000)) {
      await clickForVideo(loadDomains)
      await page.getByRole('button', { name: /Adopt example\.test/u }).waitFor({ timeout: 60_000 })
    }
    const adoptDomain = page.getByRole('button', { name: /Adopt example\.test/u })
    if (await isVisible(adoptDomain, 5_000)) {
      await clickForVideo(adoptDomain)
    }
    await page.getByRole('button', { exact: true, name: 'Create mailbox' }).waitFor({ timeout: 120_000 })
  })

  await step('Create the first mailbox for the provisioned domain.', async () => {
    await previewEmptyForm('mailbox creation form')
    await page.getByLabel('Mailbox local part', { exact: true }).fill(mailboxLocalPart)
    await page.getByLabel('Display name', { exact: true }).fill(mailboxDisplayName)
    await previewFilledForm('mailbox creation form')
    await clickForVideo(page.getByRole('button', { exact: true, name: 'Create mailbox' }))
    await page.getByRole('button', { exact: true, name: 'Compose' }).waitFor({ timeout: 120_000 })
  })

  await step('Send an outbound message from the new mailbox.', async () => {
    await clickForVideo(page.getByRole('button', { exact: true, name: 'Compose' }))
    await page.getByLabel('To', { exact: true }).waitFor({ timeout: 60_000 })
    await previewEmptyForm('compose message form')
    await page.getByLabel('To', { exact: true }).fill('recipient@example.net')
    await page.getByLabel('Subject', { exact: true }).fill(`Browser E2E outbound ${runId}`)
    await page.getByLabel('Body', { exact: true }).fill('Outbound message from the recorded browser E2E run.')
    await previewFilledForm('compose message form')
    await clickForVideo(page.getByRole('button', { exact: true, name: 'Send' }))
    await page.getByRole('button', { exact: true, name: 'Compose' }).waitFor({ timeout: 60_000 })
  })

  await step('Inject a signed inbound Cloudflare Email notification.', async () => {
    await deliverInboundMessage()
  })

  await step('Refresh the mailbox and verify the inbound message appears.', async () => {
    await page.goto('/dashboard/', { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { exact: true, name: inboundSubject }).waitFor({ timeout: 120_000 })
  })

  assertNoBlockingBrowserDiagnostics()
  await writeSummary('passed')
} catch (error) {
  await writeSummary('failed', stringifyError(error))
  throw error
} finally {
  await flushPendingDiagnosticWrites()
  await writeJson(path.join(diagnosticsDir, 'browser-console.json'), consoleEvents)
  await writeJson(path.join(diagnosticsDir, 'browser-network.json'), networkEvents)
  await writeJson(path.join(diagnosticsDir, 'browser-request-failures.json'), requestFailures)
  await writeBrowserDiagnosticsSummary()
  await writeJson(path.join(scenarioDir, 'steps.json'), cues)
  if (screencastStarted && page) {
    await page.screencast.stop().catch(async (error) => {
      await writeScenarioLog(`screencast stop failed: ${stringifyError(error)}`)
    })
    await writeFile(path.join(videosDir, `${scenarioSlug}.vtt`), renderWebVtt(cues))
  }
  if (context) {
    await context.close().catch(() => {})
  }
  if (browser) {
    await browser.close().catch(() => {})
  }
}

async function step(label, action) {
  const started = Date.now()
  await writeScenarioLog(`step start: ${label}`)
  const heartbeat = startHeartbeat(label)
  try {
    await action()
  } finally {
    await heartbeat.stop()
  }
  await page.screenshot({
    fullPage: true,
    path: path.join(screenshotsDir, `${String(cues.length + 1).padStart(2, '0')}-${slug(label)}.png`)
  })
  const ended = Date.now()
  cues.push({
    endMs: ended - startedAt,
    label,
    startMs: started - startedAt
  })
  await writeScenarioLog(`step done: ${label}`)
}

async function previewEmptyForm(label) {
  await holdForRecording(`recording preview: empty ${label}`, recordingPacing.formBlankPreviewMs)
}

async function previewFilledForm(label) {
  await holdForRecording(`recording preview: filled ${label}`, recordingPacing.formFilledPreviewMs)
}

async function clickForVideo(locator, options) {
  const target = locator.first()
  await target.scrollIntoViewIfNeeded()
  await target.hover()
  await holdForRecording('recording preview: pre-click hover', recordingPacing.preClickPreviewMs)
  await target.click({ delay: 80, ...options })
}

async function holdForRecording(label, ms) {
  if (ms <= 0) {
    return
  }
  await writeScenarioLog(`${label} ${ms}ms`)
  await page.waitForTimeout(ms)
}

function startHeartbeat(label) {
  const started = Date.now()
  const timer = setInterval(() => {
    const elapsedSeconds = Math.round((Date.now() - started) / 1000)
    void writeScenarioLog(`step heartbeat: ${label} elapsed=${elapsedSeconds}s`)
  }, 15_000)
  timer.unref?.()
  return {
    async stop() {
      clearInterval(timer)
    }
  }
}

function attachPageDiagnostics(targetPage) {
  if (attachedPages.has(targetPage)) {
    return
  }
  attachedPages.add(targetPage)

  targetPage.on('console', (message) => {
    trackDiagnosticWrite(
      recordConsoleEvent({
        at: new Date().toISOString(),
        location: message.location(),
        text: message.text(),
        type: message.type(),
        url: targetPage.url()
      })
    )
  })
  targetPage.on('pageerror', (error) => {
    trackDiagnosticWrite(
      recordConsoleEvent({
        at: new Date().toISOString(),
        text: stringifyError(error),
        type: 'pageerror',
        url: targetPage.url()
      })
    )
  })
  targetPage.on('requestfailed', (request) => {
    const event = {
      at: new Date().toISOString(),
      failure: request.failure()?.errorText ?? '',
      kind: 'requestfailed',
      method: request.method(),
      resourceType: request.resourceType(),
      url: sanitizeUrl(request.url())
    }
    requestFailures.push(event)
    trackDiagnosticWrite(recordNetworkEvent(event))
  })
  targetPage.on('response', (response) => {
    if (response.status() < 400) {
      return
    }
    trackDiagnosticWrite(
      recordNetworkEvent({
        at: new Date().toISOString(),
        kind: 'http-response',
        method: response.request().method(),
        resourceType: response.request().resourceType(),
        status: response.status(),
        statusText: response.statusText(),
        url: sanitizeUrl(response.url())
      })
    )
  })
}

async function recordConsoleEvent(event) {
  consoleEvents.push(event)
  await appendJsonl(browserConsoleJsonlPath, event)
  if (['error', 'warning', 'pageerror'].includes(event.type)) {
    await writeScenarioLog(`browser console ${event.type}: ${event.text}`)
  }
}

async function recordNetworkEvent(event) {
  networkEvents.push(event)
  await appendJsonl(browserNetworkJsonlPath, event)
  const statusLabel = event.status ? ` status=${event.status}` : ''
  const failureLabel = event.failure ? ` failure=${event.failure}` : ''
  await writeScenarioLog(
    `browser network ${event.kind}:${statusLabel}${failureLabel} ${event.method} ${event.url}`
  )
}

function trackDiagnosticWrite(promise) {
  const tracked = promise
    .catch((error) => {
      process.stderr.write(`[browser-flow] diagnostic write failed: ${stringifyError(error)}\n`)
    })
    .finally(() => {
      pendingDiagnosticWrites.delete(tracked)
    })
  pendingDiagnosticWrites.add(tracked)
}

async function flushPendingDiagnosticWrites() {
  while (pendingDiagnosticWrites.size > 0) {
    await Promise.allSettled([...pendingDiagnosticWrites])
  }
}

async function waitForDashboard() {
  await page.waitForURL((url) => url.pathname === '/dashboard/' || url.pathname === '/dashboard', {
    timeout: 90_000
  })
  await waitForAnyButton(
    [/Continue with Cloudflare/u, /Load Cloudflare domains/u, /Adopt example\.test/u],
    90_000
  )
}

async function waitForAnyButton(patterns, timeout) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    for (const pattern of patterns) {
      const locator = page.getByRole('button', { name: pattern })
      if (await isVisible(locator, 250)) {
        return locator
      }
    }
    await page.waitForTimeout(250)
  }
  throw new Error(`timed out waiting for one of: ${patterns.map(String).join(', ')}`)
}

async function isVisible(locator, timeout) {
  try {
    await locator.first().waitFor({ state: 'visible', timeout })
    return true
  } catch {
    return false
  }
}

async function waitForVerificationUrl() {
  const deadline = Date.now() + 90_000
  let lastSeen = 'no messages yet'
  while (Date.now() < deadline) {
    const messagesUrl = new URL('/api/v1/messages', mailpitUrl)
    messagesUrl.searchParams.set('limit', '100')
    const list = await fetchJson(messagesUrl)
    const messages = Array.isArray(list.messages) ? list.messages : []
    const matching = messages.filter(
      (message) =>
        String(message.Subject || '') === 'Verify Email' &&
        Array.isArray(message.To) &&
        message.To.some((recipient) => recipient.Address?.toLowerCase() === userEmail.toLowerCase())
    )
    lastSeen = `${messages.length} total messages, ${matching.length} matching verification messages`
    for (const message of matching) {
      const detail = await fetchJson(new URL(`/api/v1/message/${message.ID}`, mailpitUrl))
      const links = await extractLinks(detail)
      const verificationLinks = links.filter((candidate) => {
        try {
          const url = new URL(candidate)
          return url.origin === appBaseUrl && url.pathname.includes('verify')
        } catch {
          return false
        }
      })
      if (verificationLinks.length > 0) {
        return verificationLinks[0]
      }
      lastSeen = `message ${message.ID} did not include a verification link`
    }
    await delay(750)
  }
  throw new Error(`timed out waiting for verification email: ${lastSeen}`)
}

async function extractLinks(message) {
  const html = message.HTML || message.Html || message.html || ''
  const text = message.Text || message.text || ''
  const htmlLinks = html
    ? await page.evaluate((markup) => {
        const doc = new DOMParser().parseFromString(markup, 'text/html')
        return [...doc.querySelectorAll('a[href]')].map((anchor) => anchor.href)
      }, html)
    : []
  const textLinks = [...String(text).matchAll(/https?:\/\/[^\s"'<>]+/gu)].map((match) => match[0])
  return [...htmlLinks, ...textLinks]
}

async function deliverInboundMessage() {
  await ensureArchiveBucket()
  const worker = await loadProvisionedWorker('example.test')
  const receivedAt = new Date().toISOString()
  const ingestId = uuidv7({ msecs: new Date(receivedAt).getTime() })
  const archivePrefix = `${worker.archivePrefix}/${receivedAt.slice(0, 10).replaceAll('-', '/')}/${ingestId}`
  const rawKey = `${archivePrefix}/raw.eml`
  const edgeKey = `${archivePrefix}/edge.json`
  const resultKey = `${archivePrefix}/result.json`
  const messageId = `<${ingestId}@example.test>`
  const rawMessage = [
    'From: Sender <sender@example.net>',
    `To: ${mailboxDisplayName} <${mailboxLocalPart}@example.test>`,
    `Message-ID: ${messageId}`,
    `Subject: ${inboundSubject}`,
    '',
    'Inbound message from the recorded browser E2E run.'
  ].join('\r\n')
  const edgeManifest = {
    schema: 'agent-mail.inbound.edge.v1',
    ingest_id: ingestId,
    org_public_id: worker.organizationPublicId,
    archive_prefix: worker.archivePrefix,
    connection_id: worker.connectionId,
    domain_id: worker.domainId,
    domain: 'example.test',
    raw_key: rawKey,
    edge_key: edgeKey,
    result_key: resultKey,
    mailbox: `${mailboxLocalPart}@example.test`,
    envelope_from: 'sender@example.net',
    envelope_to: `${mailboxLocalPart}@example.test`,
    recipient_domain: 'example.test',
    cloudflare_zone_name: 'example.test',
    worker_name: 'agent-mail-ingress',
    received_at: receivedAt,
    message_id: messageId,
    atmcf_headers: {
      'X-ATMCF-Edge-Action': 'worker',
      'X-ATMCF-Edge-Envelope-From': 'sender@example.net',
      'X-ATMCF-Edge-Envelope-To': `${mailboxLocalPart}@example.test`,
      'X-ATMCF-Edge-Message-ID': messageId,
      'X-ATMCF-Edge-Received-At': receivedAt,
      'X-ATMCF-Edge-Status': 'received'
    },
    raw_sha256: sha256Hex(rawMessage)
  }
  await s3PutObject(rawKey, rawMessage, 'message/rfc822')
  await s3PutObject(edgeKey, `${JSON.stringify(edgeManifest, null, 2)}\n`, 'application/json')
  await writeJson(path.join(diagnosticsDir, 'inbound-edge.json'), edgeManifest)

  const notification = {
    schema: 'agent-mail.inbound.ingest.v1',
    ingest_id: ingestId,
    organization_public_id: worker.organizationPublicId,
    archive_prefix: worker.archivePrefix,
    worker_connection_id: worker.connectionId,
    worker_domain_deployment_id: worker.domainId,
    recipient_domain: 'example.test',
    raw_key: rawKey,
    edge_key: edgeKey,
    result_key: resultKey,
    received_at: receivedAt,
    raw_sha256: sha256Hex(rawMessage)
  }
  const bodyText = JSON.stringify(notification)
  const signed = await fetchJson('http://fake-cloudflare:8788/__sign-worker-notification', {
    body: JSON.stringify({
      bodyText,
      domain: 'example.test',
      timestamp: String(Math.floor(Date.now() / 1000)),
      webhookId: ingestId
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST'
  })
  const response = await fetch(
    `${appBaseUrl}/rpc/agent-mail/ingest/v1/${encodeURIComponent(worker.connectionId)}`,
    {
      body: bodyText,
      headers: {
        'content-type': 'application/json',
        ...signed.headers
      },
      method: 'POST'
    }
  )
  const responseText = await response.text()
  await writeFile(path.join(diagnosticsDir, 'inbound-notification-response.txt'), responseText)
  assert(
    response.status >= 200 && response.status < 300,
    `inbound notification returned ${response.status}: ${responseText.slice(0, 500)}`
  )
  const result = await retry(
    async () => {
      const text = await s3GetObject(resultKey)
      return JSON.parse(text)
    },
    { attempts: 24, delayMs: 2500, description: 'inbound result.json delivery proof' }
  )
  assert.equal(result.status, 'delivered')
  await writeJson(path.join(diagnosticsDir, 'inbound-result.json'), result)
}

async function loadProvisionedWorker(domain) {
  const cloudflare = await fetchJson('http://fake-cloudflare:8788/__requests')
  for (const script of Object.values(cloudflare.scripts || {})) {
    const bindings = Object.fromEntries(
      (script.metadata?.bindings || [])
        .filter((binding) => typeof binding.name === 'string' && typeof binding.text === 'string')
        .map((binding) => [binding.name, binding.text])
    )
    if (bindings.AGENTTEAM_DOMAIN !== domain) {
      continue
    }
    return {
      archivePrefix: bindings.AGENTTEAM_ARCHIVE_PREFIX,
      connectionId: bindings.AGENTTEAM_CONNECTION_ID,
      domain,
      domainId: bindings.AGENTTEAM_DOMAIN_ID,
      organizationPublicId: bindings.AGENTTEAM_ORG_PUBLIC_ID
    }
  }
  throw new Error(`missing provisioned worker metadata for ${domain}`)
}

async function ensureArchiveBucket() {
  const response = await s3Fetch({ key: '', method: 'PUT' })
  assert(
    response.status === 200 || response.status === 409,
    `archive bucket create returned ${response.status}: ${(await response.text()).slice(0, 500)}`
  )
}

async function s3PutObject(key, body, contentType) {
  const response = await s3Fetch({ body, contentType, key, method: 'PUT' })
  assert(
    response.status >= 200 && response.status < 300,
    `S3 PUT ${key} returned ${response.status}: ${(await response.text()).slice(0, 500)}`
  )
}

async function s3GetObject(key) {
  const response = await s3Fetch({ key, method: 'GET' })
  const bodyText = await response.text()
  assert(response.status === 200, `S3 GET ${key} returned ${response.status}: ${bodyText.slice(0, 500)}`)
  return bodyText
}

async function s3Fetch({ body = '', contentType, key, method }) {
  const url = new URL(`${minioUrl}/${archiveBucket}${key ? `/${key}` : ''}`)
  const headers = contentType ? { 'content-type': contentType } : {}
  const signedRequest = await s3Client.sign(url, {
    body: method === 'GET' || method === 'HEAD' ? undefined : body,
    headers,
    method
  })
  return fetch(signedRequest)
}

function assertNoBlockingBrowserDiagnostics() {
  const blockingDiagnostics = blockingBrowserDiagnostics()
  assert.equal(
    blockingDiagnostics.length,
    0,
    `blocking browser diagnostics: ${blockingDiagnostics.map(describeBrowserDiagnostic).join(' | ')}`
  )
}

async function writeSummary(status, error) {
  await writeJson(path.join(reportsDir, 'browser-flow-summary.json'), {
    consoleEventCount: consoleEvents.length,
    cues,
    error,
    networkEventCount: networkEvents.length,
    requestFailureCount: requestFailures.length,
    status,
    userEmail
  })
}

async function writeBrowserDiagnosticsSummary() {
  const consoleByType = countBy(consoleEvents, (event) => event.type)
  const networkByKind = countBy(networkEvents, (event) => event.kind)
  const httpStatusCounts = countBy(
    networkEvents.filter((event) => event.kind === 'http-response'),
    (event) => String(event.status)
  )
  await writeJson(path.join(reportsDir, 'browser-diagnostics-summary.json'), {
    blockingDiagnosticCount: blockingBrowserDiagnostics().length,
    consoleByType,
    consoleEventCount: consoleEvents.length,
    httpStatusCounts,
    networkByKind,
    networkEventCount: networkEvents.length,
    requestFailureCount: requestFailures.length
  })
}

function blockingBrowserDiagnostics() {
  const consoleErrors = consoleEvents.filter((event) => event.type === 'pageerror' || event.type === 'error')
  const hydrationWarnings = consoleEvents.filter(
    (event) =>
      event.type === 'warning' &&
      /Hydration failed|hydration|Minified React error|React has detected/iu.test(event.text)
  )
  const failedRequests = networkEvents.filter((event) => event.kind === 'requestfailed')
  const failedResponses = networkEvents.filter(
    (event) =>
      event.kind === 'http-response' && (event.status >= 500 || (event.status >= 400 && isAppUrl(event.url)))
  )
  return [...consoleErrors, ...hydrationWarnings, ...failedRequests, ...failedResponses]
}

function describeBrowserDiagnostic(event) {
  if (event.kind) {
    return `${event.kind} ${event.status || event.failure || ''} ${event.method || ''} ${event.url || ''}`.trim()
  }
  return `${event.type}: ${event.text || ''}`.trim()
}

function isAppUrl(value) {
  try {
    return new URL(value).origin === appBaseUrl
  } catch {
    return false
  }
}

function countBy(values, keyFn) {
  const counts = {}
  for (const value of values) {
    const key = keyFn(value) || 'unknown'
    counts[key] = (counts[key] || 0) + 1
  }
  return counts
}

async function writeScenarioLog(message) {
  const line = `[browser-flow] ${new Date().toISOString()} ${message}`
  console.log(line)
  await writeFile(scenarioLogPath, `${line}\n`, {
    flag: 'a'
  })
}

async function appendJsonl(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await appendFile(filePath, `${JSON.stringify(value)}\n`)
}

function sanitizeUrl(value) {
  try {
    const url = new URL(value)
    for (const key of [...url.searchParams.keys()]) {
      if (/token|secret|password|code|state|key|auth|session|jwt/iu.test(key)) {
        url.searchParams.set(key, '<redacted>')
      }
    }
    return url.toString()
  } catch {
    return String(value)
  }
}

async function fetchJson(url, init) {
  const response = await fetch(url, {
    headers: { accept: 'application/json', ...(init?.headers || {}) },
    ...init
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(
      `${init?.method || 'GET'} ${url.toString()} returned ${response.status}: ${text.slice(0, 500)}`
    )
  }
  return text ? JSON.parse(text) : null
}

async function retry(callback, { attempts, delayMs, description }) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await callback()
    } catch (error) {
      lastError = error
      await delay(delayMs)
    }
  }
  throw new Error(`${description} failed after ${attempts} attempts: ${stringifyError(lastError)}`)
}

function renderWebVtt(steps) {
  return `WEBVTT\n\n${steps
    .map((cue) => `${formatVttTime(cue.startMs)} --> ${formatVttTime(cue.endMs)}\n${cue.label}`)
    .join('\n\n')}\n`
}

function formatVttTime(ms) {
  const safeMs = Math.max(0, Math.floor(ms))
  const hours = Math.floor(safeMs / 3_600_000)
  const minutes = Math.floor((safeMs % 3_600_000) / 60_000)
  const seconds = Math.floor((safeMs % 60_000) / 1000)
  const milliseconds = safeMs % 1000
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${String(milliseconds).padStart(3, '0')}`
}

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex')
}

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`missing ${name}`)
  }
  return value
}

function readNonNegativeIntegerEnv(name, defaultValue) {
  const rawValue = process.env[name]
  if (rawValue === undefined || rawValue === '') {
    return defaultValue
  }
  const value = Number(rawValue)
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`)
  }
  return value
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/u, '')
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 48)
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function stringifyError(error) {
  return error instanceof Error ? error.stack || error.message : String(error)
}
