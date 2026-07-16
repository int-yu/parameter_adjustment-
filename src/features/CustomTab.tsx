import { Power, Send, ToggleLeft } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { CustomTabDefinition, FieldValue, MessageSchema } from '../domain/types'

interface Props {
  tab: CustomTabDefinition
  txSchemas: MessageSchema[]
  txValues: Record<number, Record<string, FieldValue>>
  connected: boolean
  onChange: (messageId: number, fieldKey: string, value: FieldValue) => void
}

function RuntimeControl({ control, schema, value, connected, onChange }: {
  control: CustomTabDefinition['controls'][number]
  schema?: MessageSchema
  value: FieldValue | undefined
  connected: boolean
  onChange: (value: FieldValue) => void
}) {
  const timer = useRef<number | null>(null)
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])
  const field = schema?.fields.find((item) => item.key === control.fieldKey)
  if (!schema || !field) return <div className="runtime-control invalid"><span>{control.label}</span><strong>绑定无效</strong></div>
  const min = control.min ?? 0
  const max = control.max ?? 100
  const step = control.step ?? 1
  const numeric = typeof value === 'number' ? value : Number(value) || 0

  const pulse = () => {
    onChange(true)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => onChange(false), control.pulseMs ?? 100)
  }

  return <div className="runtime-control">
    <div className="runtime-label"><span>{control.label}</span><small>0x{schema.id.toString(16).padStart(2, '0')} · {field.key}</small></div>
    {control.kind === 'bool-toggle' && <button className={`toggle-control ${value ? 'active' : ''}`} aria-pressed={Boolean(value)} disabled={!connected} onClick={() => onChange(!value)}><ToggleLeft size={18} />{value ? 'ON' : 'OFF'}</button>}
    {control.kind === 'bool-hold' && <button className="momentary-control" disabled={!connected} onPointerDown={() => onChange(true)} onPointerUp={() => onChange(false)} onPointerCancel={() => onChange(false)} onPointerLeave={() => value && onChange(false)}><Power size={18} />按住有效</button>}
    {control.kind === 'bool-pulse' && <button className="momentary-control" disabled={!connected} onClick={pulse}><Send size={18} />脉冲 {control.pulseMs ?? 100}ms</button>}
    {control.kind === 'text' && <input value={String(value ?? '')} disabled={!connected} maxLength={field.length} onChange={(event) => onChange(event.target.value)} />}
    {control.kind === 'number' && <input type="number" value={numeric} min={min} max={max} step={step} disabled={!connected} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) onChange(next) }} />}
    {control.kind === 'slider' && <div className="slider-control"><input type="range" value={numeric} min={min} max={max} step={step} disabled={!connected} onChange={(event) => onChange(Number(event.target.value))} /><output>{numeric}</output></div>}
    {control.kind === 'enum' && <select value={numeric} disabled={!connected} onChange={(event) => onChange(Number(event.target.value))}>{(control.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>}
  </div>
}

export function CustomTab({ tab, txSchemas, txValues, connected, onChange }: Props) {
  return <div className="tab-page custom-runtime">
    <div className="section-heading"><div><h2>{tab.name}</h2><p>控件变化立即发送所属消息的完整帧；断线时不缓存。</p></div></div>
    {tab.controls.length === 0 ? <div className="empty-state">此Tab还没有控件，请在“配置”中创建。</div> : <div className="control-grid">{tab.controls.map((control) => {
      const schema = txSchemas.find((item) => item.id === control.messageId)
      return <RuntimeControl key={control.id} control={control} schema={schema} connected={connected} value={txValues[control.messageId]?.[control.fieldKey]} onChange={(value) => onChange(control.messageId, control.fieldKey, value)} />
    })}</div>}
  </div>
}
