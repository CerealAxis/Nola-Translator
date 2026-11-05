import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'

import type { ResourceRecord } from '@/bridge'
import { I18nProvider } from '@/i18n'
import { ModelCard, formatBytes, paramsOf, quantizationOf } from './ModelCard'

function record(partial: Partial<ResourceRecord> & Pick<ResourceRecord, 'resourceId'>): ResourceRecord {
  return {
    kind: 'recognitionModel',
    provider: 'qwen3-asr',
    name: partial.resourceId,
    description: '',
    languages: [],
    installed: false,
    installedBytes: 0,
    state: 'idle',
    cancellable: false,
    ...partial,
  }
}

const originalLanguage = Object.getOwnPropertyDescriptor(navigator, 'language')

beforeEach(() => {
  Object.defineProperty(navigator, 'language', { configurable: true, value: 'zh-CN' })
})

afterEach(() => {
  if (originalLanguage) Object.defineProperty(navigator, 'language', originalLanguage)
  else Reflect.deleteProperty(navigator, 'language')
})

function renderWithI18n(node: ReactElement) {
  return render(<I18nProvider>{node}</I18nProvider>)
}

const noop = () => undefined

it('shows an installed OCR model without requesting a speech configuration', () => {
  renderWithI18n(<ModelCard record={record({ resourceId: 'pp-ocrv5-mobile-onnx', kind: 'ocrModel', installed: true })} busy={false} onInstall={noop} onCancel={noop} />)
  expect(screen.getByText('已安装')).toBeInTheDocument()
  expect(screen.queryByText('待配置')).not.toBeInTheDocument()
})

describe('事实格式化（只写事实，不写形容词）', () => {
  it('字节数带单位，且单位随量级走', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1_133_080_448)).toBe('1.1 GB')
  })

  it('读得到参数量与量化档，读不到就返回 null 而不是编一个', () => {
    const asr = record({ resourceId: 'qwen3-asr-1.7b-hf', name: 'Qwen3-ASR 1.7B' })
    expect(paramsOf(asr)).toBe('1.7B')
    expect(quantizationOf(asr)).toBe('NF4')

    const mt = record({ resourceId: 'hy-mt2-1.8b-q3-k-m', kind: 'translationModel', name: 'Hy-MT2 1.8B Q3_K_M' })
    expect(quantizationOf(mt)).toBe('Q3_K_M')

    const plain = record({ resourceId: 'm2m100-418m', kind: 'translationModel', name: 'M2M100 418M' })
    expect(quantizationOf(plain)).toBeNull()

    expect(paramsOf(record({
      resourceId: 'tts-qwen3-tts-crisp-0.6b-base-q8-0',
      kind: 'ttsModel',
      name: 'Qwen3-TTS 0.6B Base Q8_0 · CrispASR',
    }))).toBe('0.6B')
  })
})

describe('ModelCard 三态', () => {
  it('未安装给主 CTA 安装', () => {
    renderWithI18n(
      <ModelCard
        record={record({ resourceId: 'qwen3-asr-1.7b-hf', name: 'Qwen3-ASR 1.7B', downloadBytes: 4_087_646_324 })}
        busy={false}
        onInstall={noop}
        onCancel={noop}
      />,
    )
    expect(screen.getByRole('button', { name: '安装' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '卸载' })).not.toBeInTheDocument()
  })

  it('下载中给进度与取消，没有安装', () => {
    renderWithI18n(
      <ModelCard
        record={record({
          resourceId: 'hy-mt2-1.8b-q4-k-m',
          kind: 'translationModel',
          name: 'Hy-MT2 Q4',
          state: 'running',
          phase: 'download',
          progress: 0.42,
          cancellable: true,
        })}
        busy={false}
        onInstall={noop}
        onCancel={noop}
      />,
    )
    expect(screen.getByRole('button', { name: '取消下载' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '安装' })).not.toBeInTheDocument()
    expect(screen.getByText('42%')).toBeInTheDocument()
  })

  it('已安装时保留状态，不显示默认或卸载操作', () => {
    renderWithI18n(
      <ModelCard
        record={record({ resourceId: 'sensevoice-small', name: 'SenseVoice', installed: true, installedBytes: 941_208_233 })}
        busy={false}
        onInstall={noop}
        onCancel={noop}
      />,
    )
    expect(screen.getByText('已安装')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '设为默认' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '当前使用' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '卸载' })).not.toBeInTheDocument()
  })

  it('Hub 装不了的条目：安装按钮禁用，并显示数据层带来的理由', () => {
    renderWithI18n(
      <ModelCard
        record={record({
          resourceId: 'hub:openai/whisper-large-v3',
          name: 'whisper-large-v3',
          description: '没有这个仓库的流式识别适配器。',
        })}
        busy={false}
        installable={false}
        onInstall={noop}
        onCancel={noop}
      />,
    )
    expect(screen.getByRole('button', { name: '安装' })).toBeDisabled()
    expect(screen.getByText('没有这个仓库的流式识别适配器。')).toBeInTheDocument()
  })
})



