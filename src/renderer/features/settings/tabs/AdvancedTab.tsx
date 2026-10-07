import { SettingsRow } from '../SettingsRow'
/**
 * Advanced diagnostics: engine state, versions and paths, copy diagnostics, factory reset.
 *
 * Copying writes the whole `DiagnosticsPayload` to the clipboard and then holds the checkmark
 * in place on the button itself: the user's eyes are on the button they just pressed, so the
 * confirmation belongs there rather than in a corner toast.
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
import { Check, ExternalLink } from 'lucide-react'

import { DEFAULT_SETTINGS, PROTOCOL_VERSION } from '@/bridge'
import { StatusPill } from '@/components/primitives'
import type { StatusPillTone } from '@/components/primitives'
import { useI18n } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { getBridge, stores, updateSettings, useStore } from '@/store'
import type { EngineStatus } from '@/store'
import { SettingGroup } from '../SettingsPage'
import type { SettingsPanelProps } from '../SettingsPage'
import { ThirdPartyNotices } from '../ThirdPartyNotices'

/** How long the copied checkmark stays up. */
const COPIED_HOLD_MS = 1500

const ISSUES_URL = 'https://github.com/CerealAxis/Nola-Translator/issues'
const QQ_GROUP = '701699932'

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

      <SettingGroup legend={t('settings.groupAbout')}>
        <SettingsRow label={t('settings.thirdPartyNotices')} desc={t('settings.thirdPartyNoticesHint')} descriptionTooltip>
          <ThirdPartyNotices />
        </SettingsRow>
      </SettingGroup>

      <SettingGroup legend={t('settings.groupReport')}>
        <SettingsRow label={t('settings.copyDiagnostics')}>
          <CopyDiagnostics />
        </SettingsRow>
        {/*
          The main process `setWindowOpenHandler` hands `https:` targets to the shell and
          denies the window, so this anchor leaves the app instead of navigating the renderer.
        */}
        <SettingsRow label={t('settings.githubIssue')} desc={t('settings.githubIssueHint')} descriptionTooltip>
          <a className="inline-flex items-center gap-1 text-accent underline" href={ISSUES_URL} target="_blank" rel="noreferrer">
            {t('settings.openInBrowser')}
            <ExternalLink className="size-4" aria-hidden="true" />
          </a>
        </SettingsRow>
        <SettingsRow label={t('settings.qqGroup')}>
          <CodeValue value={QQ_GROUP} />
        </SettingsRow>
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
