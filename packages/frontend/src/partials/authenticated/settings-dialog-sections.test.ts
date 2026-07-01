import { describe, expect, it } from 'vitest'

import { getSettingsSectionFromSegment, resolveSettingsRouteSegment } from './settings-dialog-sections'

describe('settings section routing', () => {
  it('maps legacy personal CLI settings destinations to Security', () => {
    expect(resolveSettingsRouteSegment('cli-access')).toStrictEqual({
      href: '/settings/security/',
      type: 'redirect'
    })
    expect(resolveSettingsRouteSegment('developer')).toStrictEqual({
      href: '/settings/security/',
      type: 'redirect'
    })
  })

  it('maps canonical kebab-case settings segments to separate sections', () => {
    expect(getSettingsSectionFromSegment('connected-accounts')).toBe('connected-accounts')
    expect(getSettingsSectionFromSegment('domains')).toBe('domains')
    expect(getSettingsSectionFromSegment('agent-access')).toBe('agentAccess')
  })

  it('does not silently accept camelCase route segments', () => {
    expect(resolveSettingsRouteSegment('connectedAccounts')).toStrictEqual({ type: 'notFound' })
    expect(resolveSettingsRouteSegment('agentAccess')).toStrictEqual({ type: 'notFound' })
    expect(resolveSettingsRouteSegment('cliAccess')).toStrictEqual({ type: 'notFound' })
  })
})
