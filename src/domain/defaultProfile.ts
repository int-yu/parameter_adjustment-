import type { AppProfile, FieldSchema, MessageSchema } from './types'

const field = (
  id: string,
  key: string,
  label: string,
  type: FieldSchema['type'],
  unit = '',
  defaultValue: FieldSchema['defaultValue'] = 0,
): FieldSchema => ({ id, key, label, type, unit, defaultValue })

export const PID_TELEMETRY_SCHEMA: MessageSchema = {
  id: 0x01,
  name: 'PID_TELEMETRY',
  direction: 'rx',
  fields: [
    field('telemetry-time', 'time_ms', 'MCU时间', 'u32', 'ms'),
    field('telemetry-run', 'run', '运行状态', 'bool', '', false),
    field('telemetry-mode', 'mode', '控制模式', 'u8'),
    field('telemetry-left-encoder', 'left_encoder', '左轮编码', 'i32', 'count'),
    field('telemetry-right-encoder', 'right_encoder', '右轮编码', 'i32', 'count'),
    field('telemetry-left-target', 'left_target_cps', '左轮目标', 'f32', 'count/s'),
    field('telemetry-right-target', 'right_target_cps', '右轮目标', 'f32', 'count/s'),
    field('telemetry-left-output', 'left_output', '左轮输出', 'f32'),
    field('telemetry-right-output', 'right_output', '右轮输出', 'f32'),
    field('telemetry-yaw-target', 'yaw_target_deg', '航向目标', 'f32', 'deg'),
    field('telemetry-yaw', 'yaw_deg', 'Z轴角度', 'f32', 'deg'),
    field('telemetry-heading-output', 'heading_output', '航向输出', 'f32'),
  ],
}

export const PID_STATUS_SCHEMA: MessageSchema = {
  id: 0x02,
  name: 'PID_STATUS',
  direction: 'rx',
  fields: [
    field('status-channel', 'channel', 'PID通道', 'u8'),
    field('status-kp', 'kp', 'Kp', 'f32'),
    field('status-ki', 'ki', 'Ki', 'f32'),
    field('status-kd', 'kd', 'Kd', 'f32'),
  ],
}

export const PID_SET_SCHEMA: MessageSchema = {
  id: 0x81,
  name: 'PID_SET',
  direction: 'tx',
  fields: [
    field('set-channel', 'channel', 'PID通道', 'u8'),
    field('set-kp', 'kp', 'Kp', 'f32'),
    field('set-ki', 'ki', 'Ki', 'f32'),
    field('set-kd', 'kd', 'Kd', 'f32'),
  ],
}

export const DEFAULT_PROFILE: AppProfile = {
  version: 1,
  name: 'DAPLink PID 调试',
  serial: {
    baudRate: 115200,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    flowControl: 'none',
  },
  rxSchemas: [PID_TELEMETRY_SCHEMA, PID_STATUS_SCHEMA],
  txSchemas: [PID_SET_SCHEMA],
  pidMappings: [
    {
      id: 'left-wheel',
      label: '左轮速度',
      messageId: 0x01,
      timeField: 'time_ms',
      targetField: 'left_target_cps',
      feedbackField: 'left_encoder',
      feedbackMode: 'counter-rate',
      outputField: 'left_output',
      encoderField: 'left_encoder',
    },
    {
      id: 'right-wheel',
      label: '右轮速度',
      messageId: 0x01,
      timeField: 'time_ms',
      targetField: 'right_target_cps',
      feedbackField: 'right_encoder',
      feedbackMode: 'counter-rate',
      outputField: 'right_output',
      encoderField: 'right_encoder',
    },
    {
      id: 'heading',
      label: '航向',
      messageId: 0x01,
      timeField: 'time_ms',
      targetField: 'yaw_target_deg',
      feedbackField: 'yaw_deg',
      feedbackMode: 'direct',
      outputField: 'heading_output',
      angleWrap: 360,
    },
  ],
  customTabs: [],
}
