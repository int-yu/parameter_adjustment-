import type { AppProfile } from '../domain/types'
import { DEFAULT_PROFILE } from '../domain/defaultProfile'
import { cloneProfile, validateProfile } from '../protocol/schema'
import { normalizeFrameFormat } from '../protocol/frameFormat'

const STORAGE_KEY = 'daplink-parameter-profile.v2'

export const loadProfile = (): AppProfile => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return cloneProfile(DEFAULT_PROFILE)
    const profile = normalizeProfile(JSON.parse(raw) as Partial<AppProfile>)
    if (validateProfile(profile).length > 0) return cloneProfile(DEFAULT_PROFILE)
    return profile
  } catch {
    return cloneProfile(DEFAULT_PROFILE)
  }
}

const normalizeProfile = (profile: Partial<AppProfile>): AppProfile => ({
  ...cloneProfile(DEFAULT_PROFILE),
  ...profile,
  serial: { ...DEFAULT_PROFILE.serial, ...profile.serial },
  terminal: { ...DEFAULT_PROFILE.terminal, ...profile.terminal },
  history: { ...DEFAULT_PROFILE.history, ...profile.history },
  chart: { ...DEFAULT_PROFILE.chart, ...profile.chart },
  frameFormat: normalizeFrameFormat(profile.frameFormat),
  rxSchemas: profile.rxSchemas ?? [],
  txSchemas: profile.txSchemas ?? [],
  displaySeries: profile.displaySeries ?? [],
  professionalControls: profile.professionalControls ?? [],
})

export const saveProfile = (profile: AppProfile) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
}

export const exportProfile = (profile: AppProfile): string => JSON.stringify(profile, null, 2)

export const importProfile = (raw: string): AppProfile => {
  const profile = normalizeProfile(JSON.parse(raw) as Partial<AppProfile>)
  const errors = validateProfile(profile)
  if (errors.length) throw new Error(errors.join('; '))
  return profile
}
