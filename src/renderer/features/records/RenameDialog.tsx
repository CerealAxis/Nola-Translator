/**
 * 重命名弹窗。记录列表与记录详情共用。
 *
 * 弹窗标题就是"重命名"，所以字段**不再重复一个可见 Label**；无障碍名称改挂
 * `aria-label`，读屏用户仍能听到这个输入框是干什么的。FieldError 仍然不渲染
 * （原因见 JSX 里的注释）。字数上限 120，超出部分直接截断而不是给一条错误：
 * 会议名本来就是一行标题，给"太长了"弹红字是把它当表单校验，而它其实是个名字。
 *
 * 破坏性操作一律 AlertDialog，`window.confirm` 禁用。
 */

import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertDialog, Button, Input, TextField } from '@heroui/react'

import { useI18n } from '@/i18n'
import { actions } from '@/store'

/** 会议名上限。引擎落盘的字段同样有长度限制，超了会被截。 */
export const TITLE_MAX_LENGTH = 120

export interface RenameDialogProps {
  /** null 表示关闭。 */
  meetingId: string | null
  /** 打开时的初值。 */
  initialTitle?: string
  onClose: () => void
}

export function RenameDialog({ meetingId, initialTitle = '', onClose }: RenameDialogProps): ReactNode {
  const { t } = useI18n()
  const [title, setTitle] = useState(initialTitle)
  const [pending, setPending] = useState(false)

  // 每次打开重置：上一条会议的名字不能漏到下一条。
  useEffect(() => {
    setTitle(initialTitle)
  }, [initialTitle, meetingId])

  const empty = title.trim().length === 0

  const submit = useCallback(() => {
    if (meetingId === null) return
    if (empty) return
    setPending(true)
    void actions.meetings
      .renameMeeting(meetingId, title)
      .catch(() => {
        // 失败已经写进 store.error；界面按 errorCode 显示，不在这里渲染诊断串。
      })
      .finally(() => {
        setPending(false)
        onClose()
      })
  }, [meetingId, title, empty, onClose])

  return (
    <AlertDialog
      isOpen={meetingId !== null}
      onOpenChange={(open: boolean) => {
        if (!open) onClose()
      }}
    >
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              {/* `nola-title` = 600 15px，是本项目的弹窗标题档（其余弹窗都挂它）。 */}
              <AlertDialog.Heading className="nola-title text-foreground">
                {t('records.renameTitle')}
              </AlertDialog.Heading>
            </AlertDialog.Header>

            <AlertDialog.Body>
              <TextField
                value={title}
                isDisabled={pending}
                onChange={setTitle}
                className="flex flex-col gap-2"
              >
                {/*
                  可见的 Label 已按要求删掉：弹窗标题就是"重命名"，字段用途不需要
                  再复述一遍。但**无障碍名称不能跟着一起删** —— 屏幕上没有任何文字
                  说明这里要填什么，读屏用户会只听到一个空输入框。所以同一个
                  `renameLabel` 文案改挂到 `aria-label` 上：看不见，但读得出来。
                */}
                <Input
                  aria-label={t('records.renameLabel')}
                  maxLength={TITLE_MAX_LENGTH}
                  onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
                    if (event.key === 'Enter') submit()
                  }}
                />
                {/*
                  这里刻意**不渲染 FieldError**：空名字的提示文案在词典里没有对应的 key，
                  而 `src/i18n/**` 不属于本次交付范围，不能就地加一条。
                  把 label 原样当错误文案是更糟的 copy（说明在复述 label）。
                  空名字的拦截靠确认按钮 disabled 表达，用户按不下去就是反馈。
                  需要补的话：i18n 加 `records.renameRequired`，见交付报告。
                */}
              </TextField>
            </AlertDialog.Body>

            <AlertDialog.Footer>
              <Button
                variant="tertiary"
                size="sm"
                className="rounded-[10px]"
                onPress={onClose}
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                isPending={pending}
                isDisabled={empty}
                className="rounded-[10px]"
                onPress={submit}
              >
                {t('common.confirm')}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  )
}

