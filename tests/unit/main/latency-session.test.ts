import { describe, expect, it } from 'vitest'
import { LatencySession } from '../../../src/main/latency-session'

describe('quick interpretation latency', () => {
  it('starts at the confirmed boundary and ends when the translation is painted', () => {
    const session = new LatencySession({ route: 'cascade', output: 'translation', speech: false,
      providers: { asr: 'local', mt: 'cloud' }, translationProviders: new Map([['local-mt', 'local']]) })
    session.paint({ segmentId: 'first', kind: 'source', at: 1_240 })
    session.backend('latency_observation', { kind: 'source_end', segment_id: 'first', at_ms: 1_000 }, 0)
    session.backend('latency_observation', { kind: 'segment_boundary', segment_id: 'first', at_ms: 1_150 }, 0)
    session.backend('source_committed', { segment_id: 'first', text: 'Hi' }, 0, 1_200)
    session.backend('latency_observation', { kind: 'translation_started', segment_id: 'first', at_ms: 1_205 }, 0)
    session.backend('latency_observation', { kind: 'translation_ready', segment_id: 'first', at_ms: 1_400, provider: 'local-mt' }, 0)
    session.backend('translation_committed', { segment_id: 'first', text: '你好' }, 0, 1_405)
    expect(session.snapshot(1_410).samples).toEqual([expect.objectContaining({
      id: 'first', total: null, asr: 50, mt: 195, providers: { mt: 'local' },
    })])
    session.paint({ segmentId: 'first', kind: 'translation', at: 1_433 })
    expect(session.snapshot(1_450).samples[0].total).toBe(283)
    expect(session.snapshot(1_450).input).toEqual([])
  })

  it('uses cloud finalization as the first observable boundary and leaves ASR latency unknown', () => {
    const session = new LatencySession({ route: 'cascade', output: 'translation', speech: false, providers: { asr: 'cloud' } })
    session.backend('source_committed', { segment_id: 'cloud', text: 'Hello' }, 0, 2_000)
    session.paint({ segmentId: 'cloud', kind: 'translation', at: 2_225 })
    const [sample] = session.snapshot(2_300).samples
    expect(sample).toMatchObject({ at: 2_000, total: 225 })
    expect(sample.asr).toBeUndefined()
  })

  it('does not infer a S2S boundary from the final transcript', () => {
    const session = new LatencySession({ route: 's2s', output: 'translation', speech: false, providers: {} })
    session.backend('source_committed', { segment_id: 's2s', text: 'Hello' }, 0, 2_000)
    session.backend('translated_text', { segment_id: 's2s', text: '你好' }, 0, 2_050)
    session.paint({ segmentId: 's2s', kind: 'translation', at: 2_225 })
    expect(session.snapshot(2_300).samples).toEqual([])
    session.backend('latency_observation', { kind: 'segment_boundary', segment_id: 's2s', at_ms: 1_900 }, 0)
    expect(session.snapshot(2_300).samples[0]).toMatchObject({ at: 1_900, total: 325, remote: 150 })
  })

  it('joins explicit S2S audio streams and leaves unlinked end-to-end latency blank', () => {
    const session = new LatencySession({ route: 's2s', output: 'speech', speech: true, providers: {} })
    session.backend('latency_observation', { kind: 'segment_boundary', segment_id: 'source', at_ms: 10_000 }, 0)
    session.backend('latency_observation', { kind: 'input', at_ms: 9_950, min: -0.4, max: 0.5 }, 0)
    session.output('stream', 0, 10_700, [{ at: 10_700, min: -0.2, max: 0.5 }])
    session.backend('latency_observation', { kind: 'audio_ready', segment_id: 'source', audio_stream_id: 'stream', at_ms: 10_500 }, 0)
    expect(session.snapshot(10_699).samples[0]).toMatchObject({ total: null, remote: 500 })
    session.backend('latency_observation', { kind: 'audio_ready', audio_stream_id: 'unlinked', at_ms: 10_800 }, 0)
    session.output('unlinked', 0, 10_900, [{ at: 10_900, min: -0.1, max: 0.1 }])
    session.stop(11_000)
    expect(session.snapshot(50_000)).toMatchObject({
      active: false, now: 11_000, input: [{ at: 9_950, min: -0.4, max: 0.5 }],
      outputWave: [{ at: 10_700, min: -0.2, max: 0.5 }, { at: 10_900, min: -0.1, max: 0.1 }],
      samples: [{ id: 'source', total: 700, remote: 500, wait: 200 }, { id: 'audio:unlinked', total: null, wait: 100 }],
    })
  })

  it('drops queued output after a playback fence', () => {
    const session = new LatencySession({ route: 'cascade', output: 'speech', speech: true, providers: {} })
    session.backend('latency_observation', { kind: 'segment_boundary', segment_id: 'source', at_ms: 100 }, 0)
    session.backend('latency_observation', { kind: 'audio_ready', segment_id: 'source', audio_stream_id: 'stream', at_ms: 200 }, 0)
    session.output('stream', 0, 300, [{ at: 300, min: -0.1, max: 0.1 }])
    session.fence(1, 250)
    session.output('stream', 0, 300, [{ at: 300, min: -0.1, max: 0.1 }])
    expect(session.snapshot(400).samples).toEqual([])
    expect(session.snapshot(400).outputWave).toEqual([])
  })
})
