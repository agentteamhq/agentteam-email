import { describe, expect, it } from 'vitest'

import { getSettingsSectionFromSegment } from './settings-dialog-sections'

describe('settings section routing', () => {
  it('maps legacy personal CLI settings destinations to Security', () => {
    expect(getSettingsSectionFromSegment('cli-access')).toBe('security')
    expect(getSettingsSectionFromSegment('cliAccess')).toBe('security')
    expect(getSettingsSectionFromSegment('developer')).toBe('security')
  })

  it('keeps Agent Access separate from Better Auth sessions', () => {
    expect(getSettingsSectionFromSegment('agent-access')).toBe('agentAccess')
    expect(getSettingsSectionFromSegment('agentAccess')).toBe('agentAccess')
  })
})
