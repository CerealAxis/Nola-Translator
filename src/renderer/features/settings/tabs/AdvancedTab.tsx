import { SettingsRow } from '../SettingsRow'
/**
 * 高级诊断。引擎状态、版本与路径、复制诊断信息、恢复出厂设置。
 *
 * **复制诊断信息用 `bridge.diagnostics.copy()`。** 它把整份 `DiagnosticsPayload` 写进
 * 剪贴板（主仓的 `copyDiagnostics` 是同一个通道）。按钮图标换成 ✓ 保持 1.5s 再复原：
 * 用户点复制时眼睛盯着的是按钮，不是屏幕角落，所以这里用按钮原地的反馈而不是 toast
 * （DESIGN 第 8 节"复制按钮"）。
 *
 * **恢复出厂设置走 `AlertDialog`。** 破坏性操作必须有二次确认，`window.confirm`
 * 在 Electron 里会被系统拦掉而且样式不可控（DESIGN 第 11.3 节）。
 */

import { useCallback, useEffect, useState } from 'react'
import {
  AlertDialog,
  Button,
  Spinner,
  Surface,
  Typography,
} from '@heroui/react'
import { Check } from 'lucide-react'

import { DEFAULT_SETTINGS, PROTOCOL_VERSION } from '@/bridge'
import { StatusPill } from '@/components/primitives'
import type { StatusPillTone } from '@/components/primitives'
import { useI18n } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { getBridge, stores, updateSettings, useStore } from '@/store'
import type { EngineStatus } from '@/store'
import { SettingGroup } from '../SettingsPage'
import type { SettingsPanelProps } from '../SettingsPage'

/** 复制成功后 ✓ 停留多久。DESIGN 第 8 节规定 1.5s。 */
const COPIED_HOLD_MS = 1500

/**
 * 引擎状态灯：**读完整的 `engineStatus`，不再读那个布尔值。**
 *
 * 以前这里是 `engineReady ? '引擎就绪' : '引擎未启动'`，而那个布尔值就是
 * `engineStatus === 'ready'`。于是五种截然不同的局面塌成两种画法：引擎从没起过、
 * 引擎正在启动、引擎崩溃后正在重连、引擎重试耗尽起不来 —— 全部显示「引擎未启动」，
 * **崩溃被报成了一件没发生的事**。用户在设置页唯一能问引擎状态的地方，
 * 恰恰是引擎真出事时给出答案最少的地方。
 *
 * 写成穷举的 `Record`（与 `sessionStore` 的 `ENGINE_PROCESS_STATE_TO_UI` 同一个用意）：
 * 将来 `EngineStatus` 加一个取值，这里编译不过，逼着补一句话，而不是让新状态
 * 悄悄掉进 `?? '引擎未启动'`。
 *
 * 颜色也分开：`idle` 不是故障，所以是中性灰而不是黄色；黄色留给"正在起来"，
 * 红色留给"起不来"。用同一个 warning 画"没启动"与"起不来"，就是把两者说成同一件事。
 */
const ENGINE_STATUS_ROW: Record<EngineStatus, { label: TranslationKey; tone: StatusPillTone }> = {
  idle: { label: 'titleBar.engineIdle', tone: 'neutral' },
  booting: { label: 'titleBar.engineStarting', tone: 'warning' },
  ready: { label: 'titleBar.engineReady', tone: 'success' },
  recovering: { label: 'titleBar.engineRecovering', tone: 'warning' },
  failed: { label: 'titleBar.engineFailed', tone: 'danger' },
}

export function AdvancedTab(_props: SettingsPanelProps) {
  const { t } = useI18n()
  const engineVersion = useStore(stores.models, (state) => state.engineVersion)
  const engineStatus = useStore(stores.session, (state) => state.engineStatus)
  const storage = useStore(stores.settings, (state) => state.storage)
  const pending = useStore(stores.settings, (state) => state.pending)
  const engineRow = ENGINE_STATUS_ROW[engineStatus]

  return (
    <div className="settings-panel">
      <SettingGroup legend={t('settings.groupEngine')}>
        <SettingsRow label={t('settings.engineStatus')}>
          <StatusPill label={t(engineRow.label)} tone={engineRow.tone} />
        </SettingsRow>
        <CodeRow label={t('settings.engineVersion')} value={engineVersion ?? '-'} />
        <CodeRow label={t('settings.enginePath')} value={storage?.activePath ?? '-'} />
        <CodeRow label={t('settings.protocolVersion')} value={String(PROTOCOL_VERSION)} />
      </SettingGroup>

      <SettingGroup legend={t('settings.groupReport')}>
        <SettingsRow label={t('settings.copyDiagnostics')}>
          <CopyDiagnostics />
        </SettingsRow>
        <SettingsRow label={t('settings.resetAll')}>
          <ResetAll pending={pending} />
        </SettingsRow>
      </SettingGroup>

      {/*
        诊断明细。
        旧前端的 `DiagnosticsPage` 是一整页，只有一项能力是本页没有的：**把
        `getDiagnostics()` 的返回逐条列出来**。只有「一键复制」的话，用户能复制但看不到 ——
        复制出来那段 JSON 还要自己找个地方打开才看得到，而出问题时用户要的正是「现在就说给我听」。
        载荷拉取失败时只显示一行原因，不空转：空表格会被当成「一切正常」。
      */}
      <SettingGroup legend={t('settings.groupDiagnostics')}>
        <DiagnosticsReport />
      </SettingGroup>
    </div>
  )
}

/**
 * `getDiagnostics()` 的只读列表。
 *
 * **键是中文**（`应用版本` / `引擎状态` / `语音识别` / `本地翻译` / `数据目录` …）——
 * 那是主进程 `app-ipc.ts` 里写死的字面量，不经过 i18n。这里原样显示，
 * 不做翻译：翻译一份诊断键会让用户拿到的中文界面和复制出去的诊断对不上号，
 * 报 bug 时两边对不上的字段等于没有。
 */
function DiagnosticsReport() {
  const { t } = useI18n()
  const [rows, setRows] = useState<Array<[string, string]> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const bridge = getBridge()
    if (!bridge) {
      setError(t('settings.diagnosticsUnavailable'))
      return
    }
    bridge.diagnostics.get()
      .then((payload) => {
        if (!active) return
        setRows(Object.entries(payload).map(([key, value]) => [key, String(value)]))
      })
      .catch((cause: unknown) => {
        if (!active) return
        setError(cause instanceof Error ? cause.message : t('settings.diagnosticsUnavailable'))
      })
    return () => { active = false }
  }, [t])

  if (error !== null) {
    return <SettingsRow label={t('settings.diagnosticsFailed')}><span className="nola-caption text-muted">{error}</span></SettingsRow>
  }
  if (rows === null) {
    return <SettingsRow label={t('settings.diagnosticsLoading')}><Spinner size="sm" /></SettingsRow>
  }
  if (rows.length === 0) {
    return <SettingsRow label={t('settings.diagnosticsEmpty')}><span className="nola-caption text-muted">-</span></SettingsRow>
  }
  return (
    <>
      {rows.map(([key, value]) => <CodeRow key={key} label={key} value={value} />)}
    </>
  )
}

function CodeRow({ label, value }: { label: string; value: string }) {
  return (
    <SettingsRow label={label}>
      <Surface className="settings-code rounded-[8px] border border-border px-3 py-1">
        <Typography.Code className="settings-code nola-mono text-foreground">{value}</Typography.Code>
      </Surface>
    </SettingsRow>
  )
}

function CopyDiagnostics() {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_HOLD_MS)
    return () => clearTimeout(timer)
  }, [copied])

  const run = useCallback(async () => {
    const bridge = getBridge()
    if (!bridge) return
    try {
      await bridge.diagnostics.copy()
      setCopied(true)
    } catch (error) {
      console.error('[diagnostics]', error)
    }
  }, [])

  return (
    <Button variant="tertiary" size="sm" className="rounded-[6px]" onPress={() => void run()}>
      {copied ? <Check className="size-4" aria-hidden="true" /> : null}
      {copied ? t('common.copied') : t('settings.copyDiagnostics')}
    </Button>
  )
}

function ResetAll({ pending }: { pending: boolean }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<'idle' | 'pending'>('idle')

  const reset = useCallback(async () => {
    setState('pending')
    // version 与 modelStoragePath 不在 AppSettingsPatch 里：前者是结构版本，
    // 后者只能由 storage.choose() 改。恢复出厂设置不应该动模型目录。
    const { version, modelStoragePath, ...patch } = DEFAULT_SETTINGS
    void version
    void modelStoragePath
    try {
      await updateSettings(patch)
      setOpen(false)
    } catch (error) {
      console.error('[settings.reset]', error)
    } finally {
      setState('idle')
    }
  }, [])

  return (
    <>
      <Button
        variant="danger"
        size="sm"
        className="rounded-[6px]"
        isPending={pending}
        onPress={() => setOpen(true)}
      >
        {t('settings.resetAll')}
      </Button>

      <AlertDialog isOpen={open} onOpenChange={setOpen}>
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog>
              <AlertDialog.Header>
                <AlertDialog.Heading className="nola-title text-foreground">
                  {t('settings.resetAllTitle')}
                </AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p className="nola-body text-muted">{t('settings.resetAllBody')}</p>
              </AlertDialog.Body>
              <AlertDialog.Footer className="flex justify-end gap-2">
                <Button
                  variant="tertiary"
                  size="sm"
                  className="rounded-[6px]"
                  onPress={() => setOpen(false)}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="danger-soft"
                  size="sm"
                  className="rounded-[6px]"
                  isPending={state === 'pending'}
                  onPress={() => {
                    void reset()
                  }}
                >
                  {t('settings.resetAll')}
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </>
  )
}

