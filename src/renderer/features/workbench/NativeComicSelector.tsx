import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { ComposerMenuItem, ComposerModelTrigger } from '@/components/assistant-ui/native/composer'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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
  const select = (projectId: string | null) => { onChange(projectId); setOpen(false) }
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger render={<ComposerModelTrigger model={value ? books?.find(book => book.id === value)?.title ?? t('suite.comicContext') : t('suite.noComicContext')} open={open} disabled={disabled && !value} aria-label={t('suite.comicContext')} />} />
    <PopoverContent side="top" align="start" className="max-h-80 max-w-[calc(100vw-1rem)] gap-0.5 overflow-y-auto p-1.5">
      <ComposerMenuItem className="nola-menu-item data-[selected=true]:bg-[var(--accent-soft)] data-[selected=true]:text-primary" data-selected={!value || undefined} aria-pressed={!value} onClick={() => select(null)}><span className="flex-1 text-start">{t('suite.noComicContext')}</span>{!value && <Check className="size-3.5" aria-hidden="true" />}</ComposerMenuItem>
      {failed ? <ComposerMenuItem className="nola-menu-item" onClick={() => setAttempt(value => value + 1)}>{t('suite.retry')}</ComposerMenuItem> : !books ? <p className="px-2.5 py-2 text-sm text-muted-foreground">{t('common.loading')}</p> : !books.length ? <p className="px-2.5 py-2 text-sm text-muted-foreground">{t('suite.emptyBookshelf')}</p> : books.map(book => <ComposerMenuItem className="nola-menu-item data-[selected=true]:bg-[var(--accent-soft)] data-[selected=true]:text-primary" data-selected={value === book.id || undefined} aria-pressed={value === book.id} key={book.id} disabled={disabled} onClick={() => select(book.id)}><span className="flex-1 text-start">{book.title}</span><span className="text-xs text-muted-foreground tabular-nums">{t('suite.pages', { count: book.pageCount })}</span>{value === book.id && <Check className="size-3.5" aria-hidden="true" />}</ComposerMenuItem>)}
    </PopoverContent>
  </Popover>
}
