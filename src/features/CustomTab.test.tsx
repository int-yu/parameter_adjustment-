import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PID_SET_SCHEMA } from '../domain/defaultProfile'
import { CustomTab } from './CustomTab'

describe('CustomTab', () => {
  it('sends a slider change immediately through the bound field callback', () => {
    const onChange = vi.fn()
    render(<CustomTab
      connected
      txSchemas={[PID_SET_SCHEMA]}
      txValues={{ 0x81: { channel: 0, kp: 1, ki: 0, kd: 0 } }}
      onChange={onChange}
      tab={{ id: 'custom', name: '在线调整', controls: [{ id: 'kp', label: 'Kp', messageId: 0x81, fieldKey: 'kp', kind: 'slider', min: 0, max: 10, step: 0.1 }] }}
    />)
    fireEvent.change(screen.getByRole('slider'), { target: { value: '2.5' } })
    expect(onChange).toHaveBeenCalledWith(0x81, 'kp', 2.5)
  })
})
