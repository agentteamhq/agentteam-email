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

requireEnv(webEnv, 'AGENT_MAIL_CONTROL_API_BASE_URL')
requireEnv(webEnv, 'AGENT_MAIL_CONTROL_API_TOKEN')
requireEnv(webEnv, 'AGENT_MAIL_WILDDUCK_API_BASE_URL')
requireEnv(webEnv, 'AGENT_MAIL_WILDDUCK_ADMIN_ACCESS_TOKEN')
forbidEnv(webEnv, 'AGENT_MAIL_CLOUDFLARE_API_TOKEN')
forbidEnv(webEnv, 'AGENT_MAIL_CLOUDFLARE_WORKER_ARCHIVE_BUCKET')

requireEnv(controlEnv, 'AGENTTEAM_EMAIL_CONTROL_MONGODB_URI')
requireEnv(controlEnv, 'AGENT_MAIL_CONTROL_API_TOKEN')
requireEnv(controlEnv, 'AGENT_MAIL_CLOUDFLARE_API_BASE_URL')
requireEnv(controlEnv, 'AGENT_MAIL_CLOUDFLARE_ACCOUNT_ID')
requireEnv(controlEnv, 'AGENT_MAIL_CLOUDFLARE_WORKER_ARCHIVE_BUCKET')
requireEnv(controlEnv, 'AGENT_MAIL_CLOUDFLARE_API_TOKEN')

requireServicePort(mailControlService, 'admin', 8081)
requireServicePort(mailControlService, 'smtp', 2587)

console.log(`${manifestPath} render invariants passed`)

function requireDeployment(name) {
  return requireResource('Deployment', name)
}

function requireResource(kind, name) {
  const resource = documents.find(
    (document) => document?.kind === kind && document.metadata?.name === name
  )
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
