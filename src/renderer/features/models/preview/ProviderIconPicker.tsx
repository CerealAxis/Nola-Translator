import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Globe, Route } from 'lucide-react'
import type OpenAI from '@lobehub/icons/es/OpenAI/components/Mono'
import { COLOR_PRIMARY as groqColor } from '@lobehub/icons/es/Groq/style'
import myMemoryIcon from '@/assets/mymemory.svg'
import { toc } from '@lobehub/icons/es/toc'
import { Button } from '@/components/ui/button'
import { Dialog, DialogCloseButton, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/i18n'
import { useCloudPreviewCopy } from './cloud-preview-copy'
import { templates, type Service } from './cloud-preview-data'

const defaultIcons: Partial<Record<Service, string>> = {
  aliyun: 'Alibaba', minimax: 'Minimax', index: 'Bilibili', microsoft: 'Microsoft',
  google: 'Google', ollama: 'Ollama',
}

const iconRoot = '../../../../../node_modules/@lobehub/icons/es'
const iconModules = import.meta.glob<{ default: typeof OpenAI }>(
  '../../../../../node_modules/@lobehub/icons/es/*/components/{Color,Mono}.js',
  { exhaustive: true },
)
const catalog = toc.flatMap(({ id, title, fullTitle, docsUrl }) => {
  const folder = `${iconRoot}/${id}/components`
  const mono = iconModules[`${folder}/Mono.js`]
  const color = iconModules[`${folder}/Color.js`]
  // Kimi's color asset draws the letter in white directly on a transparent background.
  const load = id === 'Kimi' ? mono ?? color : color ?? mono
  return load ? [{ id, title, search: [id, title, fullTitle, docsUrl].join(' ').toLowerCase(), Mark: lazy(load) }] : []
})
const iconsById = new Map(catalog.map(entry => [entry.id, entry]))
const pageSize = 42

export type ProviderIconId = string

function CatalogIcon({ entry: { id, Mark }, className = '' }: { entry: typeof catalog[number]; className?: string }) {
  return <Suspense fallback={<span aria-hidden="true" className={`provider-icon-placeholder inline-block ${className}`} />}>
    <Mark className={className} color={id === 'Groq' ? groqColor : undefined} aria-hidden="true" />
  </Suspense>
}

export function CloudMark({ service, icon, className }: { service: Service; icon?: ProviderIconId; className?: string }) {
  const preferred = templates[service].icon ?? defaultIcons[service]
  const entry = (icon && iconsById.get(icon)) || (preferred && iconsById.get(preferred))
  if (entry) return <CatalogIcon entry={entry} className={className} />
  if (service === 'mymemory') return <img src={myMemoryIcon} className={`provider-icon-image ${className ?? ''}`} width={20} height={20} alt="" />
  const Mark = service === 'mirarouter' || service === 'ssycloud' ? Route : Globe
  return <Mark className={className} aria-hidden="true" />
}

export function ProviderIconPicker({ service, icon, disabled, onChange }: {
  service: Service
  icon?: ProviderIconId
  disabled?: boolean
  onChange: (icon?: ProviderIconId) => void
}) {
  const { t } = useI18n()
  const copy = useCloudPreviewCopy()
  const searchInput = useRef<HTMLInputElement>(null)
  const grid = useRef<HTMLDivElement>(null)
  const [pageEnd, setPageEnd] = useState<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(icon)
  const [visibleCount, setVisibleCount] = useState(pageSize)
  const query = search.trim().toLowerCase()
  const entries = query ? catalog.filter(entry => entry.search.includes(query)) : catalog
  const hasMore = visibleCount < entries.length

  useEffect(() => {
    if (!open || !hasMore || !pageEnd || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setVisibleCount(count => count === visibleCount ? Math.min(count + pageSize, entries.length) : count)
      }
    }, { root: pageEnd.parentElement, rootMargin: '0px 0px 96px' })
    observer.observe(pageEnd)
    return () => observer.disconnect()
  }, [open, hasMore, pageEnd, visibleCount, entries.length, query])

  function changeOpen(next: boolean) {
    if (next) {
      setSearch('')
      setSelected(icon)
      setVisibleCount(pageSize)
    }
    setOpen(next)
  }

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger disabled={disabled} render={<Button variant="bare" size="icon-sm" type="button"
      aria-label={copy('changeIcon')} tooltip={copy('changeIcon')} className="provider-icon-trigger" />}>
      <CloudMark service={service} icon={icon} className="size-[var(--text-h4)]" />
    </DialogTrigger>
    <DialogContent className="provider-icon-picker" initialFocus={searchInput}>
      <DialogHeader><DialogTitle>{copy('changeIcon')}</DialogTitle></DialogHeader>
      <DialogCloseButton />
      <Input ref={searchInput} type="search" aria-label={copy('searchIcons')} placeholder={copy('iconNamePlaceholder')}
        value={search} onValueChange={value => {
          setSearch(value)
          setVisibleCount(pageSize)
          if (grid.current) grid.current.scrollTop = 0
        }} />
      <div ref={grid} className="provider-icon-picker__grid" onScroll={event => {
        const { scrollHeight, scrollTop, clientHeight } = event.currentTarget
        if (hasMore && scrollHeight - scrollTop - clientHeight <= 96) {
          setVisibleCount(count => count === visibleCount ? Math.min(count + pageSize, entries.length) : count)
        }
      }}>
        {entries.slice(0, visibleCount).map(entry => <Button key={entry.id} className="provider-icon-picker__option" variant="bare" type="button"
          aria-pressed={selected === entry.id} onClick={() => setSelected(entry.id)}>
          <CatalogIcon entry={entry} className="size-[var(--leading-h4)]" />
          <span>{entry.title}</span>
        </Button>)}
        {hasMore && <div ref={setPageEnd} className="provider-icon-picker__grid-end" aria-hidden="true" />}
        {!entries.length && <p role="status" className="type-muted">{t('models.noResults')}</p>}
      </div>
      <div className="provider-icon-picker__actions">
        {selected !== undefined && <Button variant="bare" type="button" onClick={() => setSelected(undefined)}>{copy('defaultIcon')}</Button>}
        <Button variant="secondary" type="button" onClick={() => { onChange(selected); setOpen(false) }}>{t('common.done')}</Button>
      </div>
    </DialogContent>
  </Dialog>
}
