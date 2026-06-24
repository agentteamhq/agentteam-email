import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  AGENTTEAM_MAIL_API_OAUTH_SCOPE,
  AGENTTEAM_OAUTH_ACCESS_TOKEN_CLAIMS
} from '../auth/oauth-provider-config'

const webmailTestState = vi.hoisted(() => ({
  authGetSession: vi.fn(),
  authVerifyApiKey: vi.fn(),
  cloudflareConnectionFind: vi.fn(),
  cloudflareConnectionFindOne: vi.fn(),
  createMailbox: vi.fn(),
  createWildDuckClient: vi.fn(),
  deleteMailbox: vi.fn(),
  deleteMessage: vi.fn(),
  agentFindById: vi.fn(),
  agentHostFindById: vi.fn(),
  agentHostUpdateOne: vi.fn(),
  agentJwtReplayCreate: vi.fn(),
  agentUpdateOne: vi.fn(),
  fetchAttachment: vi.fn(),
  fetchMessageSource: vi.fn(),
  getMessage: vi.fn(),
  getUser: vi.fn(),
  listMailboxes: vi.fn(),
  listMessages: vi.fn(),
  listUsers: vi.fn(),
  memberFindOne: vi.fn(),
  oauthClientFindOne: vi.fn(),
  oauthVerifyAccessToken: vi.fn(),
  agentCapabilityGrantCollectionFind: vi.fn(),
  agentCapabilityGrantFind: vi.fn(),
  agentCapabilityGrantHydrate: vi.fn((value: unknown) => value),
  agentMailDomainFind: vi.fn(),
  agentMailMailboxGrantFind: vi.fn(),
  agentMailSystemGrantFind: vi.fn(),
  agentMailTrialFindOne: vi.fn(),
  agentMailTrialUpdateOne: vi.fn(),
  authGetAgentSession: vi.fn(),
  decodeJwt: vi.fn(),
  decodeProtectedHeader: vi.fn(),
  importJWK: vi.fn(),
  jwtVerify: vi.fn(),
  resolveAddress: vi.fn(),
  searchMessages: vi.fn(),
  submitDraft: vi.fn(),
  submitAgentMailSend: vi.fn(),
  submitMessage: vi.fn(),
  updateMailbox: vi.fn(),
  updateMessage: vi.fn(),
  uploadMessage: vi.fn()
}))

class TestWildDuckAPIError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message)
  }
}

function invalidApiKeyVerificationResult() {
  return {
    error: {
      code: 'INVALID_API_KEY',
      message: 'Invalid API key'
    },
    key: null,
    valid: false
  }
}

function validApiKeyVerificationResult({
  configId,
  id = 'api-key-1',
  referenceId = 'org-1'
}: {
  configId: string
  id?: string
  referenceId?: string | null
}) {
  return {
    error: null,
    key: {
      configId,
      id,
      referenceId
    },
    valid: true
  }
}

function mockOrganizationApiKeyVerification({
  id = 'api-key-1',
  referenceId = 'org-1'
}: {
  id?: string
  referenceId?: string | null
} = {}) {
  webmailTestState.authVerifyApiKey.mockImplementation(
    ({
      body
    }: {
      body: {
        configId: string
        key: string
      }
      headers: Headers
    }) =>
      Promise.resolve(
        body.configId === 'organization'
          ? validApiKeyVerificationResult({ configId: 'organization', id, referenceId })
          : invalidApiKeyVerificationResult()
      )
  )
}

function paperclipOAuthClient() {
  return {
    clientId: 'oauth-client-1',
    disabled: false,
    metadata: {
      agentteamEmail: {
        companyId: 'paperclip-company-1',
        integration: 'paperclip',
        pluginId: 'agentteam.paperclip-email-plugin'
      }
    },
    referenceId: 'org-1',
    softwareId: 'agentteam.paperclip-email-plugin'
  }
}

function paperclipRunHeaders(operation: string) {
  return {
    'x-agentteam-paperclip-agent-id': 'paperclip-agent-1',
    'x-agentteam-paperclip-company-id': 'paperclip-company-1',
    'x-agentteam-paperclip-operation': operation,
    'x-agentteam-paperclip-plugin-id': 'agentteam.paperclip-email-plugin',
    'x-agentteam-paperclip-project-id': 'paperclip-project-1',
    'x-agentteam-paperclip-run-id': 'paperclip-run-1'
  }
}

vi.mock('jose', () => ({
  decodeJwt: webmailTestState.decodeJwt,
  decodeProtectedHeader: webmailTestState.decodeProtectedHeader,
  importJWK: webmailTestState.importJWK,
  jwtVerify: webmailTestState.jwtVerify
}))

vi.mock('../globals', () => ({
  globals: () =>
    Promise.resolve({
      auth: {
        api: {
          getAgentSession: webmailTestState.authGetAgentSession,
          getSession: webmailTestState.authGetSession,
          verifyApiKey: webmailTestState.authVerifyApiKey
        }
      },
      db: {
        models: {
          agent: {
            findById: webmailTestState.agentFindById,
            updateOne: webmailTestState.agentUpdateOne
          },
          agentCapabilityGrant: {
            collection: {
              find: webmailTestState.agentCapabilityGrantCollectionFind
            },
            hydrate: webmailTestState.agentCapabilityGrantHydrate,
            find: webmailTestState.agentCapabilityGrantFind
          },
          agentHost: {
            findById: webmailTestState.agentHostFindById,
            updateOne: webmailTestState.agentHostUpdateOne
          },
          agentJwtReplay: {
            create: webmailTestState.agentJwtReplayCreate
          },
          agentMailDomain: {
            find: webmailTestState.agentMailDomainFind
          },
          agentMailMailboxGrant: {
            find: webmailTestState.agentMailMailboxGrantFind
          },
          agentMailSystemGrant: {
            find: webmailTestState.agentMailSystemGrantFind
          },
          agentMailTrial: {
            findOne: webmailTestState.agentMailTrialFindOne,
            updateOne: webmailTestState.agentMailTrialUpdateOne
          },
          cloudflareConnection: {
            find: webmailTestState.cloudflareConnectionFind,
            findOne: webmailTestState.cloudflareConnectionFindOne
          },
          member: {
            findOne: webmailTestState.memberFindOne
          },
          oauthClient: {
            findOne: webmailTestState.oauthClientFindOne
          }
        }
      }
    })
}))

vi.mock('@better-auth/oauth-provider/resource-client', () => ({
  oauthProviderResourceClient: () => ({
    getActions: () => ({
      verifyAccessToken: webmailTestState.oauthVerifyAccessToken
    })
  })
}))

vi.mock('./wildduck-client', () => ({
  WildDuckAPIError: TestWildDuckAPIError,
  createWildDuckClient: webmailTestState.createWildDuckClient
}))

vi.mock('./control-client', () => ({
  getAgentMailControlStatus: vi.fn(),
  submitAgentMailSend: webmailTestState.submitAgentMailSend
}))

describe('Agent Mail WildDuck webmail service', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('DATABASE_URL', 'mongodb://localhost:27017/app')
    vi.stubEnv('ENCRYPT_SECRET_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    vi.stubEnv('PUBLIC_HOSTNAME', 'https://mail.example.com')
    webmailTestState.authGetSession.mockReset()
    webmailTestState.authGetAgentSession.mockReset()
    webmailTestState.authVerifyApiKey.mockReset()
    webmailTestState.cloudflareConnectionFind.mockReset()
    webmailTestState.cloudflareConnectionFindOne.mockReset()
    webmailTestState.createMailbox.mockReset()
    webmailTestState.createWildDuckClient.mockReset()
    webmailTestState.deleteMailbox.mockReset()
    webmailTestState.deleteMessage.mockReset()
    webmailTestState.agentFindById.mockReset()
    webmailTestState.agentHostFindById.mockReset()
    webmailTestState.agentHostUpdateOne.mockReset()
    webmailTestState.agentJwtReplayCreate.mockReset()
    webmailTestState.agentUpdateOne.mockReset()
    webmailTestState.fetchAttachment.mockReset()
    webmailTestState.fetchMessageSource.mockReset()
    webmailTestState.getMessage.mockReset()
    webmailTestState.getUser.mockReset()
    webmailTestState.listMailboxes.mockReset()
    webmailTestState.listMessages.mockReset()
    webmailTestState.listUsers.mockReset()
    webmailTestState.memberFindOne.mockReset()
    webmailTestState.oauthClientFindOne.mockReset()
    webmailTestState.oauthVerifyAccessToken.mockReset()
    webmailTestState.agentCapabilityGrantCollectionFind.mockReset()
    webmailTestState.agentCapabilityGrantFind.mockReset()
    webmailTestState.agentCapabilityGrantHydrate.mockReset()
    webmailTestState.agentCapabilityGrantHydrate.mockImplementation((value: unknown) => value)
    webmailTestState.agentMailDomainFind.mockReset()
    webmailTestState.agentMailMailboxGrantFind.mockReset()
    webmailTestState.agentMailSystemGrantFind.mockReset()
    webmailTestState.agentMailTrialFindOne.mockReset()
    webmailTestState.agentMailTrialUpdateOne.mockReset()
    webmailTestState.decodeJwt.mockReset()
    webmailTestState.decodeProtectedHeader.mockReset()
    webmailTestState.importJWK.mockReset()
    webmailTestState.jwtVerify.mockReset()
    webmailTestState.resolveAddress.mockReset()
    webmailTestState.searchMessages.mockReset()
    webmailTestState.submitDraft.mockReset()
    webmailTestState.submitAgentMailSend.mockReset()
    webmailTestState.submitMessage.mockReset()
    webmailTestState.updateMailbox.mockReset()
    webmailTestState.updateMessage.mockReset()
    webmailTestState.uploadMessage.mockReset()

    webmailTestState.createWildDuckClient.mockReturnValue({
      createMailbox: webmailTestState.createMailbox,
      deleteMailbox: webmailTestState.deleteMailbox,
      deleteMessage: webmailTestState.deleteMessage,
      fetchAttachment: webmailTestState.fetchAttachment,
      fetchMessageSource: webmailTestState.fetchMessageSource,
      getUser: webmailTestState.getUser,
      listMailboxes: webmailTestState.listMailboxes,
      listMessages: webmailTestState.listMessages,
      listUsers: webmailTestState.listUsers,
      getMessage: webmailTestState.getMessage,
      resolveAddress: webmailTestState.resolveAddress,
      searchMessages: webmailTestState.searchMessages,
      submitDraft: webmailTestState.submitDraft,
      submitMessage: webmailTestState.submitMessage,
      updateMailbox: webmailTestState.updateMailbox,
      updateMessage: webmailTestState.updateMessage,
      uploadMessage: webmailTestState.uploadMessage
    })
    webmailTestState.getUser.mockResolvedValue({
      address: 'support@example.test',
      id: 'wildduck-user-1',
      name: 'Support'
    })
    webmailTestState.authGetSession.mockResolvedValue({
      session: {
        activeOrganizationId: 'org-1',
        id: 'session-1'
      },
      user: {
        id: 'user-1'
      }
    })
    webmailTestState.authGetAgentSession.mockResolvedValue(null)
    webmailTestState.authVerifyApiKey.mockResolvedValue(invalidApiKeyVerificationResult())
    webmailTestState.agentFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: 'agent-1',
          expiresAt: null,
          hostId: 'agent-host-1',
          status: 'active'
        })
    })
    webmailTestState.agentHostFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: 'agent-host-1',
          expiresAt: null,
          status: 'active'
        })
    })
    webmailTestState.agentHostUpdateOne.mockReturnValue({
      exec: () => Promise.resolve({ matchedCount: 1, modifiedCount: 1 })
    })
    webmailTestState.agentUpdateOne.mockReturnValue({
      exec: () => Promise.resolve({ matchedCount: 1, modifiedCount: 1 })
    })
    webmailTestState.memberFindOne.mockReturnValue({
      exec: () => Promise.resolve({ id: 'member-1', role: 'owner' })
    })
    webmailTestState.oauthClientFindOne.mockReturnValue({
      exec: () => Promise.resolve(null)
    })
    webmailTestState.oauthVerifyAccessToken.mockRejectedValue(new Error('missing token'))
    webmailTestState.agentMailDomainFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            domain: 'example.test',
            status: 'active'
          }
        ])
    })
    webmailTestState.agentMailMailboxGrantFind.mockReturnValue({ exec: () => Promise.resolve([]) })
    webmailTestState.agentMailSystemGrantFind.mockReturnValue({ exec: () => Promise.resolve([]) })
    webmailTestState.agentMailTrialFindOne.mockReturnValue({
      sort: () => ({ exec: () => Promise.resolve(null) })
    })
    webmailTestState.agentMailTrialUpdateOne.mockReturnValue({
      exec: () => Promise.resolve({ matchedCount: 1, modifiedCount: 1 })
    })
    webmailTestState.agentCapabilityGrantFind.mockReturnValue({ exec: () => Promise.resolve([]) })
    webmailTestState.agentCapabilityGrantCollectionFind.mockReturnValue({
      toArray: () => Promise.resolve([])
    })
    webmailTestState.agentJwtReplayCreate.mockResolvedValue({})
    webmailTestState.cloudflareConnectionFind.mockReturnValue({ exec: () => Promise.resolve([]) })
    webmailTestState.cloudflareConnectionFindOne.mockReturnValue({ exec: () => Promise.resolve(null) })
    webmailTestState.importJWK.mockResolvedValue('agent-verification-key')
    webmailTestState.listUsers.mockResolvedValue({
      results: [
        {
          address: 'support@example.test',
          id: 'wildduck-user-1',
          name: 'Support'
        },
        {
          address: 'intruder@other.test',
          id: 'wildduck-user-2',
          name: 'Intruder'
        }
      ]
    })
    webmailTestState.resolveAddress.mockResolvedValue({ user: 'wildduck-user-1' })
    webmailTestState.listMailboxes.mockResolvedValue({
      results: [
        {
          id: 'inbox-id',
          name: 'Inbox',
          path: 'INBOX',
          specialUse: '\\Inbox',
          total: 1,
          unseen: 1
        },
        {
          id: 'drafts-id',
          name: 'Drafts',
          path: 'Drafts',
          specialUse: '\\Drafts',
          total: 0,
          unseen: 0
        }
      ]
    })
    webmailTestState.listMessages.mockResolvedValue({
      nextCursor: 'next-page',
      previousCursor: false,
      results: [
        {
          attachments: true,
          attachmentsList: [
            {
              cid: 'unsafe@example.test',
              contentType: 'text/html',
              disposition: 'attachment',
              filename: 'unsafe.html',
              id: 'attachment-1',
              size: 42
            }
          ],
          date: '2026-06-22T12:00:00.000Z',
          from: {
            address: 'sender@example.net',
            name: 'Sender'
          },
          html: '<p>Hello</p>',
          id: 12,
          mailbox: 'inbox-id',
          seen: false,
          subject: 'Hello',
          text: 'Hello',
          to: [
            {
              address: 'support@example.test',
              name: 'Support'
            }
          ]
        }
      ],
      total: 1
    })
    webmailTestState.searchMessages.mockResolvedValue({
      nextCursor: false,
      previousCursor: false,
      results: [],
      total: 0
    })
    webmailTestState.getMessage.mockResolvedValue({
      attachments: [
        {
          cid: 'unsafe@example.test',
          contentType: 'text/html',
          disposition: 'attachment',
          filename: 'unsafe.html',
          id: 'attachment-1',
          size: 42
        }
      ],
      date: '2026-06-22T12:00:00.000Z',
      from: {
        address: 'sender@example.net',
        name: 'Sender'
      },
      html: '<p>Hello</p>',
      id: 12,
      mailbox: 'inbox-id',
      replyTo: {
        address: 'reply@example.net',
        name: 'Reply'
      },
      seen: false,
      subject: 'Hello',
      text: 'Hello',
      to: [
        {
          address: 'support@example.test',
          name: 'Support'
        }
      ]
    })
    webmailTestState.createMailbox.mockResolvedValue({
      id: 'created-folder-id',
      path: 'Projects',
      success: true
    })
    webmailTestState.deleteMailbox.mockResolvedValue({ success: true })
    webmailTestState.deleteMessage.mockResolvedValue({ success: true })
    webmailTestState.updateMailbox.mockResolvedValue({ success: true })
    webmailTestState.fetchAttachment.mockResolvedValue(
      new Response('attachment-body', {
        headers: {
          'content-length': '15',
          'content-type': 'text/html'
        }
      })
    )
    webmailTestState.fetchMessageSource.mockResolvedValue(
      new Response('raw-source', {
        headers: {
          'content-length': '10',
          'content-type': 'text/plain'
        }
      })
    )
    webmailTestState.submitDraft.mockResolvedValue({ success: true })
    webmailTestState.submitAgentMailSend.mockResolvedValue({ queued: true })
    webmailTestState.submitMessage.mockResolvedValue({ success: true })
    webmailTestState.updateMessage.mockResolvedValue({ success: true })
  })

  it('requires an authenticated active organization before creating a WildDuck client', async () => {
    expect.hasAssertions()
    webmailTestState.authGetSession.mockResolvedValue(null)

    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')

    await expect(
      getAgentMailWorkspaceForWeb({
        headers: new Headers(),
        input: {}
      })
    ).rejects.toMatchObject({
      message: 'Authentication required',
      status: 401
    })
    expect(webmailTestState.createWildDuckClient).not.toHaveBeenCalled()
  }, 15_000)

  it('authenticates direct webmail operations before creating a WildDuck client', async () => {
    expect.hasAssertions()
    webmailTestState.authGetSession.mockResolvedValue(null)

    const service = await import('./webmail-service')
    const directOperations = [
      {
        name: 'attachment fetch',
        run: () =>
          service.getAgentMailAttachmentForWeb({
            accountId: 'support@example.test',
            attachmentId: 'attachment-1',
            headers: new Headers(),
            mailboxId: 'inbox-id',
            messageId: '12'
          })
      },
      {
        name: 'original source fetch',
        run: () =>
          service.getAgentMailOriginalSourceForWeb({
            accountId: 'support@example.test',
            headers: new Headers(),
            mailboxId: 'inbox-id',
            messageId: '12'
          })
      },
      {
        name: 'message send',
        run: () =>
          service.sendAgentMailMessageForWeb({
            headers: new Headers(),
            input: {
              accountId: 'support@example.test',
              body: 'Hello',
              subject: 'Hello',
              to: 'recipient@example.net'
            }
          })
      },
      {
        name: 'draft save',
        run: () =>
          service.saveAgentMailDraftForWeb({
            headers: new Headers(),
            input: {
              accountId: 'support@example.test',
              body: 'Draft body',
              subject: 'Draft subject',
              to: 'recipient@example.net'
            }
          })
      },
      {
        name: 'draft send',
        run: () =>
          service.sendAgentMailDraftForWeb({
            headers: new Headers(),
            input: {
              accountId: 'support@example.test',
              mailboxId: 'drafts-id',
              messageId: '12'
            }
          })
      },
      {
        name: 'message update',
        run: () =>
          service.updateAgentMailMessageForWeb({
            headers: new Headers(),
            input: {
              accountId: 'support@example.test',
              mailboxId: 'inbox-id',
              messageId: '12',
              seen: true
            }
          })
      },
      {
        name: 'message move',
        run: () =>
          service.moveAgentMailMessageForWeb({
            headers: new Headers(),
            input: {
              accountId: 'support@example.test',
              mailboxId: 'inbox-id',
              messageId: '12',
              targetMailboxId: 'archive-id'
            }
          })
      },
      {
        name: 'message delete',
        run: () =>
          service.deleteAgentMailMessageForWeb({
            headers: new Headers(),
            input: {
              accountId: 'support@example.test',
              mailboxId: 'inbox-id',
              messageId: '12'
            }
          })
      },
      {
        name: 'folder create',
        run: () =>
          service.createAgentMailFolderForWeb({
            accountId: 'support@example.test',
            headers: new Headers(),
            name: 'Projects'
          })
      },
      {
        name: 'folder delete',
        run: () =>
          service.deleteAgentMailFolderForWeb({
            accountId: 'support@example.test',
            headers: new Headers(),
            mailboxId: 'projects-id'
          })
      }
    ] as const

    for (const operation of directOperations) {
      webmailTestState.createWildDuckClient.mockClear()
      await expect(operation.run(), operation.name).rejects.toMatchObject({
        message: 'Authentication required',
        status: 401
      })
      expect(webmailTestState.createWildDuckClient, operation.name).not.toHaveBeenCalled()
    }
  }, 15_000)

  it('rejects invalid API keys before reading grants or creating a WildDuck client', async () => {
    expect.hasAssertions()
    webmailTestState.authGetSession.mockResolvedValue(null)

    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')

    await expect(
      getAgentMailWorkspaceForWeb({
        headers: new Headers({ 'x-api-key': '_secret_api_invalid' }),
        input: {}
      })
    ).rejects.toMatchObject({
      message: 'Authentication required',
      status: 401
    })
    expect(webmailTestState.authVerifyApiKey).toHaveBeenNthCalledWith(1, {
      body: {
        configId: 'default',
        key: '_secret_api_invalid'
      },
      headers: expect.any(Headers)
    })
    expect(webmailTestState.authVerifyApiKey).toHaveBeenNthCalledWith(2, {
      body: {
        configId: 'organization',
        key: '_secret_api_invalid'
      },
      headers: expect.any(Headers)
    })
    expect(webmailTestState.agentMailMailboxGrantFind).not.toHaveBeenCalled()
    expect(webmailTestState.createWildDuckClient).not.toHaveBeenCalled()
  }, 15_000)

  it('rejects valid API keys without persisted mail grants before creating a WildDuck client', async () => {
    expect.hasAssertions()
    webmailTestState.authGetSession.mockResolvedValue(null)
    mockOrganizationApiKeyVerification()

    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')

    await expect(
      getAgentMailWorkspaceForWeb({
        headers: new Headers({ 'x-api-key': '_secret_api_valid' }),
        input: {}
      })
    ).rejects.toMatchObject({
      message: 'Organization access is required',
      status: 403
    })
    expect(webmailTestState.authVerifyApiKey).toHaveBeenNthCalledWith(2, {
      body: {
        configId: 'organization',
        key: '_secret_api_valid'
      },
      headers: expect.any(Headers)
    })
    expect(webmailTestState.createWildDuckClient).not.toHaveBeenCalled()
  }, 15_000)

  it('resolves valid API keys into grant-backed mail principals', async () => {
    expect.hasAssertions()
    webmailTestState.authGetSession.mockResolvedValue(null)
    mockOrganizationApiKeyVerification()
    webmailTestState.agentMailMailboxGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            capability: 'readMailbox',
            expiresAt: null,
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1',
            principalId: 'api-key-1',
            principalType: 'api_key',
            status: 'active'
          }
        ])
    })

    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')
    const workspace = await getAgentMailWorkspaceForWeb({
      headers: new Headers({ 'x-api-key': '_secret_api_valid' }),
      input: {}
    })

    expect(workspace.accounts).toStrictEqual([
      {
        address: 'support@example.test',
        description: 'WildDuck mailbox for example.test',
        id: 'support@example.test',
        name: 'support',
        state: 'ready'
      }
    ])
    expect(webmailTestState.listUsers).not.toHaveBeenCalled()
    expect(webmailTestState.resolveAddress).toHaveBeenCalledWith('support@example.test')
  }, 15_000)

  it('uses the verified API key storage id as the grant-backed mail principal id', async () => {
    expect.hasAssertions()
    const apiKeyStorageId = '01960000-0000-7000-8000-0000000000d1'
    webmailTestState.authGetSession.mockResolvedValue(null)
    mockOrganizationApiKeyVerification({ id: apiKeyStorageId })
    webmailTestState.agentMailMailboxGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            capability: 'readMailbox',
            expiresAt: null,
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1',
            principalId: apiKeyStorageId,
            principalType: 'api_key',
            status: 'active'
          }
        ])
    })

    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')
    const workspace = await getAgentMailWorkspaceForWeb({
      headers: new Headers({ 'x-api-key': '_secret_api_valid' }),
      input: {}
    })

    expect(workspace.accounts.map((account) => account.id)).toStrictEqual(['support@example.test'])
    expect(webmailTestState.agentMailMailboxGrantFind).toHaveBeenCalledWith({
      principalId: apiKeyStorageId,
      principalType: 'api_key'
    })
    const { requireAgentMailOrganizationContext } = await import('./service')
    const context = await requireAgentMailOrganizationContext(
      new Headers({ 'x-api-key': '_secret_api_valid' })
    )
    expect(context.principal).toMatchObject({
      credentialId: apiKeyStorageId,
      principalId: apiKeyStorageId,
      principalType: 'api_key'
    })
  }, 15_000)

  it('rejects API key organization header overrides outside the key reference before WildDuck access', async () => {
    expect.hasAssertions()
    webmailTestState.authGetSession.mockResolvedValue(null)
    mockOrganizationApiKeyVerification()
    webmailTestState.agentMailMailboxGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            capability: 'readMailbox',
            expiresAt: null,
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1',
            principalId: 'api-key-1',
            principalType: 'api_key',
            status: 'active'
          },
          {
            capability: 'readMailbox',
            expiresAt: null,
            mailboxAddress: 'intruder@other.test',
            organizationId: 'org-2',
            principalId: 'api-key-1',
            principalType: 'api_key',
            status: 'active'
          }
        ])
    })
    webmailTestState.agentMailDomainFind.mockReturnValue({
      exec: () => Promise.resolve([{ domain: 'other.test', status: 'active' }])
    })

    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')

    await expect(
      getAgentMailWorkspaceForWeb({
        headers: new Headers({
          'x-agentteam-organization-id': 'org-2',
          'x-api-key': '_secret_api_valid'
        }),
        input: { accountId: 'intruder@other.test' }
      })
    ).rejects.toMatchObject({
      message: 'Organization access is required',
      status: 403
    })
    expect(webmailTestState.createWildDuckClient).not.toHaveBeenCalled()
  }, 15_000)

  it('rejects OAuth access tokens without persisted mail grants before creating a WildDuck client', async () => {
    expect.hasAssertions()
    webmailTestState.authGetSession.mockResolvedValue(null)
    webmailTestState.oauthVerifyAccessToken.mockResolvedValue({
      [AGENTTEAM_OAUTH_ACCESS_TOKEN_CLAIMS.organizationId]: 'org-1',
      azp: 'oauth-client-1',
      scope: `openid profile email ${AGENTTEAM_MAIL_API_OAUTH_SCOPE}`,
      sub: 'user-1'
    })
    webmailTestState.oauthClientFindOne.mockReturnValue({
      exec: () =>
        Promise.resolve({
          clientId: 'oauth-client-1',
          disabled: false
        })
    })

    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')

    await expect(
      getAgentMailWorkspaceForWeb({
        headers: new Headers({ authorization: 'Bearer oauth-token' }),
        input: {}
      })
    ).rejects.toMatchObject({
      message: 'Organization access is required',
      status: 403
    })
    expect(webmailTestState.oauthVerifyAccessToken).toHaveBeenCalledWith('oauth-token', {
      verifyOptions: {
        audience: 'https://mail.example.com/api'
      }
    })
    expect(webmailTestState.createWildDuckClient).not.toHaveBeenCalled()
  }, 15_000)

  it('rejects Paperclip OAuth clients without run context before reading grants', async () => {
    expect.hasAssertions()
    webmailTestState.authGetSession.mockResolvedValue(null)
    webmailTestState.oauthVerifyAccessToken.mockResolvedValue({
      [AGENTTEAM_OAUTH_ACCESS_TOKEN_CLAIMS.organizationId]: 'org-1',
      azp: 'oauth-client-1',
      scope: `openid profile email ${AGENTTEAM_MAIL_API_OAUTH_SCOPE}`,
      sub: 'user-1'
    })
    webmailTestState.oauthClientFindOne.mockReturnValue({
      exec: () => Promise.resolve(paperclipOAuthClient())
    })
    webmailTestState.agentMailMailboxGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            capability: 'readMailbox',
            expiresAt: null,
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1',
            principalId: 'oauth-client-1',
            principalType: 'oauth_client',
            status: 'active'
          }
        ])
    })

    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')

    await expect(
      getAgentMailWorkspaceForWeb({
        headers: new Headers({ authorization: 'Bearer oauth-token' }),
        input: {}
      })
    ).rejects.toMatchObject({
      message: 'Paperclip OAuth connection is not authorized',
      status: 403
    })
    expect(webmailTestState.agentMailMailboxGrantFind).not.toHaveBeenCalled()
    expect(webmailTestState.createWildDuckClient).not.toHaveBeenCalled()
  }, 15_000)

  it('rejects Paperclip OAuth clients with malformed run context before reading grants', async () => {
    expect.hasAssertions()
    webmailTestState.authGetSession.mockResolvedValue(null)
    webmailTestState.oauthVerifyAccessToken.mockResolvedValue({
      [AGENTTEAM_OAUTH_ACCESS_TOKEN_CLAIMS.organizationId]: 'org-1',
      azp: 'oauth-client-1',
      scope: `openid profile email ${AGENTTEAM_MAIL_API_OAUTH_SCOPE}`,
      sub: 'user-1'
    })
    webmailTestState.oauthClientFindOne.mockReturnValue({
      exec: () => Promise.resolve(paperclipOAuthClient())
    })
    webmailTestState.agentMailMailboxGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            capability: 'readMailbox',
            expiresAt: null,
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1',
            principalId: 'oauth-client-1',
            principalType: 'oauth_client',
            status: 'active'
          }
        ])
    })

    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')

    await expect(
      getAgentMailWorkspaceForWeb({
        headers: new Headers({
          authorization: 'Bearer oauth-token',
          ...paperclipRunHeaders('search inbox')
        }),
        input: {}
      })
    ).rejects.toMatchObject({
      message: 'Paperclip OAuth connection is not authorized',
      status: 403
    })
    expect(webmailTestState.agentMailMailboxGrantFind).not.toHaveBeenCalled()
    expect(webmailTestState.createWildDuckClient).not.toHaveBeenCalled()
  }, 15_000)

  it('rejects Paperclip run context headers without an authenticated principal before WildDuck access', async () => {
    expect.hasAssertions()
    webmailTestState.authGetSession.mockResolvedValue(null)

    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')

    await expect(
      getAgentMailWorkspaceForWeb({
        headers: new Headers({
          'x-agentteam-paperclip-agent-id': 'paperclip-agent-1',
          'x-agentteam-paperclip-company-id': 'paperclip-company-1',
          'x-agentteam-paperclip-operation': 'search',
          'x-agentteam-paperclip-plugin-id': 'agentteam.paperclip-email-plugin',
          'x-agentteam-paperclip-project-id': 'paperclip-project-1',
          'x-agentteam-paperclip-run-id': 'paperclip-run-1'
        }),
        input: {}
      })
    ).rejects.toMatchObject({
      message: 'Authentication required',
      status: 401
    })
    expect(webmailTestState.agentMailMailboxGrantFind).not.toHaveBeenCalled()
    expect(webmailTestState.createWildDuckClient).not.toHaveBeenCalled()
  }, 15_000)

  it('rejects OAuth access tokens without the mail API scope before reading grants', async () => {
    expect.hasAssertions()
    webmailTestState.authGetSession.mockResolvedValue(null)
    webmailTestState.oauthVerifyAccessToken.mockResolvedValue({
      [AGENTTEAM_OAUTH_ACCESS_TOKEN_CLAIMS.organizationId]: 'org-1',
      azp: 'oauth-client-1',
      scope: 'openid profile email',
      sub: 'user-1'
    })
    webmailTestState.oauthClientFindOne.mockReturnValue({
      exec: () =>
        Promise.resolve({
          clientId: 'oauth-client-1',
          disabled: false,
          metadata: {
            agentteamEmail: {
              companyId: 'paperclip-company-1',
              integration: 'paperclip',
              pluginId: 'agentteam.paperclip-email-plugin'
            }
          },
          referenceId: 'org-1',
          softwareId: 'agentteam.paperclip-email-plugin'
        })
    })
    webmailTestState.agentMailMailboxGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            capability: 'readMailbox',
            expiresAt: null,
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1',
            principalId: 'oauth-client-1',
            principalType: 'oauth_client',
            status: 'active'
          }
        ])
    })

    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')

    await expect(
      getAgentMailWorkspaceForWeb({
        headers: new Headers({ authorization: 'Bearer oauth-token' }),
        input: {}
      })
    ).rejects.toMatchObject({
      message: 'OAuth token is not authorized for mail API access',
      status: 403
    })
    expect(webmailTestState.agentMailMailboxGrantFind).not.toHaveBeenCalled()
    expect(webmailTestState.createWildDuckClient).not.toHaveBeenCalled()
  }, 15_000)

  it('resolves OAuth access tokens into grant-backed mail principals', async () => {
    expect.hasAssertions()
    webmailTestState.authGetSession.mockResolvedValue(null)
    webmailTestState.oauthVerifyAccessToken.mockResolvedValue({
      [AGENTTEAM_OAUTH_ACCESS_TOKEN_CLAIMS.organizationId]: 'org-1',
      azp: 'oauth-client-1',
      scope: `openid profile email ${AGENTTEAM_MAIL_API_OAUTH_SCOPE}`,
      sub: 'user-1'
    })
    webmailTestState.oauthClientFindOne.mockReturnValue({
      exec: () =>
        Promise.resolve({
          clientId: 'oauth-client-1',
          disabled: false
        })
    })
    webmailTestState.agentMailMailboxGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            capability: 'readMailbox',
            expiresAt: null,
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1',
            principalId: 'oauth-client-1',
            principalType: 'oauth_client',
            status: 'active'
          }
        ])
    })

    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')
    const workspace = await getAgentMailWorkspaceForWeb({
      headers: new Headers({ authorization: 'Bearer oauth-token' }),
      input: {}
    })

    expect(workspace.accounts).toStrictEqual([
      {
        address: 'support@example.test',
        description: 'WildDuck mailbox for example.test',
        id: 'support@example.test',
        name: 'support',
        state: 'ready'
      }
    ])
    expect(webmailTestState.listUsers).not.toHaveBeenCalled()
    expect(webmailTestState.resolveAddress).toHaveBeenCalledWith('support@example.test')
    const { requireAgentMailOrganizationContext } = await import('./service')
    const context = await requireAgentMailOrganizationContext(
      new Headers({ authorization: 'Bearer oauth-token' })
    )
    expect(context.principal).toMatchObject({
      principalId: 'oauth-client-1',
      principalType: 'oauth_client',
      scopes: ['email', AGENTTEAM_MAIL_API_OAUTH_SCOPE, 'openid', 'profile']
    })
  }, 15_000)

  it('resolves lowercase bearer OAuth access tokens into grant-backed mail principals', async () => {
    expect.hasAssertions()
    webmailTestState.authGetSession.mockResolvedValue(null)
    webmailTestState.oauthVerifyAccessToken.mockResolvedValue({
      [AGENTTEAM_OAUTH_ACCESS_TOKEN_CLAIMS.organizationId]: 'org-1',
      azp: 'oauth-client-1',
      scope: `openid profile email ${AGENTTEAM_MAIL_API_OAUTH_SCOPE}`,
      sub: 'user-1'
    })
    webmailTestState.oauthClientFindOne.mockReturnValue({
      exec: () =>
        Promise.resolve({
          clientId: 'oauth-client-1',
          disabled: false
        })
    })
    webmailTestState.agentMailMailboxGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            capability: 'readMailbox',
            expiresAt: null,
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1',
            principalId: 'oauth-client-1',
            principalType: 'oauth_client',
            status: 'active'
          }
        ])
    })

    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')
    const workspace = await getAgentMailWorkspaceForWeb({
      headers: new Headers({ authorization: 'bearer oauth-token' }),
      input: {}
    })

    expect(workspace.accounts).toStrictEqual([
      {
        address: 'support@example.test',
        description: 'WildDuck mailbox for example.test',
        id: 'support@example.test',
        name: 'support',
        state: 'ready'
      }
    ])
    expect(webmailTestState.oauthVerifyAccessToken).toHaveBeenCalledWith('oauth-token', {
      verifyOptions: {
        audience: 'https://mail.example.com/api'
      }
    })
    expect(webmailTestState.authGetSession).not.toHaveBeenCalled()
    expect(webmailTestState.resolveAddress).toHaveBeenCalledWith('support@example.test')
  }, 15_000)

  it('treats Paperclip run context headers as non-authoritative lookup context for OAuth callers', async () => {
    expect.hasAssertions()
    webmailTestState.authGetSession.mockResolvedValue(null)
    webmailTestState.oauthVerifyAccessToken.mockResolvedValue({
      [AGENTTEAM_OAUTH_ACCESS_TOKEN_CLAIMS.organizationId]: 'org-1',
      azp: 'oauth-client-1',
      scope: `openid profile email ${AGENTTEAM_MAIL_API_OAUTH_SCOPE}`,
      sub: 'user-1'
    })
    webmailTestState.oauthClientFindOne.mockReturnValue({
      exec: () =>
        Promise.resolve({
          clientId: 'oauth-client-1',
          disabled: false,
          metadata: {
            agentteamEmail: {
              companyId: 'paperclip-company-1',
              integration: 'paperclip',
              pluginId: 'agentteam.paperclip-email-plugin'
            }
          },
          referenceId: 'org-1',
          softwareId: 'agentteam.paperclip-email-plugin'
        })
    })
    webmailTestState.agentMailMailboxGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            capability: 'readMailbox',
            expiresAt: null,
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1',
            principalId: 'oauth-client-1',
            principalType: 'oauth_client',
            status: 'active'
          }
        ])
    })

    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')
    const headers = new Headers({
      authorization: 'Bearer oauth-token',
      'x-agentteam-paperclip-agent-id': 'paperclip-agent-without-agentteam-grants',
      'x-agentteam-paperclip-company-id': 'paperclip-company-1',
      'x-agentteam-paperclip-operation': 'search',
      'x-agentteam-paperclip-plugin-id': 'agentteam.paperclip-email-plugin',
      'x-agentteam-paperclip-project-id': 'paperclip-project-1',
      'x-agentteam-paperclip-run-id': 'paperclip-run-1'
    })
    const workspace = await getAgentMailWorkspaceForWeb({
      headers,
      input: {}
    })

    expect(workspace.accounts.map((account) => account.id)).toStrictEqual(['support@example.test'])
    expect(webmailTestState.agentFindById).not.toHaveBeenCalled()
    expect(webmailTestState.agentMailMailboxGrantFind).toHaveBeenCalledWith({
      principalId: 'oauth-client-1',
      principalType: 'oauth_client'
    })
    const { requireAgentMailOrganizationContext } = await import('./service')
    const context = await requireAgentMailOrganizationContext(headers)
    expect(context.principal).toMatchObject({
      principalId: 'oauth-client-1',
      principalType: 'oauth_client'
    })
    expect(context.paperclipContext).toStrictEqual({
      agentId: 'paperclip-agent-without-agentteam-grants',
      companyId: 'paperclip-company-1',
      operation: 'search',
      pluginId: 'agentteam.paperclip-email-plugin',
      projectId: 'paperclip-project-1',
      runId: 'paperclip-run-1'
    })
  }, 15_000)

  it('rejects Paperclip OAuth operation mismatch before creating a WildDuck client', async () => {
    expect.hasAssertions()
    webmailTestState.authGetSession.mockResolvedValue(null)
    webmailTestState.oauthVerifyAccessToken.mockResolvedValue({
      [AGENTTEAM_OAUTH_ACCESS_TOKEN_CLAIMS.organizationId]: 'org-1',
      azp: 'oauth-client-1',
      scope: `openid profile email ${AGENTTEAM_MAIL_API_OAUTH_SCOPE}`,
      sub: 'user-1'
    })
    webmailTestState.oauthClientFindOne.mockReturnValue({
      exec: () => Promise.resolve(paperclipOAuthClient())
    })
    webmailTestState.agentMailMailboxGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            capability: 'sendAs',
            expiresAt: null,
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1',
            principalId: 'oauth-client-1',
            principalType: 'oauth_client',
            status: 'active'
          }
        ])
    })

    const { sendAgentMailMessageForWeb } = await import('./webmail-service')

    await expect(
      sendAgentMailMessageForWeb({
        headers: new Headers({
          authorization: 'Bearer oauth-token',
          ...paperclipRunHeaders('search')
        }),
        input: {
          accountId: 'support@example.test',
          body: 'This must not send under a search run.',
          subject: 'Paperclip mismatch',
          to: 'Recipient <recipient@example.net>'
        }
      })
    ).rejects.toMatchObject({
      message: 'Paperclip operation is not authorized',
      status: 403
    })
    expect(webmailTestState.createWildDuckClient).not.toHaveBeenCalled()
    expect(webmailTestState.submitMessage).not.toHaveBeenCalled()
  }, 15_000)

  it('rejects Paperclip OAuth run context when persisted client metadata does not match', async () => {
    expect.hasAssertions()
    webmailTestState.authGetSession.mockResolvedValue(null)
    webmailTestState.oauthVerifyAccessToken.mockResolvedValue({
      [AGENTTEAM_OAUTH_ACCESS_TOKEN_CLAIMS.organizationId]: 'org-1',
      azp: 'oauth-client-1',
      scope: `openid profile email ${AGENTTEAM_MAIL_API_OAUTH_SCOPE}`,
      sub: 'user-1'
    })
    webmailTestState.oauthClientFindOne.mockReturnValue({
      exec: () =>
        Promise.resolve({
          clientId: 'oauth-client-1',
          disabled: false,
          metadata: {
            agentteamEmail: {
              companyId: 'other-paperclip-company',
              integration: 'paperclip',
              pluginId: 'agentteam.paperclip-email-plugin'
            }
          },
          referenceId: 'org-1',
          softwareId: 'agentteam.paperclip-email-plugin'
        })
    })

    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')

    await expect(
      getAgentMailWorkspaceForWeb({
        headers: new Headers({
          authorization: 'Bearer oauth-token',
          'x-agentteam-paperclip-agent-id': 'paperclip-agent-1',
          'x-agentteam-paperclip-company-id': 'paperclip-company-1',
          'x-agentteam-paperclip-operation': 'search',
          'x-agentteam-paperclip-plugin-id': 'agentteam.paperclip-email-plugin',
          'x-agentteam-paperclip-project-id': 'paperclip-project-1',
          'x-agentteam-paperclip-run-id': 'paperclip-run-1'
        }),
        input: {}
      })
    ).rejects.toMatchObject({
      message: 'Paperclip OAuth connection is not authorized',
      status: 403
    })
    expect(webmailTestState.agentMailMailboxGrantFind).not.toHaveBeenCalled()
    expect(webmailTestState.createWildDuckClient).not.toHaveBeenCalled()
  }, 15_000)

  it('ignores malformed Paperclip run context headers after resolving the authenticated OAuth principal', async () => {
    expect.hasAssertions()
    webmailTestState.authGetSession.mockResolvedValue(null)
    webmailTestState.oauthVerifyAccessToken.mockResolvedValue({
      [AGENTTEAM_OAUTH_ACCESS_TOKEN_CLAIMS.organizationId]: 'org-1',
      azp: 'oauth-client-1',
      scope: `openid profile email ${AGENTTEAM_MAIL_API_OAUTH_SCOPE}`,
      sub: 'user-1'
    })
    webmailTestState.oauthClientFindOne.mockReturnValue({
      exec: () =>
        Promise.resolve({
          clientId: 'oauth-client-1',
          disabled: false
        })
    })
    webmailTestState.agentMailMailboxGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            capability: 'readMailbox',
            expiresAt: null,
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1',
            principalId: 'oauth-client-1',
            principalType: 'oauth_client',
            status: 'active'
          }
        ])
    })

    const { requireAgentMailOrganizationContext } = await import('./service')
    const context = await requireAgentMailOrganizationContext(
      new Headers({
        authorization: 'Bearer oauth-token',
        'x-agentteam-paperclip-agent-id': 'paperclip-agent-1',
        'x-agentteam-paperclip-company-id': 'paperclip-company-1',
        'x-agentteam-paperclip-operation': 'search inbox',
        'x-agentteam-paperclip-plugin-id': 'agentteam.paperclip-email-plugin',
        'x-agentteam-paperclip-project-id': 'paperclip-project-1',
        'x-agentteam-paperclip-run-id': 'Bearer raw-secret'
      })
    )

    expect(context.principal).toMatchObject({
      principalId: 'oauth-client-1',
      principalType: 'oauth_client'
    })
    expect(context.paperclipContext).toBeNull()
    expect(webmailTestState.agentFindById).not.toHaveBeenCalled()
    expect(webmailTestState.agentMailMailboxGrantFind).toHaveBeenCalledWith({
      principalId: 'oauth-client-1',
      principalType: 'oauth_client'
    })
  }, 15_000)

  it('rejects OAuth organization header overrides outside the access token claim before WildDuck access', async () => {
    expect.hasAssertions()
    webmailTestState.authGetSession.mockResolvedValue(null)
    webmailTestState.oauthVerifyAccessToken.mockResolvedValue({
      [AGENTTEAM_OAUTH_ACCESS_TOKEN_CLAIMS.organizationId]: 'org-1',
      azp: 'oauth-client-1',
      scope: `openid profile email ${AGENTTEAM_MAIL_API_OAUTH_SCOPE}`,
      sub: 'user-1'
    })
    webmailTestState.oauthClientFindOne.mockReturnValue({
      exec: () =>
        Promise.resolve({
          clientId: 'oauth-client-1',
          disabled: false
        })
    })
    webmailTestState.agentMailMailboxGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            capability: 'readMailbox',
            expiresAt: null,
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1',
            principalId: 'oauth-client-1',
            principalType: 'oauth_client',
            status: 'active'
          },
          {
            capability: 'readMailbox',
            expiresAt: null,
            mailboxAddress: 'intruder@other.test',
            organizationId: 'org-2',
            principalId: 'oauth-client-1',
            principalType: 'oauth_client',
            status: 'active'
          }
        ])
    })
    webmailTestState.agentMailDomainFind.mockReturnValue({
      exec: () => Promise.resolve([{ domain: 'other.test', status: 'active' }])
    })

    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')

    await expect(
      getAgentMailWorkspaceForWeb({
        headers: new Headers({
          authorization: 'Bearer oauth-token',
          'x-agentteam-organization-id': 'org-2'
        }),
        input: { accountId: 'intruder@other.test' }
      })
    ).rejects.toMatchObject({
      message: 'Organization access is required',
      status: 403
    })
    expect(webmailTestState.createWildDuckClient).not.toHaveBeenCalled()
  }, 15_000)

  it('returns only active-organization domain accounts and same-origin message resource URLs', async () => {
    expect.hasAssertions()
    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')

    const workspace = await getAgentMailWorkspaceForWeb({
      headers: new Headers(),
      input: {}
    })

    expect(workspace.accounts).toStrictEqual([
      {
        address: 'support@example.test',
        description: 'WildDuck mailbox for example.test',
        id: 'support@example.test',
        name: 'Support',
        state: 'ready'
      }
    ])
    expect(workspace.selectedMessage?.attachments[0]?.url).toBe(
      '/rpc/mail/accounts/support%40example.test/mailboxes/inbox-id/messages/12/attachments/attachment-1'
    )
    expect(workspace.selectedMessage?.attachments[0]?.contentId).toBe('unsafe@example.test')
    expect(workspace.selectedMessage?.plainText).toBe('Hello')
    expect(workspace.selectedMessage?.replyTo).toStrictEqual(['Reply <reply@example.net>'])
    expect(workspace.selectedMessage?.sourceUrl).toBe(
      '/rpc/mail/accounts/support%40example.test/mailboxes/inbox-id/messages/12/source'
    )
    expect(workspace.messages[0]?.attachmentCount).toBe(1)
    expect(workspace.pagination.nextCursor).toBe('next-page')
    expect(workspace.pagination.previousCursor).toBeNull()
    expect(JSON.stringify(workspace)).not.toContain('http://wildduck.example.test')
    expect(JSON.stringify(workspace)).not.toContain('x-access-token')
    expect(JSON.stringify(workspace)).not.toContain('admin-token')
  }, 15_000)

  it('passes previous page cursors through to WildDuck list calls and normalizes pagination cursors', async () => {
    expect.hasAssertions()
    webmailTestState.listMessages.mockResolvedValueOnce({
      nextCursor: false,
      previousCursor: 'older-page',
      results: [
        {
          attachments: false,
          date: '2026-06-21T12:00:00.000Z',
          from: {
            address: 'sender@example.net',
            name: 'Sender'
          },
          id: 11,
          mailbox: 'inbox-id',
          seen: true,
          subject: 'Previous page',
          text: 'Previous page',
          to: [
            {
              address: 'support@example.test',
              name: 'Support'
            }
          ]
        }
      ],
      total: 57
    })
    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')

    const workspace = await getAgentMailWorkspaceForWeb({
      headers: new Headers(),
      input: {
        cursor: 'newer-page',
        direction: 'previous',
        limit: 10
      }
    })

    expect(webmailTestState.listMessages).toHaveBeenCalledWith('wildduck-user-1', 'inbox-id', {
      limit: 10,
      next: undefined,
      previous: 'newer-page',
      unseen: undefined
    })
    expect(workspace.messages.map((message) => message.id)).toStrictEqual(['11'])
    expect(workspace.pagination).toStrictEqual({
      limit: 10,
      nextCursor: null,
      previousCursor: 'older-page',
      total: 57
    })
  }, 15_000)

  it('preserves account and folder context when a paginated WildDuck message page is exhausted', async () => {
    expect.hasAssertions()
    webmailTestState.listMessages.mockResolvedValueOnce({
      nextCursor: false,
      previousCursor: 'previous-page',
      results: [],
      total: 57
    })
    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')

    const workspace = await getAgentMailWorkspaceForWeb({
      headers: new Headers(),
      input: {
        cursor: 'next-page',
        direction: 'next',
        limit: 10
      }
    })

    expect(webmailTestState.listMessages).toHaveBeenCalledWith('wildduck-user-1', 'inbox-id', {
      limit: 10,
      next: 'next-page',
      previous: undefined,
      unseen: undefined
    })
    expect(workspace.activeAccountId).toBe('support@example.test')
    expect(workspace.activeFolderId).toBe('inbox-id')
    expect(workspace.messages).toStrictEqual([])
    expect(workspace.selectedMessage).toBeNull()
    expect(workspace.pagination).toStrictEqual({
      limit: 10,
      nextCursor: null,
      previousCursor: 'previous-page',
      total: 57
    })
    expect(webmailTestState.getMessage).not.toHaveBeenCalled()
  }, 15_000)

  it('does not grant plain organization members implicit mailbox access', async () => {
    expect.hasAssertions()
    webmailTestState.memberFindOne.mockReturnValue({
      exec: () => Promise.resolve({ id: 'member-1', role: 'member' })
    })

    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')
    const workspace = await getAgentMailWorkspaceForWeb({
      headers: new Headers(),
      input: {}
    })

    expect(workspace).toMatchObject({
      accounts: [],
      activeAccountId: null,
      activeFolderId: null,
      messages: [],
      selectedMessage: null
    })
    expect(webmailTestState.listUsers).not.toHaveBeenCalled()
    expect(webmailTestState.listMailboxes).not.toHaveBeenCalled()
    expect(webmailTestState.listMessages).not.toHaveBeenCalled()
  }, 15_000)

  it('loads explicitly granted user-session mailboxes without domain-wide WildDuck enumeration', async () => {
    expect.hasAssertions()
    webmailTestState.memberFindOne.mockReturnValue({
      exec: () => Promise.resolve({ id: 'member-1', role: 'member' })
    })
    webmailTestState.agentMailMailboxGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            capability: 'readMailbox',
            expiresAt: null,
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1',
            principalId: 'user-1',
            principalType: 'user_session',
            status: 'active'
          }
        ])
    })

    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')
    const workspace = await getAgentMailWorkspaceForWeb({
      headers: new Headers(),
      input: {}
    })

    expect(workspace.accounts).toStrictEqual([
      {
        address: 'support@example.test',
        description: 'WildDuck mailbox for example.test',
        id: 'support@example.test',
        name: 'support',
        state: 'ready'
      }
    ])
    expect(webmailTestState.listUsers).not.toHaveBeenCalled()
    expect(webmailTestState.resolveAddress).toHaveBeenCalledWith('support@example.test')
    expect(webmailTestState.listMailboxes).toHaveBeenCalledWith('wildduck-user-1')
  }, 15_000)

  it('does not let caller-selected same-domain accounts widen address-scoped mailbox grants', async () => {
    expect.hasAssertions()
    webmailTestState.memberFindOne.mockReturnValue({
      exec: () => Promise.resolve({ id: 'member-1', role: 'member' })
    })
    webmailTestState.agentMailMailboxGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            capability: 'readMailbox',
            expiresAt: null,
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1',
            principalId: 'user-1',
            principalType: 'user_session',
            status: 'active'
          }
        ])
    })

    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')
    const workspace = await getAgentMailWorkspaceForWeb({
      headers: new Headers(),
      input: {
        accountId: 'billing@example.test'
      }
    })

    expect(workspace).toMatchObject({
      accounts: [
        {
          address: 'support@example.test',
          id: 'support@example.test'
        }
      ],
      activeAccountId: 'support@example.test',
      activeFolderId: null,
      messages: [],
      selectedMessage: null
    })
    expect(webmailTestState.listUsers).not.toHaveBeenCalled()
    expect(webmailTestState.resolveAddress).not.toHaveBeenCalled()
    expect(webmailTestState.listMailboxes).not.toHaveBeenCalled()
    expect(webmailTestState.listMessages).not.toHaveBeenCalled()
  }, 15_000)

  it('does not expose same-WildDuck-user alias messages through an address-scoped mailbox grant', async () => {
    expect.hasAssertions()
    webmailTestState.memberFindOne.mockReturnValue({
      exec: () => Promise.resolve({ id: 'member-1', role: 'member' })
    })
    webmailTestState.agentMailMailboxGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            capability: 'readMailbox',
            expiresAt: null,
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1',
            principalId: 'user-1',
            principalType: 'user_session',
            status: 'active'
          }
        ])
    })
    webmailTestState.listMessages.mockResolvedValueOnce({
      nextCursor: false,
      previousCursor: false,
      results: [
        {
          date: '2026-06-22T11:00:00.000Z',
          from: { address: 'support@example.test' },
          id: 12,
          mailbox: 'inbox-id',
          seen: false,
          subject: 'Billing',
          text: 'Billing only',
          to: [{ address: 'billing@example.test' }]
        },
        {
          date: '2026-06-22T12:00:00.000Z',
          from: { address: 'customer@example.net' },
          id: 13,
          mailbox: 'inbox-id',
          seen: false,
          subject: 'Support',
          text: 'Support only',
          to: [{ address: 'support@example.test' }]
        }
      ],
      total: 2
    })
    webmailTestState.getMessage.mockImplementation(
      (_userId: string, _mailboxId: string, messageId: string | number) =>
        Promise.resolve({
          date: '2026-06-22T12:00:00.000Z',
          from: {
            address: messageId.toString() === '13' ? 'customer@example.net' : 'support@example.test'
          },
          id: Number(messageId),
          mailbox: 'inbox-id',
          seen: false,
          subject: messageId.toString() === '13' ? 'Support' : 'Billing',
          text: messageId.toString() === '13' ? 'Support only' : 'Billing only',
          to: [{ address: messageId.toString() === '13' ? 'support@example.test' : 'billing@example.test' }]
        })
    )

    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')
    const workspace = await getAgentMailWorkspaceForWeb({
      headers: new Headers(),
      input: {}
    })

    expect(workspace.accounts.map((account) => account.id)).toStrictEqual(['support@example.test'])
    expect(workspace.messages.map((message) => message.id)).toStrictEqual(['13'])
    expect(workspace.messages[0]?.subject).toBe('Support')
    expect(workspace.selectedMessage?.id).toBe('13')
    expect(JSON.stringify(workspace)).not.toContain('Billing only')
    expect(workspace.pagination.total).toBeNull()
    expect(webmailTestState.getMessage).toHaveBeenCalledWith('wildduck-user-1', 'inbox-id', '13')
    expect(webmailTestState.getMessage).not.toHaveBeenCalledWith('wildduck-user-1', 'inbox-id', '12')
  }, 15_000)

  it('loads enrolled Agent Auth mailbox grants through scoped webmail workspace access', async () => {
    expect.hasAssertions()
    configureAgentSession([
      {
        capability: 'readMailbox',
        expiresAt: null,
        mailboxAddress: 'support@example.test',
        organizationId: 'org-1',
        principalId: 'agent-1',
        principalType: 'agent',
        status: 'active'
      }
    ])

    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')
    const workspace = await getAgentMailWorkspaceForWeb({
      headers: new Headers(),
      input: {}
    })

    expect(workspace.accounts).toStrictEqual([
      {
        address: 'support@example.test',
        description: 'WildDuck mailbox for example.test',
        id: 'support@example.test',
        name: 'support',
        state: 'ready'
      }
    ])
    expect(webmailTestState.agentFindById).toHaveBeenCalledWith('agent-1')
    expect(webmailTestState.agentHostFindById).toHaveBeenCalledWith('agent-host-1')
    expect(webmailTestState.agentMailMailboxGrantFind).toHaveBeenCalledWith({
      principalId: 'agent-1',
      principalType: 'agent'
    })
    expect(webmailTestState.agentMailSystemGrantFind).toHaveBeenCalledWith({
      principalId: 'agent-1',
      principalType: 'agent'
    })
    expect(webmailTestState.agentCapabilityGrantFind).toHaveBeenCalledWith({ agentId: 'agent-1' })
    expect(webmailTestState.listUsers).not.toHaveBeenCalled()
    expect(webmailTestState.resolveAddress).toHaveBeenCalledWith('support@example.test')
    expect(webmailTestState.listMailboxes).toHaveBeenCalledWith('wildduck-user-1')
  }, 15_000)

  it('does not use inactive mailbox or system grants for user-session WildDuck access', async () => {
    expect.hasAssertions()
    webmailTestState.memberFindOne.mockReturnValue({
      exec: () => Promise.resolve({ id: 'member-1', role: 'member' })
    })
    const inactiveCases = [
      {
        mailboxGrants: [
          {
            capability: 'readMailbox',
            expiresAt: null,
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1',
            principalId: 'user-1',
            principalType: 'user_session',
            status: 'revoked'
          }
        ],
        name: 'revoked mailbox grant',
        systemGrants: []
      },
      {
        mailboxGrants: [
          {
            capability: 'readMailbox',
            expiresAt: new Date('2020-01-01T00:00:00.000Z'),
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1',
            principalId: 'user-1',
            principalType: 'user_session',
            status: 'active'
          }
        ],
        name: 'expired mailbox grant',
        systemGrants: []
      },
      {
        mailboxGrants: [],
        name: 'revoked system grant',
        systemGrants: [
          {
            constraints: null,
            expiresAt: null,
            organizationId: 'org-1',
            permission: 'readAllMailboxes',
            principalId: 'user-1',
            principalType: 'user_session',
            status: 'revoked'
          }
        ]
      },
      {
        mailboxGrants: [],
        name: 'expired system grant',
        systemGrants: [
          {
            constraints: null,
            expiresAt: new Date('2020-01-01T00:00:00.000Z'),
            organizationId: 'org-1',
            permission: 'readAllMailboxes',
            principalId: 'user-1',
            principalType: 'user_session',
            status: 'active'
          }
        ]
      }
    ] as const
    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')

    for (const testCase of inactiveCases) {
      webmailTestState.agentMailMailboxGrantFind.mockReturnValue({
        exec: () => Promise.resolve(testCase.mailboxGrants)
      })
      webmailTestState.agentMailSystemGrantFind.mockReturnValue({
        exec: () => Promise.resolve(testCase.systemGrants)
      })
      webmailTestState.listUsers.mockClear()
      webmailTestState.resolveAddress.mockClear()
      webmailTestState.listMailboxes.mockClear()

      await expect(
        getAgentMailWorkspaceForWeb({
          headers: new Headers(),
          input: {}
        }),
        testCase.name
      ).resolves.toMatchObject({
        accounts: [],
        activeAccountId: null,
        folders: [],
        messages: []
      })
      expect(webmailTestState.listUsers, testCase.name).not.toHaveBeenCalled()
      expect(webmailTestState.resolveAddress, testCase.name).not.toHaveBeenCalled()
      expect(webmailTestState.listMailboxes, testCase.name).not.toHaveBeenCalled()
    }
  }, 15_000)

  it('exposes active Agent Auth capability names on resolved mail principals', async () => {
    expect.hasAssertions()
    configureAgentSession(
      [],
      [
        {
          agentId: 'agent-1',
          capability: 'email.message.create_draft',
          constraints: {
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1'
          },
          expiresAt: null,
          status: 'active'
        },
        {
          agentId: 'agent-1',
          capability: 'email.message.send',
          constraints: {
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1'
          },
          expiresAt: new Date('2020-01-01T00:00:00.000Z'),
          status: 'active'
        },
        {
          agentId: 'agent-1',
          capability: 'email.message.manage',
          constraints: {
            mailboxAddress: 'intruder@other.test',
            organizationId: 'org-2'
          },
          expiresAt: null,
          status: 'active'
        }
      ]
    )

    const { requireAgentMailOrganizationContext } = await import('./service')
    const context = await requireAgentMailOrganizationContext(
      new Headers({ 'x-agentteam-organization-id': 'org-1' })
    )

    expect(context.organizationId).toBe('org-1')
    expect(context.principal).toMatchObject({
      capabilities: ['email.message.create_draft'],
      principalId: 'agent-1',
      principalType: 'agent'
    })
    expect(webmailTestState.createWildDuckClient).not.toHaveBeenCalled()
  }, 15_000)

  it('does not use inactive Agent Auth capability grants for WildDuck access', async () => {
    expect.hasAssertions()
    const inactiveCases = [
      {
        expiresAt: null,
        name: 'revoked capability grant',
        status: 'revoked'
      },
      {
        expiresAt: new Date('2020-01-01T00:00:00.000Z'),
        name: 'expired capability grant',
        status: 'active'
      }
    ] as const
    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')

    for (const testCase of inactiveCases) {
      configureAgentSession(
        [],
        [
          {
            agentId: 'agent-1',
            capability: 'email.message.list',
            constraints: {
              mailboxAddress: 'support@example.test',
              organizationId: 'org-1'
            },
            expiresAt: testCase.expiresAt,
            status: testCase.status
          }
        ]
      )
      webmailTestState.createWildDuckClient.mockClear()
      webmailTestState.listUsers.mockClear()
      webmailTestState.resolveAddress.mockClear()
      webmailTestState.listMailboxes.mockClear()

      await expect(
        getAgentMailWorkspaceForWeb({
          headers: new Headers(),
          input: {}
        }),
        testCase.name
      ).rejects.toMatchObject({
        message: 'A granted organization is required',
        status: 403
      })
      expect(webmailTestState.createWildDuckClient, testCase.name).not.toHaveBeenCalled()
      expect(webmailTestState.listUsers, testCase.name).not.toHaveBeenCalled()
      expect(webmailTestState.resolveAddress, testCase.name).not.toHaveBeenCalled()
      expect(webmailTestState.listMailboxes, testCase.name).not.toHaveBeenCalled()
    }
  }, 15_000)

  it('loads Better Auth adapter capability grants when agentId is stored as a native string field', async () => {
    expect.hasAssertions()
    configureAgentSession([], [])
    webmailTestState.agentCapabilityGrantCollectionFind.mockReturnValue({
      toArray: () =>
        Promise.resolve([
          {
            _id: 'grant-list-1',
            agentId: 'agent-1',
            capability: 'email.message.list',
            constraints: JSON.stringify({
              mailboxAddress: 'support@example.test',
              organizationId: 'org-1'
            }),
            expiresAt: null,
            status: 'active'
          },
          {
            _id: 'grant-read-1',
            agentId: 'agent-1',
            capability: 'email.message.read',
            constraints: JSON.stringify({
              mailboxAddress: 'support@example.test',
              organizationId: 'org-1'
            }),
            expiresAt: null,
            status: 'active'
          },
          {
            _id: 'grant-search-1',
            agentId: 'agent-1',
            capability: 'email.message.search',
            constraints: JSON.stringify({
              mailboxAddress: 'support@example.test',
              organizationId: 'org-1'
            }),
            expiresAt: null,
            status: 'active'
          }
        ])
    })

    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')
    const workspace = await getAgentMailWorkspaceForWeb({
      headers: new Headers(),
      input: {}
    })

    expect(workspace.accounts.map((account) => account.id)).toStrictEqual(['support@example.test'])
    expect(workspace.activeAccountId).toBe('support@example.test')
    expect(webmailTestState.agentCapabilityGrantFind).toHaveBeenCalledWith({ agentId: 'agent-1' })
    expect(webmailTestState.agentCapabilityGrantCollectionFind).toHaveBeenCalledWith({
      agentId: {
        $in: expect.arrayContaining(['agent-1'])
      }
    })
    expect(webmailTestState.resolveAddress).toHaveBeenCalledWith('support@example.test')
  }, 15_000)

  it('resolves exact resource-bound Agent Auth JWTs before mailbox CASL checks', async () => {
    expect.hasAssertions()
    const requestUrl = 'https://mail.example.com/rpc/mail/accounts/support%40example.test/messages'
    const payload = {
      aud: 'https://mail.example.com',
      exp: Math.floor(Date.now() / 1000) + 60,
      htm: 'POST',
      htu: requestUrl,
      iat: Math.floor(Date.now() / 1000),
      iss: 'agent-host-1',
      jti: 'resource-bound-jti-1',
      sub: 'agent-1'
    }
    webmailTestState.authGetSession.mockResolvedValue(null)
    webmailTestState.authGetAgentSession.mockRejectedValue(
      new Error('Better Auth agent session endpoint should not be used for resource-bound mail JWTs')
    )
    webmailTestState.decodeProtectedHeader.mockReturnValue({ typ: 'agent+jwt' })
    webmailTestState.decodeJwt.mockReturnValue(payload)
    webmailTestState.jwtVerify.mockResolvedValue({ payload })
    webmailTestState.agentFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: 'agent-1',
          expiresAt: null,
          hostId: 'agent-host-1',
          publicKey: JSON.stringify({ crv: 'Ed25519', kty: 'OKP', x: 'public-key' }),
          status: 'active',
          userId: 'user-1'
        })
    })
    webmailTestState.agentMailMailboxGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            capability: 'sendAs',
            expiresAt: null,
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1',
            principalId: 'agent-1',
            principalType: 'agent',
            status: 'active'
          }
        ])
    })
    webmailTestState.submitMessage.mockResolvedValue({ success: true })

    const { sendAgentMailMessageForWeb } = await import('./webmail-service')
    await expect(
      sendAgentMailMessageForWeb({
        headers: new Headers({
          authorization: 'Bearer resource-bound-agent-jwt',
          'x-agentteam-request-method': 'POST',
          'x-agentteam-request-url': requestUrl
        }),
        input: {
          accountId: 'support@example.test',
          body: 'Boundary delivery fixture.',
          subject: 'Resource bound send',
          to: 'Recipient <recipient@example.net>'
        }
      })
    ).resolves.toStrictEqual({ success: true })

    expect(webmailTestState.authGetAgentSession).not.toHaveBeenCalled()
    expect(webmailTestState.importJWK).toHaveBeenCalledWith(
      { crv: 'Ed25519', kty: 'OKP', x: 'public-key' },
      'EdDSA'
    )
    expect(webmailTestState.jwtVerify).toHaveBeenCalledWith(
      'resource-bound-agent-jwt',
      'agent-verification-key',
      expect.objectContaining({
        audience: 'https://mail.example.com',
        issuer: 'agent-host-1',
        subject: 'agent-1'
      })
    )
    expect(webmailTestState.agentJwtReplayCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'agent-1',
        expiresAt: expect.any(Date),
        jtiHash: expect.any(String),
        replayKey: expect.any(String)
      })
    )
    expect(webmailTestState.agentUpdateOne).toHaveBeenCalledWith(
      { _id: 'agent-1' },
      {
        $set: {
          lastUsedAt: expect.any(Date),
          updatedAt: expect.any(Date)
        }
      }
    )
    expect(webmailTestState.agentHostUpdateOne).toHaveBeenCalledWith(
      { _id: 'agent-host-1' },
      {
        $set: {
          lastUsedAt: expect.any(Date),
          updatedAt: expect.any(Date)
        }
      }
    )
    expect(webmailTestState.submitMessage).toHaveBeenCalledWith(
      'wildduck-user-1',
      expect.objectContaining({
        from: { address: 'support@example.test' },
        subject: 'Resource bound send'
      })
    )
  })

  it('does not fall back to browser sessions when a resource-bound Agent Auth JWT is present', async () => {
    expect.hasAssertions()
    const { headers } = configureResourceBoundAgentJWT({
      mailboxGrants: [sendAsGrant()],
      payload: {
        jti: 'agent-jwt-with-browser-session-jti'
      }
    })
    webmailTestState.authGetSession.mockResolvedValue({
      session: {
        activeOrganizationId: 'org-1',
        id: 'session-1'
      },
      user: {
        id: 'user-1'
      }
    })

    const { sendAgentMailMessageForWeb } = await import('./webmail-service')

    await expect(
      sendAgentMailMessageForWeb({
        headers,
        input: sendMessageInput()
      })
    ).resolves.toStrictEqual({ success: true })
    expect(webmailTestState.authGetSession).not.toHaveBeenCalled()
    expect(webmailTestState.submitMessage).toHaveBeenCalledWith(
      'wildduck-user-1',
      expect.objectContaining({
        from: { address: 'support@example.test' },
        subject: 'Resource bound send'
      })
    )
  })

  it('rejects invalid resource-bound Agent Auth JWTs instead of using a browser session fallback', async () => {
    expect.hasAssertions()
    const { headers } = configureResourceBoundAgentJWT({
      mailboxGrants: [sendAsGrant()],
      payload: {
        jti: 'invalid-agent-jwt-with-browser-session-jti'
      },
      verifyRejects: true
    })
    webmailTestState.authGetSession.mockResolvedValue({
      session: {
        activeOrganizationId: 'org-1',
        id: 'session-1'
      },
      user: {
        id: 'user-1'
      }
    })

    const { sendAgentMailMessageForWeb } = await import('./webmail-service')

    await expect(
      sendAgentMailMessageForWeb({
        headers,
        input: sendMessageInput()
      })
    ).rejects.toMatchObject({
      message: 'Authentication required',
      status: 401
    })
    expect(webmailTestState.authGetSession).not.toHaveBeenCalled()
    expect(webmailTestState.createWildDuckClient).not.toHaveBeenCalled()
    expect(webmailTestState.agentUpdateOne).not.toHaveBeenCalled()
    expect(webmailTestState.agentHostUpdateOne).not.toHaveBeenCalled()
    expect(webmailTestState.submitMessage).not.toHaveBeenCalled()
  })

  it('rejects invalid resource-bound Agent Auth JWTs before grant lookup or WildDuck access', async () => {
    expect.hasAssertions()
    const { headers } = configureResourceBoundAgentJWT({
      mailboxGrants: [sendAsGrant()],
      payload: {
        jti: 'invalid-signature-jti'
      },
      verifyRejects: true
    })

    const { sendAgentMailMessageForWeb } = await import('./webmail-service')

    await expect(
      sendAgentMailMessageForWeb({
        headers,
        input: sendMessageInput()
      })
    ).rejects.toMatchObject({
      message: 'Authentication required',
      status: 401
    })
    expect(webmailTestState.agentMailMailboxGrantFind).not.toHaveBeenCalled()
    expect(webmailTestState.agentJwtReplayCreate).not.toHaveBeenCalled()
    expect(webmailTestState.agentUpdateOne).not.toHaveBeenCalled()
    expect(webmailTestState.agentHostUpdateOne).not.toHaveBeenCalled()
    expect(webmailTestState.createWildDuckClient).not.toHaveBeenCalled()
    expect(webmailTestState.submitMessage).not.toHaveBeenCalled()
  })

  it('rejects unknown resource-bound Agent Auth JWT agents as authentication failures', async () => {
    expect.hasAssertions()
    const { headers } = configureResourceBoundAgentJWT({
      mailboxGrants: [sendAsGrant()],
      payload: {
        jti: 'unknown-agent-jti',
        sub: 'unknown-agent'
      }
    })
    webmailTestState.agentFindById.mockReturnValue({
      exec: () => Promise.resolve(null)
    })

    const { sendAgentMailMessageForWeb } = await import('./webmail-service')

    await expect(
      sendAgentMailMessageForWeb({
        headers,
        input: sendMessageInput()
      })
    ).rejects.toMatchObject({
      message: 'Authentication required',
      status: 401
    })
    expect(webmailTestState.jwtVerify).not.toHaveBeenCalled()
    expect(webmailTestState.agentMailMailboxGrantFind).not.toHaveBeenCalled()
    expect(webmailTestState.agentJwtReplayCreate).not.toHaveBeenCalled()
    expect(webmailTestState.createWildDuckClient).not.toHaveBeenCalled()
  })

  it('rejects inactive or expired resource-bound Agent Auth records before grant lookup or WildDuck access', async () => {
    expect.hasAssertions()
    const cases = [
      {
        name: 'inactive agent',
        configure: () => {
          webmailTestState.agentFindById.mockReturnValue({
            exec: () =>
              Promise.resolve({
                _id: 'agent-1',
                expiresAt: null,
                hostId: 'agent-host-1',
                publicKey: JSON.stringify({ crv: 'Ed25519', kty: 'OKP', x: 'public-key' }),
                status: 'revoked',
                userId: 'user-1'
              })
          })
        },
        message: 'Agent access is not active'
      },
      {
        name: 'expired agent',
        configure: () => {
          webmailTestState.agentFindById.mockReturnValue({
            exec: () =>
              Promise.resolve({
                _id: 'agent-1',
                expiresAt: new Date('2026-06-21T00:00:00.000Z'),
                hostId: 'agent-host-1',
                publicKey: JSON.stringify({ crv: 'Ed25519', kty: 'OKP', x: 'public-key' }),
                status: 'active',
                userId: 'user-1'
              })
          })
        },
        message: 'Agent access is not active'
      },
      {
        name: 'inactive host',
        configure: () => {
          webmailTestState.agentHostFindById.mockReturnValue({
            exec: () =>
              Promise.resolve({
                _id: 'agent-host-1',
                expiresAt: null,
                status: 'pending_enrollment'
              })
          })
        },
        message: 'Agent host access is not active'
      },
      {
        name: 'expired host',
        configure: () => {
          webmailTestState.agentHostFindById.mockReturnValue({
            exec: () =>
              Promise.resolve({
                _id: 'agent-host-1',
                expiresAt: new Date('2026-06-21T00:00:00.000Z'),
                status: 'active'
              })
          })
        },
        message: 'Agent host access is not active'
      }
    ] as const
    const { sendAgentMailMessageForWeb } = await import('./webmail-service')

    for (const testCase of cases) {
      vi.clearAllMocks()
      webmailTestState.agentHostFindById.mockReturnValue({
        exec: () =>
          Promise.resolve({
            _id: 'agent-host-1',
            expiresAt: null,
            status: 'active'
          })
      })
      const { headers } = configureResourceBoundAgentJWT({
        mailboxGrants: [sendAsGrant()],
        payload: {
          jti: `${testCase.name.replaceAll(' ', '-')}-resource-bound-jti`
        }
      })
      testCase.configure()

      await expect(
        sendAgentMailMessageForWeb({
          headers,
          input: sendMessageInput()
        }),
        testCase.name
      ).rejects.toMatchObject({
        message: testCase.message,
        status: 401
      })
      expect(webmailTestState.agentMailMailboxGrantFind, testCase.name).not.toHaveBeenCalled()
      expect(webmailTestState.agentCapabilityGrantFind, testCase.name).not.toHaveBeenCalled()
      expect(webmailTestState.agentUpdateOne, testCase.name).not.toHaveBeenCalled()
      expect(webmailTestState.agentHostUpdateOne, testCase.name).not.toHaveBeenCalled()
      expect(webmailTestState.createWildDuckClient, testCase.name).not.toHaveBeenCalled()
      expect(webmailTestState.submitMessage, testCase.name).not.toHaveBeenCalled()
    }
  })

  it('rejects resource-bound Agent Auth JWTs that are not bound to both request method and URL', async () => {
    expect.hasAssertions()
    const { sendAgentMailMessageForWeb } = await import('./webmail-service')
    const cases = [
      {
        name: 'missing method',
        payload: { htm: undefined, jti: 'missing-method-jti' }
      },
      {
        name: 'missing URL',
        payload: { htu: undefined, jti: 'missing-url-jti' }
      },
      {
        name: 'wrong method',
        payload: { htm: 'GET', jti: 'wrong-method-jti' }
      },
      {
        name: 'wrong URL',
        payload: {
          htu: 'https://mail.example.com/rpc/mail/accounts/support%40example.test/messages?different=true',
          jti: 'wrong-url-jti'
        }
      },
      {
        name: 'body hash binding is not supported yet',
        payload: { ath: 'unsupported-body-hash', jti: 'unsupported-body-hash-jti' }
      }
    ] as const

    for (const testCase of cases) {
      webmailTestState.createWildDuckClient.mockClear()
      webmailTestState.submitMessage.mockClear()
      const { headers } = configureResourceBoundAgentJWT({
        mailboxGrants: [sendAsGrant()],
        payload: testCase.payload
      })

      await expect(
        sendAgentMailMessageForWeb({
          headers,
          input: sendMessageInput()
        }),
        testCase.name
      ).rejects.toMatchObject({
        message: 'Authentication required',
        status: 401
      })
      expect(webmailTestState.createWildDuckClient, testCase.name).not.toHaveBeenCalled()
      expect(webmailTestState.submitMessage, testCase.name).not.toHaveBeenCalled()
    }
  })

  it('rejects replayed resource-bound Agent Auth JWTs before repeated WildDuck access', async () => {
    expect.hasAssertions()
    const { headers } = configureResourceBoundAgentJWT({
      mailboxGrants: [sendAsGrant()],
      payload: {
        jti: 'replayed-resource-bound-jti'
      }
    })
    const { sendAgentMailMessageForWeb } = await import('./webmail-service')
    webmailTestState.agentJwtReplayCreate.mockResolvedValueOnce({}).mockRejectedValueOnce({ code: 11000 })

    await expect(
      sendAgentMailMessageForWeb({
        headers,
        input: sendMessageInput()
      })
    ).resolves.toStrictEqual({ success: true })

    webmailTestState.createWildDuckClient.mockClear()
    webmailTestState.submitMessage.mockClear()

    await expect(
      sendAgentMailMessageForWeb({
        headers,
        input: sendMessageInput()
      })
    ).rejects.toMatchObject({
      message: 'Authentication required',
      status: 401
    })
    expect(webmailTestState.createWildDuckClient).not.toHaveBeenCalled()
    expect(webmailTestState.submitMessage).not.toHaveBeenCalled()
  })

  it('rejects valid resource-bound Agent Auth JWTs without persisted mail grants as authorization failures', async () => {
    expect.hasAssertions()
    const { headers } = configureResourceBoundAgentJWT({
      payload: {
        jti: 'valid-jwt-without-grants-jti'
      }
    })
    const { sendAgentMailMessageForWeb } = await import('./webmail-service')

    await expect(
      sendAgentMailMessageForWeb({
        headers,
        input: sendMessageInput()
      })
    ).rejects.toMatchObject({
      message: 'A granted organization is required',
      status: 403
    })
    expect(webmailTestState.jwtVerify).toHaveBeenCalled()
    expect(webmailTestState.createWildDuckClient).not.toHaveBeenCalled()
    expect(webmailTestState.submitMessage).not.toHaveBeenCalled()
  })

  it('rejects disabled WildDuck accounts before mailbox operations even when grants allow the mailbox', async () => {
    expect.hasAssertions()
    webmailTestState.memberFindOne.mockReturnValue({
      exec: () => Promise.resolve({ id: 'member-1', role: 'member' })
    })
    webmailTestState.agentMailMailboxGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            capability: 'readMailbox',
            expiresAt: null,
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1',
            principalId: 'user-1',
            principalType: 'user_session',
            status: 'active'
          }
        ])
    })
    webmailTestState.getUser.mockResolvedValue({
      address: 'support@example.test',
      disabled: true,
      id: 'wildduck-user-1',
      name: 'Support'
    })

    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')

    await expect(
      getAgentMailWorkspaceForWeb({
        headers: new Headers(),
        input: {}
      })
    ).rejects.toMatchObject({
      message: 'Mailbox account is disabled',
      status: 403
    })
    expect(webmailTestState.resolveAddress).toHaveBeenCalledWith('support@example.test')
    expect(webmailTestState.getUser).toHaveBeenCalledWith('wildduck-user-1')
    expect(webmailTestState.listMailboxes).not.toHaveBeenCalled()
  }, 15_000)

  it('does not treat unsupported mailbox grant constraints as mailbox authority', async () => {
    expect.hasAssertions()
    webmailTestState.memberFindOne.mockReturnValue({
      exec: () => Promise.resolve({ id: 'member-1', role: 'member' })
    })
    webmailTestState.agentMailMailboxGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            capability: 'readMailbox',
            constraints: {
              allowedRecipientDomain: 'example.net'
            },
            expiresAt: null,
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1',
            principalId: 'user-1',
            principalType: 'user_session',
            status: 'active'
          }
        ])
    })

    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')
    const workspace = await getAgentMailWorkspaceForWeb({
      headers: new Headers(),
      input: {}
    })

    expect(workspace).toMatchObject({
      accounts: [],
      activeAccountId: null,
      activeFolderId: null,
      messages: [],
      selectedMessage: null
    })
    expect(webmailTestState.listUsers).not.toHaveBeenCalled()
    expect(webmailTestState.resolveAddress).not.toHaveBeenCalled()
    expect(webmailTestState.listMailboxes).not.toHaveBeenCalled()
  }, 15_000)

  it('does not treat unsupported system grant constraints as organization-wide mailbox authority', async () => {
    expect.hasAssertions()
    webmailTestState.memberFindOne.mockReturnValue({
      exec: () => Promise.resolve({ id: 'member-1', role: 'member' })
    })
    webmailTestState.agentMailSystemGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            constraints: {
              mailboxLimit: 10
            },
            expiresAt: null,
            organizationId: 'org-1',
            permission: 'readAllMailboxes',
            principalId: 'user-1',
            principalType: 'user_session',
            status: 'active'
          }
        ])
    })

    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')
    const workspace = await getAgentMailWorkspaceForWeb({
      headers: new Headers(),
      input: {}
    })

    expect(workspace).toMatchObject({
      accounts: [],
      activeAccountId: null,
      activeFolderId: null,
      messages: [],
      selectedMessage: null
    })
    expect(webmailTestState.listUsers).not.toHaveBeenCalled()
    expect(webmailTestState.resolveAddress).not.toHaveBeenCalled()
    expect(webmailTestState.listMailboxes).not.toHaveBeenCalled()
  }, 15_000)

  it('does not hydrate message bodies for list-only Agent Auth capability grants', async () => {
    expect.hasAssertions()
    configureAgentSession(
      [],
      [
        {
          agentId: 'agent-1',
          capability: 'email.message.list',
          constraints: {
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1'
          },
          expiresAt: null,
          status: 'active'
        }
      ]
    )

    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')
    const workspace = await getAgentMailWorkspaceForWeb({
      headers: new Headers(),
      input: {}
    })

    expect(workspace.messages).toHaveLength(1)
    expect(workspace.selectedMessage).toBeNull()
    expect(webmailTestState.listMessages).toHaveBeenCalledOnce()
    expect(webmailTestState.getMessage).not.toHaveBeenCalled()
    expect(webmailTestState.searchMessages).not.toHaveBeenCalled()
  })

  it('does not hydrate message bodies or threads for search-only Agent Auth capability grants', async () => {
    expect.hasAssertions()
    configureAgentSession(
      [],
      [
        {
          agentId: 'agent-1',
          capability: 'email.message.search',
          constraints: {
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1'
          },
          expiresAt: null,
          status: 'active'
        }
      ]
    )
    webmailTestState.searchMessages.mockResolvedValue({
      nextCursor: false,
      previousCursor: false,
      results: [
        {
          date: '2026-06-22T12:00:00.000Z',
          from: {
            address: 'sender@example.net',
            name: 'Sender'
          },
          id: 12,
          mailbox: 'inbox-id',
          subject: 'Hello',
          thread: '64b7f6f7f6f7f6f7f6f7f6f7',
          to: [
            {
              address: 'support@example.test',
              name: 'Support'
            }
          ]
        }
      ],
      total: 1
    })

    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')
    const workspace = await getAgentMailWorkspaceForWeb({
      headers: new Headers(),
      input: {
        messageId: '12',
        query: 'hello'
      }
    })

    expect(workspace.messages).toHaveLength(1)
    expect(workspace.selectedMessage).toBeNull()
    expect(webmailTestState.searchMessages).toHaveBeenCalledOnce()
    expect(webmailTestState.getMessage).not.toHaveBeenCalled()
  })

  it('rejects outbound control sends before domain lookup when send authority is missing', async () => {
    expect.hasAssertions()
    webmailTestState.memberFindOne.mockReturnValue({
      exec: () => Promise.resolve({ id: 'member-1', role: 'member' })
    })

    const { submitAgentMailOutboundFromWeb } = await import('./service')

    await expect(
      submitAgentMailOutboundFromWeb({
        headers: new Headers(),
        input: {
          from: 'support@example.test',
          subject: 'Denied',
          text: 'Denied',
          to: ['recipient@example.net']
        }
      })
    ).rejects.toMatchObject({
      message: 'Mailbox send is not authorized',
      status: 403
    })
    expect(webmailTestState.cloudflareConnectionFind).not.toHaveBeenCalled()
    expect(webmailTestState.submitAgentMailSend).not.toHaveBeenCalled()
  })

  it('rejects inactive Agent Auth agents before loading grants or WildDuck data', async () => {
    expect.hasAssertions()
    configureAgentSession([
      {
        capability: 'readMailbox',
        expiresAt: null,
        mailboxAddress: 'support@example.test',
        organizationId: 'org-1',
        principalId: 'agent-1',
        principalType: 'agent',
        status: 'active'
      }
    ])
    webmailTestState.agentFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: 'agent-1',
          expiresAt: null,
          hostId: 'agent-host-1',
          status: 'revoked'
        })
    })
    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')

    await expect(
      getAgentMailWorkspaceForWeb({
        headers: new Headers(),
        input: {}
      })
    ).rejects.toMatchObject({
      message: 'Agent access is not active',
      status: 401
    })
    expect(webmailTestState.agentMailMailboxGrantFind).not.toHaveBeenCalled()
    expect(webmailTestState.agentCapabilityGrantFind).not.toHaveBeenCalled()
    expect(webmailTestState.createWildDuckClient).not.toHaveBeenCalled()
  })

  it('rejects expired Agent Auth agents before loading grants or WildDuck data', async () => {
    expect.hasAssertions()
    configureAgentSession([
      {
        capability: 'readMailbox',
        expiresAt: null,
        mailboxAddress: 'support@example.test',
        organizationId: 'org-1',
        principalId: 'agent-1',
        principalType: 'agent',
        status: 'active'
      }
    ])
    webmailTestState.agentFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: 'agent-1',
          expiresAt: new Date('2026-06-21T00:00:00.000Z'),
          hostId: 'agent-host-1',
          status: 'active'
        })
    })
    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')

    await expect(
      getAgentMailWorkspaceForWeb({
        headers: new Headers(),
        input: {}
      })
    ).rejects.toMatchObject({
      message: 'Agent access is not active',
      status: 401
    })
    expect(webmailTestState.agentMailMailboxGrantFind).not.toHaveBeenCalled()
    expect(webmailTestState.agentCapabilityGrantFind).not.toHaveBeenCalled()
    expect(webmailTestState.createWildDuckClient).not.toHaveBeenCalled()
  })

  it('rejects inactive Agent Auth hosts before loading grants or WildDuck data', async () => {
    expect.hasAssertions()
    configureAgentSession([
      {
        capability: 'readMailbox',
        expiresAt: null,
        mailboxAddress: 'support@example.test',
        organizationId: 'org-1',
        principalId: 'agent-1',
        principalType: 'agent',
        status: 'active'
      }
    ])
    webmailTestState.agentHostFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: 'agent-host-1',
          expiresAt: null,
          status: 'pending_enrollment'
        })
    })
    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')

    await expect(
      getAgentMailWorkspaceForWeb({
        headers: new Headers(),
        input: {}
      })
    ).rejects.toMatchObject({
      message: 'Agent host access is not active',
      status: 401
    })
    expect(webmailTestState.agentMailMailboxGrantFind).not.toHaveBeenCalled()
    expect(webmailTestState.agentCapabilityGrantFind).not.toHaveBeenCalled()
    expect(webmailTestState.createWildDuckClient).not.toHaveBeenCalled()
  })

  it('rejects expired Agent Auth hosts before loading grants or WildDuck data', async () => {
    expect.hasAssertions()
    configureAgentSession([
      {
        capability: 'readMailbox',
        expiresAt: null,
        mailboxAddress: 'support@example.test',
        organizationId: 'org-1',
        principalId: 'agent-1',
        principalType: 'agent',
        status: 'active'
      }
    ])
    webmailTestState.agentHostFindById.mockReturnValue({
      exec: () =>
        Promise.resolve({
          _id: 'agent-host-1',
          expiresAt: new Date('2026-06-21T00:00:00.000Z'),
          status: 'active'
        })
    })
    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')

    await expect(
      getAgentMailWorkspaceForWeb({
        headers: new Headers(),
        input: {}
      })
    ).rejects.toMatchObject({
      message: 'Agent host access is not active',
      status: 401
    })
    expect(webmailTestState.agentMailMailboxGrantFind).not.toHaveBeenCalled()
    expect(webmailTestState.agentCapabilityGrantFind).not.toHaveBeenCalled()
    expect(webmailTestState.createWildDuckClient).not.toHaveBeenCalled()
  })

  it('allows outbound control sends only through persisted user-session send grants', async () => {
    expect.hasAssertions()
    webmailTestState.memberFindOne.mockReturnValue({
      exec: () => Promise.resolve({ id: 'member-1', role: 'member' })
    })
    webmailTestState.agentMailMailboxGrantFind.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            capability: 'sendAs',
            expiresAt: null,
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1',
            principalId: 'user-1',
            principalType: 'user_session',
            status: 'active'
          }
        ])
    })
    webmailTestState.cloudflareConnectionFindOne.mockReturnValue({
      exec: () =>
        Promise.resolve({
          domain: 'example.test',
          status: 'active'
        })
    })

    const { submitAgentMailOutboundFromWeb } = await import('./service')

    await expect(
      submitAgentMailOutboundFromWeb({
        headers: new Headers(),
        input: {
          from: 'support@example.test',
          subject: 'Allowed',
          text: 'Allowed',
          to: ['recipient@example.net']
        }
      })
    ).resolves.toStrictEqual({ queued: true })
    expect(webmailTestState.submitAgentMailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'example.test',
        from: 'support@example.test',
        to: 'recipient@example.net'
      })
    )
  })

  it('rejects outbound control sends outside Agent Auth recipient constraints before control side effects', async () => {
    expect.hasAssertions()
    configureAgentSession(
      [],
      [
        {
          agentId: 'agent-1',
          capability: 'email.message.send',
          constraints: {
            allowedRecipientDomains: ['example.net'],
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1'
          },
          expiresAt: null,
          status: 'active'
        }
      ]
    )

    const { submitAgentMailOutboundFromWeb } = await import('./service')

    await expect(
      submitAgentMailOutboundFromWeb({
        headers: new Headers(),
        input: {
          from: 'support@example.test',
          subject: 'Denied',
          text: 'Denied',
          to: ['recipient@blocked.test']
        }
      })
    ).rejects.toMatchObject({
      message: 'Mailbox send is not authorized',
      status: 403
    })
    expect(webmailTestState.cloudflareConnectionFindOne).not.toHaveBeenCalled()
    expect(webmailTestState.submitAgentMailSend).not.toHaveBeenCalled()
  })

  it('consumes autonomous trial send quota before outbound control submission', async () => {
    expect.hasAssertions()
    configureAgentSession(
      [],
      [
        {
          agentId: 'agent-1',
          capability: 'email.message.send',
          constraints: {
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1'
          },
          expiresAt: null,
          status: 'active'
        }
      ]
    )
    configureAgentMailTrial()
    webmailTestState.cloudflareConnectionFindOne.mockReturnValue({
      exec: () =>
        Promise.resolve({
          domain: 'example.test',
          status: 'active'
        })
    })

    const { submitAgentMailOutboundFromWeb } = await import('./service')

    await expect(
      submitAgentMailOutboundFromWeb({
        headers: new Headers(),
        input: {
          from: 'support@example.test',
          subject: 'Trial control send',
          text: 'Trial control send',
          to: ['recipient@example.net']
        }
      })
    ).resolves.toStrictEqual({ queued: true })
    expect(webmailTestState.agentMailTrialUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'trial-1',
        dailySentCount: { $lt: 10 },
        totalSentCount: { $lt: 50 }
      }),
      expect.objectContaining({
        $inc: {
          dailySentCount: 1,
          totalSentCount: 1
        }
      })
    )
    expect(webmailTestState.submitAgentMailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'example.test',
        from: 'support@example.test',
        to: 'recipient@example.net'
      })
    )
  })

  it('rejects outbound control sends when autonomous trial quota is exhausted before control side effects', async () => {
    expect.hasAssertions()
    configureAgentSession(
      [],
      [
        {
          agentId: 'agent-1',
          capability: 'email.message.send',
          constraints: {
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1'
          },
          expiresAt: null,
          status: 'active'
        }
      ]
    )
    configureAgentMailTrial({
      totalSentCount: 50,
      totalSendLimit: 50
    })

    const { submitAgentMailOutboundFromWeb } = await import('./service')

    await expect(
      submitAgentMailOutboundFromWeb({
        headers: new Headers(),
        input: {
          from: 'support@example.test',
          subject: 'Trial control send',
          text: 'Trial control send',
          to: ['recipient@example.net']
        }
      })
    ).rejects.toMatchObject({
      message: 'Agent Mail trial send quota is exhausted',
      status: 403
    })
    expect(webmailTestState.agentMailTrialUpdateOne).not.toHaveBeenCalled()
    expect(webmailTestState.cloudflareConnectionFindOne).not.toHaveBeenCalled()
    expect(webmailTestState.submitAgentMailSend).not.toHaveBeenCalled()
  })

  it('uses WildDuck mailbox ids from search results when fetching selected message details and thread messages', async () => {
    expect.hasAssertions()
    const threadId = '64b112233445566778899001'
    webmailTestState.listMailboxes.mockResolvedValueOnce({
      results: [
        {
          id: 'inbox-id',
          name: 'Inbox',
          path: 'INBOX',
          specialUse: '\\Inbox'
        },
        {
          id: 'sent-id',
          name: 'Sent',
          path: 'Sent',
          specialUse: '\\Sent'
        }
      ]
    })
    const searchMessage = {
      date: '2026-06-22T12:05:00.000Z',
      from: {
        address: 'support@example.test',
        name: 'Support'
      },
      html: '<p>Sent reply</p>',
      id: 13,
      mailbox: 'sent-id',
      seen: true,
      subject: 'Re: Hello',
      text: 'Sent reply',
      thread: threadId,
      to: [
        {
          address: 'sender@example.net',
          name: 'Sender'
        }
      ]
    }
    webmailTestState.searchMessages
      .mockResolvedValueOnce({
        nextCursor: false,
        previousCursor: false,
        results: [searchMessage],
        total: 1
      })
      .mockResolvedValueOnce({
        nextCursor: false,
        previousCursor: false,
        results: [
          {
            ...searchMessage,
            date: '2026-06-22T12:00:00.000Z',
            from: {
              address: 'sender@example.net',
              name: 'Sender'
            },
            id: 12,
            mailbox: 'inbox-id',
            subject: 'Hello',
            to: [
              {
                address: 'support@example.test',
                name: 'Support'
              }
            ]
          },
          searchMessage
        ],
        total: 2
      })
    webmailTestState.getMessage.mockImplementation(
      (_userId: string, mailboxId: string, messageId: string | number) =>
        Promise.resolve({
          ...searchMessage,
          ...(mailboxId === 'inbox-id'
            ? {
                from: {
                  address: 'sender@example.net',
                  name: 'Sender'
                },
                to: [
                  {
                    address: 'support@example.test',
                    name: 'Support'
                  }
                ]
              }
            : {}),
          id: Number(messageId),
          mailbox: mailboxId,
          subject: mailboxId === 'sent-id' ? 'Re: Hello' : 'Hello'
        })
    )
    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')

    const workspace = await getAgentMailWorkspaceForWeb({
      headers: new Headers(),
      input: {
        cursor: 'cursor-1',
        direction: 'next',
        messageId: '13',
        query: 'hello'
      }
    })

    expect(webmailTestState.searchMessages).toHaveBeenNthCalledWith(1, 'wildduck-user-1', 'hello', {
      limit: 25,
      next: 'cursor-1',
      previous: undefined
    })
    expect(webmailTestState.searchMessages).toHaveBeenNthCalledWith(
      2,
      'wildduck-user-1',
      `thread:${threadId}`,
      {
        limit: 250
      }
    )
    expect(webmailTestState.getMessage).toHaveBeenNthCalledWith(1, 'wildduck-user-1', 'sent-id', '13')
    expect(workspace.selectedMessage?.mailboxId).toBe('sent-id')
    expect(
      workspace.selectedMessage?.thread?.map((message) => `${message.mailboxId}:${message.id}`)
    ).toStrictEqual(['inbox-id:12', 'sent-id:13'])
  })

  it('includes same-account replies in selected conversation threads', async () => {
    expect.hasAssertions()
    const threadId = '64b112233445566778899002'
    const rootMessage = {
      date: '2026-06-22T12:00:00.000Z',
      from: {
        address: 'sender@example.net',
        name: 'Sender'
      },
      html: '<p>Hello</p>',
      id: 12,
      mailbox: 'inbox-id',
      messageId: '<hello@example.net>',
      references: [],
      seen: false,
      subject: 'Hello',
      text: 'Hello',
      thread: threadId,
      to: [
        {
          address: 'support@example.test',
          name: 'Support'
        }
      ]
    }
    const replyMessage = {
      date: '2026-06-22T12:05:00.000Z',
      from: {
        address: 'support@example.test',
        name: 'Support'
      },
      html: '<p>Reply</p>',
      id: 13,
      mailbox: 'inbox-id',
      messageId: '<reply@example.test>',
      references: ['<hello@example.net>'],
      seen: true,
      subject: 'Re: Hello',
      text: 'Reply',
      thread: threadId,
      to: [
        {
          address: 'sender@example.net',
          name: 'Sender'
        }
      ]
    }
    webmailTestState.listMailboxes.mockResolvedValueOnce({
      results: [
        {
          id: 'inbox-id',
          name: 'Inbox',
          path: 'INBOX',
          specialUse: '\\Inbox'
        }
      ]
    })
    webmailTestState.searchMessages
      .mockResolvedValueOnce({
        nextCursor: false,
        previousCursor: false,
        results: [rootMessage],
        total: 1
      })
      .mockResolvedValueOnce({
        nextCursor: false,
        previousCursor: false,
        results: [replyMessage, rootMessage],
        total: 2
      })
    webmailTestState.getMessage.mockImplementation(
      (_userId: string, _mailboxId: string, messageId: string | number) =>
        Promise.resolve(messageId.toString() === '13' ? replyMessage : rootMessage)
    )
    const { getAgentMailWorkspaceForWeb } = await import('./webmail-service')

    const workspace = await getAgentMailWorkspaceForWeb({
      headers: new Headers(),
      input: {
        accountId: 'support@example.test',
        folderId: 'inbox-id',
        messageId: '12',
        query: 'subject:"Hello"'
      }
    })

    expect(workspace.selectedMessage?.id).toBe('12')
    expect(
      workspace.selectedMessage?.thread?.map((message) => `${message.mailboxId}:${message.id}`)
    ).toStrictEqual(['inbox-id:12', 'inbox-id:13'])
  })

  it('submits outbound mail through WildDuck with structured recipients and reply references', async () => {
    expect.hasAssertions()
    const { sendAgentMailMessageForWeb } = await import('./webmail-service')

    await expect(
      sendAgentMailMessageForWeb({
        headers: new Headers(),
        input: {
          accountId: 'support@example.test',
          bcc: 'Audit <audit@example.net>',
          body: 'Line one\nLine two',
          cc: 'Manager <manager@example.net>',
          html: '<p>Line one</p><p>Line two</p>',
          reference: {
            action: 'replyAll',
            mailboxId: 'inbox-id',
            messageId: '12'
          },
          replyTo: 'Replies <replies@example.net>',
          subject: 'Re: Hello',
          to: 'Sender <sender@example.net>'
        }
      })
    ).resolves.toStrictEqual({ success: true })

    expect(webmailTestState.submitMessage).toHaveBeenCalledWith('wildduck-user-1', {
      bcc: [
        {
          address: 'audit@example.net',
          name: 'Audit'
        }
      ],
      cc: [
        {
          address: 'manager@example.net',
          name: 'Manager'
        }
      ],
      from: {
        address: 'support@example.test'
      },
      html: '<p>Line one</p><p>Line two</p>',
      reference: {
        action: 'replyAll',
        id: 12,
        mailbox: 'inbox-id'
      },
      replyTo: {
        address: 'replies@example.net',
        name: 'Replies'
      },
      subject: 'Re: Hello',
      text: 'Line one\r\nLine two',
      to: [
        {
          address: 'sender@example.net',
          name: 'Sender'
        }
      ]
    })
  })

  it('rejects reply references outside the mailbox account before WildDuck submit', async () => {
    expect.hasAssertions()
    webmailTestState.getMessage.mockResolvedValueOnce({
      date: '2026-06-22T12:00:00.000Z',
      from: {
        address: 'sender@example.net',
        name: 'Sender'
      },
      html: '<p>Hello</p>',
      id: 12,
      mailbox: 'inbox-id',
      seen: false,
      subject: 'Hello',
      text: 'Hello',
      to: [
        {
          address: 'intruder@other.test',
          name: 'Intruder'
        }
      ]
    })
    const { sendAgentMailMessageForWeb } = await import('./webmail-service')

    await expect(
      sendAgentMailMessageForWeb({
        headers: new Headers(),
        input: {
          accountId: 'support@example.test',
          body: 'Line one\nLine two',
          reference: {
            action: 'reply',
            mailboxId: 'inbox-id',
            messageId: '12'
          },
          subject: 'Re: Hello',
          to: 'Sender <sender@example.net>'
        }
      })
    ).rejects.toMatchObject({
      message: 'Message is not available for this mailbox account',
      status: 403
    })

    expect(webmailTestState.submitMessage).not.toHaveBeenCalled()
  })

  it('rejects forward references outside the mailbox account before WildDuck submit', async () => {
    expect.hasAssertions()
    webmailTestState.getMessage.mockResolvedValueOnce({
      date: '2026-06-22T12:00:00.000Z',
      from: {
        address: 'sender@example.net',
        name: 'Sender'
      },
      html: '<p>Hello</p>',
      id: 12,
      mailbox: 'inbox-id',
      seen: false,
      subject: 'Hello',
      text: 'Hello',
      to: [
        {
          address: 'intruder@other.test',
          name: 'Intruder'
        }
      ]
    })
    const { sendAgentMailMessageForWeb } = await import('./webmail-service')

    await expect(
      sendAgentMailMessageForWeb({
        headers: new Headers(),
        input: {
          accountId: 'support@example.test',
          body: 'Forwarded body',
          reference: {
            action: 'forward',
            mailboxId: 'inbox-id',
            messageId: '12'
          },
          subject: 'Fwd: Hello',
          to: 'Recipient <recipient@example.net>'
        }
      })
    ).rejects.toMatchObject({
      message: 'Message is not available for this mailbox account',
      status: 403
    })

    expect(webmailTestState.submitMessage).not.toHaveBeenCalled()
  })

  it('distinguishes send and reply capability grants for WildDuck submit references', async () => {
    expect.hasAssertions()
    const mailboxConstraints = {
      mailboxAddress: 'support@example.test',
      organizationId: 'org-1'
    }
    const replyInput = {
      accountId: 'support@example.test',
      body: 'Reply body',
      reference: {
        action: 'reply' as const,
        mailboxId: 'inbox-id',
        messageId: '12'
      },
      subject: 'Re: Hello',
      to: 'Sender <sender@example.net>'
    }
    const { sendAgentMailMessageForWeb } = await import('./webmail-service')

    configureAgentSession(
      [],
      [
        {
          agentId: 'agent-1',
          capability: 'email.message.reply',
          constraints: mailboxConstraints,
          expiresAt: null,
          status: 'active'
        }
      ]
    )
    await expect(
      sendAgentMailMessageForWeb({
        headers: new Headers(),
        input: replyInput
      })
    ).resolves.toStrictEqual({ success: true })
    expect(webmailTestState.submitMessage).toHaveBeenCalledOnce()

    webmailTestState.submitMessage.mockClear()
    configureAgentSession(
      [],
      [
        {
          agentId: 'agent-1',
          capability: 'email.message.send',
          constraints: mailboxConstraints,
          expiresAt: null,
          status: 'active'
        }
      ]
    )
    await expect(
      sendAgentMailMessageForWeb({
        headers: new Headers(),
        input: replyInput
      })
    ).rejects.toMatchObject({
      message: 'Mailbox operation is not authorized',
      status: 403
    })
    expect(webmailTestState.submitMessage).not.toHaveBeenCalled()

    await expect(
      sendAgentMailMessageForWeb({
        headers: new Headers(),
        input: {
          accountId: 'support@example.test',
          body: 'New message',
          subject: 'Hello',
          to: 'Recipient <recipient@example.net>'
        }
      })
    ).resolves.toStrictEqual({ success: true })
    expect(webmailTestState.submitMessage).toHaveBeenCalledOnce()
  })

  it('allows WildDuck sends within Agent Auth recipient constraints', async () => {
    expect.hasAssertions()
    configureAgentSession(
      [],
      [
        {
          agentId: 'agent-1',
          capability: 'email.message.send',
          constraints: {
            allowedRecipientDomains: ['example.net'],
            allowedRecipients: ['specific@example.org'],
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1'
          },
          expiresAt: null,
          status: 'active'
        }
      ]
    )
    const { sendAgentMailMessageForWeb } = await import('./webmail-service')

    await expect(
      sendAgentMailMessageForWeb({
        headers: new Headers(),
        input: {
          accountId: 'support@example.test',
          body: 'Allowed recipients',
          cc: 'Specific <specific@example.org>',
          subject: 'Allowed',
          to: 'Recipient <recipient@example.net>'
        }
      })
    ).resolves.toStrictEqual({ success: true })
    expect(webmailTestState.submitMessage).toHaveBeenCalledWith(
      'wildduck-user-1',
      expect.objectContaining({
        cc: [{ address: 'specific@example.org', name: 'Specific' }],
        to: [{ address: 'recipient@example.net', name: 'Recipient' }]
      })
    )
  })

  it('rejects WildDuck sends outside Agent Auth recipient constraints before WildDuck side effects', async () => {
    expect.hasAssertions()
    configureAgentSession(
      [],
      [
        {
          agentId: 'agent-1',
          capability: 'email.message.send',
          constraints: {
            allowedRecipientPatterns: ['*@example.net'],
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1'
          },
          expiresAt: null,
          status: 'active'
        }
      ]
    )
    const { sendAgentMailMessageForWeb } = await import('./webmail-service')

    await expect(
      sendAgentMailMessageForWeb({
        headers: new Headers(),
        input: {
          accountId: 'support@example.test',
          body: 'Denied recipients',
          subject: 'Denied',
          to: 'Recipient <recipient@blocked.test>'
        }
      })
    ).rejects.toMatchObject({
      message: 'Message operation is not authorized',
      status: 403
    })
    expect(webmailTestState.createWildDuckClient).not.toHaveBeenCalled()
    expect(webmailTestState.submitMessage).not.toHaveBeenCalled()
  })

  it('consumes autonomous trial send quota before WildDuck message submission', async () => {
    expect.hasAssertions()
    configureAgentSession(
      [],
      [
        {
          agentId: 'agent-1',
          capability: 'email.message.send',
          constraints: {
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1'
          },
          expiresAt: null,
          status: 'active'
        }
      ]
    )
    configureAgentMailTrial()
    const { sendAgentMailMessageForWeb } = await import('./webmail-service')

    await expect(
      sendAgentMailMessageForWeb({
        headers: new Headers(),
        input: {
          accountId: 'support@example.test',
          body: 'Trial body',
          subject: 'Trial send',
          to: 'Recipient <recipient@example.net>'
        }
      })
    ).resolves.toStrictEqual({ success: true })

    expect(webmailTestState.agentMailTrialFindOne).toHaveBeenCalledWith({
      agentId: 'agent-1',
      expiresAt: { $gt: expect.any(Date) },
      mailboxAddress: 'support@example.test',
      status: { $in: ['active', 'claimed'] }
    })
    expect(webmailTestState.agentMailTrialUpdateOne).toHaveBeenCalledWith(
      {
        _id: 'trial-1',
        dailySentCount: { $lt: 10 },
        expiresAt: { $gt: expect.any(Date) },
        status: { $in: ['active', 'claimed'] },
        totalSentCount: { $lt: 50 }
      },
      {
        $inc: {
          dailySentCount: 1,
          totalSentCount: 1
        },
        $set: {
          updatedAt: expect.any(Date)
        }
      }
    )
    expect(webmailTestState.submitMessage).toHaveBeenCalledOnce()
  })

  it('continues quota enforcement for claimed trial agents before WildDuck submission', async () => {
    expect.hasAssertions()
    configureAgentSession(
      [],
      [
        {
          agentId: 'agent-1',
          capability: 'email.message.send',
          constraints: {
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1'
          },
          expiresAt: null,
          status: 'active'
        }
      ]
    )
    configureAgentMailTrial({ status: 'claimed' })
    const { sendAgentMailMessageForWeb } = await import('./webmail-service')

    await expect(
      sendAgentMailMessageForWeb({
        headers: new Headers(),
        input: {
          accountId: 'support@example.test',
          body: 'Claimed trial body',
          subject: 'Claimed trial send',
          to: 'Recipient <recipient@example.net>'
        }
      })
    ).resolves.toStrictEqual({ success: true })

    expect(webmailTestState.agentMailTrialFindOne).toHaveBeenCalledWith({
      agentId: 'agent-1',
      expiresAt: { $gt: expect.any(Date) },
      mailboxAddress: 'support@example.test',
      status: { $in: ['active', 'claimed'] }
    })
    expect(webmailTestState.agentMailTrialUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'trial-1',
        status: { $in: ['active', 'claimed'] }
      }),
      expect.objectContaining({
        $inc: {
          dailySentCount: 1,
          totalSentCount: 1
        }
      })
    )
    expect(webmailTestState.submitMessage).toHaveBeenCalledOnce()
  })

  it('rejects autonomous trial sends when quota is exhausted before WildDuck submission', async () => {
    expect.hasAssertions()
    configureAgentSession(
      [],
      [
        {
          agentId: 'agent-1',
          capability: 'email.message.send',
          constraints: {
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1'
          },
          expiresAt: null,
          status: 'active'
        }
      ]
    )
    configureAgentMailTrial({
      totalSentCount: 50,
      totalSendLimit: 50
    })
    const { sendAgentMailMessageForWeb } = await import('./webmail-service')

    await expect(
      sendAgentMailMessageForWeb({
        headers: new Headers(),
        input: {
          accountId: 'support@example.test',
          body: 'Trial body',
          subject: 'Trial send',
          to: 'Recipient <recipient@example.net>'
        }
      })
    ).rejects.toMatchObject({
      message: 'Agent Mail trial send quota is exhausted',
      status: 403
    })
    expect(webmailTestState.agentMailTrialUpdateOne).not.toHaveBeenCalled()
    expect(webmailTestState.submitMessage).not.toHaveBeenCalled()
  })

  it('consumes autonomous trial send quota before WildDuck draft submission', async () => {
    expect.hasAssertions()
    configureAgentSession(
      [],
      [
        {
          agentId: 'agent-1',
          capability: 'email.message.send',
          constraints: {
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1'
          },
          expiresAt: null,
          status: 'active'
        },
        {
          agentId: 'agent-1',
          capability: 'email.message.read',
          constraints: {
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1'
          },
          expiresAt: null,
          status: 'active'
        }
      ]
    )
    configureAgentMailTrial()
    const { sendAgentMailDraftForWeb } = await import('./webmail-service')

    await expect(
      sendAgentMailDraftForWeb({
        headers: new Headers(),
        input: {
          accountId: 'support@example.test',
          mailboxId: 'drafts-id',
          messageId: '12'
        }
      })
    ).resolves.toStrictEqual({ success: true })
    expect(webmailTestState.agentMailTrialUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'trial-1',
        dailySentCount: { $lt: 10 },
        totalSentCount: { $lt: 50 }
      }),
      expect.objectContaining({
        $inc: {
          dailySentCount: 1,
          totalSentCount: 1
        }
      })
    )
    expect(webmailTestState.submitDraft).toHaveBeenCalledWith('wildduck-user-1', 'drafts-id', '12')
  })

  it('allows WildDuck draft submission within Agent Auth recipient constraints', async () => {
    expect.hasAssertions()
    configureAgentSession(
      [],
      [
        {
          agentId: 'agent-1',
          capability: 'email.message.send',
          constraints: {
            allowedRecipientDomains: ['example.net'],
            allowedRecipients: ['specific@example.org'],
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1'
          },
          expiresAt: null,
          status: 'active'
        },
        {
          agentId: 'agent-1',
          capability: 'email.message.read',
          constraints: {
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1'
          },
          expiresAt: null,
          status: 'active'
        }
      ]
    )
    webmailTestState.getMessage.mockResolvedValueOnce({
      bcc: 'Specific <specific@example.org>',
      from: {
        address: 'support@example.test'
      },
      id: 12,
      mailbox: 'drafts-id',
      subject: 'Allowed draft',
      to: [
        {
          address: 'recipient@example.net',
          name: 'Recipient'
        }
      ]
    })
    const { sendAgentMailDraftForWeb } = await import('./webmail-service')

    await expect(
      sendAgentMailDraftForWeb({
        headers: new Headers(),
        input: {
          accountId: 'support@example.test',
          mailboxId: 'drafts-id',
          messageId: '12'
        }
      })
    ).resolves.toStrictEqual({ success: true })
    expect(webmailTestState.getMessage).toHaveBeenCalledWith('wildduck-user-1', 'drafts-id', '12')
    expect(webmailTestState.submitDraft).toHaveBeenCalledWith('wildduck-user-1', 'drafts-id', '12')
  })

  it('rejects WildDuck draft submission without draft read authority before reading the draft', async () => {
    expect.hasAssertions()
    configureAgentSession(
      [],
      [
        {
          agentId: 'agent-1',
          capability: 'email.message.send',
          constraints: {
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1'
          },
          expiresAt: null,
          status: 'active'
        }
      ]
    )
    configureAgentMailTrial()
    const { sendAgentMailDraftForWeb } = await import('./webmail-service')

    await expect(
      sendAgentMailDraftForWeb({
        headers: new Headers(),
        input: {
          accountId: 'support@example.test',
          mailboxId: 'drafts-id',
          messageId: '12'
        }
      })
    ).rejects.toMatchObject({
      message: 'Draft operation is not authorized',
      status: 403
    })
    expect(webmailTestState.getMessage).not.toHaveBeenCalled()
    expect(webmailTestState.agentMailTrialUpdateOne).not.toHaveBeenCalled()
    expect(webmailTestState.submitDraft).not.toHaveBeenCalled()
  })

  it('rejects WildDuck draft submission outside Agent Auth recipient constraints before quota or submit side effects', async () => {
    expect.hasAssertions()
    configureAgentSession(
      [],
      [
        {
          agentId: 'agent-1',
          capability: 'email.message.send',
          constraints: {
            allowedRecipientDomains: ['example.net'],
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1'
          },
          expiresAt: null,
          status: 'active'
        },
        {
          agentId: 'agent-1',
          capability: 'email.message.read',
          constraints: {
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1'
          },
          expiresAt: null,
          status: 'active'
        }
      ]
    )
    configureAgentMailTrial()
    webmailTestState.getMessage.mockResolvedValueOnce({
      from: {
        address: 'support@example.test'
      },
      id: 12,
      mailbox: 'drafts-id',
      subject: 'Denied draft',
      to: [
        {
          address: 'recipient@blocked.example',
          name: 'Recipient'
        }
      ]
    })
    const { sendAgentMailDraftForWeb } = await import('./webmail-service')

    await expect(
      sendAgentMailDraftForWeb({
        headers: new Headers(),
        input: {
          accountId: 'support@example.test',
          mailboxId: 'drafts-id',
          messageId: '12'
        }
      })
    ).rejects.toMatchObject({
      message: 'Message operation is not authorized',
      status: 403
    })
    expect(webmailTestState.agentMailTrialUpdateOne).not.toHaveBeenCalled()
    expect(webmailTestState.submitDraft).not.toHaveBeenCalled()
  })

  it('performs mailbox-qualified message actions through WildDuck only after account authorization', async () => {
    expect.hasAssertions()
    const { deleteAgentMailMessageForWeb, moveAgentMailMessageForWeb, updateAgentMailMessageForWeb } =
      await import('./webmail-service')
    const headers = new Headers()
    const input = {
      accountId: 'support@example.test',
      mailboxId: 'inbox-id',
      messageId: '12'
    }

    await expect(
      updateAgentMailMessageForWeb({
        headers,
        input: {
          ...input,
          flagged: true,
          seen: true
        }
      })
    ).resolves.toStrictEqual({ success: true })
    await expect(
      moveAgentMailMessageForWeb({
        headers,
        input: {
          ...input,
          targetMailboxId: 'drafts-id'
        }
      })
    ).resolves.toStrictEqual({ success: true })
    await expect(deleteAgentMailMessageForWeb({ headers, input })).resolves.toStrictEqual({ success: true })

    expect(webmailTestState.updateMessage).toHaveBeenNthCalledWith(1, 'wildduck-user-1', 'inbox-id', '12', {
      flagged: true,
      seen: true
    })
    expect(webmailTestState.updateMessage).toHaveBeenNthCalledWith(2, 'wildduck-user-1', 'inbox-id', '12', {
      moveTo: 'drafts-id'
    })
    expect(webmailTestState.deleteMessage).toHaveBeenCalledWith('wildduck-user-1', 'inbox-id', '12')
  })

  it('renames custom folders through WildDuck after account authorization', async () => {
    expect.hasAssertions()
    webmailTestState.listMailboxes
      .mockResolvedValueOnce({
        results: [
          {
            id: 'inbox-id',
            name: 'Inbox',
            path: 'INBOX',
            specialUse: '\\Inbox'
          },
          {
            id: 'projects-id',
            name: 'Projects',
            path: 'Projects'
          }
        ]
      })
      .mockResolvedValueOnce({
        results: [
          {
            id: 'inbox-id',
            name: 'Inbox',
            path: 'INBOX',
            specialUse: '\\Inbox'
          },
          {
            id: 'projects-id',
            name: 'Client Work',
            path: 'Client Work'
          }
        ]
      })
    const { renameAgentMailFolderForWeb } = await import('./webmail-service')

    await expect(
      renameAgentMailFolderForWeb({
        accountId: 'support@example.test',
        headers: new Headers(),
        mailboxId: 'projects-id',
        name: 'Client Work'
      })
    ).resolves.toMatchObject({
      folder: {
        id: 'projects-id',
        name: 'Client Work',
        path: 'Client Work',
        protected: false
      },
      success: true
    })
    expect(webmailTestState.updateMailbox).toHaveBeenCalledWith('wildduck-user-1', 'projects-id', {
      path: 'Client Work'
    })
  })

  it('deletes custom folders through WildDuck after account authorization', async () => {
    expect.hasAssertions()
    webmailTestState.listMailboxes.mockResolvedValueOnce({
      results: [
        {
          id: 'inbox-id',
          name: 'Inbox',
          path: 'INBOX',
          specialUse: '\\Inbox'
        },
        {
          id: 'projects-id',
          name: 'Projects',
          path: 'Projects'
        }
      ]
    })
    const { deleteAgentMailFolderForWeb } = await import('./webmail-service')

    await expect(
      deleteAgentMailFolderForWeb({
        accountId: 'support@example.test',
        headers: new Headers(),
        mailboxId: 'projects-id'
      })
    ).resolves.toStrictEqual({ success: true })
    expect(webmailTestState.deleteMailbox).toHaveBeenCalledWith('wildduck-user-1', 'projects-id')
  })

  it('rejects custom folder rename to an existing folder before calling WildDuck updateMailbox', async () => {
    expect.hasAssertions()
    webmailTestState.listMailboxes.mockResolvedValueOnce({
      results: [
        {
          id: 'projects-id',
          name: 'Projects',
          path: 'Projects'
        },
        {
          id: 'client-work-id',
          name: 'Client Work',
          path: 'Client Work'
        }
      ]
    })
    const { renameAgentMailFolderForWeb } = await import('./webmail-service')

    await expect(
      renameAgentMailFolderForWeb({
        accountId: 'support@example.test',
        headers: new Headers(),
        mailboxId: 'projects-id',
        name: 'Client Work'
      })
    ).rejects.toMatchObject({
      message: 'Folder name already exists',
      status: 400
    })
    expect(webmailTestState.updateMailbox).not.toHaveBeenCalled()
  })

  it('rejects protected folder rename before calling WildDuck updateMailbox', async () => {
    expect.hasAssertions()
    const { renameAgentMailFolderForWeb } = await import('./webmail-service')

    await expect(
      renameAgentMailFolderForWeb({
        accountId: 'support@example.test',
        headers: new Headers(),
        mailboxId: 'inbox-id',
        name: 'Renamed Inbox'
      })
    ).rejects.toMatchObject({
      message: 'System folders cannot be renamed',
      status: 400
    })
    expect(webmailTestState.updateMailbox).not.toHaveBeenCalled()
  })

  it('rejects protected folder deletion before calling WildDuck deleteMailbox', async () => {
    expect.hasAssertions()
    const { deleteAgentMailFolderForWeb } = await import('./webmail-service')

    await expect(
      deleteAgentMailFolderForWeb({
        accountId: 'support@example.test',
        headers: new Headers(),
        mailboxId: 'inbox-id'
      })
    ).rejects.toMatchObject({
      message: 'System folders cannot be deleted',
      status: 400
    })
    expect(webmailTestState.deleteMailbox).not.toHaveBeenCalled()
  })

  it('rejects draft submission from non-Drafts mailboxes before consuming quota or calling WildDuck', async () => {
    expect.hasAssertions()
    configureAgentSession(
      [],
      [
        {
          agentId: 'agent-1',
          capability: 'email.message.send',
          constraints: {
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1'
          },
          expiresAt: null,
          status: 'active'
        }
      ]
    )
    configureAgentMailTrial()
    const { sendAgentMailDraftForWeb } = await import('./webmail-service')

    await expect(
      sendAgentMailDraftForWeb({
        headers: new Headers(),
        input: {
          accountId: 'support@example.test',
          mailboxId: 'inbox-id',
          messageId: '12'
        }
      })
    ).rejects.toMatchObject({
      message: 'Draft operations require the Drafts folder',
      status: 400
    })
    expect(webmailTestState.agentMailTrialUpdateOne).not.toHaveBeenCalled()
    expect(webmailTestState.submitDraft).not.toHaveBeenCalled()
  })

  it('allows archive-only Agent Auth grants to move messages only into the Archive folder', async () => {
    expect.hasAssertions()
    configureAgentSession(
      [],
      [
        {
          _id: 'capability-grant-archive',
          agentId: 'agent-1',
          capability: 'email.message.archive',
          constraints: {
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1'
          },
          expiresAt: null,
          status: 'active'
        }
      ]
    )
    webmailTestState.listMailboxes.mockResolvedValue({
      results: [
        {
          id: 'inbox-id',
          name: 'Inbox',
          path: 'INBOX',
          specialUse: '\\Inbox'
        },
        {
          id: 'archive-id',
          name: 'Archive',
          path: 'Archive',
          specialUse: '\\Archive'
        },
        {
          id: 'drafts-id',
          name: 'Drafts',
          path: 'Drafts',
          specialUse: '\\Drafts'
        }
      ]
    })
    const { moveAgentMailMessageForWeb } = await import('./webmail-service')
    const input = {
      accountId: 'support@example.test',
      mailboxId: 'inbox-id',
      messageId: '12'
    }

    await expect(
      moveAgentMailMessageForWeb({
        headers: new Headers(),
        input: {
          ...input,
          targetMailboxId: 'archive-id'
        }
      })
    ).resolves.toStrictEqual({ success: true })
    expect(webmailTestState.updateMessage).toHaveBeenCalledWith('wildduck-user-1', 'inbox-id', '12', {
      moveTo: 'archive-id'
    })

    webmailTestState.updateMessage.mockClear()
    await expect(
      moveAgentMailMessageForWeb({
        headers: new Headers(),
        input: {
          ...input,
          targetMailboxId: 'drafts-id'
        }
      })
    ).rejects.toMatchObject({
      message: 'Mailbox operation is not authorized',
      status: 403
    })
    expect(webmailTestState.updateMessage).not.toHaveBeenCalled()
  })

  it('proxies attachments and original sources with safe same-origin response headers', async () => {
    expect.hasAssertions()
    const { getAgentMailAttachmentForWeb, getAgentMailOriginalSourceForWeb } =
      await import('./webmail-service')

    const attachment = await getAgentMailAttachmentForWeb({
      accountId: 'support@example.test',
      attachmentId: 'attachment-1',
      headers: new Headers(),
      mailboxId: 'inbox-id',
      messageId: '12'
    })
    const source = await getAgentMailOriginalSourceForWeb({
      accountId: 'support@example.test',
      headers: new Headers(),
      mailboxId: 'inbox-id',
      messageId: '12'
    })

    expect(attachment.headers.get('content-type')).toBe('application/octet-stream')
    expect(attachment.headers.get('content-disposition')).toBe('attachment')
    expect(attachment.headers.get('content-security-policy')).toBe('sandbox')
    expect(attachment.headers.get('x-content-type-options')).toBe('nosniff')
    await expect(attachment.text()).resolves.toBe('attachment-body')
    expect(source.headers.get('content-type')).toBe('message/rfc822')
    expect(source.headers.get('content-disposition')).toBe('attachment')
    await expect(source.text()).resolves.toBe('raw-source')
    expect(webmailTestState.fetchAttachment).toHaveBeenCalledWith(
      'wildduck-user-1',
      'inbox-id',
      '12',
      'attachment-1'
    )
    expect(webmailTestState.fetchMessageSource).toHaveBeenCalledWith('wildduck-user-1', 'inbox-id', '12')
  })

  it('does not proxy or mutate same-WildDuck-user messages outside the selected address', async () => {
    expect.hasAssertions()
    webmailTestState.getMessage.mockResolvedValue({
      date: '2026-06-22T12:00:00.000Z',
      from: { address: 'customer@example.net' },
      id: 12,
      mailbox: 'inbox-id',
      seen: false,
      subject: 'Billing',
      text: 'Billing only',
      to: [{ address: 'billing@example.test' }]
    })
    const { getAgentMailAttachmentForWeb, updateAgentMailMessageForWeb } = await import('./webmail-service')

    await expect(
      getAgentMailAttachmentForWeb({
        accountId: 'support@example.test',
        attachmentId: 'attachment-1',
        headers: new Headers(),
        mailboxId: 'inbox-id',
        messageId: '12'
      })
    ).rejects.toMatchObject({
      message: 'Message is not available for this mailbox account',
      status: 403
    })
    await expect(
      updateAgentMailMessageForWeb({
        headers: new Headers(),
        input: {
          accountId: 'support@example.test',
          mailboxId: 'inbox-id',
          messageId: '12',
          seen: true
        }
      })
    ).rejects.toMatchObject({
      message: 'Message is not available for this mailbox account',
      status: 403
    })

    expect(webmailTestState.fetchAttachment).not.toHaveBeenCalled()
    expect(webmailTestState.updateMessage).not.toHaveBeenCalled()
  })

  it('rejects account-scoped attachment access outside the authorized organization domain before resolving WildDuck user data', async () => {
    expect.hasAssertions()
    const { getAgentMailAttachmentForWeb } = await import('./webmail-service')

    await expect(
      getAgentMailAttachmentForWeb({
        accountId: 'intruder@other.test',
        attachmentId: 'attachment-1',
        headers: new Headers(),
        mailboxId: 'inbox-id',
        messageId: '12'
      })
    ).rejects.toMatchObject({
      message: 'Mailbox account is not available',
      status: 403
    })
    expect(webmailTestState.resolveAddress).not.toHaveBeenCalled()
  })

  it('saves drafts into the WildDuck Drafts folder with structured recipients and replacement metadata', async () => {
    expect.hasAssertions()
    webmailTestState.uploadMessage.mockResolvedValue({
      message: {
        id: 24,
        mailbox: 'drafts-id',
        size: 512
      },
      previousDeleted: true,
      success: true
    })
    const { saveAgentMailDraftForWeb } = await import('./webmail-service')

    const result = await saveAgentMailDraftForWeb({
      headers: new Headers(),
      input: {
        accountId: 'support@example.test',
        body: 'Draft body',
        draftMailboxId: 'drafts-id',
        draftMessageId: '23',
        subject: 'Draft subject',
        to: 'Recipient <recipient@example.net>'
      }
    })

    expect(result).toStrictEqual({
      draftId: '24',
      mailboxId: 'drafts-id',
      previousDeleted: true,
      success: true
    })
    expect(webmailTestState.uploadMessage).toHaveBeenCalledWith('wildduck-user-1', 'drafts-id', {
      draft: true,
      from: {
        address: 'support@example.test'
      },
      replacePrevious: {
        id: 23,
        mailbox: 'drafts-id'
      },
      subject: 'Draft subject',
      text: 'Draft body',
      to: [
        {
          address: 'recipient@example.net',
          name: 'Recipient'
        }
      ]
    })
  })

  it('rejects draft replacement from non-Drafts mailboxes before uploading to WildDuck', async () => {
    expect.hasAssertions()
    const { saveAgentMailDraftForWeb } = await import('./webmail-service')

    await expect(
      saveAgentMailDraftForWeb({
        headers: new Headers(),
        input: {
          accountId: 'support@example.test',
          body: 'Draft body',
          draftMailboxId: 'inbox-id',
          draftMessageId: '23',
          subject: 'Draft subject',
          to: 'Recipient <recipient@example.net>'
        }
      })
    ).rejects.toMatchObject({
      message: 'Draft operations require the Drafts folder',
      status: 400
    })
    expect(webmailTestState.uploadMessage).not.toHaveBeenCalled()
  })

  it('rejects agent draft replacement without draft read authority before reading the previous draft', async () => {
    expect.hasAssertions()
    configureAgentSession([
      {
        capability: 'createDrafts',
        expiresAt: null,
        mailboxAddress: 'support@example.test',
        organizationId: 'org-1',
        principalId: 'agent-1',
        principalType: 'agent',
        status: 'active'
      }
    ])
    const { saveAgentMailDraftForWeb } = await import('./webmail-service')

    await expect(
      saveAgentMailDraftForWeb({
        headers: new Headers(),
        input: {
          accountId: 'support@example.test',
          body: 'Draft body',
          draftMailboxId: 'drafts-id',
          draftMessageId: '23',
          subject: 'Draft subject',
          to: 'Recipient <recipient@example.net>'
        }
      })
    ).rejects.toMatchObject({
      message: 'Draft operation is not authorized',
      status: 403
    })
    expect(webmailTestState.getMessage).not.toHaveBeenCalled()
    expect(webmailTestState.uploadMessage).not.toHaveBeenCalled()
  })

  it('rejects agent draft creation without the createDrafts mailbox grant before resolving WildDuck user data', async () => {
    expect.hasAssertions()
    configureAgentSession([
      {
        capability: 'readMailbox',
        expiresAt: null,
        mailboxAddress: 'support@example.test',
        organizationId: 'org-1',
        principalId: 'agent-1',
        principalType: 'agent',
        status: 'active'
      }
    ])
    const { saveAgentMailDraftForWeb } = await import('./webmail-service')

    await expect(
      saveAgentMailDraftForWeb({
        headers: new Headers(),
        input: {
          accountId: 'support@example.test',
          body: 'Draft body',
          subject: 'Draft subject',
          to: 'Recipient <recipient@example.net>'
        }
      })
    ).rejects.toMatchObject({
      message: 'Mailbox operation is not authorized',
      status: 403
    })
    expect(webmailTestState.resolveAddress).not.toHaveBeenCalled()
    expect(webmailTestState.uploadMessage).not.toHaveBeenCalled()
  })

  it('allows agent draft creation only for the mailbox covered by an active createDrafts grant', async () => {
    expect.hasAssertions()
    configureAgentSession([
      {
        capability: 'createDrafts',
        expiresAt: null,
        mailboxAddress: 'support@example.test',
        organizationId: 'org-1',
        principalId: 'agent-1',
        principalType: 'agent',
        status: 'active'
      }
    ])
    webmailTestState.uploadMessage.mockResolvedValue({
      message: {
        id: 25,
        mailbox: 'drafts-id',
        size: 256
      },
      previousDeleted: false,
      success: true
    })
    const { saveAgentMailDraftForWeb } = await import('./webmail-service')

    await expect(
      saveAgentMailDraftForWeb({
        headers: new Headers(),
        input: {
          accountId: 'support@example.test',
          body: 'Draft body',
          subject: 'Draft subject',
          to: 'Recipient <recipient@example.net>'
        }
      })
    ).resolves.toStrictEqual({
      draftId: '25',
      mailboxId: 'drafts-id',
      previousDeleted: false,
      success: true
    })
    await expect(
      saveAgentMailDraftForWeb({
        headers: new Headers(),
        input: {
          accountId: 'intruder@other.test',
          body: 'Draft body',
          subject: 'Draft subject',
          to: 'Recipient <recipient@example.net>'
        }
      })
    ).rejects.toMatchObject({
      message: 'Mailbox account is not available',
      status: 403
    })
    expect(webmailTestState.uploadMessage).toHaveBeenCalledOnce()
  })

  it('compiles active Better Auth agent capability grants into mailbox-scoped CASL permissions', async () => {
    expect.hasAssertions()
    configureAgentSession(
      [],
      [
        {
          agentId: 'agent-1',
          capability: 'email.message.create_draft',
          constraints: {
            mailboxAddress: 'support@example.test',
            organizationId: 'org-1'
          },
          expiresAt: null,
          status: 'active'
        }
      ]
    )
    webmailTestState.uploadMessage.mockResolvedValue({
      message: {
        id: 26,
        mailbox: 'drafts-id',
        size: 128
      },
      previousDeleted: false,
      success: true
    })
    const { saveAgentMailDraftForWeb } = await import('./webmail-service')

    await expect(
      saveAgentMailDraftForWeb({
        headers: new Headers(),
        input: {
          accountId: 'support@example.test',
          body: 'Draft body',
          subject: 'Draft subject',
          to: 'Recipient <recipient@example.net>'
        }
      })
    ).resolves.toStrictEqual({
      draftId: '26',
      mailboxId: 'drafts-id',
      previousDeleted: false,
      success: true
    })
    await expect(
      saveAgentMailDraftForWeb({
        headers: new Headers(),
        input: {
          accountId: 'intruder@other.test',
          body: 'Draft body',
          subject: 'Draft subject',
          to: 'Recipient <recipient@example.net>'
        }
      })
    ).rejects.toMatchObject({
      message: 'Mailbox account is not available',
      status: 403
    })
    expect(webmailTestState.uploadMessage).toHaveBeenCalledOnce()
  })

  it('allows exact agent capability grants to use server-owned trial-domain mailboxes', async () => {
    expect.hasAssertions()
    configureAgentSession(
      [],
      [
        {
          agentId: 'agent-1',
          capability: 'email.message.create_draft',
          constraints: {
            mailboxAddress: 'trial-1@trial.example.test',
            organizationId: 'org-1'
          },
          expiresAt: null,
          status: 'active'
        }
      ]
    )
    webmailTestState.uploadMessage.mockResolvedValue({
      message: {
        id: 27,
        mailbox: 'drafts-id',
        size: 128
      },
      previousDeleted: false,
      success: true
    })
    const { saveAgentMailDraftForWeb } = await import('./webmail-service')

    await expect(
      saveAgentMailDraftForWeb({
        headers: new Headers(),
        input: {
          accountId: 'trial-1@trial.example.test',
          body: 'Trial draft body',
          subject: 'Trial draft subject',
          to: 'Recipient <recipient@example.net>'
        }
      })
    ).resolves.toStrictEqual({
      draftId: '27',
      mailboxId: 'drafts-id',
      previousDeleted: false,
      success: true
    })
    expect(webmailTestState.listUsers).not.toHaveBeenCalled()
    expect(webmailTestState.resolveAddress).toHaveBeenCalledWith('trial-1@trial.example.test')
    expect(webmailTestState.uploadMessage).toHaveBeenCalledOnce()
  })
})

function configureAgentSession(
  mailboxGrants: ReadonlyArray<Record<string, unknown>>,
  capabilityGrants: ReadonlyArray<Record<string, unknown>> = []
) {
  webmailTestState.authGetSession.mockResolvedValue(null)
  webmailTestState.authGetAgentSession.mockResolvedValue({
    agentId: 'agent-1',
    user: {
      id: 'user-1'
    },
    userId: 'user-1'
  })
  webmailTestState.agentMailMailboxGrantFind.mockReturnValue({ exec: () => Promise.resolve(mailboxGrants) })
  webmailTestState.agentMailSystemGrantFind.mockReturnValue({ exec: () => Promise.resolve([]) })
  webmailTestState.agentCapabilityGrantFind.mockReturnValue({ exec: () => Promise.resolve(capabilityGrants) })
}

function configureResourceBoundAgentJWT({
  mailboxGrants = [],
  payload = {},
  requestMethod = 'POST',
  requestUrl = 'https://mail.example.com/rpc/mail/accounts/support%40example.test/messages',
  token = 'resource-bound-agent-jwt',
  verifyRejects = false
}: {
  mailboxGrants?: ReadonlyArray<Record<string, unknown>>
  payload?: Record<string, unknown>
  requestMethod?: string
  requestUrl?: string
  token?: string
  verifyRejects?: boolean
} = {}) {
  const resolvedPayload = {
    aud: 'https://mail.example.com',
    exp: Math.floor(Date.now() / 1000) + 60,
    htm: requestMethod,
    htu: requestUrl,
    iat: Math.floor(Date.now() / 1000),
    iss: 'agent-host-1',
    jti: 'resource-bound-jti',
    sub: 'agent-1',
    ...payload
  }
  webmailTestState.authGetSession.mockResolvedValue(null)
  webmailTestState.authGetAgentSession.mockRejectedValue(
    new Error('Better Auth agent session endpoint should not be used for resource-bound mail JWTs')
  )
  webmailTestState.decodeProtectedHeader.mockReturnValue({ typ: 'agent+jwt' })
  webmailTestState.decodeJwt.mockReturnValue(resolvedPayload)
  if (verifyRejects) {
    webmailTestState.jwtVerify.mockRejectedValue(new Error('invalid resource-bound agent jwt'))
  } else {
    webmailTestState.jwtVerify.mockResolvedValue({ payload: resolvedPayload })
  }
  webmailTestState.agentFindById.mockReturnValue({
    exec: () =>
      Promise.resolve({
        _id: 'agent-1',
        expiresAt: null,
        hostId: 'agent-host-1',
        publicKey: JSON.stringify({ crv: 'Ed25519', kty: 'OKP', x: 'public-key' }),
        status: 'active',
        userId: 'user-1'
      })
  })
  webmailTestState.agentMailMailboxGrantFind.mockReturnValue({
    exec: () => Promise.resolve(mailboxGrants)
  })
  webmailTestState.agentMailSystemGrantFind.mockReturnValue({ exec: () => Promise.resolve([]) })
  webmailTestState.agentCapabilityGrantFind.mockReturnValue({ exec: () => Promise.resolve([]) })

  return {
    headers: new Headers({
      authorization: `Bearer ${token}`,
      'x-agentteam-request-method': requestMethod,
      'x-agentteam-request-url': requestUrl
    }),
    payload: resolvedPayload
  }
}

function sendAsGrant() {
  return {
    capability: 'sendAs',
    expiresAt: null,
    mailboxAddress: 'support@example.test',
    organizationId: 'org-1',
    principalId: 'agent-1',
    principalType: 'agent',
    status: 'active'
  }
}

function sendMessageInput() {
  return {
    accountId: 'support@example.test',
    body: 'Boundary delivery fixture.',
    subject: 'Resource bound send',
    to: 'Recipient <recipient@example.net>'
  }
}

function configureAgentMailTrial(overrides: Record<string, unknown> = {}) {
  const trial = {
    _id: 'trial-1',
    agentId: 'agent-1',
    dailySendLimit: 10,
    dailySentCount: 0,
    dailyWindowStartedAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    mailboxAddress: 'support@example.test',
    status: 'active',
    totalSendLimit: 50,
    totalSentCount: 0,
    ...overrides
  }
  webmailTestState.agentMailTrialFindOne.mockReturnValue({
    sort: () => ({
      exec: () => Promise.resolve(trial)
    })
  })
}
