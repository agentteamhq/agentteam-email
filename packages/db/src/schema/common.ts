import { bytesToUUIDv7, createUUIDv7, parseUUIDv7, uuidv7ToBase62UUIDv7 } from '@main/common'
import { Schema } from 'mongoose'
import type { Base62UUIDv7, StrictOmit, UUIDv7 } from '@main/common'

export const mongooseSchemaOptions = {
  id: false,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
  versionKey: false
} as const

export const mongooseTimestampSchemaOptions = {
  ...mongooseSchemaOptions,
  timestamps: {
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  }
} as const

export const mongooseCreatedAtOnlySchemaOptions = {
  ...mongooseSchemaOptions,
  timestamps: {
    createdAt: 'createdAt',
    updatedAt: false
  }
} as const

export function uuidV7IdField() {
  return {
    default: createUUIDv7,
    required: true,
    type: Schema.Types.UUID
  } as const
}

export function requiredUUIDv7Field() {
  return {
    required: true,
    type: Schema.Types.UUID
  } as const
}

export function optionalUUIDv7Field() {
  return {
    default: null,
    type: Schema.Types.UUID
  } as const
}

export function createdAtField() {
  return {
    default: Date.now,
    required: true,
    type: Date
  } as const
}

export function updatedAtField() {
  return {
    default: Date.now,
    required: true,
    type: Date
  } as const
}

export type SchemaFieldConstructorValue<TType> = TType extends typeof Schema.Types.UUID
  ? UUIDv7
  : TType extends typeof Schema.Types.Mixed
    ? unknown
    : TType extends StringConstructor
      ? string
      : TType extends BooleanConstructor
        ? boolean
        : TType extends DateConstructor
          ? Date
          : TType extends NumberConstructor
            ? number
            : TType extends ArrayConstructor
              ? unknown[]
              : unknown

export type SchemaFieldValue<TField> = TField extends { type: infer TType; required: true }
  ? SchemaFieldConstructorValue<TType>
  : TField extends { type: infer TType; default: null }
    ? SchemaFieldConstructorValue<TType> | null
    : TField extends { type: infer TType }
      ? SchemaFieldConstructorValue<TType> | null
      : unknown

export type SchemaRawDocument<TSchemaDefinition extends Record<PropertyKey, unknown>> = {
  [TKey in keyof TSchemaDefinition]: SchemaFieldValue<TSchemaDefinition[TKey]>
}

export type ReplaceDocumentFields<
  TDocument,
  TFields extends Partial<Record<keyof TDocument, unknown>>
> = Omit<TDocument, keyof TFields & keyof TDocument> & TFields

export type MongoosePublicView<
  TDocument extends { _id: TId },
  TId extends UUIDv7,
  TPublicId extends Base62UUIDv7
> = StrictOmit<TDocument, '_id'> & {
  id: TId
  publicId: TPublicId
}

export type UUIDBufferObject = {
  buffer: Uint8Array
}

export type MongooseUUIDValue = string | Uint8Array | UUIDBufferObject | { toString: () => string }

export function normalizeMongooseUUIDv7(value: MongooseUUIDValue): UUIDv7 {
  if (typeof value === 'string') {
    return parseUUIDv7(value)
  }

  if (value instanceof Uint8Array) {
    return bytesToUUIDv7(value)
  }

  if (hasUUIDBuffer(value)) {
    return bytesToUUIDv7(value.buffer)
  }

  return parseUUIDv7(value.toString())
}

export function publicIdFromUUIDv7(value: MongooseUUIDValue): Base62UUIDv7 {
  return uuidv7ToBase62UUIDv7(normalizeMongooseUUIDv7(value))
}

export const publicIdVirtual = {
  get(_value: unknown, _virtual: unknown, doc: { _id: MongooseUUIDValue }) {
    return publicIdFromUUIDv7(doc._id)
  }
} as const

function hasUUIDBuffer(value: object): value is UUIDBufferObject {
  return 'buffer' in value && value.buffer instanceof Uint8Array
}
