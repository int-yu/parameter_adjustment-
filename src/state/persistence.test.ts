import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE } from '../domain/defaultProfile'
import { exportProfile, importProfile } from './persistence'

describe('profile import', () => {
  it('round-trips a versioned valid profile', () => {
    expect(importProfile(exportProfile(DEFAULT_PROFILE))).toEqual(DEFAULT_PROFILE)
  })

  it('rejects an invalid message ID and fixed length', () => {
    const invalid = structuredClone(DEFAULT_PROFILE)
    invalid.txSchemas[0].id = 0x01
    invalid.txSchemas[0].fields[0] = { ...invalid.txSchemas[0].fields[0], type: 'fixed-string', length: 0 }
    expect(() => importProfile(JSON.stringify(invalid))).toThrow(/ID必须位于|正整数固定长度/)
  })
})
