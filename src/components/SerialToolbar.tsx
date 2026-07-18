import { Cable, CircleStop, Radio, Unplug } from 'lucide-react'
import type { SerialStats } from '../domain/types'

interface Props {
  supported: boolean
  connected: boolean
  connecting: boolean
  stats: SerialStats
  status: string
  onConnect: () => void
  onDisconnect: () => void
}

export function SerialToolbar(props: Props) {
  const { supported, connected, connecting, stats } = props
  return (
    <header className="serial-toolbar compact">
      <div className="brand-block">
        <div className="brand-icon"><Radio size={20} /></div>
        <div>
          <h1>DAPLink 串口调试台</h1>
          <p>{props.status}</p>
        </div>
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
