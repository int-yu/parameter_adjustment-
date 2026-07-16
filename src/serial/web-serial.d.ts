interface SerialPortOpenOptions {
  baudRate: number
  dataBits?: 7 | 8
  stopBits?: 1 | 2
  parity?: 'none' | 'even' | 'odd'
  bufferSize?: number
  flowControl?: 'none' | 'hardware'
}

interface SerialPort {
  readonly readable: ReadableStream<Uint8Array> | null
  readonly writable: WritableStream<Uint8Array> | null
  open(options: SerialPortOpenOptions): Promise<void>
  close(): Promise<void>
}

interface Serial {
  requestPort(options?: { filters?: Array<Record<string, number>> }): Promise<SerialPort>
  addEventListener(type: 'disconnect', listener: (event: Event) => void): void
  removeEventListener(type: 'disconnect', listener: (event: Event) => void): void
}

interface Navigator {
  readonly serial?: Serial
}
