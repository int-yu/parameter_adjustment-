import { describe, expect, it } from 'vitest'
import type { MessageSchema } from '../domain/types'
import { encodeFrame } from './codec'
import { FrameStreamParser } from './parser'

const telemetrySchema: MessageSchema = {
  uid: 'rx-telemetry',
  id: 0x01,
  name: 'TELEMETRY',
  direction: 'rx',
  fields: [
    { id: 'time', key: 'time_ms', label: 'Time', type: 'u32' },
    { id: 'run', key: 'run', label: 'Run', type: 'bool' },
    { id: 'mode', key: 'mode', label: 'Mode', type: 'u8' },
    { id: 'left', key: 'left_encoder', label: 'Left encoder', type: 'i32' },
    { id: 'right', key: 'right_encoder', label: 'Right encoder', type: 'i32' },
    { id: 'target', key: 'target', label: 'Target', type: 'f32' },
    { id: 'output', key: 'output', label: 'Output', type: 'f32' },
  ],
}

const values = {
  time_ms: 1234,
  run: true,
  mode: 1,
  left_encoder: -100,
  right_encoder: 120,
  target: 300,
  output: 12.5,
}

const resolver = (id: number) => id === telemetrySchema.id ? telemetrySchema : undefined

describe('FrameStreamParser', () => {
  it('parses a frame supplied one byte at a time', () => {
    const parser = new FrameStreamParser()
    const frame = encodeFrame(telemetrySchema, values, 42)
    const frames = []
    for (const byte of frame) frames.push(...parser.push(new Uint8Array([byte]), resolver).frames)
    expect(frames).toHaveLength(1)
    expect(frames[0].sequence).toBe(42)
    expect(frames[0].payloadLength).toBe(22)
    expect(frames[0].values?.output).toBeCloseTo(12.5)
  })

  it('recovers from noise, a corrupted frame and glued valid frames', () => {
    const parser = new FrameStreamParser()
    const goodA = encodeFrame(telemetrySchema, values, 1)
    const bad = encodeFrame(telemetrySchema, values, 2)
    bad[12] ^= 0xff
    const goodB = encodeFrame(telemetrySchema, values, 3)
    const input = new Uint8Array(3 + goodA.length + bad.length + goodB.length)
    input.set([0x12, 0x34, 0x56])
    input.set(goodA, 3)
    input.set(bad, 3 + goodA.length)
    input.set(goodB, 3 + goodA.length + bad.length)
    const result = parser.push(input, resolver)
    expect(result.frames.map((frame) => frame.sequence)).toEqual([1, 3])
    expect(result.issues.some((issue) => issue.kind === 'noise')).toBe(true)
    expect(result.issues.some((issue) => issue.kind === 'crc')).toBe(true)
  })

  it('keeps a valid unknown message as raw payload', () => {
    const unknownSchema = { ...telemetrySchema, id: 0x03 }
    const parser = new FrameStreamParser()
    const result = parser.push(encodeFrame(unknownSchema, values, 5), () => undefined)
    expect(result.frames).toHaveLength(1)
    expect(result.frames[0].schema).toBeUndefined()
    expect(result.frames[0].values).toBeUndefined()
  })

  it('clears partial data on reset', () => {
    const parser = new FrameStreamParser()
    const frame = encodeFrame(telemetrySchema, values, 7)
    parser.push(frame.slice(0, 10), resolver)
    parser.reset()
    expect(parser.push(frame.slice(10), resolver).frames).toHaveLength(0)
    expect(parser.push(frame, resolver).frames).toHaveLength(1)
  })

  it('recovers from a bad tail and an oversized length header', () => {
    const parser = new FrameStreamParser()
    const badTail = encodeFrame(telemetrySchema, values, 8)
    badTail[badTail.length - 1] = 0
    const oversized = new Uint8Array([0xaa, 0x55, 1, 1, 0, 0, 1, 2])
    const good = encodeFrame(telemetrySchema, values, 9)
    const input = new Uint8Array(badTail.length + oversized.length + good.length)
    input.set(badTail)
    input.set(oversized, badTail.length)
    input.set(good, badTail.length + oversized.length)

    const result = parser.push(input, resolver)
    expect(result.frames.map((frame) => frame.sequence)).toEqual([9])
    expect(result.issues.some((issue) => issue.kind === 'tail')).toBe(true)
    expect(result.issues.some((issue) => issue.kind === 'length')).toBe(true)
  })

  it('parses glued frames split into irregular chunks', () => {
    const parser = new FrameStreamParser()
    const frames = [10, 11, 12].map((sequence) => encodeFrame(telemetrySchema, values, sequence))
    const glued = new Uint8Array(frames.reduce((sum, frame) => sum + frame.length, 0))
    let offset = 0
    frames.forEach((frame) => { glued.set(frame, offset); offset += frame.length })
    const parsed = []
    for (let cursor = 0; cursor < glued.length;) {
      const size = [1, 7, 3, 19, 2][cursor % 5]
      parsed.push(...parser.push(glued.slice(cursor, cursor + size), resolver).frames)
      cursor += size
    }
    expect(parsed.map((frame) => frame.sequence)).toEqual([10, 11, 12])
  })
})
