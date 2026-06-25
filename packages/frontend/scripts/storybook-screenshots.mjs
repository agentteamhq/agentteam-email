import { createServer } from 'node:http'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const transparentPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lIu2ZQAAAABJRU5ErkJggg==',
  'base64'
)

const scriptDir = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(scriptDir, '..')
const runId = new Date().toISOString().replaceAll(':', '').replaceAll('.', '')
const runDir = resolve(
  packageRoot,
  process.env.STORYBOOK_SCREENSHOT_RUN_DIR ?? `tmp/storybook-screenshots/run-${runId}`
)
const staticDir = join(runDir, 'storybook-static')
const screenshotsDir = join(runDir, 'screenshots')
const reportsDir = join(runDir, 'reports')
const subprocessDir = join(runDir, 'subprocess')
const harnessLogPath = join(runDir, 'harness.log')
const viewport = {
  width: Number.parseInt(process.env.STORYBOOK_SCREENSHOT_WIDTH ?? '1440', 10),
  height: Number.parseInt(process.env.STORYBOOK_SCREENSHOT_HEIGHT ?? '1000', 10)
}
const fullPage = process.env.STORYBOOK_SCREENSHOT_FULL_PAGE !== '0'
const delayMs = Number.parseInt(process.env.STORYBOOK_SCREENSHOT_DELAY_MS ?? '100', 10)

await mkdir(screenshotsDir, { recursive: true })
await mkdir(reportsDir, { recursive: true })
await mkdir(subprocessDir, { recursive: true })

const harnessLog = createWriteStream(harnessLogPath, { flags: 'a' })

try {
  log(`run directory: ${runDir}`)
  log('building Storybook')
  await runCommand('pnpm', ['run', 'storybook:build', '--output-dir', staticDir], {
    cwd: packageRoot,
    name: 'storybook-build'
  })

  const index = await readStorybookIndex(staticDir)
  const stories = Object.values(index.entries ?? index.stories ?? {}).filter((entry) => entry.type === 'story')
  if (stories.length === 0) {
    throw new Error('Storybook index did not contain any stories.')
  }
  log(`capturing ${stories.length} story screenshots`)

  const server = await serveDirectory(staticDir)
  const baseUrl = `http://127.0.0.1:${server.port}`
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    viewport
  })

  const results = []
  try {
    for (const [index_, story] of stories.entries()) {
      const sequence = `${index_ + 1}/${stories.length}`
      log(`[${sequence}] ${story.id}`)
      results.push(await captureStory(context, baseUrl, story))
    }
  } finally {
    await context.close().catch((error) => log(`browser context close failed: ${stringifyError(error)}`))
    await browser.close().catch((error) => log(`browser close failed: ${stringifyError(error)}`))
    await server.close()
  }

  const failures = results.filter((result) => result.status !== 'passed')
  const summary = {
    failed: failures.length,
    passed: results.length - failures.length,
    runDir,
    stories: results.length
  }

  await writeJson(join(reportsDir, 'story-results.json'), results)
  await writeJson(join(reportsDir, 'summary.json'), summary)
  log(`summary: ${summary.passed} passed, ${summary.failed} failed`)

  if (failures.length > 0) {
    process.exitCode = 1
  }
} catch (error) {
  log(`failed: ${stringifyError(error)}`)
  await writeJson(join(reportsDir, 'summary.json'), {
    error: stringifyError(error),
    failed: 1,
    passed: 0,
    runDir,
    stories: 0
  }).catch(() => {})
  process.exitCode = 1
} finally {
  harnessLog.end()
}

async function captureStory(context, baseUrl, story) {
  const page = await context.newPage()
  const consoleErrors = []
  const pageErrors = []
  const failedResponses = []
  const screenshotPath = join(screenshotsDir, `${safeFileName(story.id)}.png`)
  const storyUrl = `${baseUrl}/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story`

  page.on('console', (message) => {
    if (message.type() === 'error' && !isExpectedStoryConsoleError(message.text())) {
      consoleErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => {
    pageErrors.push(stringifyError(error))
  })
  page.on('response', (response) => {
    const status = response.status()
    if (status >= 400) {
      failedResponses.push({ status, url: response.url() })
    }
  })

  try {
    await page.goto(storyUrl, { timeout: 30_000, waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#storybook-root', { state: 'attached', timeout: 15_000 })
    await waitForPageReady(page)
    if (delayMs > 0) {
      await page.waitForTimeout(delayMs)
    }

    const rootState = await page.locator('#storybook-root').evaluate((root) => ({
      childElementCount: root.childElementCount,
      text: root.textContent?.trim().slice(0, 500) ?? ''
    }))
    const failures = [
      ...pageErrors.map((message) => ({ kind: 'pageerror', message })),
      ...consoleErrors.map((message) => ({ kind: 'console', message })),
      ...failedResponses.map((response) => ({
        kind: 'response',
        message: `${response.status} ${response.url}`
      }))
    ]

    if (rootState.childElementCount === 0 && rootState.text.length === 0) {
      failures.push({ kind: 'empty-root', message: '#storybook-root rendered no content.' })
    }

    await page.screenshot({
      fullPage,
      path: screenshotPath
    })

    return {
      id: story.id,
      name: story.name,
      screenshotPath,
      status: failures.length === 0 ? 'passed' : 'failed',
      title: story.title,
      url: storyUrl,
      failures
    }
  } catch (error) {
    return {
      id: story.id,
      name: story.name,
      screenshotPath: null,
      status: 'failed',
      title: story.title,
      url: storyUrl,
      failures: [{ kind: 'exception', message: stringifyError(error) }]
    }
  } finally {
    await page.close().catch((error) => log(`page close failed for ${story.id}: ${stringifyError(error)}`))
  }
}

async function waitForPageReady(page) {
  await page.evaluate(async () => {
    if ('fonts' in document) {
      await document.fonts.ready
    }

    const images = Array.from(document.images)
    await Promise.all(
      images.map((image) => {
        if (image.complete) {
          return undefined
        }
        return new Promise((resolveImage) => {
          image.addEventListener('load', resolveImage, { once: true })
          image.addEventListener('error', resolveImage, { once: true })
        })
      })
    )
  })
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
}

async function readStorybookIndex(directory) {
  const raw = await readFile(join(directory, 'index.json'), 'utf8')
  return JSON.parse(raw)
}

async function serveDirectory(directory) {
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')
      if (writeStoryDynamicResponse(requestUrl, response)) {
        return
      }
      const pathname = decodeURIComponent(requestUrl.pathname)
      const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1)
      const candidate = resolve(directory, relativePath)
      if (!candidate.startsWith(`${directory}/`) && candidate !== directory) {
        response.writeHead(403)
        response.end('Forbidden')
        return
      }

      const fileStat = await stat(candidate)
      const filePath = fileStat.isDirectory() ? join(candidate, 'index.html') : candidate
      const contents = await readFile(filePath)
      response.writeHead(200, {
        'Content-Type': contentType(filePath)
      })
      response.end(contents)
    } catch {
      response.writeHead(404)
      response.end('Not found')
    }
  })

  await new Promise((resolveListen) => {
    server.listen(0, '127.0.0.1', resolveListen)
  })

  return {
    close: () =>
      new Promise((resolveClose) => {
        server.close(resolveClose)
      }),
    port: server.address().port
  }
}

async function runCommand(command, args, options) {
  const stdoutPath = join(subprocessDir, `${options.name}.stdout.log`)
  const stderrPath = join(subprocessDir, `${options.name}.stderr.log`)
  const stdout = createWriteStream(stdoutPath, { flags: 'a' })
  const stderr = createWriteStream(stderrPath, { flags: 'a' })

  await new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    child.stdout.pipe(stdout)
    child.stderr.pipe(stderr)

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      for (const line of text.split('\n')) {
        if (line.trim()) {
          log(`[${options.name}] ${line.trimEnd()}`)
        }
      }
    })
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      for (const line of text.split('\n')) {
        if (line.trim()) {
          log(`[${options.name}] ${line.trimEnd()}`)
        }
      }
    })
    child.on('error', rejectCommand)
    child.on('close', (code) => {
      stdout.end()
      stderr.end()
      if (code === 0) {
        resolveCommand()
      } else {
        rejectCommand(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
      }
    })
  })
}

async function writeJson(filePath, value) {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function contentType(filePath) {
  switch (extname(filePath)) {
    case '.css':
      return 'text/css; charset=utf-8'
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.png':
      return 'image/png'
    case '.svg':
      return 'image/svg+xml'
    case '.webp':
      return 'image/webp'
    case '.woff2':
      return 'font/woff2'
    default:
      return 'application/octet-stream'
  }
}

function isExpectedStoryConsoleError(message) {
  return (
    message ===
      "The Content Security Policy directive 'frame-ancestors' is ignored when delivered via a <meta> element." ||
    message === "Unrecognized Content-Security-Policy directive 'navigate-to'." ||
    (message.includes('violates the following Content Security Policy directive') &&
      message.includes('https://fonts.googleapis.com/'))
  )
}

function writeStoryDynamicResponse(requestUrl, response) {
  if (
    /^\/rpc\/mail\/accounts\/[^/]+\/mailboxes\/[^/]+\/messages\/[^/]+\/attachments\/inline-provider-logo$/u.test(
      requestUrl.pathname
    )
  ) {
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Length': String(transparentPng.byteLength),
      'Content-Type': 'image/png'
    })
    response.end(transparentPng)
    return true
  }

  return false
}

function safeFileName(value) {
  return value.replaceAll(/[^a-zA-Z0-9._-]+/g, '_')
}

function log(message) {
  const line = `[storybook-screenshots] ${new Date().toISOString()} ${message}`
  console.log(line)
  harnessLog.write(`${line}\n`)
}

function stringifyError(error) {
  if (error instanceof Error) {
    return error.stack ?? error.message
  }
  return String(error)
}
