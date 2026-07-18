/* eslint-disable react-hooks/incompatible-library */
import { Download, Eraser, Pause, Play, Send, TerminalSquare } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { DecodedFrame, FieldValue, MessageSchema, RawLogEntry, TerminalSettings } from '../domain/types'
import { bytesToHex, encodeFrame, hexToBytes } from '../protocol/codec'
import { defaultValueForField } from '../protocol/schema'
import { decodeTerminalText, encodeTerminalText } from '../utils/encoding'

interface Props {
  frames: DecodedFrame[]
  logs: RawLogEntry[]
  rxSchemas: MessageSchema[]
  txSchemas: MessageSchema[]
  txValues: Record<string, Record<string, FieldValue>>
  terminal: TerminalSettings
  paused: boolean
  connected: boolean
  onPaused: (paused: boolean) => void
  onClear: () => void
  onTxValue: (messageUid: string, field: string, value: FieldValue) => void
  onStructuredSend: (schema: MessageSchema, values: Record<string, FieldValue>) => void
  onRawSend: (bytes: Uint8Array, text?: string) => void
}

const displayValue = (value: FieldValue | undefined) => {
  if (value instanceof Uint8Array) return bytesToHex(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(4)
  return value ?? '--'
}

const download = (name: string, content: string, type: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

export function ProtocolTab(props: Props) {
  const [filterId, setFilterId] = useState<number | 'all'>('all')
  const [sendMode, setSendMode] = useState<'structured' | 'hex' | 'text'>('structured')
  const [txUid, setTxUid] = useState(props.txSchemas[0]?.uid ?? '')
  const [rawValue, setRawValue] = useState('')
  const [visibleFrames, setVisibleFrames] = useState(props.frames)
  const [visibleLogs, setVisibleLogs] = useState(props.logs)
  const historyParent = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!props.paused) {
      setVisibleFrames(props.frames)
      setVisibleLogs(props.logs)
    }
  }, [props.frames, props.logs, props.paused])

  useEffect(() => {
    if (!props.txSchemas.some((schema) => schema.uid === txUid)) setTxUid(props.txSchemas[0]?.uid ?? '')
  }, [props.txSchemas, txUid])

  const schema = filterId === 'all' ? undefined : props.rxSchemas.find((item) => item.id === filterId)
  const filtered = useMemo(() => visibleFrames.filter((frame) => filterId === 'all' || frame.messageId === filterId), [filterId, visibleFrames])
  const virtualizer = useVirtualizer({ count: filtered.length, getScrollElement: () => historyParent.current, estimateSize: () => 34, overscan: 12 })
  const txSchema = props.txSchemas.find((item) => item.uid === txUid) ?? props.txSchemas[0]
  const values = txSchema ? (props.txValues[txSchema.uid] ?? Object.fromEntries(txSchema.fields.map((field) => [field.key, defaultValueForField(field)]))) : {}
  let preview = ''
  try {
    if (txSchema) preview = bytesToHex(encodeFrame(txSchema, values, 0))
  } catch (error) {
    preview = (error as Error).message
  }

  const columns = schema ? ['时间', '序号', ...schema.fields.map((field) => field.label)] : ['时间', '消息', '序号', '长度']
  const gridTemplate = `90px 70px repeat(${Math.max(2, columns.length - 2)}, minmax(110px, 1fr))`

  const exportCsv = () => {
    const header = schema ? ['received_at', 'sequence', ...schema.fields.map((field) => field.key)] : ['received_at', 'message_id', 'sequence', 'payload_length']
    const rows = filtered.map((frame) => schema
      ? [new Date(frame.receivedAt).toISOString(), frame.sequence, ...schema.fields.map((field) => JSON.stringify(displayValue(frame.values?.[field.key])))]
      : [new Date(frame.receivedAt).toISOString(), frame.messageId, frame.sequence, frame.payloadLength])
    download(`serial-${Date.now()}.csv`, [header, ...rows].map((row) => row.join(',')).join('\n'), 'text/csv;charset=utf-8')
  }

  const sendRaw = () => {
    try {
      const bytes = sendMode === 'hex' ? hexToBytes(rawValue) : encodeTerminalText(rawValue, props.terminal.encoding, props.terminal.lineEnding)
      props.onRawSend(bytes, sendMode === 'text' ? rawValue : undefined)
    } catch (error) {
      window.alert((error as Error).message)
    }
  }

  return (
    <div className="tab-page terminal-layout">
      <section className="terminal-receive">
        <div className="section-heading">
          <div><TerminalSquare size={18} /><div><h2>接收与解析</h2><p>按 RX 数据包结构解析 payload，未知消息保留原始帧信息。</p></div></div>
          <div className="toolbar-actions">
            <select value={filterId} onChange={(event) => setFilterId(event.target.value === 'all' ? 'all' : Number(event.target.value))}>
              <option value="all">全部消息</option>
              {props.rxSchemas.map((item) => <option key={item.uid} value={item.id}>0x{item.id.toString(16).padStart(2, '0')} {item.name}</option>)}
            </select>
            <button className="icon-only" title={props.paused ? '继续视图' : '暂停视图'} onClick={() => props.onPaused(!props.paused)}>{props.paused ? <Play size={17} /> : <Pause size={17} />}</button>
            <button className="icon-only" title="清空历史" onClick={props.onClear}><Eraser size={17} /></button>
            <button className="icon-only" title="导出 CSV" onClick={exportCsv}><Download size={17} /></button>
          </div>
        </div>
        <div className="history-header" style={{ gridTemplateColumns: gridTemplate }}>{columns.map((column) => <span key={column}>{column}</span>)}</div>
        <div className="history-viewport" ref={historyParent}>
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const frame = filtered[virtualRow.index]
              const cells = schema
                ? [new Date(frame.receivedAt).toLocaleTimeString(), frame.sequence, ...schema.fields.map((field) => displayValue(frame.values?.[field.key]))]
                : [new Date(frame.receivedAt).toLocaleTimeString(), `0x${frame.messageId.toString(16).padStart(2, '0')} ${frame.schema?.name ?? 'UNKNOWN'}`, frame.sequence, frame.payloadLength]
              return <div className="history-row" key={`${frame.receivedAt}-${virtualRow.index}`} style={{ gridTemplateColumns: gridTemplate, transform: `translateY(${virtualRow.start}px)` }}>{cells.map((cell, index) => <span key={index} title={String(cell)}>{String(cell)}</span>)}</div>
            })}
          </div>
        </div>
        <div className="raw-console" aria-label="原始串口日志">
          {visibleLogs.slice(-120).map((entry) => <div className={entry.status} key={entry.id}><time>{new Date(entry.time).toLocaleTimeString()}</time><b>{entry.direction.toUpperCase()}</b><code>{bytesToHex(entry.bytes)}</code><span>{entry.note ?? entry.text ?? decodeTerminalText(entry.bytes, props.terminal.encoding)}</span></div>)}
        </div>
      </section>

      <aside className="terminal-send">
        <div className="section-heading"><div><Send size={18} /><div><h2>发送数据</h2><p>结构化帧、原始 HEX 或文本。</p></div></div></div>
        <div className="segmented">
          {(['structured', 'hex', 'text'] as const).map((mode) => <button className={sendMode === mode ? 'active' : ''} key={mode} onClick={() => setSendMode(mode)}>{mode === 'structured' ? 'Schema' : mode.toUpperCase()}</button>)}
        </div>
        {sendMode === 'structured' ? (
          txSchema ? <>
            <label className="stacked-field">TX 消息
              <select value={txSchema.uid} onChange={(event) => setTxUid(event.target.value)}>{props.txSchemas.map((item) => <option key={item.uid} value={item.uid}>0x{item.id.toString(16).padStart(2, '0')} {item.name}</option>)}</select>
            </label>
            <div className="send-fields">{txSchema.fields.map((field) => <label key={field.id}>{field.label}<input type={field.type === 'bool' ? 'checkbox' : 'text'} checked={field.type === 'bool' ? Boolean(values[field.key]) : undefined} value={field.type === 'bool' ? undefined : String(values[field.key] ?? '')} onChange={(event) => props.onTxValue(txSchema.uid, field.key, field.type === 'bool' ? event.target.checked : ['fixed-string', 'fixed-bytes'].includes(field.type) ? event.target.value : Number(event.target.value))} /><small>{field.key} · {field.type}{field.unit ? ` · ${field.unit}` : ''}</small></label>)}</div>
            <pre className="frame-preview">{preview || '没有字段'}</pre>
            <button className="primary full-button" disabled={!props.connected} onClick={() => props.onStructuredSend(txSchema, values)}><Send size={17} />发送完整帧</button>
          </> : <div className="empty-state">请先创建 TX 数据包。</div>
        ) : <>
          <label className="stacked-field">{sendMode === 'hex' ? 'HEX 字节' : `${props.terminal.encoding.toUpperCase()} 文本`}<textarea rows={8} value={rawValue} onChange={(event) => setRawValue(event.target.value)} placeholder={sendMode === 'hex' ? 'AA 55 01 81 ...' : '输入要发送的文本'} /></label>
          <button className="primary full-button" disabled={!props.connected || !rawValue} onClick={sendRaw}><Send size={17} />立即发送</button>
        </>}
      </aside>
    </div>
  )
}
