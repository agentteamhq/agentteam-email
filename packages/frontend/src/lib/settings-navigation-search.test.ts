import { describe, expect, it } from 'vitest'

import { settingsNavigationHrefWithRetainedSearch } from './settings-navigation-search'

const baseURL = 'https://mail.example.com'
const mailboxSearch = '?folderId=junk-id&mailboxAdmin=accounts&unreadOnly=true'

describe('settings navigation search retention', () => {
  it('retains the shell search contract on settings and organization targets', () => {
    expect.hasAssertions()

    for (const targetHref of [
      '/settings',
      '/settings/account',
      '/settings/account/',
      '/settings/security',
      '/settings/domains/',
      '/organization/settings',
      '/organization/people/'
    ]) {
      const href = settingsNavigationHrefWithRetainedSearch({
        baseURL,
        currentSearch: '?folderId=junk-id',
        targetHref
      })

      expect(href).toBe(`${targetHref}?folderId=junk-id`)
    }
  })

  it('retains every validated shell search param', () => {
    expect.hasAssertions()
    const href = settingsNavigationHrefWithRetainedSearch({
      baseURL,
      currentSearch: mailboxSearch,
      targetHref: '/settings/account'
    })
    const retained = new URL(href, baseURL).searchParams

    expect(retained.get('folderId')).toBe('junk-id')
    expect(retained.get('mailboxAdmin')).toBe('accounts')
    expect(retained.get('unreadOnly')).toBe('true')
  })

  it('drops search values the shell does not own', () => {
    expect.hasAssertions()
    const href = settingsNavigationHrefWithRetainedSearch({
      baseURL,
      currentSearch: '?folderId=junk-id&reset_success=1&token=recovery-token',
      targetHref: '/settings/account'
    })

    expect(href).toBe('/settings/account?folderId=junk-id')
  })

  it('keeps params the target already carries', () => {
    expect.hasAssertions()
    const href = settingsNavigationHrefWithRetainedSearch({
      baseURL,
      currentSearch: '?folderId=junk-id&accountId=research@agentteam.example',
      targetHref: '/settings/account?folderId=inbox-id'
    })
    const retained = new URL(href, baseURL).searchParams

    expect(retained.get('folderId')).toBe('inbox-id')
    expect(retained.get('accountId')).toBe('research@agentteam.example')
  })

  it('keeps the target hash', () => {
    expect.hasAssertions()

    expect(
      settingsNavigationHrefWithRetainedSearch({
        baseURL,
        currentSearch: '?folderId=junk-id',
        targetHref: '/settings/security#sessions'
      })
    ).toBe('/settings/security?folderId=junk-id#sessions')
  })

  it('passes auth flow and non-shell targets through unchanged', () => {
    expect.hasAssertions()

    for (const targetHref of [
      '/signin',
      '/signin?reset_success=1',
      '/signout',
      '/signup',
      '/forgot-password',
      '/reset-password?token=recovery-token',
      '/verify-email',
      '/recovery-email-sent/',
      '/dashboard/',
      '/device/capabilities/?approval_id=1',
      '/settings/unknown-section',
      '/organization',
      'https://other.example.com/settings/account'
    ]) {
      expect(
        settingsNavigationHrefWithRetainedSearch({
          baseURL,
          currentSearch: mailboxSearch,
          targetHref
        })
      ).toBe(targetHref)
    }
  })

  it('passes settings targets through unchanged when the shell has no search', () => {
    expect.hasAssertions()

    for (const currentSearch of ['', '?', '?reset_success=1']) {
      expect(
        settingsNavigationHrefWithRetainedSearch({
          baseURL,
          currentSearch,
          targetHref: '/settings/account'
        })
      ).toBe('/settings/account')
    }
  })
})
