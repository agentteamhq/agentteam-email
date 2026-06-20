import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv, type PluginOption } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '../..')

const processEnv = process.env as Record<string, string>
const env = loadEnv(processEnv.NODE_ENV ?? 'development', projectRoot, 'BUILD_')

const buildSourcemaps = (processEnv.BUILD_SOURCEMAPS ?? env.BUILD_SOURCEMAPS) === 'true'
const buildMinify = (processEnv.BUILD_MINIFY ?? env.BUILD_MINIFY ?? 'true') === 'true'

export default defineConfig({
  plugins: [externalBuiltStartWebServerEntry()],
  resolve: {
    alias: [
      {
        find: '@',
        replacement: resolve(__dirname, 'src')
      }
    ]
  },
  build: {
    emptyOutDir: false,
    minify: buildMinify,
    outDir: 'dist/server',
    sourcemap: buildSourcemaps,
    ssr: true,
    target: 'esnext',
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es']
    },
    rollupOptions: {
      external: isExternalNodeEntryImport,
      output: {
        entryFileNames: 'index.mjs',
        format: 'esm'
      }
    }
  }
})

function externalBuiltStartWebServerEntry(): PluginOption {
  return {
    enforce: 'pre',
    name: 'main-frontend-node-entry:external-built-start-web-server',
    resolveId(source, importer) {
      if (isBuiltStartWebServerEntryImport(source, importer)) {
        return {
          external: true,
          id: './start-web-server.js'
        }
      }

      return null
    }
  }
}

function isBuiltStartWebServerEntryImport(source: string, importer: string | undefined): boolean {
  if (!importer?.endsWith('/src/server.ts')) {
    return false
  }

  return source === './start-web-server' || source === './start-web-server.js'
}

function isExternalNodeEntryImport(id: string): boolean {
  if (id.startsWith('.') || id.startsWith('/') || id.startsWith('\0')) {
    return false
  }

  if (id === '@' || id.startsWith('@/')) {
    return false
  }

  return true
}
