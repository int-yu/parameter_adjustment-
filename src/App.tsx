import { Activity, Settings, SlidersHorizontal, TerminalSquare } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import './App.css'
import type { AppProfile, DecodedFrame, FieldValue, MessageSchema, RawLogEntry, SerialStats } from './domain/types'
import { loadProfile, saveProfile } from './state/persistence'
import { validateProfile, defaultValueForField } from './protocol/schema'
import { FrameStreamParser } from './protocol/parser'
import { encodeFrame } from './protocol/codec'
import { SerialTransport } from './serial/SerialTransport'
import { SerialToolbar } from './components/SerialToolbar'
import { PidTab } from './features/PidTab'
import { ProtocolTab } from './features/ProtocolTab'
import { ConfigTab } from './features/ConfigTab'
import { CustomTab } from './features/CustomTab'

const MAX_FRAMES = 5000
const MAX_LOGS = 1000

const emptyStats = (): SerialStats => ({ rxBytes: 0, txBytes: 0, validFrames: 0, invalidFrames: 0, droppedFrames: 0 })

const buildTxValues = (
  schemas: MessageSchema[],
  existing: Record<number, Record<string, FieldValue>> = {},
) => Object.fromEntries(schemas.map((schema) => [
  schema.id,
  Object.fromEntries(schema.fields.map((field) => [field.key, existing[schema.id]?.[field.key] ?? defaultValueForField(field)])),
]))

function App() {
  const [profile, setProfile] = useState<AppProfile>(loadProfile)
  const [activeTab, setActiveTab] = useState('pid')
  const [frames, setFrames] = useState<DecodedFrame[]>([])
  const [logs, setLogs] = useState<RawLogEntry[]>([])
  const [stats, setStats] = useState<SerialStats>(emptyStats)
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [paused, setPaused] = useState(false)
  const [status, setStatus] = useState('未连接。请选择无线DAPLink对应的COM口。')
  const [txValues, setTxValues] = useState<Record<number, Record<string, FieldValue>>>(() => buildTxValues(profile.txSchemas))

  const profileRef = useRef(profile)
  const pausedRef = useRef(paused)
  const txValuesRef = useRef(txValues)
  const parserRef = useRef(new FrameStreamParser())
  const sequenceRef = useRef(new Map<number, number>())
  const lastRxSequenceRef = useRef(new Map<number, number>())
  const statsRef = useRef(stats)
  const pendingFramesRef = useRef<DecodedFrame[]>([])
  const pendingLogsRef = useRef<RawLogEntry[]>([])
  const flushTimerRef = useRef<number | null>(null)
  const logIdRef = useRef(1)
  const onBytesRef = useRef<(bytes: Uint8Array) => void>(() => undefined)
  const onTxRef = useRef<(bytes: Uint8Array) => void>(() => undefined)
  const onErrorRef = useRef<(error: Error) => void>(() => undefined)
  const onDisconnectRef = useRef<() => void>(() => undefined)
  const transportRef = useRef<SerialTransport | null>(null)

  const flushPending = () => {
    flushTimerRef.current = null
    const pendingFrames = pendingFramesRef.current.splice(0)
    const pendingLogs = pendingLogsRef.current.splice(0)
    if (pendingFrames.length) setFrames((current) => [...current, ...pendingFrames].slice(-MAX_FRAMES))
    if (pendingLogs.length) setLogs((current) => [...current, ...pendingLogs].slice(-MAX_LOGS))
    setStats({ ...statsRef.current })
  }

  const scheduleFlush = () => {
    if (flushTimerRef.current === null) flushTimerRef.current = window.setTimeout(flushPending, 50)
  }

  const queueLog = (entry: Omit<RawLogEntry, 'id'>) => {
    if (pausedRef.current) return
    pendingLogsRef.current.push({ ...entry, id: logIdRef.current++ })
    scheduleFlush()
  }

  useEffect(() => {
    onBytesRef.current = (bytes) => {
      statsRef.current.rxBytes += bytes.length
      queueLog({ time: Date.now(), direction: 'rx', bytes: bytes.slice(), status: 'raw' })
      const result = parserRef.current.push(bytes, (messageId) => profileRef.current.rxSchemas.find((schema) => schema.id === messageId))
      statsRef.current.invalidFrames += result.issues.filter((issue) => issue.kind !== 'noise').length
      for (const issue of result.issues) queueLog({ time: Date.now(), direction: 'rx', bytes: issue.raw, status: 'error', note: issue.message })
      for (const frame of result.frames) {
        statsRef.current.validFrames += 1
        const previous = lastRxSequenceRef.current.get(frame.messageId)
        if (previous !== undefined) {
          const expected = (previous + 1) & 0xffff
          const gap = (frame.sequence - expected + 0x10000) & 0xffff
          if (gap > 0 && gap < 0x8000) statsRef.current.droppedFrames += gap
        }
        lastRxSequenceRef.current.set(frame.messageId, frame.sequence)
        if (!pausedRef.current) pendingFramesRef.current.push(frame)
      }
      scheduleFlush()
    }
    onTxRef.current = (bytes) => {
      statsRef.current.txBytes += bytes.length
      queueLog({ time: Date.now(), direction: 'tx', bytes: bytes.slice(), status: 'ok' })
      scheduleFlush()
    }
    onErrorRef.current = (error) => setStatus(`串口错误：${error.message}`)
    onDisconnectRef.current = () => {
      setConnected(false)
      setConnecting(false)
      parserRef.current.reset()
      setStatus('DAPLink连接已断开；不会补发断线期间的控件值。')
    }
  })

  useEffect(() => {
    const transport = new SerialTransport({
      onBytes: (bytes) => onBytesRef.current(bytes),
      onTx: (bytes) => onTxRef.current(bytes),
      onError: (error) => onErrorRef.current(error),
      onDisconnect: () => onDisconnectRef.current(),
    })
    transportRef.current = transport
    return () => {
      if (flushTimerRef.current !== null) window.clearTimeout(flushTimerRef.current)
      void transport.disconnect()
      transportRef.current = null
    }
  }, [])

  useEffect(() => {
    profileRef.current = profile
    if (validateProfile(profile).length === 0) saveProfile(profile)
    const next = buildTxValues(profile.txSchemas, txValuesRef.current)
    txValuesRef.current = next
    setTxValues(next)
    if (!['pid', 'terminal', 'config'].includes(activeTab) && !profile.customTabs.some((tab) => tab.id === activeTab)) setActiveTab('config')
  }, [activeTab, profile])

  useEffect(() => { pausedRef.current = paused }, [paused])
  const updateProfile = (next: AppProfile) => {
    profileRef.current = next
    setProfile(next)
  }

  const connect = async () => {
    setConnecting(true)
    setStatus('等待选择DAPLink虚拟串口…')
    try {
      await transportRef.current!.connect(profile.serial)
      setConnected(true)
      setStatus(`已连接 · ${profile.serial.baudRate} ${profile.serial.dataBits}N${profile.serial.stopBits}`)
    } catch (error) {
      setStatus(`连接失败：${(error as Error).message}`)
    } finally {
      setConnecting(false)
    }
  }

  const disconnect = async () => {
    await transportRef.current!.disconnect()
    setConnected(false)
    parserRef.current.reset()
    setStatus('已断开。')
  }

  const updateTxValue = (messageId: number, fieldKey: string, value: FieldValue) => {
    const next = { ...txValuesRef.current, [messageId]: { ...(txValuesRef.current[messageId] ?? {}), [fieldKey]: value } }
    txValuesRef.current = next
    setTxValues(next)
  }

  const encodeNext = (schema: MessageSchema, values: Record<string, FieldValue>) => {
    const sequence = sequenceRef.current.get(schema.id) ?? 0
    sequenceRef.current.set(schema.id, (sequence + 1) & 0xffff)
    return encodeFrame(schema, values, sequence)
  }

  const structuredSend = (schema: MessageSchema, values: Record<string, FieldValue>, latest = false) => {
    if (!connected) {
      setStatus('串口未连接，本次值已更新但没有排队发送。')
      return
    }
    try {
      const bytes = encodeNext(schema, values)
      if (latest) transportRef.current!.sendLatest(`message-${schema.id}`, bytes)
      else transportRef.current!.send(bytes)
    } catch (error) {
      setStatus(`打包失败：${(error as Error).message}`)
    }
  }

  const customChange = (messageId: number, fieldKey: string, value: FieldValue) => {
    updateTxValue(messageId, fieldKey, value)
    const schema = profileRef.current.txSchemas.find((item) => item.id === messageId)
    if (schema) structuredSend(schema, txValuesRef.current[messageId], true)
  }

  const rawSend = (bytes: Uint8Array, text?: string) => {
    if (!connected) return setStatus('串口未连接，数据未发送。')
    try {
      transportRef.current!.send(bytes)
      if (text) setStatus(`已提交${bytes.length}字节UTF-8文本。`)
    } catch (error) {
      setStatus((error as Error).message)
    }
  }

  const clearHistory = () => {
    pendingFramesRef.current = []
    pendingLogsRef.current = []
    setFrames([])
    setLogs([])
    lastRxSequenceRef.current.clear()
  }

  const tabs = [
    { id: 'pid', label: 'PID调试', icon: Activity },
    { id: 'terminal', label: '协议终端', icon: TerminalSquare },
    { id: 'config', label: '配置', icon: Settings },
    ...profile.customTabs.map((tab) => ({ id: tab.id, label: tab.name, icon: SlidersHorizontal })),
  ]

  return <div className="app-shell">
    <SerialToolbar
      supported={Boolean(navigator.serial)}
      connected={connected}
      connecting={connecting}
      settings={profile.serial}
      stats={stats}
      status={navigator.serial ? status : '当前浏览器不支持Web Serial，请使用桌面Chrome或Edge。'}
      onSettings={(serial) => updateProfile({ ...profile, serial })}
      onConnect={() => void connect()}
      onDisconnect={() => void disconnect()}
    />
    <nav className="tab-bar" aria-label="功能Tab">
      {tabs.map((tab) => <button key={tab.id} className={activeTab === tab.id ? 'active' : ''} onClick={() => setActiveTab(tab.id)}><tab.icon size={17} />{tab.label}</button>)}
    </nav>
    <main className="workspace-main">
      {activeTab === 'pid' && <PidTab profile={profile} frames={frames} onProfile={updateProfile} />}
      {activeTab === 'terminal' && <ProtocolTab frames={frames} logs={logs} rxSchemas={profile.rxSchemas} txSchemas={profile.txSchemas} txValues={txValues} paused={paused} connected={connected} onPaused={setPaused} onClear={clearHistory} onTxValue={updateTxValue} onStructuredSend={(schema, values) => structuredSend(schema, values)} onRawSend={rawSend} />}
      {activeTab === 'config' && <ConfigTab profile={profile} onProfile={updateProfile} />}
      {profile.customTabs.map((tab) => activeTab === tab.id && <CustomTab key={tab.id} tab={tab} txSchemas={profile.txSchemas} txValues={txValues} connected={connected} onChange={customChange} />)}
    </main>
  </div>
}

export default App
