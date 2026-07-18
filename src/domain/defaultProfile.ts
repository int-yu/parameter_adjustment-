import type { AppProfile } from './types'

export const DEFAULT_PROFILE: AppProfile = {
  version: 2,
  name: 'DAPLink Serial Debug Console',
  serial: {
    baudRate: 115200,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    flowControl: 'none',
  },
  terminal: {
    encoding: 'utf-8',
    lineEnding: 'none',
  },
  history: {
    maxFrames: 5000,
    maxLogs: 1000,
  },
  chart: {
    timeWindowSeconds: 30,
  },
  rxSchemas: [],
  txSchemas: [],
  displaySeries: [],
  professionalControls: [],
}
