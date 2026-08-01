import { describe, expect, it } from 'vitest'

import {
  getOrganizationSettingsSectionFromSegment,
  getSettingsSectionForRoutePathname,
  getSettingsSectionForRouteSegments,
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

  it('maps a missing settings segment to the default settings section', () => {
    expect(getSettingsSectionFromSegment(undefined)).toBe('account')
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

  it('maps matched route segments to the settings surface the route shows', () => {
    expect(getSettingsSectionForRouteSegments('settings', undefined)).toBe('account')
    expect(getSettingsSectionForRouteSegments('settings', 'domains')).toBe('domains')
    expect(getSettingsSectionForRouteSegments('settings', 'connected-accounts')).toBe('connected-accounts')
    expect(getSettingsSectionForRouteSegments('organization', 'settings')).toBe('organizationSettings')
    expect(getSettingsSectionForRouteSegments('organization', 'people')).toBe('organizationPeople')
  })

  it('closes settings for route segments that are not a settings surface', () => {
    expect(getSettingsSectionForRouteSegments('settings', 'nope')).toBeNull()
    expect(getSettingsSectionForRouteSegments('organization', 'nope')).toBeNull()
    expect(getSettingsSectionForRouteSegments('organization', undefined)).toBeNull()
    expect(getSettingsSectionForRouteSegments('dashboard', undefined)).toBeNull()
    expect(getSettingsSectionForRouteSegments(undefined, undefined)).toBeNull()
  })
})

describe('settings route pathnames', () => {
  it('maps canonical settings route pathnames to their settings sections', () => {
    expect(getSettingsSectionForRoutePathname('/settings/')).toBe('account')
    expect(getSettingsSectionForRoutePathname('/settings')).toBe('account')
    expect(getSettingsSectionForRoutePathname('/settings/domains/')).toBe('domains')
    expect(getSettingsSectionForRoutePathname('/settings/agent-access/')).toBe('agentAccess')
    expect(getSettingsSectionForRoutePathname('/settings/connected-accounts/?cloudflareIntentId=abc')).toBe(
      'connected-accounts'
    )
  })

  it('maps canonical organization route pathnames to their settings sections', () => {
    expect(getSettingsSectionForRoutePathname('/organization/settings/')).toBe('organizationSettings')
    expect(getSettingsSectionForRoutePathname('/organization/people/')).toBe('organizationPeople')
  })

  it('decodes percent-encoded segments so pathnames agree with matched route params', () => {
    expect(getSettingsSectionForRoutePathname('/settings/%64omains/')).toBe('domains')
  })

  it('closes settings for unknown segments, deeper paths, and non-settings routes', () => {
    expect(getSettingsSectionForRoutePathname('/settings/nope/')).toBeNull()
    expect(getSettingsSectionForRoutePathname('/organization/nope/')).toBeNull()
    expect(getSettingsSectionForRoutePathname('/organization/')).toBeNull()
    expect(getSettingsSectionForRoutePathname('/settings/domains/extra/')).toBeNull()
    expect(getSettingsSectionForRoutePathname('/dashboard/')).toBeNull()
    expect(getSettingsSectionForRoutePathname('/')).toBeNull()
  })
})
