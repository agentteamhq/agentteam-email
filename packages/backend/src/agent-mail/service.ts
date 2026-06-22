import { randomUUID } from 'node:crypto'

import { globals } from '../globals'

import { getAgentMailControlStatus, submitAgentMailSend } from './control-client'
import type { OrganizationId, UserId } from '@main/db'

export class AgentMailAccessError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403
  ) {
    super(message)
    this.name = 'AgentMailAccessError'
  }
}

export function isAgentMailAccessError(error: unknown): error is AgentMailAccessError {
  return error instanceof AgentMailAccessError
}

export async function getAgentMailStatusForWeb(headers: Headers): Promise<unknown> {
  await requireAgentMailOrganizationContext(headers)
  return getAgentMailControlStatus()
}

export async function submitAgentMailOutboundFromWeb({
  headers,
  input
}: {
  headers: Headers
  input: {
    from: string
    subject: string
    text: string
    to: string[]
  }
}): Promise<unknown> {
  const { db } = await globals()
  const context = await requireAgentMailOrganizationContext(headers)
  const from = normalizeMailbox(input.from, 'from')
  const recipients = input.to.map((recipient) => normalizeMailbox(recipient, 'to'))
  if (recipients.length !== 1) {
    throw new Error('Exactly one recipient is currently supported')
  }
  const senderDomain = domainPart(from)
  const connection = await db.models.cloudflareConnection
    .findOne({
      organizationId: context.organizationId,
      domain: senderDomain,
      status: 'active'
    })
    .exec()

  if (!connection) {
    throw new Error('Sender domain is not active')
  }

  const idempotencyKey = randomUUID()
  return submitAgentMailSend({
    idempotency_key: idempotencyKey,
    domain: senderDomain,
    from,
    to: recipients[0],
    raw: buildSimpleTextMessage({
      from,
      subject: input.subject,
      text: input.text,
      to: recipients[0]
    })
  })
}

export async function requireAgentMailOrganizationContext(headers: Headers): Promise<{
  organizationId: OrganizationId
  userId: UserId
}> {
  const { auth, db } = await globals()
  const session = await auth.api.getSession({ headers })

  if (!session?.user) {
    throw new AgentMailAccessError('Authentication required', 401)
  }

  const userId = session.user.id as UserId
  const activeOrganizationId = session.session.activeOrganizationId
  const organizationId =
    typeof activeOrganizationId === 'string' && activeOrganizationId
      ? (activeOrganizationId as OrganizationId)
      : null

  if (!organizationId) {
    throw new AgentMailAccessError('An active organization is required', 403)
  }

  const member = await db.models.member.findOne({ organizationId, userId }).exec()
  if (!member) {
    throw new AgentMailAccessError('Organization access is required', 403)
  }

  return { organizationId, userId }
}

function buildSimpleTextMessage({
  from,
  subject,
  text,
  to
}: {
  from: string
  subject: string
  text: string
  to: string
}): string {
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${sanitizeHeaderValue(subject, 'subject')}`,
    `Message-ID: <${randomUUID()}@agentteam.email>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    normalizeTextBody(text)
  ].join('\r\n')
}

function normalizeMailbox(value: string, label: string): string {
  const normalized = value.trim().toLowerCase()
  if (/[<>\r\n]/u.test(normalized) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(normalized)) {
    throw new Error(`${label} must be a valid mailbox`)
  }
  return normalized
}

function domainPart(mailbox: string): string {
  const at = mailbox.lastIndexOf('@')
  if (at < 0 || at === mailbox.length - 1) {
    throw new Error('Mailbox is missing a domain')
  }
  return mailbox.slice(at + 1).toLowerCase()
}

function sanitizeHeaderValue(value: string, label: string): string {
  const normalized = value.trim()
  if (!normalized || /[\r\n]/u.test(normalized)) {
    throw new Error(`${label} must be a non-empty single-line value`)
  }
  return normalized
}

function normalizeTextBody(value: string): string {
  const normalized = value.replace(/\r?\n/gu, '\r\n')
  if (!normalized.trim()) {
    throw new Error('text must be non-empty')
  }
  return normalized
}
