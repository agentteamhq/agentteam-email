import { beforeEach, describe, expect, it, vi } from 'vitest'

const forwardingGroupDeliveryTestState = vi.hoisted(() => ({
  globals: vi.fn(),
  updateOne: vi.fn()
}))

vi.mock('../globals', () => ({
  globals: forwardingGroupDeliveryTestState.globals
}))

describe('Agent Mail forwarding group delivery writeback', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('AT_EMAIL_ADMIN_CONTROL_TO_WEB_API_TOKEN', 'control-to-web-token')
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
    vi.stubEnv('ENCRYPT_SECRET_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.test')
    forwardingGroupDeliveryTestState.globals.mockReset()
    forwardingGroupDeliveryTestState.updateOne.mockReset()
    forwardingGroupDeliveryTestState.updateOne.mockReturnValue({
      exec: () => Promise.resolve({ matchedCount: 1, modifiedCount: 1 })
    })
    forwardingGroupDeliveryTestState.globals.mockResolvedValue({
      db: {
        models: {
          agentMailForwardingGroup: {
            updateOne: forwardingGroupDeliveryTestState.updateOne
          }
        }
      }
    })
  })

  it('rejects delivery reports without the scoped control-to-web token before DB access', async () => {
    expect.hasAssertions()
    const { handleAgentMailForwardingGroupDeliveryRequest } = await import('./forwarding-group-delivery')

    const response = await handleAgentMailForwardingGroupDeliveryRequest(
      new Request('https://mail.example.test/rpc/internal/agent-mail/forwarding-groups/deliveries', {
        body: JSON.stringify(validDeliveryReport()),
        method: 'POST'
      })
    )

    expect(response.status).toBe(401)
    expect(forwardingGroupDeliveryTestState.globals).not.toHaveBeenCalled()
  })

  it('records successful receive-side group fanout delivery by organization and group address', async () => {
    expect.hasAssertions()
    const { handleAgentMailForwardingGroupDeliveryRequest } = await import('./forwarding-group-delivery')

    const response = await handleAgentMailForwardingGroupDeliveryRequest(
      new Request('https://mail.example.test/rpc/internal/agent-mail/forwarding-groups/deliveries', {
        body: JSON.stringify(validDeliveryReport()),
        headers: {
          'X-Agent-Mail-Control-Web-Token': 'control-to-web-token'
        },
        method: 'POST'
      })
    )

    await expect(response.json()).resolves.toStrictEqual({
      matched: true,
      modified: true,
      success: true
    })
    expect(forwardingGroupDeliveryTestState.updateOne).toHaveBeenCalledWith(
      {
        address: 'qa@example.com',
        organizationId: '01960000-0000-7000-8000-000000000001'
      },
      {
        $max: { lastDeliveredAt: new Date('2026-07-02T19:19:44.000Z') }
      }
    )
  })

  it('accepts valid delivery reports even when the group no longer exists', async () => {
    expect.hasAssertions()
    forwardingGroupDeliveryTestState.updateOne.mockReturnValue({
      exec: () => Promise.resolve({ matchedCount: 0, modifiedCount: 0 })
    })
    const { handleAgentMailForwardingGroupDeliveryRequest } = await import('./forwarding-group-delivery')

    const response = await handleAgentMailForwardingGroupDeliveryRequest(
      new Request('https://mail.example.test/rpc/internal/agent-mail/forwarding-groups/deliveries', {
        body: JSON.stringify(validDeliveryReport()),
        headers: {
          'X-Agent-Mail-Control-Web-Token': 'control-to-web-token'
        },
        method: 'POST'
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toStrictEqual({
      matched: false,
      modified: false,
      success: true
    })
  })
})

function validDeliveryReport() {
  return {
    delivered_at: '2026-07-02T19:19:44.000Z',
    group_address: 'QA@Example.Com',
    local_route_id: '019f2446-4f1d-7ee2-b758-084af44ef8a2',
    organization_id: '01960000-0000-7000-8000-000000000001',
    source_ingest_id: '019f2446-0f0c-7cbd-b6c9-3f193510544f',
    target_mailbox: 'Research@Example.Com'
  }
}
