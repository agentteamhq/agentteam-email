import { describe, expect, it } from 'vitest'

import { validateAgentMailWorkspaceInput } from './webmail-request-schemas'

describe('agent mail workspace request schema', () => {
  it('accepts the route search shape the browser and server render both send', () => {
    expect.hasAssertions()

    expect(
      validateAgentMailWorkspaceInput({
        accountId: 'research@agentteam.example',
        cursor: undefined,
        direction: 'next',
        folderId: 'junk-id',
        limit: 25,
        messageId: undefined,
        query: undefined,
        unreadOnly: true
      })
    ).toStrictEqual({
      input: {
        accountId: 'research@agentteam.example',
        cursor: undefined,
        direction: 'next',
        folderId: 'junk-id',
        limit: 25,
        messageId: undefined,
        query: undefined,
        unreadOnly: true
      },
      valid: true
    })
  })

  it('removes properties the workspace read does not accept', () => {
    expect.hasAssertions()

    expect(
      validateAgentMailWorkspaceInput({
        folderId: 'inbox-id',
        organizationId: 'other-organization-id'
      })
    ).toStrictEqual({
      input: { folderId: 'inbox-id' },
      valid: true
    })
  })

  it.each([
    ['a limit above the page maximum', { limit: 101 }],
    ['a limit below one', { limit: 0 }],
    ['a non-numeric limit', { limit: '25' }],
    ['an empty folder id', { folderId: '' }],
    ['a too-short account id', { accountId: 'ab' }],
    ['an unsupported pagination direction', { direction: 'sideways' }],
    ['a non-boolean unread filter', { unreadOnly: 'true' }]
  ])('rejects %s', (_label, input) => {
    expect.hasAssertions()

    expect(validateAgentMailWorkspaceInput(input).valid).toBe(false)
  })

  it('reports the failing schema path so invalid input is diagnosable', () => {
    expect.hasAssertions()
    const validation = validateAgentMailWorkspaceInput({ limit: 5000 })

    expect(validation.valid).toBe(false)
    expect(validation.valid ? [] : validation.errors).toStrictEqual([
      {
        message: 'Expected number to be less or equal to 100',
        path: '/limit'
      }
    ])
  })
})
