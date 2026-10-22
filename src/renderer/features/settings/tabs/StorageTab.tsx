/**
 * Storage and downloads: data folder, how much of it is in use, restart prompt.
 *
 * The folder row is the whole data root — settings, credentials, meetings, models and the
 * runtime all live inside it. Picking a new one writes a pointer plus a pending-migration
 * marker and moves nothing; the move happens on the next launch, before any store opens a
 * handle, so the prompt says the data will move rather than "restart required".
 *
 * The usage row is `usedBytes` from a recursive walk of that same folder, not a disk reading: free
 * space on the volume is a property of the drive, and it says nothing about how much this app is
 * holding.
 */

import { useEffect } from 'react'
import { LoaderCircle, TriangleAlert } from 'lucide-react'

import { SettingsRow } from '../SettingsRow'
import { notifySuccess, notifyWarning } from '@/components/primitives/notify'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/i18n'
import { actions, stores, useStore } from '@/store'
import { reportSettingsFailure } from '../settingsErrorChannel'
import { formatBytes } from '../../models/ModelCard'
import { SettingGroup } from '../SettingsPage'
import type { SettingsPanelProps } from '../SettingsPage'

export function StorageTab(_props: SettingsPanelProps) {
  const { t } = useI18n()
  const storage = useStore(stores.settings, (state) => state.storage)
  const busy = useStore(stores.settings, (state) => state.storageBusy)

  const path = storage?.configuredPath || storage?.activePath || ''

  useEffect(() => {
    // A failed refresh is recorded in the store's error field rather than rejected, and a
    // successful one clears that field.
    void actions.settings.refreshStorage().then(() => {
      const failure = stores.settings.getState().error
      if (failure === null) return
      reportSettingsFailure(t('settings.storageRefreshFailed'), failure)
    })
  }, [t])

  // Undefined is "the folder could not be listed", which is a different statement from an empty
  // folder; the main process keeps the two apart for exactly this reason.
  const usedBytes = storage?.usedBytes

  return (
    <div className="settings-panel">
      <SettingGroup legend={t('settings.groupStorage')}>
        <SettingsRow label={t('modelsSettingsUi.dataFolder')} desc={t('modelsSettingsUi.dataFolderDescription')} descriptionTooltip>
          <div className="settings-path-input flex">
            <Input readOnly value={path} aria-label={t('modelsSettingsUi.dataFolder')} className="settings-control-field" />
          </div>
          <Button
            variant="tertiary"
            size="sm"
            disabled={busy}
            onClick={() => {
              void actions.settings
                .chooseStorageDirectory()
                .then((chosen) => {
                  // A cancel in the system dialog comes back as null; that is not an error.
                  if (chosen?.restartRequired) notifyWarning(t('modelsSettingsUi.dataFolderWillMove'))
                })
                .catch(() => undefined)
            }}
          >
            {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
            {t('settings.browse')}
          </Button>
        </SettingsRow>

        <SettingsRow label={t('modelsSettingsUi.storageUsage')}>
          <p className={`nola-body-strong tabular-nums ${usedBytes === undefined ? 'text-muted' : 'text-foreground'}`}>
            {usedBytes === undefined ? t('modelsSettingsUi.storageValueUnavailable') : formatBytes(usedBytes)}
          </p>
        </SettingsRow>
      </SettingGroup>

      {storage?.restartRequired ? (
        <SettingGroup legend={t('settings.groupRestart')}>
          <div className="flex flex-col gap-3 p-4">
            <div role="alert" className="flex items-start gap-3 rounded-nola-ui-lg bg-warning-soft px-4 py-3 text-warning-soft-foreground">
              <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
              <div className="flex min-w-0 flex-col gap-1">
                <p className="nola-body-strong">{t('settings.restartRequired')}</p>
                <p className="nola-caption">{t('errors.storageChangedAction')}</p>
              </div>
            </div>
            <div>
              <Button
                variant="default"
                size="sm"
                disabled={busy}
                onClick={() => {
                  void actions.settings
                    .restartAppForStorage()
                    .then(() => notifySuccess(t('common.done')))
                    .catch(() => undefined)
                }}
              >
                {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
                {t('settings.restartNow')}
              </Button>
            </div>
          </div>
        </SettingGroup>
      ) : null}
    </div>
  )
}

