import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const sourcePath = fileURLToPath(new URL('../src/index.ts', import.meta.url))
const source = await readFile(sourcePath, 'utf8')

const backendImport = "import { startScheduledJobs } from '@main/backend'"
const frontendDynamicImport = "await import('@main/frontend')"
const startJobs = 'await startScheduledJobs()'

for (const requiredSource of [backendImport, startJobs, frontendDynamicImport]) {
  if (!source.includes(requiredSource)) {
    throw new Error(`web-server runtime entry is missing ${requiredSource}`)
  }
}

if (source.indexOf(startJobs) > source.indexOf(frontendDynamicImport)) {
  throw new Error('web-server must start backend jobs before importing @main/frontend')
}

if (source.includes("import '@main/frontend'")) {
  throw new Error('web-server must dynamically import @main/frontend after backend jobs start')
}
