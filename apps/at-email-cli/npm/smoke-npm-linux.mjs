#!/usr/bin/env node
import childProcess from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSmokeTree } from './smoke-tree.mjs'
import { binaryAliases } from './platforms.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const cliRoot = path.resolve(scriptDir, '..')

function parseArgs(argv) {
  const args = {
    engine: process.env.CONTAINER_ENGINE || 'docker',
    npmRoot: path.join(cliRoot, 'dist', 'npm'),
    smokeDir: path.join(cliRoot, 'dist', 'npm-linux-smoke'),
    glibcImage: 'docker.io/library/node:26.4.0-bookworm-slim',
    muslImage: 'docker.io/library/node:26.4.0-alpine'
  }

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    const next = () => {
      i += 1
      if (i >= argv.length) {
        throw new Error(`${token} requires a value`)
      }
      return argv[i]
    }

    if (token === '--engine') {
      args.engine = next()
    } else if (token === '--npm-root') {
      args.npmRoot = path.resolve(next())
    } else if (token === '--smoke-dir') {
      args.smokeDir = path.resolve(next())
    } else if (token === '--glibc-image') {
      args.glibcImage = next()
    } else if (token === '--musl-image') {
      args.muslImage = next()
    } else {
      throw new Error(`unknown argument: ${token}`)
    }
  }

  return args
}

function runContainer({ engine, image, smokeDir, version }) {
  const volumeMode = engine.includes('podman') ? 'ro,Z' : 'ro'
  for (const alias of binaryAliases) {
    const result = childProcess.spawnSync(
      engine,
      [
        'run',
        '--rm',
        '-v',
        `${smokeDir}:/work:${volumeMode}`,
        '-w',
        '/work',
        image,
        `node_modules/.bin/${alias}`,
        '--version'
      ],
      { encoding: 'utf8' }
    )

    if (result.status !== 0) {
      throw new Error(`${image} smoke failed for ${alias}:\n${result.stderr || result.stdout}`)
    }
    if (result.stdout.trim() !== version) {
      throw new Error(`${image} ${alias} returned ${JSON.stringify(result.stdout.trim())}, want ${version}`)
    }
  }
}

async function smoke(args) {
  const { version } = await createSmokeTree({
    npmRoot: args.npmRoot,
    outDir: args.smokeDir
  })

  runContainer({
    engine: args.engine,
    image: args.glibcImage,
    smokeDir: args.smokeDir,
    version
  })
  runContainer({
    engine: args.engine,
    image: args.muslImage,
    smokeDir: args.smokeDir,
    version
  })

  console.log(`Smoke-tested @agentteamhq/email on glibc and musl Node images for ${version}`)
}

try {
  await smoke(parseArgs(process.argv.slice(2)))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
