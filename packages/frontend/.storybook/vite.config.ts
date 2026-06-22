import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import babel from '@rolldown/plugin-babel'
import { responsiveImage } from '@responsive-image/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))
const frontendRoot = resolve(__dirname, '..')
const workspaceRoot = resolve(__dirname, '../../..')

export default defineConfig({
  envDir: workspaceRoot,
  plugins: [responsiveImage(), react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
  resolve: {
    alias: {
      '#runtime-public-env': resolve(frontendRoot, 'src/runtime-public-env.ts'),
      src: resolve(frontendRoot, 'src')
    },
    dedupe: ['react', 'react-dom']
  },
  server: {
    allowedHosts: true,
    host: '0.0.0.0'
  }
})
