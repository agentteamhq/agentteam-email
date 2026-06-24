import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('WildDuck client', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
    vi.stubEnv('ENCRYPT_SECRET_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.test')
  })

  it('throws a safe error without exposing WildDuck response details', async () => {
    expect.hasAssertions()
    const { WildDuckAPIError, WildDuckClient } = await import('./wildduck-client')
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'Authentication failed for token wd_secret_123',
          error: 'WildDuck rejected x-access-token wd_secret_123 for user internal_user_456'
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 403,
          statusText: 'Forbidden'
        }
      )
    )
    const client = new WildDuckClient(
      new URL('https://wildduck.example.test'),
      'fake-wildduck-token',
      fetchImplementation
    )

    try {
      await client.listUsers('support@example.test')
      throw new Error('Expected WildDuck request to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(WildDuckAPIError)
      expect(error).toMatchObject({
        code: undefined,
        message: 'Mail service authorization failed.',
        status: 403
      })
      expect(JSON.stringify(error)).not.toContain('wd_secret_123')
      expect(JSON.stringify(error)).not.toContain('internal_user_456')
    }
  })

  it('rejects malformed successful WildDuck JSON before returning typed list responses', async () => {
    expect.hasAssertions()
    const { WildDuckAPIError, WildDuckClient } = await import('./wildduck-client')
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'unexpected body with token wd_secret_456'
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200
        }
      )
    )
    const client = new WildDuckClient(
      new URL('https://wildduck.example.test'),
      'fake-wildduck-token',
      fetchImplementation
    )

    try {
      await client.listUsers('support@example.test')
      throw new Error('Expected malformed WildDuck list response to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(WildDuckAPIError)
      expect(error).toMatchObject({
        message: 'Mail service returned an invalid response.',
        status: 502
      })
      expect(JSON.stringify(error)).not.toContain('wd_secret_456')
    }
  })

  it('accepts WildDuck mailboxes with null specialUse values', async () => {
    expect.hasAssertions()
    const { WildDuckClient } = await import('./wildduck-client')
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              id: 'inbox-id',
              name: 'INBOX',
              path: 'INBOX',
              specialUse: null,
              total: 1,
              unseen: 1
            }
          ],
          success: true
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200
        }
      )
    )
    const client = new WildDuckClient(
      new URL('https://wildduck.example.test'),
      'fake-wildduck-token',
      fetchImplementation
    )

    await expect(client.listMailboxes('user-id')).resolves.toStrictEqual({
      results: [
        {
          id: 'inbox-id',
          name: 'INBOX',
          path: 'INBOX',
          specialUse: null,
          total: 1,
          unseen: 1
        }
      ],
      success: true
    })
  })

  it('accepts WildDuck message attachments with null content ids', async () => {
    expect.hasAssertions()
    const { WildDuckClient } = await import('./wildduck-client')
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          nextCursor: false,
          previousCursor: false,
          results: [
            {
              attachments: true,
              attachmentsList: [
                {
                  cid: null,
                  contentType: 'text/plain',
                  disposition: 'attachment',
                  filename: 'message.txt',
                  id: 'ATT00001',
                  size: 12
                }
              ],
              id: 42,
              mailbox: 'inbox-id',
              thread: 'thread-id'
            }
          ],
          success: true
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200
        }
      )
    )
    const client = new WildDuckClient(
      new URL('https://wildduck.example.test'),
      'fake-wildduck-token',
      fetchImplementation
    )

    await expect(client.listMessages('user-id', 'inbox-id')).resolves.toMatchObject({
      results: [
        {
          attachmentsList: [
            {
              cid: null,
              id: 'ATT00001'
            }
          ],
          id: 42
        }
      ]
    })
  })

  it('accepts WildDuck message move update responses', async () => {
    expect.hasAssertions()
    const { WildDuckClient } = await import('./wildduck-client')
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: [[476, 1]],
          success: true
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200
        }
      )
    )
    const client = new WildDuckClient(
      new URL('https://wildduck.example.test'),
      'fake-wildduck-token',
      fetchImplementation
    )

    await expect(
      client.updateMessage('user-id', 'inbox-id', '476', {
        moveTo: 'reviewed-id'
      })
    ).resolves.toStrictEqual({
      id: [[476, 1]],
      success: true
    })
  })
})
