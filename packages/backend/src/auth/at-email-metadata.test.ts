import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('at-email public metadata', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
    vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.com')
  })

  it('serves at-email discovery metadata from the configured public hostname', async () => {
    expect.hasAssertions()

    const { handleAtEmailMetadataRequest } = await import('./at-email-metadata')
    const response = await handleAtEmailMetadataRequest(
      new Request('https://mail.example.com/.well-known/at-email.json')
    )

    expect(response?.status).toBe(200)
    expect(response?.headers.get('cache-control')).toBe('public, max-age=300')
    expect(await response?.json()).toStrictEqual({
      apiBase: 'https://mail.example.com',
      authBase: 'https://mail.example.com'
    })
  })

  it('serves HEAD requests without a response body', async () => {
    expect.hasAssertions()

    const { handleAtEmailMetadataRequest } = await import('./at-email-metadata')
    const response = await handleAtEmailMetadataRequest(
      new Request('https://mail.example.com/.well-known/at-email.json', { method: 'HEAD' })
    )

    expect(response?.status).toBe(200)
    expect(response?.headers.get('content-type')).toBe('application/json')
    expect(await response?.text()).toBe('')
  })

  it('rejects unsupported methods with an allow header', async () => {
    expect.hasAssertions()

    const { handleAtEmailMetadataRequest } = await import('./at-email-metadata')
    const response = await handleAtEmailMetadataRequest(
      new Request('https://mail.example.com/.well-known/at-email.json', { method: 'POST' })
    )

    expect(response?.status).toBe(405)
    expect(response?.headers.get('allow')).toBe('GET, HEAD')
  })

  it('ignores unrelated paths', async () => {
    expect.hasAssertions()

    const { handleAtEmailMetadataRequest } = await import('./at-email-metadata')
    const response = await handleAtEmailMetadataRequest(
      new Request('https://mail.example.com/.well-known/openid-configuration')
    )

    expect(response).toBeNull()
  })
})
