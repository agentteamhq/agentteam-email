import crypto from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { MongoClient, UUID } from 'mongodb'
import { chromium } from 'playwright'

const packageDir = path.dirname(fileURLToPath(import.meta.url))
const runId = process.env.TEST_RUN_ID || new Date().toISOString().replaceAll(/[-:]/g, '').replace(/\..+$/, 'Z')
const runDir = path.resolve(process.env.TEST_RUN_DIR || path.join(packageDir, 'tmp', `run-${runId}`))
const logsDir = path.join(runDir, 'logs')
const reportsDir = path.join(runDir, 'reports')
const screenshotsDir = path.join(runDir, 'screenshots')

await mkdir(logsDir, { recursive: true })
await mkdir(reportsDir, { recursive: true })
await mkdir(screenshotsDir, { recursive: true })

const publicHostname = requireEnv('PUBLIC_HOSTNAME')
const databaseUrl = resolveDatabaseUrl()
const databaseName = resolveDatabaseName(databaseUrl)
const mailpitHttpUrl = normalizeBaseUrl(process.env.MAILPIT_HTTP_URL || 'http://localhost:8025')
const appBaseUrl = normalizeBaseUrl(publicHostname)
const appOrigin = new URL(appBaseUrl).origin
const testEmail =
  process.env.AGENTTEAM_EMAIL_AUTH_E2E_EMAIL ||
  `auth-e2e-${Date.now()}-${crypto.randomBytes(4).toString('hex')}@example.test`
const testPassword =
  process.env.AGENTTEAM_EMAIL_AUTH_E2E_PASSWORD || `AuthE2E-${crypto.randomBytes(12).toString('base64url')}!1`
const testName = 'Auth E2E User'
const testUsername =
  process.env.AGENTTEAM_EMAIL_AUTH_E2E_USERNAME || `authe2e${crypto.randomBytes(6).toString('hex')}`
const headless = process.env.AGENTTEAM_EMAIL_AUTH_E2E_HEADLESS !== 'false'

const logs = [
  `[auth-e2e] runDir=${runDir}`,
  `[auth-e2e] publicHostname=${appBaseUrl}`,
  `[auth-e2e] databaseUrl=${redactDatabaseUrl(databaseUrl)}`,
  `[auth-e2e] databaseName=${databaseName}`,
  `[auth-e2e] mailpitHttpUrl=${mailpitHttpUrl}`,
  `[auth-e2e] email=${testEmail}`
]
const capturedResponses = []

let browser
let context
let page
let mongoClient
let db

try {
  await waitForHttpOk(new URL('/health', appBaseUrl), 'app health')
  await waitForMailpit()

  mongoClient = new MongoClient(databaseUrl, {
    maxPoolSize: 2,
    serverSelectionTimeoutMS: 10_000
  })
  await mongoClient.connect()
  db = mongoClient.db(databaseName)

  browser = await chromium.launch({ headless })
  context = await browser.newContext({
    baseURL: appBaseUrl,
    viewport: { height: 900, width: 1280 }
  })
  page = await context.newPage()
  installPageDiagnostics(page)

  const signupStartedAt = new Date(Date.now() - 5_000)
  await signUp(page)
  await page.screenshot({ fullPage: true, path: path.join(screenshotsDir, 'signup-verification-sent.png') })

  const verificationUrl = await waitForVerificationUrl(page, signupStartedAt)
  logs.push(`[auth-e2e] verificationUrl=${redactVerificationUrl(verificationUrl)}`)

  await page.goto(verificationUrl, {
    timeout: 60_000,
    waitUntil: 'domcontentloaded'
  })
  await waitForPath(page, isAuthenticatedLandingPath, 'email verification redirect')
  await page.screenshot({ fullPage: true, path: path.join(screenshotsDir, 'email-verified-dashboard.png') })

  const verifiedSession = await getSessionFromBrowser(page)
  assert(verifiedSession?.user?.email === testEmail, 'verified web session belongs to the signed-up user')

  const stateAfterVerification = await readAuthDatabaseState(db, testEmail)
  assertProvisionedAuthState(stateAfterVerification, {
    expectedEmailVerified: true,
    expectedSessionCountAtLeast: 1,
    expectedUserEmail: testEmail
  })

  await context.clearCookies()
  await signIn(page)
  await page.screenshot({ fullPage: true, path: path.join(screenshotsDir, 'signed-in-dashboard.png') })

  const signedInSession = await getSessionFromBrowser(page)
  assert(signedInSession?.user?.email === testEmail, 'sign-in web session belongs to the verified user')

  const stateAfterSignin = await readAuthDatabaseState(db, testEmail)
  assertProvisionedAuthState(stateAfterSignin, {
    expectedEmailVerified: true,
    expectedSessionCountAtLeast: stateAfterVerification.sessionCount + 1,
    expectedUserEmail: testEmail
  })

  await writeJson(path.join(reportsDir, 'auth-state-after-verification.json'), stateAfterVerification)
  await writeJson(path.join(reportsDir, 'auth-state-after-signin.json'), stateAfterSignin)
  await writeJson(path.join(reportsDir, 'browser-session-after-verification.json'), redactSession(verifiedSession))
  await writeJson(path.join(reportsDir, 'browser-session-after-signin.json'), redactSession(signedInSession))

  logs.push('[auth-e2e] passed')
  await flushArtifacts()
} catch (error) {
  logs.push(`[auth-e2e] failed: ${error instanceof Error ? error.stack || error.message : String(error)}`)
  if (page) {
    await page.screenshot({ fullPage: true, path: path.join(screenshotsDir, 'failure.png') }).catch((screenshotError) => {
      logs.push(`[auth-e2e] failure screenshot failed: ${stringifyError(screenshotError)}`)
    })
  }
  await flushArtifacts()
  throw error
} finally {
  if (mongoClient) {
    await mongoClient.close().catch((error) => {
      logs.push(`[auth-e2e] mongo shutdown failed: ${stringifyError(error)}`)
    })
  }
  if (browser) {
    await browser.close().catch((error) => {
      logs.push(`[auth-e2e] browser shutdown failed: ${stringifyError(error)}`)
    })
  }
}

async function signUp(targetPage) {
  await targetPage.goto('/signup/', {
    timeout: 60_000,
    waitUntil: 'domcontentloaded'
  })
  const submitButton = targetPage.getByRole('button', { exact: true, name: 'Sign Up' })
  await submitButton.waitFor({ state: 'visible', timeout: 60_000 })
  await targetPage.getByLabel('Name', { exact: true }).fill(testName)
  await targetPage.getByLabel('Email', { exact: true }).fill(testEmail)
  const usernameField = targetPage.getByLabel('Username', { exact: true })
  if (await usernameField.count()) {
    await usernameField.fill(testUsername)
  }
  await targetPage.getByLabel('Password', { exact: true }).fill(testPassword)
  await targetPage.getByLabel('Confirm password', { exact: true }).fill(testPassword)
  await submitButton.click()
  await waitForPath(targetPage, isSignupCompletionPath, 'signup completion redirect')
}

async function signIn(targetPage) {
  await targetPage.goto('/signin/', {
    timeout: 60_000,
    waitUntil: 'domcontentloaded'
  })
  const submitButton = targetPage.getByRole('button', { exact: true, name: 'Sign In' })
  await submitButton.waitFor({ state: 'visible', timeout: 60_000 })
  const emailField = targetPage.getByLabel('Email', { exact: true })
  if (await emailField.count()) {
    await emailField.fill(testEmail)
  } else {
    await targetPage.getByLabel('Username', { exact: true }).fill(testEmail)
  }
  await targetPage.getByLabel('Password', { exact: true }).fill(testPassword)
  await submitButton.click()
  await waitForPath(targetPage, isAuthenticatedLandingPath, 'credential sign-in authenticated redirect')
}

async function waitForVerificationUrl(targetPage, since) {
  const deadline = Date.now() + 60_000
  let lastSeen = 'no messages matched yet'
  while (Date.now() < deadline) {
    const messagesUrl = new URL('/api/v1/messages', mailpitHttpUrl)
    messagesUrl.searchParams.set('limit', '100')
    const list = await fetchJson(messagesUrl)
    const messages = Array.isArray(list.messages) ? list.messages : []
    const matching = messages.filter((message) => {
      if (message.Subject !== 'Verify Email') {
        return false
      }
      if (message.Created && new Date(message.Created) < since) {
        return false
      }
      return Array.isArray(message.To) && message.To.some((to) => to.Address?.toLowerCase() === testEmail.toLowerCase())
    })
    lastSeen = `${messages.length} total messages, ${matching.length} matching ${testEmail}`
    for (const message of matching) {
      const detail = await fetchJson(new URL(`/api/v1/message/${message.ID}`, mailpitHttpUrl))
      const links = await extractLinksWithBrowser(targetPage, detail)
      const verificationLinks = links.filter((candidate) => isVerificationLink(candidate))
      if (verificationLinks.length > 0) {
        const verificationUrl = new URL(verificationLinks[0])
        assert(
          verificationUrl.origin === appOrigin,
          `verification email uses ${verificationUrl.origin}, expected app origin ${appOrigin}`
        )
        return verificationUrl.toString()
      }
      lastSeen = `matched message ${message.ID} but found no verify-email link`
    }
    await delay(500)
  }
  throw new Error(`timed out waiting for verification email for ${testEmail}: ${lastSeen}`)
}

async function extractLinksWithBrowser(targetPage, message) {
  const htmlLinks = await targetPage.evaluate((html) => {
    const doc = new DOMParser().parseFromString(html || '', 'text/html')
    return Array.from(doc.querySelectorAll('a[href]'), (anchor) => anchor.href)
  }, message.HTML || '')
  const textLinks = Array.from(String(message.Text || '').matchAll(/https?:\/\/[^\s<>"']+/g), (match) =>
    match[0].replace(/[),.;]+$/u, '')
  )
  return [...new Set([...htmlLinks, ...textLinks])]
}

function isVerificationLink(candidate) {
  try {
    const url = new URL(candidate)
    return url.pathname === '/rpc/auth/api/verify-email' && url.searchParams.has('token')
  } catch {
    return false
  }
}

async function getSessionFromBrowser(targetPage) {
  const response = await targetPage.evaluate(async () => {
    const sessionResponse = await fetch('/rpc/auth/api/get-session', {
      credentials: 'include',
      headers: {
        accept: 'application/json'
      }
    })
    return {
      body: await sessionResponse.text(),
      status: sessionResponse.status
    }
  })
  assert(response.status === 200, `get-session returned ${response.status}: ${response.body}`)
  return response.body ? JSON.parse(response.body) : null
}

async function readAuthDatabaseState(targetDb, email) {
  const userDocument = await targetDb.collection('user').findOne({ email })
  assert(userDocument, `expected exactly one user for ${email}, found none`)

  const userId = userDocument._id
  const accounts = await targetDb.collection('account').find({ userId }).toArray()
  const sessions = await targetDb.collection('session').find({ userId }).sort({ createdAt: 1, _id: 1 }).toArray()

  const latestSession = sessions.at(-1) ?? null

  return {
    user: normalizeUser(userDocument),
    accountCount: accounts.length,
    accounts: accounts.map(normalizeMongoDocument),
    sessionCount: sessions.length,
    latestSession: latestSession ? normalizeSession(latestSession) : null,
    sessions: sessions.map(normalizeSession)
  }
}

function normalizeUser(user) {
  return {
    id: stringifyMongoId(user._id),
    email: user.email ?? null,
    emailVerified: Boolean(user.emailVerified),
    name: user.name ?? null,
    createdAt: serializeMongoValue(user.createdAt),
    updatedAt: serializeMongoValue(user.updatedAt)
  }
}

function normalizeSession(session) {
  return {
    id: stringifyMongoId(session._id),
    userId: stringifyMongoId(session.userId),
    expiresAt: serializeMongoValue(session.expiresAt),
    createdAt: serializeMongoValue(session.createdAt),
    updatedAt: serializeMongoValue(session.updatedAt)
  }
}

function normalizeMongoDocument(document) {
  return serializeMongoValue(document)
}

function assertProvisionedAuthState(state, options) {
  assert(state.user.email === options.expectedUserEmail, `expected user email ${options.expectedUserEmail}, got ${state.user.email}`)
  assert(
    state.user.emailVerified === options.expectedEmailVerified,
    `expected emailVerified=${options.expectedEmailVerified}, got ${state.user.emailVerified}`
  )
  assert(state.accountCount >= 1, `expected at least one account, found ${state.accountCount}`)
  assert(
    state.sessionCount >= options.expectedSessionCountAtLeast,
    `expected at least ${options.expectedSessionCountAtLeast} session(s), found ${state.sessionCount}`
  )
  assert(state.latestSession, 'expected a latest session')
}

function redactSession(session) {
  return serializeMongoValue({
    session: session?.session
      ? {
          id: session.session.id ?? null,
          expiresAt: session.session.expiresAt ?? null,
          createdAt: session.session.createdAt ?? null,
          updatedAt: session.session.updatedAt ?? null
        }
      : null,
    user: session?.user
      ? {
          id: session.user.id ?? null,
          email: session.user.email ?? null,
          emailVerified: session.user.emailVerified ?? null,
          name: session.user.name ?? null
        }
      : null
  })
}

function serializeMongoValue(value) {
  if (value == null) {
    return value
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (value instanceof UUID) {
    return value.toString()
  }
  if (Array.isArray(value)) {
    return value.map(serializeMongoValue)
  }
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key === '_id' ? 'id' : key, serializeMongoValue(entry)]))
  }
  return value
}

function stringifyMongoId(value) {
  if (value instanceof UUID) {
    return value.toString()
  }
  return String(value)
}

async function waitForMailpit() {
  await waitForHttpOk(new URL('/api/v1/messages', mailpitHttpUrl), 'Mailpit API')
}

async function waitForHttpOk(url, label) {
  const deadline = Date.now() + 60_000
  let lastError = 'not attempted'
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { headers: { accept: 'application/json,text/plain,*/*' } })
      if (response.ok) {
        return
      }
      lastError = `${response.status} ${response.statusText}`
    } catch (error) {
      lastError = stringifyError(error)
    }
    await delay(500)
  }
  throw new Error(`timed out waiting for ${label} at ${url.toString()}: ${lastError}`)
}

async function fetchJson(url, init) {
  const response = await fetch(url, init)
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`GET ${url.toString()} returned ${response.status}: ${text}`)
  }
  return text ? JSON.parse(text) : null
}

async function waitForPath(targetPage, predicate, description) {
  const deadline = Date.now() + 60_000
  let currentUrl = targetPage.url()
  while (Date.now() < deadline) {
    currentUrl = targetPage.url()
    if (predicate(new URL(currentUrl))) {
      return
    }
    await delay(200)
  }
  throw new Error(`timed out waiting for ${description}; last url ${currentUrl}`)
}

function isSignupCompletionPath(url) {
  return (
    url.pathname === '/dashboard/' ||
    url.pathname === '/dashboard' ||
    url.pathname === '/settings/' ||
    url.pathname === '/settings' ||
    url.pathname === '/verification-email-sent/' ||
    url.pathname === '/verification-email-sent' ||
    isPendingVerificationSignInPath(url)
  )
}

function isPendingVerificationSignInPath(url) {
  if (url.pathname !== '/signin/' && url.pathname !== '/signin') {
    return false
  }
  const redirect = url.searchParams.get('redirect')
  return redirect === '/dashboard/' || redirect === '/dashboard'
}

function isAuthenticatedLandingPath(url) {
  return (
    url.pathname === '/dashboard/' ||
    url.pathname === '/dashboard' ||
    url.pathname === '/settings/' ||
    url.pathname === '/settings'
  )
}

function installPageDiagnostics(targetPage) {
  targetPage.on('console', (message) => {
    if (message.type() === 'error') {
      logs.push(`[browser:console:${message.type()}] ${message.text()}`)
    }
  })
  targetPage.on('pageerror', (error) => {
    logs.push(`[browser:pageerror] ${error.stack || error.message}`)
  })
  targetPage.on('response', async (response) => {
    const url = response.url()
    if (!url.startsWith(appOrigin)) {
      return
    }
    if (response.status() < 400) {
      return
    }
    capturedResponses.push({
      body: await response.text().catch(() => '<unavailable>'),
      status: response.status(),
      url
    })
  })
}

async function flushArtifacts() {
  await writeFile(path.join(logsDir, 'auth-e2e.log'), `${logs.join('\n')}\n`)
  await writeJson(path.join(reportsDir, 'http-errors.json'), capturedResponses)
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required`)
  }
  return value
}

function resolveDatabaseUrl() {
  const configuredUrl = process.env.AGENTTEAM_EMAIL_DEV_DATABASE_URL || process.env.MONGODB_URI || process.env.DATABASE_URL
  if (!configuredUrl) {
    return 'mongodb://localhost:27017/agentteam_email'
  }
  if (!configuredUrl.startsWith('mongodb://') && !configuredUrl.startsWith('mongodb+srv://')) {
    throw new Error(`MongoDB connection string expected; got ${redactDatabaseUrl(configuredUrl)}`)
  }
  return configuredUrl
}

function resolveDatabaseName(urlString) {
  const configuredName = process.env.MONGODB_DATABASE || process.env.DATABASE_NAME
  if (configuredName) {
    return configuredName
  }
  try {
    const parsed = new URL(urlString)
    const databasePath = parsed.pathname.replace(/^\/+/u, '').split('/')[0]
    return databasePath || 'agentteam_email'
  } catch {
    return 'agentteam_email'
  }
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/u, '')
}

function redactDatabaseUrl(value) {
  try {
    const url = new URL(value)
    if (url.password) {
      url.password = '***'
    }
    return url.toString()
  } catch {
    return '<invalid-url>'
  }
}

function redactVerificationUrl(value) {
  try {
    const url = new URL(value)
    if (url.searchParams.has('token')) {
      url.searchParams.set('token', '***')
    }
    return url.toString()
  } catch {
    return '<invalid-url>'
  }
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function stringifyError(error) {
  return error instanceof Error ? error.stack || error.message : String(error)
}
