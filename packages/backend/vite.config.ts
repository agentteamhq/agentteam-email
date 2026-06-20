import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '../..')

// Load env from project root .env file
const processEnv = process.env as Record<string, string>
const env = loadEnv('development', projectRoot, 'BUILD_')

// Build configuration (process.env > .env file > default)
const buildSourcemaps = (processEnv.BUILD_SOURCEMAPS ?? env.BUILD_SOURCEMAPS) === 'true'
const buildMinify = (processEnv.BUILD_MINIFY ?? env.BUILD_MINIFY ?? 'true') === 'true'

export default defineConfig({
  build: {
    target: 'esnext',
    sourcemap: buildSourcemaps,
    minify: buildMinify,
    lib: {
      // entry: [resolve(__dirname, 'src/index.ts')],
      entry: [
        'src/index.ts',
        'src/vars.public.ts',
        'src/vars.build.ts',
        'src/server-only.ts',
        'src/routes/signin.ts',
        'src/routes/webapp.ts'
      ],
      formats: ['es']
    },
    rollupOptions: {
      // input: {

      // },
      external: (id, importer, isResolved) => {
        // Keep relative imports in src bundled
        if (id.startsWith('.') || id.startsWith('/')) {
          return false
        }

        // Otherwise externalize (like 'react', 'react-dom', etc.)
        return true
      },
      output: {
        format: 'esm',
        // inlineDynamicImports: false,
        preserveModules: false,

        // preserveModules: true,
        preserveModulesRoot: '.',
        entryFileNames: '[name].mjs'
      }
    }
    // ssr: true // This tells Vite to build for server-side (Node.js) environment
  }
  // ssr: {
  //   target: 'node'
  // }
})
