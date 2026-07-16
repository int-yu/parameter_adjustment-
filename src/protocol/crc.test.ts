import { describe, expect, it } from 'vitest'
import { crc16CcittFalse } from './crc'

describe('crc16CcittFalse', () => {
  it('matches the standard 123456789 check value', () => {
    expect(crc16CcittFalse(new TextEncoder().encode('123456789'))).toBe(0x29b1)
  })
})
