import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig, mergeConfig } from 'vitest/config'

import storybookViteConfig from './.storybook/vite.config'

const __dirname = dirname(fileURLToPath(import.meta.url))
const storybookPort = process.env.STORYBOOK_PORT ?? '6007'
const storybookUrl = process.env.STORYBOOK_URL ?? `http://localhost:${storybookPort}`

export default mergeConfig(
  storybookViteConfig,
  defineConfig({
    optimizeDeps: {
      include: ['@responsive-image/core', '@responsive-image/react']
    },
    plugins: [
      storybookTest({
        configDir: resolve(__dirname, '.storybook'),
        storybookScript: `pnpm exec storybook dev -p ${storybookPort} --host 0.0.0.0 --no-version-updates`,
        storybookUrl
      })
    ],
    test: {
      name: 'storybook',
      // Storybook's Vitest browser setup currently resolves addon setup files through
      // package-export guarded deep paths under file-parallel execution.
      fileParallelism: false,
      browser: {
        enabled: true,
        headless: true,
        provider: playwright({}),
        instances: [{ browser: 'chromium' }],
        screenshotFailures: false
      },
      hookTimeout: 30_000,
      testTimeout: 30_000
    }
  })
)
