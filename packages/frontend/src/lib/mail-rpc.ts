import type { AgentMailComposeInput, AgentMailMessageActionInput, AgentMailWebWorkspace } from '@main/backend'

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

export interface MailDraftInput extends AgentMailComposeInput {
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
  const search = new URLSearchParams()
  setSearchParam(search, 'accountId', input.accountId)
  setSearchParam(search, 'cursor', input.cursor ?? undefined)
  setSearchParam(search, 'direction', input.direction)
  setSearchParam(search, 'folderId', input.folderId)
  setSearchParam(search, 'limit', input.limit === undefined ? undefined : String(input.limit))
  setSearchParam(search, 'messageId', input.messageId)
  setSearchParam(search, 'query', input.query)
  setSearchParam(search, 'unreadOnly', input.unreadOnly ? 'true' : undefined)

  return requestMailJSON<AgentMailWebWorkspace>(`/rpc/mail/workspace?${search}`)
}

export function sendMailMessage(input: AgentMailComposeInput) {
  return requestMailJSON<{ success: boolean }>(
    `/rpc/mail/accounts/${encodeURIComponent(input.accountId)}/messages`,
    {
      body: JSON.stringify(composeRequestBody(input)),
      method: 'POST'
    }
  )
}

export function saveMailDraft(input: MailDraftInput) {
  return requestMailJSON<{
    draftId: string
    mailboxId: string
    previousDeleted: boolean
    success: boolean
  }>(`/rpc/mail/accounts/${encodeURIComponent(input.accountId)}/drafts`, {
    body: JSON.stringify(composeRequestBody(input)),
    method: 'POST'
  })
}

export function sendMailDraft(input: AgentMailMessageActionInput) {
  return requestMailJSON<{ success: boolean }>(messageActionPath(input, 'send-draft'), {
    method: 'POST'
  })
}

export function updateMailMessage(input: MailUpdateInput) {
  return requestMailJSON<{ success: boolean }>(messageActionPath(input), {
    body: JSON.stringify({
      flagged: input.flagged,
      seen: input.seen
    }),
    method: 'PATCH'
  })
}

export function moveMailMessage(input: MailMoveInput) {
  return requestMailJSON<{ success: boolean }>(messageActionPath(input, 'move'), {
    body: JSON.stringify({
      targetMailboxId: input.targetMailboxId
    }),
    method: 'POST'
  })
}

export function deleteMailMessage(input: AgentMailMessageActionInput) {
  return requestMailJSON<{ success: boolean }>(messageActionPath(input), {
    method: 'DELETE'
  })
}

export function createMailFolder({ accountId, name }: { accountId: string; name: string }) {
  return requestMailJSON<{ success: boolean }>(
    `/rpc/mail/accounts/${encodeURIComponent(accountId)}/mailboxes`,
    {
      body: JSON.stringify({ name }),
      method: 'POST'
    }
  )
}

export function deleteMailFolder({ accountId, mailboxId }: { accountId: string; mailboxId: string }) {
  return requestMailJSON<{ success: boolean }>(
    `/rpc/mail/accounts/${encodeURIComponent(accountId)}/mailboxes/${encodeURIComponent(mailboxId)}`,
    {
      method: 'DELETE'
    }
  )
}

async function requestMailJSON<TResult>(url: string, init: RequestInit = {}): Promise<TResult> {
  const headers = new Headers(init.headers)
  headers.set('accept', 'application/json')
  if (init.body !== undefined) {
    headers.set('content-type', 'application/json')
  }

  const response = await fetch(url, {
    ...init,
    headers
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    throw new MailRPCError(body?.error ?? `Mail request failed with HTTP ${response.status}`, response.status)
  }

  return (await response.json()) as TResult
}

function setSearchParam(search: URLSearchParams, key: string, value: string | undefined) {
  if (value !== undefined && value !== '') {
    search.set(key, value)
  }
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
    subject: input.subject,
    to: input.to
  }
}

function messageActionPath(input: AgentMailMessageActionInput, action?: string) {
  const basePath = `/rpc/mail/accounts/${encodeURIComponent(input.accountId)}/mailboxes/${encodeURIComponent(input.mailboxId)}/messages/${encodeURIComponent(input.messageId)}`
  return action ? `${basePath}/${action}` : basePath
}
