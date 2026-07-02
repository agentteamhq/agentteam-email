import { describe, expect, it } from 'vitest'

import { validateDashboardSearch } from './dashboard-search'

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

  it('keeps mailbox state without preserving settings-shaped query values', () => {
    expect.hasAssertions()
    const search = validateDashboardSearch({
      accountId: 'account-1',
      mailQuery: 'paperclip',
      settings: 'domains',
      unreadOnly: 'true'
    })

    expect(search).toMatchObject({
      accountId: 'account-1',
      mailQuery: 'paperclip',
      unreadOnly: true
    })
    expect(search).not.toHaveProperty('settings')
  })
})
