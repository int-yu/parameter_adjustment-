import { Activity, Gauge, RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { AppProfile, DecodedFrame, PidMapping } from '../domain/types'
import { buildPidPoints, calculatePidMetrics } from '../analysis/pidMetrics'
import { Plot } from '../components/Plot'

interface Props {
  profile: AppProfile
  frames: DecodedFrame[]
  onProfile: (profile: AppProfile) => void
}

const format = (value: number, digits = 3, suffix = '') =>
  Number.isFinite(value) ? `${value.toFixed(digits)}${suffix}` : '--'

export function PidTab({ profile, frames, onProfile }: Props) {
  const [mappingId, setMappingId] = useState(profile.pidMappings[0]?.id ?? '')
  const mapping = profile.pidMappings.find((item) => item.id === mappingId) ?? profile.pidMappings[0]
  const schema = profile.rxSchemas.find((item) => item.id === mapping?.messageId)
  const numericFields = schema?.fields.filter((item) => !['fixed-string', 'fixed-bytes', 'bool'].includes(item.type)) ?? []
  const points = useMemo(() => mapping ? buildPidPoints(frames.slice(-1000), mapping) : [], [frames, mapping])
  const metrics = useMemo(() => calculatePidMetrics(points, mapping?.outputLimit), [mapping?.outputLimit, points])
  const x = points.map((point) => point.time)

  const updateMapping = (patch: Partial<PidMapping>) => {
    if (!mapping) return
    onProfile({
      ...profile,
      pidMappings: profile.pidMappings.map((item) => item.id === mapping.id ? { ...item, ...patch } : item),
    })
  }

  if (!mapping) return <div className="empty-state">没有PID字段映射，请在配置中导入或创建Schema。</div>

  return (
    <div className="tab-page pid-page">
      <section className="section-band mapping-band">
        <div className="section-heading">
          <div><Activity size={18} /><div><h2>PID通道</h2><p>只分析和展示，不自动修改参数。</p></div></div>
          <select value={mapping.id} onChange={(event) => setMappingId(event.target.value)}>
            {profile.pidMappings.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>
        <div className="mapping-grid">
          <label>消息Schema
            <select value={mapping.messageId} onChange={(event) => updateMapping({ messageId: Number(event.target.value) })}>
              {profile.rxSchemas.map((item) => <option key={item.id} value={item.id}>0x{item.id.toString(16).padStart(2, '0')} {item.name}</option>)}
            </select>
          </label>
          {(['timeField', 'targetField', 'feedbackField', 'outputField'] as const).map((key) => (
            <label key={key}>{({ timeField: '时间字段', targetField: '目标字段', feedbackField: '反馈字段', outputField: '输出字段' })[key]}
              <select value={mapping[key]} onChange={(event) => updateMapping({ [key]: event.target.value })}>
                {numericFields.map((item) => <option key={item.key} value={item.key}>{item.label} ({item.key})</option>)}
              </select>
            </label>
          ))}
          <label>反馈计算
            <select value={mapping.feedbackMode} onChange={(event) => updateMapping({ feedbackMode: event.target.value as PidMapping['feedbackMode'] })}>
              <option value="direct">直接数值</option><option value="counter-rate">计数差分/秒</option>
            </select>
          </label>
          <label>输出限幅
            <input type="number" placeholder="未设置" value={mapping.outputLimit ?? ''} onChange={(event) => updateMapping({ outputLimit: event.target.value ? Number(event.target.value) : undefined })} />
          </label>
        </div>
      </section>

      <section className="metrics-band" aria-label="PID指标">
        {[
          ['采样率', format(metrics.sampleRate, 1, ' Hz')],
          ['RMS', format(metrics.rms)],
          ['MAE', format(metrics.mae)],
          ['峰值误差', format(metrics.peak)],
          ['稳态偏差', format(metrics.bias)],
          ['过零次数', String(metrics.zeroCrossings)],
          ['超调', format(metrics.overshoot, 1, '%')],
          ['稳定时间', format(metrics.settlingTime, 3, ' s')],
          ['输出饱和', format(metrics.saturationRatio * 100, 1, '%')],
          ['有效样本', String(points.length)],
        ].map(([label, value]) => <div className="metric" key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </section>

      <section className="plot-grid">
        <Plot title={`${mapping.label} 目标 / 反馈 / 误差`} x={x} series={[
          { label: '目标', color: '#2775c9', values: points.map((point) => point.target) },
          { label: '反馈', color: '#23845d', values: points.map((point) => point.feedback) },
          { label: '误差', color: '#c4473d', values: points.map((point) => point.error) },
        ]} />
        <Plot title={`${mapping.label} 输出与编码`} x={x} series={[
          { label: '输出', color: '#a45c00', values: points.map((point) => point.output), scale: 'output' },
          ...(points.some((point) => point.encoder !== undefined) ? [{ label: '编码', color: '#7354a8', values: points.map((point) => point.encoder ?? 0), scale: 'encoder' }] : []),
        ]} />
      </section>
      <div className="analysis-note"><Gauge size={17} />超调和稳定时间只在窗口内存在明显目标阶跃时计算；输出饱和需要配置输出限幅。<RotateCcw size={15} />角度通道按360°环绕计算误差。</div>
    </div>
  )
}
