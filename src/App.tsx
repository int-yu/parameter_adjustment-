import { BarChart3, Cable, Settings, SlidersHorizontal, TerminalSquare } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import './App.css'
import type { AppProfile, DecodedFrame, FieldValue, MessageSchema, RawLogEntry, SerialStats } from './domain/types'
import { buildTxValues } from './domain/bindings'
import { loadProfile, saveProfile } from './state/persistence'
import { validateProfile } from './protocol/schema'
import { FrameStreamParser } from './protocol/parser'
import { encodeFrame } from './protocol/codec'
import { SerialTransport } from './serial/SerialTransport'
import { SerialToolbar } from './components/SerialToolbar'
import { ProtocolTab } from './features/ProtocolTab'
import { DisplayTerminalTab } from './features/DisplayTerminalTab'
import { ProfessionalDebugTab } from './features/ProfessionalDebugTab'
import { PacketConfigTab } from './features/PacketConfigTab'
import { SettingsTab } from './features/SettingsTab'

const emptyStats = (): SerialStats => ({ rxBytes: 0, txBytes: 0, validFrames: 0, invalidFrames: 0, droppedFrames: 0 })

function App() {
  const [profile, setProfile] = useState<AppProfile>(loadProfile)
  const [activeTab, setActiveTab] = useState('terminal')
  const [frames, setFrames] = useState<DecodedFrame[]>([])
  const [logs, setLogs] = useState<RawLogEntry[]>([])
  const [stats, setStats] = useState<SerialStats>(emptyStats)
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [paused, setPaused] = useState(false)
  const [status, setStatus] = useState('未连接。请在设置页确认串口参数后选择 DAPLink 虚拟串口。')
  const [txValues, setTxValues] = useState<Record<string, Record<string, FieldValue>>>(() => buildTxValues(profile.txSchemas))

  const profileRef = useRef(profile)
  const txValuesRef = useRef(txValues)
  const parserRef = useRef(new FrameStreamParser())
  const sequenceRef = useRef(new Map<string, number>())
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
  const latestTimersRef = useRef(new Map<string, number>())
  const latestPayloadsRef = useRef(new Map<string, { schema: MessageSchema; values: Record<string, FieldValue> }>())
  const periodicTimersRef = useRef(new Map<string, number>())

  const flushPending = () => {
    flushTimerRef.current = null
    const pendingFrames = pendingFramesRef.current.splice(0)
    const pendingLogs = pendingLogsRef.current.splice(0)
    const current = profileRef.current
    if (pendingFrames.length) setFrames((items) => [...items, ...pendingFrames].slice(-current.history.maxFrames))
    if (pendingLogs.length) setLogs((items) => [...items, ...pendingLogs].slice(-current.history.maxLogs))
    setStats({ ...statsRef.current })
  }

  const scheduleFlush = () => {
    if (flushTimerRef.current === null) flushTimerRef.current = window.setTimeout(flushPending, 50)
  }

  const queueLog = (entry: Omit<RawLogEntry, 'id'>) => {
    pendingLogsRef.current.push({ ...entry, id: logIdRef.current++ })
    scheduleFlush()
  }

  useEffect(() => {
    onBytesRef.current = (bytes) => {
      statsRef.current.rxBytes += bytes.length
      queueLog({ time: Date.now(), direction: 'rx', bytes: bytes.slice(), status: 'raw' })
      const result = parserRef.current.push(bytes, (messageId) => profileRef.current.rxSchemas.find((schema) => schema.id === messageId), profileRef.current.frameFormat)
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
        pendingFramesRef.current.push(frame)
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
      setStatus('DAPLink 连接已断开；不会补发断线期间的控件值。')
    }
  })

  useEffect(() => {
    const latestTimers = latestTimersRef.current
    const periodicTimers = periodicTimersRef.current
    const transport = new SerialTransport({
      onBytes: (bytes) => onBytesRef.current(bytes),
      onTx: (bytes) => onTxRef.current(bytes),
      onError: (error) => onErrorRef.current(error),
      onDisconnect: () => onDisconnectRef.current(),
    })
    transportRef.current = transport
    return () => {
      if (flushTimerRef.current !== null) window.clearTimeout(flushTimerRef.current)
      for (const timer of latestTimers.values()) window.clearTimeout(timer)
      for (const timer of periodicTimers.values()) window.clearInterval(timer)
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
    if (!['terminal', 'display', 'professional', 'packet-config', 'settings'].includes(activeTab)) setActiveTab('terminal')
  }, [activeTab, profile])

  const updateProfile = (next: AppProfile) => {
    if (JSON.stringify(profileRef.current.frameFormat) !== JSON.stringify(next.frameFormat)) parserRef.current.reset()
    profileRef.current = next
    setProfile(next)
  }

  const connect = async () => {
    setConnecting(true)
    setStatus('等待选择 DAPLink 虚拟串口...')
    try {
      await transportRef.current!.connect(profile.serial)
      setConnected(true)
      setStatus(`已连接 · ${profile.serial.baudRate} ${profile.serial.dataBits}${profile.serial.parity === 'none' ? 'N' : profile.serial.parity[0].toUpperCase()}${profile.serial.stopBits}`)
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

  const updateTxValue = (messageUid: string, fieldKey: string, value: FieldValue) => {
    const next = { ...txValuesRef.current, [messageUid]: { ...(txValuesRef.current[messageUid] ?? {}), [fieldKey]: value } }
    txValuesRef.current = next
    setTxValues(next)
  }

  const encodeNext = (schema: MessageSchema, values: Record<string, FieldValue>) => {
    const sequence = sequenceRef.current.get(schema.uid) ?? 0
    sequenceRef.current.set(schema.uid, (sequence + 1) & 0xffff)
    return encodeFrame(schema, values, sequence, profileRef.current.frameFormat)
  }

  const sendNow = (schema: MessageSchema, values: Record<string, FieldValue>, latest = false) => {
    if (!connected) {
      setStatus('串口未连接，本次值已更新但未发送。')
      return
    }
    try {
      const bytes = encodeNext(schema, values)
      if (latest) transportRef.current!.sendLatest(`message-${schema.uid}`, bytes)
      else transportRef.current!.send(bytes)
    } catch (error) {
      setStatus(`打包失败：${(error as Error).message}`)
    }
  }

  const scheduleLatestSend = (schema: MessageSchema, values: Record<string, FieldValue>) => {
    latestPayloadsRef.current.set(schema.uid, { schema, values: { ...values } })
    if (latestTimersRef.current.has(schema.uid)) return
    const timer = window.setTimeout(() => {
      latestTimersRef.current.delete(schema.uid)
      const payload = latestPayloadsRef.current.get(schema.uid)
      latestPayloadsRef.current.delete(schema.uid)
      if (payload) sendNow(payload.schema, payload.values, true)
    }, 50)
    latestTimersRef.current.set(schema.uid, timer)
  }

  const structuredSend = (schema: MessageSchema, values: Record<string, FieldValue>, latest = false) => {
    if (latest) scheduleLatestSend(schema, values)
    else sendNow(schema, values)
  }

  useEffect(() => {
    const periodicTimers = periodicTimersRef.current
    for (const timer of periodicTimers.values()) window.clearInterval(timer)
    periodicTimers.clear()
    if (!connected) return

    for (const schema of profile.txSchemas) {
      if (!schema.periodicSend) continue
      const periodMs = schema.periodMs ?? 100
      if (!Number.isInteger(periodMs) || periodMs < 20 || periodMs > 60000) continue
      const timer = window.setInterval(() => {
        const currentSchema = profileRef.current.txSchemas.find((item) => item.uid === schema.uid)
        if (!currentSchema?.periodicSend || !transportRef.current?.connected) return
        const values = txValuesRef.current[currentSchema.uid] ?? buildTxValues([currentSchema], txValuesRef.current)[currentSchema.uid]
        try {
          const sequence = sequenceRef.current.get(currentSchema.uid) ?? 0
          sequenceRef.current.set(currentSchema.uid, (sequence + 1) & 0xffff)
          const bytes = encodeFrame(currentSchema, values, sequence, profileRef.current.frameFormat)
          transportRef.current.sendLatest(`message-${currentSchema.uid}`, bytes)
        } catch (error) {
          setStatus(`周期发送打包失败：${(error as Error).message}`)
        }
      }, periodMs)
      periodicTimers.set(schema.uid, timer)
    }

    return () => {
      for (const timer of periodicTimers.values()) window.clearInterval(timer)
      periodicTimers.clear()
    }
  }, [connected, profile.txSchemas])

  const controlFieldChange = (messageUid: string, fieldKey: string, value: FieldValue, latest = false) => {
    const previousValues = txValuesRef.current[messageUid] ?? {}
    const values = { ...previousValues, [fieldKey]: value }
    const next = { ...txValuesRef.current, [messageUid]: values }
    txValuesRef.current = next
    setTxValues(next)
    const schema = profileRef.current.txSchemas.find((item) => item.uid === messageUid)
    if (schema) structuredSend(schema, values, latest)
  }

  const rawSend = (bytes: Uint8Array, text?: string) => {
    if (!connected) return setStatus('串口未连接，数据未发送。')
    try {
      transportRef.current!.send(bytes)
      if (text !== undefined) setStatus(`已提交 ${bytes.length} 字节文本。`)
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
    { id: 'terminal', label: '协议终端', icon: TerminalSquare },
    { id: 'display', label: '展示终端', icon: BarChart3 },
    { id: 'professional', label: '专业调试', icon: SlidersHorizontal },
    { id: 'packet-config', label: '数据包配置', icon: Cable },
    { id: 'settings', label: '设置', icon: Settings },
  ]

  return <div className="app-shell">
    <SerialToolbar
      supported={Boolean(navigator.serial)}
      connected={connected}
      connecting={connecting}
      stats={stats}
      status={navigator.serial ? status : '当前浏览器不支持 Web Serial，请使用桌面 Chrome 或 Edge。'}
      onConnect={() => void connect()}
      onDisconnect={() => void disconnect()}
    />
    <nav className="tab-bar" aria-label="功能 Tab">
      {tabs.map((tab) => <button key={tab.id} className={activeTab === tab.id ? 'active' : ''} onClick={() => setActiveTab(tab.id)}><tab.icon size={17} />{tab.label}</button>)}
    </nav>
    <main className="workspace-main">
      {activeTab === 'terminal' && <ProtocolTab frames={frames} logs={logs} rxSchemas={profile.rxSchemas} txSchemas={profile.txSchemas} txValues={txValues} terminal={profile.terminal} frameFormat={profile.frameFormat} paused={paused} connected={connected} onPaused={setPaused} onClear={clearHistory} onTxValue={updateTxValue} onStructuredSend={(schema, values) => structuredSend(schema, values)} onRawSend={rawSend} />}
      {activeTab === 'display' && <DisplayTerminalTab profile={profile} frames={frames} onProfile={updateProfile} />}
      {activeTab === 'professional' && <ProfessionalDebugTab profile={profile} txValues={txValues} connected={connected} onProfile={updateProfile} onFieldChange={controlFieldChange} />}
      {activeTab === 'packet-config' && <PacketConfigTab profile={profile} onProfile={updateProfile} />}
      {activeTab === 'settings' && <SettingsTab profile={profile} connected={connected} onProfile={updateProfile} />}
    </main>
  </div>
}

export default App
