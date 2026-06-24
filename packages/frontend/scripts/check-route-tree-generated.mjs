import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(scriptDir, '..')
const routeTreePath = resolve(packageRoot, 'src/routeTree.gen.ts')

const before = await readFile(routeTreePath, 'utf8')
await runCommand('pnpm', ['run', 'routes:generate'], packageRoot)
const after = await readFile(routeTreePath, 'utf8')

if (before !== after) {
  console.error('src/routeTree.gen.ts was stale and has been regenerated.')
  console.error('Review and keep the generated change, then rerun pnpm generated:check.')
  process.exitCode = 1
}

function runCommand(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit'
    })

    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise()
        return
      }

      reject(new Error(`${command} ${args.join(' ')} exited with ${signal ?? code}`))
    })
  })
}
