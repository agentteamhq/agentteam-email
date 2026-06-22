import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '../..')

const processEnv = process.env as Record<string, string>
const env = loadEnv('development', projectRoot, 'BUILD_')

const buildSourcemaps = (processEnv.BUILD_SOURCEMAPS ?? env.BUILD_SOURCEMAPS) === 'true'
const buildMinify = (processEnv.BUILD_MINIFY ?? env.BUILD_MINIFY ?? 'true') === 'true'

export default defineConfig({
  build: {
    target: 'esnext',
    sourcemap: buildSourcemaps,
    minify: buildMinify,
    lib: {
      entry: 'src/index.ts',
      formats: ['es']
    },
    rollupOptions: {
      external: (id) => {
        if (id.startsWith('.') || id.startsWith('/')) {
          return false
        }
        return true
      },
      output: {
        format: 'esm',
        preserveModules: false,
        entryFileNames: '[name].mjs'
      }
    }
  }
})
