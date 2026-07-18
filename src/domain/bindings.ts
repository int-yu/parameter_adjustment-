import type { FieldSchema, FieldValue, MessageSchema } from './types'
import { defaultValueForField, isNumericField } from '../protocol/schema'

export const allSchemas = (rxSchemas: MessageSchema[], txSchemas: MessageSchema[]) => [...rxSchemas, ...txSchemas]

export const findMessage = (schemas: MessageSchema[], messageUid?: string) =>
  schemas.find((schema) => schema.uid === messageUid)

export const findField = (schema: MessageSchema | undefined, fieldId?: string) =>
  schema?.fields.find((field) => field.id === fieldId)

export const numericFields = (schemas: MessageSchema[]) =>
  schemas.flatMap((message) => message.fields.filter(isNumericField).map((field) => ({ message, field })))

export const valueForField = (
  values: Record<string, FieldValue> | undefined,
  field: FieldSchema | undefined,
) => {
  if (!field) return undefined
  return values?.[field.key] ?? defaultValueForField(field)
}

export const buildTxValues = (
  schemas: MessageSchema[],
  existing: Record<string, Record<string, FieldValue>> = {},
) => Object.fromEntries(schemas.map((schema) => [
  schema.uid,
  Object.fromEntries(schema.fields.map((field) => [
    field.key,
    existing[schema.uid]?.[field.key] ?? defaultValueForField(field),
  ])),
]))
