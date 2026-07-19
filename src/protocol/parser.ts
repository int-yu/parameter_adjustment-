import type { DecodedFrame, FrameFormat, FrameIssue, MessageSchema } from '../domain/types'
import { crc16CcittFalse } from './crc'
import { bytesToHex, decodePayload } from './codec'
import { DEFAULT_FRAME_FORMAT, frameCrcSize, frameHeaderSize, frameLengthForPayload, readUint16 } from './frameFormat'

export interface ParserResult {
  frames: DecodedFrame[]
  issues: FrameIssue[]
}

const findHead = (buffer: Uint8Array, cursor: number, headBytes: number[]) => {
  for (let index = cursor; index + headBytes.length <= buffer.length; index += 1) {
    if (headBytes.every((byte, offset) => buffer[index + offset] === byte)) return index
  }
  return -1
}

const partialHeadSize = (buffer: Uint8Array, headBytes: number[]) => {
  for (let size = Math.min(headBytes.length - 1, buffer.length); size > 0; size -= 1) {
    const start = buffer.length - size
    if (headBytes.slice(0, size).every((byte, index) => buffer[start + index] === byte)) return size
  }
  return 0
}

export class FrameStreamParser {
  private buffer = new Uint8Array(0)

  reset() {
    this.buffer = new Uint8Array(0)
  }

  push(
    chunk: Uint8Array,
    resolveSchema: (messageId: number) => MessageSchema | undefined,
    frameFormat: FrameFormat = DEFAULT_FRAME_FORMAT,
  ): ParserResult {
    const merged = new Uint8Array(this.buffer.length + chunk.length)
    merged.set(this.buffer)
    merged.set(chunk, this.buffer.length)
    this.buffer = merged

    const frames: DecodedFrame[] = []
    const issues: FrameIssue[] = []
    const payloadOffset = frameHeaderSize(frameFormat)
    const minFrameLength = frameLengthForPayload(frameFormat, 0)
    let cursor = 0

    while (cursor + frameFormat.head.length <= this.buffer.length) {
      const head = findHead(this.buffer, cursor, frameFormat.head)
      if (head < 0) {
        const keepLast = partialHeadSize(this.buffer, frameFormat.head)
        const noiseEnd = this.buffer.length - keepLast
        if (noiseEnd > cursor) {
          issues.push({ kind: 'noise', message: 'Discarded bytes before frame head', raw: this.buffer.slice(cursor, noiseEnd) })
        }
        cursor = noiseEnd
        break
      }
      if (head > cursor) {
        issues.push({ kind: 'noise', message: 'Noise exists before frame head', raw: this.buffer.slice(cursor, head) })
      }
      if (head + payloadOffset > this.buffer.length) {
        cursor = head
        break
      }

      const view = new DataView(this.buffer.buffer, this.buffer.byteOffset + head)
      const versionOffset = frameFormat.head.length
      const payloadLength = readUint16(view, versionOffset + 4, frameFormat.lengthEndian)
      if (payloadLength > frameFormat.maxPayload) {
        issues.push({ kind: 'length', message: `Payload length ${payloadLength} exceeds ${frameFormat.maxPayload}`, raw: this.buffer.slice(head, head + payloadOffset) })
        cursor = head + 1
        continue
      }

      const frameLength = frameLengthForPayload(frameFormat, payloadLength)
      if (head + frameLength > this.buffer.length) {
        cursor = head
        break
      }

      const raw = this.buffer.slice(head, head + frameLength)
      const rawView = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
      const crcOffset = payloadOffset + payloadLength
      const tailOffset = crcOffset + frameCrcSize(frameFormat)
      if (!frameFormat.tail.every((byte, offset) => raw[tailOffset + offset] === byte)) {
        issues.push({ kind: 'tail', message: 'Frame tail mismatch', raw })
        cursor = head + 1
        continue
      }

      if (frameFormat.crcMode === 'crc16-ccitt-false') {
        const expectedCrc = readUint16(rawView, crcOffset, frameFormat.crcEndian)
        const actualCrc = crc16CcittFalse(raw.slice(versionOffset, payloadOffset + payloadLength))
        if (expectedCrc !== actualCrc) {
          issues.push({ kind: 'crc', message: `CRC mismatch: received ${expectedCrc.toString(16)}, calculated ${actualCrc.toString(16)}`, raw })
          cursor = head + 1
          continue
        }
      }

      const version = raw[versionOffset]
      if (version !== frameFormat.version) {
        issues.push({ kind: 'version', message: `Unsupported protocol version ${version}`, raw })
        cursor = head + frameLength
        continue
      }

      const messageId = raw[versionOffset + 1]
      const payload = raw.slice(payloadOffset, payloadOffset + payloadLength)
      const schema = resolveSchema(messageId)
      const frame: DecodedFrame = {
        receivedAt: Date.now(),
        version,
        messageId,
        sequence: readUint16(rawView, versionOffset + 2, frameFormat.sequenceEndian),
        payloadLength,
        payload,
        raw,
        schema,
      }
      if (schema) {
        try {
          frame.values = decodePayload(schema, payload)
        } catch (error) {
          issues.push({ kind: 'schema', message: (error as Error).message, raw })
          cursor = head + frameLength
          continue
        }
      }
      frames.push(frame)
      cursor = head + frameLength
    }

    this.buffer = this.buffer.slice(cursor)
    if (this.buffer.length > frameFormat.maxPayload + minFrameLength) {
      issues.push({ kind: 'length', message: `Parser buffer overflow: ${bytesToHex(this.buffer.slice(0, 16))}`, raw: this.buffer })
      this.reset()
    }
    return { frames, issues }
  }
}
