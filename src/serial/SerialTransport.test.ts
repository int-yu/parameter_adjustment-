import { afterEach, describe, expect, it, vi } from 'vitest'
import { SerialTransport } from './SerialTransport'

const waitFor = async (condition: () => boolean) => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error('Timed out waiting for serial write')
}

const createSerial = () => {
  const listeners = new Set<EventListener>()
  return {
    requestPort: vi.fn(),
    addEventListener: vi.fn((_type: string, listener: EventListener) => listeners.add(listener)),
    removeEventListener: vi.fn((_type: string, listener: EventListener) => listeners.delete(listener)),
    dispatchDisconnect: () => listeners.forEach((listener) => listener(new Event('disconnect'))),
  }
}

describe('SerialTransport', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('keeps only the latest pending frame for the same message while busy', async () => {
    const writes: number[][] = []
    let releaseFirst!: () => void
    const firstBlocked = new Promise<void>((resolve) => { releaseFirst = resolve })
    let writeCount = 0
    const writable = new WritableStream<Uint8Array>({
      async write(bytes) {
        writes.push(Array.from(bytes))
        writeCount += 1
        if (writeCount === 1) await firstBlocked
      },
    })
    const readable = new ReadableStream<Uint8Array>({ start() {} })
    const port = { readable, writable, open: vi.fn(), close: vi.fn() } as unknown as SerialPort
    const serial = createSerial()
    serial.requestPort.mockResolvedValue(port)
    vi.stubGlobal('navigator', { serial })
    const transport = new SerialTransport({ onBytes: vi.fn(), onError: vi.fn(), onDisconnect: vi.fn(), onTx: vi.fn() })

    await transport.connect({ baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' })
    transport.sendLatest('message-a', new Uint8Array([1]))
    transport.sendLatest('message-a', new Uint8Array([2]))
    transport.sendLatest('message-a', new Uint8Array([3]))
    releaseFirst()
    await waitFor(() => writes.length === 2)

    expect(writes).toEqual([[1], [3]])
    await transport.disconnect()
  })

  it('releases the port on physical disconnect and does not replay old state', async () => {
    const serial = createSerial()
    const close = vi.fn()
    const port = {
      readable: new ReadableStream<Uint8Array>({ start() {} }),
      writable: new WritableStream<Uint8Array>(),
      open: vi.fn(),
      close,
    } as unknown as SerialPort
    serial.requestPort.mockResolvedValue(port)
    vi.stubGlobal('navigator', { serial })
    const onDisconnect = vi.fn()
    const transport = new SerialTransport({ onBytes: vi.fn(), onError: vi.fn(), onDisconnect, onTx: vi.fn() })

    await transport.connect({ baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' })
    serial.dispatchDisconnect()
    await waitFor(() => onDisconnect.mock.calls.length === 1)

    expect(transport.connected).toBe(false)
    expect(close).toHaveBeenCalledOnce()
    expect(() => transport.sendLatest('message-a', new Uint8Array([9]))).toThrow('Serial port is not connected')
  })
})
