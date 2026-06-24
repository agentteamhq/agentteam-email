import { z } from 'zod'

export const PAPERCLIP_EMAIL_PLUGIN_ID = 'agentteam.paperclip-email-plugin' as const

export const PaperclipOAuthClientMetadataSchema = z.looseObject({
  agentteamEmail: z
    .object({
      companyId: z.string().min(1).max(256),
      integration: z.literal('paperclip'),
      pluginId: z.literal(PAPERCLIP_EMAIL_PLUGIN_ID)
    })
    .strict()
})

export interface PaperclipOAuthClientMetadata {
  companyId: string
  pluginId: typeof PAPERCLIP_EMAIL_PLUGIN_ID
}

export function readPaperclipOAuthClientMetadata(value: unknown): PaperclipOAuthClientMetadata | null {
  const parsed = PaperclipOAuthClientMetadataSchema.safeParse(normalizedRecord(value))
  if (!parsed.success) {
    return null
  }
  return {
    companyId: parsed.data.agentteamEmail.companyId,
    pluginId: parsed.data.agentteamEmail.pluginId
  }
}

function normalizedRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      return isRecord(parsed) ? parsed : null
    } catch {
      return null
    }
  }
  return isRecord(value) ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
