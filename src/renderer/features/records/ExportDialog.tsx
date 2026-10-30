/**
 * Export dialog, opened by the primary action on the record detail page.
 *
 * Every outcome says something — success closes and leaves the path to the engine's
 * save dialog, while a thrown channel reports EXP-009 through the shared Toast style.
 */

import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { TabsRoot, TabsList, TabsTrigger } from '@/components/ui'

import { LoaderCircle } from 'lucide-react'

import { useI18n } from '@/i18n'
import { notifyError } from '@/components/primitives/notify'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
      .catch((cause: unknown) => { notifyError(t('errors.exportFailed'), { cause }) })
  }, [meetingId, format, onExported, onOpenChange, t])

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle data-slot="dialog-title">
            {t('records.exportTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-[var(--space-2)]">
          <TabsRoot value={format} onValueChange={value => { if (FORMATS.includes(value as ExportFormat)) setFormat(value as ExportFormat) }}>
            <TabsList className="nola-segmented" aria-label={t('records.export')}>
              {FORMATS.map(value => <TabsTrigger key={value} value={value} disabled={exporting} className="leading-[1.5] uppercase">{value}</TabsTrigger>)}
            </TabsList>
          </TabsRoot>

          {/*
           * The file holds model-generated translation, so the AI notice has to
           * travel with the file and is repeated here.
          */}
          <p className="nola-caption text-muted">{t('legal.aiGeneratedExport')}</p>
        </div>

        <DialogFooter>
          <Button variant="tertiary" size="sm" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" disabled={exporting || meetingId === null} onClick={submit}>
            {exporting ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
            {t('records.exportConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

