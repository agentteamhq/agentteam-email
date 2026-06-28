const brandName = 'AgentTeam Email'
const appDisplayName = 'AT Email'
const companyName = 'Agentteam Email'
const marketingOrigin = 'https://www.agentteam.email'
const appOrigin = 'https://app.agentteam.email'
const docsOrigin = 'https://agentteamemail.mintlify.app'
const githubOrganizationUrl = 'https://github.com/agentteamhq'
const repositoryUrl = `${githubOrganizationUrl}/agentteam-email`
const linkedInUrl = 'https://www.linkedin.com/company/agentteamhq'
const discordUrl = 'https://discord.gg/9NxGdSK5qB'
const defaultDescription =
  'Provision governed email addresses for agents, review drafts, and keep every mailbox on your own domain.'
const defaultKeywords =
  'at email,www.agentteam.email,agent email,email for ai agents,agent mailboxes,ai agent email,agent email platform,domain email for agents,cloudflare email routing,agent draft review,agent email permissions,agent activity log,agentteam email'

export const STRINGS = {
  BRAND_NAME: brandName,
  DISCORD_TITLE: `${brandName} community on Discord`,
  DISCORD_URL: discordUrl
}

export const SITE_STRINGS = {
  APP_DISPLAY_NAME: appDisplayName,
  ASSET_VERSION: '20260619',
  BRAND_NAME: brandName,
  COMPANY_NAME: companyName,
  APP_ORIGIN: appOrigin,
  DEFAULT_DESCRIPTION: defaultDescription,
  DEFAULT_KEYWORDS: defaultKeywords,
  DEFAULT_TITLE: `${appDisplayName} - Agent Email on Your Domain`,
  DOCS_ORIGIN: docsOrigin,
  MARKETING_ORIGIN: marketingOrigin,
  SUPPORT_EMAIL: 'support@agentteam.email',
  THEME_COLOR: '#ffffff',
  DOCUMENTATION: {
    NAME: `${brandName} documentation`,
    URL: docsOrigin
  },
  OPEN_GRAPH_IMAGE: {
    ALT: `${appDisplayName} - Agent Email Platform`,
    HEIGHT: 630,
    PATHNAME: '/ogimage.jpg',
    TYPE: 'image/jpeg',
    WIDTH: 1200
  },
  ORGANIZATION: {
    ID: `${marketingOrigin}/#organization`,
    NAME: companyName
  },
  REPOSITORY: {
    ID: `${repositoryUrl}#source-code`,
    LICENSE_URL: `${repositoryUrl}/blob/main/LICENSE`,
    DESCRIPTION: 'Source code for the Agentteam Email public website and product surface.',
    NAME: `${companyName} source code`,
    PROGRAMMING_LANGUAGES: ['Astro', 'TypeScript'],
    URL: repositoryUrl
  },
  SOCIAL_URLS: {
    DISCORD: discordUrl,
    GITHUB: repositoryUrl,
    LINKEDIN: linkedInUrl
  },
  WEBSITE: {
    ID: `${marketingOrigin}/#website`,
    IN_LANGUAGE: 'en',
    NAME: companyName,
    URL: marketingOrigin
  },
  WEB_APPLICATION: {
    APPLICATION_CATEGORY: 'BusinessApplication',
    DESCRIPTION:
      'Agentteam Email provisions governed email addresses for AI agents, with domain routing, draft review, permissions, and activity visibility.',
    ID_PATH: '/#web-application',
    RUNTIME_PLATFORM: 'Web'
  }
} as const

export function formatSiteTitle(title: string): string {
  return `${title} | ${appDisplayName}`
}
