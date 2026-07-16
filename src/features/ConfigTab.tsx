import { ArrowDown, ArrowUp, Copy, Download, FileUp, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useRef } from 'react'
import type { AppProfile, ControlDefinition, ControlKind, FieldSchema, FieldType, MessageDirection, MessageSchema } from '../domain/types'
import { DEFAULT_PROFILE } from '../domain/defaultProfile'
import { cloneProfile, payloadByteSize, validateMessageSchema } from '../protocol/schema'
import { exportProfile, importProfile } from '../state/persistence'
import { createId } from '../utils/id'

interface Props {
  profile: AppProfile
  onProfile: (profile: AppProfile) => void
}

const FIELD_TYPES: FieldType[] = ['bool', 'u8', 'i8', 'u16', 'i16', 'u32', 'i32', 'f32', 'f64', 'fixed-string', 'fixed-bytes']
const CONTROL_KINDS: Array<{ value: ControlKind; label: string }> = [
  { value: 'bool-toggle', label: '布尔切换' },
  { value: 'bool-hold', label: '按住有效' },
  { value: 'bool-pulse', label: '布尔脉冲' },
  { value: 'text', label: '文本框' },
  { value: 'number', label: '数值框' },
  { value: 'slider', label: '滑块' },
  { value: 'enum', label: '枚举菜单' },
]

const downloadJson = (profile: AppProfile) => {
  const url = URL.createObjectURL(new Blob([exportProfile(profile)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${profile.name || 'daplink-profile'}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

function FieldRow({ field, index, count, onChange, onDelete, onMove }: {
  field: FieldSchema
  index: number
  count: number
  onChange: (field: FieldSchema) => void
  onDelete: () => void
  onMove: (delta: number) => void
}) {
  return <div className="field-row">
    <input aria-label="字段标签" value={field.label} onChange={(event) => onChange({ ...field, label: event.target.value })} />
    <input aria-label="字段键名" value={field.key} onChange={(event) => onChange({ ...field, key: event.target.value })} />
    <select aria-label="字段类型" value={field.type} onChange={(event) => onChange({ ...field, type: event.target.value as FieldType, length: ['fixed-string', 'fixed-bytes'].includes(event.target.value) ? field.length ?? 8 : undefined })}>{FIELD_TYPES.map((type) => <option key={type}>{type}</option>)}</select>
    <input aria-label="字段长度" type="number" min="1" disabled={!['fixed-string', 'fixed-bytes'].includes(field.type)} value={field.length ?? ''} onChange={(event) => onChange({ ...field, length: Number(event.target.value) })} />
    <input aria-label="字段单位" placeholder="单位" value={field.unit ?? ''} onChange={(event) => onChange({ ...field, unit: event.target.value })} />
    <div className="row-actions">
      <button className="icon-only" disabled={index === 0} title="上移" onClick={() => onMove(-1)}><ArrowUp size={15} /></button>
      <button className="icon-only" disabled={index === count - 1} title="下移" onClick={() => onMove(1)}><ArrowDown size={15} /></button>
      <button className="icon-only danger-ghost" title="删除字段" onClick={onDelete}><Trash2 size={15} /></button>
    </div>
  </div>
}

function MessageEditor({ schema, index, count, onChange, onDelete, onClone, onMove }: {
  schema: MessageSchema
  index: number
  count: number
  onChange: (schema: MessageSchema) => void
  onDelete: () => void
  onClone: () => void
  onMove: (delta: number) => void
}) {
  const errors = validateMessageSchema(schema)
  let payloadSize = 0
  try { payloadSize = payloadByteSize(schema) } catch { payloadSize = 0 }
  const updateField = (fieldIndex: number, next: FieldSchema) => onChange({ ...schema, fields: schema.fields.map((field, current) => current === fieldIndex ? next : field) })
  const moveField = (fieldIndex: number, delta: number) => {
    const fields = [...schema.fields]
    const target = fieldIndex + delta
    if (target < 0 || target >= fields.length) return
    ;[fields[fieldIndex], fields[target]] = [fields[target], fields[fieldIndex]]
    onChange({ ...schema, fields })
  }
  return <article className="schema-card">
    <div className="schema-head">
      <div className="schema-ident">
        <span className={`direction ${schema.direction}`}>{schema.direction.toUpperCase()}</span>
        <input value={schema.name} aria-label="消息名称" onChange={(event) => onChange({ ...schema, name: event.target.value })} />
        <label>ID 0x<input value={schema.id.toString(16).toUpperCase()} aria-label="消息ID" onChange={(event) => onChange({ ...schema, id: Number.parseInt(event.target.value || '0', 16) || 0 })} /></label>
        <strong>{payloadSize} B</strong>
      </div>
      <div className="row-actions">
        <button className="icon-only" disabled={index === 0} title="上移消息" onClick={() => onMove(-1)}><ArrowUp size={16} /></button>
        <button className="icon-only" disabled={index === count - 1} title="下移消息" onClick={() => onMove(1)}><ArrowDown size={16} /></button>
        <button className="icon-only" title="复制消息" onClick={onClone}><Copy size={16} /></button>
        <button className="icon-only danger-ghost" title="删除消息" onClick={onDelete}><Trash2 size={16} /></button>
      </div>
    </div>
    <div className="field-row field-header"><span>显示名</span><span>字段键名</span><span>类型</span><span>长度</span><span>单位</span><span>操作</span></div>
    {schema.fields.map((field, fieldIndex) => <FieldRow key={field.id} field={field} index={fieldIndex} count={schema.fields.length} onChange={(next) => updateField(fieldIndex, next)} onDelete={() => onChange({ ...schema, fields: schema.fields.filter((_, current) => current !== fieldIndex) })} onMove={(delta) => moveField(fieldIndex, delta)} />)}
    <div className="schema-footer">
      <button className="icon-text" onClick={() => onChange({ ...schema, fields: [...schema.fields, { id: createId('field'), key: `field_${schema.fields.length + 1}`, label: '新字段', type: 'f32', defaultValue: 0 }] })}><Plus size={15} />添加字段</button>
      {errors.length > 0 && <span className="validation-error">{errors.join('；')}</span>}
    </div>
  </article>
}

const newMessage = (direction: MessageDirection, existing: MessageSchema[]): MessageSchema => {
  const base = direction === 'rx' ? 0x01 : 0x80
  let id = base
  while (existing.some((schema) => schema.id === id)) id += 1
  return { id, name: direction === 'rx' ? 'RX_MESSAGE' : 'TX_MESSAGE', direction, fields: [] }
}

const defaultControl = (profile: AppProfile): ControlDefinition | null => {
  const message = profile.txSchemas[0]
  const field = message?.fields[0]
  if (!message || !field) return null
  const bool = field.type === 'bool'
  return {
    id: createId('control'),
    label: field.label,
    messageId: message.id,
    fieldKey: field.key,
    kind: bool ? 'bool-toggle' : field.type === 'fixed-string' ? 'text' : 'number',
    min: 0,
    max: 100,
    step: 1,
    pulseMs: 100,
    options: [{ label: '停止', value: 0 }, { label: '启动', value: 1 }],
  }
}

export function ConfigTab({ profile, onProfile }: Props) {
  const importRef = useRef<HTMLInputElement>(null)

  const updateSchemas = (direction: MessageDirection, schemas: MessageSchema[]) => onProfile({ ...profile, [direction === 'rx' ? 'rxSchemas' : 'txSchemas']: schemas })
  const moveMessage = (direction: MessageDirection, index: number, delta: number) => {
    const schemas = [...(direction === 'rx' ? profile.rxSchemas : profile.txSchemas)]
    const target = index + delta
    if (target < 0 || target >= schemas.length) return
    ;[schemas[index], schemas[target]] = [schemas[target], schemas[index]]
    updateSchemas(direction, schemas)
  }

  const handleImport = async (file?: File) => {
    if (!file) return
    try { onProfile(importProfile(await file.text())) } catch (error) { window.alert((error as Error).message) }
    if (importRef.current) importRef.current.value = ''
  }

  return <div className="tab-page config-page">
    <section className="section-band profile-band">
      <div className="section-heading"><div><h2>配置档案</h2><p>Schema、PID映射和自定义Tab保存在当前浏览器。</p></div><div className="toolbar-actions">
        <button className="icon-text" onClick={() => downloadJson(profile)}><Download size={16} />导出JSON</button>
        <button className="icon-text" onClick={() => importRef.current?.click()}><FileUp size={16} />导入JSON</button>
        <button className="icon-text danger" onClick={() => window.confirm('恢复默认配置？') && onProfile(cloneProfile(DEFAULT_PROFILE))}><RotateCcw size={16} />恢复默认</button>
        <input ref={importRef} hidden type="file" accept="application/json,.json" onChange={(event) => void handleImport(event.target.files?.[0])} />
      </div></div>
      <label className="profile-name">配置名称<input value={profile.name} onChange={(event) => onProfile({ ...profile, name: event.target.value })} /></label>
    </section>

    {(['rx', 'tx'] as const).map((direction) => {
      const schemas = direction === 'rx' ? profile.rxSchemas : profile.txSchemas
      return <section className="schema-section" key={direction}>
        <div className="section-heading"><div><h2>{direction === 'rx' ? '接收Schema' : '发送Schema'}</h2><p>{direction === 'rx' ? '设备到网站，消息ID 0x01~0x7F。' : '网站到设备，消息ID 0x80~0xEF。'}</p></div><button className="icon-text primary" onClick={() => updateSchemas(direction, [...schemas, newMessage(direction, schemas)])}><Plus size={16} />新增消息</button></div>
        <div className="schema-list">{schemas.map((schema, index) => <MessageEditor key={`${direction}-${schema.id}-${index}`} schema={schema} index={index} count={schemas.length} onChange={(next) => updateSchemas(direction, schemas.map((item, current) => current === index ? next : item))} onDelete={() => updateSchemas(direction, schemas.filter((_, current) => current !== index))} onClone={() => updateSchemas(direction, [...schemas.slice(0, index + 1), { ...schema, id: newMessage(direction, schemas).id, name: `${schema.name}_COPY`, fields: schema.fields.map((field) => ({ ...field, id: createId('field') })) }, ...schemas.slice(index + 1)])} onMove={(delta) => moveMessage(direction, index, delta)} />)}</div>
      </section>
    })}

    <section className="custom-builder">
      <div className="section-heading"><div><h2>自定义发送Tab</h2><p>初始为空；任一控件变化立即发送所属消息的完整当前帧。</p></div><button className="icon-text primary" onClick={() => onProfile({ ...profile, customTabs: [...profile.customTabs, { id: createId('tab'), name: `自定义 ${profile.customTabs.length + 1}`, controls: [] }] })}><Plus size={16} />新建Tab</button></div>
      {profile.customTabs.length === 0 && <div className="empty-state">尚未创建自定义Tab。</div>}
      {profile.customTabs.map((tab, tabIndex) => <article className="custom-tab-editor" key={tab.id}>
        <div className="schema-head"><input value={tab.name} onChange={(event) => onProfile({ ...profile, customTabs: profile.customTabs.map((item) => item.id === tab.id ? { ...item, name: event.target.value } : item) })} /><div className="row-actions"><button className="icon-only danger-ghost" title="删除Tab" onClick={() => onProfile({ ...profile, customTabs: profile.customTabs.filter((item) => item.id !== tab.id) })}><Trash2 size={16} /></button></div></div>
        {tab.controls.map((control, controlIndex) => {
          const message = profile.txSchemas.find((item) => item.id === control.messageId) ?? profile.txSchemas[0]
          const update = (patch: Partial<ControlDefinition>) => onProfile({ ...profile, customTabs: profile.customTabs.map((item) => item.id === tab.id ? { ...item, controls: item.controls.map((entry) => entry.id === control.id ? { ...entry, ...patch } : entry) } : item) })
          const move = (delta: number) => {
            const controls = [...tab.controls]
            const target = controlIndex + delta
            if (target < 0 || target >= controls.length) return
            ;[controls[controlIndex], controls[target]] = [controls[target], controls[controlIndex]]
            onProfile({ ...profile, customTabs: profile.customTabs.map((item) => item.id === tab.id ? { ...item, controls } : item) })
          }
          return <div className="control-editor" key={control.id}>
            <input aria-label="控件名称" value={control.label} onChange={(event) => update({ label: event.target.value })} />
            <select aria-label="绑定消息" value={message?.id ?? ''} onChange={(event) => { const next = profile.txSchemas.find((item) => item.id === Number(event.target.value)); update({ messageId: Number(event.target.value), fieldKey: next?.fields[0]?.key ?? '' }) }}>{profile.txSchemas.map((item) => <option key={item.id} value={item.id}>0x{item.id.toString(16)} {item.name}</option>)}</select>
            <select aria-label="绑定字段" value={control.fieldKey} onChange={(event) => update({ fieldKey: event.target.value })}>{message?.fields.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}</select>
            <select aria-label="控件类型" value={control.kind} onChange={(event) => update({ kind: event.target.value as ControlKind })}>{CONTROL_KINDS.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</select>
            <input aria-label="最小值" type="number" placeholder="最小" value={control.min ?? ''} onChange={(event) => update({ min: Number(event.target.value) })} />
            <input aria-label="最大值" type="number" placeholder="最大" value={control.max ?? ''} onChange={(event) => update({ max: Number(event.target.value) })} />
            <input aria-label="步长" type="number" placeholder="步长" value={control.step ?? ''} onChange={(event) => update({ step: Number(event.target.value) })} />
            {control.kind === 'bool-pulse' && <input aria-label="脉冲毫秒" type="number" value={control.pulseMs ?? 100} onChange={(event) => update({ pulseMs: Number(event.target.value) })} />}
            {control.kind === 'enum' && <input aria-label="枚举选项" className="wide-input" value={(control.options ?? []).map((option) => `${option.value}:${option.label}`).join(',')} onChange={(event) => update({ options: event.target.value.split(',').map((item) => { const [value, ...label] = item.split(':'); return { value: Number(value), label: label.join(':') || value } }).filter((item) => Number.isFinite(item.value)) })} placeholder="0:停止,1:启动" />}
            <div className="row-actions"><button className="icon-only" disabled={controlIndex === 0} onClick={() => move(-1)}><ArrowUp size={15} /></button><button className="icon-only" disabled={controlIndex === tab.controls.length - 1} onClick={() => move(1)}><ArrowDown size={15} /></button><button className="icon-only danger-ghost" onClick={() => onProfile({ ...profile, customTabs: profile.customTabs.map((item) => item.id === tab.id ? { ...item, controls: item.controls.filter((entry) => entry.id !== control.id) } : item) })}><Trash2 size={15} /></button></div>
          </div>
        })}
        <button className="icon-text" disabled={!profile.txSchemas.some((message) => message.fields.length)} onClick={() => { const control = defaultControl(profile); if (control) onProfile({ ...profile, customTabs: profile.customTabs.map((item) => item.id === tab.id ? { ...item, controls: [...item.controls, control] } : item) }) }}><Plus size={15} />添加控件</button>
        <small>Tab {tabIndex + 1} · {tab.controls.length} 个控件</small>
      </article>)}
    </section>
  </div>
}
