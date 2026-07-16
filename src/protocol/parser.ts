import type { DecodedFrame, FrameIssue, MessageSchema } from '../domain/types'
import { crc16CcittFalse } from './crc'
import { FRAME_HEAD, FRAME_TAIL, MAX_PAYLOAD, PROTOCOL_VERSION } from './codec'
import { decodePayload, bytesToHex } from './codec'

export interface ParserResult {
  frames: DecodedFrame[]
  issues: FrameIssue[]
}

export class FrameStreamParser {
  private buffer = new Uint8Array(0)

  reset() {
    this.buffer = new Uint8Array(0)
  }

  push(
    chunk: Uint8Array,
    resolveSchema: (messageId: number) => MessageSchema | undefined,
  ): ParserResult {
    const merged = new Uint8Array(this.buffer.length + chunk.length)
    merged.set(this.buffer)
    merged.set(chunk, this.buffer.length)
    this.buffer = merged

    const frames: DecodedFrame[] = []
    const issues: FrameIssue[] = []
    let cursor = 0

    while (cursor + 2 <= this.buffer.length) {
      let head = -1
      for (let index = cursor; index + 1 < this.buffer.length; index += 1) {
        if (this.buffer[index] === FRAME_HEAD[0] && this.buffer[index + 1] === FRAME_HEAD[1]) {
          head = index
          break
        }
      }
      if (head < 0) {
        const keepLast = this.buffer[this.buffer.length - 1] === FRAME_HEAD[0] ? 1 : 0
        const noiseEnd = this.buffer.length - keepLast
        if (noiseEnd > cursor) {
          issues.push({ kind: 'noise', message: '丢弃无帧头数据', raw: this.buffer.slice(cursor, noiseEnd) })
        }
        cursor = noiseEnd
        break
      }
      if (head > cursor) {
        issues.push({ kind: 'noise', message: '帧头前存在噪声', raw: this.buffer.slice(cursor, head) })
      }
      if (head + 8 > this.buffer.length) {
        cursor = head
        break
      }

      const view = new DataView(this.buffer.buffer, this.buffer.byteOffset + head)
      const payloadLength = view.getUint16(6, true)
      if (payloadLength > MAX_PAYLOAD) {
        issues.push({ kind: 'length', message: `Payload长度${payloadLength}超过512`, raw: this.buffer.slice(head, head + 8) })
        cursor = head + 1
        continue
      }
      const frameLength = payloadLength + 12
      if (head + frameLength > this.buffer.length) {
        cursor = head
        break
      }

      const raw = this.buffer.slice(head, head + frameLength)
      const rawView = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
      if (raw[frameLength - 2] !== FRAME_TAIL[0] || raw[frameLength - 1] !== FRAME_TAIL[1]) {
        issues.push({ kind: 'tail', message: '帧尾错误', raw })
        cursor = head + 1
        continue
      }
      const expectedCrc = rawView.getUint16(8 + payloadLength, true)
      const actualCrc = crc16CcittFalse(raw.slice(2, 8 + payloadLength))
      if (expectedCrc !== actualCrc) {
        issues.push({ kind: 'crc', message: `CRC错误：收到${expectedCrc.toString(16)}，计算${actualCrc.toString(16)}`, raw })
        cursor = head + 1
        continue
      }
      const version = raw[2]
      if (version !== PROTOCOL_VERSION) {
        issues.push({ kind: 'version', message: `不支持协议版本${version}`, raw })
        cursor = head + frameLength
        continue
      }

      const messageId = raw[3]
      const payload = raw.slice(8, 8 + payloadLength)
      const schema = resolveSchema(messageId)
      const frame: DecodedFrame = {
        receivedAt: Date.now(),
        version,
        messageId,
        sequence: rawView.getUint16(4, true),
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
    if (this.buffer.length > MAX_PAYLOAD + 12) {
      issues.push({ kind: 'length', message: `缓冲区异常：${bytesToHex(this.buffer.slice(0, 16))}`, raw: this.buffer })
      this.reset()
    }
    return { frames, issues }
  }
}
