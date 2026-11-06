import { useEffect, useState } from 'react'
import { BookOpen } from 'lucide-react'
import { ComposerMenu, ComposerMenuItem, ComposerModelItem, ComposerModelTrigger } from '@/components/assistant-ui/native/composer'
import { getBridge } from '@/store'
import { useI18n } from '@/i18n'
import type { ComicProjectSummary } from '../../../shared/comic'

export function NativeComicSelector({ value, disabled, onChange }: { value: string | null; disabled: boolean; onChange: (projectId: string | null) => void }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [books, setBooks] = useState<ComicProjectSummary[]>()
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!open) return
    let live = true
    const list = getBridge()?.app.listComics
    setBooks(undefined); setFailed(false)
    if (!list) { setFailed(true); return }
    void list().then(value => { if (live) setBooks(value) }).catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [open, attempt])
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => { if (!(event.target instanceof Element) || !event.target.closest('[data-comic-selector]')) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', close, true); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', close, true); document.removeEventListener('keydown', escape) }
  }, [open])
  const select = (projectId: string | null) => { onChange(projectId); setOpen(false) }
  return <div data-comic-selector>
    <ComposerModelTrigger data-menu-anchor="comic" model={value ? books?.find(book => book.id === value)?.title ?? t('suite.comicContext') : t('suite.noComicContext')} open={open} disabled={disabled && !value} aria-label={t('suite.comicContext')} onClick={() => setOpen(value => !value)} />
    {open && <ComposerMenu open anchor="comic" className="max-h-80 overflow-y-auto">
      <p className="px-2.5 py-2 text-xs text-muted-foreground"><BookOpen className="mr-1 inline size-3" aria-hidden="true" />{t('suite.comicContext')}</p>
      <ComposerMenuItem active={!value} onClick={() => select(null)}>{t('suite.noComicContext')}</ComposerMenuItem>
      {failed ? <ComposerMenuItem onClick={() => setAttempt(value => value + 1)}>{t('suite.retry')}</ComposerMenuItem> : !books ? <p className="px-2.5 py-2 text-sm text-muted-foreground">{t('common.loading')}</p> : !books.length ? <p className="px-2.5 py-2 text-sm text-muted-foreground">{t('suite.emptyBookshelf')}</p> : books.map(book => <ComposerModelItem key={book.id} entry={{ name: book.title, meta: t('suite.pages', { count: book.pageCount }) }} selected={value === book.id} disabled={disabled} onClick={() => select(book.id)} />)}
    </ComposerMenu>}
  </div>
}
