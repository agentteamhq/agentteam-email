import { describe, expect, it } from 'vitest'

import {
  getOrganizationSettingsSectionFromSegment,
  getSettingsSectionFromPathname,
  getSettingsSectionFromSegment,
  resolveOrganizationRouteSegment,
  resolveSettingsRouteSegment
} from './settings-dialog-sections'

describe('settings section routing', () => {
  it('does not retain stale personal settings aliases', () => {
    expect(resolveSettingsRouteSegment('cli-access')).toStrictEqual({ type: 'notFound' })
    expect(resolveSettingsRouteSegment('developer')).toStrictEqual({ type: 'notFound' })
  })

  it('maps canonical kebab-case settings segments to separate sections', () => {
    expect(getSettingsSectionFromSegment('connected-accounts')).toBe('connected-accounts')
    expect(getSettingsSectionFromSegment('integrations')).toBe('integrations')
    expect(getSettingsSectionFromSegment('domains')).toBe('domains')
    expect(getSettingsSectionFromSegment('agent-access')).toBe('agentAccess')
  })

  it('does not conflate connected accounts with integrations', () => {
    expect(resolveSettingsRouteSegment('connected-accounts')).toStrictEqual({
      section: 'connected-accounts',
      type: 'section'
    })
    expect(resolveSettingsRouteSegment('integrations')).toStrictEqual({
      section: 'integrations',
      type: 'section'
    })
  })

  it('maps settings route pathnames to active settings sections', () => {
    expect(getSettingsSectionFromPathname('/settings/')).toBe('account')
    expect(getSettingsSectionFromPathname('/settings/domains/')).toBe('domains')
    expect(getSettingsSectionFromPathname('/settings/connected-accounts/?cloudflareIntentId=abc')).toBe(
      'connected-accounts'
    )
    expect(getSettingsSectionFromPathname('/dashboard/')).toBeNull()
  })

  it('does not silently accept camelCase route segments', () => {
    expect(resolveSettingsRouteSegment('connectedAccounts')).toStrictEqual({ type: 'notFound' })
    expect(resolveSettingsRouteSegment('agentAccess')).toStrictEqual({ type: 'notFound' })
    expect(resolveSettingsRouteSegment('cliAccess')).toStrictEqual({ type: 'notFound' })
  })

  it('maps canonical organization settings route segments to their settings sections', () => {
    expect(getOrganizationSettingsSectionFromSegment('settings')).toBe('organizationSettings')
    expect(getOrganizationSettingsSectionFromSegment('people')).toBe('organizationPeople')
    expect(resolveOrganizationRouteSegment('nope')).toStrictEqual({ type: 'notFound' })
    expect(resolveOrganizationRouteSegment('organizationSettings')).toStrictEqual({ type: 'notFound' })
  })
})
