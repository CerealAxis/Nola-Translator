import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
  it.each([false, true])('uses current app engine code with managed dependencies (packaged: %s)', async isPackaged => {
    const root = await mkdtemp(join(tmpdir(), 'nola-launch-'))
    try {
      const managed = join(root, 'managed')
      const resources = join(root, 'resources')
      const source = isPackaged ? join(resources, 'engine', 'Lib', 'site-packages') : join(root, 'engine')
      await mkdir(managed, { recursive: true })
      await mkdir(join(source, 'nola_translator_engine'), { recursive: true })
      await writeFile(join(managed, 'python.exe'), '')
      await writeFile(join(source, 'nola_translator_engine', '__main__.py'), '')
      const launch = createEngineLaunchSpec({ isPackaged, appPath: root, resourcesPath: resources, managedEngineDirectory: managed })
      expect(launch.command).toBe(isPackaged ? join(resources, 'engine', 'python.exe') : join(root, 'engine', 'dist', 'NolaPythonEngine', 'python.exe'))
      expect(launch.args.slice(0, 2)).toEqual(['-I', '-c'])
      expect(launch.args[2]).toContain(`sys.path[:0] = ${JSON.stringify([source, managed])}`)
      expect(launch.args[2]).toContain('runpy.run_module("nola_translator_engine", run_name="__main__")')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('uses built-in Python 3.12 in development and packaged releases', () => {
    const development = createEngineLaunchSpec({ isPackaged: false, appPath: 'G:/app', resourcesPath: 'G:/resources' })
    expect(development.command).toBe(join('G:/app', 'engine', 'dist', 'NolaPythonEngine', 'python.exe'))
    expect(development.args[2]).toContain('sys.version_info[:2] == (3,12)')
    expect(createEngineLaunchSpec({ isPackaged: true, appPath: 'G:/app', resourcesPath: 'G:/resources' }).command)
      .toBe(join('G:/resources', 'engine', 'python.exe'))
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
      args: ['-m', 'nola_translator_engine'],
      cwd: resolve('engine'),
      env: { NOLA_TRANSLATOR_PROTOCOL_ONLY: '1' },
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
    const work = await mkdtemp(join(tmpdir(), 'nola-translator-engine-'))
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
    const work = await mkdtemp(join(tmpdir(), 'nola-translator-shutdown-'))
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
