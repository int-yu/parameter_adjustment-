import { ArrowDown, ArrowUp, Check, Copy, Plus, Trash2, Undo2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { AppProfile, FieldSchema, FieldType, MessageDirection, MessageSchema, ProfessionalWidget } from '../domain/types'
import { cloneProfile, payloadByteSize, validateProfile, validateMessageSchema } from '../protocol/schema'
import { createId } from '../utils/id'

interface Props {
  profile: AppProfile
  onProfile: (profile: AppProfile) => void
}

const FIELD_TYPES: FieldType[] = ['bool', 'u8', 'i8', 'u16', 'i16', 'u32', 'i32', 'f32', 'f64', 'fixed-string', 'fixed-bytes']

const newField = (index: number): FieldSchema => ({
  id: createId('field'),
  key: `field_${index + 1}`,
  label: `变量${index + 1}`,
  type: 'f32',
  defaultValue: 0,
})

const newMessage = (direction: MessageDirection, existing: MessageSchema[]): MessageSchema => {
  const base = direction === 'rx' ? 0x01 : 0x80
  const max = direction === 'rx' ? 0x7f : 0xef
  let id = base
  while (existing.some((schema) => schema.id === id) && id < max) id += 1
  return {
    uid: createId(direction === 'rx' ? 'rx-msg' : 'tx-msg'),
    id,
    name: direction === 'rx' ? 'RX_MESSAGE' : 'TX_MESSAGE',
    direction,
    fields: [],
  }
}

const cleanBindings = (next: AppProfile): AppProfile => {
  const rxFieldIds = new Map(next.rxSchemas.map((schema) => [schema.uid, new Set(schema.fields.map((field) => field.id))]))
  const txFieldIds = new Map(next.txSchemas.map((schema) => [schema.uid, new Set(schema.fields.map((field) => field.id))]))
  const displaySeries = next.displaySeries.filter((series) => rxFieldIds.get(series.messageUid)?.has(series.fieldId))
  const professionalControls = next.professionalControls.map((control): ProfessionalWidget => {
    const bindingOk = control.binding && txFieldIds.get(control.binding.messageUid)?.has(control.binding.fieldId)
    const joystickOk = control.joystickBinding
      && txFieldIds.get(control.joystickBinding.messageUid)?.has(control.joystickBinding.xFieldId)
      && txFieldIds.get(control.joystickBinding.messageUid)?.has(control.joystickBinding.yFieldId)
    return {
      ...control,
      binding: bindingOk ? control.binding : undefined,
      joystickBinding: joystickOk ? control.joystickBinding : undefined,
    }
  })
  return { ...next, displaySeries, professionalControls }
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
    <input aria-label="变量名" value={field.label} onChange={(event) => onChange({ ...field, label: event.target.value })} />
    <input aria-label="字段 key" value={field.key} onChange={(event) => onChange({ ...field, key: event.target.value })} />
    <select aria-label="类型" value={field.type} onChange={(event) => {
      const type = event.target.value as FieldType
      onChange({
        ...field,
        type,
        length: ['fixed-string', 'fixed-bytes'].includes(type) ? field.length ?? 8 : undefined,
        defaultValue: type === 'bool' ? false : ['fixed-string', 'fixed-bytes'].includes(type) ? '' : 0,
      })
    }}>
      {FIELD_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
    </select>
    <input aria-label="长度" type="number" min="1" disabled={!['fixed-string', 'fixed-bytes'].includes(field.type)} value={field.length ?? ''} onChange={(event) => onChange({ ...field, length: Number(event.target.value) })} />
    <input aria-label="单位" placeholder="unit" value={field.unit ?? ''} onChange={(event) => onChange({ ...field, unit: event.target.value })} />
    <input aria-label="默认值" value={String(field.defaultValue ?? '')} onChange={(event) => {
      const defaultValue = field.type === 'bool' ? event.target.value === 'true' : ['fixed-string', 'fixed-bytes'].includes(field.type) ? event.target.value : Number(event.target.value)
      onChange({ ...field, defaultValue })
    }} />
    <div className="row-actions">
      <button className="icon-only" disabled={index === 0} title="上移" onClick={() => onMove(-1)}><ArrowUp size={15} /></button>
      <button className="icon-only" disabled={index === count - 1} title="下移" onClick={() => onMove(1)}><ArrowDown size={15} /></button>
      <button className="icon-only danger-ghost" title="删除变量" onClick={onDelete}><Trash2 size={15} /></button>
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
        <label>ID 0x<input value={schema.id.toString(16).toUpperCase()} aria-label="消息 ID" onChange={(event) => onChange({ ...schema, id: Number.parseInt(event.target.value || '0', 16) || 0 })} /></label>
        <strong>{payloadSize} B</strong>
      </div>
      <div className="row-actions">
        <button className="icon-only" disabled={index === 0} title="上移消息" onClick={() => onMove(-1)}><ArrowUp size={16} /></button>
        <button className="icon-only" disabled={index === count - 1} title="下移消息" onClick={() => onMove(1)}><ArrowDown size={16} /></button>
        <button className="icon-only" title="复制消息" onClick={onClone}><Copy size={16} /></button>
        <button className="icon-only danger-ghost" title="删除消息" onClick={onDelete}><Trash2 size={16} /></button>
      </div>
    </div>
    <div className="field-row field-header"><span>变量名</span><span>key</span><span>类型</span><span>长度</span><span>单位</span><span>默认值</span><span>操作</span></div>
    {schema.fields.map((field, fieldIndex) => <FieldRow key={field.id} field={field} index={fieldIndex} count={schema.fields.length} onChange={(next) => updateField(fieldIndex, next)} onDelete={() => onChange({ ...schema, fields: schema.fields.filter((_, current) => current !== fieldIndex) })} onMove={(delta) => moveField(fieldIndex, delta)} />)}
    <div className="schema-footer">
      <button className="icon-text" onClick={() => onChange({ ...schema, fields: [...schema.fields, newField(schema.fields.length)] })}><Plus size={15} />添加变量</button>
      {errors.length > 0 && <span className="validation-error">{errors.join('; ')}</span>}
    </div>
  </article>
}

export function PacketConfigTab({ profile, onProfile }: Props) {
  const [draft, setDraft] = useState<AppProfile>(() => cloneProfile(profile))

  const errors = useMemo(() => validateProfile(draft), [draft])
  const dirty = draft.name !== profile.name
    || JSON.stringify(draft.rxSchemas) !== JSON.stringify(profile.rxSchemas)
    || JSON.stringify(draft.txSchemas) !== JSON.stringify(profile.txSchemas)

  const updateSchemas = (direction: MessageDirection, schemas: MessageSchema[]) => {
    setDraft((current) => ({ ...current, [direction === 'rx' ? 'rxSchemas' : 'txSchemas']: schemas }))
  }

  const moveMessage = (direction: MessageDirection, index: number, delta: number) => {
    const schemas = [...(direction === 'rx' ? draft.rxSchemas : draft.txSchemas)]
    const target = index + delta
    if (target < 0 || target >= schemas.length) return
    ;[schemas[index], schemas[target]] = [schemas[target], schemas[index]]
    updateSchemas(direction, schemas)
  }

  const applyDraft = () => {
    if (errors.length) return
    const removesBinding = profile.displaySeries.length !== cleanBindings(draft).displaySeries.length
      || JSON.stringify(profile.professionalControls) !== JSON.stringify(cleanBindings(draft).professionalControls)
    if (removesBinding && !window.confirm('删除的数据包或变量会解除相关曲线和专业控件绑定，但保留控件位置。是否继续？')) return
    onProfile(cleanBindings(draft))
  }

  return <div className="tab-page packet-config-page">
    <section className="config-apply-bar">
      <label className="profile-name">配置名称<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
      <div className="toolbar-actions">
        <button className="icon-text" disabled={!dirty} onClick={() => setDraft(cloneProfile(profile))}><Undo2 size={16} />放弃草稿</button>
        <button className="icon-text primary" disabled={!dirty || errors.length > 0} onClick={applyDraft}><Check size={16} />应用配置</button>
      </div>
      {errors.length > 0 && <span className="validation-error">{errors[0]}</span>}
    </section>

    <div className="packet-config-grid">
      {(['tx', 'rx'] as const).map((direction) => {
        const schemas = direction === 'rx' ? draft.rxSchemas : draft.txSchemas
        return <section className="schema-section" key={direction}>
          <div className="section-heading">
            <div><h2>{direction === 'tx' ? '发送数据包结构' : '接收数据包结构'}</h2><p>{direction === 'tx' ? '网站到设备，消息 ID 0x80-0xEF。' : '设备到网站，消息 ID 0x01-0x7F。'}</p></div>
            <button className="icon-text primary" onClick={() => updateSchemas(direction, [...schemas, newMessage(direction, schemas)])}><Plus size={16} />新增数据包</button>
          </div>
          <div className="schema-list">
            {schemas.length === 0 && <div className="empty-state">尚未定义{direction === 'tx' ? '发送' : '接收'}数据包。</div>}
            {schemas.map((schema, index) => <MessageEditor
              key={schema.uid}
              schema={schema}
              index={index}
              count={schemas.length}
              onChange={(next) => updateSchemas(direction, schemas.map((item, current) => current === index ? next : item))}
              onDelete={() => updateSchemas(direction, schemas.filter((_, current) => current !== index))}
              onClone={() => updateSchemas(direction, [...schemas.slice(0, index + 1), { ...schema, uid: createId(`${direction}-msg`), id: newMessage(direction, schemas).id, name: `${schema.name}_COPY`, fields: schema.fields.map((field) => ({ ...field, id: createId('field') })) }, ...schemas.slice(index + 1)])}
              onMove={(delta) => moveMessage(direction, index, delta)}
            />)}
          </div>
        </section>
      })}
    </div>
  </div>
}
