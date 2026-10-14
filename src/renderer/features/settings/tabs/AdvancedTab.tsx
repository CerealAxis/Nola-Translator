import { SettingsRow } from '../SettingsRow'
/**
 * Advanced diagnostics: engine state, versions and paths, factory reset.
 *
 * Factory reset confirms through `AlertDialog`, which is the only destructive path in the app
 * that is not a single click.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  AlertDialog,
  Button,
  Spinner,
  Surface,
  Typography,
} from '@heroui/react'

import { DEFAULT_SETTINGS, PROTOCOL_VERSION } from '@/bridge'
import { StatusPill } from '@/components/primitives'
import type { StatusPillTone } from '@/components/primitives'
import { useI18n } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { actions, stores, updateSettings, useStore } from '@/store'
import type { EngineStatus } from '@/store'
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

      <SettingGroup legend={t('settings.resetAll')}>
        <SettingsRow label={t('settings.resetAll')}>
          <ResetAll pending={pending} />
        </SettingsRow>
      </SettingGroup>

      {/*
        The individual diagnostics rows. Copying alone hands the user JSON they have to open
        somewhere else to read, while what they need during a failure is to be told now.
        A failed load states the reason instead of showing an empty list, which would read
        as "everything is fine".
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
 * The keys are Chinese literals hardcoded in the main process (`app-ipc.ts`) and never go
 * through i18n, so they are shown as they arrive: translating a diagnostics key would make
 * the on-screen Chinese and the copied report disagree, and a field that does not match is
 * useless in a bug report.
 */
function DiagnosticsReport() {
  const { t } = useI18n()
  const [rows, setRows] = useState<Array<[string, string]> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    actions.settings.readDiagnostics()
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

function CodeValue({ value }: { value: string }) {
  return (
    <Surface className="settings-code rounded-[8px] border border-border px-3 py-1">
      <Typography.Code className="settings-code nola-mono text-foreground">{value}</Typography.Code>
    </Surface>
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
    } finally {
      setState('idle')
    }
  }, [])

  return (
    <>
      <Button
        variant="danger"
        size="sm"
        className="rounded-[var(--radius-xl)]"
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
                  className="rounded-[var(--radius-xl)]"
                  onPress={() => setOpen(false)}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="danger-soft"
                  size="sm"
                  className="rounded-[var(--radius-xl)]"
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
