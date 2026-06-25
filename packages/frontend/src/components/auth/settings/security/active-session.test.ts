import { describe, expect, it } from 'vitest'

import { parseAtEmailUserAgent } from './active-session-user-agent'

describe('parseAtEmailUserAgent', () => {
  it('formats at-email CLI user agents with platform metadata', () => {
    expect.hasAssertions()

    expect(parseAtEmailUserAgent('at-email/0.4.0 (linux; amd64)')).toStrictEqual({
      label: 'at-email 0.4.0',
      platform: 'linux/amd64'
    })
  })

  it('keeps CLI sessions recognizable when platform metadata is absent or malformed', () => {
    expect.hasAssertions()

    expect(parseAtEmailUserAgent('at-email/0.4.0')).toStrictEqual({
      label: 'at-email 0.4.0',
      platform: 'CLI session'
    })
    expect(parseAtEmailUserAgent('at-email/0.4.0 (linux)')).toStrictEqual({
      label: 'at-email 0.4.0',
      platform: 'CLI session'
    })
  })

  it('ignores browser or empty user agents', () => {
    expect.hasAssertions()

    expect(parseAtEmailUserAgent('Mozilla/5.0')).toBeNull()
    expect(parseAtEmailUserAgent('')).toBeNull()
    expect(parseAtEmailUserAgent(null)).toBeNull()
  })
})
