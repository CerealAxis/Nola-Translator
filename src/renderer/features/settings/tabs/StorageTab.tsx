/**
 * Storage and downloads: data folder, free space on its volume, restart prompt.
 *
 * The folder row is the whole data root — settings, credentials, meetings, models and the
 * runtime all live inside it. Picking a new one writes a pointer plus a pending-migration
 * marker and moves nothing; the move happens on the next launch, before any store opens a
 * handle, so the prompt says the data will move rather than "restart required".
 *
 * The free-space row reports a disk reading, not a quota: the main process probes
 * `configuredPath's volume with `statfs` and sends `freeBytes`.
 *
 * Free space must carry the volume letter (`G:`): without it "free" is ambiguous about which
 * disk is meant.
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
  // A UNC path (`\\server\share`) and a bare relative path have no drive letter, so slicing a
  // fixed prefix off them would leave mojibake; when none matches, no volume label is shown.
  const volume = /^([a-zA-Z]:)/.exec(path)?.[1] ?? ''

  useEffect(() => {
    void actions.settings.refreshStorage().catch(() => {})
  }, [])

  // An unmeasurable volume is undefined rather than 0, which would read as "disk full".
  const freeBytes = storage?.freeBytes

  const freeLabel = volume ? `${volume} ${t('modelsSettingsUi.storageFree')}` : t('modelsSettingsUi.storageFree')

  return (
    <div className="settings-panel">
      <SettingGroup legend={t('settings.groupStorage')}>
        <SettingsRow label={t('modelsSettingsUi.dataFolder')} desc={t('modelsSettingsUi.dataFolderDescription')}>
          <InputGroup className="w-[200px]">
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

        <SettingsRow label={t('modelsSettingsUi.storageUsage')} desc={t('modelsSettingsUi.storageUsageDescription')}>
          <dl className="flex w-[200px] flex-col gap-1" aria-label={t('modelsSettingsUi.storageUsage')}>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="nola-caption truncate text-muted">{freeLabel}</dt>
              <dd className={`nola-body-strong tabular-nums ${freeBytes === undefined ? 'text-muted' : 'text-foreground'}`}>
                {freeBytes === undefined ? t('modelsSettingsUi.storageValueUnavailable') : formatBytes(freeBytes)}
              </dd>
            </div>
          </dl>
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

