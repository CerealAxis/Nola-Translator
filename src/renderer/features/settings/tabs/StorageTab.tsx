/**
 * 存储与下载。保存位置、已占用、改位置后的重启提示。
 *
 * **占用条的分母是"目录里这些模型全装齐共需"，不是磁盘容量。**
 * `ModelStorageInfo` 只有 `{activePath, configuredPath, restartRequired}`，没有
 * `totalBytes`，"容量"这件事契约里根本没有。拿一个编出来的容量当分母，画出来的条是假的；
 * 用模型目录的总需求当分母，用户读到的是真话。见交付报告 Known Gaps。
 */

import { useMemo } from 'react'
import { Alert, Button, InputGroup, Meter, toast } from '@heroui/react'

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
  const resources = useStore(stores.models, (state) => state.resources)

  const { used, total } = useMemo(() => {
    const sum = (pick: (item: (typeof resources)[number]) => number) =>
      resources.reduce((acc, item) => acc + pick(item), 0)
    return {
      used: sum((item) => item.installedBytes),
      total: sum((item) => item.downloadBytes ?? item.installedBytes),
    }
  }, [resources])

  const ratio = total > 0 ? Math.min(1, used / total) : 0
  const path = storage?.configuredPath || storage?.activePath || ''

  return (
    <div className="settings-panel">
      <SettingGroup legend={t('settings.groupStorage')}>
        <SettingsRow label={t('settings.storagePath')}>
          <InputGroup className="w-[200px]">
            <InputGroup.Input readOnly value={path} aria-label={t('settings.storagePath')} />
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
                  // 用户在系统对话框里点了取消时 bridge 返回 null，这不是错误，静默保持原状。
                  if (chosen?.restartRequired) toast.warning(t('settings.restartRequired'))
                })
                .catch(() => toast.danger(t('errors.storageChanged')))
            }}
          >
            {t('settings.browse')}
          </Button>
        </SettingsRow>

        <SettingsRow label={t('modelsSettingsUi.storageUsage')} desc={t('modelsSettingsUi.storageUsageDescription')}>
          <Meter value={ratio} maxValue={1} className="w-[200px]" aria-label={t('modelsSettingsUi.storageUsage')}>
            <Meter.Track>
              <Meter.Fill />
            </Meter.Track>
            <Meter.Output className="tabular">
              {formatBytes(used)} / {formatBytes(total)}
            </Meter.Output>
          </Meter>
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

