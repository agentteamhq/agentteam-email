import { Value } from '@sinclair/typebox/value'
import { t } from 'elysia'

import type { AgentMailWorkspaceInput } from './webmail-service'

/**
 * Owning request contract for the mail workspace read model.
 *
 * The browser reaches this read through `GET /rpc/mail/workspace` and the server render
 * reaches it through `loadMailWorkspaceRoute`. Both entry points validate against this one
 * schema so a caller cannot widen the accepted input by choosing a different entry point.
 */
export const agentMailWorkspaceInputSchema = t.Object({
  accountId: t.Optional(t.String({ minLength: 3 })),
  cursor: t.Optional(t.String({ minLength: 1 })),
  direction: t.Optional(t.Union([t.Literal('next'), t.Literal('previous')])),
  folderId: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
  messageId: t.Optional(t.String({ minLength: 1 })),
  query: t.Optional(t.String()),
  unreadOnly: t.Optional(t.Boolean())
})

export interface AgentMailWorkspaceInputSchemaError {
  message: string
  path: string
}

export type AgentMailWorkspaceInputValidation =
  | {
      input: AgentMailWorkspaceInput
      valid: true
    }
  | {
      errors: Array<AgentMailWorkspaceInputSchemaError>
      valid: false
    }

/**
 * Validates an untrusted workspace input against the owning schema.
 *
 * Unknown properties are removed before the check so a caller cannot smuggle extra fields
 * into the service, and the returned value is the cleaned input. Assigning the checked
 * value to `AgentMailWorkspaceInput` is also the compile-time guard that the schema and the
 * owning TypeScript contract stay aligned.
 */
export function validateAgentMailWorkspaceInput(input: unknown): AgentMailWorkspaceInputValidation {
  const candidate: unknown = Value.Clean(
    agentMailWorkspaceInputSchema,
    Value.Clone(input ?? {}) as Record<string, unknown>
  )

  if (!Value.Check(agentMailWorkspaceInputSchema, candidate)) {
    return {
      errors: [...Value.Errors(agentMailWorkspaceInputSchema, candidate)].map((error) => ({
        message: error.message,
        path: error.path
      })),
      valid: false
    }
  }

  return {
    input: candidate,
    valid: true
  }
}
