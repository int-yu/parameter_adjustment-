import { Buffer } from 'buffer'
import iconv from 'iconv-lite'
import type { LineEnding, TerminalEncoding } from '../domain/types'

const textEncoder = new TextEncoder()

const appendLineEnding = (value: string, lineEnding: LineEnding) => {
  if (lineEnding === 'lf') return `${value}\n`
  if (lineEnding === 'crlf') return `${value}\r\n`
  return value
}

export const encodeTerminalText = (
  value: string,
  encoding: TerminalEncoding,
  lineEnding: LineEnding,
): Uint8Array => {
  const text = appendLineEnding(value, lineEnding)
  if (encoding === 'ascii') {
    return Uint8Array.from(Array.from(text, (char) => char.charCodeAt(0) <= 0x7f ? char.charCodeAt(0) : 0x3f))
  }
  if (encoding === 'gbk') return Uint8Array.from(iconv.encode(text, 'gbk'))
  return textEncoder.encode(text)
}

export const decodeTerminalText = (bytes: Uint8Array, encoding: TerminalEncoding): string => {
  if (encoding === 'ascii') return Array.from(bytes, (byte) => byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.').join('')
  if (encoding === 'gbk') return iconv.decode(Buffer.from(bytes), 'gbk').replace(/\0+$/g, '')
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/\0+$/g, '')
}
