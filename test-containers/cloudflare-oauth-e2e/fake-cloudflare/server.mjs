import http from 'node:http'

import Provider from 'oidc-provider'

const port = Number(process.env.PORT || '8788')
const issuer = requiredEnv('OAUTH_ISSUER')
const clientId = process.env.OAUTH_CLIENT_ID || 'agentteam-email-cloudflare-test'
const redirectUris = splitList(process.env.OAUTH_REDIRECT_URIS || process.env.OAUTH_REDIRECT_URI)
const cloudflareScopes = splitList(
  process.env.CLOUDFLARE_OAUTH_SCOPES ||
    'workers-r2.read workers-r2.write workers-scripts.read workers-scripts.write dns.read dns.write zone.read cloud-email-security.read email-routing-address.read email-routing-address.write email-routing-rule.read email-routing-rule.write email-routing-suppression.read email-security-dmarcreports.read email-sending.read email-sending.write offline_access'
)
const grantedUser = {
  accountId: 'cloudflare-user-1',
  email: 'cloudflare-user@example.test',
  emailVerified: true,
  name: 'Cloudflare Test User'
}
const account = {
  id: 'cf-account-1',
  name: 'AgentTeam Test Account',
  type: 'standard'
}
const zone = {
  account: {
    id: account.id,
    name: account.name
  },
  id: 'cf-zone-1',
  name: 'example.test',
  status: 'active'
}
const buckets = new Set()
const scripts = new Set()

if (redirectUris.length === 0) {
  throw new Error('OAUTH_REDIRECT_URI or OAUTH_REDIRECT_URIS is required')
}

const provider = new Provider(issuer, {
  clients: [
    {
      client_id: clientId,
      grant_types: ['authorization_code', 'refresh_token'],
      redirect_uris: redirectUris,
      response_types: ['code'],
      token_endpoint_auth_method: 'none'
    }
  ],
  claims: {
    email: ['email', 'email_verified'],
    openid: ['sub'],
    profile: ['name']
  },
  cookies: {
    keys: ['agentteam-email-cloudflare-test-cookie-key']
  },
  features: {
    devInteractions: {
      enabled: true
    },
    revocation: {
      enabled: true
    }
  },
  findAccount: async (_ctx, accountId) => {
    if (accountId !== grantedUser.accountId) {
      return undefined
    }

    return {
      accountId: grantedUser.accountId,
      claims: async () => ({
        email: grantedUser.email,
        email_verified: grantedUser.emailVerified,
        name: grantedUser.name,
        sub: grantedUser.accountId
      })
    }
  },
  issueRefreshToken: async () => true,
  scopes: [...new Set(cloudflareScopes)]
})

const oidcHandler = provider.callback()
const server = http.createServer(async (request, response) => {
  try {
    if (!request.url) {
      sendJson(response, 404, cloudflareResponse(null, false))
      return
    }

    const url = new URL(request.url, issuer)

    if (url.pathname === '/health') {
      sendJson(response, 200, {
        ok: true
      })
      return
    }

    if (url.pathname === '/test/callback') {
      sendJson(response, 200, {
        code: url.searchParams.get('code'),
        error: url.searchParams.get('error'),
        state: url.searchParams.get('state')
      })
      return
    }

    if (url.pathname.startsWith('/client/v4/')) {
      await handleCloudflareApi(request, response, url)
      return
    }

    oidcHandler(request, response)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    sendJson(response, 500, cloudflareResponse(null, false, [{ code: 1000, message }]))
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`[fake-cloudflare] listening on ${issuer}`)
})

async function handleCloudflareApi(request, response, url) {
  if (!hasBearerAuth(request)) {
    sendJson(
      response,
      401,
      cloudflareResponse(null, false, [{ code: 10000, message: 'Authentication error' }])
    )
    return
  }

  if (request.method === 'GET' && url.pathname === '/client/v4/accounts') {
    sendJson(response, 200, paginatedCloudflareResponse([account], url))
    return
  }

  if (request.method === 'GET' && url.pathname === '/client/v4/zones') {
    sendJson(response, 200, paginatedCloudflareResponse([zone], url))
    return
  }

  const r2BucketMatch = url.pathname.match(
    /^\/client\/v4\/accounts\/(?<accountId>[^/]+)\/r2\/buckets\/(?<bucketName>[^/]+)$/u
  )
  if (request.method === 'GET' && r2BucketMatch?.groups) {
    const bucketName = decodeURIComponent(r2BucketMatch.groups.bucketName)
    if (!buckets.has(bucketName)) {
      sendJson(response, 404, cloudflareResponse(null, false, [{ code: 10007, message: 'Bucket not found' }]))
      return
    }

    sendJson(response, 200, cloudflareResponse({ name: bucketName, storage_class: 'Standard' }))
    return
  }

  const r2BucketsPathMatch = url.pathname.match(/^\/client\/v4\/accounts\/(?<accountId>[^/]+)\/r2\/buckets$/u)
  if (request.method === 'POST' && r2BucketsPathMatch?.groups) {
    const body = await readJsonBody(request)
    const bucketName = readString(body, 'name')
    if (!bucketName) {
      sendJson(
        response,
        400,
        cloudflareResponse(null, false, [{ code: 1000, message: 'Bucket name is required' }])
      )
      return
    }

    buckets.add(bucketName)
    sendJson(response, 200, cloudflareResponse({ name: bucketName, storage_class: 'Standard' }))
    return
  }

  const tempCredentialMatch = url.pathname.match(
    /^\/client\/v4\/accounts\/(?<accountId>[^/]+)\/r2\/temp-access-credentials$/u
  )
  if (request.method === 'POST' && tempCredentialMatch?.groups) {
    const body = await readJsonBody(request)
    const bucketName = readString(body, 'bucket')
    const parentAccessKeyId = readString(body, 'parentAccessKeyId')
    const prefixes = Array.isArray(body?.prefixes)
      ? body.prefixes.filter((value) => typeof value === 'string')
      : []
    if (
      !bucketName ||
      !parentAccessKeyId ||
      readString(body, 'permission') !== 'object-read-write' ||
      prefixes.length !== 1
    ) {
      sendJson(
        response,
        400,
        cloudflareResponse(null, false, [{ code: 1000, message: 'Invalid temporary credential request' }])
      )
      return
    }

    buckets.add(bucketName)
    sendJson(
      response,
      200,
      cloudflareResponse({
        accessKeyId: 'fake-temp-r2-access-key',
        secretAccessKey: 'fake-temp-r2-secret-access-key',
        sessionToken: 'fake-temp-r2-session-token'
      })
    )
    return
  }

  const workerScriptMatch = url.pathname.match(
    /^\/client\/v4\/accounts\/(?<accountId>[^/]+)\/workers\/scripts\/(?<scriptName>[^/]+)$/u
  )
  if (request.method === 'PUT' && workerScriptMatch?.groups) {
    const scriptName = decodeURIComponent(workerScriptMatch.groups.scriptName)
    await readBody(request)
    scripts.add(scriptName)
    sendJson(response, 200, cloudflareResponse({ id: scriptName, script_name: scriptName }))
    return
  }

  const emailDnsMatch = url.pathname.match(/^\/client\/v4\/zones\/(?<zoneId>[^/]+)\/email\/routing\/dns$/u)
  if (request.method === 'POST' && emailDnsMatch?.groups) {
    sendJson(response, 200, cloudflareResponse({ enabled: true, name: zone.name, tag: zone.id }))
    return
  }

  const catchAllMatch = url.pathname.match(
    /^\/client\/v4\/zones\/(?<zoneId>[^/]+)\/email\/routing\/rules\/catch_all$/u
  )
  if (request.method === 'PUT' && catchAllMatch?.groups) {
    const body = await readJsonBody(request)
    sendJson(
      response,
      200,
      cloudflareResponse({
        actions: Array.isArray(body?.actions) ? body.actions : [],
        enabled: body?.enabled === true,
        matchers: Array.isArray(body?.matchers) ? body.matchers : [],
        name: readString(body, 'name') || 'AgentTeam Email catch-all',
        tag: 'catch-all'
      })
    )
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
  response.writeHead(statusCode, {
    'content-type': 'application/json'
  })
  response.end(JSON.stringify(body))
}

function splitList(value) {
  if (!value) {
    return []
  }

  return value
    .split(/[,\s]+/u)
    .map((item) => item.trim())
    .filter(Boolean)
}

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required`)
  }

  return value
}

async function readJsonBody(request) {
  const body = await readBody(request)
  if (!body) {
    return null
  }

  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

async function readBody(request) {
  const chunks = []
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk))
  }

  return Buffer.concat(chunks).toString('utf8')
}

function readString(value, key) {
  if (!value || typeof value !== 'object' || !(key in value)) {
    return null
  }

  const field = value[key]
  return typeof field === 'string' ? field : null
}
