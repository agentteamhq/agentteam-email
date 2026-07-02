import { z } from 'zod'

import { globals } from '../globals'
import { PAPERCLIP_EMAIL_PLUGIN_ID, readPaperclipOAuthClientMetadata } from '../agent-access/paperclip'
import type {
  OAuthClientDocument,
  OrganizationId,
  UserId
} from '@main/db'

export class IntegrationsError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 401 | 403 | 404 | 409
  ) {
    super(message)
    this.name = 'IntegrationsError'
  }
}

export function isIntegrationsError(error: unknown): error is IntegrationsError {
  return error instanceof IntegrationsError
}

export type PaperclipIntegrationStatus = 'connected' | 'needs_reauthorization' | 'unavailable'

export interface PaperclipIntegration {
  clientId: string
  name: string
  pluginId: 'agentteam.paperclip-email-plugin'
  requiresReauthorization: boolean
  status: PaperclipIntegrationStatus
}

export interface IntegrationsAllowedActions {
  revokePaperclip: boolean
}

export interface IntegrationsView {
  allowedActions: IntegrationsAllowedActions
  organizationId: string
  paperclip: {
    available: boolean
    connections: ReadonlyArray<PaperclipIntegration>
  }
  state: 'empty' | 'ready'
}

export interface RevokePaperclipIntegrationResult {
  status: 'revoked'
  success: true
  view: IntegrationsView
}

export const RevokePaperclipIntegrationInput = z
  .object({
    clientId: z.string().trim().min(1).max(256)
  })
  .strict()
export type RevokePaperclipIntegrationInput = Readonly<
  z.infer<typeof RevokePaperclipIntegrationInput>
>

type PaperclipOAuthClientRecord = Pick<
  OAuthClientDocument,
  'clientId' | 'disabled' | 'metadata' | 'name' | 'softwareId'
>

const PAPERCLIP_OAUTH_CLIENT_PROJECTION = {
  clientId: 1,
  disabled: 1,
  metadata: 1,
  name: 1,
  softwareId: 1
} as const satisfies Record<keyof PaperclipOAuthClientRecord, 1>

export async function getIntegrationsViewForWeb({
  headers
}: {
  headers: Headers
}): Promise<IntegrationsView> {
  const { db } = await globals()
  const context = await requireIntegrationsUserContext(headers)
  const paperclipClients = await listPaperclipOAuthClients()
  const paperclipAuthorizations = await listPaperclipAuthorizations({
    clientRecords: paperclipClients,
    organizationId: context.organizationId,
    userId: context.userId
  })

  return toIntegrationsView({
    connections: paperclipAuthorizations,
    organizationId: context.organizationId,
    paperclipAvailable: paperclipClients.length > 0
  })

  async function listPaperclipOAuthClients() {
    const candidates = await db.models.oauthClient
      .find(
        {
          $or: [
            { softwareId: PAPERCLIP_EMAIL_PLUGIN_ID },
            { 'metadata.agentteamEmail.integration': 'paperclip' }
          ]
        },
        PAPERCLIP_OAUTH_CLIENT_PROJECTION
      )
      .exec()

    return candidates.filter(isPaperclipOAuthClient)
  }

  async function listPaperclipAuthorizations({
    clientRecords,
    organizationId,
    userId
  }: {
    clientRecords: ReadonlyArray<PaperclipOAuthClientRecord>
    organizationId: OrganizationId
    userId: UserId
  }) {
    const clientIds = clientRecords.map((client) => client.clientId).filter(Boolean)
    if (clientIds.length === 0) {
      return []
    }

    const [consents, refreshTokens] = await Promise.all([
      db.models.oauthConsent
        .find({
          clientId: { $in: clientIds },
          referenceId: organizationId,
          userId
        })
        .exec(),
      db.models.oauthRefreshToken
        .find({
          clientId: { $in: clientIds },
          expiresAt: { $gt: new Date() },
          referenceId: organizationId,
          revoked: null,
          userId
        })
        .exec()
    ])
    const consentByClientId = new Map(consents.map((consent) => [consent.clientId, consent]))
    const activeRefreshTokenClientIds = new Set(refreshTokens.map((token) => token.clientId))

    return clientRecords
      .flatMap((client) => {
        const consent = consentByClientId.get(client.clientId)
        if (!consent) {
          return []
        }
        const integration = toPaperclipIntegration({
          client,
          hasActiveRefreshToken: activeRefreshTokenClientIds.has(client.clientId)
        })
        return integration ? [integration] : []
      })
      .sort((left, right) => left.name.localeCompare(right.name))
  }
}

export async function revokePaperclipIntegrationForWeb({
  headers,
  input
}: {
  headers: Headers
  input: unknown
}): Promise<RevokePaperclipIntegrationResult> {
  const { db } = await globals()
  const context = await requireIntegrationsUserContext(headers)
  const parsedInput = parseInput(RevokePaperclipIntegrationInput, input)
  const client = await db.models.oauthClient
    .findOne({ clientId: parsedInput.clientId }, PAPERCLIP_OAUTH_CLIENT_PROJECTION)
    .exec()

  if (!client || !isPaperclipOAuthClient(client)) {
    throw new IntegrationsError('Paperclip integration was not found', 404)
  }

  const revokeFilter = {
    clientId: client.clientId,
    referenceId: context.organizationId,
    userId: context.userId
  }
  const revokedAt = new Date()

  const [consentDelete, refreshUpdate] = await Promise.all([
    db.models.oauthConsent.deleteMany(revokeFilter).exec(),
    db.models.oauthRefreshToken
      .updateMany({ ...revokeFilter, revoked: null }, { $set: { revoked: revokedAt } })
      .exec(),
    db.models.oauthAccessToken.deleteMany(revokeFilter).exec()
  ])

  const deletedConsentCount = readCount(consentDelete.deletedCount)
  const revokedRefreshTokenCount = readCount(refreshUpdate.modifiedCount)
  if (deletedConsentCount === 0 && revokedRefreshTokenCount === 0) {
    throw new IntegrationsError('Paperclip integration authorization was not found', 404)
  }

  await db.models.auditLog.create({
    action: 'integrations.paperclip_oauth.revoked',
    metadata: {
      clientId: client.clientId,
      organizationId: String(context.organizationId)
    },
    severity: 'medium',
    status: 'success',
    userId: context.userId
  })

  return {
    status: 'revoked',
    success: true,
    view: await getIntegrationsViewForWeb({ headers })
  }
}

async function requireIntegrationsUserContext(headers: Headers) {
  const { auth, db } = await globals()
  const session = await auth.api.getSession({ headers })
  if (!session?.user) {
    throw new IntegrationsError('Authentication required', 401)
  }

  const userId = session.user.id as UserId
  const organizationId =
    typeof session.session.activeOrganizationId === 'string' && session.session.activeOrganizationId
      ? (session.session.activeOrganizationId as OrganizationId)
      : null
  if (!organizationId) {
    throw new IntegrationsError('An active organization is required', 403)
  }

  const member = await db.models.member.findOne({ organizationId, userId }).exec()
  if (!member) {
    throw new IntegrationsError('Organization access is required', 403)
  }

  return { organizationId, userId }
}

function toIntegrationsView({
  connections,
  organizationId,
  paperclipAvailable
}: {
  connections: ReadonlyArray<PaperclipIntegration>
  organizationId: OrganizationId
  paperclipAvailable: boolean
}): IntegrationsView {
  return {
    allowedActions: {
      revokePaperclip: connections.length > 0
    },
    organizationId: String(organizationId),
    paperclip: {
      available: paperclipAvailable,
      connections
    },
    state: connections.length === 0 ? 'empty' : 'ready'
  }
}

function toPaperclipIntegration({
  client,
  hasActiveRefreshToken
}: {
  client: PaperclipOAuthClientRecord
  hasActiveRefreshToken: boolean
}): PaperclipIntegration | null {
  const name = client.name?.trim()
  if (!name) {
    return null
  }

  const disabled = client.disabled
  const requiresReauthorization = !disabled && !hasActiveRefreshToken

  return {
    clientId: client.clientId,
    name,
    pluginId: PAPERCLIP_EMAIL_PLUGIN_ID,
    requiresReauthorization,
    status: disabled ? 'unavailable' : requiresReauthorization ? 'needs_reauthorization' : 'connected'
  }
}

function isPaperclipOAuthClient(client: PaperclipOAuthClientRecord): boolean {
  if (client.softwareId === PAPERCLIP_EMAIL_PLUGIN_ID) {
    return true
  }
  const metadata = readPaperclipOAuthClientMetadata(client.metadata)
  return metadata?.pluginId === PAPERCLIP_EMAIL_PLUGIN_ID
}

function parseInput<TValue>(schema: z.ZodType<TValue>, input: unknown): TValue {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    throw new IntegrationsError('Invalid request input', 400)
  }
  return parsed.data
}

function readCount(value: unknown) {
  return typeof value === 'number' ? value : 0
}
