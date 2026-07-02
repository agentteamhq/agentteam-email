import { parse as parseContentType } from 'content-type'
import addressparser from 'nodemailer/lib/addressparser/index.js'
import {
  AgentMailAbilityActionByCapability,
  AgentMailCapability,
  AgentMailMailboxCapabilityGrantConstraints
} from '@main/db'

import { globals } from '../globals'
import { agentMailCapabilityGrantConstraints, agentMailSubject } from './permission-policy'
import {
  consumeAgentMailTrialSendQuota,
  requireAgentMailOrganizationContext,
  requireAgentMailPaperclipOperation
} from './service'
import {
  mailboxDomain,
  mailboxLocalPart,
  normalizeMailDomain,
  normalizeMailboxIdentifier
} from './mailbox-address'
import { WildDuckAPIError, createWildDuckClient } from './wildduck-client'
import type { AgentMailPaperclipOperation } from './service'
import type {
  WildDuckAddressInput,
  WildDuckMailbox,
  WildDuckMessage,
  WildDuckMessageAddress,
  WildDuckMessageAttachment,
  WildDuckUser
} from './wildduck-client'
import type { AgentMailAbilityAction, OrganizationId } from '@main/db'
import type { Database } from '../db/db'

const ACTIVE_MAIL_DOMAIN_STATUSES = ['active', 'degraded'] as const
const DEFAULT_MESSAGE_LIMIT = 25
const MAX_MESSAGE_LIMIT = 100
const THREAD_MESSAGE_LIMIT = 250
const AGENT_MAIL_ROUTE_PREFIX_HEADER = 'x-agentteam-mail-route-prefix'

const SAFE_INLINE_ATTACHMENT_TYPES = new Set(['image/gif', 'image/jpeg', 'image/png', 'image/webp'])

export interface AgentMailWebAccount {
  address: string
  description?: string
  id: string
  name: string
  state: 'disabled' | 'ready'
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
  plainText: string
  replyTo: string[]
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
  replyTo?: string
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

export async function getAgentMailAccountsForWeb(
  headers: Headers,
  options: { includeDisabled?: boolean } = {}
): Promise<{
  accounts: AgentMailWebAccount[]
}> {
  const { db } = await globals()
  const context = await requireAgentMailOrganizationContext(headers)
  requireAgentMailPaperclipOperation(context, ['status', 'search', 'read', 'reply', 'send'])
  const client = createWildDuckClient()
  const domains = await listAuthorizedMailDomains(db, context.organizationId)
  const accounts = await listAuthorizedAccountsForContext(client, domains, context, 'list', options)

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
  requireWorkspacePaperclipOperation(context, input)
  const routePrefix = mailRoutePrefix(headers)
  const client = createWildDuckClient()
  const domains = await listAuthorizedMailDomains(db, context.organizationId)
  const accounts = await listAuthorizedAccountsForContext(
    client,
    domains,
    context,
    input.query?.trim() ? 'search' : 'list'
  )
  const requestedAccountId = normalizeMailboxAddress(input.accountId)
  const account = requestedAccountId
    ? accounts.find((candidate) => candidate.id === requestedAccountId)
    : accounts[0]

  if (!account) {
    return emptyWorkspace(accounts)
  }

  const userId = await resolveWildDuckUserForAuthorizedAddress(client, account.id)
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
  const rawMessages = normalizeListResults(messagesEnvelope)
  const visibleMessages = rawMessages.filter((message) =>
    messageBelongsToAccount(
      message,
      account.id,
      ownershipOptionsForMailbox(mailboxes, stringValue(message.mailbox) || selectedMailboxId)
    )
  )
  const messages = visibleMessages.map((message) => toMessageSummary(message, selectedMailboxId))
  const selectedMessageId = input.messageId ?? messages[0]?.id
  const selectedMessageSummary = selectedMessageId
    ? messages.find((message) => message.id === selectedMessageId)
    : undefined
  const selectedMessageMailboxId = selectedMessageSummary?.mailboxId ?? activeFolderId
  const canReadSelectedMessage = !!selectedMessageMailboxId && canMailboxAction(context, 'read', account.id)
  const selectedMessage =
    selectedMessageId && selectedMessageMailboxId && canReadSelectedMessage
      ? await getMessageDetailWithThread({
          accountId: account.id,
          client,
          mailboxes,
          mailboxId: selectedMessageMailboxId,
          messageId: selectedMessageId,
          routePrefix,
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
      total:
        rawMessages.length === visibleMessages.length && typeof messagesEnvelope.total === 'number'
          ? messagesEnvelope.total
          : null
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
  const { address, client, userId } = await resolveAuthorizedAccountFromHeaders(
    headers,
    accountId,
    'read',
    'read'
  )
  const authorizedMailboxId = requireRouteToken(mailboxId, 'mailboxId')
  const authorizedMessageId = requireRouteToken(messageId, 'messageId')
  const mailboxes = normalizeListResults(await client.listMailboxes(userId))
  await requireAuthorizedWildDuckMessage(client, userId, authorizedMailboxId, authorizedMessageId, address, {
    ownership: ownershipOptionsForMailbox(mailboxes, authorizedMailboxId)
  })
  const upstream = await client.fetchAttachment(
    userId,
    authorizedMailboxId,
    authorizedMessageId,
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
  const { address, client, userId } = await resolveAuthorizedAccountFromHeaders(
    headers,
    accountId,
    'read',
    'read'
  )
  const authorizedMailboxId = requireRouteToken(mailboxId, 'mailboxId')
  const authorizedMessageId = requireRouteToken(messageId, 'messageId')
  const mailboxes = normalizeListResults(await client.listMailboxes(userId))
  await requireAuthorizedWildDuckMessage(client, userId, authorizedMailboxId, authorizedMessageId, address, {
    ownership: ownershipOptionsForMailbox(mailboxes, authorizedMailboxId)
  })
  const upstream = await client.fetchMessageSource(userId, authorizedMailboxId, authorizedMessageId)
  return safeOriginalSourceResponse(upstream)
}

export async function sendAgentMailMessageForWeb({
  headers,
  input
}: {
  headers: Headers
  input: AgentMailComposeInput
}) {
  const action = requiresReplyCapability(input) ? 'reply' : 'send'
  const { address, context } = await resolveAuthorizedMailboxFromHeaders(headers, input.accountId, action)
  requireAgentMailPaperclipOperation(context, action)
  const payload = normalizeComposePayload(input, address, { requireRecipient: true })
  requireMessageAction(context, action, address, composeRecipientAddresses(payload))
  const client = createWildDuckClient()
  const userId = await resolveWildDuckUserForAuthorizedAddress(client, address)
  if (payload.reference) {
    const mailboxes = normalizeListResults(await client.listMailboxes(userId))
    const referenceMailbox = resolveMailboxById(mailboxes, payload.reference.mailbox)
    await requireAuthorizedWildDuckMessage(
      client,
      userId,
      referenceMailbox.id,
      payload.reference.id.toString(),
      address,
      {
        ownership: ownershipOptionsForMailbox(mailboxes, referenceMailbox.id)
      }
    )
  }

  await consumeAgentMailTrialSendQuota(context, address)
  await client.submitMessage(userId, payload)
  return { success: true }
}

function requiresReplyCapability(input: AgentMailComposeInput) {
  return input.reference?.action === 'reply' || input.reference?.action === 'replyAll'
}

export async function saveAgentMailDraftForWeb({
  headers,
  input
}: {
  headers: Headers
  input: AgentMailComposeInput
}) {
  const { address, client, context, userId } = await resolveAuthorizedAccountFromHeaders(
    headers,
    input.accountId,
    'createDraft',
    []
  )
  requireDraftAction(context, 'createDraft', address)
  const mailboxes = normalizeListResults(await client.listMailboxes(userId))
  const draftsMailbox = await resolveDraftsMailbox(client, userId, mailboxes)
  let replacePrevious: { id: number; mailbox: string } | undefined
  if (input.draftMailboxId && input.draftMessageId) {
    requireDraftAction(context, 'read', address)
    replacePrevious = await resolveAuthorizedDraftReplacement(client, userId, address, mailboxes, input)
  }
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
  const { address, client, context, userId } = await resolveAuthorizedAccountFromHeaders(
    headers,
    input.accountId,
    'send',
    'send'
  )
  requireDraftAction(context, 'send', address)
  const mailboxes = normalizeListResults(await client.listMailboxes(userId))
  const mailbox = requireDraftsMailbox(resolveMailboxById(mailboxes, input.mailboxId))
  const messageId = requirePositiveMessageId(input.messageId).toString()
  requireDraftAction(context, 'read', address)
  const draft = await client.getMessage(userId, mailbox.id, messageId)
  requireMessageBelongsToAccount(draft, address, { includeSender: true })
  const recipientAddresses = messageRecipientAddresses(draft)
  if (!recipientAddresses.length) {
    throw new AgentMailWebmailError('Draft must include at least one recipient', 400)
  }
  requireMessageAction(context, 'send', address, recipientAddresses)
  await consumeAgentMailTrialSendQuota(context, address)
  await client.submitDraft(userId, mailbox.id, messageId)
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
  const action = typeof input.seen === 'boolean' && typeof input.flagged !== 'boolean' ? 'markRead' : 'manage'
  const { address, client, context, userId } = await resolveAuthorizedAccountFromHeaders(
    headers,
    input.accountId,
    action,
    action === 'markRead' ? 'read' : []
  )
  const mailboxes = normalizeListResults(await client.listMailboxes(userId))
  const mailbox = resolveMailboxById(mailboxes, input.mailboxId)
  const messageId = requirePositiveMessageId(input.messageId).toString()
  const updates = {
    ...(typeof input.flagged === 'boolean' ? { flagged: input.flagged } : {}),
    ...(typeof input.seen === 'boolean' ? { seen: input.seen } : {})
  }

  if (Object.keys(updates).length === 0) {
    throw new AgentMailWebmailError('No message update was requested', 400)
  }

  await requireAuthorizedWildDuckMessage(client, userId, mailbox.id, messageId, address, {
    ownership: ownershipOptionsForMailbox(mailboxes, mailbox.id)
  })
  await client.updateMessage(userId, mailbox.id, messageId, updates)
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
  const { address, client, context, userId } = await resolveAuthorizedAccountFromHeaders(
    headers,
    input.accountId,
    ['archive', 'manage'],
    []
  )
  const mailboxes = normalizeListResults(await client.listMailboxes(userId))
  const mailbox = resolveMailboxById(mailboxes, input.mailboxId)
  const targetMailbox = resolveMailboxById(mailboxes, input.targetMailboxId)
  requireMailboxAction(context, isArchiveMailbox(targetMailbox) ? 'archive' : 'manage', address)
  const messageId = requirePositiveMessageId(input.messageId).toString()
  await requireAuthorizedWildDuckMessage(client, userId, mailbox.id, messageId, address, {
    ownership: ownershipOptionsForMailbox(mailboxes, mailbox.id)
  })
  await client.updateMessage(userId, mailbox.id, messageId, {
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
  const { address, client, context, userId } = await resolveAuthorizedAccountFromHeaders(
    headers,
    input.accountId,
    'manage',
    []
  )
  const mailboxes = normalizeListResults(await client.listMailboxes(userId))
  const mailbox = resolveMailboxById(mailboxes, input.mailboxId)
  const messageId = requirePositiveMessageId(input.messageId).toString()
  await requireAuthorizedWildDuckMessage(client, userId, mailbox.id, messageId, address, {
    ownership: ownershipOptionsForMailbox(mailboxes, mailbox.id)
  })
  await client.deleteMessage(userId, mailbox.id, messageId)
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
  const { client, userId } = await resolveAuthorizedAccountFromHeaders(headers, accountId, 'manage', [])
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

export async function renameAgentMailFolderForWeb({
  accountId,
  headers,
  mailboxId,
  name
}: {
  accountId: string
  headers: Headers
  mailboxId: string
  name: string
}) {
  const { client, userId } = await resolveAuthorizedAccountFromHeaders(headers, accountId, 'manage', [])
  const folderName = normalizeFolderName(name)
  const mailboxes = normalizeListResults(await client.listMailboxes(userId))
  const mailbox = resolveMailboxById(mailboxes, mailboxId)
  if (isProtectedMailbox(mailbox.specialUse)) {
    throw new AgentMailWebmailError('System folders cannot be renamed', 400)
  }
  if (hasMailboxPathOrName(mailboxes, folderName, mailbox.id)) {
    throw new AgentMailWebmailError('Folder name already exists', 400)
  }

  await client.updateMailbox(userId, mailbox.id, { path: folderName })
  const refreshedMailboxes = normalizeListResults(await client.listMailboxes(userId))
  const updated =
    refreshedMailboxes.find((candidate) => candidate.id === mailbox.id) ??
    findMailboxByPath(refreshedMailboxes, folderName)
  if (!updated?.id) {
    throw new AgentMailWebmailError('WildDuck did not return the renamed folder', 502)
  }

  return { folder: toFolderView(updated), success: true }
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
  const { client, userId } = await resolveAuthorizedAccountFromHeaders(headers, accountId, 'manage', [])
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
  action: AgentMailAbilityAction | ReadonlyArray<AgentMailAbilityAction>,
  paperclipOperation?: AgentMailPaperclipOperation | ReadonlyArray<AgentMailPaperclipOperation>
) {
  const { address, context } = await resolveAuthorizedMailboxFromHeaders(headers, accountId, action)
  if (paperclipOperation !== undefined) {
    requireAgentMailPaperclipOperation(context, paperclipOperation)
  }
  const client = createWildDuckClient()
  const userId = await resolveWildDuckUserForAuthorizedAddress(client, address)

  return { address, client, context, userId }
}

async function resolveAuthorizedMailboxFromHeaders(
  headers: Headers,
  accountId: string,
  action: AgentMailAbilityAction | ReadonlyArray<AgentMailAbilityAction>
) {
  const { db } = await globals()
  const context = await requireAgentMailOrganizationContext(headers)
  const domains = await listAuthorizedMailDomains(db, context.organizationId)
  const address = requireAuthorizedMailboxAddress(accountId, domains, context, action)
  requireAnyMailboxAction(context, action, address)

  return { address, context, domains }
}

async function resolveAuthorizedDraftReplacement(
  client: ReturnType<typeof createWildDuckClient>,
  userId: string,
  accountId: string,
  mailboxes: ReadonlyArray<WildDuckMailbox>,
  input: Pick<AgentMailComposeInput, 'draftMailboxId' | 'draftMessageId'>
) {
  if (!input.draftMailboxId || !input.draftMessageId) {
    throw new AgentMailWebmailError('Draft replacement requires a mailbox and message id', 400)
  }
  const mailbox = requireDraftsMailbox(
    resolveMailboxById(mailboxes, requireRouteToken(input.draftMailboxId, 'draftMailboxId'))
  )
  const id = requirePositiveMessageId(requireRouteToken(input.draftMessageId, 'draftMessageId'))
  const previousDraft = await client.getMessage(userId, mailbox.id, id.toString())
  requireMessageBelongsToAccount(previousDraft, accountId, { includeSender: true })

  return {
    id,
    mailbox: mailbox.id
  }
}

async function requireAuthorizedWildDuckMessage(
  client: ReturnType<typeof createWildDuckClient>,
  userId: string,
  mailboxId: string,
  messageId: string,
  accountId: string,
  options: { ownership?: MessageOwnershipOptions } = {}
) {
  const message = await client.getMessage(userId, mailboxId, messageId)
  requireMessageBelongsToAccount(message, accountId, options.ownership)
  return message
}

type AgentMailOrganizationContext = Awaited<ReturnType<typeof requireAgentMailOrganizationContext>>

function requireWorkspacePaperclipOperation(
  context: AgentMailOrganizationContext,
  input: AgentMailWorkspaceInput
) {
  if (input.query?.trim()) {
    requireAgentMailPaperclipOperation(context, 'search')
    return
  }
  if (input.messageId) {
    requireAgentMailPaperclipOperation(context, ['read', 'reply'])
    return
  }
  requireAgentMailPaperclipOperation(context, ['status', 'search', 'read', 'reply', 'send'])
}

function filterAuthorizedAccounts(
  accounts: ReadonlyArray<AgentMailWebAccount>,
  context: AgentMailOrganizationContext,
  action: AgentMailAbilityAction
): AgentMailWebAccount[] {
  return accounts.filter((account) => canMailboxAction(context, action, account.id))
}

function requireMailboxAction(
  context: AgentMailOrganizationContext,
  action: AgentMailAbilityAction,
  mailboxAddress: string
) {
  if (!canMailboxAction(context, action, mailboxAddress)) {
    throw new AgentMailWebmailError('Mailbox operation is not authorized', 403)
  }
}

function requireAnyMailboxAction(
  context: AgentMailOrganizationContext,
  action: AgentMailAbilityAction | ReadonlyArray<AgentMailAbilityAction>,
  mailboxAddress: string
) {
  const actions = typeof action === 'string' ? [action] : action
  if (!actions.some((candidate) => canMailboxAction(context, candidate, mailboxAddress))) {
    throw new AgentMailWebmailError('Mailbox operation is not authorized', 403)
  }
}

function requireDraftAction(
  context: AgentMailOrganizationContext,
  action: AgentMailAbilityAction,
  mailboxAddress: string
) {
  if (
    !context.ability.can(
      action,
      agentMailSubject('Draft', {
        mailboxAddress,
        organizationId: context.organizationId
      })
    )
  ) {
    throw new AgentMailWebmailError('Draft operation is not authorized', 403)
  }
}

function requireMessageAction(
  context: AgentMailOrganizationContext,
  action: AgentMailAbilityAction,
  mailboxAddress: string,
  recipientAddresses: ReadonlyArray<string>
) {
  if (
    !context.ability.can(
      action,
      agentMailSubject('Message', {
        mailboxAddress,
        organizationId: context.organizationId,
        recipientAddresses
      })
    )
  ) {
    throw new AgentMailWebmailError('Message operation is not authorized', 403)
  }
}

function canMailboxAction(
  context: AgentMailOrganizationContext,
  action: AgentMailAbilityAction,
  mailboxAddress: string
) {
  return context.ability.can(
    action,
    agentMailSubject('Mailbox', {
      mailboxAddress,
      organizationId: context.organizationId
    })
  )
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
  domains: ReadonlyArray<string>,
  options: { includeDisabled?: boolean } = {}
) {
  const accountsByAddress = new Map<string, AgentMailWebAccount>()

  for (const domain of domains) {
    const users = normalizeListResults(await client.listUsers(domain))
    for (const user of users) {
      const disabled = Boolean(user.disabled || user.suspended)
      if (disabled && !options.includeDisabled) {
        continue
      }
      for (const address of addressesForUser(user)) {
        if (!mailboxBelongsToDomains(address, domains)) {
          continue
        }
        accountsByAddress.set(address, {
          address,
          description: `WildDuck mailbox for ${domainPart(address)}`,
          id: address,
          name: user.name?.trim() || localPart(address),
          state: disabled ? 'disabled' : 'ready'
        })
      }
    }
  }

  return [...accountsByAddress.values()].sort((left, right) => left.address.localeCompare(right.address))
}

async function listAuthorizedAccountsForContext(
  client: ReturnType<typeof createWildDuckClient>,
  domains: ReadonlyArray<string>,
  context: AgentMailOrganizationContext,
  action: AgentMailAbilityAction,
  options: { includeDisabled?: boolean } = {}
) {
  if (hasBroadMailboxListAccess(context, action)) {
    return filterAuthorizedAccounts(await listAuthorizedAccounts(client, domains, options), context, action)
  }

  return scopedMailboxAccounts(context, action)
}

function hasBroadMailboxListAccess(context: AgentMailOrganizationContext, action: AgentMailAbilityAction) {
  return context.ability.can(
    action,
    agentMailSubject('Mailbox', {
      organizationId: context.organizationId
    })
  )
}

function scopedMailboxAccounts(context: AgentMailOrganizationContext, action: AgentMailAbilityAction) {
  return scopedMailboxAddresses(context, action)
    .filter((address) => canMailboxAction(context, action, address))
    .map((address) => ({
      address,
      description: `WildDuck mailbox for ${domainPart(address)}`,
      id: address,
      name: localPart(address),
      state: 'ready' as const
    }))
    .sort((left, right) => left.address.localeCompare(right.address))
}

function scopedMailboxAddresses(context: AgentMailOrganizationContext, action: AgentMailAbilityAction) {
  const addresses = new Set<string>()

  for (const grant of context.mailboxGrants) {
    if (String(grant.organizationId) === String(context.organizationId)) {
      addNormalizedMailbox(addresses, grant.mailboxAddress)
    }
  }

  for (const grant of context.capabilityGrants) {
    const capability = AgentMailCapability.safeParse(grant.capability)
    if (!capability.success || AgentMailAbilityActionByCapability[capability.data] !== action) {
      continue
    }
    const constraints = AgentMailMailboxCapabilityGrantConstraints.safeParse(
      agentMailCapabilityGrantConstraints(grant.constraints)
    )
    if (constraints.success && constraints.data.organizationId === String(context.organizationId)) {
      addNormalizedMailbox(addresses, constraints.data.mailboxAddress)
    }
  }

  return [...addresses]
}

async function resolveWildDuckUserForAuthorizedAddress(
  client: ReturnType<typeof createWildDuckClient>,
  accountId: string
) {
  const address = normalizeMailboxAddress(accountId)
  if (!address) {
    throw new AgentMailWebmailError('Mailbox account is not available', 403)
  }
  const resolution = await client.resolveAddress(address)
  const userId = resolution.user || resolution.id
  if (!userId) {
    throw new AgentMailWebmailError('Mailbox account was not found', 404)
  }
  const user = await client.getUser(userId)
  if (user.disabled || user.suspended) {
    throw new AgentMailWebmailError('Mailbox account is disabled', 403)
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
  mailboxes,
  mailboxId,
  messageId,
  routePrefix,
  userId
}: {
  accountId: string
  client: ReturnType<typeof createWildDuckClient>
  mailboxes: ReadonlyArray<WildDuckMailbox>
  mailboxId: string
  messageId: string
  routePrefix: string
  userId: string
}): Promise<AgentMailWebMessageDetail> {
  const selectedMessage = toMessageDetail(
    await requireAuthorizedWildDuckMessage(client, userId, mailboxId, messageId, accountId, {
      ownership: ownershipOptionsForMailbox(mailboxes, mailboxId)
    }),
    accountId,
    mailboxId,
    routePrefix
  )
  if (!selectedMessage.threadId) {
    return selectedMessage
  }

  const threadMessages = await listThreadMessageDetails({
    accountId,
    client,
    fallbackMailboxId: mailboxId,
    mailboxes,
    routePrefix,
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
  mailboxes,
  routePrefix,
  threadId,
  userId
}: {
  accountId: string
  client: ReturnType<typeof createWildDuckClient>
  fallbackMailboxId: string
  mailboxes: ReadonlyArray<WildDuckMailbox>
  routePrefix: string
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
    .filter((message) =>
      messageBelongsToAccount(
        message,
        accountId,
        conversationOwnershipOptionsForMailbox(mailboxes, stringValue(message.mailbox) || fallbackMailboxId)
      )
    )
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
        .then((detail) =>
          messageBelongsToAccount(
            detail,
            accountId,
            conversationOwnershipOptionsForMailbox(mailboxes, message.mailboxId)
          )
            ? toMessageDetail(detail, accountId, message.mailboxId, routePrefix)
            : null
        )
    )
  ).then((messages) => messages.filter((message): message is AgentMailWebThreadMessage => message !== null))
}

interface MessageOwnershipOptions {
  includeSender?: boolean
}

function requireMessageBelongsToAccount(
  message: WildDuckMessage,
  accountId: string,
  options: MessageOwnershipOptions = {}
) {
  if (!messageBelongsToAccount(message, accountId, options)) {
    throw new AgentMailWebmailError('Message is not available for this mailbox account', 403)
  }
}

function messageBelongsToAccount(
  message: WildDuckMessage,
  accountId: string,
  options: MessageOwnershipOptions = {}
) {
  const accountAddress = normalizeMailboxAddress(accountId)
  return Boolean(accountAddress && messageEnvelopeAddresses(message, options).has(accountAddress))
}

function messageEnvelopeAddresses(message: WildDuckMessage, options: MessageOwnershipOptions) {
  const addresses = new Set<string>()
  if (options.includeSender) {
    addMessageAddressValues(addresses, message.from)
  }
  addMessageAddressValues(addresses, message.to)
  addMessageAddressValues(addresses, message.cc)
  addMessageAddressValues(addresses, message.bcc)
  return addresses
}

function ownershipOptionsForMailbox(
  mailboxes: ReadonlyArray<WildDuckMailbox>,
  mailboxId: string
): MessageOwnershipOptions {
  const mailbox = mailboxes.find((candidate) => candidate.id === mailboxId)
  return { includeSender: mailbox ? isOutboundMailbox(mailbox) : false }
}

function conversationOwnershipOptionsForMailbox(
  mailboxes: ReadonlyArray<WildDuckMailbox>,
  mailboxId: string
): MessageOwnershipOptions {
  return {
    ...ownershipOptionsForMailbox(mailboxes, mailboxId),
    includeSender: true
  }
}

function addMessageAddressValues(
  addresses: Set<string>,
  value: ReadonlyArray<WildDuckMessageAddress> | WildDuckMessageAddress | string | undefined
) {
  if (!value) {
    return
  }
  if (typeof value === 'string') {
    for (const parsed of addressparser(value)) {
      addParsedAddress(addresses, parsed)
    }
    addNormalizedMailbox(addresses, value)
    return
  }
  if (isMessageAddressArray(value)) {
    for (const item of value) {
      addNormalizedMailbox(addresses, item.address)
    }
    return
  }
  addNormalizedMailbox(addresses, value.address)
}

function addParsedAddress(addresses: Set<string>, parsed: addressparser.AddressOrGroup) {
  if ('address' in parsed) {
    addNormalizedMailbox(addresses, parsed.address)
    return
  }
  for (const item of parsed.group) {
    addParsedAddress(addresses, item)
  }
}

function toMessageDetail(
  message: WildDuckMessage,
  accountId: string,
  fallbackMailboxId: string,
  routePrefix: string
): AgentMailWebThreadMessage {
  const summary = toMessageSummary(message, fallbackMailboxId)
  const mailboxId = summary.mailboxId
  return {
    ...summary,
    attachments: messageAttachments(message)
      .map((attachment) => toAttachmentView(attachment, accountId, mailboxId, summary.id, routePrefix))
      .filter((attachment): attachment is AgentMailWebAttachment => attachment !== null),
    cc: addressList(message.cc),
    html: htmlBody(message),
    messageId: stringValue(message.messageId) || undefined,
    plainText: stringValue(message.text) || stripHTML(htmlBody(message)),
    replyTo: addressList(message.replyTo),
    sourceUrl: mailRoutePath(routePrefix, 'accounts', accountId, 'mailboxes', mailboxId, 'messages', summary.id, 'source'),
    to: addressList(message.to)
  }
}

function toAttachmentView(
  attachment: WildDuckMessageAttachment,
  accountId: string,
  mailboxId: string,
  messageId: string,
  routePrefix: string
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
      routePrefix,
      'accounts',
      accountId,
      'mailboxes',
      mailboxId,
      'messages',
      messageId,
      'attachments',
      id
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

function requireDraftsMailbox(mailbox: WildDuckMailbox & { id: string }) {
  if (!isDraftsMailbox(mailbox)) {
    throw new AgentMailWebmailError('Draft operations require the Drafts folder', 400)
  }
  return mailbox
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

function hasMailboxPathOrName(
  mailboxes: ReadonlyArray<WildDuckMailbox>,
  path: string,
  exceptMailboxId: string
) {
  const normalizedPath = path.toLowerCase()
  return mailboxes.some(
    (mailbox) =>
      mailbox.id !== exceptMailboxId &&
      (mailbox.path?.trim().toLowerCase() === normalizedPath ||
        mailbox.name?.trim().toLowerCase() === normalizedPath)
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
  const replyTo = normalizeAddressList(input.replyTo, 'replyTo')
  const text = input.body.replace(/\r?\n/gu, '\r\n').trim()
  const html = input.html?.trim()

  if (replyTo.length > 1) {
    throw new AgentMailWebmailError('replyTo must include one email address', 400)
  }
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
    ...(replyTo[0] ? { replyTo: replyTo[0] } : {}),
    subject: normalizeHeaderText(input.subject),
    ...(text ? { text } : {}),
    ...(to.length ? { to } : {})
  }
}

function composeRecipientAddresses(payload: ReturnType<typeof normalizeComposePayload>): string[] {
  return [...(payload.to ?? []), ...(payload.cc ?? []), ...(payload.bcc ?? [])]
    .map((address) => address.address.trim().toLowerCase())
    .filter(Boolean)
}

function messageRecipientAddresses(message: WildDuckMessage): string[] {
  const recipients = new Set<string>()
  addMessageRecipientAddresses(recipients, message.to)
  addMessageRecipientAddresses(recipients, message.cc)
  addMessageRecipientAddresses(recipients, message.bcc)
  return [...recipients].sort()
}

function addMessageRecipientAddresses(
  recipients: Set<string>,
  value: ReadonlyArray<WildDuckMessageAddress> | WildDuckMessageAddress | string | undefined
) {
  if (typeof value === 'string') {
    for (const address of addressparser(value, { flatten: true })) {
      addNormalizedMailbox(recipients, address.address)
    }
    return
  }
  if (isMessageAddressArray(value)) {
    for (const address of value) {
      addNormalizedMailbox(recipients, address.address)
    }
    return
  }
  addNormalizedMailbox(recipients, value?.address)
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
  const header = headers.get('content-type')
  if (!header) {
    return 'application/octet-stream'
  }
  try {
    const mediaType = parseContentType(header).type
    return SAFE_INLINE_ATTACHMENT_TYPES.has(mediaType) ? mediaType : 'application/octet-stream'
  } catch {
    return 'application/octet-stream'
  }
}

function requireAuthorizedMailboxAddress(
  value: string,
  domains: ReadonlyArray<string>,
  context: AgentMailOrganizationContext,
  action: AgentMailAbilityAction | ReadonlyArray<AgentMailAbilityAction>
) {
  const address = normalizeMailboxAddress(value)
  if (
    !address ||
    (!mailboxBelongsToDomains(address, domains) &&
      !hasExactScopedMailboxAuthorization(context, action, address))
  ) {
    throw new AgentMailWebmailError('Mailbox account is not available', 403)
  }
  return address
}

function hasExactScopedMailboxAuthorization(
  context: AgentMailOrganizationContext,
  action: AgentMailAbilityAction | ReadonlyArray<AgentMailAbilityAction>,
  mailboxAddress: string
) {
  const actions = typeof action === 'string' ? [action] : action
  return actions.some((candidate) => {
    const scopedAddresses = scopedMailboxAddresses(context, candidate)
    return scopedAddresses.includes(mailboxAddress) && canMailboxAction(context, candidate, mailboxAddress)
  })
}

function normalizeMailboxAddress(value: string | undefined) {
  return normalizeMailboxIdentifier(value)
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
  const normalized = normalizeMailDomain(value)
  if (normalized?.includes('.')) {
    target.add(normalized)
  }
}

function mailboxBelongsToDomains(address: string, domains: ReadonlyArray<string>) {
  const domain = domainPart(address)
  return domains.includes(domain)
}

function domainPart(address: string) {
  return mailboxDomain(address)
}

function localPart(address: string) {
  return mailboxLocalPart(address) || address
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

function isDraftsMailbox(mailbox: WildDuckMailbox) {
  return (
    mailbox.specialUse?.toLowerCase() === '\\drafts' ||
    mailbox.path?.trim().toLowerCase() === 'drafts' ||
    mailbox.name?.trim().toLowerCase() === 'drafts'
  )
}

function isOutboundMailbox(mailbox: WildDuckMailbox) {
  const specialUse = mailbox.specialUse?.toLowerCase()
  const path = mailbox.path?.trim().toLowerCase()
  const name = mailbox.name?.trim().toLowerCase()
  return (
    specialUse === '\\drafts' ||
    specialUse === '\\sent' ||
    path === 'drafts' ||
    path === 'sent' ||
    name === 'drafts' ||
    name === 'sent'
  )
}

function isProtectedMailbox(specialUse: string | null | undefined) {
  return Boolean(
    specialUse && ['\\drafts', '\\inbox', '\\junk', '\\sent', '\\trash'].includes(specialUse.toLowerCase())
  )
}

function isArchiveMailbox(mailbox: WildDuckMailbox) {
  return mailbox.specialUse?.toLowerCase() === '\\archive'
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

function addressList(
  value: ReadonlyArray<WildDuckMessageAddress> | WildDuckMessageAddress | string | undefined
) {
  if (typeof value === 'string') {
    return [value]
  }
  if (isMessageAddressArray(value)) {
    return value.map(addressDisplay).filter(Boolean)
  }
  if (!value) {
    return []
  }
  const rendered = addressDisplay(value)
  return rendered ? [rendered] : []
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

function mailRoutePrefix(headers: Headers) {
  const prefix = headers.get(AGENT_MAIL_ROUTE_PREFIX_HEADER)?.trim()
  if (prefix === '/api/mail' || prefix === '/rpc/mail') {
    return prefix
  }
  return '/rpc/mail'
}

function mailRoutePath(routePrefix: string, ...segments: string[]) {
  const pathURL = new URL('https://agent-mail.invalid/')
  pathURL.pathname = [
    ...routePrefix.split('/').filter(Boolean),
    ...segments
  ]
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return pathURL.pathname
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
