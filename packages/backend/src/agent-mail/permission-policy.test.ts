import { describe, expect, it } from 'vitest'

import { agentMailSubject, buildAgentMailAbility } from './permission-policy'
import type {
  AgentCapabilityGrantDocument,
  AgentMailPrincipalType,
  AgentMailSystemGrantDocument,
  OrganizationId
} from '@main/db'

const organizationId = 'org-1' as OrganizationId

describe('Agent Mail permission policy', () => {
  it('does not let broad agent management grant unrelated mailbox capabilities', () => {
    expect.hasAssertions()
    const ability = buildAgentMailAbility({
      capabilityGrants: [
        capabilityGrant({
          capability: 'email.agent.manage',
          constraints: { organizationId }
        })
      ],
      mailboxGrants: [],
      principal: agentPrincipal(),
      systemGrants: []
    })

    expect(
      ability.can('manage', agentMailSubject('Agent', { agentId: 'target-agent', organizationId }))
    ).toBe(true)
    expect(
      ability.can(
        'manage',
        agentMailSubject('OAuthConnection', {
          organizationId,
          pluginId: 'agentteam.paperclip-email-plugin'
        })
      )
    ).toBe(false)
    expect(
      ability.can(
        'manage',
        agentMailSubject('OAuthConnection', {
          organizationId: 'org-2' as OrganizationId,
          pluginId: 'agentteam.paperclip-email-plugin'
        })
      )
    ).toBe(false)
    expect(
      ability.can(
        'manage',
        agentMailSubject('AgentGrant', {
          agentId: 'target-agent',
          capability: 'email.agent.manage',
          organizationId
        })
      )
    ).toBe(true)
    expect(
      ability.can(
        'manage',
        agentMailSubject('AgentGrant', {
          agentId: 'target-agent',
          capability: 'email.message.read',
          mailboxAddress: 'support@example.test',
          organizationId
        })
      )
    ).toBe(false)

    const oauthAbility = buildAgentMailAbility({
      capabilityGrants: [
        capabilityGrant({
          capability: 'email.oauth_connection.manage',
          constraints: { organizationId }
        })
      ],
      mailboxGrants: [],
      principal: agentPrincipal(),
      systemGrants: []
    })
    expect(
      oauthAbility.can(
        'manage',
        agentMailSubject('OAuthConnection', {
          organizationId,
          pluginId: 'agentteam.paperclip-email-plugin'
        })
      )
    ).toBe(true)
  })

  it('requires exact mailbox capability and mailbox constraints for grant management', () => {
    expect.hasAssertions()
    const ability = buildAgentMailAbility({
      capabilityGrants: [
        capabilityGrant({
          capability: 'email.message.read',
          constraints: {
            mailboxAddress: 'support@example.test',
            organizationId
          }
        })
      ],
      mailboxGrants: [],
      principal: agentPrincipal(),
      systemGrants: []
    })

    expect(
      ability.can(
        'manage',
        agentMailSubject('AgentGrant', {
          agentId: 'target-agent',
          capability: 'email.message.read',
          mailboxAddress: 'support@example.test',
          organizationId
        })
      )
    ).toBe(true)
    expect(
      ability.can(
        'manage',
        agentMailSubject('AgentGrant', {
          agentId: 'target-agent',
          capability: 'email.message.send',
          mailboxAddress: 'support@example.test',
          organizationId
        })
      )
    ).toBe(false)
    expect(
      ability.can(
        'manage',
        agentMailSubject('AgentGrant', {
          agentId: 'target-agent',
          capability: 'email.message.read',
          mailboxAddress: 'billing@example.test',
          organizationId
        })
      )
    ).toBe(false)
  })

  it('parses Better Auth JSON string capability constraints before building ability rules', () => {
    expect.hasAssertions()
    const ability = buildAgentMailAbility({
      capabilityGrants: [
        capabilityGrant({
          capability: 'email.message.read',
          constraints: JSON.stringify({
            mailboxAddress: 'support@example.test',
            organizationId
          })
        }),
        capabilityGrant({
          capability: 'email.status',
          constraints: JSON.stringify({ organizationId })
        })
      ],
      mailboxGrants: [],
      principal: agentPrincipal(),
      systemGrants: []
    })

    expect(ability.can('status', agentMailSubject('Organization', { organizationId }))).toBe(true)
    expect(
      ability.can(
        'read',
        agentMailSubject('Mailbox', { mailboxAddress: 'support@example.test', organizationId })
      )
    ).toBe(true)
    expect(
      ability.can(
        'read',
        agentMailSubject('Mailbox', { mailboxAddress: 'billing@example.test', organizationId })
      )
    ).toBe(false)
  })

  it('keeps mailbox send selectable but fails closed on constrained message sends without recipients', () => {
    expect.hasAssertions()
    const ability = buildAgentMailAbility({
      capabilityGrants: [
        capabilityGrant({
          capability: 'email.message.send',
          constraints: {
            allowedRecipientDomains: ['example.net'],
            mailboxAddress: 'support@example.test',
            organizationId
          }
        })
      ],
      mailboxGrants: [],
      principal: agentPrincipal(),
      systemGrants: []
    })

    expect(
      ability.can(
        'send',
        agentMailSubject('Mailbox', { mailboxAddress: 'support@example.test', organizationId })
      )
    ).toBe(true)
    expect(
      ability.can(
        'send',
        agentMailSubject('Draft', { mailboxAddress: 'support@example.test', organizationId })
      )
    ).toBe(true)
    expect(
      ability.can(
        'send',
        agentMailSubject('Message', { mailboxAddress: 'support@example.test', organizationId })
      )
    ).toBe(false)
    expect(
      ability.can(
        'send',
        agentMailSubject('Message', {
          mailboxAddress: 'support@example.test',
          organizationId,
          recipientAddresses: ['person@example.net']
        })
      )
    ).toBe(true)
    expect(
      ability.can(
        'send',
        agentMailSubject('Message', {
          mailboxAddress: 'support@example.test',
          organizationId,
          recipientAddresses: ['person@blocked.test']
        })
      )
    ).toBe(false)
  })

  it('allows an exact constrained recipient when the message recipient has a display name', () => {
    expect.hasAssertions()
    const ability = constrainedSendAbility({
      allowedRecipients: ['person@example.net']
    })

    expect(canSendMessageTo(ability, ['Person Example <Person@Example.Net>'])).toBe(true)
  })

  it('allows a constrained recipient domain when the message recipient has a display name', () => {
    expect.hasAssertions()
    const ability = constrainedSendAbility({
      allowedRecipientDomains: ['example.net']
    })

    expect(canSendMessageTo(ability, ['Recipient <recipient@Example.Net>'])).toBe(true)
  })

  it('allows a constrained recipient domain when the message recipient has an RFC comment', () => {
    expect.hasAssertions()
    const ability = constrainedSendAbility({
      allowedRecipientDomains: ['example.net']
    })

    expect(canSendMessageTo(ability, ['recipient@example.net (Recipient)'])).toBe(true)
  })

  it('allows a constrained recipient domain when the message recipient has an IDNA domain', () => {
    expect.hasAssertions()
    const ability = constrainedSendAbility({
      allowedRecipientDomains: ['xn--exmple-cua.com']
    })

    expect(canSendMessageTo(ability, ['Recipient <recipient@Exämple.com>'])).toBe(true)
  })

  it('allows an exact constrained recipient when the message recipient has an IDNA domain', () => {
    expect.hasAssertions()
    const ability = constrainedSendAbility({
      allowedRecipients: ['recipient@xn--exmple-cua.com']
    })

    expect(canSendMessageTo(ability, ['Recipient <recipient@Exämple.com>'])).toBe(true)
  })

  it('matches constrained recipient patterns against the parsed mailbox address', () => {
    expect.hasAssertions()
    const ability = constrainedSendAbility({
      allowedRecipientPatterns: ['*@example.net']
    })

    expect(canSendMessageTo(ability, ['Recipient <recipient@example.net>'])).toBe(true)
  })

  it('matches constrained recipient patterns against the IDNA-normalized parsed mailbox address', () => {
    expect.hasAssertions()
    const ability = constrainedSendAbility({
      allowedRecipientPatterns: ['*@xn--exmple-cua.com']
    })

    expect(canSendMessageTo(ability, ['Recipient <recipient@Exämple.com>'])).toBe(true)
  })

  it('fails closed for a malformed recipient whose first split domain is allowed', () => {
    expect.hasAssertions()
    const ability = constrainedSendAbility({
      allowedRecipientDomains: ['allowed.test']
    })

    expect(canSendMessageTo(ability, ['local@allowed.test@blocked.test'])).toBe(false)
  })

  it('requires every parsed recipient to satisfy the recipient constraints', () => {
    expect.hasAssertions()
    const ability = constrainedSendAbility({
      allowedRecipientDomains: ['example.net', 'allowed.test']
    })

    expect(canSendMessageTo(ability, ['recipient@example.net', 'local@allowed.test@blocked.test'])).toBe(
      false
    )
  })

  it('allows mixed exact-recipient and domain constraints after parsed recipient normalization', () => {
    expect.hasAssertions()
    const ability = constrainedSendAbility({
      allowedRecipientDomains: ['example.net'],
      allowedRecipients: ['specific@example.org']
    })

    expect(
      canSendMessageTo(ability, ['Specific <specific@example.org>', 'Recipient <recipient@example.net>'])
    ).toBe(true)
  })

  it('maps the domain management capability to the Domain subject without mailbox access', () => {
    expect.hasAssertions()
    const ability = buildAgentMailAbility({
      capabilityGrants: [
        capabilityGrant({
          capability: 'email.domain.manage',
          constraints: { organizationId }
        })
      ],
      mailboxGrants: [],
      principal: agentPrincipal(),
      systemGrants: []
    })

    expect(
      ability.can('manage', agentMailSubject('Domain', { domain: 'example.test', organizationId }))
    ).toBe(true)
    expect(
      ability.can(
        'manage',
        agentMailSubject('Domain', { domain: 'other.test', organizationId: 'org-2' as OrganizationId })
      )
    ).toBe(false)
    expect(
      ability.can(
        'update',
        agentMailSubject('Mailbox', { mailboxAddress: 'support@example.test', organizationId })
      )
    ).toBe(false)
  })

  it('maps the manageDomains system permission to the Domain subject', () => {
    expect.hasAssertions()
    const ability = buildAgentMailAbility({
      mailboxGrants: [],
      principal: {
        credentialId: 'session-1',
        organizationId,
        principalId: 'user-1',
        principalType: 'user_session'
      },
      systemGrants: [systemGrant({ permission: 'manageDomains' })]
    })

    expect(
      ability.can('manage', agentMailSubject('Domain', { domain: 'example.test', organizationId }))
    ).toBe(true)
    expect(
      ability.can(
        'manage',
        agentMailSubject('ForwardingGroup', { mailboxAddress: 'team@example.test', organizationId })
      )
    ).toBe(false)
  })

  it('keeps agent management separate from OAuth connection management', () => {
    expect.hasAssertions()
    const agentAbility = buildAgentMailAbility({
      mailboxGrants: [],
      principal: {
        credentialId: 'session-1',
        organizationId,
        principalId: 'user-1',
        principalType: 'user_session'
      },
      systemGrants: [systemGrant({ permission: 'manageAgents' })]
    })
    const oauthAbility = buildAgentMailAbility({
      mailboxGrants: [],
      principal: {
        credentialId: 'session-1',
        organizationId,
        principalId: 'user-1',
        principalType: 'user_session'
      },
      systemGrants: [systemGrant({ permission: 'manageOAuthConnections' })]
    })

    expect(
      agentAbility.can('manage', agentMailSubject('Agent', { agentId: 'agent-1', organizationId }))
    ).toBe(true)
    expect(
      agentAbility.can(
        'manage',
        agentMailSubject('OAuthConnection', {
          organizationId,
          pluginId: 'agentteam.paperclip-email-plugin'
        })
      )
    ).toBe(false)
    expect(
      oauthAbility.can(
        'manage',
        agentMailSubject('OAuthConnection', {
          organizationId,
          pluginId: 'agentteam.paperclip-email-plugin'
        })
      )
    ).toBe(true)
    expect(
      oauthAbility.can(
        'manage',
        agentMailSubject('OAuthConnection', {
          organizationId: 'org-2' as OrganizationId,
          pluginId: 'agentteam.paperclip-email-plugin'
        })
      )
    ).toBe(false)
  })
})

function agentPrincipal() {
  return {
    credentialId: 'agent-1',
    organizationId,
    principalId: 'agent-1',
    principalType: 'agent' as AgentMailPrincipalType
  }
}

function constrainedSendAbility(constraints: {
  allowedRecipientDomains?: string[]
  allowedRecipientPatterns?: string[]
  allowedRecipients?: string[]
}) {
  return buildAgentMailAbility({
    capabilityGrants: [
      capabilityGrant({
        capability: 'email.message.send',
        constraints: {
          mailboxAddress: 'support@example.test',
          organizationId,
          ...constraints
        }
      })
    ],
    mailboxGrants: [],
    principal: agentPrincipal(),
    systemGrants: []
  })
}

function canSendMessageTo(ability: ReturnType<typeof buildAgentMailAbility>, recipientAddresses: string[]) {
  return ability.can(
    'send',
    agentMailSubject('Message', {
      mailboxAddress: 'support@example.test',
      organizationId,
      recipientAddresses
    })
  )
}

function capabilityGrant(
  grant: Pick<AgentCapabilityGrantDocument, 'capability' | 'constraints'>
): AgentCapabilityGrantDocument {
  return {
    _id: 'grant-1',
    agentId: 'agent-1',
    createdAt: new Date(),
    deniedBy: null,
    expiresAt: null,
    grantedBy: null,
    reason: null,
    status: 'active',
    updatedAt: new Date(),
    ...grant
  } as AgentCapabilityGrantDocument
}

function systemGrant(grant: Pick<AgentMailSystemGrantDocument, 'permission'>): AgentMailSystemGrantDocument {
  return {
    _id: 'system-grant-1',
    constraints: null,
    createdAt: new Date(),
    expiresAt: null,
    grantedByUserId: 'user-1',
    organizationId,
    principalId: 'user-1',
    principalType: 'user_session',
    status: 'active',
    updatedAt: new Date(),
    ...grant
  } as AgentMailSystemGrantDocument
}
