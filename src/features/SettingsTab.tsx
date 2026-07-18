import { Download, FileUp, RotateCcw, Settings } from 'lucide-react'
import { useRef } from 'react'
import type { AppProfile, LineEnding, TerminalEncoding } from '../domain/types'
import { DEFAULT_PROFILE } from '../domain/defaultProfile'
import { cloneProfile } from '../protocol/schema'
import { exportProfile, importProfile } from '../state/persistence'

interface Props {
  profile: AppProfile
  connected: boolean
  onProfile: (profile: AppProfile) => void
}

const downloadJson = (profile: AppProfile) => {
  const url = URL.createObjectURL(new Blob([exportProfile(profile)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${profile.name || 'daplink-profile'}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function SettingsTab({ profile, connected, onProfile }: Props) {
  const importRef = useRef<HTMLInputElement>(null)

  const handleImport = async (file?: File) => {
    if (!file) return
    try {
      onProfile(importProfile(await file.text()))
    } catch (error) {
      window.alert((error as Error).message)
    }
    if (importRef.current) importRef.current.value = ''
  }

  return <div className="tab-page settings-page">
    <section className="settings-section">
      <div className="section-heading"><div><Settings size={18} /><div><h2>串口设置</h2><p>连接状态下锁定会影响 port.open 的底层参数。</p></div></div></div>
      <div className="settings-grid">
        <label>波特率<input type="number" min="300" step="1" disabled={connected} value={profile.serial.baudRate} onChange={(event) => onProfile({ ...profile, serial: { ...profile.serial, baudRate: Number(event.target.value) } })} /></label>
        <label>数据位<select disabled={connected} value={profile.serial.dataBits} onChange={(event) => onProfile({ ...profile, serial: { ...profile.serial, dataBits: Number(event.target.value) as 7 | 8 } })}><option value="8">8</option><option value="7">7</option></select></label>
        <label>停止位<select disabled={connected} value={profile.serial.stopBits} onChange={(event) => onProfile({ ...profile, serial: { ...profile.serial, stopBits: Number(event.target.value) as 1 | 2 } })}><option value="1">1</option><option value="2">2</option></select></label>
        <label>校验<select disabled={connected} value={profile.serial.parity} onChange={(event) => onProfile({ ...profile, serial: { ...profile.serial, parity: event.target.value as AppProfile['serial']['parity'] } })}><option value="none">None</option><option value="even">Even</option><option value="odd">Odd</option></select></label>
        <label>流控<select disabled={connected} value={profile.serial.flowControl} onChange={(event) => onProfile({ ...profile, serial: { ...profile.serial, flowControl: event.target.value as AppProfile['serial']['flowControl'] } })}><option value="none">None</option><option value="hardware">Hardware</option></select></label>
      </div>
    </section>

    <section className="settings-section">
      <div className="section-heading"><div><h2>终端与历史</h2><p>字符编码只影响协议终端的原始文本发送和日志解码。</p></div></div>
      <div className="settings-grid">
        <label>字符编码<select value={profile.terminal.encoding} onChange={(event) => onProfile({ ...profile, terminal: { ...profile.terminal, encoding: event.target.value as TerminalEncoding } })}><option value="utf-8">UTF-8</option><option value="gbk">GBK</option><option value="ascii">ASCII</option></select></label>
        <label>文本行尾<select value={profile.terminal.lineEnding} onChange={(event) => onProfile({ ...profile, terminal: { ...profile.terminal, lineEnding: event.target.value as LineEnding } })}><option value="none">None</option><option value="lf">LF</option><option value="crlf">CRLF</option></select></label>
        <label>帧历史<input type="number" min="100" max="50000" value={profile.history.maxFrames} onChange={(event) => onProfile({ ...profile, history: { ...profile.history, maxFrames: Number(event.target.value) } })} /></label>
        <label>日志历史<input type="number" min="100" max="20000" value={profile.history.maxLogs} onChange={(event) => onProfile({ ...profile, history: { ...profile.history, maxLogs: Number(event.target.value) } })} /></label>
        <label>曲线窗口秒<input type="number" min="1" max="3600" value={profile.chart.timeWindowSeconds} onChange={(event) => onProfile({ ...profile, chart: { ...profile.chart, timeWindowSeconds: Number(event.target.value) } })} /></label>
      </div>
    </section>

    <section className="settings-section profile-actions">
      <div className="section-heading"><div><h2>配置文件</h2><p>仅导入 profile v2；旧 v1 配置不会自动迁移。</p></div></div>
      <div className="toolbar-actions">
        <button className="icon-text" onClick={() => downloadJson(profile)}><Download size={16} />导出 JSON</button>
        <button className="icon-text" onClick={() => importRef.current?.click()}><FileUp size={16} />导入 JSON</button>
        <button className="icon-text danger" onClick={() => window.confirm('重置为空白 v2 配置？') && onProfile(cloneProfile(DEFAULT_PROFILE))}><RotateCcw size={16} />重置为空</button>
        <input ref={importRef} hidden type="file" accept="application/json,.json" onChange={(event) => void handleImport(event.target.files?.[0])} />
      </div>
    </section>
  </div>
}
