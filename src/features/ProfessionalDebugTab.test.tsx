import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProfessionalDebugTab } from './ProfessionalDebugTab'
import type { AppProfile, FieldValue, ProfessionalWidget } from '../domain/types'
import { DEFAULT_FRAME_FORMAT } from '../protocol/frameFormat'

const createProfile = (controls: ProfessionalWidget[]): AppProfile => ({
  version: 2,
  name: 'test profile',
  serial: {
    baudRate: 115200,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    flowControl: 'none',
  },
  terminal: {
    encoding: 'utf-8',
    lineEnding: 'none',
  },
  history: {
    maxFrames: 100,
    maxLogs: 100,
  },
  chart: {
    timeWindowSeconds: 30,
  },
  frameFormat: DEFAULT_FRAME_FORMAT,
  rxSchemas: [],
  txSchemas: [{
    uid: 'tx-main',
    id: 1,
    name: 'TX Main',
    direction: 'tx',
    fields: [
      { id: 'run', key: 'run', label: 'Run', type: 'bool', defaultValue: false },
      { id: 'x', key: 'x', label: 'X', type: 'i16', defaultValue: 0 },
      { id: 'y', key: 'y', label: 'Y', type: 'i16', defaultValue: 0 },
    ],
  }],
  displaySeries: [],
  professionalControls: controls,
})

const switchControl: ProfessionalWidget = {
  id: 'switch-1',
  kind: 'switch',
  label: 'Switch',
  x: 20,
  y: 20,
  width: 132,
  height: 92,
  angle: 0,
  binding: { messageUid: 'tx-main', fieldId: 'run' },
}

const joystickControl: ProfessionalWidget = {
  id: 'joystick-1',
  kind: 'joystick',
  label: 'Stick',
  x: 200,
  y: 20,
  width: 150,
  height: 150,
  angle: 0,
  min: -100,
  max: 100,
  joystickBinding: { messageUid: 'tx-main', xFieldId: 'x', yFieldId: 'y' },
}

describe('ProfessionalDebugTab', () => {
  afterEach(() => cleanup())

  it('keeps a switch latched after pointer movement over another control', () => {
    const fieldValues: Record<string, Record<string, FieldValue>> = {
      'tx-main': { run: false, x: 0, y: 0 },
    }

    const { container, rerender } = render(
      <ProfessionalDebugTab
        profile={createProfile([switchControl, joystickControl])}
        txValues={fieldValues}
        connected
        onProfile={vi.fn()}
        onFieldChange={(messageUid, fieldKey, value) => {
          fieldValues[messageUid] = { ...fieldValues[messageUid], [fieldKey]: value }
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'OFF' }))
    rerender(
      <ProfessionalDebugTab
        profile={createProfile([switchControl, joystickControl])}
        txValues={fieldValues}
        connected
        onProfile={vi.fn()}
        onFieldChange={(messageUid, fieldKey, value) => {
          fieldValues[messageUid] = { ...fieldValues[messageUid], [fieldKey]: value }
        }}
      />,
    )
    expect(screen.getByRole('button', { name: 'ON' })).toBeInTheDocument()

    fireEvent.pointerMove(container.querySelectorAll('.professional-widget')[1])
    expect(screen.getByRole('button', { name: 'ON' })).toBeInTheDocument()
  })

  it('keeps a switch value after the professional tab is remounted', () => {
    const profile = createProfile([switchControl])
    const fieldValues: Record<string, Record<string, FieldValue>> = {
      'tx-main': { run: false, x: 0, y: 0 },
    }
    const handleFieldChange = (messageUid: string, fieldKey: string, value: FieldValue) => {
      fieldValues[messageUid] = { ...fieldValues[messageUid], [fieldKey]: value }
    }

    const { unmount } = render(
      <ProfessionalDebugTab
        profile={profile}
        txValues={fieldValues}
        connected
        onProfile={vi.fn()}
        onFieldChange={handleFieldChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'OFF' }))
    unmount()

    render(
      <ProfessionalDebugTab
        profile={profile}
        txValues={fieldValues}
        connected
        onProfile={vi.fn()}
        onFieldChange={handleFieldChange}
      />,
    )

    expect(screen.getByRole('button', { name: 'ON' })).toBeInTheDocument()
  })

  it('does not drag the widget while the joystick pad is being operated', () => {
    const onProfile = vi.fn()
    const onFieldChange = vi.fn()
    const { container } = render(
      <ProfessionalDebugTab
        profile={createProfile([joystickControl])}
        txValues={{ 'tx-main': { run: false, x: 0, y: 0 } }}
        connected
        onProfile={onProfile}
        onFieldChange={onFieldChange}
      />,
    )
    const pad = container.querySelector('.joystick-pad') as HTMLDivElement
    pad.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 108,
      bottom: 108,
      width: 108,
      height: 108,
      toJSON: () => ({}),
    })

    fireEvent.pointerDown(pad, { clientX: 70, clientY: 70, pointerId: 1 })
    fireEvent.pointerMove(pad, { clientX: 90, clientY: 90, pointerId: 1, buttons: 1 })
    fireEvent.pointerUp(pad, { clientX: 90, clientY: 90, pointerId: 1 })

    expect(onFieldChange).toHaveBeenCalled()
    expect(onProfile).not.toHaveBeenCalled()
  })

  it('can lock a joystick widget position from the top-left lock button', () => {
    const onProfile = vi.fn()
    render(
      <ProfessionalDebugTab
        profile={createProfile([joystickControl])}
        txValues={{ 'tx-main': { run: false, x: 0, y: 0 } }}
        connected
        onProfile={onProfile}
        onFieldChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '锁定摇杆位置' }))

    expect(onProfile).toHaveBeenCalledWith(expect.objectContaining({
      professionalControls: [expect.objectContaining({ id: 'joystick-1', locked: true })],
    }))
  })
})
