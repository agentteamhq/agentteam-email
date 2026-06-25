import { Elysia, t } from 'elysia'
import { AgentMailMailboxGrantValues, AgentMailSystemPermissionValues } from '@main/db'

import {
  createAgentMailAccountForWeb,
  createAgentMailAgentEnrollmentForWeb,
  createAgentMailForwardingGroupForWeb,
  disableAgentMailAccountForWeb,
  disableAgentMailForwardingGroupForWeb,
  getAgentMailAdminNavigationForWeb,
  getAgentMailAdminViewForWeb,
  isAgentMailAdminError,
  revokeAgentMailAgentEnrollmentForWeb,
  revokeAgentMailAgentForWeb,
  updateAgentMailAccountForWeb,
  updateAgentMailAgentForWeb,
  updateAgentMailAgentMailboxGrantsForWeb,
  updateAgentMailAgentSystemPermissionsForWeb,
  updateAgentMailForwardingGroupForWeb,
  updateAgentMailPrincipalMailboxGrantsForWeb,
  updateAgentMailPrincipalSystemPermissionsForWeb
} from '../agent-mail/admin-service'
import {
  getAgentMailStatusForWeb,
  isAgentMailAccessError,
  submitAgentMailOutboundFromWeb
} from '../agent-mail/service'
import {
  agentMailWebErrorStatus,
  createAgentMailFolderForWeb,
  deleteAgentMailFolderForWeb,
  deleteAgentMailMessageForWeb,
  getAgentMailAccountsForWeb,
  getAgentMailAttachmentForWeb,
  getAgentMailOriginalSourceForWeb,
  getAgentMailWorkspaceForWeb,
  isAgentMailWebmailError,
  moveAgentMailMessageForWeb,
  renameAgentMailFolderForWeb,
  saveAgentMailDraftForWeb,
  sendAgentMailDraftForWeb,
  sendAgentMailMessageForWeb,
  updateAgentMailMessageForWeb
} from '../agent-mail/webmail-service'
import { typedResponseSchema } from './response-schema'
import type { TSchema } from '@sinclair/typebox'
import type {
  AgentMailAdminCreateAgentResult,
  AgentMailAdminNavigation,
  AgentMailAdminRevokeAgentEnrollmentResult,
  AgentMailAdminRevokeAgentResult,
  AgentMailAdminSaveAccountResult,
  AgentMailAdminSaveAgentMailboxGrantsResult,
  AgentMailAdminSaveAgentPermissionsResult,
  AgentMailAdminSaveAgentResult,
  AgentMailAdminSaveForwardingGroupResult,
  AgentMailAdminSavePrincipalMailboxGrantsResult,
  AgentMailAdminSavePrincipalSystemPermissionsResult,
  AgentMailAdminView
} from '../agent-mail/admin-service'
import type { AgentMailPublicStatus } from '../agent-mail/service'
import type { AgentMailWebFolder, AgentMailWebWorkspace } from '../agent-mail/webmail-service'

const accountParamsSchema = t.Object({
  accountId: t.String({ minLength: 3 })
})

function enumObject<const TValues extends readonly string[]>(
  values: TValues
): { [TValue in TValues[number]]: TValue } {
  return Object.fromEntries(values.map((value) => [value, value])) as { [TValue in TValues[number]]: TValue }
}

const adminSectionSchema = t.Union([t.Literal('accounts'), t.Literal('agents'), t.Literal('groups')])
const adminMailboxGrantSchema = t.Enum(enumObject(AgentMailMailboxGrantValues))
const adminSystemPermissionSchema = t.Enum(enumObject(AgentMailSystemPermissionValues))
const adminAccountBodySchema = t.Object({
  address: t.String({ minLength: 3 }),
  agentId: t.Optional(t.String({ minLength: 1 })),
  grants: t.Optional(t.Array(adminMailboxGrantSchema, { maxItems: AgentMailMailboxGrantValues.length })),
  name: t.Optional(t.String({ maxLength: 128 })),
  type: t.Optional(t.Literal('mailbox'))
})
const adminAccountUpdateBodySchema = t.Object({
  address: t.Optional(t.String({ minLength: 3 })),
  name: t.Optional(t.String({ maxLength: 128 })),
  status: t.Optional(t.Union([t.Literal('active'), t.Literal('disabled')]))
})
const adminAgentSystemPermissionsBodySchema = t.Object({
  permissions: t.Array(adminSystemPermissionSchema, { maxItems: AgentMailSystemPermissionValues.length })
})
const adminAgentBodySchema = t.Object({
  grantExpiresAt: t.Optional(t.Nullable(t.String({ minLength: 1 }))),
  mailboxGrants: t.Optional(
    t.Array(
      t.Object({
        accountId: t.String({ minLength: 3 }),
        capabilities: t.Array(adminMailboxGrantSchema, {
          maxItems: AgentMailMailboxGrantValues.length,
          minItems: 1
        })
      }),
      { maxItems: 100 }
    )
  ),
  name: t.String({ maxLength: 128, minLength: 1 }),
  systemPermissions: t.Optional(
    t.Array(adminSystemPermissionSchema, { maxItems: AgentMailSystemPermissionValues.length })
  )
})
const adminAgentMailboxGrantBodySchema = t.Object({
  grants: t.Array(
    t.Object({
      accountId: t.String({ minLength: 3 }),
      capabilities: t.Array(adminMailboxGrantSchema, {
        maxItems: AgentMailMailboxGrantValues.length,
        minItems: 1
      })
    }),
    { maxItems: 100 }
  )
})
const adminGrantPrincipalParamsSchema = t.Object({
  principalId: t.String({ maxLength: 256, minLength: 1 }),
  principalType: t.Union([t.Literal('api_key'), t.Literal('oauth_client')])
})
const adminForwardingGroupStatusSchema = t.Union([
  t.Literal('active'),
  t.Literal('disabled'),
  t.Literal('pending')
])
const adminForwardingGroupBodySchema = t.Object({
  address: t.String({ minLength: 3 }),
  description: t.Optional(t.String({ maxLength: 256 })),
  recipients: t.Optional(t.Array(t.String({ minLength: 3 }), { maxItems: 100 })),
  status: t.Optional(adminForwardingGroupStatusSchema)
})
const adminForwardingGroupUpdateBodySchema = t.Object({
  address: t.Optional(t.String({ minLength: 3 })),
  description: t.Optional(t.String({ maxLength: 256 })),
  recipients: t.Optional(t.Array(t.String({ minLength: 3 }), { maxItems: 100 })),
  status: t.Optional(adminForwardingGroupStatusSchema)
})

const messageParamsSchema = t.Object({
  accountId: t.String({ minLength: 3 }),
  mailboxId: t.String({ minLength: 1 }),
  messageId: t.String({ minLength: 1 })
})

const composeReferenceSchema = t.Object({
  action: t.Union([t.Literal('forward'), t.Literal('reply'), t.Literal('replyAll')]),
  mailboxId: t.String({ minLength: 1 }),
  messageId: t.String({ minLength: 1 })
})

const composeBodySchema = t.Object({
  bcc: t.Optional(t.String()),
  body: t.String(),
  cc: t.Optional(t.String()),
  html: t.Optional(t.String()),
  reference: t.Optional(composeReferenceSchema),
  replyTo: t.Optional(t.String()),
  subject: t.Optional(t.String()),
  to: t.Optional(t.String())
})

const mailErrorResponseSchemas = {
  400: t.Object({ error: t.String() }),
  401: t.Object({ error: t.String() }),
  403: t.Object({ error: t.String() }),
  404: t.Object({ error: t.String() }),
  502: t.Object({ error: t.String() })
}

const mailSuccessResponseSchema = t.Object({
  success: t.Boolean()
})

const draftSaveResponseSchema = t.Object({
  draftId: t.String(),
  mailboxId: t.String(),
  previousDeleted: t.Boolean(),
  success: t.Boolean()
})

const optionalStringResponseSchema = t.Optional(t.String())
const optionalNumberResponseSchema = t.Optional(t.Number())
const optionalBooleanResponseSchema = t.Optional(t.Boolean())
const nullableStringResponseSchema = t.Nullable(t.String())
const stringArrayResponseSchema = t.Array(t.String())
const adminStatusResponseSchema = t.Union([
  t.Literal('active'),
  t.Literal('disabled'),
  t.Literal('limited'),
  t.Literal('pending')
])
const adminPermissionOptionResponseSchema = (valueSchema: TSchema) =>
  t.Object({
    description: t.String(),
    label: t.String(),
    value: valueSchema
  })
const adminMailboxGrantResponseSchema = t.Object({
  accountAddress: t.String(),
  accountId: t.String(),
  capabilities: t.Array(adminMailboxGrantSchema)
})
const adminAccountResponseSchema = t.Object({
  accessCount: t.Number(),
  address: t.String(),
  agentName: optionalStringResponseSchema,
  domain: t.String(),
  groups: stringArrayResponseSchema,
  id: t.String(),
  lastActivity: t.String(),
  name: t.String(),
  status: adminStatusResponseSchema,
  type: t.Union([t.Literal('alias'), t.Literal('mailbox')])
})
const adminGroupResponseSchema = t.Object({
  address: t.String(),
  description: t.String(),
  domain: t.String(),
  id: t.String(),
  lastDelivered: t.String(),
  lastUpdated: t.String(),
  recipients: stringArrayResponseSchema,
  status: adminStatusResponseSchema
})
const adminAgentResponseSchema = t.Object({
  grants: t.Array(adminMailboxGrantResponseSchema),
  groups: stringArrayResponseSchema,
  handle: t.String(),
  id: t.String(),
  lastSeen: t.String(),
  name: t.String(),
  permissions: t.Array(adminSystemPermissionSchema),
  primaryAccount: optionalStringResponseSchema,
  status: adminStatusResponseSchema
})
const adminExternalPrincipalResponseSchema = t.Object({
  grants: t.Array(adminMailboxGrantResponseSchema),
  id: t.String(),
  kind: t.Union([t.Literal('api_key'), t.Literal('oauth_client')]),
  lastUsed: t.String(),
  name: t.String(),
  permissions: t.Array(adminSystemPermissionSchema),
  scope: t.Union([t.Literal('organization'), t.Literal('user')]),
  status: adminStatusResponseSchema
})
const adminPendingAgentEnrollmentResponseSchema = t.Object({
  canRevoke: t.Boolean(),
  createdAt: t.String(),
  grantExpiresAt: nullableStringResponseSchema,
  grants: t.Array(adminMailboxGrantResponseSchema),
  hostId: t.String(),
  id: t.String(),
  lastUpdated: t.String(),
  mailboxGrantCount: t.Number(),
  name: t.String(),
  permissions: t.Array(adminSystemPermissionSchema),
  status: t.Literal('pending'),
  systemPermissionCount: t.Number(),
  tokenExpiresAt: nullableStringResponseSchema
})
const adminEnrollmentResponseSchema = t.Object({
  enrollmentToken: t.String(),
  enrollmentTokenExpiresAt: nullableStringResponseSchema,
  grantExpiresAt: nullableStringResponseSchema,
  hostId: t.String(),
  mailboxGrantCount: t.Number(),
  name: t.String(),
  status: t.Literal('pending_enrollment'),
  systemPermissionCount: t.Number()
})
const adminAllowedActionsResponseSchema = t.Object({
  createAccount: t.Boolean(),
  createAgent: t.Boolean(),
  createGroup: t.Boolean(),
  disableAccount: t.Boolean(),
  disableGroup: t.Boolean(),
  manageAgentMailboxGrants: t.Boolean(),
  manageAgentSystemPermissions: t.Boolean(),
  provisionAccount: t.Boolean(),
  revokeAgent: t.Boolean(),
  updateAccount: t.Boolean(),
  updateAgent: t.Boolean(),
  updateGroup: t.Boolean()
})
const adminPaginationResponseSchema = t.Object({
  filteredRecords: t.Number(),
  page: t.Number(),
  pageSize: t.Number(),
  totalRecords: t.Number()
})
const adminPermissionCatalogResponseSchema = t.Object({
  defaultMailboxGrants: t.Array(adminMailboxGrantSchema),
  mailboxGrantOptions: t.Array(adminPermissionOptionResponseSchema(adminMailboxGrantSchema)),
  mailboxGrants: t.Array(adminMailboxGrantSchema),
  systemPermissionOptions: t.Array(adminPermissionOptionResponseSchema(adminSystemPermissionSchema)),
  systemPermissions: t.Array(adminSystemPermissionSchema)
})
const adminViewResponseSchema = t.Object({
  accounts: t.Array(adminAccountResponseSchema),
  agents: t.Array(adminAgentResponseSchema),
  allowedActions: adminAllowedActionsResponseSchema,
  allowedSections: t.Array(adminSectionSchema),
  domain: t.String(),
  groups: t.Array(adminGroupResponseSchema),
  pagination: t.Optional(adminPaginationResponseSchema),
  pendingEnrollments: t.Array(adminPendingAgentEnrollmentResponseSchema),
  permissionCatalog: adminPermissionCatalogResponseSchema,
  principals: t.Array(adminExternalPrincipalResponseSchema),
  searchQuery: optionalStringResponseSchema,
  section: adminSectionSchema,
  state: t.Union([t.Literal('empty'), t.Literal('loading'), t.Literal('ready')]),
  statusFilter: t.Optional(t.Union([adminStatusResponseSchema, t.Literal('all')]))
})
const adminNavigationResponseSchema = t.Object({
  allowedSections: t.Array(adminSectionSchema)
})
const adminSaveAccountResponseSchema = t.Object({
  account: adminAccountResponseSchema,
  success: t.Literal(true)
})
const adminSaveAgentResponseSchema = t.Object({
  agent: adminAgentResponseSchema,
  success: t.Literal(true)
})
const adminCreateAgentResponseSchema = t.Object({
  enrollment: adminEnrollmentResponseSchema,
  success: t.Literal(true)
})
const adminRevokeAgentResponseSchema = t.Object({
  agentId: t.String(),
  revokedCapabilityGrantCount: t.Number(),
  revokedMailboxGrantCount: t.Number(),
  revokedSystemGrantCount: t.Number(),
  status: t.Literal('revoked'),
  success: t.Literal(true)
})
const adminRevokeAgentEnrollmentResponseSchema = t.Object({
  enrollmentId: t.String(),
  hostId: t.String(),
  status: t.Literal('revoked'),
  success: t.Literal(true)
})
const adminSavePrincipalMailboxGrantsResponseSchema = t.Object({
  grants: t.Array(adminMailboxGrantResponseSchema),
  principalId: t.String(),
  principalType: t.Union([t.Literal('api_key'), t.Literal('oauth_client')]),
  revokedGrantCount: t.Number(),
  success: t.Literal(true)
})
const adminSavePrincipalSystemPermissionsResponseSchema = t.Object({
  permissions: t.Array(adminSystemPermissionSchema),
  principalId: t.String(),
  principalType: t.Union([t.Literal('api_key'), t.Literal('oauth_client')]),
  revokedPermissionCount: t.Number(),
  success: t.Literal(true)
})
const adminSaveGroupResponseSchema = t.Object({
  group: adminGroupResponseSchema,
  success: t.Literal(true)
})
const mailWebAccountResponseSchema = t.Object({
  address: t.String(),
  description: optionalStringResponseSchema,
  id: t.String(),
  name: t.String(),
  state: t.Union([t.Literal('disabled'), t.Literal('ready')])
})
const mailWebFolderResponseSchema = t.Object({
  id: t.String(),
  name: t.String(),
  path: t.String(),
  protected: t.Boolean(),
  specialUse: optionalStringResponseSchema,
  total: optionalNumberResponseSchema,
  unread: optionalNumberResponseSchema
})
const mailFolderMutationResponseSchema = t.Object({
  folder: mailWebFolderResponseSchema,
  success: t.Boolean()
})
const mailWebMessageSummaryResponseSchema = t.Object({
  attachmentCount: t.Number(),
  from: t.String(),
  id: t.String(),
  isDraft: t.Boolean(),
  isStarred: t.Boolean(),
  mailboxId: t.String(),
  receivedAt: optionalStringResponseSchema,
  subject: t.String(),
  teaser: t.String(),
  threadId: optionalStringResponseSchema,
  unread: t.Boolean()
})
const mailWebAttachmentResponseSchema = t.Object({
  contentId: optionalStringResponseSchema,
  disposition: optionalStringResponseSchema,
  filename: t.String(),
  id: t.String(),
  mimetype: optionalStringResponseSchema,
  size: optionalNumberResponseSchema,
  url: t.String()
})
const mailWebThreadMessageResponseSchema = t.Intersect([
  mailWebMessageSummaryResponseSchema,
  t.Object({
    attachments: t.Array(mailWebAttachmentResponseSchema),
    cc: stringArrayResponseSchema,
    html: t.String(),
    messageId: optionalStringResponseSchema,
    plainText: t.String(),
    replyTo: stringArrayResponseSchema,
    sourceUrl: t.String(),
    to: stringArrayResponseSchema
  })
])
const mailWebMessageDetailResponseSchema = t.Intersect([
  mailWebThreadMessageResponseSchema,
  t.Object({
    thread: t.Optional(t.Array(mailWebThreadMessageResponseSchema))
  })
])
const mailWebWorkspaceResponseSchema = t.Object({
  accounts: t.Array(mailWebAccountResponseSchema),
  activeAccountId: nullableStringResponseSchema,
  activeFolderId: nullableStringResponseSchema,
  folders: t.Array(mailWebFolderResponseSchema),
  messages: t.Array(mailWebMessageSummaryResponseSchema),
  pagination: t.Object({
    limit: t.Number(),
    nextCursor: nullableStringResponseSchema,
    previousCursor: nullableStringResponseSchema,
    total: t.Nullable(t.Number())
  }),
  selectedMessage: t.Nullable(mailWebMessageDetailResponseSchema)
})
const mailPublicStatusResponseSchema = t.Object({
  controlState: t.Optional(
    t.Object({
      configured: optionalBooleanResponseSchema,
      domainsActive: optionalNumberResponseSchema,
      domainsDisabled: optionalNumberResponseSchema,
      domainsTotal: optionalNumberResponseSchema,
      exists: optionalBooleanResponseSchema,
      issues: stringArrayResponseSchema,
      ok: optionalBooleanResponseSchema,
      schema: optionalStringResponseSchema,
      updatedAt: optionalStringResponseSchema
    })
  ),
  dependencies: t.Record(
    t.String(),
    t.Object({
      configured: optionalBooleanResponseSchema,
      issues: stringArrayResponseSchema,
      ok: optionalBooleanResponseSchema
    })
  ),
  domains: t.Array(
    t.Object({
      cloudflare: t.Optional(
        t.Object({
          catchAllConfigured: optionalBooleanResponseSchema,
          catchAllEnabled: optionalBooleanResponseSchema,
          issues: stringArrayResponseSchema,
          lastProvisionAt: optionalStringResponseSchema,
          lastProvisionStatus: optionalStringResponseSchema,
          ok: optionalBooleanResponseSchema
        })
      ),
      domain: t.String(),
      feedback: t.Optional(
        t.Object({
          configured: optionalBooleanResponseSchema,
          ok: optionalBooleanResponseSchema,
          wildDuckExists: optionalBooleanResponseSchema
        })
      ),
      inbound: t.Optional(
        t.Object({
          dsnConfigured: optionalBooleanResponseSchema,
          provider: optionalStringResponseSchema,
          sweepConfigured: optionalBooleanResponseSchema
        })
      ),
      issues: stringArrayResponseSchema,
      outbound: t.Optional(
        t.Object({
          configured: optionalBooleanResponseSchema,
          provider: optionalStringResponseSchema
        })
      ),
      status: t.String()
    })
  ),
  generatedAt: optionalStringResponseSchema,
  issues: stringArrayResponseSchema,
  modules: t.Record(
    t.String(),
    t.Object({
      activeDomains: optionalNumberResponseSchema,
      configured: optionalBooleanResponseSchema,
      issues: stringArrayResponseSchema,
      lastSweepAt: optionalStringResponseSchema,
      maxMessageBytes: optionalNumberResponseSchema,
      ok: optionalBooleanResponseSchema,
      provider: optionalStringResponseSchema,
      queue: t.Optional(
        t.Object({
          blocked: optionalNumberResponseSchema,
          completed: optionalNumberResponseSchema,
          delivered: optionalNumberResponseSchema,
          leased: optionalNumberResponseSchema,
          pending: optionalNumberResponseSchema,
          retryWait: optionalNumberResponseSchema
        })
      )
    })
  ),
  ok: optionalBooleanResponseSchema,
  provisioning: t.Optional(
    t.Object({
      domainsApplied: optionalNumberResponseSchema,
      domainsFailed: optionalNumberResponseSchema,
      domainsPending: optionalNumberResponseSchema,
      issues: stringArrayResponseSchema,
      lastApplyAt: optionalStringResponseSchema,
      status: optionalStringResponseSchema
    })
  ),
  selectedProvider: optionalStringResponseSchema,
  status: t.String()
})
const mailOutboundResponseSchema = t.Object({
  idempotency_key: optionalStringResponseSchema,
  status: t.String()
})

const mail = new Elysia({
  name: 'mail',
  prefix: '/mail'
})
  .get(
    '/admin',
    async ({ query, request, set }) => {
      try {
        return await getAgentMailAdminViewForWeb({
          headers: mailAuthHeaders(request),
          page: query.page,
          pageSize: query.pageSize,
          searchQuery: query.searchQuery,
          section: query.section,
          statusFilter: query.statusFilter
        })
      } catch (error) {
        return mailErrorResponse(error, set)
      }
    },
    {
      query: t.Object({
        page: t.Optional(t.Number({ minimum: 1 })),
        pageSize: t.Optional(t.Number({ maximum: 100, minimum: 1 })),
        searchQuery: t.Optional(t.String()),
        section: t.Optional(adminSectionSchema),
        statusFilter: t.Optional(
          t.Union([
            t.Literal('active'),
            t.Literal('disabled'),
            t.Literal('limited'),
            t.Literal('pending'),
            t.Literal('all')
          ])
        )
      }),
      response: {
        200: typedResponseSchema<AgentMailAdminView>(adminViewResponseSchema),
        ...mailErrorResponseSchemas
      }
    }
  )
  .get(
    '/admin/navigation',
    async ({ request, set }) => {
      try {
        return await getAgentMailAdminNavigationForWeb({
          headers: mailAuthHeaders(request)
        })
      } catch (error) {
        return mailErrorResponse(error, set)
      }
    },
    {
      response: {
        200: typedResponseSchema<AgentMailAdminNavigation>(adminNavigationResponseSchema),
        ...mailErrorResponseSchemas
      }
    }
  )
  .post(
    '/admin/accounts',
    async ({ body, request, set }) => {
      try {
        return await createAgentMailAccountForWeb({
          headers: mailAuthHeaders(request),
          input: body
        })
      } catch (error) {
        return mailErrorResponse(error, set)
      }
    },
    {
      body: adminAccountBodySchema,
      response: {
        200: typedResponseSchema<AgentMailAdminSaveAccountResult>(adminSaveAccountResponseSchema),
        ...mailErrorResponseSchemas
      }
    }
  )
  .patch(
    '/admin/accounts/:accountId',
    async ({ body, params, request, set }) => {
      try {
        return await updateAgentMailAccountForWeb({
          accountId: params.accountId,
          headers: mailAuthHeaders(request),
          input: body
        })
      } catch (error) {
        return mailErrorResponse(error, set)
      }
    },
    {
      body: adminAccountUpdateBodySchema,
      params: accountParamsSchema,
      response: {
        200: typedResponseSchema<AgentMailAdminSaveAccountResult>(adminSaveAccountResponseSchema),
        ...mailErrorResponseSchemas
      }
    }
  )
  .post(
    '/admin/accounts/:accountId/disable',
    async ({ params, request, set }) => {
      try {
        return await disableAgentMailAccountForWeb({
          accountId: params.accountId,
          headers: mailAuthHeaders(request)
        })
      } catch (error) {
        return mailErrorResponse(error, set)
      }
    },
    {
      params: accountParamsSchema,
      response: {
        200: typedResponseSchema<AgentMailAdminSaveAccountResult>(adminSaveAccountResponseSchema),
        ...mailErrorResponseSchemas
      }
    }
  )
  .post(
    '/admin/agents',
    async ({ body, request, set }) => {
      set.headers['cache-control'] = 'no-store'
      try {
        return await createAgentMailAgentEnrollmentForWeb({
          headers: mailAuthHeaders(request),
          input: body
        })
      } catch (error) {
        return mailErrorResponse(error, set)
      }
    },
    {
      body: adminAgentBodySchema,
      response: {
        200: typedResponseSchema<AgentMailAdminCreateAgentResult>(adminCreateAgentResponseSchema),
        ...mailErrorResponseSchemas
      }
    }
  )
  .patch(
    '/admin/agents/:agentId',
    async ({ body, params, request, set }) => {
      try {
        return await updateAgentMailAgentForWeb({
          agentId: params.agentId,
          headers: mailAuthHeaders(request),
          input: body
        })
      } catch (error) {
        return mailErrorResponse(error, set)
      }
    },
    {
      body: adminAgentBodySchema,
      params: t.Object({
        agentId: t.String({ minLength: 1 })
      }),
      response: {
        200: typedResponseSchema<AgentMailAdminSaveAgentResult>(adminSaveAgentResponseSchema),
        ...mailErrorResponseSchemas
      }
    }
  )
  .post(
    '/admin/agents/:agentId/mailbox-grants',
    async ({ body, params, request, set }) => {
      try {
        return await updateAgentMailAgentMailboxGrantsForWeb({
          agentId: params.agentId,
          headers: mailAuthHeaders(request),
          input: body
        })
      } catch (error) {
        return mailErrorResponse(error, set)
      }
    },
    {
      body: adminAgentMailboxGrantBodySchema,
      params: t.Object({
        agentId: t.String({ minLength: 1 })
      }),
      response: {
        200: typedResponseSchema<AgentMailAdminSaveAgentMailboxGrantsResult>(adminSaveAgentResponseSchema),
        ...mailErrorResponseSchemas
      }
    }
  )
  .post(
    '/admin/agents/:agentId/permissions',
    async ({ body, params, request, set }) => {
      try {
        return await updateAgentMailAgentSystemPermissionsForWeb({
          agentId: params.agentId,
          headers: mailAuthHeaders(request),
          input: body
        })
      } catch (error) {
        return mailErrorResponse(error, set)
      }
    },
    {
      body: adminAgentSystemPermissionsBodySchema,
      params: t.Object({
        agentId: t.String({ minLength: 1 })
      }),
      response: {
        200: typedResponseSchema<AgentMailAdminSaveAgentPermissionsResult>(adminSaveAgentResponseSchema),
        ...mailErrorResponseSchemas
      }
    }
  )
  .post(
    '/admin/agents/:agentId/revoke',
    async ({ params, request, set }) => {
      try {
        return await revokeAgentMailAgentForWeb({
          agentId: params.agentId,
          headers: mailAuthHeaders(request)
        })
      } catch (error) {
        return mailErrorResponse(error, set)
      }
    },
    {
      params: t.Object({
        agentId: t.String({ minLength: 1 })
      }),
      response: {
        200: typedResponseSchema<AgentMailAdminRevokeAgentResult>(adminRevokeAgentResponseSchema),
        ...mailErrorResponseSchemas
      }
    }
  )
  .post(
    '/admin/agent-enrollments/:enrollmentId/revoke',
    async ({ params, request, set }) => {
      try {
        return await revokeAgentMailAgentEnrollmentForWeb({
          enrollmentId: params.enrollmentId,
          headers: mailAuthHeaders(request)
        })
      } catch (error) {
        return mailErrorResponse(error, set)
      }
    },
    {
      params: t.Object({
        enrollmentId: t.String({ minLength: 1 })
      }),
      response: {
        200: typedResponseSchema<AgentMailAdminRevokeAgentEnrollmentResult>(
          adminRevokeAgentEnrollmentResponseSchema
        ),
        ...mailErrorResponseSchemas
      }
    }
  )
  .post(
    '/admin/principals/:principalType/:principalId/mailbox-grants',
    async ({ body, params, request, set }) => {
      try {
        return await updateAgentMailPrincipalMailboxGrantsForWeb({
          headers: mailAuthHeaders(request),
          input: body,
          principalId: params.principalId,
          principalType: params.principalType
        })
      } catch (error) {
        return mailErrorResponse(error, set)
      }
    },
    {
      body: adminAgentMailboxGrantBodySchema,
      params: adminGrantPrincipalParamsSchema,
      response: {
        200: typedResponseSchema<AgentMailAdminSavePrincipalMailboxGrantsResult>(
          adminSavePrincipalMailboxGrantsResponseSchema
        ),
        ...mailErrorResponseSchemas
      }
    }
  )
  .post(
    '/admin/principals/:principalType/:principalId/permissions',
    async ({ body, params, request, set }) => {
      try {
        return await updateAgentMailPrincipalSystemPermissionsForWeb({
          headers: mailAuthHeaders(request),
          input: body,
          principalId: params.principalId,
          principalType: params.principalType
        })
      } catch (error) {
        return mailErrorResponse(error, set)
      }
    },
    {
      body: adminAgentSystemPermissionsBodySchema,
      params: adminGrantPrincipalParamsSchema,
      response: {
        200: typedResponseSchema<AgentMailAdminSavePrincipalSystemPermissionsResult>(
          adminSavePrincipalSystemPermissionsResponseSchema
        ),
        ...mailErrorResponseSchemas
      }
    }
  )
  .post(
    '/admin/groups',
    async ({ body, request, set }) => {
      try {
        return await createAgentMailForwardingGroupForWeb({
          headers: mailAuthHeaders(request),
          input: body
        })
      } catch (error) {
        return mailErrorResponse(error, set)
      }
    },
    {
      body: adminForwardingGroupBodySchema,
      response: {
        200: typedResponseSchema<AgentMailAdminSaveForwardingGroupResult>(adminSaveGroupResponseSchema),
        ...mailErrorResponseSchemas
      }
    }
  )
  .patch(
    '/admin/groups/:groupId',
    async ({ body, params, request, set }) => {
      try {
        return await updateAgentMailForwardingGroupForWeb({
          groupId: params.groupId,
          headers: mailAuthHeaders(request),
          input: body
        })
      } catch (error) {
        return mailErrorResponse(error, set)
      }
    },
    {
      body: adminForwardingGroupUpdateBodySchema,
      params: t.Object({
        groupId: t.String({ minLength: 1 })
      }),
      response: {
        200: typedResponseSchema<AgentMailAdminSaveForwardingGroupResult>(adminSaveGroupResponseSchema),
        ...mailErrorResponseSchemas
      }
    }
  )
  .post(
    '/admin/groups/:groupId/disable',
    async ({ params, request, set }) => {
      try {
        return await disableAgentMailForwardingGroupForWeb({
          groupId: params.groupId,
          headers: mailAuthHeaders(request)
        })
      } catch (error) {
        return mailErrorResponse(error, set)
      }
    },
    {
      params: t.Object({
        groupId: t.String({ minLength: 1 })
      }),
      response: {
        200: typedResponseSchema<AgentMailAdminSaveForwardingGroupResult>(adminSaveGroupResponseSchema),
        ...mailErrorResponseSchemas
      }
    }
  )
  .get(
    '/accounts',
    async ({ request, set }) => {
      try {
        return await getAgentMailAccountsForWeb(mailAuthHeaders(request))
      } catch (error) {
        return mailErrorResponse(error, set)
      }
    },
    {
      response: {
        200: typedResponseSchema<Awaited<ReturnType<typeof getAgentMailAccountsForWeb>>>(
          t.Object({ accounts: t.Array(mailWebAccountResponseSchema) })
        ),
        ...mailErrorResponseSchemas
      }
    }
  )
  .get(
    '/workspace',
    async ({ query, request, set }) => {
      try {
        return await getAgentMailWorkspaceForWeb({
          headers: mailAuthHeaders(request),
          input: {
            accountId: query.accountId,
            cursor: query.cursor,
            direction: query.direction,
            folderId: query.folderId,
            limit: query.limit,
            messageId: query.messageId,
            query: query.query,
            unreadOnly: query.unreadOnly
          }
        })
      } catch (error) {
        return mailErrorResponse(error, set)
      }
    },
    {
      query: t.Object({
        accountId: t.Optional(t.String({ minLength: 3 })),
        cursor: t.Optional(t.String({ minLength: 1 })),
        direction: t.Optional(t.Union([t.Literal('next'), t.Literal('previous')])),
        folderId: t.Optional(t.String({ minLength: 1 })),
        limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
        messageId: t.Optional(t.String({ minLength: 1 })),
        query: t.Optional(t.String()),
        unreadOnly: t.Optional(t.Boolean())
      }),
      response: {
        200: typedResponseSchema<AgentMailWebWorkspace>(mailWebWorkspaceResponseSchema),
        ...mailErrorResponseSchemas
      }
    }
  )
  .get(
    '/accounts/:accountId/mailboxes/:mailboxId/messages/:messageId/attachments/:attachmentId',
    async ({ params, request, set }) => {
      try {
        return await getAgentMailAttachmentForWeb({
          accountId: params.accountId,
          attachmentId: params.attachmentId,
          headers: mailAuthHeaders(request),
          mailboxId: params.mailboxId,
          messageId: params.messageId
        })
      } catch (error) {
        return mailErrorFetchResponse(error, set)
      }
    },
    {
      params: t.Object({
        accountId: t.String({ minLength: 3 }),
        attachmentId: t.String({ minLength: 1 }),
        mailboxId: t.String({ minLength: 1 }),
        messageId: t.String({ minLength: 1 })
      }),
      response: {
        200: t.Any(),
        ...mailErrorResponseSchemas
      }
    }
  )
  .get(
    '/accounts/:accountId/mailboxes/:mailboxId/messages/:messageId/source',
    async ({ params, request, set }) => {
      try {
        return await getAgentMailOriginalSourceForWeb({
          accountId: params.accountId,
          headers: mailAuthHeaders(request),
          mailboxId: params.mailboxId,
          messageId: params.messageId
        })
      } catch (error) {
        return mailErrorFetchResponse(error, set)
      }
    },
    {
      params: t.Object({
        accountId: t.String({ minLength: 3 }),
        mailboxId: t.String({ minLength: 1 }),
        messageId: t.String({ minLength: 1 })
      }),
      response: {
        200: t.Any(),
        ...mailErrorResponseSchemas
      }
    }
  )
  .get(
    '/accounts/:accountId/mailboxes/:mailboxId/messages/:messageId/source-preview',
    async ({ params, request, set }) => {
      try {
        const response = await getAgentMailOriginalSourceForWeb({
          accountId: params.accountId,
          headers: mailAuthHeaders(request),
          mailboxId: params.mailboxId,
          messageId: params.messageId
        })
        return await response.text()
      } catch (error) {
        return mailErrorResponse(error, set)
      }
    },
    {
      params: t.Object({
        accountId: t.String({ minLength: 3 }),
        mailboxId: t.String({ minLength: 1 }),
        messageId: t.String({ minLength: 1 })
      }),
      response: {
        200: t.String(),
        ...mailErrorResponseSchemas
      }
    }
  )
  .post(
    '/accounts/:accountId/messages',
    async ({ body, params, request, set }) => {
      try {
        return await sendAgentMailMessageForWeb({
          headers: mailAuthHeaders(request),
          input: {
            accountId: params.accountId,
            bcc: body.bcc,
            body: body.body,
            cc: body.cc,
            html: body.html,
            reference: body.reference,
            replyTo: body.replyTo,
            subject: body.subject,
            to: body.to
          }
        })
      } catch (error) {
        return mailErrorResponse(error, set)
      }
    },
    {
      body: composeBodySchema,
      params: accountParamsSchema,
      response: {
        200: mailSuccessResponseSchema,
        ...mailErrorResponseSchemas
      }
    }
  )
  .post(
    '/accounts/:accountId/drafts',
    async ({ body, params, request, set }) => {
      try {
        return await saveAgentMailDraftForWeb({
          headers: mailAuthHeaders(request),
          input: {
            accountId: params.accountId,
            bcc: body.bcc,
            body: body.body,
            cc: body.cc,
            draftMailboxId: body.draftMailboxId,
            draftMessageId: body.draftMessageId,
            html: body.html,
            reference: body.reference,
            replyTo: body.replyTo,
            subject: body.subject,
            to: body.to
          }
        })
      } catch (error) {
        return mailErrorResponse(error, set)
      }
    },
    {
      body: t.Intersect([
        composeBodySchema,
        t.Object({
          draftMailboxId: t.Optional(t.String({ minLength: 1 })),
          draftMessageId: t.Optional(t.String({ minLength: 1 }))
        })
      ]),
      params: accountParamsSchema,
      response: {
        200: draftSaveResponseSchema,
        ...mailErrorResponseSchemas
      }
    }
  )
  .post(
    '/accounts/:accountId/mailboxes/:mailboxId/messages/:messageId/send-draft',
    async ({ params, request, set }) => {
      try {
        return await sendAgentMailDraftForWeb({
          headers: mailAuthHeaders(request),
          input: params
        })
      } catch (error) {
        return mailErrorResponse(error, set)
      }
    },
    {
      params: messageParamsSchema,
      response: {
        200: mailSuccessResponseSchema,
        ...mailErrorResponseSchemas
      }
    }
  )
  .patch(
    '/accounts/:accountId/mailboxes/:mailboxId/messages/:messageId',
    async ({ body, params, request, set }) => {
      try {
        return await updateAgentMailMessageForWeb({
          headers: mailAuthHeaders(request),
          input: {
            ...params,
            flagged: body.flagged,
            seen: body.seen
          }
        })
      } catch (error) {
        return mailErrorResponse(error, set)
      }
    },
    {
      body: t.Object({
        flagged: t.Optional(t.Boolean()),
        seen: t.Optional(t.Boolean())
      }),
      params: messageParamsSchema,
      response: {
        200: mailSuccessResponseSchema,
        ...mailErrorResponseSchemas
      }
    }
  )
  .post(
    '/accounts/:accountId/mailboxes/:mailboxId/messages/:messageId/move',
    async ({ body, params, request, set }) => {
      try {
        return await moveAgentMailMessageForWeb({
          headers: mailAuthHeaders(request),
          input: {
            ...params,
            targetMailboxId: body.targetMailboxId
          }
        })
      } catch (error) {
        return mailErrorResponse(error, set)
      }
    },
    {
      body: t.Object({
        targetMailboxId: t.String({ minLength: 1 })
      }),
      params: messageParamsSchema,
      response: {
        200: mailSuccessResponseSchema,
        ...mailErrorResponseSchemas
      }
    }
  )
  .delete(
    '/accounts/:accountId/mailboxes/:mailboxId/messages/:messageId',
    async ({ params, request, set }) => {
      try {
        return await deleteAgentMailMessageForWeb({
          headers: mailAuthHeaders(request),
          input: params
        })
      } catch (error) {
        return mailErrorResponse(error, set)
      }
    },
    {
      params: messageParamsSchema,
      response: {
        200: mailSuccessResponseSchema,
        ...mailErrorResponseSchemas
      }
    }
  )
  .post(
    '/accounts/:accountId/mailboxes',
    async ({ body, params, request, set }) => {
      try {
        return await createAgentMailFolderForWeb({
          accountId: params.accountId,
          headers: mailAuthHeaders(request),
          name: body.name
        })
      } catch (error) {
        return mailErrorResponse(error, set)
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 })
      }),
      params: accountParamsSchema,
      response: {
        200: typedResponseSchema<{ folder: AgentMailWebFolder; success: boolean }>(
          mailFolderMutationResponseSchema
        ),
        ...mailErrorResponseSchemas
      }
    }
  )
  .patch(
    '/accounts/:accountId/mailboxes/:mailboxId',
    async ({ body, params, request, set }) => {
      try {
        return await renameAgentMailFolderForWeb({
          accountId: params.accountId,
          headers: mailAuthHeaders(request),
          mailboxId: params.mailboxId,
          name: body.name
        })
      } catch (error) {
        return mailErrorResponse(error, set)
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 })
      }),
      params: t.Object({
        accountId: t.String({ minLength: 3 }),
        mailboxId: t.String({ minLength: 1 })
      }),
      response: {
        200: typedResponseSchema<{ folder: AgentMailWebFolder; success: boolean }>(
          mailFolderMutationResponseSchema
        ),
        ...mailErrorResponseSchemas
      }
    }
  )
  .delete(
    '/accounts/:accountId/mailboxes/:mailboxId',
    async ({ params, request, set }) => {
      try {
        await deleteAgentMailFolderForWeb({
          accountId: params.accountId,
          headers: mailAuthHeaders(request),
          mailboxId: params.mailboxId
        })
        return { success: true }
      } catch (error) {
        return mailErrorResponse(error, set)
      }
    },
    {
      params: t.Object({
        accountId: t.String({ minLength: 3 }),
        mailboxId: t.String({ minLength: 1 })
      }),
      response: {
        200: mailSuccessResponseSchema,
        ...mailErrorResponseSchemas
      }
    }
  )
  .get(
    '/status',
    async ({ request, set }) => {
      try {
        return await getAgentMailStatusForWeb(mailAuthHeaders(request))
      } catch (error) {
        return mailErrorResponse(error, set)
      }
    },
    {
      response: {
        200: typedResponseSchema<AgentMailPublicStatus>(mailPublicStatusResponseSchema),
        ...mailErrorResponseSchemas
      }
    }
  )
  .post(
    '/outbound',
    async ({ body, request, set }) => {
      try {
        return await submitAgentMailOutboundFromWeb({
          headers: mailAuthHeaders(request),
          input: {
            from: body.from,
            subject: body.subject,
            text: body.text,
            to: body.to
          }
        })
      } catch (error) {
        if (isAgentMailAccessError(error) || isAgentMailWebmailError(error)) {
          setMailAuthChallenge(error, set)
          set.status = error.status
          return { error: error.message }
        }
        set.status = 400
        return { error: error instanceof Error ? error.message : 'Invalid send request' }
      }
    },
    {
      body: t.Object({
        from: t.String({ minLength: 3 }),
        subject: t.String({ minLength: 1 }),
        text: t.String({ minLength: 1 }),
        to: t.Array(t.String({ minLength: 3 }), { minItems: 1 })
      }),
      response: {
        200: typedResponseSchema<Awaited<ReturnType<typeof submitAgentMailOutboundFromWeb>>>(
          mailOutboundResponseSchema
        ),
        ...mailErrorResponseSchemas
      }
    }
  )

type MailResponseSet = {
  headers: Record<string, number | string>
  status?: number | string
}

type MailErrorStatusCode = 400 | 401 | 403 | 404 | 502
type MailErrorBody = { error: string }

function mailErrorResponse(error: unknown, set: MailResponseSet): MailErrorBody {
  if (isAgentMailAccessError(error) || isAgentMailAdminError(error) || isAgentMailWebmailError(error)) {
    setMailAuthChallenge(error, set)
    set.status = error.status satisfies MailErrorStatusCode
    return { error: error.message }
  }

  const webmailStatus = agentMailWebErrorStatus(error)
  if (webmailStatus) {
    set.status = webmailStatus
    return {
      error: error instanceof Error ? error.message : 'Mail service failed'
    }
  }

  throw error
}

function mailErrorFetchResponse(error: unknown, set: MailResponseSet): Response {
  const body = mailErrorResponse(error, set)
  const headers = new Headers()
  const authenticate = set.headers['WWW-Authenticate']
  if (typeof authenticate === 'string') {
    headers.set('WWW-Authenticate', authenticate)
  }
  return Response.json(body, {
    headers,
    status: typeof set.status === 'number' ? set.status : 500
  })
}

function setMailAuthChallenge(error: unknown, set: MailResponseSet) {
  if (isAgentMailAccessError(error) && error.status === 401) {
    set.headers['WWW-Authenticate'] = 'Bearer realm="agentteam-email"'
  }
}

function mailAuthHeaders(request: Request) {
  const headers = new Headers(request.headers)
  headers.set('x-agentteam-request-method', request.method)
  headers.set('x-agentteam-request-url', request.url)
  return headers
}

export default mail
