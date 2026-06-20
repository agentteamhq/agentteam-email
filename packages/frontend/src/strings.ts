const brandName = 'AgentTeam Email'
const appDisplayName = 'AT Email'
const organizationName = 'AgentTeam'
const marketingOrigin = 'https://www.agentteam.email'
const appOrigin = 'https://app.agentteam.email'
const docsOrigin = 'https://agentteamemail.mintlify.com'
const githubOrganizationUrl = 'https://github.com/agentteamhq'
const repositoryUrl = `${githubOrganizationUrl}/agentteam-email`
const twitterAccount = '@agentteam'
const twitterUrl = 'https://x.com/agentteam'

export const STRINGS = {
  BRAND_NAME: brandName,
  TWITTER_ACCOUNT: twitterAccount,
  TWITTER_TITLE: `Follow ${twitterAccount} on X`,
  TWITTER_URL: twitterUrl,
  DISCORD_TITLE: `${brandName} community on Discord`,
  DISCORD_URL: 'https://discord.gg/X8znnm5Vbc'
}

export const SITE_STRINGS = {
  APP_DISPLAY_NAME: appDisplayName,
  ASSET_VERSION: '20260619',
  BRAND_NAME: brandName,
  APP_ORIGIN: appOrigin,
  DEFAULT_DESCRIPTION:
    'Give every AI agent its own mailbox for inbound capture, outbound delivery, archival, and operator review.',
  DEFAULT_TITLE: `${brandName} | Agent email service`,
  DOCS_ORIGIN: docsOrigin,
  MARKETING_ORIGIN: marketingOrigin,
  THEME_COLOR: '#ffffff',
  DOCUMENTATION: {
    NAME: `${brandName} documentation`,
    URL: docsOrigin
  },
  ORGANIZATION: {
    ID: `${marketingOrigin}/#organization`,
    NAME: organizationName,
    SAME_AS: [marketingOrigin, appOrigin, docsOrigin, githubOrganizationUrl, twitterUrl]
  },
  REPOSITORY: {
    ID: `${repositoryUrl}#source-code`,
    LICENSE_URL: `${repositoryUrl}/blob/main/LICENSE`,
    NAME: `${brandName} source code`,
    PROGRAMMING_LANGUAGES: ['TypeScript'],
    URL: repositoryUrl
  },
  WEB_APPLICATION: {
    APPLICATION_CATEGORY: 'BusinessApplication',
    ID_PATH: '/#web-application',
    OG_IMAGE_ALT: `${appDisplayName} app icon`,
    RUNTIME_PLATFORM: 'Web'
  }
} as const

export function formatSiteTitle(title: string): string {
  return `${title} | ${brandName}`
}
