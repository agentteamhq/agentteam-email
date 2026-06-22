import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import babel from '@rolldown/plugin-babel'
import { responsiveImage } from '@responsive-image/vite-plugin'
import {
  START_ENVIRONMENT_NAMES,
  tanStackStartVite,
  type TanStackStartViteInputConfig,
  type TanStackStartVitePluginCoreOptions
} from '@tanstack/start-plugin-core/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv, type PluginOption } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '../..')
const runtimePublicEnvClientPath = resolve(__dirname, 'src/runtime-public-env.ts')
const runtimePublicEnvServerPath = resolve(__dirname, 'src/runtime-public-env.server.ts')
const backendPackageDistPath = resolve(__dirname, '../backend/dist')

const processEnv = process.env as Record<string, string>
const env = loadEnv(processEnv.NODE_ENV ?? 'development', projectRoot, 'BUILD_')

const buildSourcemaps = (processEnv.BUILD_SOURCEMAPS ?? env.BUILD_SOURCEMAPS) === 'true'
const buildMinify = (processEnv.BUILD_MINIFY ?? env.BUILD_MINIFY ?? 'true') === 'true'

export default defineConfig(() => ({
  plugins: [
    runtimePublicEnvAlias(),
    backendPackageDistRestartPlugin(),
    responsiveImage(),
    tanstackReactStartCore({
      client: {
        base: '/_build',
        entry: 'entry-client'
      },
      dev: {
        ssrStyles: {
          enabled: true
        }
      },
      importProtection: {
        enabled: true
      },
      router: {
        quoteStyle: 'single'
      },
      server: {
        entry: 'start-web-server'
      }
    }),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss()
  ],
  resolve: {
    alias: createBaseAliases()
  },
  server: {
    allowedHosts: true as const,
    host: true,
    port: Number.parseInt(processEnv.FRONTEND_PORT ?? processEnv.PORT ?? '4321', 10),
    strictPort: false,
    watch: {
      ignored: ignoredDevWatchPath
    }
  },
  build: {
    emptyOutDir: true,
    minify: buildMinify,
    outDir: 'dist',
    sourcemap: buildSourcemaps,
    target: 'esnext'
  },
  environments: {
    client: {
      build: {
        copyPublicDir: true,
        emitAssets: true,
        outDir: 'dist/client',
        rolldownOptions: {
          output: {
            // TODO(image-pipeline): keep generated responsive-image assets hash-addressed here.
            assetFileNames: '_build/assets/[name]-[hash][extname]',
            chunkFileNames: '_build/assets/[name]-[hash].js',
            entryFileNames: '_build/[name].js'
          }
        }
      }
    },
    server: {
      build: {
        copyPublicDir: false,
        emitAssets: true,
        outDir: 'dist/server',
        rolldownOptions: {
          external: isExternalServerImport,
          input: resolve(__dirname, 'src/index.ts'),
          output: {
            entryFileNames: '[name].mjs',
            format: 'esm' as const
          }
        },
        ssr: true
      }
    }
  }
}))

function ignoredDevWatchPath(path: string): boolean {
  const normalizedPath = resolve(path)
  if (isWithinPath(normalizedPath, backendPackageDistPath)) {
    return false
  }

  return normalizedPath.includes(`${sep}packages${sep}`) && normalizedPath.includes(`${sep}dist${sep}`)
}

function isWithinPath(path: string, parent: string): boolean {
  return path === parent || path.startsWith(`${parent}${sep}`)
}

function backendPackageDistRestartPlugin(): PluginOption {
  let restartTimer: ReturnType<typeof setTimeout> | undefined
  let watcherReady = false

  return {
    apply: 'serve',
    name: 'main-frontend:backend-package-dist-restart',
    configureServer(server) {
      server.watcher.add(backendPackageDistPath)
      server.watcher.on('ready', () => {
        watcherReady = true
      })

      const scheduleRestart = (event: 'add' | 'change' | 'unlink', file: string) => {
        if (!watcherReady && event === 'add') {
          return
        }

        const normalizedFile = resolve(file)
        if (!isWithinPath(normalizedFile, backendPackageDistPath)) {
          return
        }

        if (restartTimer) {
          clearTimeout(restartTimer)
        }

        restartTimer = setTimeout(() => {
          server.config.logger.info('[main] @main/backend dist changed; restarting frontend dev server')
          void server.restart()
        }, 100)
      }

      server.watcher.on('add', (file) => scheduleRestart('add', file))
      server.watcher.on('change', (file) => scheduleRestart('change', file))
      server.watcher.on('unlink', (file) => scheduleRestart('unlink', file))
    }
  }
}

function runtimePublicEnvAlias(): PluginOption {
  return {
    enforce: 'pre',
    name: 'main-frontend:runtime-public-env-alias',
    resolveId(source) {
      if (source !== '#runtime-public-env') {
        return null
      }

      return this.environment.name === START_ENVIRONMENT_NAMES.server
        ? runtimePublicEnvServerPath
        : runtimePublicEnvClientPath
    }
  }
}

function createAliases(runtimePublicEnvPath: string) {
  const aliases = [
    {
      find: '#runtime-public-env',
      replacement: runtimePublicEnvPath
    },
    {
      find: 'src',
      replacement: resolve(__dirname, 'src')
    }
  ]

  return aliases
}

function createBaseAliases() {
  return [
    {
      find: 'src',
      replacement: resolve(__dirname, 'src')
    }
  ]
}

function tanstackReactStartCore(options?: TanStackStartViteInputConfig): Array<PluginOption> {
  const corePluginOptions: TanStackStartVitePluginCoreOptions = {
    defaultEntryPaths: {
      client: resolve(__dirname, 'src/entry-client.tsx'),
      server: resolve(__dirname, 'src/start-web-server.ts'),
      start: resolve(__dirname, 'src/start.ts')
    },
    framework: 'react',
    providerEnvironmentName: START_ENVIRONMENT_NAMES.server,
    ssrIsProvider: true,
    ssrResolverStrategy: {
      type: 'default'
    }
  }

  return [
    {
      name: 'main-react-start-core:config',
      configEnvironment(environmentName) {
        const needsOptimizeDeps = environmentName === START_ENVIRONMENT_NAMES.client

        return {
          optimizeDeps: needsOptimizeDeps
            ? {
                exclude: [
                  '@tanstack/react-start-client',
                  '@tanstack/react-start-server',
                  '@tanstack/start-client-core',
                  '@tanstack/start-server-core'
                ],
                include: [
                  'react',
                  'react/jsx-runtime',
                  'react/jsx-dev-runtime',
                  'react-dom',
                  'react-dom/client'
                ]
              }
            : undefined,
          resolve: {
            alias: createAliases(
              environmentName === START_ENVIRONMENT_NAMES.server
                ? runtimePublicEnvServerPath
                : runtimePublicEnvClientPath
            ),
            dedupe: ['react', 'react-dom', '@tanstack/react-router'],
            external: environmentName === START_ENVIRONMENT_NAMES.server ? ['@main/backend'] : undefined
          }
        }
      }
    },
    ...tanStackStartVite(corePluginOptions, options)
  ]
}

function isExternalServerImport(id: string): boolean {
  if (id.startsWith('.') || id.startsWith('/') || id.startsWith('\0')) {
    return false
  }

  if (id === 'src' || id.startsWith('src/')) {
    return false
  }

  if (id.startsWith('#tanstack-')) {
    return false
  }

  return !isCssRequest(id)
}

function isCssRequest(id: string): boolean {
  const [pathname] = id.split('?')

  return pathname?.endsWith('.css') ?? false
}
