import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mergeConfig } from 'vite'
import type { StorybookConfig } from '@storybook/react-vite'
import type { InlineConfig } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))
const frontendRoot = resolve(__dirname, '..')
const runtimePublicEnvPath = resolve(frontendRoot, 'src/runtime-public-env.ts')

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  core: {
    disableWhatsNewNotifications: true,
    disableTelemetry: true
  },
  features: {
    sidebarOnboardingChecklist: false
  },
  framework: {
    name: '@storybook/react-vite',
    options: {
      builder: {
        viteConfigPath: '.storybook/vite.config.ts'
      }
    }
  },
  addons: ['@storybook/addon-themes', '@storybook/addon-vitest'],
  viteFinal: (config_: InlineConfig) =>
    mergeConfig(config_, {
      build: {
        // Storybook bundles its preview runtime and all story surfaces together;
        // keep production app builds on Vite's normal chunk warning threshold.
        chunkSizeWarningLimit: 51200
      },
      resolve: {
        alias: {
          '#runtime-public-env': runtimePublicEnvPath,
          src: resolve(frontendRoot, 'src')
        }
      },
      server: {
        allowedHosts: true,
        host: '0.0.0.0'
      }
    })
}

export default config
