export const pluginName = 'at-email'
export const skillName = 'at-email-cli'

const description = 'Adds the at-email CLI skill for operating AgentTeam Email mailboxes.'
const homepage = 'https://www.agentteam.email'
const repository = 'https://github.com/agentteamhq/agentteam-email/tree/main/apps/at-email-cli'
const license = 'MIT'
const author = {
  name: 'AgentTeam',
  url: 'https://www.agentteam.email'
}
const keywords = ['agentteam', 'email', 'mail', 'cli', 'agents']
const skillsPath = './skills/'

export function claudePluginManifest({ version }) {
  return {
    name: pluginName,
    displayName: 'AgentTeam Email',
    version,
    description,
    author,
    homepage,
    repository,
    license,
    keywords,
    skills: skillsPath
  }
}

export function codexPluginManifest({ version }) {
  return {
    name: pluginName,
    version,
    description,
    author,
    homepage,
    repository,
    license,
    keywords,
    skills: skillsPath,
    interface: {
      displayName: 'AgentTeam Email',
      shortDescription: 'Operate an AgentTeam Email mailbox with at-email.',
      longDescription:
        'Use the at-email CLI to check mailbox status, list and read messages, search mail, send replies, and automate mailbox workflows with JSON output.',
      developerName: 'AgentTeam',
      category: 'Productivity',
      capabilities: ['Interactive', 'Read', 'Write'],
      websiteURL: homepage,
      defaultPrompt: [
        'Check my at-email inbox',
        'Read the latest at-email message',
        'Draft a reply with at-email'
      ],
      brandColor: '#0F766E'
    }
  }
}

export const pluginBundles = [
  {
    id: 'claude',
    title: 'Claude Code',
    root: pluginName,
    manifestPath: '.claude-plugin/plugin.json',
    manifest: claudePluginManifest,
    archiveSuffix: 'claude-plugin'
  },
  {
    id: 'codex',
    title: 'Codex',
    root: pluginName,
    manifestPath: '.codex-plugin/plugin.json',
    manifest: codexPluginManifest,
    archiveSuffix: 'codex-plugin'
  }
]
