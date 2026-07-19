import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE } from '../domain/defaultProfile'
import { exportProfile, importProfile } from './persistence'

describe('profile import', () => {
  it('round-trips a versioned valid profile', () => {
    expect(importProfile(exportProfile(DEFAULT_PROFILE))).toEqual(DEFAULT_PROFILE)
  })

  it('rejects v1 profiles instead of migrating them', () => {
    expect(() => importProfile(JSON.stringify({ ...DEFAULT_PROFILE, version: 1 }))).toThrow(/version must be 2/i)
  })

  it('adds the default frame format to older v2 profiles', () => {
    const legacy = structuredClone(DEFAULT_PROFILE) as Partial<typeof DEFAULT_PROFILE>
    delete legacy.frameFormat
    expect(importProfile(JSON.stringify(legacy)).frameFormat.head).toEqual([0xaa, 0x55])
  })

  it('rejects an invalid message ID and fixed length', () => {
    const invalid = structuredClone(DEFAULT_PROFILE)
    invalid.txSchemas = [{
      uid: 'tx-bad',
      id: 0x01,
      name: 'BAD',
      direction: 'tx',
      fields: [{ id: 'field', key: 'value', label: 'Value', type: 'fixed-string', length: 0 }],
    }]
    expect(() => importProfile(JSON.stringify(invalid))).toThrow(/ID must be|positive fixed length/)
  })
})
