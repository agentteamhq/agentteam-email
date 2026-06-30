import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'

const [, , composePath, outputDir] = process.argv

if (!composePath || !outputDir) {
  console.error('usage: node scripts/dev-render-compose-configs.mjs <compose-file> <output-dir>')
  process.exit(1)
}

const compose = YAML.parse(fs.readFileSync(composePath, 'utf8'))
const configs = compose.configs
if (!configs || typeof configs !== 'object') {
  throw new Error(`${composePath} does not define top-level configs`)
}

const configDir = path.join(path.resolve(outputDir), 'configs')
fs.rmSync(configDir, { recursive: true, force: true })
fs.mkdirSync(configDir, { recursive: true, mode: 0o755 })

let count = 0
for (const [name, config] of Object.entries(configs)) {
  if (!config || typeof config.content !== 'string') continue
  fs.writeFileSync(path.join(configDir, name), config.content, { mode: 0o644 })
  count += 1
}

console.log(`Rendered ${count} Compose config files from ${composePath}`)
