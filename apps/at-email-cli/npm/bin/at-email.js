#!/usr/bin/env node
'use strict'

const childProcess = require('node:child_process')
const os = require('node:os')

const packages = {
  'darwin arm64': ['@agentteamhq/email-darwin-arm64', 'bin/at-email'],
  'darwin x64': ['@agentteamhq/email-darwin-x64', 'bin/at-email'],
  'linux arm64 glibc': ['@agentteamhq/email-linux-arm64-gnu', 'bin/at-email'],
  'linux arm64 musl': ['@agentteamhq/email-linux-arm64-musl', 'bin/at-email'],
  'linux x64 glibc': ['@agentteamhq/email-linux-x64-gnu', 'bin/at-email'],
  'linux x64 musl': ['@agentteamhq/email-linux-x64-musl', 'bin/at-email'],
  'win32 arm64': ['@agentteamhq/email-win32-arm64', 'bin/at-email.exe'],
  'win32 x64': ['@agentteamhq/email-win32-x64', 'bin/at-email.exe']
}

function linuxLibc() {
  const report = process.report?.getReport?.()
  if (report?.header?.glibcVersionRuntime) {
    return 'glibc'
  }
  return 'musl'
}

function platformKey() {
  const arch = os.arch()
  switch (process.platform) {
    case 'darwin':
    case 'win32':
      return `${process.platform} ${arch}`
    case 'linux':
      return `linux ${arch} ${linuxLibc()}`
    default:
      return `${process.platform} ${arch}`
  }
}

function resolveBinary() {
  const key = platformKey()
  const entry = packages[key]
  if (!entry) {
    throw new Error(`unsupported platform: ${key}`)
  }

  const [packageName, subpath] = entry
  try {
    return require.resolve(`${packageName}/${subpath}`)
  } catch {
    throw new Error(
      [
        `the at-email npm package for this platform was not installed: ${packageName}`,
        'reinstall without --omit=optional or --no-optional, then try again'
      ].join('\n')
    )
  }
}

function main() {
  let binary
  try {
    binary = resolveBinary()
  } catch (error) {
    console.error(`at-email: ${error.message}`)
    process.exit(1)
  }

  const result = childProcess.spawnSync(binary, process.argv.slice(2), {
    stdio: 'inherit',
    env: {
      ...process.env,
      AT_EMAIL_DISTRIBUTION: 'npm',
      NODE_PACKAGE_MANAGER: process.env.npm_config_user_agent || ''
    }
  })

  if (result.error) {
    console.error(`at-email: failed to run ${binary}: ${result.error.message}`)
    process.exit(1)
  }

  if (result.signal) {
    process.kill(process.pid, result.signal)
    return
  }

  process.exit(result.status ?? 1)
}

main()
