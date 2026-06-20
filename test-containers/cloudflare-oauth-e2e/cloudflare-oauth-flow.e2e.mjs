import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageDir = path.dirname(fileURLToPath(import.meta.url))
const runId = process.env.TEST_RUN_ID || new Date().toISOString().replaceAll(/[-:]/g, '').replace(/\..+$/, 'Z')
const runDir = path.resolve(process.env.TEST_RUN_DIR || path.join(packageDir, 'tmp', `run-${runId}`))
const reportsDir = path.join(runDir, 'reports')
const logsDir = path.join(runDir, 'logs')
const hostPort = Number(process.env.AGENTTEAM_EMAIL_CLOUDFLARE_FAKE_OAUTH_HOST_PORT || '18788')
const baseUrl = `http://127.0.0.1:${hostPort}`
const redirectUri = `${baseUrl}/test/callback`
const clientId = 'agentteam-email-cloudflare-test'
const clientSecret = 'agentteam-email-cloudflare-secret'
const cloudflareScopes = [
  'openid',
  'email',
  'profile',
  'offline_access',
  'zone.read',
  'dns.write',
  'email-routing-rules.write',
  'workers-scripts.write',
  'workers-r2-storage.write'
]
const logs = [
  `[cloudflare-oauth-e2e] runDir=${runDir}`,
  `[cloudflare-oauth-e2e] baseUrl=${baseUrl}`
]

if (!process.env.DOCKER_HOST && process.env.PODMAN_SOCK) {
  process.env.DOCKER_HOST = process.env.PODMAN_SOCK
}

if (process.env.DOCKER_HOST?.includes('podman')) {
  process.env.TESTCONTAINERS_RYUK_DISABLED ??= 'true'
}

const { GenericContainer, Wait } = await import('testcontainers')

await mkdir(logsDir, { recursive: true })
await mkdir(reportsDir, { recursive: true })

let container

try {
  const image = await GenericContainer.fromDockerfile(
    path.join(packageDir, 'fake-cloudflare'),
    'Containerfile'
  ).build()

  container = await image
    .withEnvironment({
      CLOUDFLARE_OAUTH_SCOPES: cloudflareScopes.join(' '),
      OAUTH_CLIENT_ID: clientId,
      OAUTH_CLIENT_SECRET: clientSecret,
      OAUTH_ISSUER: baseUrl,
      OAUTH_REDIRECT_URI: redirectUri
    })
    .withExposedPorts({ container: 8788, host: hostPort })
    .withWaitStrategy(Wait.forHttp('/health', 8788).forStatusCode(200))
    .withStartupTimeout(120_000)
    .start()

  await assertDiscovery()
  const tokenResult = await performOAuthFlow()
  await assertFakeCloudflareApi(tokenResult.access_token)

  await writeJson(path.join(reportsDir, 'oauth-token-result.json'), {
    accessTokenPresent: Boolean(tokenResult.access_token),
    refreshTokenPresent: Boolean(tokenResult.refresh_token),
    scope: tokenResult.scope,
    tokenType: tokenResult.token_type
  })
  logs.push('[cloudflare-oauth-e2e] passed')
} catch (error) {
  logs.push(`[cloudflare-oauth-e2e] failed: ${error instanceof Error ? error.stack || error.message : String(error)}`)
  throw error
} finally {
  if (container) {
    await container.stop()
  }

  await writeFile(path.join(logsDir, 'cloudflare-oauth-e2e.log'), `${logs.join('\n')}\n`)
}

async function assertDiscovery() {
  const discovery = await fetchJson(new URL('/.well-known/openid-configuration', baseUrl))
  assert.equal(discovery.issuer, baseUrl)
  assert.equal(discovery.authorization_endpoint, `${baseUrl}/auth`)
  assert.equal(discovery.token_endpoint, `${baseUrl}/token`)
  assert.equal(discovery.userinfo_endpoint, `${baseUrl}/me`)
  logs.push('[cloudflare-oauth-e2e] discovery ok')
}

async function performOAuthFlow() {
  const cookieJar = new Map()
  const authorizationUrl = new URL('/auth', baseUrl)
  authorizationUrl.searchParams.set('client_id', clientId)
  authorizationUrl.searchParams.set('redirect_uri', redirectUri)
  authorizationUrl.searchParams.set('response_type', 'code')
  authorizationUrl.searchParams.set('scope', cloudflareScopes.join(' '))
  authorizationUrl.searchParams.set('state', 'cloudflare-e2e-state')
  authorizationUrl.searchParams.set('nonce', 'cloudflare-e2e-nonce')

  let response = await fetchWithCookies(authorizationUrl, cookieJar, { redirect: 'manual' })
  let location = readRedirectLocation(response)
  let authorizationCode = null

  for (let step = 0; step < 10; step += 1) {
    const nextUrl = new URL(location, baseUrl)

    if (nextUrl.pathname === '/test/callback') {
      assert.equal(nextUrl.searchParams.get('state'), 'cloudflare-e2e-state')
      authorizationCode = nextUrl.searchParams.get('code')
      break
    }

    if (nextUrl.pathname.startsWith('/interaction/')) {
      const interactionResponse = await fetchWithCookies(nextUrl, cookieJar, { redirect: 'manual' })
      const html = await interactionResponse.text()
      storeCookies(cookieJar, interactionResponse)

      const prompt =
        html.includes('name="prompt" value="login"') ? 'login'
        : html.includes('name="prompt" value="consent"') ? 'consent'
        : null

      assert(prompt, `Unknown oidc-provider interaction prompt at ${nextUrl}`)

      const body =
        prompt === 'login' ?
          new URLSearchParams({
            login: 'cloudflare-user-1',
            password: 'password',
            prompt
          })
        : new URLSearchParams({ prompt })

      response = await fetchWithCookies(nextUrl, cookieJar, {
        body,
        headers: {
          'content-type': 'application/x-www-form-urlencoded'
        },
        method: 'POST',
        redirect: 'manual'
      })
      location = readRedirectLocation(response)
      continue
    }

    response = await fetchWithCookies(nextUrl, cookieJar, { redirect: 'manual' })
    location = readRedirectLocation(response)
  }

  assert(authorizationCode, 'OAuth flow did not produce an authorization code')

  const tokenResponse = await fetch(new URL('/token', baseUrl), {
    body: new URLSearchParams({
      code: authorizationCode,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    }),
    headers: {
      accept: 'application/json',
      authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded'
    },
    method: 'POST'
  })
  const tokenResult = await readJsonResponse(tokenResponse)
  assert.equal(tokenResult.token_type, 'Bearer')
  assert.equal(typeof tokenResult.access_token, 'string')
  assert.equal(typeof tokenResult.refresh_token, 'string')

  const userInfo = await fetchJson(new URL('/me', baseUrl), {
    headers: {
      authorization: `Bearer ${tokenResult.access_token}`
    }
  })
  assert.equal(userInfo.sub, 'cloudflare-user-1')
  assert.equal(userInfo.email, 'cloudflare-user@example.test')

  logs.push('[cloudflare-oauth-e2e] authorization code flow ok')
  return tokenResult
}

async function assertFakeCloudflareApi(accessToken) {
  const authHeaders = {
    authorization: `Bearer ${accessToken}`
  }

  const accounts = await fetchCloudflareJson(new URL('/client/v4/accounts', baseUrl), {
    headers: authHeaders
  })
  assert.equal(accounts.result[0]?.id, 'cf-account-1')

  const zones = await fetchCloudflareJson(new URL('/client/v4/zones', baseUrl), {
    headers: authHeaders
  })
  assert.equal(zones.result[0]?.id, 'cf-zone-1')

  const bucketName = 'agentteam-email-example-test'
  const bucketUrl = new URL(`/client/v4/accounts/cf-account-1/r2/buckets/${bucketName}`, baseUrl)
  const missingBucket = await fetch(bucketUrl, {
    headers: authHeaders
  })
  assert.equal(missingBucket.status, 404)

  await fetchCloudflareJson(new URL('/client/v4/accounts/cf-account-1/r2/buckets', baseUrl), {
    body: JSON.stringify({ name: bucketName, storageClass: 'Standard' }),
    headers: {
      ...authHeaders,
      'content-type': 'application/json'
    },
    method: 'POST'
  })
  const bucket = await fetchCloudflareJson(bucketUrl, {
    headers: authHeaders
  })
  assert.equal(bucket.result.name, bucketName)

  const script = await fetchCloudflareJson(
    new URL('/client/v4/accounts/cf-account-1/workers/scripts/agentteam-email-example-test', baseUrl),
    {
      body: 'export default {}',
      headers: {
        ...authHeaders,
        'content-type': 'application/javascript'
      },
      method: 'PUT'
    }
  )
  assert.equal(script.result.script_name, 'agentteam-email-example-test')

  const dns = await fetchCloudflareJson(new URL('/client/v4/zones/cf-zone-1/email/routing/dns', baseUrl), {
    headers: authHeaders,
    method: 'POST'
  })
  assert.equal(dns.result.enabled, true)

  const catchAll = await fetchCloudflareJson(
    new URL('/client/v4/zones/cf-zone-1/email/routing/rules/catch_all', baseUrl),
    {
      body: JSON.stringify({
        actions: [{ type: 'worker', value: ['agentteam-email-example-test'] }],
        enabled: true,
        matchers: [{ type: 'all' }],
        name: 'AgentTeam Email catch-all'
      }),
      headers: {
        ...authHeaders,
        'content-type': 'application/json'
      },
      method: 'PUT'
    }
  )
  assert.equal(catchAll.result.enabled, true)

  await writeJson(path.join(reportsDir, 'fake-cloudflare-api.json'), {
    account: accounts.result[0],
    bucket: bucket.result,
    catchAll: catchAll.result,
    dns: dns.result,
    script: script.result,
    zone: zones.result[0]
  })
  logs.push('[cloudflare-oauth-e2e] fake Cloudflare API ok')
}

async function fetchWithCookies(url, cookieJar, init = {}) {
  const headers = new Headers(init.headers)
  const cookie = cookieHeader(cookieJar)
  if (cookie) {
    headers.set('cookie', cookie)
  }

  const response = await fetch(url, {
    ...init,
    headers
  })
  storeCookies(cookieJar, response)
  return response
}

function storeCookies(cookieJar, response) {
  const setCookieHeaders =
    typeof response.headers.getSetCookie === 'function' ?
      response.headers.getSetCookie()
    : splitSetCookieHeader(response.headers.get('set-cookie'))

  for (const setCookie of setCookieHeaders) {
    const [cookiePair] = setCookie.split(';')
    const separatorIndex = cookiePair.indexOf('=')
    if (separatorIndex === -1) {
      continue
    }

    cookieJar.set(cookiePair.slice(0, separatorIndex), cookiePair.slice(separatorIndex + 1))
  }
}

function cookieHeader(cookieJar) {
  return [...cookieJar.entries()].map(([name, value]) => `${name}=${value}`).join('; ')
}

function splitSetCookieHeader(value) {
  if (!value) {
    return []
  }

  return value.split(/,(?=\s*[^;=]+=[^;]+)/u)
}

function readRedirectLocation(response) {
  assert(
    response.status >= 300 && response.status < 400,
    `Expected redirect response, got HTTP ${response.status}`
  )
  const location = response.headers.get('location')
  assert(location, 'Redirect response did not include a Location header')
  return location
}

async function fetchCloudflareJson(url, init = {}) {
  const data = await fetchJson(url, init)
  assert.equal(data.success, true)
  return data
}

async function fetchJson(url, init = {}) {
  const headers = new Headers(init.headers)
  headers.set('accept', 'application/json')

  const response = await fetch(url, {
    ...init,
    headers
  })

  return readJsonResponse(response)
}

async function readJsonResponse(response) {
  const text = await response.text()
  let data = null

  if (text) {
    data = JSON.parse(text)
  }

  assert(response.ok, `HTTP ${response.status}: ${text}`)
  return data
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}
