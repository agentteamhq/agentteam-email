import { describe, expect, it } from 'vitest'

import {
  AgentMailCapabilityValues,
  AgentMailTrialClaimIntentContractV1,
  AgentMailTrialCapabilityValues,
  AgentMailTrialPolicyContractV1,
  AgentMailTrialResourceContractV1
} from '../src'

describe('agent mail trial contract', () => {
  it('keeps trial capabilities narrow and inside the canonical capability catalog', () => {
    expect.hasAssertions()

    const allCapabilities = new Set(AgentMailCapabilityValues)
    const trialCapabilities = new Set(AgentMailTrialCapabilityValues)

    expect(trialCapabilities.size).toBe(AgentMailTrialCapabilityValues.length)
    for (const capability of AgentMailTrialCapabilityValues) {
      expect(allCapabilities.has(capability)).toBe(true)
      expect(capability.startsWith('email.agent.')).toBe(false)
      expect(capability.startsWith('email.forwarding_group.')).toBe(false)
      expect(capability.startsWith('email.mailbox.')).toBe(false)
    }
  })

  it('validates server-owned trial policy limits without accepting unknown fields', () => {
    expect.hasAssertions()

    expect(
      AgentMailTrialPolicyContractV1.parse({
        capabilities: ['email.status', 'email.message.read'],
        claimIntentTtlSeconds: 900,
        dailySendLimit: 3,
        hostedDomain: 'trial.example.test',
        mailboxLifetimeSeconds: 86_400,
        totalSendLimit: 10
      })
    ).toStrictEqual({
      capabilities: ['email.status', 'email.message.read'],
      claimIntentTtlSeconds: 900,
      dailySendLimit: 3,
      hostedDomain: 'trial.example.test',
      mailboxLifetimeSeconds: 86_400,
      totalSendLimit: 10,
      version: 1
    })

    expect(() =>
      AgentMailTrialPolicyContractV1.parse({
        capabilities: ['email.agent.manage'],
        claimIntentTtlSeconds: 900,
        dailySendLimit: 3,
        hostedDomain: 'trial.example.test',
        mailboxLifetimeSeconds: 86_400,
        totalSendLimit: 10
      })
    ).toThrow()
    expect(() =>
      AgentMailTrialPolicyContractV1.parse({
        capabilities: ['email.status'],
        claimIntentTtlSeconds: 900,
        dailySendLimit: 3,
        hostedDomain: 'trial.example.test',
        mailboxLifetimeSeconds: 86_400,
        totalSendLimit: 10,
        unknown: true
      })
    ).toThrow()
  })

  it('normalizes persisted trial and claim intent contracts without exposing secrets', () => {
    expect.hasAssertions()

    expect(
      AgentMailTrialResourceContractV1.parse({
        agentId: 'agent-1',
        capabilities: ['email.status'],
        dailySendLimit: 1,
        dailySentCount: 0,
        dailyWindowStartedAt: '2026-06-22T00:00:00.000Z',
        expiresAt: '2026-06-23T00:00:00.000Z',
        hostId: 'host-1',
        mailboxAddress: 'Trial@Example.Test',
        status: 'active',
        totalSendLimit: 3,
        totalSentCount: 0,
        wildDuckUserId: 'wildduck-user-1'
      })
    ).toMatchObject({
      mailboxAddress: 'trial@example.test',
      version: 1
    })

    expect(
      AgentMailTrialClaimIntentContractV1.parse({
        agentId: 'agent-1',
        expiresAt: '2026-06-22T01:00:00.000Z',
        hostId: 'host-1',
        status: 'pending',
        tokenHash: 'sha256:claim-token-hash',
        trialId: 'trial-1'
      })
    ).toStrictEqual({
      agentId: 'agent-1',
      approvedByUserId: null,
      expiresAt: '2026-06-22T01:00:00.000Z',
      hostId: 'host-1',
      resolvedAt: null,
      status: 'pending',
      targetOrganizationId: null,
      tokenHash: 'sha256:claim-token-hash',
      trialId: 'trial-1',
      version: 1
    })
  })
})
