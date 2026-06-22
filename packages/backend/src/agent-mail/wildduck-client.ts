import { PRIVATE_VARS } from '../vars.private'

interface WildDuckErrorEnvelope {
  code?: string
  error?: string
}

export interface WildDuckUserAddress {
  address?: string
}

export interface WildDuckUser {
  address?: string
  addresses?: ReadonlyArray<string | WildDuckUserAddress>
  id?: string
  name?: string
  username?: string
}

export interface WildDuckAddressResolution {
  address?: string
  id?: string
  targets?: string[]
  user?: string
}

export interface WildDuckMailbox {
  id?: string
  name?: string
  path?: string
  specialUse?: string
  modifyIndex?: number
  total?: number
  unseen?: number
}

export interface WildDuckMessageAddress {
  address?: string
  name?: string
}

export interface WildDuckAddressInput {
  address: string
  name?: string
}

export interface WildDuckMessageAttachment {
  cid?: string
  contentId?: string
  contentID?: string
  contentType?: string
  disposition?: string
  filename?: string
  id?: string
  size?: number
}

export interface WildDuckMessage {
  attachments?: boolean | ReadonlyArray<WildDuckMessageAttachment>
  attachmentsList?: ReadonlyArray<WildDuckMessageAttachment>
  bcc?: ReadonlyArray<WildDuckMessageAddress> | string
  cc?: ReadonlyArray<WildDuckMessageAddress> | string
  date?: string
  draft?: boolean
  flagged?: boolean
  flags?: string[]
  from?: ReadonlyArray<WildDuckMessageAddress> | WildDuckMessageAddress | string
  html?: string | string[]
  id?: number | string
  inReplyTo?: string
  intro?: string
  mailbox?: string
  messageId?: string
  references?: string[]
  seen?: boolean
  subject?: string
  text?: string
  thread?: string
  to?: ReadonlyArray<WildDuckMessageAddress> | string
}

export interface WildDuckListResponse<TResult> {
  next?: string | false | null
  nextCursor?: string | false | null
  previous?: string | false | null
  previousCursor?: string | false | null
  results: TResult[]
  total?: number
}

export interface WildDuckListMessagesOptions {
  limit?: number
  next?: string | null
  previous?: string | null
  unseen?: boolean
}

interface WildDuckMessageContentInput {
  bcc?: ReadonlyArray<WildDuckAddressInput>
  cc?: ReadonlyArray<WildDuckAddressInput>
  from?: WildDuckAddressInput
  html?: string
  reference?: Record<string, unknown>
  replyTo?: WildDuckAddressInput
  subject?: string
  text?: string
}

export interface WildDuckSubmitMessageInput extends WildDuckMessageContentInput {
  to?: ReadonlyArray<WildDuckAddressInput>
}

export interface WildDuckUploadMessageInput extends WildDuckMessageContentInput {
  draft?: boolean
  replacePrevious?: {
    id: number
    mailbox: string
  }
  to?: ReadonlyArray<WildDuckAddressInput>
}

export interface WildDuckUpdateMessageInput {
  deleted?: boolean
  draft?: boolean
  flagged?: boolean
  moveTo?: string
  seen?: boolean
}

export class WildDuckAPIError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message)
    this.name = 'WildDuckAPIError'
  }
}

export class WildDuckClient {
  constructor(
    private readonly baseURL: URL,
    private readonly accessToken: string,
    private readonly fetchImplementation: typeof fetch = fetch
  ) {}

  listUsers(query: string): Promise<WildDuckListResponse<WildDuckUser>> {
    return this.requestJSON('GET', '/users', {
      searchParams: {
        limit: '250',
        query
      }
    })
  }

  resolveAddress(address: string): Promise<WildDuckAddressResolution> {
    return this.requestJSON('GET', `/addresses/resolve/${encodeURIComponent(address)}`)
  }

  listMailboxes(userId: string): Promise<WildDuckListResponse<WildDuckMailbox>> {
    return this.requestJSON('GET', `/users/${encodeURIComponent(userId)}/mailboxes`, {
      searchParams: {
        counters: 'true',
        showHidden: 'true'
      }
    })
  }

  listMessages(
    userId: string,
    mailboxId: string,
    options: WildDuckListMessagesOptions = {}
  ): Promise<WildDuckListResponse<WildDuckMessage>> {
    return this.requestJSON(
      'GET',
      `/users/${encodeURIComponent(userId)}/mailboxes/${encodeURIComponent(mailboxId)}/messages`,
      {
        searchParams: {
          limit: String(options.limit ?? 25),
          next: options.next ?? undefined,
          order: 'desc',
          previous: options.previous ?? undefined,
          unseen: options.unseen ? 'true' : undefined
        }
      }
    )
  }

  searchMessages(
    userId: string,
    query: string,
    options: Pick<WildDuckListMessagesOptions, 'limit' | 'next' | 'previous'> = {}
  ): Promise<WildDuckListResponse<WildDuckMessage>> {
    return this.requestJSON('GET', `/users/${encodeURIComponent(userId)}/search`, {
      searchParams: {
        limit: String(options.limit ?? 25),
        next: options.next ?? undefined,
        order: 'desc',
        previous: options.previous ?? undefined,
        query
      }
    })
  }

  getMessage(
    userId: string,
    mailboxId: string,
    messageId: string,
    markAsSeen = false
  ): Promise<WildDuckMessage> {
    return this.requestJSON(
      'GET',
      `/users/${encodeURIComponent(userId)}/mailboxes/${encodeURIComponent(mailboxId)}/messages/${encodeURIComponent(messageId)}`,
      {
        searchParams: {
          markAsSeen: markAsSeen ? 'true' : undefined
        }
      }
    )
  }

  updateMessage(
    userId: string,
    mailboxId: string,
    messageId: string,
    input: WildDuckUpdateMessageInput
  ): Promise<WildDuckMessage> {
    return this.requestJSON(
      'PUT',
      `/users/${encodeURIComponent(userId)}/mailboxes/${encodeURIComponent(mailboxId)}/messages/${encodeURIComponent(messageId)}`,
      {
        body: input
      }
    )
  }

  deleteMessage(userId: string, mailboxId: string, messageId: string): Promise<Record<string, unknown>> {
    return this.requestJSON(
      'DELETE',
      `/users/${encodeURIComponent(userId)}/mailboxes/${encodeURIComponent(mailboxId)}/messages/${encodeURIComponent(messageId)}`
    )
  }

  submitMessage(userId: string, input: WildDuckSubmitMessageInput): Promise<Record<string, unknown>> {
    return this.requestJSON('POST', `/users/${encodeURIComponent(userId)}/submit`, {
      body: toWildDuckSubmitPayload(input)
    })
  }

  uploadMessage(
    userId: string,
    mailboxId: string,
    input: WildDuckUploadMessageInput
  ): Promise<{
    message?: {
      id?: number | string
      mailbox?: string
      size?: number
    }
    previousDeleted?: boolean
    success?: boolean
  }> {
    return this.requestJSON(
      'POST',
      `/users/${encodeURIComponent(userId)}/mailboxes/${encodeURIComponent(mailboxId)}/messages`,
      {
        body: toWildDuckUploadPayload(input)
      }
    )
  }

  submitDraft(userId: string, mailboxId: string, messageId: string): Promise<Record<string, unknown>> {
    return this.requestJSON(
      'POST',
      `/users/${encodeURIComponent(userId)}/mailboxes/${encodeURIComponent(mailboxId)}/messages/${encodeURIComponent(messageId)}/submit`
    )
  }

  createMailbox(
    userId: string,
    path: string
  ): Promise<{
    id?: string
    mailbox?: string
    path?: string
    success?: boolean
  }> {
    return this.requestJSON('POST', `/users/${encodeURIComponent(userId)}/mailboxes`, {
      body: { path }
    })
  }

  deleteMailbox(userId: string, mailboxId: string): Promise<Record<string, unknown>> {
    return this.requestJSON(
      'DELETE',
      `/users/${encodeURIComponent(userId)}/mailboxes/${encodeURIComponent(mailboxId)}`
    )
  }

  fetchAttachment(
    userId: string,
    mailboxId: string,
    messageId: string,
    attachmentId: string
  ): Promise<Response> {
    return this.requestResponse(
      'GET',
      `/users/${encodeURIComponent(userId)}/mailboxes/${encodeURIComponent(mailboxId)}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`
    )
  }

  fetchMessageSource(userId: string, mailboxId: string, messageId: string): Promise<Response> {
    return this.requestResponse(
      'GET',
      `/users/${encodeURIComponent(userId)}/mailboxes/${encodeURIComponent(mailboxId)}/messages/${encodeURIComponent(messageId)}/message.eml`,
      {
        accept: 'message/rfc822'
      }
    )
  }

  private async requestJSON<TResult>(
    method: string,
    path: string,
    options: {
      body?: unknown
      searchParams?: Record<string, string | undefined>
    } = {}
  ): Promise<TResult> {
    const response = await this.requestResponse(method, path, {
      accept: 'application/json',
      body: options.body,
      searchParams: options.searchParams
    })

    return (await response.json().catch(() => ({}))) as TResult
  }

  private async requestResponse(
    method: string,
    path: string,
    options: {
      accept?: string
      body?: unknown
      searchParams?: Record<string, string | undefined>
    } = {}
  ): Promise<Response> {
    const url = new URL(path, this.baseURL)
    for (const [key, value] of Object.entries(options.searchParams ?? {})) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, value)
      }
    }

    const response = await this.fetchImplementation(url, {
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      headers: {
        accept: options.accept ?? '*/*',
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        'x-access-token': this.accessToken
      },
      method
    })

    if (!response.ok) {
      throw await wildDuckError(response)
    }

    return response
  }
}

export function createWildDuckClient(fetchImplementation?: typeof fetch): WildDuckClient {
  const baseURL = PRIVATE_VARS.AGENT_MAIL_WILDDUCK_API_BASE_URL
  const accessToken = PRIVATE_VARS.AGENT_MAIL_WILDDUCK_ADMIN_ACCESS_TOKEN

  if (!baseURL) {
    throw new Error('Agent Mail WildDuck API base URL is not configured')
  }
  if (!accessToken) {
    throw new Error('Agent Mail WildDuck admin access token is not configured')
  }

  return new WildDuckClient(new URL(baseURL), accessToken, fetchImplementation)
}

function toWildDuckSubmitPayload(
  input: WildDuckMessageContentInput & { to?: ReadonlyArray<WildDuckAddressInput> }
) {
  return {
    ...(input.bcc?.length ? { bcc: input.bcc } : {}),
    ...(input.cc?.length ? { cc: input.cc } : {}),
    ...(input.from ? { from: input.from } : {}),
    ...(input.html ? { html: input.html } : {}),
    ...(input.reference ? { reference: input.reference } : {}),
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    ...(input.subject !== undefined ? { subject: input.subject } : {}),
    ...(input.text ? { text: input.text } : {}),
    to: input.to
  }
}

function toWildDuckUploadPayload(input: WildDuckUploadMessageInput) {
  return {
    ...toWildDuckSubmitPayload(input),
    ...(input.draft !== undefined ? { draft: input.draft } : {}),
    ...(input.replacePrevious ? { replacePrevious: input.replacePrevious } : {})
  }
}

async function wildDuckError(response: Response) {
  const envelope = (await response.json().catch(() => null)) as WildDuckErrorEnvelope | null
  const message = sanitizeWildDuckError(envelope?.error) || response.statusText || 'WildDuck request failed'
  return new WildDuckAPIError(message, response.status, sanitizeWildDuckError(envelope?.code) || undefined)
}

function sanitizeWildDuckError(value: string | undefined) {
  return value?.replace(/\s+/gu, ' ').trim().slice(0, 240) ?? ''
}
