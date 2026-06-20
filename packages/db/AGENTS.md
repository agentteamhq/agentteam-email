# DB Package Agent Requirements

## Schema-Owned Types

- Mongoose schema definitions under `src/schema` are the database source of
  truth. Export document types next to the schema using
  `InferRawDocType<typeof schemaDefinition>`, narrowing only branded ids or
  canonical JSON fields that Mongoose cannot infer.
- Mongo `_id` fields must use `Schema.Types.UUID` through `uuidV7IdField`,
  `requiredUUIDv7Field`, or `optionalUUIDv7Field`. Model document types must
  brand `_id` with the collection-specific `UUIDv7` type via
  `ReplaceDocumentFields`, not by treating ids as `ObjectId` or plain strings.

## Public Types

- Public/read DTO types must be exported next to the schema declaration and
  derived from the schema-inferred document type with `StrictOmit`, for example:

  ```ts
  export type UserPublicDTO = StrictOmit<UserDocument, '_id' | 'passwordHash'> & { id: UserId }
  ```

- API, RPC, frontend, Storybook, and test code must import public/read DTOs from
  `@main/db` instead of redeclaring database shapes.

## UUID Public IDs

- Public ids are virtual base62 encodings of the same UUIDv7 `_id`. Use
  `publicIdVirtual`, `publicIdFromUUIDv7`, `parseBase62UUIDv7`, and
  `base62UUIDv7ToUUIDv7`; do not persist a second public-id column.
- Queries received as public ids must parse the branded base62 value and query
  the UUID `_id`. Do not query the virtual `publicId` field or duplicate the
  conversion logic in this package.

## Better Auth

- Better Auth Mongo setup must use `createBetterAuthMongoAdapter` or
  `createBetterAuthMongoAdapterFromMongooseConnection` from `@main/db`.
  Auth collection schemas belong in `src/schema/better-auth.ts` and must stay
  aligned with the Better Auth Mongo adapter shape.

## Schema Ownership

- Put database schema declarations under `packages/db/src/schema` and export
  every schema module from `packages/db/src/schema/index.ts`.
- MongoDB schema generation or migration is not part of this package. Do not
  add Drizzle, Postgres, or migration-generation code here.
