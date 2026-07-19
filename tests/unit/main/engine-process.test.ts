import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import type { EngineEvent } from '../../../src/shared/contracts'
import {
  CaptionEventCoalescer,
  EngineProcess,
  createEngineLaunchSpec,
} from '../../../src/main/engine-process'

const python = resolve('.venv/Scripts/python.exe')

function caption(revision: number, isFinal = false): Extract<EngineEvent, { type: 'caption' }> {
  return {
    protocolVersion: 1,
    type: 'caption',
    requestId: `caption-${revision}`,
    sessionId: 'session-1',
    segment: {
      segmentId: 'segment-1',
      revision,
      startedAtMs: 0,
      sourceText: `text-${revision}`,
      isFinal,
      translations: [],
    },
  }
}

describe('Python 引擎进程', () => {
  it('开发态优先使用项目本地 Python，发布态使用打包后的 exe', () => {
    expect(
      createEngineLaunchSpec({ isPackaged: false, appPath: 'G:/app', resourcesPath: 'G:/resources' })
    ).toMatchObject({
      command: join('G:/app', '.venv', 'Scripts', 'python.exe'),
      args: ['-m', 'fluentcaptions_engine'],
    })
    expect(
      createEngineLaunchSpec({ isPackaged: true, appPath: 'G:/app', resourcesPath: 'G:/resources' })
    ).toMatchObject({ command: join('G:/resources', 'engine', 'FluentCaptionsEngine.exe'), args: [] })
  })

  it('合并同一字幕段的中间版本，但不丢最终字幕、错误或模型进度', () => {
    const received: EngineEvent[] = []
    const coalescer = new CaptionEventCoalescer((event) => received.push(event))

    for (let revision = 0; revision < 1000; revision += 1) coalescer.push(caption(revision))
    coalescer.flush()
    coalescer.push(caption(1000, true))
    coalescer.push({
      protocolVersion: 1,
      type: 'error',
      requestId: 'error-1',
      code: 'internalError',
      recoverable: true,
    })
    coalescer.push({
      protocolVersion: 1,
      type: 'modelProgress',
      requestId: 'progress-1',
      modelId: 'model-1',
      operation: 'download',
      progress: 0.5,
      state: 'running',
    })

    expect(received.map((event) => event.type)).toEqual([
      'caption',
      'caption',
      'error',
      'modelProgress',
    ])
    expect((received[0] as Extract<EngineEvent, { type: 'caption' }>).segment.revision).toBe(999)
    expect((received[1] as Extract<EngineEvent, { type: 'caption' }>).segment.isFinal).toBe(true)
  })

  it('完成真实 Python sidecar 的握手、请求与优雅退出', async () => {
    const engine = new EngineProcess({
      command: python,
      args: ['-m', 'fluentcaptions_engine'],
      cwd: resolve('engine'),
      startupTimeoutMs: 3_000,
      restartDelaysMs: [10, 20, 30],
    })

    await engine.start()
    expect(engine.currentState).toBe('ready')

    const devices = await engine.request(
      { protocolVersion: 1, type: 'listDevices', requestId: 'devices-1' },
      'devices'
    )
    expect(Array.isArray(devices.devices)).toBe(true)

    const started = await engine.request(
      {
        protocolVersion: 1,
        type: 'startSession',
        requestId: 'start-1',
        config: {
          audioSource: { kind: 'defaultOutput' },
          recognitionMode: 'realtime',
          sourceLanguage: 'auto',
          targetLanguages: ['zh-CN'],
        },
      },
      'sessionStarted'
    )
    expect(started.sessionId).toBeTruthy()

    await engine.request(
      {
        protocolVersion: 1,
        type: 'stopSession',
        requestId: 'stop-1',
        sessionId: started.sessionId,
      },
      'sessionStopped'
    )
    await engine.stop()
    expect(engine.currentState).toBe('stopped')
  })

  it('引擎异常退出后最多按配置退避并恢复握手', async () => {
    const work = await mkdtemp(join(tmpdir(), 'fluentcaptions-engine-'))
    const marker = join(work, 'crashed-once')
    const engine = new EngineProcess({
      command: python,
      args: [resolve('tests/fixtures/protocol/fake-engine.py'), '--crash-once', marker],
      cwd: resolve('.'),
      startupTimeoutMs: 2_000,
      restartDelaysMs: [10, 20, 30],
    })

    try {
      await engine.start()
      expect(engine.currentState).toBe('ready')
      expect(engine.restartCount).toBe(1)
      await engine.stop()
    } finally {
      await rm(work, { recursive: true, force: true })
    }
  })

  it('收到关机确认后等待 sidecar 自行退出', async () => {
    const work = await mkdtemp(join(tmpdir(), 'fluentcaptions-shutdown-'))
    const marker = join(work, 'shutdown-complete')
    const engine = new EngineProcess({
      command: python,
      args: [resolve('tests/fixtures/protocol/fake-engine.py'), '--shutdown-marker', marker],
      cwd: resolve('.'),
      startupTimeoutMs: 2_000,
      restartDelaysMs: [10, 20, 30],
    })

    try {
      await engine.start()
      await engine.stop()
      expect(await readFile(marker, 'utf8')).toBe('graceful')
    } finally {
      await rm(work, { recursive: true, force: true })
    }
  })
})
