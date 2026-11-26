import { SettingsRow } from '../SettingsRow'
import { useCallback, useState } from 'react'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AlertDialogContent, DialogHeader, DialogFooter } from '@/components/ui/dialog'

import { DEFAULT_SETTINGS, PROTOCOL_VERSION } from '@/bridge'
import { StatusPill } from '@/components/primitives'
import type { StatusPillTone } from '@/components/primitives'
import { useI18n } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { stores, updateSettings, useStore } from '@/store'
import type { EngineStatus } from '@/store'
import { reportSettingsFailure } from '../settingsErrorChannel'
import { SettingGroup } from '../SettingsPage'

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

export function EngineDiagnostics() {
  const { t } = useI18n()
  const engineVersion = useStore(stores.models, (state) => state.engineVersion)
  const engineStatus = useStore(stores.session, (state) => state.engineStatus)
  const storage = useStore(stores.settings, (state) => state.storage)
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
    </div>
  )
}

export function ResetSettingsGroup() {
  const { t } = useI18n()
  const pending = useStore(stores.settings, state => state.pending)
  return <SettingGroup legend={t('settings.resetAll')}>
    <SettingsRow label={t('settings.resetAll')}><ResetAll pending={pending} /></SettingsRow>
  </SettingGroup>
}

function CodeValue({ value }: { value: string }) {
  return (
    <span className="settings-code rounded-md border border-border px-3 py-1">
      <span className="settings-code type-body text-foreground">{value}</span>
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
            <AlertDialogContent className="max-w-md">
              <DialogHeader>
                <AlertDialog.Title className="type-h4 text-foreground">
                  {t('settings.resetAllTitle')}
                </AlertDialog.Title>
              </DialogHeader>
              <AlertDialog.Description>
                {t('settings.resetAllBody')}
              </AlertDialog.Description>
              <DialogFooter className="flex justify-end gap-2">
                <Button
                  variant="secondary"
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
            </AlertDialogContent>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  )
}
