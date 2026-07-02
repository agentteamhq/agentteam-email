import { beforeEach, describe, expect, it, vi } from 'vitest'

const integrationsTestState = vi.hoisted(() => ({
  auditLogCreate: vi.fn(),
  getSession: vi.fn(),
  memberFindOne: vi.fn(),
  oauthAccessTokenDeleteMany: vi.fn(),
  oauthClientFind: vi.fn(),
  oauthClientFindOne: vi.fn(),
  oauthConsentDeleteMany: vi.fn(),
  oauthConsentFind: vi.fn(),
  oauthRefreshTokenFind: vi.fn(),
  oauthRefreshTokenUpdateMany: vi.fn()
}))

vi.mock('../globals', () => ({
  globals: async () => ({
    auth: {
      api: {
        getSession: integrationsTestState.getSession
      }
    },
    db: {
      models: {
        auditLog: {
          create: integrationsTestState.auditLogCreate
        },
        member: {
          findOne: integrationsTestState.memberFindOne
        },
        oauthAccessToken: {
          deleteMany: integrationsTestState.oauthAccessTokenDeleteMany
        },
        oauthClient: {
          find: integrationsTestState.oauthClientFind,
          findOne: integrationsTestState.oauthClientFindOne
        },
        oauthConsent: {
          deleteMany: integrationsTestState.oauthConsentDeleteMany,
          find: integrationsTestState.oauthConsentFind
        },
        oauthRefreshToken: {
          find: integrationsTestState.oauthRefreshTokenFind,
          updateMany: integrationsTestState.oauthRefreshTokenUpdateMany
        }
      }
    }
  })
}))

describe('integrations service', () => {
  beforeEach(() => {
    vi.resetModules()
    integrationsTestState.auditLogCreate.mockReset()
    integrationsTestState.getSession.mockReset()
    integrationsTestState.memberFindOne.mockReset()
    integrationsTestState.oauthAccessTokenDeleteMany.mockReset()
    integrationsTestState.oauthClientFind.mockReset()
    integrationsTestState.oauthClientFindOne.mockReset()
    integrationsTestState.oauthConsentDeleteMany.mockReset()
    integrationsTestState.oauthConsentFind.mockReset()
    integrationsTestState.oauthRefreshTokenFind.mockReset()
    integrationsTestState.oauthRefreshTokenUpdateMany.mockReset()

    integrationsTestState.getSession.mockResolvedValue({
      session: {
        activeOrganizationId: '01960000-0000-7000-8000-0000000000aa'
      },
      user: {
        id: '01960000-0000-7000-8000-0000000000bb'
      }
    })
    integrationsTestState.memberFindOne.mockReturnValue(execQuery({ role: 'member' }))
    integrationsTestState.auditLogCreate.mockResolvedValue({})
  })

  it('returns Paperclip OAuth authorization status without secret-bearing client metadata', async () => {
    expect.hasAssertions()

    integrationsTestState.oauthClientFind.mockReturnValue(
      execQuery([
        {
          clientId: 'paperclip-client-z',
          clientSecret: 'secret-z',
          disabled: true,
          metadata: {
            agentteamEmail: {
              companyId: 'paperclip-company-z',
              integration: 'paperclip',
              pluginId: 'agentteam.paperclip-email-plugin'
            }
          },
          name: 'Zulu Paperclip',
          softwareId: 'agentteam.paperclip-email-plugin'
        },
        {
          clientId: 'paperclip-client-a',
          clientSecret: 'secret-a',
          disabled: false,
          metadata: {
            agentteamEmail: {
              integration: 'paperclip',
              pluginId: 'agentteam.paperclip-email-plugin'
            }
          },
          name: 'Alpha Paperclip',
          softwareId: 'agentteam.paperclip-email-plugin'
        },
        {
          clientId: 'paperclip-client-unnamed',
          clientSecret: 'secret-unnamed',
          disabled: false,
          metadata: {
            agentteamEmail: {
              integration: 'paperclip',
              pluginId: 'agentteam.paperclip-email-plugin'
            }
          },
          name: '   ',
          softwareId: 'agentteam.paperclip-email-plugin'
        },
        {
          clientId: 'other-client',
          disabled: false,
          metadata: null,
          name: 'Other client',
          softwareId: 'other-plugin'
        }
      ])
    )
    integrationsTestState.oauthConsentFind.mockReturnValue(
      execQuery([
        { clientId: 'paperclip-client-a' },
        { clientId: 'paperclip-client-unnamed' },
        { clientId: 'paperclip-client-z' }
      ])
    )
    integrationsTestState.oauthRefreshTokenFind.mockReturnValue(
      execQuery([{ clientId: 'paperclip-client-a' }])
    )

    const { getIntegrationsViewForWeb } = await import('./service')
    const view = await getIntegrationsViewForWeb({ headers: new Headers() })

    expect(view).toStrictEqual({
      allowedActions: {
        revokePaperclip: true
      },
      organizationId: '01960000-0000-7000-8000-0000000000aa',
      paperclip: {
        available: true,
        connections: [
          {
            clientId: 'paperclip-client-a',
            name: 'Alpha Paperclip',
            pluginId: 'agentteam.paperclip-email-plugin',
            requiresReauthorization: false,
            status: 'connected'
          },
          {
            clientId: 'paperclip-client-z',
            name: 'Zulu Paperclip',
            pluginId: 'agentteam.paperclip-email-plugin',
            requiresReauthorization: false,
            status: 'unavailable'
          }
        ]
      },
      state: 'ready'
    })
    expect(JSON.stringify(view)).not.toContain('secret')
    expect(JSON.stringify(view)).not.toContain('paperclip-company')
  })

  it('revokes Paperclip OAuth consent and active tokens for the current user organization', async () => {
    expect.hasAssertions()

    integrationsTestState.oauthClientFindOne.mockReturnValue(
      execQuery({
        clientId: 'paperclip-client-a',
        disabled: false,
        metadata: {
          agentteamEmail: {
            integration: 'paperclip',
            pluginId: 'agentteam.paperclip-email-plugin'
          }
        },
        name: 'Alpha Paperclip',
        softwareId: 'agentteam.paperclip-email-plugin'
      })
    )
    integrationsTestState.oauthConsentDeleteMany.mockReturnValue(execQuery({ deletedCount: 1 }))
    integrationsTestState.oauthRefreshTokenUpdateMany.mockReturnValue(execQuery({ modifiedCount: 2 }))
    integrationsTestState.oauthAccessTokenDeleteMany.mockReturnValue(execQuery({ deletedCount: 3 }))
    integrationsTestState.oauthClientFind.mockReturnValue(execQuery([]))
    integrationsTestState.oauthConsentFind.mockReturnValue(execQuery([]))
    integrationsTestState.oauthRefreshTokenFind.mockReturnValue(execQuery([]))

    const { revokePaperclipIntegrationForWeb } = await import('./service')
    const result = await revokePaperclipIntegrationForWeb({
      headers: new Headers(),
      input: {
        clientId: 'paperclip-client-a'
      }
    })

    expect(result.status).toBe('revoked')
    expect(integrationsTestState.oauthConsentDeleteMany).toHaveBeenCalledWith({
      clientId: 'paperclip-client-a',
      referenceId: '01960000-0000-7000-8000-0000000000aa',
      userId: '01960000-0000-7000-8000-0000000000bb'
    })
    expect(integrationsTestState.oauthRefreshTokenUpdateMany).toHaveBeenCalledWith(
      {
        clientId: 'paperclip-client-a',
        referenceId: '01960000-0000-7000-8000-0000000000aa',
        revoked: null,
        userId: '01960000-0000-7000-8000-0000000000bb'
      },
      {
        $set: {
          revoked: expect.any(Date)
        }
      }
    )
    expect(integrationsTestState.oauthAccessTokenDeleteMany).toHaveBeenCalledWith({
      clientId: 'paperclip-client-a',
      referenceId: '01960000-0000-7000-8000-0000000000aa',
      userId: '01960000-0000-7000-8000-0000000000bb'
    })
    expect(integrationsTestState.auditLogCreate).toHaveBeenCalledWith({
      action: 'integrations.paperclip_oauth.revoked',
      metadata: {
        clientId: 'paperclip-client-a',
        organizationId: '01960000-0000-7000-8000-0000000000aa'
      },
      severity: 'medium',
      status: 'success',
      userId: '01960000-0000-7000-8000-0000000000bb'
    })
  })
})

function execQuery<TValue>(value: TValue) {
  return {
    exec: () => Promise.resolve(value)
  }
}
