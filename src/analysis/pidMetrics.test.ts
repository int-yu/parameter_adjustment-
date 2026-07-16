import { describe, expect, it } from 'vitest'
import type { DecodedFrame } from '../domain/types'
import { DEFAULT_PROFILE } from '../domain/defaultProfile'
import { buildPidPoints, calculatePidMetrics } from './pidMetrics'

const frame = (sequence: number, time: number, count: number): DecodedFrame => ({
  receivedAt: time,
  version: 1,
  messageId: 1,
  sequence,
  payloadLength: 0,
  payload: new Uint8Array(),
  raw: new Uint8Array(),
  values: { time_ms: time, left_target_cps: 100, left_encoder: count, left_output: 25 },
})

describe('PID metrics', () => {
  it('derives wheel speed from counter and MCU time', () => {
    const mapping = DEFAULT_PROFILE.pidMappings[0]
    const points = buildPidPoints([frame(0, 0, 0), frame(1, 100, 10), frame(2, 200, 20)], mapping)
    expect(points).toHaveLength(2)
    expect(points[0].feedback).toBeCloseTo(100)
    expect(points[0].error).toBeCloseTo(0)
    const metrics = calculatePidMetrics(points, 100)
    expect(metrics.sampleRate).toBeCloseTo(10)
    expect(metrics.rms).toBeCloseTo(0)
    expect(metrics.saturationRatio).toBe(0)
  })

  it('handles signed 32-bit counter rollover', () => {
    const mapping = DEFAULT_PROFILE.pidMappings[0]
    const points = buildPidPoints([frame(0, 0, 2_147_483_645), frame(1, 100, -2_147_483_641)], mapping)
    expect(points[0].feedback).toBeCloseTo(100)
  })
})
