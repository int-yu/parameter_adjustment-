import type { FieldSchema, FieldValue, MessageSchema } from '../domain/types'
import { crc16CcittFalse } from './crc'
import { fieldByteSize, payloadByteSize } from './schema'

export const FRAME_HEAD = new Uint8Array([0xaa, 0x55])
export const FRAME_TAIL = new Uint8Array([0x0d, 0x0a])
export const PROTOCOL_VERSION = 0x01
export const MAX_PAYLOAD = 512

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: false })

const requireNumber = (value: FieldValue | undefined, field: FieldSchema): number => {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) throw new Error(`${field.label} is not a valid number`)
  return number
}

const parseHex = (value: string): Uint8Array => {
  const normalized = value.replace(/0x/gi, '').replace(/[^0-9a-f]/gi, '')
  if (normalized.length % 2 !== 0) throw new Error('HEX bytes must be paired')
  const bytes = new Uint8Array(normalized.length / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes
}

const encodeFixedString = (value: string, length: number): Uint8Array => {
  const output = new Uint8Array(length)
  let offset = 0
  for (const character of value) {
    const bytes = encoder.encode(character)
    if (offset + bytes.length > length) break
    output.set(bytes, offset)
    offset += bytes.length
  }
  return output
}

export const encodePayload = (
  schema: MessageSchema,
  values: Record<string, FieldValue>,
): Uint8Array => {
  const payload = new Uint8Array(payloadByteSize(schema))
  const view = new DataView(payload.buffer)
  let offset = 0
  for (const field of schema.fields) {
    const value = values[field.key]
    switch (field.type) {
      case 'bool':
        view.setUint8(offset, value ? 1 : 0)
        break
      case 'u8':
        view.setUint8(offset, requireNumber(value, field))
        break
      case 'i8':
        view.setInt8(offset, requireNumber(value, field))
        break
      case 'u16':
        view.setUint16(offset, requireNumber(value, field), true)
        break
      case 'i16':
        view.setInt16(offset, requireNumber(value, field), true)
        break
      case 'u32':
        view.setUint32(offset, requireNumber(value, field), true)
        break
      case 'i32':
        view.setInt32(offset, requireNumber(value, field), true)
        break
      case 'f32':
        view.setFloat32(offset, requireNumber(value, field), true)
        break
      case 'f64':
        view.setFloat64(offset, requireNumber(value, field), true)
        break
      case 'fixed-string': {
        const bytes = encodeFixedString(String(value ?? ''), fieldByteSize(field))
        payload.set(bytes, offset)
        break
      }
      case 'fixed-bytes': {
        const bytes = value instanceof Uint8Array ? value : parseHex(String(value ?? ''))
        if (bytes.length > fieldByteSize(field)) throw new Error(`${field.label} exceeds the fixed length`)
        payload.set(bytes, offset)
        break
      }
    }
    offset += fieldByteSize(field)
  }
  return payload
}

export const decodePayload = (
  schema: MessageSchema,
  payload: Uint8Array,
): Record<string, FieldValue> => {
  if (payload.length !== payloadByteSize(schema)) {
    throw new Error(`Payload length ${payload.length} does not match schema length ${payloadByteSize(schema)}`)
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  const values: Record<string, FieldValue> = {}
  let offset = 0
  for (const field of schema.fields) {
    const size = fieldByteSize(field)
    switch (field.type) {
      case 'bool': {
        const raw = view.getUint8(offset)
        if (raw !== 0 && raw !== 1) throw new Error(`${field.label} bool value must be 0 or 1`)
        values[field.key] = raw === 1
        break
      }
      case 'u8': values[field.key] = view.getUint8(offset); break
      case 'i8': values[field.key] = view.getInt8(offset); break
      case 'u16': values[field.key] = view.getUint16(offset, true); break
      case 'i16': values[field.key] = view.getInt16(offset, true); break
      case 'u32': values[field.key] = view.getUint32(offset, true); break
      case 'i32': values[field.key] = view.getInt32(offset, true); break
      case 'f32': values[field.key] = view.getFloat32(offset, true); break
      case 'f64': values[field.key] = view.getFloat64(offset, true); break
      case 'fixed-string': {
        const bytes = payload.slice(offset, offset + size)
        const end = bytes.indexOf(0)
        values[field.key] = decoder.decode(end >= 0 ? bytes.slice(0, end) : bytes)
        break
      }
      case 'fixed-bytes': values[field.key] = payload.slice(offset, offset + size); break
    }
    offset += size
  }
  return values
}

export const encodeFrame = (
  schema: MessageSchema,
  values: Record<string, FieldValue>,
  sequence: number,
): Uint8Array => {
  const payload = encodePayload(schema, values)
  if (payload.length > MAX_PAYLOAD) throw new Error('Payload exceeds 512 bytes')
  const frame = new Uint8Array(payload.length + 12)
  const view = new DataView(frame.buffer)
  frame.set(FRAME_HEAD, 0)
  view.setUint8(2, PROTOCOL_VERSION)
  view.setUint8(3, schema.id)
  view.setUint16(4, sequence & 0xffff, true)
  view.setUint16(6, payload.length, true)
  frame.set(payload, 8)
  const crc = crc16CcittFalse(frame.slice(2, 8 + payload.length))
  view.setUint16(8 + payload.length, crc, true)
  frame.set(FRAME_TAIL, 10 + payload.length)
  return frame
}

export const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ')

export const bytesToAscii = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.')).join('')

export const hexToBytes = parseHex
