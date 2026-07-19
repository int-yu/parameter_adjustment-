import type { AppProfile } from './types'
import { DEFAULT_FRAME_FORMAT } from '../protocol/frameFormat'

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
  frameFormat: DEFAULT_FRAME_FORMAT,
  rxSchemas: [],
  txSchemas: [],
  displaySeries: [],
  professionalControls: [],
}
