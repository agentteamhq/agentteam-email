import { readFile } from 'node:fs/promises'

import { WORKER_NAME } from '../src/lib.js'
import { CLOUDFLARE_API_BASE, SCRIPT_NAME, parseCloudflareResponse, requireEnv } from './cloudflare-api.mjs'

const accountID = requireEnv('AGENT_MAIL_CLOUDFLARE_ACCOUNT_ID')
const token = requireEnv('AGENT_MAIL_CLOUDFLARE_API_TOKEN')
const orgPublicID = requireEnv('AGENTTEAM_ORG_PUBLIC_ID')
const connectionID = requireEnv('AGENTTEAM_CONNECTION_ID')
const domainID = requireEnv('AGENTTEAM_DOMAIN_ID')
const domain = requireEnv('AGENTTEAM_DOMAIN')
const archivePrefix = requireEnv('AGENTTEAM_ARCHIVE_PREFIX')
const r2Endpoint = requireEnv('AGENTTEAM_R2_ENDPOINT')
const r2Bucket = requireEnv('AGENTTEAM_R2_BUCKET')
const r2AccessKeyID = requireEnv('AGENTTEAM_R2_ACCESS_KEY_ID')
const r2SecretAccessKey = requireEnv('AGENTTEAM_R2_SECRET_ACCESS_KEY')
const r2SessionToken = requireEnv('AGENTTEAM_R2_SESSION_TOKEN')
const r2CredentialExpiresAt = requireEnv('AGENTTEAM_R2_CREDENTIAL_EXPIRES_AT')
const workerHMACSecret = requireEnv('AGENTTEAM_WORKER_HMAC_SECRET')
const ingestURL = requireEnv('AGENTTEAM_INGEST_URL')
const method = 'PUT'
const path = `/accounts/${accountID}/workers/scripts/${SCRIPT_NAME}`

if (WORKER_NAME !== SCRIPT_NAME) {
  throw new Error(`worker name mismatch: src/lib.js has ${WORKER_NAME}, API config has ${SCRIPT_NAME}`)
}

const mainModule = 'index.js'
const bundlePath = 'dist/worker.mjs'
const metadata = {
  main_module: mainModule,
  compatibility_date: '2026-06-19',
  bindings: [
    {
      type: 'plain_text',
      name: 'AGENTTEAM_ORG_PUBLIC_ID',
      text: orgPublicID
    },
    {
      type: 'plain_text',
      name: 'AGENTTEAM_CONNECTION_ID',
      text: connectionID
    },
    {
      type: 'plain_text',
      name: 'AGENTTEAM_DOMAIN_ID',
      text: domainID
    },
    {
      type: 'plain_text',
      name: 'AGENTTEAM_DOMAIN',
      text: domain
    },
    {
      type: 'plain_text',
      name: 'AGENTTEAM_ARCHIVE_PREFIX',
      text: archivePrefix
    },
    {
      type: 'plain_text',
      name: 'AGENTTEAM_R2_ENDPOINT',
      text: r2Endpoint
    },
    {
      type: 'plain_text',
      name: 'AGENTTEAM_R2_BUCKET',
      text: r2Bucket
    },
    {
      type: 'secret_text',
      name: 'AGENTTEAM_R2_ACCESS_KEY_ID',
      text: r2AccessKeyID
    },
    {
      type: 'secret_text',
      name: 'AGENTTEAM_R2_SECRET_ACCESS_KEY',
      text: r2SecretAccessKey
    },
    {
      type: 'secret_text',
      name: 'AGENTTEAM_R2_SESSION_TOKEN',
      text: r2SessionToken
    },
    {
      type: 'plain_text',
      name: 'AGENTTEAM_R2_CREDENTIAL_EXPIRES_AT',
      text: r2CredentialExpiresAt
    },
    {
      type: 'secret_text',
      name: 'AGENTTEAM_WORKER_HMAC_SECRET',
      text: workerHMACSecret
    },
    {
      type: 'plain_text',
      name: 'AGENTTEAM_INGEST_URL',
      text: ingestURL
    },
    {
      type: 'send_email',
      name: 'EMAIL'
    }
  ],
  annotations: {
    'workers/message': 'agent-mail cf-provision',
    'workers/tag': 'agent-mail'
  }
}

const form = new FormData()
form.append('metadata', JSON.stringify(metadata))
form.append(
  mainModule,
  new Blob([await readFile(bundlePath, 'utf8')], { type: 'application/javascript+module' }),
  mainModule
)

// R2 storage is accessed with temporary S3-compatible credentials supplied as
// Worker secrets. cf-provision does not query, create, or modify R2 buckets.
const response = await fetch(`${CLOUDFLARE_API_BASE}${path}`, {
  method,
  headers: {
    Authorization: `Bearer ${token}`
  },
  body: form
})
const result = await parseCloudflareResponse(response, method, path)

console.log(
  JSON.stringify(
    {
      script: SCRIPT_NAME,
      status: 'deployed',
      result: {
        id: result.id,
        etag: result.etag,
        modified_on: result.modified_on,
        handlers: result.handlers,
        compatibility_date: result.compatibility_date
      }
    },
    null,
    2
  )
)
