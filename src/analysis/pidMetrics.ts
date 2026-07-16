import type { DecodedFrame, PidMapping } from '../domain/types'

export interface PidPoint {
  time: number
  target: number
  feedback: number
  error: number
  output: number
  encoder?: number
}

export interface PidMetrics {
  sampleRate: number
  rms: number
  mae: number
  peak: number
  bias: number
  zeroCrossings: number
  overshoot: number
  settlingTime: number
  saturationRatio: number
}

const numberValue = (value: unknown): number => typeof value === 'number' ? value : Number.NaN

const wrappedError = (target: number, feedback: number, wrap?: number) => {
  let error = target - feedback
  if (wrap && wrap > 0) {
    const half = wrap / 2
    error = ((error + half) % wrap + wrap) % wrap - half
  }
  return error
}

const counterDelta = (current: number, previous: number) => {
  let delta = current - previous
  if (delta > 0x7fffffff) delta -= 0x100000000
  if (delta < -0x80000000) delta += 0x100000000
  return delta
}

export const buildPidPoints = (frames: DecodedFrame[], mapping: PidMapping): PidPoint[] => {
  const relevant = frames.filter((frame) => frame.messageId === mapping.messageId && frame.values)
  const points: PidPoint[] = []
  let previousTime = Number.NaN
  let previousCounter = Number.NaN
  for (const frame of relevant) {
    const values = frame.values as Record<string, unknown>
    const timeMs = numberValue(values[mapping.timeField])
    const target = numberValue(values[mapping.targetField])
    const source = numberValue(values[mapping.feedbackField])
    const output = numberValue(values[mapping.outputField])
    if (![timeMs, target, source, output].every(Number.isFinite)) continue
    let feedback = source
    if (mapping.feedbackMode === 'counter-rate') {
      if (!Number.isFinite(previousTime) || timeMs <= previousTime) {
        previousTime = timeMs
        previousCounter = source
        continue
      }
      feedback = counterDelta(source, previousCounter) / ((timeMs - previousTime) / 1000)
      previousCounter = source
      previousTime = timeMs
    }
    const encoder = mapping.encoderField ? numberValue(values[mapping.encoderField]) : undefined
    points.push({
      time: timeMs / 1000,
      target,
      feedback,
      error: wrappedError(target, feedback, mapping.angleWrap),
      output,
      encoder: Number.isFinite(encoder) ? encoder : undefined,
    })
  }
  return points
}

const finiteOrNaN = (value: number) => Number.isFinite(value) ? value : Number.NaN

export const calculatePidMetrics = (points: PidPoint[], outputLimit?: number): PidMetrics => {
  if (points.length < 2) {
    return { sampleRate: Number.NaN, rms: Number.NaN, mae: Number.NaN, peak: Number.NaN, bias: Number.NaN, zeroCrossings: 0, overshoot: Number.NaN, settlingTime: Number.NaN, saturationRatio: Number.NaN }
  }
  const errors = points.map((point) => point.error)
  const duration = points.at(-1)!.time - points[0].time
  const sampleRate = duration > 0 ? (points.length - 1) / duration : Number.NaN
  const rms = Math.sqrt(errors.reduce((sum, error) => sum + error * error, 0) / errors.length)
  const mae = errors.reduce((sum, error) => sum + Math.abs(error), 0) / errors.length
  const peak = Math.max(...errors.map(Math.abs))
  const tail = errors.slice(Math.floor(errors.length * 0.8))
  const bias = tail.reduce((sum, error) => sum + error, 0) / tail.length
  let zeroCrossings = 0
  let previousSign = Math.sign(errors[0])
  for (const error of errors.slice(1)) {
    const sign = Math.sign(error)
    if (sign && previousSign && sign !== previousSign) zeroCrossings += 1
    if (sign) previousSign = sign
  }

  const windowSize = Math.max(1, Math.floor(points.length * 0.1))
  const initialTarget = points.slice(0, windowSize).reduce((sum, item) => sum + item.target, 0) / windowSize
  const finalTarget = points.slice(-windowSize).reduce((sum, item) => sum + item.target, 0) / windowSize
  const step = finalTarget - initialTarget
  let overshoot = Number.NaN
  let settlingTime = Number.NaN
  if (Math.abs(step) > 1e-6) {
    const transitionIndex = points.findIndex((item) => Math.abs(item.target - initialTarget) >= Math.abs(step) * 0.5)
    if (transitionIndex >= 0) {
      const after = points.slice(transitionIndex)
      const directedPeak = step > 0
        ? Math.max(...after.map((item) => item.feedback - finalTarget))
        : Math.max(...after.map((item) => finalTarget - item.feedback))
      overshoot = Math.max(0, directedPeak) / Math.abs(step) * 100
      const tolerance = Math.max(Math.abs(step) * 0.02, 1e-6)
      for (let index = transitionIndex; index < points.length; index += 1) {
        if (points.slice(index).every((item) => Math.abs(item.feedback - finalTarget) <= tolerance)) {
          settlingTime = points[index].time - points[transitionIndex].time
          break
        }
      }
    }
  }
  const saturationRatio = outputLimit && outputLimit > 0
    ? points.filter((item) => Math.abs(item.output) >= outputLimit * 0.98).length / points.length
    : Number.NaN

  return {
    sampleRate: finiteOrNaN(sampleRate),
    rms,
    mae,
    peak,
    bias,
    zeroCrossings,
    overshoot,
    settlingTime,
    saturationRatio,
  }
}
