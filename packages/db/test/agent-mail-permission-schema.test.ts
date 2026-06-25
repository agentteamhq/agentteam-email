import { describe, expect, it } from 'vitest'

import {
  AgentMailAbilityActionByCapability,
  AgentMailCapabilityByMailboxGrant,
  AgentMailCapabilityBySystemPermission,
  AgentMailCapabilityValues,
  AgentMailDefaultMailboxGrantValues,
  AgentMailMailboxGrantValues,
  AgentMailSystemPermissionValues
} from '../src/agent-mail-permission-schema'

describe('agent mail permission contract', () => {
  it('keeps the default mailbox grant catalog inside the canonical grant set', () => {
    expect.hasAssertions()

    const mailboxGrants = new Set(AgentMailMailboxGrantValues)
    const defaultMailboxGrants = new Set(AgentMailDefaultMailboxGrantValues)

    expect(defaultMailboxGrants).toStrictEqual(mailboxGrants)
    expect(defaultMailboxGrants.size).toBe(AgentMailDefaultMailboxGrantValues.length)
  })

  it('maps every mailbox and system permission to supported capability actions', () => {
    expect.hasAssertions()

    const capabilities = new Set(AgentMailCapabilityValues)

    for (const grant of AgentMailMailboxGrantValues) {
      const grantCapabilities = AgentMailCapabilityByMailboxGrant[grant]

      expect(grantCapabilities.length).toBeGreaterThan(0)
      for (const capability of grantCapabilities) {
        expect(capabilities.has(capability)).toBe(true)
        expect(AgentMailAbilityActionByCapability[capability]).toBeDefined()
      }
    }

    for (const permission of AgentMailSystemPermissionValues) {
      const permissionCapabilities = AgentMailCapabilityBySystemPermission[permission]

      expect(permissionCapabilities.length).toBeGreaterThan(0)
      for (const capability of permissionCapabilities) {
        expect(capabilities.has(capability)).toBe(true)
        expect(AgentMailAbilityActionByCapability[capability]).toBeDefined()
      }
    }
  })
})
