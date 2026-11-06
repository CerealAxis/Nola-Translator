import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { DEFAULT_MEETING_MODE, type MeetingModeSnapshot } from '../../../shared/meeting-mode'
import { MeetingStage } from './MeetingStage'

afterEach(cleanup)
const lane = { inputPeak: 0.2, inputAgeMs: 20, playback: 'playing' as const }
const running: MeetingModeSnapshot = { state: 'running', passthroughActive: false, telemetry: { uplink: lane, downlink: lane } }

it('keeps a disabled route neutral even when telemetry or errors remain', () => {
  render(<MeetingStage mode={{ ...DEFAULT_MEETING_MODE, uplinkEnabled: false }} snapshot={{ ...running, error: { key: 'meeting.pipelineFailed', direction: 'uplink' } }} checks={{}} heard={false} />)
  expect(screen.getByTestId('meeting-wire-uplink-input')).toHaveAttribute('data-state', 'idle')
  expect(screen.getByTestId('meeting-wire-uplink-output')).toHaveAttribute('data-state', 'idle')
  expect(screen.getByTestId('meeting-wire-downlink-input')).toHaveAttribute('data-state', 'active')
  expect(screen.getByTestId('meeting-wire-downlink-output')).toHaveAttribute('data-state', 'active')
})

it('distinguishes a quiet open capture from audio activity and pauses output animation', () => {
  render(<MeetingStage mode={DEFAULT_MEETING_MODE} snapshot={{ ...running, paused: true, telemetry: { uplink: { ...lane, inputPeak: 0 } } }} checks={{}} heard={false} />)
  expect(screen.getByTestId('meeting-wire-uplink-input')).toHaveAttribute('data-state', 'connected')
  expect(screen.getByTestId('meeting-wire-uplink-output')).toHaveAttribute('data-state', 'idle')
  expect(document.querySelector('.nola-meeting-wire__pulse')).toBeNull()
})

it('requires headphone confirmation and resets test evidence when configuration changes', () => {
  const checks = { headphonesId: { kind: 'headphones' as const, hasSignal: false, peak: 0, playbackSent: true } }
  const props = { mode: DEFAULT_MEETING_MODE, snapshot: { state: 'idle' as const, passthroughActive: false }, checks }
  const view = render(<MeetingStage {...props} heard={false} />)
  expect(screen.getByTestId('meeting-wire-downlink-output')).toHaveAttribute('data-state', 'idle')
  view.rerender(<MeetingStage {...props} heard />)
  expect(screen.getByTestId('meeting-wire-downlink-output')).toHaveAttribute('data-state', 'connected')
  view.rerender(<MeetingStage {...props} checks={{}} heard={false} />)
  expect(screen.getByTestId('meeting-wire-downlink-output')).toHaveAttribute('data-state', 'idle')
})

it('marks a failed device segment without lighting its companion segment', () => {
  render(<MeetingStage mode={DEFAULT_MEETING_MODE} snapshot={{ state: 'idle', passthroughActive: false }} checks={{
    microphoneId: { kind: 'microphone', hasSignal: false, peak: 0, playbackSent: false, error: { key: 'meeting.audioInputUnavailable' } },
  }} heard={false} />)
  expect(screen.getByTestId('meeting-wire-uplink-input')).toHaveAttribute('data-state', 'failed')
  expect(screen.getByTestId('meeting-wire-uplink-output')).toHaveAttribute('data-state', 'idle')
})

it('exposes the current input and output state in keyboard-accessible tooltips', async () => {
  render(<MeetingStage mode={DEFAULT_MEETING_MODE} snapshot={running} checks={{}} heard={false} />)
  expect(document.querySelectorAll('.nola-meeting-endpoint')).toHaveLength(2)
  expect(document.querySelectorAll('.nola-meeting-call__bar, .nola-meeting-call__controls')).toHaveLength(0)
  const input = screen.getByRole('img', { name: '我说给对方 · 输入 · 正在收到声音' })
  fireEvent.focus(input)
  expect(await screen.findByText('我说给对方 · 输入 · 正在收到声音')).toBeVisible()
  fireEvent.blur(input)
  fireEvent.focus(screen.getByRole('img', { name: '对方说给我 · 输出 · 正在播放译音' }))
  expect(await screen.findByText('对方说给我 · 输出 · 正在播放译音')).toBeVisible()
})

it.each(['glossaryUnsupported', 'glossaryBudgetExceeded'] as const)('preserves live audio telemetry during a %s warning', code => {
  render(<MeetingStage mode={DEFAULT_MEETING_MODE} snapshot={{ ...running, error: { key: code, code, direction: 'uplink' } }} checks={{}} heard={false} />)
  expect(screen.getByTestId('meeting-wire-uplink-input')).toHaveAttribute('data-state', 'active')
  expect(screen.getByTestId('meeting-wire-uplink-output')).toHaveAttribute('data-state', 'active')
})
