import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { subscribeLatency } from '@/bridge/latency'
import type { LatencySnapshot } from '../../../shared/latency'
import { LatencyWindow, waveformRows } from './LatencyWindow'

vi.mock('@/bridge/latency', () => ({ subscribeLatency: vi.fn() }))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const cascade: LatencySnapshot = {
  active: true,
  speech: false,
  output: 'translation',
  route: 'cascade',
  providers: { asr: 'local', mt: 'cloud' },
  samples: [
    { id: 'b', at: 2_000, total: 500, asr: 200, mt: 180 },
    { id: 'c', at: 3_000, total: null, asr: 180 },
    { id: 'a', at: 1_000, total: 300, asr: 150, mt: 130 },
  ],
  input: [],
  outputWave: [],
  now: 3_100,
}

function renderSnapshot(snapshot: LatencySnapshot) {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  const getBounds = HTMLElement.prototype.getBoundingClientRect
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('recharts-responsive-container') ? new DOMRect(0, 0, 640, 180) : getBounds.call(this)
  })
  vi.mocked(subscribeLatency).mockImplementation(listener => {
    listener(snapshot)
    return () => undefined
  })
  return render(<LatencyWindow />)
}

it('uses visible translation latency and excludes unfinished samples from the two metrics', () => {
  renderSnapshot(cascade)
  expect(screen.getByText('500 毫秒')).toBeInTheDocument()
  expect(screen.getByText('400 毫秒')).toBeInTheDocument()
  expect(screen.getByText('总延迟')).toBeInTheDocument()
  expect(screen.getByText('ASR 延迟')).toBeInTheDocument()
  expect(screen.getByText('MT 延迟')).toBeInTheDocument()
  expect(screen.queryByText('最近 2 个有效片段')).not.toBeInTheDocument()
  expect(screen.queryByText('语音片段结束 → 译文上屏')).not.toBeInTheDocument()
  expect(screen.queryByText('本地与云端分步')).not.toBeInTheDocument()
  expect(screen.queryByText('音频时间轴')).not.toBeInTheDocument()
})

it('shows speech audio and observable S2S stages without exposing settings controls', () => {
  renderSnapshot({
    ...cascade, speech: true, output: 'speech', route: 's2s', providers: {},
    samples: [{ id: 's2s', at: 2_000, total: 900, remote: 760, wait: 120 }],
  })
  expect(screen.getByText('总延迟')).toBeInTheDocument()
  expect(screen.getByText('S2S 延迟')).toBeInTheDocument()
  expect(screen.queryByText('语音片段结束 → 预计开始播放')).not.toBeInTheDocument()
  expect(screen.queryByText('等待播放')).not.toBeInTheDocument()
  expect(screen.getByText('音频时间轴')).toBeInTheDocument()
  expect(screen.queryByText('最近 16 秒')).not.toBeInTheDocument()
  expect(screen.queryByText('ASR 延迟')).not.toBeInTheDocument()
  expect(screen.queryByText('TTS 延迟')).not.toBeInTheDocument()
  expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
})

it('uses TTS latency as the synthesis series and omits the separate playback wait', () => {
  renderSnapshot({
    ...cascade, speech: true, output: 'speech',
    samples: [{ id: 'cascade', at: 2_000, total: 900, asr: 160, mt: 140, tts: 500, wait: 100 }],
  })
  expect(screen.getByText('TTS 延迟')).toBeInTheDocument()
  expect(screen.queryByText('合成首块')).not.toBeInTheDocument()
  expect(screen.queryByText('等待播放')).not.toBeInTheDocument()
})

it('aggregates real amplitude peaks without filling unmeasured waveform bins', () => {
  const rows = waveformRows([
    { at: 2_999, min: -1, max: 1 },
    { at: 3_100, min: -0.4, max: 0.2 },
    { at: 3_180, min: -0.2, max: 0.6 },
    { at: 19_001, min: -1, max: 1 },
  ], 19_000)
  expect(rows[0]).toEqual({ seconds: -16, range: null })
  expect(rows[1]).toEqual({ seconds: -15.9, range: [-0.4, 0.6] })
  expect(rows[2].range).toBeNull()
  expect(rows.at(-1)?.range).toBeNull()
})
