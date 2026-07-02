import { createHash, createHmac } from 'node:crypto'
import http from 'node:http'

const port = Number(process.env.PORT || '8788')
const oauthEmail =
  process.env.AT_EMAIL_ADMIN_FAKE_CF_OAUTH_EMAIL ||
  process.env.FAKE_AT_EMAIL_ADMIN_CF_OAUTH_EMAIL ||
  'cloudflare-user@example.test'
const oauthSubject =
  process.env.AT_EMAIL_ADMIN_FAKE_CF_OAUTH_SUB ||
  process.env.FAKE_AT_EMAIL_ADMIN_CF_OAUTH_SUB ||
  'cloudflare-user-1'
const interactiveOAuth = process.env.FAKE_CLOUDFLARE_INTERACTIVE_OAUTH === '1'
const cloudflareOAuthScopes = [
  'workers-r2.read',
  'workers-r2.write',
  'workers-scripts.read',
  'workers-scripts.write',
  'user-details.read',
  'dns.read',
  'dns.write',
  'zone.read',
  'cloud-email-security.read',
  'email-routing-address.read',
  'email-routing-address.write',
  'email-routing-rule.read',
  'email-routing-rule.write',
  'email-routing-suppression.read',
  'email-security-dmarcreports.read',
  'email-sending.read',
  'email-sending.write',
  'offline_access'
]
const account = {
  id: 'cf-account-1',
  name: 'Full Stack E2E Account',
  type: 'standard'
}
const zones = [
  {
    account: {
      id: account.id,
      name: account.name
    },
    id: 'cf-zone-example',
    name: 'example.test',
    status: 'active'
  },
  {
    account: {
      id: account.id,
      name: account.name
    },
    id: 'cf-zone-second',
    name: 'second.test',
    status: 'active'
  }
]
const state = {
  buckets: new Set(),
  catchAllRules: new Map(),
  dnsEnabledZones: new Set(),
  operations: [],
  requests: [],
  scripts: new Map(),
  secrets: [],
  workerRuntimeBindings: new Map()
}
const internalProviderHeaders = [
  'X-ATM-Ingest-ID',
  'X-ATMCF-Edge-Status',
  'X-Zone-Loop',
  'X-Agent-Mail-ZoneMTA-Queue-ID'
]

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'fake-cloudflare'}`)
  const body = await readBody(request)
  recordRequest(request, url, body)

  try {
    if (url.pathname === '/health') {
      sendJson(response, 200, { ok: true })
      return
    }

    if (url.pathname === '/__requests') {
      sendJson(response, 200, {
        buckets: [...state.buckets].sort(),
        catchAllRules: Object.fromEntries(state.catchAllRules),
        dnsEnabledZones: [...state.dnsEnabledZones].sort(),
        operations: state.operations,
        requests: state.requests,
        scripts: Object.fromEntries(state.scripts),
        secrets: state.secrets
      })
      return
    }

    if (url.pathname === '/__reset' && request.method === 'POST') {
      resetState()
      sendJson(response, 200, { ok: true })
      return
    }

    if (url.pathname === '/__sign-worker-notification' && request.method === 'POST') {
      handleWorkerNotificationSigning(response, body)
      return
    }

    if (url.pathname.startsWith('/oauth2/') || url.pathname.startsWith('/oauth/')) {
      handleOAuth(request, response, url)
      return
    }

    if (!url.pathname.startsWith('/client/v4/')) {
      sendJson(response, 404, cloudflareResponse(null, false, [{ code: 1003, message: 'Unhandled route' }]))
      return
    }

    await handleCloudflareApi(request, response, url, body)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    sendJson(response, 500, cloudflareResponse(null, false, [{ code: 1000, message }]))
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`[fake-cloudflare] listening on ${port}`)
})

async function handleCloudflareApi(request, response, url, body) {
  if (!hasBearerAuth(request)) {
    sendJson(
      response,
      401,
      cloudflareResponse(null, false, [{ code: 10000, message: 'Authentication error' }])
    )
    return
  }

  if (request.method === 'GET' && url.pathname === '/client/v4/user') {
    recordOperation({ type: 'user.get' })
    sendJson(response, 200, cloudflareResponse(cloudflareUserDetails()))
    return
  }

  if (request.method === 'GET' && url.pathname === '/client/v4/accounts') {
    recordOperation({ type: 'accounts.list' })
    sendJson(response, 200, paginatedCloudflareResponse([account], url))
    return
  }

  if (request.method === 'GET' && url.pathname === '/client/v4/zones') {
    recordOperation({ accountId: url.searchParams.get('account.id'), type: 'zones.list' })
    sendJson(response, 200, paginatedCloudflareResponse(zones, url))
    return
  }

  const bucketMatch = url.pathname.match(
    /^\/client\/v4\/accounts\/(?<accountId>[^/]+)\/r2\/buckets\/(?<bucketName>[^/]+)$/u
  )
  if (bucketMatch?.groups && request.method === 'GET') {
    const bucketName = decodeURIComponent(bucketMatch.groups.bucketName)
    recordOperation({ bucketName, type: 'r2.bucket.get' })
    if (!state.buckets.has(bucketName)) {
      sendJson(response, 404, cloudflareResponse(null, false, [{ code: 10007, message: 'Bucket not found' }]))
      return
    }
    sendJson(response, 200, cloudflareResponse({ name: bucketName, storage_class: 'Standard' }))
    return
  }

  const bucketsPathMatch = url.pathname.match(/^\/client\/v4\/accounts\/(?<accountId>[^/]+)\/r2\/buckets$/u)
  if (bucketsPathMatch?.groups && request.method === 'POST') {
    const json = parseJsonBody(body)
    const bucketName = readString(json, 'name')
    if (!bucketName) {
      sendJson(
        response,
        400,
        cloudflareResponse(null, false, [{ code: 1000, message: 'Bucket name is required' }])
      )
      return
    }
    state.buckets.add(bucketName)
    recordOperation({ bucketName, type: 'r2.bucket.create' })
    sendJson(response, 200, cloudflareResponse({ name: bucketName, storage_class: 'Standard' }))
    return
  }

  const tempCredentialMatch = url.pathname.match(
    /^\/client\/v4\/accounts\/(?<accountId>[^/]+)\/r2\/temp-access-credentials$/u
  )
  if (tempCredentialMatch?.groups && request.method === 'POST') {
    const json = parseJsonBody(body)
    const bucketName = readString(json, 'bucket')
    const parentAccessKeyId = readString(json, 'parentAccessKeyId')
    const permission = readString(json, 'permission')
    const prefixes = Array.isArray(json?.prefixes)
      ? json.prefixes.filter((value) => typeof value === 'string')
      : []
    if (!bucketName || !parentAccessKeyId || permission !== 'object-read-write' || prefixes.length !== 1) {
      sendJson(
        response,
        400,
        cloudflareResponse(null, false, [{ code: 1000, message: 'Invalid temporary credential request' }])
      )
      return
    }
    state.buckets.add(bucketName)
    recordOperation({
      bucketName,
      permission,
      prefix: prefixes[0],
      ttlSeconds: Number(json?.ttlSeconds || 0),
      type: 'r2.temp-credentials.create'
    })
    sendJson(
      response,
      200,
      cloudflareResponse({
        accessKeyId: `temp-${hashBody(body).slice(0, 16)}`,
        secretAccessKey: 'fake-r2-temporary-secret-access-key',
        sessionToken: 'fake-r2-session-token'
      })
    )
    return
  }

  const scriptMatch = url.pathname.match(
    /^\/client\/v4\/accounts\/(?<accountId>[^/]+)\/workers\/scripts\/(?<scriptName>[^/]+)$/u
  )
  if (scriptMatch?.groups && ['PATCH', 'PUT'].includes(request.method || '')) {
    const scriptName = decodeURIComponent(scriptMatch.groups.scriptName)
    const upload = await parseWorkerUpload(request, body)
    state.scripts.set(scriptName, {
      bodySha256: hashBody(body),
      bytes: body.byteLength,
      files: upload.files,
      metadata: publicWorkerMetadata(upload.metadata),
      updatedAt: new Date().toISOString()
    })
    state.workerRuntimeBindings.set(scriptName, workerRuntimeBindings(upload.metadata))
    recordOperation({ scriptName, type: 'worker.script.upsert' })
    sendJson(response, 200, cloudflareResponse({ id: scriptName, script_name: scriptName }))
    return
  }

  const secretMatch = url.pathname.match(
    /^\/client\/v4\/accounts\/(?<accountId>[^/]+)\/workers\/scripts\/(?<scriptName>[^/]+)\/secrets\/?(?<secretName>[^/]*)$/u
  )
  if (secretMatch?.groups && ['PATCH', 'PUT'].includes(request.method || '')) {
    const scriptName = decodeURIComponent(secretMatch.groups.scriptName)
    const secretName = decodeURIComponent(secretMatch.groups.secretName || 'unknown')
    state.secrets.push({ scriptName, secretName, updatedAt: new Date().toISOString() })
    recordOperation({ scriptName, secretName, type: 'worker.secret.upsert' })
    sendJson(response, 200, cloudflareResponse({ name: secretName, script_name: scriptName }))
    return
  }

  const emailDnsMatch = url.pathname.match(/^\/client\/v4\/zones\/(?<zoneId>[^/]+)\/email\/routing\/dns$/u)
  if (emailDnsMatch?.groups && request.method === 'POST') {
    const zoneId = decodeURIComponent(emailDnsMatch.groups.zoneId)
    state.dnsEnabledZones.add(zoneId)
    recordOperation({ zoneId, type: 'email-routing.dns.create' })
    sendJson(response, 200, cloudflareResponse({ enabled: true, tag: zoneId }))
    return
  }

  const sendMatch = url.pathname.match(
    /^\/client\/v4\/accounts\/(?<accountId>[^/]+)\/email\/sending\/(?<sendKind>send|send_raw)$/u
  )
  if (sendMatch?.groups && request.method === 'POST') {
    const json = parseJsonBody(body) || {}
    const delivered = [
      ...arrayOfStrings(json.to),
      ...arrayOfStrings(json.cc),
      ...arrayOfStrings(json.bcc),
      ...arrayOfStrings(json.recipients)
    ]
    recordOperation({
      bytes: body.byteLength,
      sendKind: sendMatch.groups.sendKind,
      type: 'email.sending.send'
    })
    sendJson(
      response,
      200,
      cloudflareResponse({
        delivered,
        permanent_bounces: [],
        queued: delivered.length > 0 ? [] : ['accepted-without-recipient-projection']
      })
    )
    return
  }

  const catchAllMatch = url.pathname.match(
    /^\/client\/v4\/zones\/(?<zoneId>[^/]+)\/email\/routing\/rules\/catch_all$/u
  )
  if (catchAllMatch?.groups && ['PATCH', 'PUT'].includes(request.method || '')) {
    const zoneId = decodeURIComponent(catchAllMatch.groups.zoneId)
    const json = parseJsonBody(body)
    const rule = {
      actions: Array.isArray(json?.actions) ? json.actions : [],
      enabled: json?.enabled === true,
      matchers: Array.isArray(json?.matchers) ? json.matchers : [],
      name: readString(json, 'name') || 'AgentTeam Email catch-all',
      tag: 'catch-all'
    }
    state.catchAllRules.set(zoneId, rule)
    recordOperation({ actions: rule.actions, zoneId, type: 'email-routing.catch-all.upsert' })
    sendJson(response, 200, cloudflareResponse(rule))
    return
  }

  sendJson(
    response,
    404,
    cloudflareResponse(null, false, [
      { code: 1003, message: `Unhandled fake Cloudflare API route: ${request.method} ${url.pathname}` }
    ])
  )
}

function handleOAuth(request, response, url) {
  recordOperation({ path: url.pathname, type: 'oauth.request' })
  if (
    request.method === 'GET' &&
    ['/oauth2/auth', '/oauth/authorize', '/oauth/auth'].includes(url.pathname)
  ) {
    const redirectURI = url.searchParams.get('redirect_uri')
    if (!redirectURI) {
      sendJson(response, 400, { error: 'invalid_request', error_description: 'redirect_uri is required' })
      return
    }
    if (interactiveOAuth && url.searchParams.get('__approved') !== '1') {
      const approveUrl = new URL(url)
      approveUrl.searchParams.set('__approved', '1')
      sendHtml(
        response,
        200,
        `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Authorize AgentTeam Email</title>
    <style>
      body {
        align-items: center;
        background: #f8fafc;
        color: #0f172a;
        display: grid;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        margin: 0;
        min-height: 100vh;
        padding: 24px;
      }
      main {
        background: #fff;
        border: 1px solid #dbe3ef;
        border-radius: 12px;
        box-shadow: 0 24px 80px rgba(15, 23, 42, 0.12);
        margin: 0 auto;
        max-width: 460px;
        padding: 28px;
      }
      h1 {
        font-size: 24px;
        line-height: 1.2;
        margin: 0 0 12px;
      }
      p {
        color: #475569;
        line-height: 1.6;
        margin: 0 0 20px;
      }
      button {
        background: #f97316;
        border: 0;
        border-radius: 8px;
        color: #fff;
        cursor: pointer;
        font: inherit;
        font-weight: 600;
        min-height: 42px;
        padding: 0 16px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Authorize AgentTeam Email</h1>
      <p>This fake Cloudflare screen is used only by the recorded browser E2E flow.</p>
      <form action="${escapeHtml(approveUrl.toString())}" method="get">
        ${[...approveUrl.searchParams.entries()]
          .map(
            ([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`
          )
          .join('\n        ')}
        <button type="submit">Authorize AgentTeam Email</button>
      </form>
    </main>
  </body>
</html>`
      )
      return
    }
    const redirect = new URL(redirectURI)
    redirect.searchParams.set('code', 'full-stack-e2e-cloudflare-code')
    const state = url.searchParams.get('state')
    if (state) {
      redirect.searchParams.set('state', state)
    }
    response.writeHead(302, { location: redirect.toString() })
    response.end()
    return
  }
  if (request.method === 'POST' && url.pathname === '/oauth2/token') {
    sendJson(response, 200, {
      access_token: 'full-stack-e2e-cloudflare-oauth-token',
      expires_in: 3600,
      refresh_token: 'full-stack-e2e-cloudflare-refresh-token',
      scope: cloudflareOAuthScopes.join(' '),
      token_type: 'Bearer'
    })
    return
  }
  if (request.method === 'GET' && url.pathname === '/oauth2/userinfo') {
    if (!hasBearerAuth(request)) {
      sendJson(response, 401, {
        error: 'invalid_token',
        error_description: 'Bearer access token is required'
      })
      return
    }

    sendJson(response, 200, {
      sub: oauthSubject
    })
    return
  }
  if (request.method === 'POST' && url.pathname === '/oauth2/revoke') {
    sendJson(response, 200, { revoked: true })
    return
  }
  sendJson(response, 404, {
    error: 'not_found',
    error_description: `Unhandled fake Cloudflare OAuth route: ${request.method} ${url.pathname}`
  })
}

function cloudflareUserDetails() {
  return {
    email: oauthEmail,
    first_name: 'Cloudflare',
    id: oauthSubject,
    last_name: 'Test User',
    username: oauthEmail
  }
}

function handleWorkerNotificationSigning(response, body) {
  const input = parseJsonBody(body)
  const domain = readString(input, 'domain')
  const bodyText = readString(input, 'bodyText')
  const timestamp = Number(readString(input, 'timestamp') || Math.floor(Date.now() / 1000))
  const webhookId = readString(input, 'webhookId')
  const worker = [...state.workerRuntimeBindings.values()].find((candidate) => candidate.domain === domain)
  if (!worker || !bodyText || !worker.webhookSigningSecret || !worker.connectionId || !webhookId) {
    sendJson(response, 404, { error: 'worker_not_found' })
    return
  }
  const signature = signStandardWebhook(worker.webhookSigningSecret, webhookId, timestamp, bodyText)
  sendJson(response, 200, {
    connectionId: worker.connectionId,
    headers: {
      'webhook-id': webhookId,
      'webhook-signature': signature,
      'webhook-timestamp': String(timestamp)
    },
    signature,
    timestamp: String(timestamp)
  })
}

function signStandardWebhook(secret, webhookId, timestamp, bodyText) {
  const key = decodeStandardWebhookSecret(secret)
  const signedContent = `${webhookId}.${timestamp}.${bodyText}`
  const signature = createHmac('sha256', key).update(signedContent).digest('base64')
  return `v1,${signature}`
}

function decodeStandardWebhookSecret(secret) {
  if (typeof secret !== 'string' || !secret.startsWith('whsec_')) {
    throw new Error('Worker webhook signing secret must use Standard Webhooks format')
  }
  return Buffer.from(secret.slice('whsec_'.length), 'base64')
}

function hasBearerAuth(request) {
  const authorization = request.headers.authorization
  return typeof authorization === 'string' && authorization.startsWith('Bearer ')
}

function cloudflareResponse(result, success = true, errors = []) {
  return {
    errors,
    messages: [],
    result,
    success
  }
}

function paginatedCloudflareResponse(result, url) {
  const page = Number(url?.searchParams?.get('page') || '1')
  const safePage = Number.isFinite(page) && page > 0 ? page : 1
  const pageResult = safePage === 1 ? result : []
  return {
    ...cloudflareResponse(pageResult),
    result_info: {
      count: pageResult.length,
      page: safePage,
      per_page: result.length,
      total_count: result.length,
      total_pages: 1
    }
  }
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'content-type': 'application/json' })
  response.end(`${JSON.stringify(body)}\n`)
}

function sendHtml(response, statusCode, body) {
  response.writeHead(statusCode, { 'content-type': 'text/html; charset=utf-8' })
  response.end(body)
}

async function readBody(request) {
  const chunks = []
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

function parseJsonBody(body) {
  if (body.byteLength === 0) {
    return null
  }
  try {
    return JSON.parse(body.toString('utf8'))
  } catch {
    return null
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

async function parseWorkerUpload(request, body) {
  const contentType = requestContentType(request.headers['content-type'])
  if (contentType?.type !== 'multipart/form-data' || !contentType.parameters.boundary) {
    return { files: [], metadata: null }
  }

  const formData = await new Request('http://fake-cloudflare.test/worker-upload', {
    body,
    headers: { 'content-type': contentType.header },
    method: request.method || 'POST'
  }).formData()
  const metadata = await parseJsonFormValue(formData.get('metadata'))
  const files = []

  for (const [fieldName, value] of formData.entries()) {
    if (fieldName === 'metadata') {
      continue
    }
    if (!value || typeof value !== 'object' || typeof value.arrayBuffer !== 'function') {
      continue
    }
    const bytes = Buffer.from(await value.arrayBuffer())
    files.push({
      fieldName,
      name: typeof value.name === 'string' ? value.name : fieldName,
      sha256: hashBody(bytes),
      size: bytes.byteLength,
      type: typeof value.type === 'string' ? value.type : ''
    })
  }

  return { files, metadata }
}

async function parseJsonFormValue(value) {
  const text =
    typeof value === 'string'
      ? value
      : value && typeof value === 'object' && typeof value.text === 'function'
        ? await value.text()
        : ''
  if (text.trim() === '') {
    return null
  }
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function arrayOfStrings(value) {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((item) => typeof item === 'string')
}

function readString(value, key) {
  if (!value || typeof value !== 'object') {
    return null
  }
  const candidate = value[key]
  return typeof candidate === 'string' && candidate.trim() ? candidate : null
}

function recordRequest(request, url, body) {
  state.requests.push({
    bodySha256: hashBody(body),
    bodySummary: safeBodySummary(request, body),
    bytes: body.byteLength,
    hasAuthorization: typeof request.headers.authorization === 'string',
    method: request.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    receivedAt: new Date().toISOString()
  })
}

function safeBodySummary(request, body) {
  const contentType = requestContentType(request.headers['content-type'])
  const text = body.toString('utf8')
  return {
    contentType: contentType?.type ?? '',
    forbiddenInternalHeaders: internalProviderHeaders.filter((header) => text.includes(header)),
    jsonKeys: contentType?.type === 'application/json' ? topLevelJsonKeys(body) : []
  }
}

function requestContentType(header) {
  if (typeof header !== 'string') {
    return null
  }
  const [rawType, ...rawParameters] = header.split(';')
  const type = rawType.trim().toLowerCase()
  if (!type) {
    return null
  }
  const parameters = {}
  for (const rawParameter of rawParameters) {
    const separatorIndex = rawParameter.indexOf('=')
    if (separatorIndex === -1) {
      continue
    }
    const key = rawParameter.slice(0, separatorIndex).trim().toLowerCase()
    const rawValue = rawParameter.slice(separatorIndex + 1).trim()
    if (!key) {
      continue
    }
    parameters[key] = rawValue.startsWith('"') && rawValue.endsWith('"') ? rawValue.slice(1, -1) : rawValue
  }
  return { header, parameters, type }
}

function topLevelJsonKeys(body) {
  const json = parseJsonBody(body)
  return json && typeof json === 'object' && !Array.isArray(json) ? Object.keys(json).sort() : []
}

function publicWorkerMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return metadata
  }
  return {
    ...metadata,
    bindings: Array.isArray(metadata.bindings)
      ? metadata.bindings.map((binding) =>
          binding?.type === 'secret_text' ? { ...binding, text: '<redacted-secret-text>' } : binding
        )
      : metadata.bindings
  }
}

function workerRuntimeBindings(metadata) {
  const bindings = Object.fromEntries(
    (Array.isArray(metadata?.bindings) ? metadata.bindings : [])
      .filter((binding) => typeof binding?.name === 'string' && typeof binding?.text === 'string')
      .map((binding) => [binding.name, binding.text])
  )
  return {
    connectionId: bindings.AGENTTEAM_CONNECTION_ID || '',
    domain: bindings.AGENTTEAM_DOMAIN || '',
    webhookSigningSecret: bindings.AGENTTEAM_WORKER_HMAC_SECRET || ''
  }
}

function recordOperation(operation) {
  state.operations.push({
    ...operation,
    at: new Date().toISOString()
  })
}

function resetState() {
  state.buckets.clear()
  state.catchAllRules.clear()
  state.dnsEnabledZones.clear()
  state.operations.length = 0
  state.requests.length = 0
  state.scripts.clear()
  state.secrets.length = 0
  state.workerRuntimeBindings.clear()
}

function hashBody(body) {
  return createHash('sha256').update(body).digest('hex')
}
