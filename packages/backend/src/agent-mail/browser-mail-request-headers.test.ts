import { describe, expect, it } from 'vitest'

import {
  AGENT_MAIL_AUTH_SURFACE_HEADER,
  AGENT_MAIL_BROWSER_RPC_AUTH_SURFACE,
  AGENT_MAIL_BROWSER_RPC_ROUTE_PREFIX,
  AGENT_MAIL_ROUTE_PREFIX_HEADER,
  browserSessionMailRequestHeaders,
  stripNonBrowserMailCredentialHeaders
} from './browser-mail-request-headers'

/**
 * Every credential and caller-context header the browser mail surfaces must refuse. A
 * browser surface accepts the Better Auth session only, so each of these must be gone before
 * request headers reach an Agent Mail authorization helper.
 */
const NON_BROWSER_CREDENTIAL_HEADERS = {
  authorization: 'Bearer agent-auth-jwt',
  'x-agentteam-organization-id': 'other-organization-id',
  'x-agentteam-paperclip-agent-id': 'paperclip-agent-id',
  'x-agentteam-paperclip-company-id': 'paperclip-company-id',
  'x-agentteam-paperclip-operation': 'paperclip-operation',
  'x-agentteam-paperclip-plugin-id': 'paperclip-plugin-id',
  'x-agentteam-paperclip-project-id': 'paperclip-project-id',
  'x-agentteam-paperclip-run-id': 'paperclip-run-id',
  'x-agentteam-request-method': 'POST',
  'x-agentteam-request-url': 'https://mail.example.com/api/mail/workspace',
  'x-api-key': 'api-key-value'
} as const

const BROWSER_SESSION_COOKIE = 'better-auth.session_token=browser-session'

describe('browser mail request headers', () => {
  it('strips every non-browser credential header', () => {
    expect.hasAssertions()

    const headers = browserSessionMailRequestHeaders(createMailRequest())

    for (const strippedHeader of Object.keys(NON_BROWSER_CREDENTIAL_HEADERS)) {
      expect(headers.get(strippedHeader)).toBeNull()
    }
  })

  it('keeps the Better Auth browser session credential', () => {
    expect.hasAssertions()

    const headers = browserSessionMailRequestHeaders(createMailRequest())

    expect(headers.get('cookie')).toBe(BROWSER_SESSION_COOKIE)
  })

  it('pins the authorization surface to browser RPC even when the caller claims another', () => {
    expect.hasAssertions()

    const headers = browserSessionMailRequestHeaders(
      createMailRequest({ [AGENT_MAIL_AUTH_SURFACE_HEADER]: 'api' })
    )

    expect(headers.get(AGENT_MAIL_AUTH_SURFACE_HEADER)).toBe(AGENT_MAIL_BROWSER_RPC_AUTH_SURFACE)
  })

  it('pins the route prefix to the browser RPC mail surface even when the caller claims another', () => {
    expect.hasAssertions()

    const headers = browserSessionMailRequestHeaders(
      createMailRequest({ [AGENT_MAIL_ROUTE_PREFIX_HEADER]: '/api/mail' })
    )

    expect(headers.get(AGENT_MAIL_ROUTE_PREFIX_HEADER)).toBe(AGENT_MAIL_BROWSER_RPC_ROUTE_PREFIX)
  })

  it('strips non-browser credential headers in place', () => {
    expect.hasAssertions()

    const headers = new Headers({
      ...NON_BROWSER_CREDENTIAL_HEADERS,
      cookie: BROWSER_SESSION_COOKIE
    })

    stripNonBrowserMailCredentialHeaders(headers)

    expect([...headers.keys()]).toStrictEqual(['cookie'])
  })
})

function createMailRequest(extraHeaders: Record<string, string> = {}) {
  return new Request('https://mail.example.com/dashboard/', {
    headers: {
      ...NON_BROWSER_CREDENTIAL_HEADERS,
      cookie: BROWSER_SESSION_COOKIE,
      ...extraHeaders
    }
  })
}
