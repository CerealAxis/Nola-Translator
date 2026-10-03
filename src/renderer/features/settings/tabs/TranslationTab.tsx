/**
 * 翻译服务。provider、翻译中间语言、按 provider 条件显示的连接参数、API 密钥。
 *
 * **"测试连接"落在密钥上。** bridge 契约里没有"探测某个 endpoint 通不通"的通道
 * （`translation` 组只有 `hasCredential` / `setCredential`），所以这一行做的是唯一
 * 真实的往返：把当前输入的密钥写进去再读回来，写入失败就是失败。本地 provider
 * （hymt2 / m2m100）根本没有远端，这一行不出现——没有可测的东西就不给一个按不动的按钮。
 *
 * 密钥不写进 `AppSettings`：`translation` 结构里没有 apiKey 字段，密钥走
 * `bridge.translation.setCredential`，由引擎侧保管（和主仓一致）。
 */

import { useCallback, useMemo, useState } from 'react'
import { Button, Input, TextField, toast } from '@heroui/react'

import { HYMT2_MODEL_IDS, HYMT2_MODEL_LABELS, TRANSLATION_PROVIDERS } from '@/bridge'
import type { CloudTranslationProvider, TranslationProvider } from '@/bridge'
import { SettingsRow } from '../SettingsRow'
import { useI18n } from '@/i18n'
import { actions, getBridge, stores, updateSettings, useStore } from '@/store'
import { SettingGroup, SettingSelect, SettingSwitch } from '../SettingsPage'
import type { PickerOption, SettingsPanelProps } from '../SettingsPage'

/** provider 显示名。这些是产品名，不随界面语言变。 */
const PROVIDER_LABELS: Record<TranslationProvider, string> = {
  hymt2: 'Hy-MT2',
  m2m100: 'M2M100',
  microsoft: 'Microsoft Translator',
  openai: 'OpenAI',
  ollama: 'Ollama',
}

export function TranslationTab({ settings }: SettingsPanelProps) {
  const { t } = useI18n()
  const translation = settings.translation
  const credentials = useStore(stores.models, (state) => state.credentials)

  const providerOptions = useMemo<PickerOption[]>(
    () => TRANSLATION_PROVIDERS.map((id) => ({ value: id, label: PROVIDER_LABELS[id] })),
    [],
  )

  const hymt2Options = useMemo<PickerOption[]>(
    () => HYMT2_MODEL_IDS.map((id) => ({ value: id, label: HYMT2_MODEL_LABELS[id] })),
    [],
  )

  const setProvider = (value: string) => {
    void updateSettings({ translation: { provider: value as TranslationProvider } }).catch(() => undefined)
  }

  return (
    <div className="settings-panel">
      <SettingGroup legend={t('settings.groupProvider')}>
        <SettingsRow label={t('settings.provider')}>
          <SettingSelect
            value={translation.provider}
            options={providerOptions}
            ariaLabel={t('settings.provider')}
            onChange={setProvider}
          />
        </SettingsRow>
        <SettingsRow label={t('settings.translateIntermediate')}>
          <SettingSwitch
            isSelected={translation.translateIntermediate}
            ariaLabel={t('settings.translateIntermediate')}
            onChange={(next) => {
              void updateSettings({ translation: { translateIntermediate: next } }).catch(() => undefined)
            }}
          />
        </SettingsRow>
      </SettingGroup>

      {translation.provider === 'hymt2' ? (
        <SettingGroup legend={t('settings.groupConnection')}>
          <SettingsRow label={t('settings.model')}>
            <SettingSelect
              value={translation.hymt2ModelId}
              options={hymt2Options}
              ariaLabel={t('settings.model')}
              onChange={(value) => {
                void updateSettings({
                  translation: { hymt2ModelId: value as (typeof HYMT2_MODEL_IDS)[number] },
                }).catch(() => undefined)
              }}
            />
          </SettingsRow>
        </SettingGroup>
      ) : null}

      {translation.provider === 'microsoft' ? (
        <SettingGroup legend={t('settings.groupConnection')}>
          <TextRow
            label={t('settings.endpoint')}
            value={translation.microsoftEndpoint}
            onCommit={(value) => {
              void updateSettings({ translation: { microsoftEndpoint: value } }).catch(() => undefined)
            }}
          />
          <TextRow
            label={t('settings.region')}
            value={translation.microsoftRegion}
            onCommit={(value) => {
              void updateSettings({ translation: { microsoftRegion: value } }).catch(() => undefined)
            }}
          />
          <ApiKeyRow provider="microsoft" stored={credentials.microsoft} />
        </SettingGroup>
      ) : null}

      {translation.provider === 'openai' ? (
        <SettingGroup legend={t('settings.groupConnection')}>
          <TextRow
            label={t('settings.endpoint')}
            value={translation.openaiEndpoint}
            onCommit={(value) => {
              void updateSettings({ translation: { openaiEndpoint: value } }).catch(() => undefined)
            }}
          />
          <TextRow
            label={t('settings.model')}
            value={translation.openaiModel}
            onCommit={(value) => {
              void updateSettings({ translation: { openaiModel: value } }).catch(() => undefined)
            }}
          />
          <ApiKeyRow provider="openai" stored={credentials.openai} />
        </SettingGroup>
      ) : null}

      {translation.provider === 'ollama' ? (
        <SettingGroup legend={t('settings.groupConnection')}>
          <TextRow
            label={t('settings.endpoint')}
            value={translation.ollamaEndpoint}
            onCommit={(value) => {
              void updateSettings({ translation: { ollamaEndpoint: value } }).catch(() => undefined)
            }}
          />
          <TextRow
            label={t('settings.model')}
            value={translation.ollamaModel}
            onCommit={(value) => {
              void updateSettings({ translation: { ollamaModel: value } }).catch(() => undefined)
            }}
          />
        </SettingGroup>
      ) : null}
    </div>
  )
}

/** Label 在上、输入在下，占位符只做格式提示（DESIGN 第 12.2 节第 3 条）。 */
function TextRow({
  label,
  value,
  onCommit,
}: {
  label: string
  value: string
  onCommit: (value: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)

  // 外部值变了（另一个窗口改了设置）且本行没在编辑时，跟上去。
  const shown = focused ? draft : value
  const commit = useCallback(() => {
    setFocused(false)
    if (draft !== value) onCommit(draft)
  }, [draft, value, onCommit])

  return (
    <SettingsRow label={label}>
      <TextField
        value={shown}
        onChange={setDraft}
        onFocus={() => { setDraft(value); setFocused(true) }}
        onBlur={commit}
        className="w-[200px]"
      >
        <Input className="rounded-[8px]" aria-label={label} />
      </TextField>
    </SettingsRow>
  )
}
function ApiKeyRow({ provider, stored }: { provider: CloudTranslationProvider; stored: boolean }) {
  const { t } = useI18n()
  const [draft, setDraft] = useState('')
  const [state, setState] = useState<'idle' | 'pending' | 'testing'>('idle')

  const save = useCallback(async () => {
    if (draft.trim() === '') return
    setState('pending')
    try {
      await actions.models.setTranslationCredential(provider, draft.trim())
      setDraft('')
      toast.success(t('common.saved'))
    } catch {
      toast.danger(t('errors.translateFailed'))
    } finally {
      setState('idle')
    }
  }, [draft, provider, t])

  /*
   * 契约里没有"探测 endpoint 通不通"的通道，所以"测试连接"落成唯一真实的往返：
   * 问引擎这个 provider 到底存不存密钥。本地 provider 没有远端，那一行不会出现。
   */
  const verify = useCallback(async () => {
    setState('testing')
    try {
      const bridge = getBridge()
      const ok = bridge ? await bridge.translation.hasCredential(provider) : false
      if (ok) toast.success(t('status.ok'))
      else toast.danger(t('errors.translateFailed'))
    } catch {
      toast.danger(t('errors.translateFailed'))
    } finally {
      setState('idle')
    }
  }, [provider, t])

  return (
    <SettingsRow label={t('settings.apiKey')} desc={t('modelsSettingsUi.credentialCheckHint')}>
      <TextField value={draft} onChange={setDraft} className="w-[200px]">
        {/*
          `type` 与占位符都落在 `Input` 上：`TextField` 根只接 value / onChange，
          原生 change 事件是 `Input` 的事（DESIGN 第 11.4 节陷阱 5 的反面）。
          密钥走 password：屏幕共享时不该一眼看见。
        */}
        <Input
          type="password"
          className="rounded-[8px]"
          aria-label={t('settings.apiKey')}
          placeholder={t('settings.apiKeyPlaceholder')}
        />
      </TextField>
      <Button
        variant="tertiary"
        size="sm"
        className="rounded-[6px]"
        isDisabled={draft.trim() === ''}
        isPending={state === 'pending'}
        onPress={() => {
          void save()
        }}
      >
        {t('settings.saveKey')}
      </Button>
      <Button
        variant="tertiary"
        size="sm"
        className="rounded-[6px]"
        isPending={state === 'testing'}
        isDisabled={!stored}
        onPress={() => {
          void verify()
        }}
      >
        {state === 'testing' ? t('settings.testing') : t('modelsSettingsUi.credentialCheck')}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="rounded-[6px] text-muted hover:bg-danger-soft hover:text-danger-soft-foreground"
        isDisabled={!stored}
        onPress={() => {
          void actions.models
            .setTranslationCredential(provider, '')
            .then(() => toast.success(t('common.done')))
            .catch(() => toast.danger(t('errors.translateFailed')))
        }}
      >
        {t('settings.deleteKey')}
      </Button>
    </SettingsRow>
  )
}

