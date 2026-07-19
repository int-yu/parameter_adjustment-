import type { ByteOrder, FrameFormat } from '../domain/types'

export const DEFAULT_FRAME_FORMAT: FrameFormat = {
  head: [0xaa, 0x55],
  tail: [0x0d, 0x0a],
  version: 0x01,
  maxPayload: 512,
  sequenceEndian: 'little',
  lengthEndian: 'little',
  crcMode: 'crc16-ccitt-false',
  crcEndian: 'little',
}

export const frameCrcSize = (format: FrameFormat) => format.crcMode === 'none' ? 0 : 2

export const frameHeaderSize = (format: FrameFormat) => format.head.length + 6

export const frameLengthForPayload = (format: FrameFormat, payloadLength: number) =>
  frameHeaderSize(format) + payloadLength + frameCrcSize(format) + format.tail.length

export const readUint16 = (view: DataView, offset: number, endian: ByteOrder) =>
  view.getUint16(offset, endian === 'little')

export const writeUint16 = (view: DataView, offset: number, value: number, endian: ByteOrder) =>
  view.setUint16(offset, value & 0xffff, endian === 'little')

export const normalizeByteList = (bytes: number[]) =>
  bytes.map((byte) => Math.trunc(byte)).filter((byte) => byte >= 0 && byte <= 0xff)

export const normalizeFrameFormat = (format: Partial<FrameFormat> | undefined): FrameFormat => ({
  ...DEFAULT_FRAME_FORMAT,
  ...format,
  head: normalizeByteList(format?.head ?? DEFAULT_FRAME_FORMAT.head),
  tail: normalizeByteList(format?.tail ?? DEFAULT_FRAME_FORMAT.tail),
})

export const validateFrameFormat = (format: FrameFormat): string[] => {
  const errors: string[] = []
  if (format.head.length < 1 || format.head.length > 8) errors.push('Frame head must be 1-8 bytes')
  if (format.tail.length < 0 || format.tail.length > 8) errors.push('Frame tail must be 0-8 bytes')
  if (!format.head.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 0xff)) errors.push('Frame head must contain byte values')
  if (!format.tail.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 0xff)) errors.push('Frame tail must contain byte values')
  if (!Number.isInteger(format.version) || format.version < 0 || format.version > 0xff) errors.push('Protocol version must be 0x00-0xFF')
  if (!Number.isInteger(format.maxPayload) || format.maxPayload < 0 || format.maxPayload > 4096) errors.push('Max payload must be 0-4096 bytes')
  if (!['little', 'big'].includes(format.sequenceEndian)) errors.push('Sequence endian is invalid')
  if (!['little', 'big'].includes(format.lengthEndian)) errors.push('Payload length endian is invalid')
  if (!['little', 'big'].includes(format.crcEndian)) errors.push('CRC endian is invalid')
  if (!['crc16-ccitt-false', 'none'].includes(format.crcMode)) errors.push('CRC mode is invalid')
  return errors
}
