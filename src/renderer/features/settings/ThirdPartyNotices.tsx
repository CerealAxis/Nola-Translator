import { useState } from 'react'
import { Scale } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogCloseButton, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useI18n } from '@/i18n'

// Vite resolves the `?raw` suffix to the file's text at build time, so the notices travel
// inside the renderer bundle and the dialog has nothing left to load at runtime.
import noticesText from '../../../../THIRD_PARTY_NOTICES.md?raw'

// License files contain indentation that visually centers headings in a preformatted view.
// Strip it only for display, preserving the bundled source, wording and line breaks.
const leftAlignedNotices = noticesText.replace(/^[\t ]+/gm, '')

/**
 * The repository's `THIRD_PARTY_NOTICES.md`, read in the app instead of on GitHub.
 */
export function ThirdPartyNotices() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="tertiary" size="sm" onClick={() => setOpen(true)}>
        <Scale className="size-4" aria-hidden="true" />
        {t('settings.viewNotices')}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="settings-notices-dialog w-[calc(var(--space-8)*11-var(--space-3)*2)] max-w-[calc(100vw-var(--space-3)*2)] overflow-hidden outline-none">
            <DialogCloseButton />
            <DialogHeader className="mb-0">
              <DialogTitle data-slot="dialog-title" className="settings-notices-heading modal__heading">
                {t('settings.noticesTitle')}
              </DialogTitle>
            </DialogHeader>
            <div className="settings-notices-body modal__body nola-scrollbar flex-1 min-h-0 overflow-y-auto overscroll-contain">
              <pre className="settings-notices-text">{leftAlignedNotices}</pre>
            </div>
          </DialogContent>
      </Dialog>
    </>
  )
}
