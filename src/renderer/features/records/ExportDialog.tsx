/**
 * Export dialog, opened by the primary action on the record detail page.
 *
 * Every outcome says something — success closes and leaves the path to the engine's
 * save dialog, while a thrown channel stays in the dialog on `t('errors.exportFailed')`,
 * which carries EXP-009.
 */

import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Alert, Button, Modal, ToggleButton, ToggleButtonGroup } from '@heroui/react'
import type { Selection } from '@react-types/shared'

import { useI18n } from '@/i18n'
import { actions, stores, useStore } from '@/store'
import type { ExportFormat } from '@/bridge'

/** The only formats offered, in display order. */
const FORMATS: readonly ExportFormat[] = ['txt', 'srt', 'vtt']

export interface ExportDialogProps {
  meetingId: string | null
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  /** Export finished; the engine returned the path it wrote. */
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

  // Opening resets the format and clears the last error, which belonged to another meeting.
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
        // A null path means the user dismissed the save dialog, not a failure: end quietly.
        if (path === null) return
        onExported?.(format)
        onOpenChange(false)
      })
      .catch(() => {
        // The error is already in store.error; the UI looks it up by errorCode.
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
                 * The file holds model-generated translation, so the AI notice has to
                 * travel with the file and is repeated here.
                */}
                <p className="nola-caption text-muted">{t('legal.aiGeneratedExport')}</p>

                {/* state.error only decides whether to show the bar; its text is never rendered. */}
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

