import { LineChart, RotateCcw } from 'lucide-react'
import { useMemo } from 'react'
import { Plot, type PlotSeries } from '../components/Plot'
import type { AppProfile, DecodedFrame, DisplaySeriesConfig, FieldValue } from '../domain/types'
import { numericFields } from '../domain/bindings'
import { createId } from '../utils/id'

interface Props {
  profile: AppProfile
  frames: DecodedFrame[]
  onProfile: (profile: AppProfile) => void
}

const COLORS = ['#24795a', '#2775c9', '#c4473d', '#a45c00', '#7354a8', '#0f766e', '#b45309', '#be123c']

const displayValue = (value: FieldValue | undefined) => {
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(4)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (value instanceof Uint8Array) return `${value.length} B`
  return value ?? '--'
}

export function DisplayTerminalTab({ profile, frames, onProfile }: Props) {
  const fields = useMemo(() => numericFields(profile.rxSchemas), [profile.rxSchemas])
  const selectedByField = new Map(profile.displaySeries.map((series) => [`${series.messageUid}:${series.fieldId}`, series]))
  const latestValues = useMemo(() => {
    const latest = new Map<string, FieldValue>()
    for (let index = frames.length - 1; index >= 0; index -= 1) {
      const frame = frames[index]
      const schema = profile.rxSchemas.find((item) => item.id === frame.messageId)
      if (!schema || !frame.values) continue
      for (const field of schema.fields) {
        const key = `${schema.uid}:${field.id}`
        if (!latest.has(key)) latest.set(key, frame.values[field.key])
      }
    }
    return latest
  }, [frames, profile.rxSchemas])

  const chart = useMemo(() => {
    const latestTime = frames.at(-1)?.receivedAt ?? 0
    const cutoff = latestTime - profile.chart.timeWindowSeconds * 1000
    const points = new Map<number, Map<string, number>>()
    for (const frame of frames) {
      if (frame.receivedAt < cutoff || !frame.values) continue
      const schema = profile.rxSchemas.find((item) => item.id === frame.messageId)
      if (!schema) continue
      for (const series of profile.displaySeries) {
        if (series.messageUid !== schema.uid) continue
        const field = schema.fields.find((item) => item.id === series.fieldId)
        if (!field) continue
        const raw = frame.values[field.key]
        const value = typeof raw === 'number' ? raw * series.scale : Number(raw) * series.scale
        if (!Number.isFinite(value)) continue
        const time = frame.receivedAt / 1000
        if (!points.has(time)) points.set(time, new Map())
        points.get(time)!.set(series.id, value)
      }
    }
    const x = Array.from(points.keys()).sort((a, b) => a - b)
    const plotSeries: PlotSeries[] = profile.displaySeries.map((series) => {
      const schema = profile.rxSchemas.find((item) => item.uid === series.messageUid)
      const field = schema?.fields.find((item) => item.id === series.fieldId)
      return {
        label: `${schema?.name ?? 'RX'} · ${field?.label ?? series.fieldId}`,
        color: series.color,
        scale: 'value',
        values: x.map((time) => points.get(time)?.get(series.id) ?? null),
      }
    })
    return { x, series: plotSeries }
  }, [frames, profile.chart.timeWindowSeconds, profile.displaySeries, profile.rxSchemas])

  const updateSeries = (seriesId: string, patch: Partial<DisplaySeriesConfig>) => {
    onProfile({ ...profile, displaySeries: profile.displaySeries.map((series) => series.id === seriesId ? { ...series, ...patch } : series) })
  }

  const toggleField = (messageUid: string, fieldId: string) => {
    const key = `${messageUid}:${fieldId}`
    const existing = selectedByField.get(key)
    if (existing) {
      onProfile({ ...profile, displaySeries: profile.displaySeries.filter((series) => series.id !== existing.id) })
      return
    }
    onProfile({
      ...profile,
      displaySeries: [...profile.displaySeries, {
        id: createId('series'),
        messageUid,
        fieldId,
        color: COLORS[profile.displaySeries.length % COLORS.length],
        scale: 1,
      }],
    })
  }

  return <div className="tab-page display-terminal-layout">
    <section className="display-chart-panel">
      <div className="section-heading">
        <div><LineChart size={18} /><div><h2>XY 时间曲线</h2><p>横轴使用串口接收时间，窗口由设置页控制。</p></div></div>
        <button className="icon-text" disabled={profile.displaySeries.length === 0} onClick={() => onProfile({ ...profile, displaySeries: [] })}><RotateCcw size={16} />清空曲线</button>
      </div>
      {chart.series.length > 0 ? <Plot title="Packet Variables" x={chart.x} series={chart.series} height={420} /> : <div className="empty-state">在右侧选择整形或浮点变量后显示曲线。</div>}
    </section>

    <aside className="variable-panel">
      <div className="section-heading"><div><h2>数据变量</h2><p>仅列出接收数据包中的整形和浮点变量。</p></div></div>
      {profile.rxSchemas.length === 0 && <div className="empty-state">请先在数据包配置中定义 RX 结构。</div>}
      {profile.rxSchemas.map((schema) => {
        const schemaFields = fields.filter((item) => item.message.uid === schema.uid)
        if (schemaFields.length === 0) return null
        return <section className="variable-group" key={schema.uid}>
          <h3>0x{schema.id.toString(16).padStart(2, '0')} {schema.name}</h3>
          {schemaFields.map(({ field }) => {
            const key = `${schema.uid}:${field.id}`
            const selected = selectedByField.get(key)
            return <div className="variable-row" key={field.id}>
              <label>
                <input type="checkbox" checked={Boolean(selected)} onChange={() => toggleField(schema.uid, field.id)} />
                <span>{field.label}</span>
              </label>
              <code>{displayValue(latestValues.get(key))}{field.unit ? ` ${field.unit}` : ''}</code>
              {selected && <>
                <input aria-label="曲线颜色" type="color" value={selected.color} onChange={(event) => updateSeries(selected.id, { color: event.target.value })} />
                <input aria-label="缩放倍率" type="number" step="0.1" value={selected.scale} onChange={(event) => updateSeries(selected.id, { scale: Number(event.target.value) || 1 })} />
              </>}
            </div>
          })}
        </section>
      })}
    </aside>
  </div>
}
