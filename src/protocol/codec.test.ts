import { describe, expect, it } from 'vitest'
import type { FrameFormat, MessageSchema } from '../domain/types'
import { decodePayload, encodeFrame, encodePayload } from './codec'
import { payloadByteSize, validateMessageSchema } from './schema'

const schema: MessageSchema = {
  uid: 'tx-all-types',
  id: 0x81,
  name: 'ALL_TYPES',
  direction: 'tx',
  fields: [
    { id: '1', key: 'flag', label: 'Flag', type: 'bool' },
    { id: '2', key: 'u8', label: 'U8', type: 'u8' },
    { id: '3', key: 'i8', label: 'I8', type: 'i8' },
    { id: '4', key: 'u16', label: 'U16', type: 'u16' },
    { id: '5', key: 'i16', label: 'I16', type: 'i16' },
    { id: '6', key: 'u32', label: 'U32', type: 'u32' },
    { id: '7', key: 'i32', label: 'I32', type: 'i32' },
    { id: '8', key: 'f32', label: 'F32', type: 'f32' },
    { id: '9', key: 'f64', label: 'F64', type: 'f64' },
    { id: '10', key: 'text', label: 'Text', type: 'fixed-string', length: 6 },
    { id: '11', key: 'bytes', label: 'Bytes', type: 'fixed-bytes', length: 4 },
  ],
}

describe('payload codec', () => {
  it('round-trips every supported type without alignment padding', () => {
    const values = {
      flag: true,
      u8: 250,
      i8: -12,
      u16: 60000,
      i16: -1234,
      u32: 4_000_000_000,
      i32: -123_456_789,
      f32: 1.25,
      f64: Math.PI,
      text: 'TEST',
      bytes: 'DE AD BE EF',
    }
    const payload = encodePayload(schema, values)
    expect(payload.length).toBe(payloadByteSize(schema))
    const decoded = decodePayload(schema, payload)
    expect(decoded.flag).toBe(true)
    expect(decoded.u8).toBe(250)
    expect(decoded.i8).toBe(-12)
    expect(decoded.u16).toBe(60000)
    expect(decoded.i16).toBe(-1234)
    expect(decoded.u32).toBe(4_000_000_000)
    expect(decoded.i32).toBe(-123_456_789)
    expect(decoded.f32).toBeCloseTo(1.25)
    expect(decoded.f64).toBeCloseTo(Math.PI)
    expect(decoded.text).toBe('TEST')
    expect(Array.from(decoded.bytes as Uint8Array)).toEqual([0xde, 0xad, 0xbe, 0xef])
  })

  it('writes sequence 65535 and little-endian payload length', () => {
    const frame = encodeFrame(schema, {
      flag: false, u8: 0, i8: 0, u16: 0, i16: 0, u32: 0, i32: 0, f32: 0, f64: 0, text: '', bytes: '',
    }, 0xffff)
    const view = new DataView(frame.buffer)
    expect(view.getUint16(4, true)).toBe(0xffff)
    expect(view.getUint16(6, true)).toBe(payloadByteSize(schema))
  })

  it('encodes a custom frame head, tail, endian and crc mode', () => {
    const format: FrameFormat = {
      head: [0xfe, 0xef, 0x10],
      tail: [0xee],
      version: 0x22,
      maxPayload: 128,
      sequenceEndian: 'big',
      lengthEndian: 'big',
      crcMode: 'none',
      crcEndian: 'little',
    }
    const frame = encodeFrame(schema, {
      flag: false, u8: 1, i8: 2, u16: 3, i16: 4, u32: 5, i32: 6, f32: 7, f64: 8, text: '', bytes: '',
    }, 0x1234, format)
    expect(Array.from(frame.slice(0, 3))).toEqual([0xfe, 0xef, 0x10])
    expect(frame[3]).toBe(0x22)
    expect(frame[4]).toBe(0x81)
    expect(Array.from(frame.slice(5, 7))).toEqual([0x12, 0x34])
    expect(Array.from(frame.slice(7, 9))).toEqual([0x00, payloadByteSize(schema)])
    expect(frame.at(-1)).toBe(0xee)
  })

  it('rejects invalid IDs, duplicate keys and oversized fields', () => {
    const invalid: MessageSchema = { uid: 'bad', id: 0x01, name: '', direction: 'tx', fields: [
      { id: '1', key: 'bad-key', label: 'A', type: 'fixed-bytes', length: 513 },
      { id: '2', key: 'bad-key', label: 'B', type: 'u8' },
    ] }
    expect(validateMessageSchema(invalid).length).toBeGreaterThanOrEqual(4)
  })

  it('rejects invalid periodic TX intervals', () => {
    const invalid: MessageSchema = {
      uid: 'periodic-bad',
      id: 0x82,
      name: 'PERIODIC_BAD',
      direction: 'tx',
      fields: [],
      periodicSend: true,
      periodMs: 10,
    }
    expect(validateMessageSchema(invalid)).toContain('PERIODIC_BAD period must be 20-60000 ms')
  })
})
