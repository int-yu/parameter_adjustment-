export type FieldType =
  | 'bool'
  | 'u8'
  | 'i8'
  | 'u16'
  | 'i16'
  | 'u32'
  | 'i32'
  | 'f32'
  | 'f64'
  | 'fixed-string'
  | 'fixed-bytes'

export type NumericFieldType = Extract<FieldType, 'u8' | 'i8' | 'u16' | 'i16' | 'u32' | 'i32' | 'f32' | 'f64'>
export type FieldValue = boolean | number | string | Uint8Array
export type PersistedFieldValue = boolean | number | string

export interface FieldSchema {
  id: string
  key: string
  label: string
  type: FieldType
  length?: number
  unit?: string
  defaultValue?: PersistedFieldValue
}

export type MessageDirection = 'rx' | 'tx'

export interface MessageSchema {
  uid: string
  id: number
  name: string
  direction: MessageDirection
  fields: FieldSchema[]
}

export interface SerialSettings {
  baudRate: number
  dataBits: 7 | 8
  stopBits: 1 | 2
  parity: 'none' | 'even' | 'odd'
  flowControl: 'none' | 'hardware'
}

export type TerminalEncoding = 'utf-8' | 'gbk' | 'ascii'
export type LineEnding = 'none' | 'lf' | 'crlf'

export interface TerminalSettings {
  encoding: TerminalEncoding
  lineEnding: LineEnding
}

export interface HistorySettings {
  maxFrames: number
  maxLogs: number
}

export interface ChartSettings {
  timeWindowSeconds: number
}

export type ByteOrder = 'little' | 'big'
export type CrcMode = 'crc16-ccitt-false' | 'none'

export interface FrameFormat {
  head: number[]
  tail: number[]
  version: number
  maxPayload: number
  sequenceEndian: ByteOrder
  lengthEndian: ByteOrder
  crcMode: CrcMode
  crcEndian: ByteOrder
}

export interface DisplaySeriesConfig {
  id: string
  messageUid: string
  fieldId: string
  color: string
  scale: number
}

export type ProfessionalMode = 'move' | 'angle'
export type ProfessionalWidgetKind = 'button' | 'switch' | 'slider' | 'joystick' | 'numeric'

export interface FieldBinding {
  messageUid: string
  fieldId: string
}

export interface JoystickBinding {
  messageUid: string
  xFieldId: string
  yFieldId: string
}

export interface ProfessionalWidget {
  id: string
  kind: ProfessionalWidgetKind
  label: string
  x: number
  y: number
  width: number
  height: number
  angle: number
  binding?: FieldBinding
  joystickBinding?: JoystickBinding
  min?: number
  max?: number
  step?: number
}

export interface AppProfile {
  version: 2
  name: string
  serial: SerialSettings
  terminal: TerminalSettings
  history: HistorySettings
  chart: ChartSettings
  frameFormat: FrameFormat
  rxSchemas: MessageSchema[]
  txSchemas: MessageSchema[]
  displaySeries: DisplaySeriesConfig[]
  professionalControls: ProfessionalWidget[]
}

export interface DecodedFrame {
  receivedAt: number
  version: number
  messageId: number
  sequence: number
  payloadLength: number
  payload: Uint8Array
  raw: Uint8Array
  schema?: MessageSchema
  values?: Record<string, FieldValue>
}

export type FrameIssueKind =
  | 'noise'
  | 'crc'
  | 'tail'
  | 'version'
  | 'length'
  | 'schema'

export interface FrameIssue {
  kind: FrameIssueKind
  message: string
  raw: Uint8Array
}

export interface RawLogEntry {
  id: number
  time: number
  direction: 'rx' | 'tx'
  bytes: Uint8Array
  text?: string
  status: 'ok' | 'error' | 'raw'
  note?: string
}

export interface SerialStats {
  rxBytes: number
  txBytes: number
  validFrames: number
  invalidFrames: number
  droppedFrames: number
}
