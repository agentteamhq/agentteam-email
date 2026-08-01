import assert from 'node:assert/strict'
import test from 'node:test'
import { Buffer } from 'node:buffer'

import worker from '../src/index.ts'
import { CLOUDFLARE_TOKEN_ENDPOINT, classifyResponse, createUpstreamRequestHeaders } from '../src/lib.ts'

const workerPassword = 'test-worker-password'

test('rejects unauthenticated requests before endpoint handling', async () => {
  const response = await worker.fetch(new Request('https://worker.example.test/anything'), workerEnv())

  assert.equal(response.status, 401)
  assert.equal(response.headers.get('www-authenticate'), 'Bearer')
  assert.deepEqual(await response.json(), { error: 'unauthorized' })
})

test('rejects wrong bearer token', async () => {
  const response = await worker.fetch(
    new Request('https://worker.example.test/oauth2/token', {
      headers: {
        authorization: 'Bearer wrong-secret'
      },
      method: 'POST'
    }),
    workerEnv()
  )

  assert.equal(response.status, 401)
  assert.equal(response.headers.get('www-authenticate'), 'Bearer')
})

test('restricts authenticated traffic to POST oauth token path', async () => {
  const wrongPath = await worker.fetch(
    new Request('https://worker.example.test/not-token', {
      headers: authHeaders(),
      method: 'POST'
    }),
    workerEnv()
  )
  const wrongMethod = await worker.fetch(
    new Request('https://worker.example.test/oauth2/token', {
      headers: authHeaders(),
      method: 'GET'
    }),
    workerEnv()
  )

  assert.equal(wrongPath.status, 404)
  assert.equal(wrongMethod.status, 405)
  assert.equal(wrongMethod.headers.get('allow'), 'POST')
})

test('forwards the exact body and only OAuth content negotiation headers', async () => {
  const body = 'grant_type=authorization_code&code=abc%2B123&code_verifier=verifier'
  const requests = []
  const restoreFetch = installFetch(async (input, init = {}) => {
    const headers = new Headers(init.headers)
    requests.push({
      body: Buffer.from(await new Response(init.body).arrayBuffer()).toString('utf8'),
      headers: Object.fromEntries(headers.entries()),
      method: init.method,
      url: String(input)
    })
    return Response.json(
      {
        error: 'invalid_client',
        error_description: 'Client authentication failed'
      },
      {
        headers: {
          'cf-ray': 'abc-SJC',
          'content-type': 'application/json;charset=UTF-8'
        },
        status: 401
      }
    )
  })

  try {
    const response = await worker.fetch(
      new Request('https://worker.example.test/oauth2/token', {
        body,
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${workerPassword}`,
          'content-type': 'application/x-www-form-urlencoded',
          cookie: 'do-not-forward=true',
          'x-extra': 'do-not-forward'
        },
        method: 'POST'
      }),
      workerEnv()
    )

    assert.equal(response.status, 401)
    assert.equal(response.headers.get('content-type'), 'application/json;charset=UTF-8')
    assert.equal(response.headers.get('cf-ray'), 'abc-SJC')
    assert.deepEqual(await response.json(), {
      error: 'invalid_client',
      error_description: 'Client authentication failed'
    })
    assert.deepEqual(requests, [
      {
        body,
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded'
        },
        method: 'POST',
        url: CLOUDFLARE_TOKEN_ENDPOINT
      }
    ])
  } finally {
    restoreFetch()
  }
})

test('proxies refresh_token grants under the same Worker authentication', async () => {
  const body = 'grant_type=refresh_token&refresh_token=stored%2Brefresh&client_id=cloudflare-client-id'
  const requests = []
  const restoreFetch = installFetch(async (input, init = {}) => {
    requests.push({
      body: Buffer.from(await new Response(init.body).arrayBuffer()).toString('utf8'),
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      method: init.method,
      url: String(input)
    })
    return Response.json(
      {
        access_token: 'renewed-access-token',
        expires_in: 3600,
        refresh_token: 'renewed-refresh-token',
        scope: 'offline_access',
        token_type: 'Bearer'
      },
      {
        headers: {
          'cf-ray': 'renew-ray-SJC',
          'content-type': 'application/json;charset=UTF-8'
        }
      }
    )
  })

  try {
    const unauthenticated = await worker.fetch(
      new Request('https://worker.example.test/oauth2/token', {
        body,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        method: 'POST'
      }),
      workerEnv()
    )
    const response = await worker.fetch(
      new Request('https://worker.example.test/oauth2/token', {
        body,
        headers: {
          accept: 'application/json',
          ...authHeaders(),
          'content-type': 'application/x-www-form-urlencoded'
        },
        method: 'POST'
      }),
      workerEnv()
    )

    assert.equal(unauthenticated.status, 401)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cf-ray'), 'renew-ray-SJC')
    assert.deepEqual(await response.json(), {
      access_token: 'renewed-access-token',
      expires_in: 3600,
      refresh_token: 'renewed-refresh-token',
      scope: 'offline_access',
      token_type: 'Bearer'
    })
    assert.deepEqual(requests, [
      {
        body,
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded'
        },
        method: 'POST',
        url: CLOUDFLARE_TOKEN_ENDPOINT
      }
    ])
  } finally {
    restoreFetch()
  }
})

test('classifies Cloudflare challenge responses from upstream headers', () => {
  assert.equal(
    classifyResponse(
      403,
      new Headers({
        'cf-mitigated': 'challenge',
        'content-type': 'text/html; charset=UTF-8'
      })
    ),
    'challenge_html'
  )
})

test('logs challenge content type without collapsing it to present', async () => {
  const logs = []
  const restoreConsoleLog = installConsoleLog((entry) => {
    logs.push(entry)
  })
  const restoreFetch = installFetch(
    async () =>
      new Response('<html>Cloudflare challenge</html>', {
        headers: {
          'cf-mitigated': 'challenge',
          'cf-ray': 'challenge-ray-SJC',
          'content-type': 'text/html; charset=UTF-8'
        },
        status: 403
      })
  )

  try {
    await worker.fetch(
      new Request('https://worker.example.test/oauth2/token', {
        body: 'grant_type=authorization_code',
        headers: {
          ...authHeaders(),
          'content-type': 'application/x-www-form-urlencoded'
        },
        method: 'POST'
      }),
      workerEnv()
    )

    assert.match(logs.join('\n'), /content_type=text\/html; charset=UTF-8/u)
    assert.match(logs.join('\n'), /classification=challenge_html/u)
  } finally {
    restoreFetch()
    restoreConsoleLog()
  }
})

test('request header forwarding ignores Worker authorization', () => {
  const headers = createUpstreamRequestHeaders(
    new Headers({
      accept: 'application/json',
      authorization: `Bearer ${workerPassword}`,
      'content-type': 'application/x-www-form-urlencoded'
    })
  )

  assert.deepEqual(Object.fromEntries(headers.entries()), {
    accept: 'application/json',
    'content-type': 'application/x-www-form-urlencoded'
  })
})

function workerEnv(overrides = {}) {
  return {
    AGENTTEAM_WORKER_PASSWORD: workerPassword,
    ...overrides
  }
}

function authHeaders() {
  return {
    authorization: `Bearer ${workerPassword}`
  }
}

function installFetch(fetchImpl) {
  const originalFetch = globalThis.fetch
  globalThis.fetch = fetchImpl
  return () => {
    globalThis.fetch = originalFetch
  }
}

function installConsoleLog(logImpl) {
  const originalLog = console.log
  console.log = logImpl
  return () => {
    console.log = originalLog
  }
}
