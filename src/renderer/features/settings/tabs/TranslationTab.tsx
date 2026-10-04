import { supportsSelectedEngine } from '../../../../shared/model-engines'
/**
 * 翻译服务。provider、翻译中间语言、按 provider 条件显示的连接参数、API 密钥。
 *
 * **provider 从五个塌成三个。** Hy-MT2 与 M2M100 都是本地模型，合并成「本地模型」，
 * 真正跑哪一个由下面那个下拉框选中的 `localModelId` 决定，引擎按 id 路由；
 * OpenAI 与 Ollama 合并成「云端模型」，Ollama 从此只是 API 格式里的一项，不再是服务商。
 * 只剩 Microsoft Translator 是独立服务商。
 *
 * **"测试连接"落在密钥上。** bridge 契约里没有"探测某个 endpoint 通不通"的通道
 * （`translation` 组只有 `hasCredential` / `setCredential`），所以这一行做的是唯一
 * 真实的往返：把当前输入的密钥写进去再读回来，写入失败就是失败。本地模型根本没有远端，
 * 这一行不出现——没有可测的东西就不给一个按不动的按钮。
 *
 * **密钥不写进 `AppSettings`**：`translation` 结构里没有 apiKey 字段，密钥走
 * `bridge.translation.setCredential`，由引擎侧保管（和主仓一致）。存密钥的是
 * `cloud` / `microsoft` 两个**凭据归属**方，与界面上那三个 provider 不是一回事：
 * Ollama 跑在云端模型底下，但它在本机、通常不要 key，所以云端这一行不会因为
 * "还没存密钥"就整块禁用。
 */

import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Input, TextField, toast } from '@heroui/react'

import { CLOUD_API_FORMATS, CLOUD_FORMAT_DEFAULTS, TRANSLATION_PROVIDERS } from '@/bridge'
import type { CloudApiFormat, CredentialProvider, TranslationProvider, TranslationSettings } from '@/bridge'
import { SettingsRow } from '../SettingsRow'
import { useI18n } from '@/i18n'
import { actions, getBridge, stores, updateSettings, useStore } from '@/store'
import { SettingGroup, SettingSelect, SettingSwitch } from '../SettingsPage'
import type { PickerOption, SettingsPanelProps } from '../SettingsPage'

export function TranslationTab({ settings }: SettingsPanelProps) {
  const { t } = useI18n()
  const translation = settings.translation
  const credentials = useStore(stores.models, (state) => state.credentials)
  const resources = useStore(stores.models, (state) => state.resources)

  /*
   * 「本地模型 / 云端模型」是**界面概念**，不是产品名，所以走 i18n；产品名只剩
   * Microsoft Translator 一个。列表取 `TRANSLATION_PROVIDERS` 而不在这里另写一份，
   * 主进程那个只认这张表的 sanitizer 就会顺手兜住"界面上多出一个选项"。
   */
  const providerLabels = useMemo<Record<TranslationProvider, string>>(() => ({
    local: t('settings.providerLocal'),
    cloud: t('settings.providerCloud'),
    microsoft: t('settings.providerMicrosoft'),
  }), [t])

  const providerOptions = useMemo<PickerOption[]>(
    () => TRANSLATION_PROVIDERS.map((id) => ({ value: id, label: providerLabels[id] })),
    [providerLabels],
  )

  const apiFormatLabels = useMemo<Record<CloudApiFormat, string>>(() => ({
    'chat-completions': t('settings.apiFormatChatCompletions'),
    'chat-responses': t('settings.apiFormatChatResponses'),
    anthropic: t('settings.apiFormatAnthropic'),
    ollama: t('settings.apiFormatOllama'),
  }), [t])

  const apiFormatOptions = useMemo<PickerOption[]>(
    () => CLOUD_API_FORMATS.map((id) => ({ value: id, label: apiFormatLabels[id] })),
    [apiFormatLabels],
  )

  /*
   * 本地模型下拉框列的是**真装了哪些**，来自模型 store，而不是写死的三档 Hy-MT2。
   * 写死那份有三个毛病：没装的也列出来（选完开会话才发现权重不存在）、体积与质量
   * 后缀是硬编码的中文形容词（数据一变就过期）、以及 M2M100 根本不在里面。
   * 现在按 `resourceId` 走，M2M100、从 Hub 装的 GGUF 和三档 Hy-MT2 是同一条路。
   * **选项文字就是模型名本身**：体积、参数量、量化档到模型卡片上去看，不进下拉框。
   */
  const localModelOptions = useMemo<PickerOption[]>(() => {
    const installed = resources
      .filter((item) => item.kind === 'translationModel' && item.installed)
      .map((item) => ({ value: item.resourceId, label: item.name, isDisabled: !supportsSelectedEngine(item, settings.compute, item.resourceId) }))
    /*
     * 选中的那个即便不在已装列表里（刚被卸载、设置从另一台机器同步过来）也要补一条：
     * 它是**当前值**，不是候选值，丢掉它下拉框会显示空白，看起来像坏了。
     * 一个都没装时补出来也是一条死选项，所以那种情况改走 `localModelEmpty` 提示。
     */
    if (installed.length > 0 && !installed.some((option) => option.value === translation.localModelId)) {
      installed.push({ value: translation.localModelId, label: translation.localModelId, isDisabled: true })
    }
    return installed
  }, [resources, translation.localModelId, settings.compute])

  /*
   * 接口地址该填到哪一层由 API 格式决定（Anthropic 只填站点根地址，其余填到 /v1），
   * 而层级填错是最难从报错里看出来的一类错，所以逐格式给一句提示。
   */
  const endpointHint = useMemo(() => {
    switch (translation.cloudApiFormat) {
      case 'chat-responses': return t('settings.endpointHintChatResponses')
      case 'anthropic': return t('settings.endpointHintAnthropic')
      case 'ollama': return t('settings.endpointHintOllama')
      default: return t('settings.endpointHintChatCompletions')
    }
  }, [translation.cloudApiFormat, t])

  const setProvider = (value: string) => {
    void updateSettings({ translation: { provider: value as TranslationProvider } }).catch(() => undefined)
  }

  /**
   * **切格式要连地址和模型一起搬。** 只写新格式这一个值，就是把上一格式的地址留在原地：
   * 全新安装（`https://api.openai.com/v1` + `gpt-4.1-mini`）直接切到 Ollama，引擎会拼出
   * `https://api.openai.com/v1/api/chat` —— 打到 OpenAI 的域名、用着 Ollama 的 URL 形状，
   * 用户只拿到一个完全不提地址的网络错误。模型 id 同理，`gpt-4.1-mini` 对 Ollama 和 Anthropic
   * 都没有意义。所以两个字段都从 `CLOUD_FORMAT_DEFAULTS` 跟着格式换。
   *
   * **判据是「当前值是否等于离开的那个格式的默认值」**：等于就当作用户从没改过（也是绝大多数
   * 情况），换成新格式的默认值。**改过的一律不动**，哪怕新格式在另一个世界 —— 用户敲的
   * DeepSeek 网关地址换到 Ollama 确实不再合适，但那个地址只存在 `settings.json` 这一份，
   * 悄悄覆盖等于删掉一份找不回来的数据；而不改只是"配置还没调完"，接口地址框就在提示行正上方。
   * 同族的 `chat-completions` ↔ `chat-responses` 两行默认值相同，这段逻辑自然退化成空操作，
   * 所以"故意换协议但保留地址"这种正确用法不会被碰。
   *
   * 逐字段独立判定，而不是"两个都没改过才一起换"：只填了网关地址、模型还留在默认的用户，
   * 切格式后拿到新格式的模型 id 正是他想要的。
   *
   * **空串照原样传下去**：清空输入框是用户的明确动作，引擎那边 `if not endpoint: raise` 会报出
   * 写给用户看的那句话（`runtime.py` 刻意不再 `or DEFAULT_*`），这里替他补默认值只会把
   * "地址空了"变成一个更费解的鉴权失败。
   */
  const setApiFormat = (value: string) => {
    const next = value as CloudApiFormat
    const previous = translation.cloudApiFormat
    if (next === previous) return
    const from = CLOUD_FORMAT_DEFAULTS[previous]
    const to = CLOUD_FORMAT_DEFAULTS[next]
    const patch: Partial<TranslationSettings> = { cloudApiFormat: next }
    if (translation.cloudEndpoint === from.cloudEndpoint) patch.cloudEndpoint = to.cloudEndpoint
    if (translation.cloudModel === from.cloudModel) patch.cloudModel = to.cloudModel
    void updateSettings({ translation: patch }).catch(() => undefined)
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

      {translation.provider === 'local' ? (
        <SettingGroup legend={t('settings.groupLocalModel')}>
          {localModelOptions.length === 0 ? (
            /*
             * 一个本地翻译模型都没装时**不给空的死下拉框**：点开里面什么都没有，
             * 用户只会以为界面坏了。直接说清楚去哪儿下载。
             */
            <SettingsRow label={t('settings.model')}>
              <span className="nola-caption text-muted">{t('settings.localModelEmpty')}</span>
            </SettingsRow>
          ) : (
            <SettingsRow label={t('settings.model')}>
              <SettingSelect
                value={translation.localModelId}
                options={localModelOptions}
                ariaLabel={t('settings.model')}
                onChange={(value) => {
                  void updateSettings({ translation: { localModelId: value } }).catch(() => undefined)
                }}
              />
            </SettingsRow>
          )}
        </SettingGroup>
      ) : null}

      {translation.provider === 'cloud' ? (
        <SettingGroup legend={t('settings.groupConnection')}>
          <TextRow
            label={t('settings.apiName')}
            placeholder={t('settings.apiNamePlaceholder')}
            value={translation.cloudName}
            onCommit={(value) => {
              void updateSettings({ translation: { cloudName: value } }).catch(() => undefined)
            }}
          />
          <TextRow
            label={t('settings.endpoint')}
            desc={endpointHint}
            placeholder={t('settings.endpointPlaceholder')}
            value={translation.cloudEndpoint}
            onCommit={(value) => {
              void updateSettings({ translation: { cloudEndpoint: value } }).catch(() => undefined)
            }}
          />
          <ApiKeyRow provider="cloud" stored={credentials.cloud} />
          <SettingsRow label={t('settings.apiFormat')}>
            <SettingSelect
              value={translation.cloudApiFormat}
              options={apiFormatOptions}
              ariaLabel={t('settings.apiFormat')}
              onChange={setApiFormat}
            />
          </SettingsRow>
          <TextRow
            label={t('settings.modelId')}
            value={translation.cloudModel}
            onCommit={(value) => {
              void updateSettings({ translation: { cloudModel: value } }).catch(() => undefined)
            }}
          />
          <NumberRow
            label={t('settings.contextWindow')}
            value={translation.cloudContextWindow}
            onCommit={(value) => {
              void updateSettings({ translation: { cloudContextWindow: value } }).catch(() => undefined)
            }}
          />
          <NumberRow
            label={t('settings.maxOutputTokens')}
            value={translation.cloudMaxOutputTokens}
            onCommit={(value) => {
              void updateSettings({ translation: { cloudMaxOutputTokens: value } }).catch(() => undefined)
            }}
          />
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
    </div>
  )
}

/** Label 在上、输入在下，占位符只做格式提示（DESIGN 第 12.2 节第 3 条）。 */
function TextRow({
  label,
  desc,
  placeholder,
  value,
  onCommit,
}: {
  label: string
  desc?: ReactNode
  placeholder?: string
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
    <SettingsRow label={label} desc={desc}>
      <TextField
        value={shown}
        onChange={setDraft}
        onFocus={() => { setDraft(value); setFocused(true) }}
        onBlur={commit}
        className="w-[200px]"
      >
        <Input className="rounded-[8px]" aria-label={label} placeholder={placeholder} />
      </TextField>
    </SettingsRow>
  )
}

/**
 * 数字行（上下文窗口 / 最大输出 Token）。`TextField` 没有数字类型，所以值是**字符串草稿**、
 * 失焦时才解析：编辑途中留字符串，才能把 `128` 改成 `128000`（先清空再输入）；
 * 每敲一个键就写一次会把中间态（`1`）也存进设置。
 *
 * **解析不出来就丢弃草稿、回到原值**，绝不把 NaN 写回设置 —— 它会一路传进引擎，
 * 而引擎只会报一句"配置非法"，不会告诉你是哪个字段。下限只挡明显不合理的 0 与负数，
 * 该给多大由用户和他选的模型决定。
 */
function NumberRow({
  label,
  value,
  onCommit,
}: {
  label: string
  value: number
  onCommit: (value: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  const [focused, setFocused] = useState(false)

  const shown = focused ? draft : String(value)
  const commit = useCallback(() => {
    setFocused(false)
    const next = Number(draft.trim())
    if (!Number.isFinite(next) || next <= 0) return
    const rounded = Math.round(next)
    if (rounded !== value) onCommit(rounded)
  }, [draft, value, onCommit])

  return (
    <SettingsRow label={label}>
      <TextField
        value={shown}
        onChange={setDraft}
        onFocus={() => { setDraft(String(value)); setFocused(true) }}
        onBlur={commit}
        className="w-[200px]"
      >
        <Input type="number" min={1} step={1} className="rounded-[8px]" aria-label={label} />
      </TextField>
    </SettingsRow>
  )
}

function ApiKeyRow({ provider, stored }: { provider: CredentialProvider; stored: boolean }) {
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
   * 问引擎这个凭据归属方到底存不存密钥。本地模型没有远端，那一行不会出现。
   * Ollama 走的是 `cloud` 这一格而通常没有 key，所以"没存 key"只禁用删除与检查两个按钮，
   * 不禁用整行 —— 否则连把 key 填进去的入口都没了。
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
