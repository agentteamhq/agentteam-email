import { describe, expect, it } from 'vitest'

import { validateDashboardSearch, validateSettingsSearch } from './dashboard-search'

describe('dashboard route search', () => {
  it('does not parse settings query aliases as dashboard-owned state', () => {
    expect.hasAssertions()
    for (const settings of [
      'cli-access',
      'cliAccess',
      'agent-access',
      'agentAccess',
      'connected-accounts',
      'integrations',
      'domains',
      'connectedAccounts',
      'security'
    ]) {
      expect(validateDashboardSearch({ settings })).not.toHaveProperty('settings')
    }
  })

  it('does not parse Paperclip handoff query values as dashboard-owned state', () => {
    expect.hasAssertions()
    const search = validateDashboardSearch({
      paperclip_company_id: 'paperclip-company-1',
      paperclip_plugin_id: 'agentteam.paperclip-email-plugin',
      source: 'paperclip'
    })

    expect(search).not.toHaveProperty('agentAccessSource')
    expect(search).not.toHaveProperty('integrationSource')
    expect(search).not.toHaveProperty('paperclipCompanyId')
    expect(search).not.toHaveProperty('paperclipPluginId')
  })

  it('keeps mailbox state without preserving settings-shaped query values', () => {
    expect.hasAssertions()
    const search = validateDashboardSearch({
      accountId: 'account-1',
      mailQuery: 'paperclip',
      settings: 'domains',
      source: 'paperclip',
      unreadOnly: 'true'
    })

    expect(search).toMatchObject({
      accountId: 'account-1',
      mailQuery: 'paperclip',
      unreadOnly: true
    })
    expect(search).not.toHaveProperty('settings')
    expect(search).not.toHaveProperty('agentAccessSource')
    expect(search).not.toHaveProperty('integrationSource')
  })
})

describe('settings route search', () => {
  it('maps Paperclip connection handoff query values to integration state', () => {
    expect.hasAssertions()
    expect(
      validateSettingsSearch({
        paperclip_company_id: 'paperclip-company-1',
        paperclip_plugin_id: 'agentteam.paperclip-email-plugin',
        source: 'paperclip'
      })
    ).toMatchObject({
      integrationSource: 'paperclip',
      paperclipCompanyId: 'paperclip-company-1',
      paperclipPluginId: 'agentteam.paperclip-email-plugin'
    })
  })

  it('keeps the legacy Agent Access handoff key as a Paperclip integration alias', () => {
    expect.hasAssertions()
    expect(
      validateSettingsSearch({
        agentAccessSource: 'paperclip',
        paperclipCompanyId: 'paperclip-company-1',
        paperclipPluginId: 'agentteam.paperclip-email-plugin'
      })
    ).toMatchObject({
      integrationSource: 'paperclip',
      paperclipCompanyId: 'paperclip-company-1',
      paperclipPluginId: 'agentteam.paperclip-email-plugin'
    })
  })
})
