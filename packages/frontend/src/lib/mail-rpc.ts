import { rpc } from './rpc-api-client'
import type {
  AgentMailComposeInput,
  AgentMailMessageActionInput,
  AgentMailWebFolder,
  AgentMailWebWorkspace
} from '@main/backend'

export class MailRPCError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message)
    this.name = 'MailRPCError'
  }
}

export interface MailWorkspaceQuery {
  accountId?: string
  cursor?: string | null
  direction?: 'next' | 'previous'
  folderId?: string
  limit?: number
  messageId?: string
  query?: string
  unreadOnly?: boolean
}

export type MailDraftInput = AgentMailComposeInput & {
  draftMailboxId?: string
  draftMessageId?: string
}

export interface MailMoveInput extends AgentMailMessageActionInput {
  targetMailboxId: string
}

export interface MailUpdateInput extends AgentMailMessageActionInput {
  flagged?: boolean
  seen?: boolean
}

export async function fetchMailWorkspace(input: MailWorkspaceQuery): Promise<AgentMailWebWorkspace> {
  const result = await rpc.mail.workspace.get({ query: mailWorkspaceQuery(input) })
  return readMailRpcResult<AgentMailWebWorkspace>(result)
}

export function sendMailMessage(input: AgentMailComposeInput) {
  return rpc.mail
    .accounts({ accountId: input.accountId })
    .messages.post(composeRequestBody(input))
    .then((result) => readMailRpcResult<{ success: boolean }>(result))
}

export function saveMailDraft(input: MailDraftInput) {
  return rpc.mail
    .accounts({ accountId: input.accountId })
    .drafts.post(composeRequestBody(input))
    .then((result) =>
      readMailRpcResult<{
        draftId: string
        mailboxId: string
        previousDeleted: boolean
        success: boolean
      }>(result)
    )
}

export function sendMailDraft(input: AgentMailMessageActionInput) {
  const route = messageRpc(input)
  return route['send-draft'].post().then((result) => readMailRpcResult<{ success: boolean }>(result))
}

export function updateMailMessage(input: MailUpdateInput) {
  return messageRpc(input)
    .patch({
      flagged: input.flagged,
      seen: input.seen
    })
    .then((result) => readMailRpcResult<{ success: boolean }>(result))
}

export function moveMailMessage(input: MailMoveInput) {
  return messageRpc(input)
    .move.post({
      targetMailboxId: input.targetMailboxId
    })
    .then((result) => readMailRpcResult<{ success: boolean }>(result))
}

export function deleteMailMessage(input: AgentMailMessageActionInput) {
  return messageRpc(input)
    .delete()
    .then((result) => readMailRpcResult<{ success: boolean }>(result))
}

export function fetchMailOriginalSource(input: AgentMailMessageActionInput) {
  const route = messageRpc(input)
  return route['source-preview'].get().then((result) => readMailRpcResult<string>(result))
}

export function createMailFolder({ accountId, name }: { accountId: string; name: string }) {
  return rpc.mail
    .accounts({ accountId })
    .mailboxes.post({ name })
    .then((result) => readMailRpcResult<{ folder: AgentMailWebFolder; success: boolean }>(result))
}

export function renameMailFolder({
  accountId,
  mailboxId,
  name
}: {
  accountId: string
  mailboxId: string
  name: string
}) {
  return rpc.mail
    .accounts({ accountId })
    .mailboxes({ mailboxId })
    .patch({ name })
    .then((result) => readMailRpcResult<{ folder: AgentMailWebFolder; success: boolean }>(result))
}

export function deleteMailFolder({ accountId, mailboxId }: { accountId: string; mailboxId: string }) {
  return rpc.mail
    .accounts({ accountId })
    .mailboxes({ mailboxId })
    .delete()
    .then((result) => readMailRpcResult<{ success: boolean }>(result))
}

function mailWorkspaceQuery(input: MailWorkspaceQuery) {
  return {
    accountId: input.accountId,
    cursor: input.cursor ?? undefined,
    direction: input.direction,
    folderId: input.folderId,
    limit: input.limit,
    messageId: input.messageId,
    query: input.query,
    unreadOnly: input.unreadOnly
  }
}

function readMailRpcResult<TResult>(
  result:
    | {
        data: TResult
        error: null
        status: number
      }
    | {
        data: null
        error: unknown
        status: number
      }
): TResult {
  if (result.error) {
    throw new MailRPCError(
      readRpcErrorMessage(result.error) ?? `Mail request failed with HTTP ${result.status}`,
      result.status
    )
  }

  if (result.data === null) {
    throw new MailRPCError(`Mail request failed with HTTP ${result.status}`, result.status)
  }

  return result.data
}

function composeRequestBody(input: MailDraftInput | AgentMailComposeInput) {
  return {
    bcc: input.bcc,
    body: input.body,
    cc: input.cc,
    draftMailboxId: 'draftMailboxId' in input ? input.draftMailboxId : undefined,
    draftMessageId: 'draftMessageId' in input ? input.draftMessageId : undefined,
    html: input.html,
    reference: input.reference,
    replyTo: input.replyTo,
    subject: input.subject,
    to: input.to
  }
}

function messageRpc(input: AgentMailMessageActionInput) {
  return rpc.mail
    .accounts({ accountId: input.accountId })
    .mailboxes({ mailboxId: input.mailboxId })
    .messages({
      messageId: input.messageId
    })
}

function readRpcErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return null
  }

  if ('value' in error) {
    const valueMessage = readRpcErrorValueMessage(error.value)
    if (valueMessage) {
      return valueMessage
    }
  }

  return readRpcErrorValueMessage(error)
}

function readRpcErrorValueMessage(value: unknown): string | null {
  if (value instanceof Error && value.message.trim()) {
    return value.message
  }

  if (!value || typeof value !== 'object') {
    return null
  }

  const maybeMessage = 'message' in value ? value.message : null
  if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
    return maybeMessage
  }

  const maybeError = 'error' in value ? value.error : null
  if (typeof maybeError === 'string' && maybeError.trim()) {
    return maybeError
  }

  return null
}
