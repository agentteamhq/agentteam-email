import process from 'node:process'

import { z } from 'zod'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveEnvironment } from './resolve-environment'

const key = 'AGENTTEAM_RESOLVE_ENV_TEST_VALUE'

describe('resolveEnvironment', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('uses runtime process environment over Vite dotenv defaults', () => {
    expect.hasAssertions()
    const importMetaEnv = import.meta.env as Record<string, string | undefined>
    const originalImportMetaValue = importMetaEnv[key]
    const originalProcessValue = process.env[key]

    try {
      importMetaEnv[key] = 'vite-dotenv-default'
      process.env[key] = 'runtime-process-value'

      const parsed = resolveEnvironment(z.object({ [key]: z.string() }))

      expect(parsed[key]).toBe('runtime-process-value')
    } finally {
      restoreEnvValue(importMetaEnv, originalImportMetaValue)
      restoreEnvValue(process.env, originalProcessValue)
    }
  })

  it('normalizes blank optional private credential values to undefined', async () => {
    expect.hasAssertions()
    vi.resetModules()
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
    vi.stubEnv('ENCRYPT_SECRET_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.com')
    vi.stubEnv('GOOGLE_CLIENT_SECRET', '')
    vi.stubEnv('LINKEDIN_CLIENT_SECRET', '')
    vi.stubEnv('STRIPE_PUBLISHABLE_KEY', '')
    vi.stubEnv('STRIPE_SECRET_KEY', '')

    const { PRIVATE_VARS } = await import('./vars.private')

    expect(PRIVATE_VARS.GOOGLE_CLIENT_SECRET).toBeUndefined()
    expect(PRIVATE_VARS.LINKEDIN_CLIENT_SECRET).toBeUndefined()
    expect(PRIVATE_VARS.STRIPE_PUBLISHABLE_KEY).toBeUndefined()
    expect(PRIVATE_VARS.STRIPE_SECRET_KEY).toBeUndefined()
  })

  it('requires a Better Auth secret in production', async () => {
    expect.hasAssertions()
    vi.resetModules()
    vi.stubEnv('BETTER_AUTH_SECRET', '')
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
    vi.stubEnv('ENCRYPT_SECRET_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.com')

    await expect(import('./vars.private')).rejects.toThrow('BETTER_AUTH_SECRET is required in production')
  })

  it('normalizes blank optional public provider values to undefined', async () => {
    expect.hasAssertions()
    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.com')
    vi.stubEnv('PUBLIC_GOOGLE_CLIENT_ID', '')
    vi.stubEnv('PUBLIC_LINKEDIN_CLIENT_ID', '')

    const { PUBLIC_VARS } = await import('./vars.public')

    expect(PUBLIC_VARS.PUBLIC_GOOGLE_CLIENT_ID).toBeUndefined()
    expect(PUBLIC_VARS.PUBLIC_LINKEDIN_CLIENT_ID).toBeUndefined()
  })

  it('requires a configured public hostname', async () => {
    expect.hasAssertions()
    await withPublicHostname(undefined, async () => {
      vi.resetModules()

      await expect(import('./vars.public')).rejects.toThrow('Environment validation error')
    })
  })

  it('rejects a blank public hostname', async () => {
    expect.hasAssertions()
    vi.resetModules()
    vi.stubEnv('PUBLIC_HOSTNAME', '')

    await expect(import('./vars.public')).rejects.toThrow('PUBLIC_HOSTNAME is required')
  })

  it('rejects a malformed public hostname', async () => {
    expect.hasAssertions()
    vi.resetModules()
    vi.stubEnv('PUBLIC_HOSTNAME', 'not-a-url')

    await expect(import('./vars.public')).rejects.toThrow('PUBLIC_HOSTNAME must be an absolute URL')
  })

  it('requires an HTTP public hostname URL', async () => {
    expect.hasAssertions()
    vi.resetModules()
    vi.stubEnv('PUBLIC_HOSTNAME', 'ftp://mail.example.com')

    await expect(import('./vars.public')).rejects.toThrow('PUBLIC_HOSTNAME must use http or https')
  })
})

async function withPublicHostname(value: string | undefined, callback: () => Promise<void>) {
  const importMetaEnv = import.meta.env as Record<string, string | undefined>
  const originalImportMetaValue = importMetaEnv.PUBLIC_HOSTNAME
  const originalProcessValue = process.env.PUBLIC_HOSTNAME

  try {
    setEnvValue(importMetaEnv, 'PUBLIC_HOSTNAME', value)
    setEnvValue(process.env, 'PUBLIC_HOSTNAME', value)
    await callback()
  } finally {
    restoreEnvValue(importMetaEnv, originalImportMetaValue, 'PUBLIC_HOSTNAME')
    restoreEnvValue(process.env, originalProcessValue, 'PUBLIC_HOSTNAME')
  }
}

function setEnvValue(env: Record<string, string | undefined>, envKey: string, value: string | undefined) {
  if (value === undefined) {
    Reflect.deleteProperty(env, envKey)
    return
  }

  env[envKey] = value
}

function restoreEnvValue(env: Record<string, string | undefined>, value: string | undefined, envKey = key) {
  if (value === undefined) {
    Reflect.deleteProperty(env, envKey)
    return
  }

  env[envKey] = value
}
