import { OfflineResources } from '../../offline'
import { SettingsRow } from '../SettingsRow'
/**
 * Advanced diagnostics: engine state, versions and paths, factory reset.
 *
 * Factory reset confirms through `AlertDialog`, which is the only destructive path in the app
 * that is not a single click.
 */

import { useCallback, useEffect, useState } from 'react'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DialogHeader, DialogFooter } from '@/components/ui/dialog'

import { DEFAULT_SETTINGS, PROTOCOL_VERSION } from '@/bridge'
import { StatusPill } from '@/components/primitives'
import type { StatusPillTone } from '@/components/primitives'
import { notifyError } from '@/components/primitives/notify'
import { useI18n } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { actions, stores, updateSettings, useStore } from '@/store'
import type { EngineStatus } from '@/store'
import { reportSettingsFailure } from '../settingsErrorChannel'
import { SettingGroup } from '../SettingsPage'
import type { SettingsPanelProps } from '../SettingsPage'

/**
 * Engine state, keyed exhaustively: a new `EngineStatus` fails to compile here instead of
 * falling through to a catch-all label. Same intent as `sessionStore`'s
 * `ENGINE_PROCESS_STATE_TO_UI`.
 */
const ENGINE_STATUS_ROW: Record<EngineStatus, { label: TranslationKey; tone: StatusPillTone }> = {
  idle: { label: 'titleBar.engineIdle', tone: 'neutral' },
  booting: { label: 'titleBar.engineStarting', tone: 'warning' },
  ready: { label: 'titleBar.engineReady', tone: 'success' },
  recovering: { label: 'titleBar.engineRecovering', tone: 'warning' },
  failed: { label: 'titleBar.engineFailed', tone: 'danger' },
}

const DIAGNOSTIC_LABELS: Record<string, TranslationKey> = {
  应用版本: 'settings.diagnosticAppVersion',
  操作系统: 'settings.diagnosticOperatingSystem',
  引擎状态: 'settings.diagnosticEngineStatus',
  引擎重启次数: 'settings.diagnosticRestartCount',
  语音识别: 'settings.diagnosticSpeechRecognition',
  本地翻译: 'settings.diagnosticLocalTranslation',
  数据目录: 'settings.diagnosticDataDirectory',
  本次日志: 'settings.diagnosticCurrentLog',
}

const ENGINE_STATUS_LABELS: Record<string, TranslationKey> = {
  idle: 'titleBar.engineIdle',
  booting: 'titleBar.engineStarting',
  ready: 'titleBar.engineReady',
  recovering: 'titleBar.engineRecovering',
  failed: 'titleBar.engineFailed',
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

      <OfflineResources />

      <SettingGroup legend={t('settings.resetAll')}>
        <SettingsRow label={t('settings.resetAll')}>
          <ResetAll pending={pending} />
        </SettingsRow>
      </SettingGroup>

      {/*
        The individual diagnostics rows. Copying alone hands the user JSON they have to open
        somewhere else to read, while what they need during a failure is to be told now.
        A failed load is reported as a notice and the row says the report is unavailable,
        which an empty list would not.
      */}
      <SettingGroup legend={t('settings.groupDiagnostics')}>
        <DiagnosticsReport />
      </SettingGroup>
    </div>
  )
}

/**
 * Read-only list of what `getDiagnostics()` returns.
 *
 * Main-process diagnostic keys stay stable in copied reports; the renderer localizes their
 * labels for display without changing the underlying diagnostic payload.
 */
function DiagnosticsReport() {
  const { t } = useI18n()
  const [rows, setRows] = useState<Array<[string, string]> | null>(null)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    let active = true
    actions.settings.readDiagnostics()
      .then((payload) => {
        if (!active) return
        setUnavailable(false)
        setRows(Object.entries(payload).map(([key, value]) => [key, String(value)]))
      })
      .catch((cause: unknown) => {
        if (!active) return
        setUnavailable(true)
        notifyError(t('settings.diagnosticsFailed'), { cause })
      })
    return () => { active = false }
  }, [t])

  if (unavailable) {
    return <SettingsRow label={t('settings.diagnosticsUnavailable')}><span className="nola-caption text-muted">-</span></SettingsRow>
  }
  if (rows === null) {
    return <SettingsRow label={t('settings.diagnosticsLoading')}><LoaderCircle className="animate-spin" aria-hidden="true" /></SettingsRow>
  }
  if (rows.length === 0) {
    return <SettingsRow label={t('settings.diagnosticsEmpty')}><span className="nola-caption text-muted">-</span></SettingsRow>
  }
  return (
    <>
      {rows.map(([key, value]) => {
        const labelKey = DIAGNOSTIC_LABELS[key]
        const statusKey = key === '引擎状态' ? ENGINE_STATUS_LABELS[value] : undefined
        const displayValue = statusKey ? t(statusKey)
          : value === '未运行' ? t('settings.diagnosticNotRunning')
            : value === '日志不可用' ? t('settings.diagnosticLogUnavailable')
              : value
        return <CodeRow key={key} label={labelKey ? t(labelKey) : key} value={displayValue} />
      })}
    </>
  )
}

function CodeValue({ value }: { value: string }) {
  return (
    <span className="settings-code rounded-md border border-border px-3 py-1">
      <code className="settings-code nola-mono text-foreground">{value}</code>
    </span>
  )
}

function CodeRow({ label, value }: { label: string; value: string }) {
  return (
    <SettingsRow label={label}>
      <CodeValue value={value} />
    </SettingsRow>
  )
}

function ResetAll({ pending }: { pending: boolean }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<'idle' | 'pending'>('idle')

  const reset = useCallback(async () => {
    setState('pending')
    // `version` and `modelStoragePath` are not part of `AppSettingsPatch`: the first is the
    // schema version and the second is only written by `storage.choose()`, so a reset must
    // leave the model directory alone.
    const { version, modelStoragePath, ...patch } = DEFAULT_SETTINGS
    void version
    void modelStoragePath
    try {
      await updateSettings(patch)
      setOpen(false)
    } catch (error) {
      console.error('[settings.reset]', error)
      reportSettingsFailure(t('settings.resetAllFailed'), error)
    } finally {
      setState('idle')
    }
  }, [t])

  return (
    <>
      <Button
        variant="danger"
        size="sm"
        className="rounded-[var(--radius-xl)]"
        disabled={pending || state === 'pending'}
        onClick={() => setOpen(true)}
      >
        {t('settings.resetAll')}
      </Button>

      <AlertDialog.Root open={open} onOpenChange={next => { if (state !== 'pending') setOpen(next) }}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 z-overlay bg-nola-ui-backdrop" />
            <AlertDialog.Popup className="nola-dialog-content max-w-md">
              <DialogHeader>
                <AlertDialog.Title className="nola-title text-foreground">
                  {t('settings.resetAllTitle')}
                </AlertDialog.Title>
              </DialogHeader>
              <AlertDialog.Description>
                {t('settings.resetAllBody')}
              </AlertDialog.Description>
              <DialogFooter className="flex justify-end gap-2">
                <Button
                  variant="tertiary"
                  size="sm"
                  className="rounded-[var(--radius-xl)]"
                  disabled={state === 'pending'} onClick={() => setOpen(false)}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  className="rounded-[var(--radius-xl)]"
                  disabled={state === 'pending'}
                  onClick={() => {
                    void reset()
                  }}
                >
                  {state === 'pending' ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
                  {t('settings.resetAll')}
                </Button>
              </DialogFooter>
            </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  )
}
