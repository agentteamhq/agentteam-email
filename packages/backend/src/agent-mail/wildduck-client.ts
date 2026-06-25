import { z } from 'zod'

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
  disabled?: boolean
  id?: string
  name?: string
  suspended?: boolean
  username?: string
}

export interface WildDuckAddressResolution {
  address?: string
  id?: string
  targets?: string[]
  user?: string
}

export interface WildDuckForwardedAddressInput {
  address?: string
  forwardedDisabled?: boolean
  name?: string
  targets?: string[]
}

export interface WildDuckCreateUserInput {
  address: string
  allowUnsafe?: boolean
  name?: string
  password: string
  spamLevel?: number
  username: string
}

export interface WildDuckUpdateUserInput {
  disabled?: boolean
  name?: string
}

export interface WildDuckSuccessResponse {
  id?: string
  success?: boolean
}

export interface WildDuckDeleteUserResponse extends WildDuckSuccessResponse {
  addresses?: {
    deleted?: number
  }
  code?: string
  deleteAfter?: string
  task?: string
  user?: string
}

export interface WildDuckMailbox {
  id?: string
  name?: string
  path?: string
  specialUse?: string | null
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
  cid?: string | null
  contentId?: string | null
  contentID?: string | null
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
  replyTo?: ReadonlyArray<WildDuckMessageAddress> | WildDuckMessageAddress | string
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

export interface WildDuckUpdateMessageResponse {
  id?: number | string | number[][]
  success?: boolean
}

export interface WildDuckUpdateMailboxInput {
  hidden?: boolean
  path?: string
  retention?: number
  subscribed?: boolean
}

const wildDuckCursorSchema = z.union([z.string(), z.literal(false), z.null()]).optional()
const wildDuckUserAddressSchema: z.ZodType<WildDuckUserAddress> = z.looseObject({
  address: z.string().optional()
})
const wildDuckUserSchema: z.ZodType<WildDuckUser> = z.looseObject({
  address: z.string().optional(),
  addresses: z.array(z.union([z.string(), wildDuckUserAddressSchema])).optional(),
  disabled: z.boolean().optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  suspended: z.boolean().optional(),
  username: z.string().optional()
})
const wildDuckAddressResolutionSchema: z.ZodType<WildDuckAddressResolution> = z.looseObject({
  address: z.string().optional(),
  id: z.string().optional(),
  targets: z.array(z.string()).optional(),
  user: z.string().optional()
})
const wildDuckSuccessResponseSchema: z.ZodType<WildDuckSuccessResponse> = z.looseObject({
  id: z.string().optional(),
  success: z.boolean().optional()
})
const wildDuckDeleteUserResponseSchema: z.ZodType<WildDuckDeleteUserResponse> = z.looseObject({
  addresses: z
    .looseObject({
      deleted: z.number().optional()
    })
    .optional(),
  code: z.string().optional(),
  deleteAfter: z.string().optional(),
  id: z.string().optional(),
  success: z.boolean().optional(),
  task: z.string().optional(),
  user: z.string().optional()
})
const wildDuckMailboxSchema: z.ZodType<WildDuckMailbox> = z.looseObject({
  id: z.string().optional(),
  modifyIndex: z.number().optional(),
  name: z.string().optional(),
  path: z.string().optional(),
  specialUse: z.string().nullable().optional(),
  total: z.number().optional(),
  unseen: z.number().optional()
})
const wildDuckMessageAddressSchema: z.ZodType<WildDuckMessageAddress> = z.looseObject({
  address: z.string().optional(),
  name: z.string().optional()
})
const wildDuckMessageAttachmentSchema: z.ZodType<WildDuckMessageAttachment> = z.looseObject({
  cid: z.string().nullable().optional(),
  contentId: z.string().nullable().optional(),
  contentID: z.string().nullable().optional(),
  contentType: z.string().optional(),
  disposition: z.string().optional(),
  filename: z.string().optional(),
  id: z.string().optional(),
  size: z.number().optional()
})
const wildDuckMessageSchema: z.ZodType<WildDuckMessage> = z.looseObject({
  attachments: z.union([z.boolean(), z.array(wildDuckMessageAttachmentSchema)]).optional(),
  attachmentsList: z.array(wildDuckMessageAttachmentSchema).optional(),
  bcc: z.union([z.array(wildDuckMessageAddressSchema), z.string()]).optional(),
  cc: z.union([z.array(wildDuckMessageAddressSchema), z.string()]).optional(),
  date: z.string().optional(),
  draft: z.boolean().optional(),
  flagged: z.boolean().optional(),
  flags: z.array(z.string()).optional(),
  from: z.union([z.array(wildDuckMessageAddressSchema), wildDuckMessageAddressSchema, z.string()]).optional(),
  html: z.union([z.string(), z.array(z.string())]).optional(),
  id: z.union([z.number(), z.string()]).optional(),
  inReplyTo: z.string().optional(),
  intro: z.string().optional(),
  mailbox: z.string().optional(),
  messageId: z.string().optional(),
  references: z.array(z.string()).optional(),
  replyTo: z
    .union([z.array(wildDuckMessageAddressSchema), wildDuckMessageAddressSchema, z.string()])
    .optional(),
  seen: z.boolean().optional(),
  subject: z.string().optional(),
  text: z.string().optional(),
  thread: z.string().optional(),
  to: z.union([z.array(wildDuckMessageAddressSchema), z.string()]).optional()
})
const wildDuckUpdateMessageResponseSchema: z.ZodType<WildDuckUpdateMessageResponse> = z.looseObject({
  id: z.union([z.number(), z.string(), z.array(z.array(z.number()))]).optional(),
  success: z.boolean().optional()
})
const wildDuckRecordSchema: z.ZodType<Record<string, unknown>> = z.record(z.string(), z.unknown())
const wildDuckUploadMessageResponseSchema: z.ZodType<{
  message?: {
    id?: number | string
    mailbox?: string
    size?: number
  }
  previousDeleted?: boolean
  success?: boolean
}> = z.looseObject({
  message: z
    .looseObject({
      id: z.union([z.number(), z.string()]).optional(),
      mailbox: z.string().optional(),
      size: z.number().optional()
    })
    .optional(),
  previousDeleted: z.boolean().optional(),
  success: z.boolean().optional()
})
const wildDuckCreateMailboxResponseSchema: z.ZodType<{
  id?: string
  mailbox?: string
  path?: string
  success?: boolean
}> = z.looseObject({
  id: z.string().optional(),
  mailbox: z.string().optional(),
  path: z.string().optional(),
  success: z.boolean().optional()
})

const wildDuckUserListResponseSchema = wildDuckListResponseSchema(wildDuckUserSchema)
const wildDuckMailboxListResponseSchema = wildDuckListResponseSchema(wildDuckMailboxSchema)
const wildDuckMessageListResponseSchema = wildDuckListResponseSchema(wildDuckMessageSchema)

function wildDuckListResponseSchema<T>(itemSchema: z.ZodType<T>): z.ZodType<WildDuckListResponse<T>> {
  return z.looseObject({
    next: wildDuckCursorSchema,
    nextCursor: wildDuckCursorSchema,
    previous: wildDuckCursorSchema,
    previousCursor: wildDuckCursorSchema,
    results: z.array(itemSchema),
    total: z.number().optional()
  })
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
    return this.requestJSON(
      'GET',
      '/users',
      {
        searchParams: {
          limit: '250',
          query
        }
      },
      wildDuckUserListResponseSchema
    )
  }

  resolveAddress(address: string): Promise<WildDuckAddressResolution> {
    return this.requestJSON(
      'GET',
      `/addresses/resolve/${encodeURIComponent(address)}`,
      {},
      wildDuckAddressResolutionSchema
    )
  }

  createUser(input: WildDuckCreateUserInput): Promise<WildDuckSuccessResponse> {
    return this.requestJSON(
      'POST',
      '/users',
      {
        body: {
          address: input.address,
          allowUnsafe: input.allowUnsafe,
          name: input.name,
          password: input.password,
          spamLevel: input.spamLevel,
          username: input.username
        }
      },
      wildDuckSuccessResponseSchema
    )
  }

  getUser(userId: string): Promise<WildDuckUser> {
    return this.requestJSON('GET', `/users/${encodeURIComponent(userId)}`, {}, wildDuckUserSchema)
  }

  updateUser(userId: string, input: WildDuckUpdateUserInput): Promise<WildDuckSuccessResponse> {
    return this.requestJSON(
      'PUT',
      `/users/${encodeURIComponent(userId)}`,
      {
        body: {
          ...(input.disabled !== undefined ? { disabled: input.disabled } : {}),
          ...(input.name !== undefined ? { name: input.name } : {})
        }
      },
      wildDuckSuccessResponseSchema
    )
  }

  deleteUser(userId: string): Promise<WildDuckDeleteUserResponse> {
    return this.requestJSON(
      'DELETE',
      `/users/${encodeURIComponent(userId)}`,
      {},
      wildDuckDeleteUserResponseSchema
    )
  }

  createForwardedAddress(input: WildDuckForwardedAddressInput): Promise<WildDuckSuccessResponse> {
    return this.requestJSON('POST', '/addresses/forwarded', { body: input }, wildDuckSuccessResponseSchema)
  }

  updateForwardedAddress(
    addressId: string,
    input: WildDuckForwardedAddressInput
  ): Promise<WildDuckSuccessResponse> {
    return this.requestJSON(
      'PUT',
      `/addresses/forwarded/${encodeURIComponent(addressId)}`,
      { body: input },
      wildDuckSuccessResponseSchema
    )
  }

  deleteForwardedAddress(addressId: string): Promise<WildDuckSuccessResponse> {
    return this.requestJSON(
      'DELETE',
      `/addresses/forwarded/${encodeURIComponent(addressId)}`,
      {},
      wildDuckSuccessResponseSchema
    )
  }

  listMailboxes(userId: string): Promise<WildDuckListResponse<WildDuckMailbox>> {
    return this.requestJSON(
      'GET',
      `/users/${encodeURIComponent(userId)}/mailboxes`,
      {
        searchParams: {
          counters: 'true',
          showHidden: 'true'
        }
      },
      wildDuckMailboxListResponseSchema
    )
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
      },
      wildDuckMessageListResponseSchema
    )
  }

  searchMessages(
    userId: string,
    query: string,
    options: Pick<WildDuckListMessagesOptions, 'limit' | 'next' | 'previous'> = {}
  ): Promise<WildDuckListResponse<WildDuckMessage>> {
    return this.requestJSON(
      'GET',
      `/users/${encodeURIComponent(userId)}/search`,
      {
        searchParams: {
          limit: String(options.limit ?? 25),
          next: options.next ?? undefined,
          order: 'desc',
          previous: options.previous ?? undefined,
          query
        }
      },
      wildDuckMessageListResponseSchema
    )
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
      },
      wildDuckMessageSchema
    )
  }

  updateMessage(
    userId: string,
    mailboxId: string,
    messageId: string,
    input: WildDuckUpdateMessageInput
  ): Promise<WildDuckUpdateMessageResponse> {
    return this.requestJSON(
      'PUT',
      `/users/${encodeURIComponent(userId)}/mailboxes/${encodeURIComponent(mailboxId)}/messages/${encodeURIComponent(messageId)}`,
      {
        body: input
      },
      wildDuckUpdateMessageResponseSchema
    )
  }

  deleteMessage(userId: string, mailboxId: string, messageId: string): Promise<Record<string, unknown>> {
    return this.requestJSON(
      'DELETE',
      `/users/${encodeURIComponent(userId)}/mailboxes/${encodeURIComponent(mailboxId)}/messages/${encodeURIComponent(messageId)}`,
      {},
      wildDuckRecordSchema
    )
  }

  submitMessage(userId: string, input: WildDuckSubmitMessageInput): Promise<Record<string, unknown>> {
    return this.requestJSON(
      'POST',
      `/users/${encodeURIComponent(userId)}/submit`,
      {
        body: toWildDuckSubmitPayload(input)
      },
      wildDuckRecordSchema
    )
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
      },
      wildDuckUploadMessageResponseSchema
    )
  }

  submitDraft(userId: string, mailboxId: string, messageId: string): Promise<Record<string, unknown>> {
    return this.requestJSON(
      'POST',
      `/users/${encodeURIComponent(userId)}/mailboxes/${encodeURIComponent(mailboxId)}/messages/${encodeURIComponent(messageId)}/submit`,
      {},
      wildDuckRecordSchema
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
    return this.requestJSON(
      'POST',
      `/users/${encodeURIComponent(userId)}/mailboxes`,
      {
        body: { path }
      },
      wildDuckCreateMailboxResponseSchema
    )
  }

  updateMailbox(
    userId: string,
    mailboxId: string,
    input: WildDuckUpdateMailboxInput
  ): Promise<Record<string, unknown>> {
    return this.requestJSON(
      'PUT',
      `/users/${encodeURIComponent(userId)}/mailboxes/${encodeURIComponent(mailboxId)}`,
      {
        body: input
      },
      wildDuckRecordSchema
    )
  }

  deleteMailbox(userId: string, mailboxId: string): Promise<Record<string, unknown>> {
    return this.requestJSON(
      'DELETE',
      `/users/${encodeURIComponent(userId)}/mailboxes/${encodeURIComponent(mailboxId)}`,
      {},
      wildDuckRecordSchema
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
    },
    schema: z.ZodType<TResult>
  ): Promise<TResult> {
    const response = await this.requestResponse(method, path, {
      accept: 'application/json',
      body: options.body,
      searchParams: options.searchParams
    })

    const payload = (await response.json().catch(() => undefined)) as unknown
    const parsed = schema.safeParse(payload)
    if (!parsed.success) {
      throw new WildDuckAPIError('Mail service returned an invalid response.', 502)
    }

    return parsed.data
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
  return new WildDuckAPIError(
    wildDuckPublicErrorMessage(response.status),
    response.status,
    sanitizeWildDuckErrorCode(envelope?.code) || undefined
  )
}

function wildDuckPublicErrorMessage(status: number) {
  if (status === 401 || status === 403) {
    return 'Mail service authorization failed.'
  }
  if (status === 404) {
    return 'Mail service resource was not found.'
  }
  if (status === 409) {
    return 'Mail service state changed. Refresh and try again.'
  }
  if (status === 429) {
    return 'Mail service is rate limiting requests. Try again shortly.'
  }
  if (status >= 500) {
    return 'Mail service is temporarily unavailable. Try again shortly.'
  }

  return 'Mail service request failed. Check the mailbox input and try again.'
}

function sanitizeWildDuckErrorCode(value: string | undefined) {
  const code = value?.replace(/\s+/gu, '_').trim().slice(0, 64) ?? ''
  return /^[A-Z0-9_.:-]+$/u.test(code) ? code : ''
}
