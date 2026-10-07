import { useState } from 'react'
import { Button, Modal } from '@heroui/react'
import { Scale } from 'lucide-react'

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
      <Button variant="tertiary" size="sm" className="rounded-[6px]" onPress={() => setOpen(true)}>
        <Scale className="size-4" aria-hidden="true" />
        {t('settings.viewNotices')}
      </Button>

      <Modal isOpen={open} onOpenChange={setOpen}>
        <Modal.Backdrop className="settings-notices-backdrop z-overlay">
          <Modal.Container size="lg" scroll="inside" className="settings-notices-container">
            <Modal.Dialog className="settings-notices-dialog">
              <Modal.Header>
                <Modal.Heading className="settings-notices-heading">
                  {t('settings.noticesTitle')}
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body className="settings-notices-body nola-scrollbar">
                <pre className="settings-notices-text">{leftAlignedNotices}</pre>
              </Modal.Body>
              <Modal.Footer className="settings-notices-footer">
                <Button variant="ghost" size="sm" className="settings-notices-close" onPress={() => setOpen(false)}>
                  {t('common.close')}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </>
  )
}
