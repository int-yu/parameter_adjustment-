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

export type FeedbackMode = 'direct' | 'counter-rate'

export interface PidMapping {
  id: string
  label: string
  messageId: number
  timeField: string
  targetField: string
  feedbackField: string
  feedbackMode: FeedbackMode
  outputField: string
  encoderField?: string
  angleWrap?: number
  outputLimit?: number
}

export type ControlKind =
  | 'bool-toggle'
  | 'bool-hold'
  | 'bool-pulse'
  | 'text'
  | 'number'
  | 'slider'
  | 'enum'

export interface EnumOption {
  label: string
  value: number
}

export interface ControlDefinition {
  id: string
  label: string
  messageId: number
  fieldKey: string
  kind: ControlKind
  min?: number
  max?: number
  step?: number
  pulseMs?: number
  options?: EnumOption[]
}

export interface CustomTabDefinition {
  id: string
  name: string
  controls: ControlDefinition[]
}

export interface AppProfile {
  version: 1
  name: string
  serial: SerialSettings
  rxSchemas: MessageSchema[]
  txSchemas: MessageSchema[]
  pidMappings: PidMapping[]
  customTabs: CustomTabDefinition[]
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
