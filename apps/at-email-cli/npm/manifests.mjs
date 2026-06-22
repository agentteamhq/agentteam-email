import { binaryAliases, platformBinarySubpath, platformPackageName, rootPackageName } from './platforms.mjs'

const repository = {
  type: 'git',
  url: 'git+https://github.com/agentteamhq/agentteam-email.git',
  directory: 'apps/at-email-cli'
}

const bugs = {
  url: 'https://github.com/agentteamhq/agentteam-email/issues'
}

const homepage = 'https://www.agentteam.email'
const license = 'MIT'
const engines = { node: '>=18' }
const publishConfig = { access: 'public', provenance: true }

export function rootManifest({ version, platforms }) {
  return {
    name: rootPackageName,
    version,
    description: 'Portable CLI for working with AgentTeam Email mailboxes.',
    keywords: ['agentteam', 'email', 'mail', 'cli', 'agents'],
    homepage,
    bugs,
    repository,
    license,
    bin: Object.fromEntries(binaryAliases.map((alias) => [alias, 'bin/at-email.js'])),
    files: ['bin', 'LICENSE', 'README.md'],
    engines,
    optionalDependencies: Object.fromEntries(
      platforms.map((platform) => [platformPackageName(platform), version])
    ),
    publishConfig
  }
}

export function platformManifest({ version, platform }) {
  return {
    name: platformPackageName(platform),
    version,
    description: `The ${platform.suffix} binary package for the at-email CLI.`,
    homepage,
    bugs,
    repository,
    license,
    os: [platform.npmOs],
    cpu: [platform.npmCpu],
    ...(platform.npmLibc ? { libc: [platform.npmLibc] } : {}),
    files: [platformBinarySubpath(platform), 'LICENSE', 'README.md'],
    engines,
    preferUnplugged: true,
    publishConfig
  }
}
