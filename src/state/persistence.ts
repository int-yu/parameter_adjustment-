import type { AppProfile } from '../domain/types'
import { DEFAULT_PROFILE } from '../domain/defaultProfile'
import { cloneProfile, validateProfile } from '../protocol/schema'

const STORAGE_KEY = 'daplink-parameter-profile.v1'

export const loadProfile = (): AppProfile => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return cloneProfile(DEFAULT_PROFILE)
    const profile = JSON.parse(raw) as AppProfile
    if (validateProfile(profile).length > 0) return cloneProfile(DEFAULT_PROFILE)
    return profile
  } catch {
    return cloneProfile(DEFAULT_PROFILE)
  }
}

export const saveProfile = (profile: AppProfile) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
}

export const exportProfile = (profile: AppProfile): string => JSON.stringify(profile, null, 2)

export const importProfile = (raw: string): AppProfile => {
  const profile = JSON.parse(raw) as AppProfile
  const errors = validateProfile(profile)
  if (errors.length) throw new Error(errors.join('；'))
  return profile
}
