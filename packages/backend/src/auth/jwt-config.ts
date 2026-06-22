import { PUBLIC_VARS } from '../vars.public'
import type { JwtOptions } from 'better-auth/plugins'

export const WEBAPP_JWT_SIGNING_OPTIONS = {
  schema: {
    jwks: {
      modelName: 'jwk'
    }
  },
  jwks: {
    keyPairConfig: {
      alg: 'EdDSA',
      crv: 'Ed25519'
    }
  },
  jwt: {
    issuer: PUBLIC_VARS.PUBLIC_HOSTNAME,
    audience: PUBLIC_VARS.PUBLIC_HOSTNAME
  }
} satisfies JwtOptions
