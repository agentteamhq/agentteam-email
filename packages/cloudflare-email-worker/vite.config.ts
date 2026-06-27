import { dirname, resolve } from 'node:path'
import process from 'node:process'
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
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: buildSourcemaps,
    minify: buildMinify,
    lib: {
      entry: 'src/index.ts',
      formats: ['es']
    },
    outDir: 'dist',
    rollupOptions: {
      output: {
        entryFileNames: 'worker.mjs',
        exports: 'named',
        format: 'esm',
        preserveModules: false
      }
    }
  }
})
