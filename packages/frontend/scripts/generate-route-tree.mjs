import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(scriptDir, '..')
const routeTreePath = resolve(packageRoot, 'src/routeTree.gen.ts')
const routerImportPath = importPath(routeTreePath, resolve(packageRoot, 'src/router.tsx'))
const startImportPath = importPath(routeTreePath, resolve(packageRoot, 'src/start.ts'))

await runCommand('pnpm', ['exec', 'tsr', 'generate'], packageRoot)

const routeTree = await readFile(routeTreePath, 'utf8')
const routeTreeWithoutStartFooter = stripStartFooter(routeTree)
await writeFile(
  routeTreePath,
  `${routeTreeWithoutStartFooter.trimEnd()}\n\n${startRouteTreeFooter()}\n`
)

function startRouteTreeFooter() {
  return `import type { getRouter } from '${routerImportPath}'
import type { startInstance } from '${startImportPath}'
declare module '@tanstack/react-start' {
  interface Register {
    ssr: true
    router: Awaited<ReturnType<typeof getRouter>>
    config: Awaited<ReturnType<typeof startInstance.getOptions>>
  }
}`
}

function stripStartFooter(content) {
  const marker = `\nimport type { getRouter } from '${routerImportPath}'\n`
  const markerIndex = content.lastIndexOf(marker)
  if (markerIndex === -1) {
    return content
  }

  return content.slice(0, markerIndex)
}

function importPath(fromFile, toFile) {
  let path = relative(dirname(fromFile), toFile)
  if (!path.startsWith('.')) {
    path = `.${sep}${path}`
  }
  return path.split(sep).join('/')
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
