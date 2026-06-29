import { describe, expect, it } from 'vitest'

import { hasBearerCredential, hasBearerJwt, parseBearerAuthorization } from './authorization-header'

const DECODED_JWT = 'eyJ0eXAiOiJhZ2VudCtqd3QifQ.eyJzdWIiOiJhZ2VudC0xIn0.sig'

describe('Authorization header parsing', () => {
  it('extracts bearer token68 credentials without regex normalization', () => {
    expect.hasAssertions()

    expect(parseBearerAuthorization(new Headers({ authorization: 'Bearer oauth-token' }))).toStrictEqual({
      status: 'present',
      token: 'oauth-token'
    })
    expect(parseBearerAuthorization(new Headers({ authorization: 'bearer oauth-token' }))).toStrictEqual({
      status: 'present',
      token: 'oauth-token'
    })
    expect(parseBearerAuthorization(new Headers({ authorization: 'Bearer a.b.c=' }))).toStrictEqual({
      status: 'present',
      token: 'a.b.c='
    })
  })

  it('rejects malformed bearer credentials that regex parsing accepted', () => {
    expect.hasAssertions()

    for (const authorization of [
      'Bearer',
      'Bearer   ',
      'Bearer a b',
      'Bearer a.b.c, Basic x',
      `Bearer ${DECODED_JWT} more`
    ]) {
      expect(parseBearerAuthorization(new Headers({ authorization })), authorization).toStrictEqual({
        status: 'malformed'
      })
    }
  })

  it('ignores non-Bearer Authorization schemes at the bearer boundary', () => {
    expect.hasAssertions()

    expect(parseBearerAuthorization(new Headers())).toStrictEqual({ status: 'absent' })
    expect(parseBearerAuthorization(new Headers({ authorization: 'Basic abc' }))).toStrictEqual({
      status: 'absent'
    })
  })

  it('detects JWTs through jose decoding instead of compact dot counts', () => {
    expect.hasAssertions()

    expect(hasBearerCredential(new Headers({ authorization: 'Bearer header.payload.signature' }))).toBe(true)
    expect(hasBearerJwt(new Headers({ authorization: `Bearer ${DECODED_JWT}` }))).toBe(true)
    expect(hasBearerJwt(new Headers({ authorization: 'Bearer header.payload.signature' }))).toBe(false)
    expect(hasBearerJwt(new Headers({ authorization: 'Bearer a.b.c, Basic x' }))).toBe(false)
  })
})
