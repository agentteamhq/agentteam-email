import process from 'node:process'

import { z } from 'zod'
import { describe, expect, it } from 'vitest'

import { resolveEnvironment } from './resolve-environment'

const key = 'AGENTTEAM_RESOLVE_ENV_TEST_VALUE'

describe('resolveEnvironment', () => {
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
})

function restoreEnvValue(env: Record<string, string | undefined>, value: string | undefined) {
  if (value === undefined) {
    Reflect.deleteProperty(env, key)
    return
  }

  env[key] = value
}
