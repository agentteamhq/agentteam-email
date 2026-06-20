import { existsSync } from 'node:fs'
import process from 'node:process'
import { defineConfig } from 'vitest/config'

if (!process.env.DOCKER_HOST) {
  const runtimeDir = process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid?.() ?? ''}`
  const podmanSocket = `${runtimeDir}/podman/podman.sock`

  if (existsSync(podmanSocket)) {
    process.env.DOCKER_HOST = `unix://${podmanSocket}`
    process.env.TESTCONTAINERS_RYUK_DISABLED ??= 'true'
  }
}

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    include: ['test/**/*.test.ts'],
    pool: 'forks',
    reporters: ['verbose'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    teardownTimeout: 30_000,
    expect: {
      requireAssertions: true
    }
  }
})
