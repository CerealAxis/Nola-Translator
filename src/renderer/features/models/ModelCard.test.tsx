import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'

import { DEFAULT_SETTINGS } from '@/bridge'
import type { ResourceRecord } from '@/bridge'
import { I18nProvider } from '@/i18n'
import { ModelCard, defaultTargetOf, formatBytes, isDefaultOf, paramsOf, quantizationOf } from './ModelCard'

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

/*
 * 迁移说明：原型那版在 render 前写 `localStorage[LANGUAGE_STORAGE_KEY] = 'zh-CN'` 把语言钉死
 * （因为原型从 localStorage 读语言，而 jsdom 的 navigator.language 是 en-US）。
 * 现在语言来自主进程的 `AppSettings.uiLanguage`，jsdom 里没有 preload，
 * `I18nProvider` 的 `getSettings()` 落空、停在初始的 `'zh-CN'` —— 正好是下面断言要的语言，
 * 所以不需要（也不能）再钉一次。
 */
function renderWithI18n(node: ReactElement) {
  return render(<I18nProvider>{node}</I18nProvider>)
}

const noop = () => undefined

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
  })
})

describe('默认模型的可设范围', () => {
  it('识别模型与 Hy-MT2 有设置槽位，m2m100 没有', () => {
    expect(defaultTargetOf(record({ resourceId: 'qwen3-asr-1.7b-hf' }))).toEqual({
      recognition: { modelId: 'qwen3-asr-1.7b-hf' },
    })
    expect(
      defaultTargetOf(record({ resourceId: 'hy-mt2-1.8b-q4-k-m', kind: 'translationModel' })),
    ).toEqual({ translation: { hymt2ModelId: 'hy-mt2-1.8b-q4-k-m' } })
    // m2m100 能装能跑，但设置里没有它的槽位：给一个按下去会静默失败的按钮比不给更糟。
    expect(defaultTargetOf(record({ resourceId: 'm2m100-418m', kind: 'translationModel' }))).toBeNull()
  })

  it('isDefaultOf 对两处槽位都成立', () => {
    const base = DEFAULT_SETTINGS
    expect(isDefaultOf(record({ resourceId: 'qwen3-asr-1.7b-hf' }), base)).toBe(true)
    expect(isDefaultOf(record({ resourceId: 'sensevoice-small' }), base)).toBe(false)
    expect(isDefaultOf(record({ resourceId: 'qwen3-asr-1.7b-hf' }), null)).toBe(false)
  })
})

describe('ModelCard 三态', () => {
  it('未安装给主 CTA 安装', () => {
    renderWithI18n(
      <ModelCard
        record={record({ resourceId: 'qwen3-asr-1.7b-hf', name: 'Qwen3-ASR 1.7B', downloadBytes: 4_087_646_324 })}
        busy={false}
        isDefault={false}
        canBeDefault
        onInstall={noop}
        onCancel={noop}
        onRemove={noop}
        onSetDefault={noop}
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
        isDefault={false}
        canBeDefault
        onInstall={noop}
        onCancel={noop}
        onRemove={noop}
        onSetDefault={noop}
      />,
    )
    expect(screen.getByRole('button', { name: '取消下载' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '安装' })).not.toBeInTheDocument()
    expect(screen.getByText('42%')).toBeInTheDocument()
  })

  it('已安装给状态胶囊与移除，且移除按钮默认不是红的', () => {
    renderWithI18n(
      <ModelCard
        record={record({ resourceId: 'sensevoice-small', name: 'SenseVoice', installed: true, installedBytes: 941_208_233 })}
        busy={false}
        isDefault={false}
        canBeDefault
        onInstall={noop}
        onCancel={noop}
        onRemove={noop}
        onSetDefault={noop}
      />,
    )
    expect(screen.getByText('已安装')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '卸载' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '卸载' }).className).not.toContain('text-danger ')
  })

  it('已经是默认模型时不再给"设为默认"', () => {
    renderWithI18n(
      <ModelCard
        record={record({ resourceId: 'qwen3-asr-1.7b-hf', installed: true })}
        busy={false}
        isDefault
        canBeDefault
        onInstall={noop}
        onCancel={noop}
        onRemove={noop}
        onSetDefault={noop}
      />,
    )
    expect(screen.queryByRole('button', { name: '设为默认' })).not.toBeInTheDocument()
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
        isDefault={false}
        canBeDefault={false}
        installable={false}
        onInstall={noop}
        onCancel={noop}
        onRemove={noop}
        onSetDefault={noop}
      />,
    )
    expect(screen.getByRole('button', { name: '安装' })).toBeDisabled()
    expect(screen.getByText('没有这个仓库的流式识别适配器。')).toBeInTheDocument()
  })
})

