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
import { Alert, Button, InputGroup, toast } from '@heroui/react'

import { SettingsRow } from '../SettingsRow'
import { useI18n } from '@/i18n'
import { actions, stores, useStore } from '@/store'
import { formatBytes } from '../../models/ModelCard'
import { SettingGroup } from '../SettingsPage'
import type { SettingsPanelProps } from '../SettingsPage'

export function StorageTab(_props: SettingsPanelProps) {
  const { t } = useI18n()
  const storage = useStore(stores.settings, (state) => state.storage)
  const busy = useStore(stores.settings, (state) => state.storageBusy)

  const path = storage?.configuredPath || storage?.activePath || ''

  useEffect(() => {
    void actions.settings.refreshStorage().catch(() => {})
  }, [])

  // Undefined is "the folder could not be listed", which is a different statement from an empty
  // folder; the main process keeps the two apart for exactly this reason.
  const usedBytes = storage?.usedBytes

  return (
    <div className="settings-panel">
      <SettingGroup legend={t('settings.groupStorage')}>
        <SettingsRow label={t('modelsSettingsUi.dataFolder')} desc={t('modelsSettingsUi.dataFolderDescription')} descriptionTooltip>
          <InputGroup className="settings-path-input">
            <InputGroup.Input readOnly value={path} aria-label={t('modelsSettingsUi.dataFolder')} />
          </InputGroup>
          <Button
            variant="tertiary"
            size="sm"
            className="rounded-[6px]"
            isPending={busy}
            onPress={() => {
              void actions.settings
                .chooseStorageDirectory()
                .then((chosen) => {
                  // A cancel in the system dialog comes back as null; that is not an error.
                  if (chosen?.restartRequired) toast.warning(t('modelsSettingsUi.dataFolderWillMove'))
                })
                .catch(() => toast.danger(t('errors.storageChanged')))
            }}
          >
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
            <Alert status="warning">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title className="nola-body-strong">{t('settings.restartRequired')}</Alert.Title>
                <Alert.Description className="nola-caption">{t('errors.storageChangedAction')}</Alert.Description>
              </Alert.Content>
            </Alert>
            <div>
              <Button
                variant="primary"
                size="sm"
                className="rounded-full"
                isPending={busy}
                onPress={() => {
                  void actions.settings
                    .restartAppForStorage()
                    .then(() => toast.success(t('common.done')))
                    .catch(() => toast.danger(t('errors.storageChanged')))
                }}
              >
                {t('settings.restartNow')}
              </Button>
            </div>
          </div>
        </SettingGroup>
      ) : null}
    </div>
  )
}

