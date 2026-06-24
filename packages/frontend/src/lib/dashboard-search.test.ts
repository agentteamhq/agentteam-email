import { describe, expect, it } from 'vitest'

import { validateDashboardSearch } from './dashboard-search'

describe('dashboard search settings routing', () => {
  it('maps legacy personal CLI settings query values to Security', () => {
    expect(validateDashboardSearch({ settings: 'cli-access' }).settings).toBe('security')
    expect(validateDashboardSearch({ settings: 'cliAccess' }).settings).toBe('security')
  })

  it('keeps Agent Access query values separate from personal sessions', () => {
    expect(validateDashboardSearch({ settings: 'agent-access' }).settings).toBe('agentAccess')
    expect(validateDashboardSearch({ settings: 'agentAccess' }).settings).toBe('agentAccess')
  })

  it('maps Paperclip connection handoff query values to Agent Access', () => {
    expect(
      validateDashboardSearch({
        paperclip_company_id: 'paperclip-company-1',
        paperclip_plugin_id: 'agentteam.paperclip-email-plugin',
        source: 'paperclip'
      })
    ).toMatchObject({
      agentAccessSource: 'paperclip',
      paperclipCompanyId: 'paperclip-company-1',
      paperclipPluginId: 'agentteam.paperclip-email-plugin',
      settings: 'agentAccess'
    })
  })
})
