import { useState } from 'react'
import { useI18n } from '@/i18n'
import { CardContent } from '@/components/ui/card'
import { Upload } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { notifyError } from '@/components/primitives/notify'
import { PageHeader } from '@/components/primitives/PageHeader'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { getBridge } from '@/store'
import { ComicTranslationPage } from './ComicTranslationPage'
import { ComicTranslationWorkspace } from './ComicTranslationWorkspace'
import {
  chooseComicFiles,
  importComicFiles,
  openQuickComic,
} from './comic-data'
import { useComicPrototypeText } from './comic-prototype-copy'
import { comicErrorMessage } from './comic-errors'

export function ComicFrontendPage({
  projectId,
  pageId,
  reader = false,
}: {
  projectId?: string
  pageId?: string
  reader?: boolean
}) {
  const { t } = useI18n(),
    p = useComicPrototypeText()
  const [quickOpen, setQuickOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [importing, setImporting] = useState(false)
  if (!getBridge()?.comic) {
    return (
      <section className="comic-page">
        <PageHeader
          title={t('suite.comicTitle')}
          subtitle={t('offline.unavailable')}
        />
      </section>
    )
  }
  const importQuick = async (files: File[]) => {
    if (!files.length || importing) return
    setImporting(true)
    try {
      const quick = await openQuickComic()
      const book = await importComicFiles(files, { projectId: quick.id })
      if (book) {
        const imported = book.pages[quick.pages.length]
        if (imported)
          localStorage.setItem(
            `nola-comic-current-page:${book.id}`,
            imported.id,
          )
        setQuickOpen(false)
        location.hash = `/comic-translation/${book.id}`
      }
    } catch (error) {
      notifyError(comicErrorMessage(error, p) || t('suite.actionFailed'), {
        cause: error,
      })
    } finally {
      setImporting(false)
      setDragging(false)
    }
  }
  return (
    <>
      {projectId && !reader ? (
        <ComicTranslationWorkspace
          key={projectId}
          projectId={projectId}
          pageId={pageId}
          onBook={() => {
            location.hash = `/comic-translation/${encodeURIComponent(projectId)}/reader`
          }}
        />
      ) : (
        <ComicTranslationPage
          projectId={projectId}
          pageId={pageId}
          reader={reader}
          onQuick={() => setQuickOpen(true)}
        />
      )}
      <Dialog
        open={quickOpen}
        onOpenChange={(open) => {
          if (!importing) {
            setQuickOpen(open)
            setDragging(false)
          }
        }}
      >
        <DialogContent className="comic-quick-dialog">
          <DialogTitle className="sr-only">{p('preview')}</DialogTitle>
          <CardContent>
            <button
              type="button"
              className="comic-quick-upload"
              data-dragging={dragging || undefined}
              disabled={importing}
              aria-busy={importing || undefined}
              onClick={() => {
                void chooseComicFiles()
                  .then(importQuick)
                  .catch((error) =>
                    notifyError(t('suite.actionFailed'), { cause: error }),
                  )
              }}
              onDragOver={(event) => {
                if (event.dataTransfer.types.includes('Files')) {
                  event.preventDefault()
                  setDragging(true)
                  event.dataTransfer.dropEffect = 'copy'
                }
              }}
              onDragLeave={(event) => {
                if (
                  !(event.relatedTarget instanceof Node) ||
                  !event.currentTarget.contains(event.relatedTarget)
                )
                  setDragging(false)
              }}
              onDrop={(event) => {
                event.preventDefault()
                setDragging(false)
                void importQuick(Array.from(event.dataTransfer.files))
              }}
            >
              {importing ? <Spinner aria-hidden="true" /> : <Upload aria-hidden="true" />}
              <span>{importing ? t('common.loading') : p('quickEmpty')}</span>
            </button>
          </CardContent>
        </DialogContent>
      </Dialog>
    </>
  )
}
