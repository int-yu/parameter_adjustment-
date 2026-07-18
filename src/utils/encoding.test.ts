import { describe, expect, it } from 'vitest'
import { decodeTerminalText, encodeTerminalText } from './encoding'

describe('terminal encoding', () => {
  it('round-trips GBK text and appends configured line ending', () => {
    const bytes = encodeTerminalText('中文', 'gbk', 'crlf')
    expect(Array.from(bytes.slice(-2))).toEqual([0x0d, 0x0a])
    expect(decodeTerminalText(bytes, 'gbk')).toBe('中文\r\n')
  })

  it('replaces non-ascii characters in ascii mode', () => {
    expect(Array.from(encodeTerminalText('A中', 'ascii', 'none'))).toEqual([0x41, 0x3f])
  })
})
