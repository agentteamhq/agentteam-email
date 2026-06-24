import type { TSchema, TUnsafe } from '@sinclair/typebox'

export function typedResponseSchema<TResponse>(schema: TSchema): TUnsafe<TResponse> {
  return schema as TUnsafe<TResponse>
}
