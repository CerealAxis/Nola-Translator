/**
 * 导出弹窗。记录详情页的"导出"主按钮打开它。
 *
 * **只开放 TXT / SRT / VTT 三种**，不做音频导出、不做"导出原文/译文/笔记"的勾选组合：
 * 引擎的 `meetings.export(id, format)` 只收一个格式参数（见 `src/bridge/contract.ts`），
 * 一次调用产出一个文件。给用户三个复选框再拼一个文件名，是把引擎没有的能力画到界面上。
 *
 * 导出成功或失败都要有说法：
 * - 落盘成功：按钮回到 idle，弹窗关闭（路径由引擎的系统保存对话框负责，界面上重复一遍没有信息增量）
 * - 引擎判定没有可导出内容：留在弹窗内，说明发生了什么并给一个能点的下一步
 * - 通道抛错：留在弹窗内，走 `t('errors.exportFailed')`（带 EXP-009 错误码）
 *
 * **错误三要素**：发生了什么（导出失败）/ 用户能做什么（换个目录再试）/ 可复制错误码。
 * `state.error` 是诊断串，**不渲染**，只给 console。
 */

import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Alert, Button, Modal, ToggleButton, ToggleButtonGroup } from '@heroui/react'
import type { Selection } from '@react-types/shared'

import { useI18n } from '@/i18n'
import { actions, stores, useStore } from '@/store'
import type { ExportFormat } from '@/bridge'

/** 只开放这三种。顺序即界面上的顺序。 */
const FORMATS: readonly ExportFormat[] = ['txt', 'srt', 'vtt']

export interface ExportDialogProps {
  meetingId: string | null
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  /** 导出成功（引擎返回了落盘路径）。 */
  onExported?: (format: ExportFormat) => void
}

export function ExportDialog({
  meetingId,
  isOpen,
  onOpenChange,
  onExported,
}: ExportDialogProps): ReactNode {
  const { t } = useI18n()
  const exporting = useStore(stores.meetings, (state) => state.exporting)
  const error = useStore(stores.meetings, (state) => state.error)

  const [format, setFormat] = useState<ExportFormat>('txt')

  // 打开时回到默认格式并清掉上一次的错误：上一条会议的失败不该挂在这一条上。
  useEffect(() => {
    if (isOpen) {
      setFormat('txt')
      actions.meetings.clearMeetingsError()
    }
  }, [isOpen])

  const submit = useCallback(() => {
    if (meetingId === null) return
    void actions.meetings
      .exportMeeting(meetingId, format)
      .then((path) => {
        // path 为 null 表示用户取消了系统保存对话框，不是失败：安静收尾即可。
        if (path === null) return
        onExported?.(format)
        onOpenChange(false)
      })
      .catch(() => {
        // 错误已写进 store.error，界面用 errorCode 查表显示。
      })
  }, [meetingId, format, onExported, onOpenChange])

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Backdrop>
        <Modal.Container size="sm">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading className="nola-title text-foreground">
                {t('records.exportTitle')}
              </Modal.Heading>
            </Modal.Header>

            <Modal.Body>
              <div className="flex flex-col gap-3">
                <span className="nola-body-strong text-[14px] leading-[1.45] font-semibold text-foreground">
                  {t('records.export')}
                </span>

                <ToggleButtonGroup
                  selectionMode="single"
                  disallowEmptySelection
                  selectedKeys={[format]}
                  onSelectionChange={(keys: Selection) => {
                    const first = keys === 'all' ? null : Array.from(keys)[0] ?? null
                    if (first === null) return
                    const next = String(first) as ExportFormat
                    if (FORMATS.includes(next)) setFormat(next)
                  }}
                  isDisabled={exporting}
                  size="sm"
                  aria-label={t('records.export')}
                >
                  {FORMATS.map((value) => (
                    <ToggleButton
                      key={value}
                      id={value}
                      className="rounded-[10px] text-[12.5px] leading-[1.5] font-normal uppercase"
                    >
                      {value}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>

                {/*
                  导出的是模型生成的译文。AI 声明必须跟着文件走，
                  所以它在弹窗里也写一遍（`legal.aiGeneratedExport`）。
                */}
                <p className="nola-caption text-muted">{t('legal.aiGeneratedExport')}</p>

                {/* state.error 只用来判断"要不要显示错误条"，不把它的内容渲染出去。 */}
                {error !== null ? (
                  <Alert role="alert" status="danger" className="rounded-[8px]">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Description className="text-[12.5px] leading-[1.5]">
                        {t('errors.exportFailed')}
                      </Alert.Description>
                    </Alert.Content>
                  </Alert>
                ) : null}
              </div>
            </Modal.Body>

            <Modal.Footer>
              <Button
                variant="tertiary"
                size="sm"
                className="rounded-[10px]"
                onPress={() => onOpenChange(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                isPending={exporting}
                isDisabled={exporting || meetingId === null}
                className="rounded-[10px]"
                onPress={submit}
              >
                {t('records.exportConfirm')}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}

