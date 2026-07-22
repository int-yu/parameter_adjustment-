import { Gauge, Lock, MousePointer2, Plus, RotateCw, Trash2, Unlock } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { AppProfile, FieldValue, ProfessionalMode, ProfessionalWidget, ProfessionalWidgetKind } from '../domain/types'
import { findField, findMessage, valueForField } from '../domain/bindings'
import { isNumericField } from '../protocol/schema'
import { createId } from '../utils/id'

interface Props {
  profile: AppProfile
  txValues: Record<string, Record<string, FieldValue>>
  connected: boolean
  onProfile: (profile: AppProfile) => void
  onFieldChange: (messageUid: string, fieldKey: string, value: FieldValue, latest?: boolean) => void
}

const KIND_LABELS: Record<ProfessionalWidgetKind, string> = {
  button: '按钮',
  switch: '开关',
  slider: '滑动条',
  joystick: '摇杆',
  numeric: '数值槽',
}

const defaultWidget = (kind: ProfessionalWidgetKind, index: number): ProfessionalWidget => ({
  id: createId('widget'),
  kind,
  label: KIND_LABELS[kind],
  x: 32 + (index % 4) * 150,
  y: 32 + Math.floor(index / 4) * 130,
  width: kind === 'joystick' ? 150 : 132,
  height: kind === 'joystick' ? 150 : kind === 'slider' ? 118 : 92,
  angle: 0,
  min: kind === 'button' || kind === 'switch' ? undefined : kind === 'joystick' ? -100 : 0,
  max: kind === 'button' || kind === 'switch' ? undefined : 100,
  step: kind === 'slider' || kind === 'numeric' ? 1 : undefined,
})

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function ProfessionalDebugTab({ profile, txValues, connected, onProfile, onFieldChange }: Props) {
  const [mode, setMode] = useState<ProfessionalMode>('move')
  const [selectedId, setSelectedId] = useState(profile.professionalControls[0]?.id ?? '')
  const dragRef = useRef<{ id: string; startX: number; startY: number; originX: number; originY: number } | null>(null)
  const selected = profile.professionalControls.find((control) => control.id === selectedId)
  const numericOptions = useMemo(() => profile.txSchemas.flatMap((message) => message.fields.filter(isNumericField).map((field) => ({ message, field }))), [profile.txSchemas])
  const boolOptions = useMemo(() => profile.txSchemas.flatMap((message) => message.fields.filter((field) => field.type === 'bool').map((field) => ({ message, field }))), [profile.txSchemas])

  const updateControl = (id: string, patch: Partial<ProfessionalWidget>) => {
    onProfile({ ...profile, professionalControls: profile.professionalControls.map((control) => control.id === id ? { ...control, ...patch } : control) })
  }

  const addControl = (kind: ProfessionalWidgetKind) => {
    const next = defaultWidget(kind, profile.professionalControls.length)
    const bindingSource = kind === 'button' || kind === 'switch' ? boolOptions[0] : numericOptions[0]
    if (kind === 'joystick') {
      const first = numericOptions[0]
      const second = numericOptions.find((item) => item.message.uid === first?.message.uid && item.field.id !== first.field.id)
      if (first && second) next.joystickBinding = { messageUid: first.message.uid, xFieldId: first.field.id, yFieldId: second.field.id }
    } else if (bindingSource) {
      next.binding = { messageUid: bindingSource.message.uid, fieldId: bindingSource.field.id }
    }
    onProfile({ ...profile, professionalControls: [...profile.professionalControls, next] })
    setSelectedId(next.id)
  }

  const sendBoundValue = (control: ProfessionalWidget, value: FieldValue, latest = false) => {
    const message = findMessage(profile.txSchemas, control.binding?.messageUid)
    const field = findField(message, control.binding?.fieldId)
    if (!message || !field) return
    onFieldChange(message.uid, field.key, value, latest)
  }

  const toggleSwitch = (control: ProfessionalWidget, currentValue: boolean) => {
    const nextValue = !currentValue
    sendBoundValue(control, nextValue)
  }

  const sendJoystick = (control: ProfessionalWidget, x: number, y: number, latest = true) => {
    const message = findMessage(profile.txSchemas, control.joystickBinding?.messageUid)
    const xField = findField(message, control.joystickBinding?.xFieldId)
    const yField = findField(message, control.joystickBinding?.yFieldId)
    if (!message || !xField || !yField) return
    onFieldChange(message.uid, xField.key, x, latest)
    onFieldChange(message.uid, yField.key, y, latest)
  }

  const pointerDownFrame = (event: React.PointerEvent, control: ProfessionalWidget) => {
    setSelectedId(control.id)
    if ((event.target as HTMLElement).closest('button,input,select,.joystick-pad')) return
    if (control.kind === 'joystick' && control.locked) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    if (mode === 'move') {
      dragRef.current = { id: control.id, startX: event.clientX, startY: event.clientY, originX: control.x, originY: control.y }
    } else {
      const rect = event.currentTarget.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const angle = Math.round(Math.atan2(event.clientY - cy, event.clientX - cx) * 180 / Math.PI)
      updateControl(control.id, { angle })
    }
  }

  const pointerMoveFrame = (event: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    updateControl(drag.id, {
      x: Math.round(drag.originX + event.clientX - drag.startX),
      y: Math.round(drag.originY + event.clientY - drag.startY),
    })
  }

  const renderWidget = (control: ProfessionalWidget) => {
    const message = findMessage(profile.txSchemas, control.binding?.messageUid)
    const field = findField(message, control.binding?.fieldId)
    const currentValue = valueForField(txValues[message?.uid ?? ''], field)
    const min = control.min ?? 0
    const max = control.max ?? 100
    const numericValue = typeof currentValue === 'number' ? currentValue : Number(currentValue) || 0

    if (control.kind === 'button') {
      return <button className="momentary-control" disabled={!field || !connected} onPointerDown={() => sendBoundValue(control, true)} onPointerUp={() => sendBoundValue(control, false)} onPointerLeave={() => sendBoundValue(control, false)}>{control.label}</button>
    }
    if (control.kind === 'switch') {
      const checked = Boolean(currentValue)
      return <button className={`toggle-control ${checked ? 'active' : ''}`} disabled={!field || !connected} onClick={() => toggleSwitch(control, checked)}>{checked ? 'ON' : 'OFF'}</button>
    }
    if (control.kind === 'slider') {
      return <div className="slider-control professional-slider">
        <input type="range" min={min} max={max} step={control.step ?? 1} disabled={!field || !connected} value={clamp(numericValue, min, max)} onChange={(event) => sendBoundValue(control, Number(event.target.value), true)} />
        <output>{numericValue.toFixed(2)}</output>
      </div>
    }
    if (control.kind === 'numeric') {
      return <input className="numeric-slot" type="number" min={min} max={max} step={control.step ?? 1} disabled={!field || !connected} value={numericValue} onChange={(event) => sendBoundValue(control, Number(event.target.value))} />
    }
    return <Joystick control={control} connected={connected} onChange={sendJoystick} />
  }

  return <div className="tab-page professional-layout">
    <section className="professional-canvas-panel">
      <div className="section-heading">
        <div><Gauge size={18} /><div><h2>专业调试画布</h2><p>控件绑定 TX 变量，变化时发送完整当前帧。</p></div></div>
      </div>
      <div className="professional-canvas">
        {profile.professionalControls.length === 0 && <div className="empty-state">从右侧添加控件。</div>}
        {profile.professionalControls.map((control) => (
          <div
            className={`professional-widget ${selectedId === control.id ? 'selected' : ''} ${control.locked ? 'locked' : ''}`}
            key={control.id}
            style={{ left: control.x, top: control.y, width: control.width, height: control.height, transform: `rotate(${control.angle}deg)` }}
            onPointerDown={(event) => pointerDownFrame(event, control)}
            onPointerMove={pointerMoveFrame}
            onPointerUp={() => { dragRef.current = null }}
          >
            {control.kind === 'joystick' && <button
              type="button"
              className={`widget-lock-toggle ${control.locked ? 'active' : ''}`}
              aria-label={control.locked ? '解锁摇杆位置' : '锁定摇杆位置'}
              title={control.locked ? '解锁摇杆位置' : '锁定摇杆位置'}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                updateControl(control.id, { locked: !control.locked })
              }}
            >
              {control.locked ? <Lock size={13} /> : <Unlock size={13} />}
            </button>}
            <div className="widget-title">{control.label}</div>
            <div className="widget-body">{renderWidget(control)}</div>
          </div>
        ))}
        <div className="canvas-mode-switch segmented">
          <button className={mode === 'move' ? 'active' : ''} onClick={() => setMode('move')}><MousePointer2 size={15} />移动模式</button>
          <button className={mode === 'angle' ? 'active' : ''} onClick={() => setMode('angle')}><RotateCw size={15} />角度模式</button>
        </div>
      </div>
    </section>

    <aside className="professional-sidebar">
      <div className="section-heading"><div><h2>控件</h2><p>{connected ? '串口已连接' : '串口未连接'}</p></div></div>
      <div className="toolbox-grid">
        {(['button', 'switch', 'slider', 'joystick', 'numeric'] as const).map((kind) => <button key={kind} className="icon-text" onClick={() => addControl(kind)}><Plus size={15} />{KIND_LABELS[kind]}</button>)}
      </div>
      {selected ? <Inspector
        control={selected}
        profile={profile}
        boolOptions={boolOptions}
        numericOptions={numericOptions}
        onChange={(patch) => updateControl(selected.id, patch)}
        onDelete={() => {
          onProfile({ ...profile, professionalControls: profile.professionalControls.filter((control) => control.id !== selected.id) })
          setSelectedId('')
        }}
      /> : <div className="empty-state">选择一个控件后编辑绑定和范围。</div>}
    </aside>
  </div>
}

function Joystick({ control, connected, onChange }: {
  control: ProfessionalWidget
  connected: boolean
  onChange: (control: ProfessionalWidget, x: number, y: number, latest?: boolean) => void
}) {
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const drag = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (!connected) return
    const rect = event.currentTarget.getBoundingClientRect()
    const nx = clamp((event.clientX - rect.left) / rect.width * 2 - 1, -1, 1)
    const ny = clamp((event.clientY - rect.top) / rect.height * 2 - 1, -1, 1)
    setKnob({ x: nx, y: ny })
    const min = control.min ?? -100
    const max = control.max ?? 100
    onChange(control, nx * Math.max(Math.abs(min), Math.abs(max)), -ny * Math.max(Math.abs(min), Math.abs(max)), true)
  }
  const pointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId)
    drag(event)
  }
  const release = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (!connected) return
    setKnob({ x: 0, y: 0 })
    onChange(control, 0, 0, false)
  }
  return <div className="joystick-pad" onPointerDown={pointerDown} onPointerMove={(event) => event.buttons ? drag(event) : undefined} onPointerUp={release} onPointerLeave={release} aria-disabled={!connected}>
    <span style={{ left: `${50 + knob.x * 38}%`, top: `${50 + knob.y * 38}%` }} />
  </div>
}

function Inspector({ control, profile, boolOptions, numericOptions, onChange, onDelete }: {
  control: ProfessionalWidget
  profile: AppProfile
  boolOptions: Array<{ message: AppProfile['txSchemas'][number]; field: AppProfile['txSchemas'][number]['fields'][number] }>
  numericOptions: Array<{ message: AppProfile['txSchemas'][number]; field: AppProfile['txSchemas'][number]['fields'][number] }>
  onChange: (patch: Partial<ProfessionalWidget>) => void
  onDelete: () => void
}) {
  const fieldOptions = control.kind === 'button' || control.kind === 'switch' ? boolOptions : numericOptions
  const bindingValue = control.binding ? `${control.binding.messageUid}:${control.binding.fieldId}` : ''
  const joystickMessage = profile.txSchemas.find((message) => message.uid === control.joystickBinding?.messageUid) ?? profile.txSchemas[0]
  const joystickFields = joystickMessage?.fields.filter(isNumericField) ?? []

  return <section className="inspector-panel">
    <label className="stacked-field">名称<input value={control.label} onChange={(event) => onChange({ label: event.target.value })} /></label>
    <label className="stacked-field">类型
      <select value={control.kind} onChange={(event) => onChange({ kind: event.target.value as ProfessionalWidgetKind, binding: undefined, joystickBinding: undefined })}>
        {Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
    {control.kind === 'joystick' ? <>
      <label className="stacked-field">绑定消息
        <select value={joystickMessage?.uid ?? ''} onChange={(event) => {
          const message = profile.txSchemas.find((item) => item.uid === event.target.value)
          const fields = message?.fields.filter(isNumericField) ?? []
          onChange({ joystickBinding: message && fields[0] && fields[1] ? { messageUid: message.uid, xFieldId: fields[0].id, yFieldId: fields[1].id } : undefined })
        }}>
          {profile.txSchemas.map((message) => <option key={message.uid} value={message.uid}>0x{message.id.toString(16)} {message.name}</option>)}
        </select>
      </label>
      <label className="stacked-field">X 轴变量<select value={control.joystickBinding?.xFieldId ?? ''} onChange={(event) => onChange({ joystickBinding: control.joystickBinding ? { ...control.joystickBinding, xFieldId: event.target.value } : undefined })}>{joystickFields.map((field) => <option key={field.id} value={field.id}>{field.label}</option>)}</select></label>
      <label className="stacked-field">Y 轴变量<select value={control.joystickBinding?.yFieldId ?? ''} onChange={(event) => onChange({ joystickBinding: control.joystickBinding ? { ...control.joystickBinding, yFieldId: event.target.value } : undefined })}>{joystickFields.map((field) => <option key={field.id} value={field.id}>{field.label}</option>)}</select></label>
    </> : <label className="stacked-field">绑定变量
      <select value={bindingValue} onChange={(event) => {
        const [messageUid, fieldId] = event.target.value.split(':')
        onChange({ binding: messageUid && fieldId ? { messageUid, fieldId } : undefined })
      }}>
        <option value="">未绑定</option>
        {fieldOptions.map(({ message, field }) => <option key={`${message.uid}:${field.id}`} value={`${message.uid}:${field.id}`}>0x{message.id.toString(16)} {message.name} · {field.label}</option>)}
      </select>
    </label>}
    {(control.kind === 'slider' || control.kind === 'numeric' || control.kind === 'joystick') && <div className="range-grid">
      <label>最小<input type="number" value={control.min ?? ''} onChange={(event) => onChange({ min: Number(event.target.value) })} /></label>
      <label>最大<input type="number" value={control.max ?? ''} onChange={(event) => onChange({ max: Number(event.target.value) })} /></label>
      {control.kind !== 'joystick' && <label>步长<input type="number" value={control.step ?? ''} onChange={(event) => onChange({ step: Number(event.target.value) })} /></label>}
    </div>}
    <div className="range-grid">
      <label>X<input type="number" value={control.x} onChange={(event) => onChange({ x: Number(event.target.value) })} /></label>
      <label>Y<input type="number" value={control.y} onChange={(event) => onChange({ y: Number(event.target.value) })} /></label>
      <label>角度<input type="number" value={control.angle} onChange={(event) => onChange({ angle: Number(event.target.value) })} /></label>
    </div>
    <button className="icon-text danger full-button" onClick={onDelete}><Trash2 size={16} />删除控件</button>
  </section>
}
