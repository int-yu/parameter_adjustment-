import { Cable, CircleStop, Radio, Unplug } from 'lucide-react'
import type { SerialSettings, SerialStats } from '../domain/types'

interface Props {
  supported: boolean
  connected: boolean
  connecting: boolean
  settings: SerialSettings
  stats: SerialStats
  status: string
  onSettings: (settings: SerialSettings) => void
  onConnect: () => void
  onDisconnect: () => void
}

export function SerialToolbar(props: Props) {
  const { supported, connected, connecting, settings, stats } = props
  return (
    <header className="serial-toolbar">
      <div className="brand-block">
        <div className="brand-icon"><Radio size={20} /></div>
        <div>
          <h1>DAPLink 参数调试台</h1>
          <p>{props.status}</p>
        </div>
      </div>
      <div className="serial-options" aria-label="串口参数">
        <label>波特率
          <input
            type="number"
            min="300"
            step="1"
            value={settings.baudRate}
            disabled={connected}
            onChange={(event) => props.onSettings({ ...settings, baudRate: Number(event.target.value) })}
          />
        </label>
        <label>数据位
          <select value={settings.dataBits} disabled={connected} onChange={(event) => props.onSettings({ ...settings, dataBits: Number(event.target.value) as 7 | 8 })}>
            <option value="8">8</option><option value="7">7</option>
          </select>
        </label>
        <label>停止位
          <select value={settings.stopBits} disabled={connected} onChange={(event) => props.onSettings({ ...settings, stopBits: Number(event.target.value) as 1 | 2 })}>
            <option value="1">1</option><option value="2">2</option>
          </select>
        </label>
        <label>校验
          <select value={settings.parity} disabled={connected} onChange={(event) => props.onSettings({ ...settings, parity: event.target.value as SerialSettings['parity'] })}>
            <option value="none">无</option><option value="even">偶</option><option value="odd">奇</option>
          </select>
        </label>
        <label>流控
          <select value={settings.flowControl} disabled={connected} onChange={(event) => props.onSettings({ ...settings, flowControl: event.target.value as SerialSettings['flowControl'] })}>
            <option value="none">无</option><option value="hardware">硬件</option>
          </select>
        </label>
      </div>
      <div className="connection-block">
        <div className="traffic-stats">
          <span>RX <strong>{stats.rxBytes}</strong></span>
          <span>TX <strong>{stats.txBytes}</strong></span>
          <span>有效 <strong>{stats.validFrames}</strong></span>
          <span>错误 <strong>{stats.invalidFrames}</strong></span>
        </div>
        {connected ? (
          <button className="icon-text danger" onClick={props.onDisconnect}><Unplug size={17} />断开</button>
        ) : (
          <button className="icon-text primary" disabled={!supported || connecting} onClick={props.onConnect}>
            {connecting ? <CircleStop size={17} /> : <Cable size={17} />}{connecting ? '连接中' : '连接'}
          </button>
        )}
      </div>
    </header>
  )
}
