export const binaryName = 'at-email'
export const binaryAliases = ['at-email', 'atemail', 'agentteam-email', 'email']
export const rootPackageName = '@agentteamhq/email'
export const platformPackagePrefix = '@agentteamhq/email-'

export const platforms = [
  {
    suffix: 'linux-x64-gnu',
    npmOs: 'linux',
    npmCpu: 'x64',
    npmLibc: 'glibc',
    goos: 'linux',
    goarch: 'amd64'
  },
  {
    suffix: 'linux-x64-musl',
    npmOs: 'linux',
    npmCpu: 'x64',
    npmLibc: 'musl',
    goos: 'linux',
    goarch: 'amd64'
  },
  {
    suffix: 'linux-arm64-gnu',
    npmOs: 'linux',
    npmCpu: 'arm64',
    npmLibc: 'glibc',
    goos: 'linux',
    goarch: 'arm64'
  },
  {
    suffix: 'linux-arm64-musl',
    npmOs: 'linux',
    npmCpu: 'arm64',
    npmLibc: 'musl',
    goos: 'linux',
    goarch: 'arm64'
  },
  {
    suffix: 'darwin-x64',
    npmOs: 'darwin',
    npmCpu: 'x64',
    goos: 'darwin',
    goarch: 'amd64'
  },
  {
    suffix: 'darwin-arm64',
    npmOs: 'darwin',
    npmCpu: 'arm64',
    goos: 'darwin',
    goarch: 'arm64'
  },
  {
    suffix: 'win32-x64',
    npmOs: 'win32',
    npmCpu: 'x64',
    goos: 'windows',
    goarch: 'amd64'
  },
  {
    suffix: 'win32-arm64',
    npmOs: 'win32',
    npmCpu: 'arm64',
    goos: 'windows',
    goarch: 'arm64'
  }
]

export function platformPackageName(platform) {
  return `${platformPackagePrefix}${platform.suffix}`
}

export function platformBinarySubpath(platform) {
  return platform.goos === 'windows' ? 'bin/at-email.exe' : 'bin/at-email'
}

export function packageDirName(packageName) {
  const [scope, name] = packageName.split('/')
  if (!scope?.startsWith('@') || !name) {
    throw new Error(`expected scoped package name: ${packageName}`)
  }
  return [scope, name]
}
