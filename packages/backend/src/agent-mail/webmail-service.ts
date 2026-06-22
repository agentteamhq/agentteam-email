import addressparser from 'nodemailer/lib/addressparser/index.js'

import { globals } from '../globals'
import { requireAgentMailOrganizationContext } from './service'
import { WildDuckAPIError, createWildDuckClient } from './wildduck-client'
import type {
  WildDuckAddressInput,
  WildDuckMailbox,
  WildDuckMessage,
  WildDuckMessageAddress,
  WildDuckMessageAttachment,
  WildDuckUser
} from './wildduck-client'
import type { OrganizationId } from '@main/db'
import type { Database } from '../db/db'

const ACTIVE_MAIL_DOMAIN_STATUSES = ['active', 'degraded'] as const
const DEFAULT_MESSAGE_LIMIT = 25
const MAX_MESSAGE_LIMIT = 100
const THREAD_MESSAGE_LIMIT = 250

const SAFE_INLINE_ATTACHMENT_TYPES = new Set(['image/gif', 'image/jpeg', 'image/png', 'image/webp'])

export interface AgentMailWebAccount {
  address: string
  description?: string
  id: string
  name: string
  state: 'ready'
}

export interface AgentMailWebFolder {
  id: string
  name: string
  path: string
  protected: boolean
  specialUse?: string
  total?: number
  unread?: number
}

export interface AgentMailWebMessageSummary {
  attachmentCount: number
  from: string
  id: string
  isDraft: boolean
  isStarred: boolean
  mailboxId: string
  receivedAt?: string
  subject: string
  teaser: string
  threadId?: string
  unread: boolean
}

export interface AgentMailWebAttachment {
  contentId?: string
  disposition?: string
  filename: string
  id: string
  mimetype?: string
  size?: number
  url: string
}

export interface AgentMailWebThreadMessage extends AgentMailWebMessageSummary {
  attachments: AgentMailWebAttachment[]
  cc: string[]
  html: string
  messageId?: string
  sourceUrl: string
  to: string[]
}

export interface AgentMailWebMessageDetail extends AgentMailWebThreadMessage {
  thread?: AgentMailWebThreadMessage[]
}

export interface AgentMailWebWorkspace {
  accounts: AgentMailWebAccount[]
  activeAccountId: string | null
  activeFolderId: string | null
  folders: AgentMailWebFolder[]
  messages: AgentMailWebMessageSummary[]
  pagination: {
    limit: number
    nextCursor: string | null
    previousCursor: string | null
    total: number | null
  }
  selectedMessage: AgentMailWebMessageDetail | null
}

export interface AgentMailWorkspaceInput {
  accountId?: string
  cursor?: string
  direction?: 'next' | 'previous'
  folderId?: string
  limit?: number
  messageId?: string
  query?: string
  unreadOnly?: boolean
}

export interface AgentMailComposeInput {
  accountId: string
  bcc?: string
  body: string
  cc?: string
  draftMailboxId?: string
  draftMessageId?: string
  html?: string
  reference?: {
    action: 'forward' | 'reply' | 'replyAll'
    mailboxId: string
    messageId: string
  }
  subject?: string
  to?: string
}

export interface AgentMailMessageActionInput {
  accountId: string
  mailboxId: string
  messageId: string
}

export class AgentMailWebmailError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 403 | 404 | 502
  ) {
    super(message)
    this.name = 'AgentMailWebmailError'
  }
}

export function isAgentMailWebmailError(error: unknown): error is AgentMailWebmailError {
  return error instanceof AgentMailWebmailError
}

export async function getAgentMailAccountsForWeb(headers: Headers): Promise<{
  accounts: AgentMailWebAccount[]
}> {
  const { db } = await globals()
  const context = await requireAgentMailOrganizationContext(headers)
  const client = createWildDuckClient()
  const domains = await listAuthorizedMailDomains(db, context.organizationId)
  const accounts = await listAuthorizedAccounts(client, domains)

  return { accounts }
}

export async function getAgentMailWorkspaceForWeb({
  headers,
  input
}: {
  headers: Headers
  input: AgentMailWorkspaceInput
}): Promise<AgentMailWebWorkspace> {
  const { db } = await globals()
  const context = await requireAgentMailOrganizationContext(headers)
  const client = createWildDuckClient()
  const domains = await listAuthorizedMailDomains(db, context.organizationId)
  const accounts = await listAuthorizedAccounts(client, domains)
  const requestedAccountId = normalizeMailboxAddress(input.accountId)
  const account = requestedAccountId
    ? accounts.find((candidate) => candidate.id === requestedAccountId)
    : accounts[0]

  if (!account) {
    return emptyWorkspace(accounts)
  }

  const userId = await resolveAuthorizedWildDuckUser(client, domains, account.id)
  const mailboxes = normalizeListResults(await client.listMailboxes(userId))
  const folders = mailboxes.map(toFolderView)
  const selectedMailbox = resolveSelectedMailbox(mailboxes, input.folderId)
  const activeFolderId = selectedMailbox?.id ?? null

  if (!selectedMailbox?.id) {
    return {
      ...emptyWorkspace(accounts),
      activeAccountId: account.id,
      folders
    }
  }

  const selectedMailboxId = selectedMailbox.id
  const limit = normalizeLimit(input.limit)
  const messagesEnvelope = input.query?.trim()
    ? await client.searchMessages(userId, input.query.trim(), {
        limit,
        next: input.direction === 'next' ? input.cursor : undefined,
        previous: input.direction === 'previous' ? input.cursor : undefined
      })
    : await client.listMessages(userId, selectedMailboxId, {
        limit,
        next: input.direction === 'next' ? input.cursor : undefined,
        previous: input.direction === 'previous' ? input.cursor : undefined,
        unseen: input.unreadOnly
      })
  const messages = normalizeListResults(messagesEnvelope).map((message) =>
    toMessageSummary(message, selectedMailboxId)
  )
  const selectedMessageId = input.messageId ?? messages[0]?.id
  const selectedMessageSummary = selectedMessageId
    ? messages.find((message) => message.id === selectedMessageId)
    : undefined
  const selectedMessageMailboxId = selectedMessageSummary?.mailboxId ?? activeFolderId
  const selectedMessage =
    selectedMessageId && selectedMessageMailboxId
      ? await getMessageDetailWithThread({
          accountId: account.id,
          client,
          mailboxId: selectedMessageMailboxId,
          messageId: selectedMessageId,
          userId
        })
      : null

  return {
    accounts,
    activeAccountId: account.id,
    activeFolderId,
    folders,
    messages,
    pagination: {
      limit,
      nextCursor: cursorValue(messagesEnvelope.nextCursor ?? messagesEnvelope.next),
      previousCursor: cursorValue(messagesEnvelope.previousCursor ?? messagesEnvelope.previous),
      total: typeof messagesEnvelope.total === 'number' ? messagesEnvelope.total : null
    },
    selectedMessage
  }
}

export async function getAgentMailAttachmentForWeb({
  accountId,
  attachmentId,
  headers,
  mailboxId,
  messageId
}: {
  accountId: string
  attachmentId: string
  headers: Headers
  mailboxId: string
  messageId: string
}): Promise<Response> {
  const client = createWildDuckClient()
  const { userId } = await resolveAuthorizedAccountFromHeaders(headers, accountId, client)
  const upstream = await client.fetchAttachment(
    userId,
    requireRouteToken(mailboxId, 'mailboxId'),
    requireRouteToken(messageId, 'messageId'),
    requireRouteToken(attachmentId, 'attachmentId')
  )
  return safeAttachmentResponse(upstream)
}

export async function getAgentMailOriginalSourceForWeb({
  accountId,
  headers,
  mailboxId,
  messageId
}: {
  accountId: string
  headers: Headers
  mailboxId: string
  messageId: string
}): Promise<Response> {
  const client = createWildDuckClient()
  const { userId } = await resolveAuthorizedAccountFromHeaders(headers, accountId, client)
  const upstream = await client.fetchMessageSource(
    userId,
    requireRouteToken(mailboxId, 'mailboxId'),
    requireRouteToken(messageId, 'messageId')
  )
  return safeOriginalSourceResponse(upstream)
}

export async function sendAgentMailMessageForWeb({
  headers,
  input
}: {
  headers: Headers
  input: AgentMailComposeInput
}) {
  const client = createWildDuckClient()
  const { address, userId } = await resolveAuthorizedAccountFromHeaders(headers, input.accountId, client)
  const payload = normalizeComposePayload(input, address, { requireRecipient: true })

  await client.submitMessage(userId, payload)
  return { success: true }
}

export async function saveAgentMailDraftForWeb({
  headers,
  input
}: {
  headers: Headers
  input: AgentMailComposeInput
}) {
  const client = createWildDuckClient()
  const { address, userId } = await resolveAuthorizedAccountFromHeaders(headers, input.accountId, client)
  const mailboxes = normalizeListResults(await client.listMailboxes(userId))
  const draftsMailbox = await resolveDraftsMailbox(client, userId, mailboxes)
  const replacePrevious =
    input.draftMailboxId && input.draftMessageId
      ? {
          id: requirePositiveMessageId(input.draftMessageId),
          mailbox: resolveMailboxById(mailboxes, input.draftMailboxId).id
        }
      : undefined
  const payload = normalizeComposePayload(input, address, { requireRecipient: false })
  const result = await client.uploadMessage(userId, draftsMailbox.id, {
    ...payload,
    draft: true,
    replacePrevious
  })
  const draftId = stringValue(result.message?.id)

  if (!draftId) {
    throw new AgentMailWebmailError('WildDuck did not return a draft message id', 502)
  }

  return {
    draftId,
    mailboxId: stringValue(result.message?.mailbox) || draftsMailbox.id,
    previousDeleted: Boolean(result.previousDeleted),
    success: true
  }
}

export async function sendAgentMailDraftForWeb({
  headers,
  input
}: {
  headers: Headers
  input: AgentMailMessageActionInput
}) {
  const client = createWildDuckClient()
  const { userId } = await resolveAuthorizedAccountFromHeaders(headers, input.accountId, client)
  const mailboxes = normalizeListResults(await client.listMailboxes(userId))
  const mailbox = resolveMailboxById(mailboxes, input.mailboxId)
  await client.submitDraft(userId, mailbox.id, requirePositiveMessageId(input.messageId).toString())
  return { success: true }
}

export async function updateAgentMailMessageForWeb({
  headers,
  input
}: {
  headers: Headers
  input: AgentMailMessageActionInput & {
    flagged?: boolean
    seen?: boolean
  }
}) {
  const client = createWildDuckClient()
  const { userId } = await resolveAuthorizedAccountFromHeaders(headers, input.accountId, client)
  const mailboxes = normalizeListResults(await client.listMailboxes(userId))
  const mailbox = resolveMailboxById(mailboxes, input.mailboxId)
  const updates = {
    ...(typeof input.flagged === 'boolean' ? { flagged: input.flagged } : {}),
    ...(typeof input.seen === 'boolean' ? { seen: input.seen } : {})
  }

  if (Object.keys(updates).length === 0) {
    throw new AgentMailWebmailError('No message update was requested', 400)
  }

  await client.updateMessage(
    userId,
    mailbox.id,
    requirePositiveMessageId(input.messageId).toString(),
    updates
  )
  return { success: true }
}

export async function moveAgentMailMessageForWeb({
  headers,
  input
}: {
  headers: Headers
  input: AgentMailMessageActionInput & {
    targetMailboxId: string
  }
}) {
  const client = createWildDuckClient()
  const { userId } = await resolveAuthorizedAccountFromHeaders(headers, input.accountId, client)
  const mailboxes = normalizeListResults(await client.listMailboxes(userId))
  const mailbox = resolveMailboxById(mailboxes, input.mailboxId)
  const targetMailbox = resolveMailboxById(mailboxes, input.targetMailboxId)
  await client.updateMessage(userId, mailbox.id, requirePositiveMessageId(input.messageId).toString(), {
    moveTo: targetMailbox.id
  })
  return { success: true }
}

export async function deleteAgentMailMessageForWeb({
  headers,
  input
}: {
  headers: Headers
  input: AgentMailMessageActionInput
}) {
  const client = createWildDuckClient()
  const { userId } = await resolveAuthorizedAccountFromHeaders(headers, input.accountId, client)
  const mailboxes = normalizeListResults(await client.listMailboxes(userId))
  const mailbox = resolveMailboxById(mailboxes, input.mailboxId)
  await client.deleteMessage(userId, mailbox.id, requirePositiveMessageId(input.messageId).toString())
  return { success: true }
}

export async function createAgentMailFolderForWeb({
  accountId,
  headers,
  name
}: {
  accountId: string
  headers: Headers
  name: string
}) {
  const client = createWildDuckClient()
  const { userId } = await resolveAuthorizedAccountFromHeaders(headers, accountId, client)
  const folderName = normalizeFolderName(name)
  await client.createMailbox(userId, folderName)
  const mailboxes = normalizeListResults(await client.listMailboxes(userId))
  const created = mailboxes.find(
    (mailbox) =>
      mailbox.path?.trim().toLowerCase() === folderName.toLowerCase() ||
      mailbox.name?.trim().toLowerCase() === folderName.toLowerCase()
  )

  if (!created) {
    throw new AgentMailWebmailError('WildDuck did not return the created folder', 502)
  }

  return { folder: toFolderView(created), success: true }
}

export async function deleteAgentMailFolderForWeb({
  accountId,
  headers,
  mailboxId
}: {
  accountId: string
  headers: Headers
  mailboxId: string
}) {
  const client = createWildDuckClient()
  const { userId } = await resolveAuthorizedAccountFromHeaders(headers, accountId, client)
  const mailboxes = normalizeListResults(await client.listMailboxes(userId))
  const mailbox = resolveMailboxById(mailboxes, mailboxId)
  if (isProtectedMailbox(mailbox.specialUse)) {
    throw new AgentMailWebmailError('System folders cannot be deleted', 400)
  }
  await client.deleteMailbox(userId, mailbox.id)
  return { success: true }
}

async function resolveAuthorizedAccountFromHeaders(
  headers: Headers,
  accountId: string,
  client: ReturnType<typeof createWildDuckClient>
) {
  const { db } = await globals()
  const context = await requireAgentMailOrganizationContext(headers)
  const domains = await listAuthorizedMailDomains(db, context.organizationId)
  const address = requireAuthorizedMailboxAddress(accountId, domains)
  const userId = await resolveAuthorizedWildDuckUser(client, domains, address)

  return { address, userId }
}

async function listAuthorizedMailDomains(db: Database, organizationId: OrganizationId) {
  const domains = new Set<string>()
  const mailDomains = await db.models.agentMailDomain
    .find({
      organizationId,
      status: { $in: ACTIVE_MAIL_DOMAIN_STATUSES }
    })
    .exec()
  const fallbackConnections = await db.models.cloudflareConnection
    .find({
      organizationId,
      status: 'active'
    })
    .exec()

  for (const domain of mailDomains) {
    addNormalizedDomain(domains, domain.domain)
  }
  for (const connection of fallbackConnections) {
    addNormalizedDomain(domains, connection.domain)
  }

  return [...domains].sort()
}

async function listAuthorizedAccounts(
  client: ReturnType<typeof createWildDuckClient>,
  domains: ReadonlyArray<string>
) {
  const accountsByAddress = new Map<string, AgentMailWebAccount>()

  for (const domain of domains) {
    const users = normalizeListResults(await client.listUsers(domain))
    for (const user of users) {
      for (const address of addressesForUser(user)) {
        if (!mailboxBelongsToDomains(address, domains)) {
          continue
        }
        accountsByAddress.set(address, {
          address,
          description: `WildDuck mailbox for ${domainPart(address)}`,
          id: address,
          name: user.name?.trim() || localPart(address),
          state: 'ready'
        })
      }
    }
  }

  return [...accountsByAddress.values()].sort((left, right) => left.address.localeCompare(right.address))
}

async function resolveAuthorizedWildDuckUser(
  client: ReturnType<typeof createWildDuckClient>,
  domains: ReadonlyArray<string>,
  accountId: string
) {
  const address = requireAuthorizedMailboxAddress(accountId, domains)
  const resolution = await client.resolveAddress(address)
  const userId = resolution.user || resolution.id
  if (!userId) {
    throw new AgentMailWebmailError('Mailbox account was not found', 404)
  }
  return userId
}

function emptyWorkspace(accounts: AgentMailWebAccount[]): AgentMailWebWorkspace {
  return {
    accounts,
    activeAccountId: accounts[0]?.id ?? null,
    activeFolderId: null,
    folders: [],
    messages: [],
    pagination: {
      limit: DEFAULT_MESSAGE_LIMIT,
      nextCursor: null,
      previousCursor: null,
      total: 0
    },
    selectedMessage: null
  }
}

function normalizeListResults<TResult>(response: { results?: TResult[] } | TResult[]): TResult[] {
  if (Array.isArray(response)) {
    return response
  }
  return Array.isArray(response.results) ? response.results : []
}

function toFolderView(mailbox: WildDuckMailbox): AgentMailWebFolder {
  const id = requireString(mailbox.id, 'mailbox id')
  const specialUse = mailbox.specialUse?.trim() || undefined
  return {
    id,
    name: mailbox.name?.trim() || mailbox.path?.trim() || id,
    path: mailbox.path?.trim() || mailbox.name?.trim() || id,
    protected: isProtectedMailbox(specialUse),
    specialUse,
    total: finiteNumber(mailbox.total),
    unread: finiteNumber(mailbox.unseen)
  }
}

function toMessageSummary(message: WildDuckMessage, fallbackMailboxId: string): AgentMailWebMessageSummary {
  const id = requireString(message.id, 'message id')
  const html = htmlBody(message)
  const attachments = messageAttachments(message)
  return {
    attachmentCount: attachments.length,
    from: addressLabel(message.from) || 'Unknown sender',
    id,
    isDraft: isDraftMessage(message),
    isStarred: isStarredMessage(message),
    mailboxId: stringValue(message.mailbox) || fallbackMailboxId,
    receivedAt: stringValue(message.date) || undefined,
    subject: stringValue(message.subject) || '(no subject)',
    teaser: stringValue(message.intro) || stringValue(message.text) || stripHTML(html).slice(0, 160),
    threadId: stringValue(message.thread) || undefined,
    unread: isUnreadMessage(message)
  }
}

async function getMessageDetailWithThread({
  accountId,
  client,
  mailboxId,
  messageId,
  userId
}: {
  accountId: string
  client: ReturnType<typeof createWildDuckClient>
  mailboxId: string
  messageId: string
  userId: string
}): Promise<AgentMailWebMessageDetail> {
  const selectedMessage = toMessageDetail(
    await client.getMessage(userId, mailboxId, messageId),
    accountId,
    mailboxId
  )
  if (!selectedMessage.threadId) {
    return selectedMessage
  }

  const threadMessages = await listThreadMessageDetails({
    accountId,
    client,
    fallbackMailboxId: mailboxId,
    threadId: selectedMessage.threadId,
    userId
  })

  return {
    ...selectedMessage,
    ...(threadMessages.length > 1 ? { thread: threadMessages } : {})
  }
}

async function listThreadMessageDetails({
  accountId,
  client,
  fallbackMailboxId,
  threadId,
  userId
}: {
  accountId: string
  client: ReturnType<typeof createWildDuckClient>
  fallbackMailboxId: string
  threadId: string
  userId: string
}): Promise<AgentMailWebThreadMessage[]> {
  if (!/^[0-9a-f]{24}$/iu.test(threadId)) {
    return []
  }

  const envelope = await client.searchMessages(userId, `thread:${threadId}`, {
    limit: THREAD_MESSAGE_LIMIT
  })
  const seen = new Set<string>()
  const summaries = normalizeListResults(envelope)
    .map((message) => toMessageSummary(message, fallbackMailboxId))
    .filter((message) => {
      const key = `${message.mailboxId}:${message.id}`
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return message.threadId === threadId
    })
    .sort((left, right) => dateTimeValue(left.receivedAt) - dateTimeValue(right.receivedAt))

  return Promise.all(
    summaries.map((message) =>
      client
        .getMessage(userId, message.mailboxId, message.id)
        .then((detail) => toMessageDetail(detail, accountId, message.mailboxId))
    )
  )
}

function toMessageDetail(
  message: WildDuckMessage,
  accountId: string,
  fallbackMailboxId: string
): AgentMailWebThreadMessage {
  const summary = toMessageSummary(message, fallbackMailboxId)
  const mailboxId = summary.mailboxId
  return {
    ...summary,
    attachments: messageAttachments(message)
      .map((attachment) => toAttachmentView(attachment, accountId, mailboxId, summary.id))
      .filter((attachment): attachment is AgentMailWebAttachment => attachment !== null),
    cc: addressList(message.cc),
    html: htmlBody(message),
    messageId: stringValue(message.messageId) || undefined,
    sourceUrl: mailRoutePath(
      `/accounts/${encodeURIComponent(accountId)}/mailboxes/${encodeURIComponent(mailboxId)}/messages/${encodeURIComponent(summary.id)}/source`
    ),
    to: addressList(message.to)
  }
}

function toAttachmentView(
  attachment: WildDuckMessageAttachment,
  accountId: string,
  mailboxId: string,
  messageId: string
): AgentMailWebAttachment | null {
  const id = stringValue(attachment.id)
  if (!id) {
    return null
  }
  const filename = stringValue(attachment.filename) || 'attachment'
  const mimetype = stringValue(attachment.contentType) || undefined
  const contentId =
    stringValue(attachment.contentId) ||
    stringValue(attachment.contentID) ||
    stringValue(attachment.cid) ||
    undefined
  return {
    contentId,
    disposition: stringValue(attachment.disposition) || (contentId ? 'inline' : 'attachment'),
    filename,
    id,
    mimetype,
    size: finiteNumber(attachment.size),
    url: mailRoutePath(
      `/accounts/${encodeURIComponent(accountId)}/mailboxes/${encodeURIComponent(mailboxId)}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(id)}`
    )
  }
}

function messageAttachments(message: WildDuckMessage): ReadonlyArray<WildDuckMessageAttachment> {
  if (isWildDuckMessageAttachmentArray(message.attachments)) {
    return message.attachments
  }
  return message.attachmentsList ?? []
}

function isWildDuckMessageAttachmentArray(
  value: WildDuckMessage['attachments']
): value is ReadonlyArray<WildDuckMessageAttachment> {
  return Array.isArray(value)
}

function resolveSelectedMailbox(
  mailboxes: ReadonlyArray<WildDuckMailbox>,
  requestedFolderId: string | undefined
) {
  if (requestedFolderId) {
    const selected = mailboxes.find((mailbox) => mailbox.id === requestedFolderId)
    if (selected) {
      return selected
    }
  }

  return (
    mailboxes.find((mailbox) => mailbox.specialUse?.toLowerCase() === '\\inbox') ??
    mailboxes.find((mailbox) => mailbox.path?.toLowerCase() === 'inbox') ??
    mailboxes[0]
  )
}

async function resolveDraftsMailbox(
  client: ReturnType<typeof createWildDuckClient>,
  userId: string,
  mailboxes: ReadonlyArray<WildDuckMailbox>
) {
  const existing = findSpecialMailbox(mailboxes, '\\drafts') ?? findMailboxByPath(mailboxes, 'Drafts')
  if (existing?.id) {
    return { ...existing, id: existing.id }
  }

  await client.createMailbox(userId, 'Drafts')
  const refreshedMailboxes = normalizeListResults(await client.listMailboxes(userId))
  const created =
    findSpecialMailbox(refreshedMailboxes, '\\drafts') ?? findMailboxByPath(refreshedMailboxes, 'Drafts')
  if (!created?.id) {
    throw new AgentMailWebmailError('WildDuck Drafts folder is not available', 502)
  }
  return { ...created, id: created.id }
}

function resolveMailboxById(mailboxes: ReadonlyArray<WildDuckMailbox>, mailboxId: string) {
  const requestedMailboxId = requireRouteToken(mailboxId, 'mailboxId')
  const mailbox = mailboxes.find((candidate) => candidate.id === requestedMailboxId)
  if (!mailbox?.id) {
    throw new AgentMailWebmailError('Mailbox folder was not found', 404)
  }
  return { ...mailbox, id: mailbox.id }
}

function findSpecialMailbox(mailboxes: ReadonlyArray<WildDuckMailbox>, specialUse: string) {
  const normalizedSpecialUse = specialUse.toLowerCase()
  return mailboxes.find((mailbox) => mailbox.specialUse?.toLowerCase() === normalizedSpecialUse)
}

function findMailboxByPath(mailboxes: ReadonlyArray<WildDuckMailbox>, path: string) {
  const normalizedPath = path.toLowerCase()
  return mailboxes.find(
    (mailbox) =>
      mailbox.path?.trim().toLowerCase() === normalizedPath ||
      mailbox.name?.trim().toLowerCase() === normalizedPath
  )
}

function normalizeComposePayload(
  input: AgentMailComposeInput,
  fromAddress: string,
  options: {
    requireRecipient: boolean
  }
) {
  const to = normalizeAddressList(input.to, 'to')
  const cc = normalizeAddressList(input.cc, 'cc')
  const bcc = normalizeAddressList(input.bcc, 'bcc')
  const text = input.body.replace(/\r?\n/gu, '\r\n').trim()
  const html = input.html?.trim()

  if (options.requireRecipient && to.length + cc.length + bcc.length === 0) {
    throw new AgentMailWebmailError('At least one recipient is required', 400)
  }
  if (!text && !html) {
    throw new AgentMailWebmailError('Message body is required', 400)
  }

  return {
    ...(bcc.length ? { bcc } : {}),
    ...(cc.length ? { cc } : {}),
    from: { address: fromAddress },
    ...(html ? { html } : {}),
    ...(input.reference ? { reference: normalizeMessageReference(input.reference) } : {}),
    subject: normalizeHeaderText(input.subject),
    ...(text ? { text } : {}),
    ...(to.length ? { to } : {})
  }
}

function normalizeAddressList(value: string | undefined, label: string): WildDuckAddressInput[] {
  const normalized = value?.trim() ?? ''
  if (!normalized) {
    return []
  }

  const parsedAddresses = addressparser(normalized, { flatten: true })
  if (!parsedAddresses.length) {
    throw new AgentMailWebmailError(`${label} must include a valid email address`, 400)
  }

  return parsedAddresses.map((address) => {
    const normalizedAddress = normalizeMailboxAddress(address.address)
    if (!normalizedAddress) {
      throw new AgentMailWebmailError(`${label} must include valid email addresses`, 400)
    }
    return {
      address: normalizedAddress,
      ...(address.name.trim() ? { name: address.name.trim() } : {})
    }
  })
}

function normalizeMessageReference(reference: NonNullable<AgentMailComposeInput['reference']>) {
  return {
    action: reference.action,
    id: requirePositiveMessageId(reference.messageId),
    mailbox: requireRouteToken(reference.mailboxId, 'reference.mailboxId')
  }
}

function requirePositiveMessageId(value: string | number) {
  const normalized = typeof value === 'number' ? value : Number(value.trim())
  if (!Number.isSafeInteger(normalized) || normalized < 1) {
    throw new AgentMailWebmailError('messageId must be a positive WildDuck UID', 400)
  }
  return normalized
}

function normalizeFolderName(value: string) {
  const normalized = value.trim()
  if (!normalized || /[/\\\0\r\n]/u.test(normalized)) {
    throw new AgentMailWebmailError('Folder name is invalid', 400)
  }
  return normalized
}

function normalizeHeaderText(value: string | undefined) {
  const normalized = value?.trim() ?? ''
  if (/[\r\n]/u.test(normalized)) {
    throw new AgentMailWebmailError('Subject must be a single line', 400)
  }
  return normalized
}

function safeAttachmentResponse(upstream: Response) {
  return new Response(upstream.body, {
    headers: safeStreamHeaders({
      contentLength: upstream.headers.get('content-length'),
      contentType: safeAttachmentContentType(upstream.headers)
    }),
    status: upstream.status
  })
}

function safeOriginalSourceResponse(upstream: Response) {
  return new Response(upstream.body, {
    headers: safeStreamHeaders({
      contentLength: upstream.headers.get('content-length'),
      contentType: 'message/rfc822'
    }),
    status: upstream.status
  })
}

function safeStreamHeaders({
  contentLength,
  contentType
}: {
  contentLength: string | null
  contentType: string
}) {
  const headers = new Headers({
    'cache-control': 'private, no-cache, no-store',
    'content-disposition': 'attachment',
    'content-security-policy': 'sandbox',
    'content-type': contentType,
    'x-content-type-options': 'nosniff'
  })

  if (contentLength && /^[0-9]+$/u.test(contentLength)) {
    headers.set('content-length', contentLength)
  }

  return headers
}

function safeAttachmentContentType(headers: Headers) {
  const mediaType = headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? ''
  return SAFE_INLINE_ATTACHMENT_TYPES.has(mediaType) ? mediaType : 'application/octet-stream'
}

function requireAuthorizedMailboxAddress(value: string, domains: ReadonlyArray<string>) {
  const address = normalizeMailboxAddress(value)
  if (!address || !mailboxBelongsToDomains(address, domains)) {
    throw new AgentMailWebmailError('Mailbox account is not available', 403)
  }
  return address
}

function normalizeMailboxAddress(value: string | undefined) {
  const normalized = value?.trim().toLowerCase() ?? ''
  if (!/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/u.test(normalized)) {
    return null
  }
  return normalized
}

function addressesForUser(user: WildDuckUser) {
  const addresses = new Set<string>()
  addNormalizedMailbox(addresses, user.address)
  addNormalizedMailbox(addresses, user.username)
  for (const address of user.addresses ?? []) {
    addNormalizedMailbox(addresses, typeof address === 'string' ? address : address.address)
  }
  return [...addresses]
}

function addNormalizedMailbox(target: Set<string>, value: string | undefined) {
  const address = normalizeMailboxAddress(value)
  if (address) {
    target.add(address)
  }
}

function addNormalizedDomain(target: Set<string>, value: string | undefined) {
  const normalized = value?.trim().toLowerCase() ?? ''
  if (/^[a-z0-9.-]+\.[a-z0-9-]+$/u.test(normalized)) {
    target.add(normalized)
  }
}

function mailboxBelongsToDomains(address: string, domains: ReadonlyArray<string>) {
  const domain = domainPart(address)
  return domains.includes(domain)
}

function domainPart(address: string) {
  const at = address.lastIndexOf('@')
  return at === -1 ? '' : address.slice(at + 1)
}

function localPart(address: string) {
  const at = address.lastIndexOf('@')
  return at === -1 ? address : address.slice(0, at)
}

function normalizeLimit(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_MESSAGE_LIMIT
  }
  return Math.min(Math.max(Math.trunc(value), 1), MAX_MESSAGE_LIMIT)
}

function cursorValue(value: string | false | null | undefined) {
  return typeof value === 'string' && value ? value : null
}

function dateTimeValue(value: string | undefined) {
  if (!value) {
    return 0
  }
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function requireRouteToken(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized || /[/\\\0]/u.test(normalized)) {
    throw new AgentMailWebmailError(`${label} is invalid`, 400)
  }
  return normalized
}

function requireString(value: unknown, label: string) {
  const normalized = stringValue(value)
  if (!normalized) {
    throw new AgentMailWebmailError(`WildDuck response is missing ${label}`, 502)
  }
  return normalized
}

function stringValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  return typeof value === 'string' ? value.trim() : ''
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isProtectedMailbox(specialUse: string | undefined) {
  return Boolean(
    specialUse && ['\\drafts', '\\inbox', '\\junk', '\\sent', '\\trash'].includes(specialUse.toLowerCase())
  )
}

function isDraftMessage(message: WildDuckMessage) {
  return message.draft === true || message.flags?.includes('\\Draft') === true
}

function isStarredMessage(message: WildDuckMessage) {
  return message.flagged === true || message.flags?.includes('\\Flagged') === true
}

function isUnreadMessage(message: WildDuckMessage) {
  if (typeof message.seen === 'boolean') {
    return !message.seen
  }
  return Array.isArray(message.flags) ? !message.flags.includes('\\Seen') : false
}

function htmlBody(message: WildDuckMessage) {
  if (Array.isArray(message.html)) {
    return message.html.join('')
  }
  if (message.html) {
    return message.html
  }
  return `<pre>${escapeHTML(stringValue(message.text))}</pre>`
}

function escapeHTML(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function stripHTML(value: string) {
  return value
    .replace(/<[^>]*>/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function addressLabel(value: WildDuckMessage['from']): string {
  if (typeof value === 'string') {
    return value
  }
  if (isMessageAddressArray(value)) {
    return addressDisplay(value[0])
  }
  return addressDisplay(value)
}

function addressList(value: WildDuckMessage['to']) {
  if (typeof value === 'string') {
    return [value]
  }
  if (!Array.isArray(value)) {
    return []
  }
  return value.map(addressDisplay).filter(Boolean)
}

function addressDisplay(value: WildDuckMessageAddress | undefined) {
  if (!value) {
    return ''
  }
  const address = stringValue(value.address)
  const name = stringValue(value.name)
  return name && address ? `${name} <${address}>` : address || name
}

function isMessageAddressArray(
  value: WildDuckMessage['from']
): value is ReadonlyArray<WildDuckMessageAddress> {
  return Array.isArray(value)
}

function mailRoutePath(path: string) {
  return `/rpc/mail${path}`
}

export function agentMailWebErrorStatus(error: unknown) {
  if (error instanceof WildDuckAPIError) {
    return error.status === 404 ? 404 : 502
  }
  if (isAgentMailWebmailError(error)) {
    return error.status
  }
  return null
}
