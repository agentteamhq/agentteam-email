#!/usr/bin/env node
import { readFile } from 'node:fs/promises'

import { parseAllDocuments } from 'yaml'

const [manifestPath] = process.argv.slice(2)

if (!manifestPath) {
  throw new Error('usage: assert-rendered-chart.mjs <rendered-manifest.yaml>')
}

const manifest = await readFile(manifestPath, 'utf8')
const documents = parseAllDocuments(manifest).map((document) => {
  if (document.errors.length > 0) {
    throw new Error(`failed to parse rendered Helm manifest: ${document.errors[0].message}`)
  }
  return document.toJSON()
})

const webServer = requireDeployment('atemail-web-server')
const mailControl = requireDeployment('atemail-mail-control-service')
const mailControlService = requireResource('Service', 'atemail-mail-control-service')
const webEnv = containerEnv(webServer, 'web-server')
const controlEnv = containerEnv(mailControl, 'mail-control-service')

requireEnv(webEnv, 'AT_EMAIL_ADMIN_CONTROL_API_BASE_URL')
requireEnv(webEnv, 'AT_EMAIL_ADMIN_CONTROL_TO_WEB_API_TOKEN')
requireEnv(webEnv, 'AT_EMAIL_ADMIN_WILDDUCK_API_BASE_URL')
requireEnv(webEnv, 'AT_EMAIL_ADMIN_WILDDUCK_ADMIN_ACCESS_TOKEN')
requireEnv(webEnv, 'DATABASE_MAX_POOL_SIZE')
requireEnv(webEnv, 'TMP_DIR')
requireEnv(webEnv, 'AT_EMAIL_ADMIN_TRIAL_ENABLED')
requireEnv(webEnv, 'AT_EMAIL_ADMIN_TRIAL_ORGANIZATION_ID')
requireEnv(webEnv, 'AT_EMAIL_ADMIN_TRIAL_DOMAIN')
requireEnv(webEnv, 'AT_EMAIL_ADMIN_TRIAL_ADMISSION_TOKEN')
requireEnv(webEnv, 'AT_EMAIL_ADMIN_TRIAL_CAPABILITIES')
requireEnv(webEnv, 'AT_EMAIL_ADMIN_TRIAL_CLAIM_INTENT_TTL_SECONDS')
requireEnv(webEnv, 'AT_EMAIL_ADMIN_TRIAL_DAILY_SEND_LIMIT')
requireEnv(webEnv, 'AT_EMAIL_ADMIN_TRIAL_MAILBOX_LIFETIME_SECONDS')
requireEnv(webEnv, 'AT_EMAIL_ADMIN_TRIAL_MAILBOX_LOCAL_PREFIX')
requireEnv(webEnv, 'AT_EMAIL_ADMIN_TRIAL_MAX_ACTIVE')
requireEnv(webEnv, 'AT_EMAIL_ADMIN_TRIAL_TOTAL_SEND_LIMIT')
requireEnv(webEnv, 'CLOUDFLARE_API_BASE_URL')
requireEnv(webEnv, 'CLOUDFLARE_OAUTH_AUTHORIZATION_URL')
requireEnv(webEnv, 'CLOUDFLARE_OAUTH_CLIENT_ID')
requireEnv(webEnv, 'CLOUDFLARE_OAUTH_CLIENT_SECRET')
requireEnv(webEnv, 'CLOUDFLARE_OAUTH_ISSUER')
requireEnv(webEnv, 'CLOUDFLARE_OAUTH_REVOKE_URL')
requireEnv(webEnv, 'CLOUDFLARE_OAUTH_SCOPES')
requireEnv(webEnv, 'CLOUDFLARE_OAUTH_TOKEN_URL')
requireEnv(webEnv, 'CLOUDFLARE_OAUTH_USERINFO_URL')
requireEnv(webEnv, 'PUBLIC_GOOGLE_CLIENT_ID')
requireEnv(webEnv, 'GOOGLE_CLIENT_SECRET')
requireEnv(webEnv, 'PUBLIC_LINKEDIN_CLIENT_ID')
requireEnv(webEnv, 'LINKEDIN_CLIENT_SECRET')
requireEnv(webEnv, 'STRIPE_PUBLISHABLE_KEY')
requireEnv(webEnv, 'STRIPE_SECRET_KEY')
requireEnv(webEnv, 'SMTP_ADDRESS')
requireEnv(webEnv, 'SMTP_PORT')
forbidEnv(webEnv, 'AT_EMAIL_ADMIN_R2_API_TOKEN')

requireEnv(controlEnv, 'AT_EMAIL_ADMIN_CONTROL_MONGODB_URI')
requireEnv(controlEnv, 'AT_EMAIL_ADMIN_CONTROL_TO_WEB_API_BASE_URL')
requireEnv(controlEnv, 'AT_EMAIL_ADMIN_CONTROL_TO_WEB_API_TOKEN')
requireEnv(controlEnv, 'AT_EMAIL_ADMIN_CF_API_BASE_URL')
requireEnv(controlEnv, 'AT_EMAIL_ADMIN_R2_ACCOUNT_ID')
requireEnv(controlEnv, 'AT_EMAIL_ADMIN_R2_API_TOKEN')
forbidEnv(controlEnv, 'CLOUDFLARE_OAUTH_CLIENT_ID')

requireServicePort(mailControlService, 'admin', 8081)
requireServicePort(mailControlService, 'smtp', 2587)

console.log(`${manifestPath} render invariants passed`)

function requireDeployment(name) {
  return requireResource('Deployment', name)
}

function requireResource(kind, name) {
  const resource = documents.find((document) => document?.kind === kind && document.metadata?.name === name)
  if (!resource) {
    throw new Error(`rendered chart is missing ${kind}/${name}`)
  }
  return resource
}

function containerEnv(deployment, containerName) {
  const containers = deployment.spec?.template?.spec?.containers
  if (!Array.isArray(containers)) {
    throw new Error(`Deployment/${deployment.metadata.name} is missing containers`)
  }
  const container = containers.find((candidate) => candidate.name === containerName)
  if (!container) {
    throw new Error(`Deployment/${deployment.metadata.name} is missing container ${containerName}`)
  }
  if (!Array.isArray(container.env)) {
    throw new Error(`Deployment/${deployment.metadata.name} container ${containerName} is missing env`)
  }
  return new Map(container.env.map((entry) => [entry.name, entry]))
}

function requireEnv(env, name) {
  const entry = env.get(name)
  if (!entry) {
    throw new Error(`rendered chart is missing required env ${name}`)
  }
  if (!('value' in entry) && !('valueFrom' in entry)) {
    throw new Error(`rendered env ${name} must use value or valueFrom`)
  }
}

function forbidEnv(env, name) {
  if (env.has(name)) {
    throw new Error(`rendered chart must not put ${name} in the web-server environment`)
  }
}

function requireServicePort(service, name, port) {
  const ports = service.spec?.ports
  if (!Array.isArray(ports)) {
    throw new Error(`Service/${service.metadata.name} is missing ports`)
  }
  const rendered = ports.find((candidate) => candidate.name === name)
  if (!rendered || rendered.port !== port) {
    throw new Error(`Service/${service.metadata.name} must expose ${name} port ${port}`)
  }
}
