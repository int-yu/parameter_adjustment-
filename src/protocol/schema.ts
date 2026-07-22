import type { AppProfile, FieldSchema, FieldType, MessageSchema, NumericFieldType } from '../domain/types'
import { DEFAULT_FRAME_FORMAT, normalizeFrameFormat, validateFrameFormat } from './frameFormat'

const FIXED_SIZES: Partial<Record<FieldType, number>> = {
  bool: 1,
  u8: 1,
  i8: 1,
  u16: 2,
  i16: 2,
  u32: 4,
  i32: 4,
  f32: 4,
  f64: 8,
}

export const NUMERIC_FIELD_TYPES: NumericFieldType[] = ['u8', 'i8', 'u16', 'i16', 'u32', 'i32', 'f32', 'f64']
export const isNumericField = (field: FieldSchema): field is FieldSchema & { type: NumericFieldType } =>
  NUMERIC_FIELD_TYPES.includes(field.type as NumericFieldType)

export const isIntegerField = (field: FieldSchema) =>
  ['u8', 'i8', 'u16', 'i16', 'u32', 'i32'].includes(field.type)

export const isFloatField = (field: FieldSchema) => ['f32', 'f64'].includes(field.type)

export const fieldByteSize = (field: FieldSchema): number => {
  const fixed = FIXED_SIZES[field.type]
  if (fixed) return fixed
  if (!Number.isInteger(field.length) || (field.length ?? 0) <= 0) {
    throw new Error(`${field.label || field.key} needs a positive fixed length`)
  }
  return field.length as number
}

export const payloadByteSize = (schema: MessageSchema): number =>
  schema.fields.reduce((total, item) => total + fieldByteSize(item), 0)

export const defaultValueForField = (field: FieldSchema) => {
  if (field.defaultValue !== undefined) return field.defaultValue
  if (field.type === 'bool') return false
  if (field.type === 'fixed-string' || field.type === 'fixed-bytes') return ''
  return 0
}

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

export const validateMessageSchema = (schema: MessageSchema, maxPayload = DEFAULT_FRAME_FORMAT.maxPayload): string[] => {
  const errors: string[] = []
  const min = schema.direction === 'rx' ? 0x01 : 0x80
  const max = schema.direction === 'rx' ? 0x7f : 0xef
  if (!schema.uid?.trim()) errors.push(`${schema.name || 'message'} is missing an internal uid`)
  if (!Number.isInteger(schema.id) || schema.id < min || schema.id > max) {
    errors.push(`${schema.name || 'message'} ID must be 0x${min.toString(16)}-0x${max.toString(16)}`)
  }
  if (!schema.name.trim()) errors.push('Message name is required')
  if (schema.direction === 'tx' && schema.periodicSend) {
    if (!Number.isInteger(schema.periodMs) || (schema.periodMs ?? 0) < 20 || (schema.periodMs ?? 0) > 60000) {
      errors.push(`${schema.name || 'message'} period must be 20-60000 ms`)
    }
  }
  const keys = new Set<string>()
  const fieldIds = new Set<string>()
  schema.fields.forEach((item, index) => {
    if (!item.id?.trim()) errors.push(`Field ${index + 1} is missing an internal id`)
    if (fieldIds.has(item.id)) errors.push(`Field id is duplicated: ${item.id}`)
    fieldIds.add(item.id)
    if (!KEY_PATTERN.test(item.key)) errors.push(`Field ${index + 1} key is invalid`)
    if (keys.has(item.key)) errors.push(`Field key is duplicated: ${item.key}`)
    keys.add(item.key)
    try {
      fieldByteSize(item)
    } catch (error) {
      errors.push((error as Error).message)
    }
  })
  try {
    if (payloadByteSize(schema) > maxPayload) errors.push(`Payload cannot exceed ${maxPayload} bytes`)
  } catch {
    // Field-specific error already included.
  }
  return errors
}

export const validateProfile = (profile: AppProfile): string[] => {
  const errors: string[] = []
  if (profile.version !== 2) errors.push('Profile version must be 2')
  if (!profile.name?.trim()) errors.push('Profile name is required')
  if (!Number.isFinite(profile.serial.baudRate) || profile.serial.baudRate < 300) errors.push('Baud rate must be at least 300')
  if (!Number.isInteger(profile.history.maxFrames) || profile.history.maxFrames < 100 || profile.history.maxFrames > 50000) errors.push('Frame history must be 100-50000')
  if (!Number.isInteger(profile.history.maxLogs) || profile.history.maxLogs < 100 || profile.history.maxLogs > 20000) errors.push('Log history must be 100-20000')
  if (!Number.isFinite(profile.chart.timeWindowSeconds) || profile.chart.timeWindowSeconds < 1 || profile.chart.timeWindowSeconds > 3600) errors.push('Chart window must be 1-3600 seconds')
  const frameFormat = normalizeFrameFormat(profile.frameFormat)
  errors.push(...validateFrameFormat(frameFormat))

  const identities = new Set<string>()
  const uids = new Set<string>()
  for (const schema of [...profile.rxSchemas, ...profile.txSchemas]) {
    errors.push(...validateMessageSchema(schema, frameFormat.maxPayload))
    const identity = `${schema.direction}:${schema.id}`
    if (identities.has(identity)) errors.push(`Message ID is duplicated: ${identity}`)
    identities.add(identity)
    if (uids.has(schema.uid)) errors.push(`Message uid is duplicated: ${schema.uid}`)
    uids.add(schema.uid)
  }
  return errors
}

export const cloneProfile = (profile: AppProfile): AppProfile =>
  JSON.parse(JSON.stringify(profile)) as AppProfile
