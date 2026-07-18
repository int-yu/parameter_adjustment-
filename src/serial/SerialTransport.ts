import type { SerialSettings } from '../domain/types'

export interface TransportCallbacks {
  onBytes: (bytes: Uint8Array) => void
  onError: (error: Error) => void
  onDisconnect: () => void
  onTx: (bytes: Uint8Array) => void
}

export class SerialTransport {
  private readonly callbacks: TransportCallbacks
  private port: SerialPort | null = null
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  private reading = false
  private writing = false
  private handlingUnexpectedDisconnect = false
  private pendingLatest = new Map<string, Uint8Array>()
  private manualQueue: Uint8Array[] = []

  constructor(callbacks: TransportCallbacks) {
    this.callbacks = callbacks
  }

  get connected() {
    return this.port !== null
  }

  async connect(settings: SerialSettings) {
    if (!navigator.serial) throw new Error('This browser does not support Web Serial')
    if (this.connected) throw new Error('Serial port is already connected')
    const port = await navigator.serial.requestPort()
    await port.open(settings)
    if (!port.readable || !port.writable) {
      await port.close()
      throw new Error('Serial port does not expose readable/writable streams')
    }
    this.port = port
    this.writer = port.writable.getWriter()
    this.reading = true
    navigator.serial.addEventListener('disconnect', this.handleDisconnect)
    void this.readLoop()
  }

  async disconnect() {
    this.reading = false
    this.pendingLatest.clear()
    this.manualQueue = []
    try {
      await this.reader?.cancel()
    } catch {
      // Reader may already be closed by the device.
    }
    try {
      this.reader?.releaseLock()
    } catch {
      // Ignore duplicate releases.
    }
    this.reader = null
    try {
      this.writer?.releaseLock()
    } catch {
      // Ignore duplicate releases.
    }
    this.writer = null
    const port = this.port
    this.port = null
    if (navigator.serial) navigator.serial.removeEventListener('disconnect', this.handleDisconnect)
    if (port) {
      try {
        await port.close()
      } catch {
        // Wireless adapters can disappear before close resolves.
      }
    }
  }

  sendLatest(key: string, bytes: Uint8Array) {
    if (!this.writer) throw new Error('Serial port is not connected')
    this.pendingLatest.set(key, bytes)
    void this.pumpWrites()
  }

  send(bytes: Uint8Array) {
    if (!this.writer) throw new Error('Serial port is not connected')
    this.manualQueue.push(bytes)
    void this.pumpWrites()
  }

  private readLoop = async () => {
    const readable = this.port?.readable
    if (!readable) return
    this.reader = readable.getReader()
    try {
      while (this.reading) {
        const { value, done } = await this.reader.read()
        if (done) break
        if (value?.length) this.callbacks.onBytes(value)
      }
    } catch (error) {
      if (this.reading) this.callbacks.onError(error as Error)
    } finally {
      try {
        this.reader?.releaseLock()
      } catch {
        // Ignore duplicate releases.
      }
      this.reader = null
      if (this.reading) void this.handleUnexpectedDisconnect()
    }
  }

  private pumpWrites = async () => {
    if (this.writing || !this.writer) return
    this.writing = true
    try {
      while (this.writer && (this.manualQueue.length || this.pendingLatest.size)) {
        let bytes = this.manualQueue.shift()
        if (!bytes) {
          const next = this.pendingLatest.entries().next().value as [string, Uint8Array] | undefined
          if (!next) break
          this.pendingLatest.delete(next[0])
          bytes = next[1]
        }
        await this.writer.write(bytes)
        this.callbacks.onTx(bytes)
      }
    } catch (error) {
      this.pendingLatest.clear()
      this.manualQueue = []
      this.callbacks.onError(error as Error)
    } finally {
      this.writing = false
    }
  }

  private handleUnexpectedDisconnect = async () => {
    if (!this.connected || this.handlingUnexpectedDisconnect) return
    this.handlingUnexpectedDisconnect = true
    try {
      await this.disconnect()
      this.callbacks.onDisconnect()
    } finally {
      this.handlingUnexpectedDisconnect = false
    }
  }

  private handleDisconnect = () => { void this.handleUnexpectedDisconnect() }
}
