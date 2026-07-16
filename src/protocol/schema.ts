import type { AppProfile, FieldSchema, FieldType, MessageSchema } from '../domain/types'

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

export const fieldByteSize = (field: FieldSchema): number => {
  const fixed = FIXED_SIZES[field.type]
  if (fixed) return fixed
  if (!Number.isInteger(field.length) || (field.length ?? 0) <= 0) {
    throw new Error(`${field.label || field.key} 需要正整数固定长度`)
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

export const validateMessageSchema = (schema: MessageSchema): string[] => {
  const errors: string[] = []
  const min = schema.direction === 'rx' ? 0x01 : 0x80
  const max = schema.direction === 'rx' ? 0x7f : 0xef
  if (!Number.isInteger(schema.id) || schema.id < min || schema.id > max) {
    errors.push(`${schema.name || '消息'} ID必须位于0x${min.toString(16)}~0x${max.toString(16)}`)
  }
  if (!schema.name.trim()) errors.push('消息名称不能为空')
  const keys = new Set<string>()
  schema.fields.forEach((item, index) => {
    if (!KEY_PATTERN.test(item.key)) errors.push(`字段${index + 1}键名不合法`)
    if (keys.has(item.key)) errors.push(`字段键名重复：${item.key}`)
    keys.add(item.key)
    try {
      fieldByteSize(item)
    } catch (error) {
      errors.push((error as Error).message)
    }
  })
  try {
    if (payloadByteSize(schema) > 512) errors.push('Payload不能超过512字节')
  } catch {
    // Field-specific error already included.
  }
  return errors
}

export const validateProfile = (profile: AppProfile): string[] => {
  const errors: string[] = []
  if (profile.version !== 1) errors.push('配置版本必须为1')
  if (!profile.name?.trim()) errors.push('配置名称不能为空')
  const ids = new Set<string>()
  for (const schema of [...profile.rxSchemas, ...profile.txSchemas]) {
    errors.push(...validateMessageSchema(schema))
    const identity = `${schema.direction}:${schema.id}`
    if (ids.has(identity)) errors.push(`消息ID重复：${identity}`)
    ids.add(identity)
  }
  return errors
}

export const cloneProfile = (profile: AppProfile): AppProfile =>
  JSON.parse(JSON.stringify(profile)) as AppProfile
