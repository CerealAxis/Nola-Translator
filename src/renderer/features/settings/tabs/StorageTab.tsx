/**
 * 存储与下载。数据文件夹、所在卷空余、改位置后的重启提示。
 *
 * **这一行现在是整个数据根，不只是模型。** 设置、密钥、会议记录、模型、运行时都在里面，
 * 所以文案不再叫"保存位置"。用户在系统对话框里选完之后，主进程只写指针和待迁移标记，
 * 一个字节都没搬；真正的搬运发生在下次启动、任何 store 打开句柄之前，理由写在
 * `app-ipc.ts` 那个 handler 的注释里。所以重启提示说的是"数据会搬过去"，不是泛泛的
 * "改完要重启"。
 *
 * **这一行报的是磁盘读数，不是配额。** 以前这里画的是「已安装体积 / 全部目录模型全装齐
 * 共需」——那是模型配额，跟用户真正关心的"这块盘还剩多少"是两件事，契约里当时也没有
 * 容量字段。现在主进程用 `statfs` 量出 `configuredPath` 所在卷的 `freeBytes`，报真读数。
 *
 * **不画进度条。** 模型体积和卷空余没有共同分母，把两者塞进一根条等于宣称"模型占了
 * 整盘的百分之几"，那不是事实；要画条就得先有整盘容量这个分母，而这一行只承诺报
 * 它量得到的那一个数。宁可少画也不要画一个假的分母。
 *
 * 空余必须带卷标（`G:`）：应用数据曾经分散在两个卷上（模型在用户选的保存位置，录制记录
 * 在 Electron 的 `userData`），"空余"两个字不说是哪块盘就有歧义。
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
  // UNC（`\\server\share`）和裸相对路径都没有盘符，切固定长度会切出乱码；匹配不上就不给卷标。
  const volume = /^([a-zA-Z]:)/.exec(path)?.[1] ?? ''

  // 进 tab 重新量一次，别显示启动那一刻的陈旧读数。只读且可重复调用，StrictMode 下跑两次无害，
  // 所以不加去重标记。失败时 store 自己记了 error，这里吞掉 rejection 即可，别抛成全局未处理 promise。
  useEffect(() => {
    void actions.settings.refreshStorage().catch(() => {})
  }, [])

  // 测不到是 undefined 而不是 0——0 会被读成"磁盘满了"，那是另一回事。
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
                  // 用户在系统对话框里点了取消时 bridge 返回 null，这不是错误，静默保持原状。
                  // 选中之后主进程只写指针和待迁移标记，一个字节都没搬：所以这里说的是
                  // "重启后搬"，不是泛泛的"要重启了"。
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

