import './csp'
import { Component, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft, ChevronLeft, ChevronRight, Download, FileText, Languages, PanelLeft, PanelRight, Pause, Upload, ZoomIn, ZoomOut } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button, buttonVariants } from '../../src/renderer/components/ui/button'
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from '../../src/renderer/components/ui/empty'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '../../src/renderer/components/ui/dialog'
import { showToast, ToastProvider } from '../../src/renderer/components/ui/toast'
import { ChoiceField } from './components/ChoiceField'
import { languageOptions, usePreferences } from './settings-fields'
import { DEFAULT_PROVIDERS, loadProviders, requestProviderAccess, visibleProviderConnections } from './providers'
import { translate, translateImage } from './provider-client'
import { browserText, errorKey } from './i18n'
import { glossaryChunks } from './glossary-translation'
import { captureDiagnostics, recordDiagnostic } from './diagnostics'
import { documentFormats, openDocument, type DocumentSection, type DocumentUnit, type DocumentValues, type OpenDocument } from './document-formats'
import './styles.css'

captureDiagnostics('document')
const emptyValues: DocumentValues = new Map()
const accept = [...documentFormats, 'htm', 'markdown'].map(ext => '.' + ext).join(',')
const formatLabel = 'PDF · EPUB · DOCX · HTML · TXT · Markdown · XLSX · PPTX'
class DocumentErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error) { recordDiagnostic('document', error, 'error') }
  render() {
    if (!this.state.failed) return this.props.children
    const t = browserText('auto')
    return <main className="nola-doc-workbench"><div className="nola-doc-import">
      <Empty><EmptyHeader><EmptyTitle>{t('documentTranslation')}</EmptyTitle><p>{t('internalError')}</p></EmptyHeader>
        <EmptyContent><Button onClick={() => this.setState({ failed: false })}>{t('documentChoose')}</Button></EmptyContent>
      </Empty>
    </div></main>
  }
}
const viewerLabels = {
  en: ['Previous page', 'Next page', 'Zoom out', 'Zoom in', 'Page'],
  'zh-CN': ['上一页', '下一页', '缩小', '放大', '页'],
  'zh-TW': ['上一頁', '下一頁', '縮小', '放大', '頁'],
  'zh-HK': ['上一頁', '下一頁', '縮小', '放大', '頁'],
  ja: ['前のページ', '次のページ', '縮小', '拡大', 'ページ'],
  ko: ['이전 페이지', '다음 페이지', '축소', '확대', '페이지'],
} as const

function PdfPage({ page, label, values, signature, onError }: { page: NonNullable<DocumentSection['page']>; label: string; values?: DocumentValues; signature?: string; onError(): void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const holder = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const errorHandler = useRef(onError)
  useEffect(() => { errorHandler.current = onError }, [onError])
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) setVisible(true)
    }, { rootMargin: '500px' })
    observer.observe(holder.current!)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!visible) return
    const task = values && page.renderTranslated ? page.renderTranslated(canvas.current!, values, 1.65) : page.render(canvas.current!, 1.65)
    let cancelled = false
    void task.promise.catch(() => { if (!cancelled) errorHandler.current() })
    return () => { cancelled = true; task.cancel() }
  }, [page, visible, signature])
  return <div ref={holder} className="nola-doc-pdf" style={{ aspectRatio: page.width / page.height }}>
    {visible && <canvas key={signature} className="nola-doc-pdf" ref={canvas} role="img" aria-label={label} />}
  </div>
}

async function translateUnit(unit: DocumentUnit, source: string, target: string, provider: string, signal: AbortSignal) {
  if (unit.image) {
    const image = await unit.image()
    signal.throwIfAborted()
    return translateImage(image, target, signal)
  }
  const output: string[] = []
  for (const text of glossaryChunks(unit.source, [], 12000)) {
    if (text.trim()) output.push(await translate(text, source, target, 'document', signal, provider))
  }
  return output.join(' ')
}

export function DocumentWorkbench() {
  const [settings, locale, t] = usePreferences()
  const [providers, setProviders] = useState(DEFAULT_PROVIDERS)
  const [provider, setProvider] = useState('index-translate')
  const [sourceChoice, setSource] = useState<string>()
  const [targetChoice, setTarget] = useState<string>()
  const [pendingLanguage, setPendingLanguage] = useState<{ kind: 'source' | 'target'; value: string }>()
  const source = sourceChoice ?? settings.sourceLanguage, target = targetChoice ?? settings.pageLanguage
  const [opened, setOpened] = useState<{ file: File; doc: OpenDocument }>()
  const [values, setValues] = useState<DocumentValues>(emptyValues)
  const [failed, setFailed] = useState(0)
  const [busy, setBusy] = useState<'opening' | 'exporting'>()
  const [running, setRunning] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [original, setOriginal] = useState(true)
  const [translation, setTranslation] = useState(true)
  const [split, setSplit] = useState(50)
  const [resizing, setResizing] = useState(false)
  const [currentPage, setCurrentPage] = useState(0)
  const [zoom, setZoom] = useState(100)
  const request = useRef<AbortController>(null)
  const picker = useRef<HTMLInputElement>(null)
  const compare = useRef<HTMLDivElement>(null)
  const live = useRef(true)
  const left = useRef<HTMLDivElement>(null)
  const right = useRef<HTMLDivElement>(null)
  const scrollTarget = useRef<HTMLElement | null>(null)
  const sectionIndex = useRef(0)
  const [translatedTo, setTranslatedTo] = useState<string>()
  const units = useMemo(() => [...new Map(opened?.doc.sections.flatMap(section => section.units.map(unit => [unit.id, unit] as const)) ?? []).values()], [opened])
  const options = useMemo(() => languageOptions(locale), [locale])
  const serviceOptions = visibleProviderConnections(providers, provider).filter(item => item.capabilities.includes('mt'))
  const scans = units.some(unit => unit.image)
  const both = original && translation
  const complete = units.length > 0 && values.size === units.length

  useEffect(() => {
    live.current = true
    void loadProviders().then(value => { if (live.current) setProviders(value) }).catch(() => {})
    return () => { live.current = false; request.current?.abort() }
  }, [])
  useEffect(() => () => opened?.doc.dispose(), [opened])
  useEffect(() => { document.title = `${t('documentTranslation')} · Nola Translator` }, [t])
  useEffect(() => {
    const panes = [left.current, right.current].filter((pane): pane is HTMLDivElement => Boolean(pane))
    const wheel = (event: WheelEvent) => {
      const pane = event.currentTarget as HTMLDivElement
      const top = compare.current?.getBoundingClientRect().top ?? 0
      if (event.deltaY > 0 && top > 0 || event.deltaY < 0 && pane.scrollTop <= 0 && window.scrollY > 0) {
        event.preventDefault()
        window.scrollBy({ top: event.deltaY })
      }
    }
    panes.forEach(pane => pane.addEventListener('wheel', wheel, { passive: false }))
    return () => panes.forEach(pane => pane.removeEventListener('wheel', wheel))
  }, [opened, original, translation])

  const report = (error: unknown, fallback: Parameters<typeof t>[0]) => {
    recordDiagnostic('document', error ?? new Error(String(fallback)))
    const key = errorKey(error instanceof Error ? error.message : '')
    showToast({ type: 'error', description: t(key.startsWith('unknown:') ? fallback : key) })
  }
  function applyLanguage(kind: 'source' | 'target', value: string) {
    request.current?.abort()
    if (kind === 'source') setSource(value)
    else setTarget(value)
    setValues(emptyValues)
    setFailed(0)
    setTranslatedTo(undefined)
    setPendingLanguage(undefined)
  }
  function changeLanguage(kind: 'source' | 'target', value: string) {
    if (value === (kind === 'source' ? source : target)) return
    if (values.size || request.current) {
      request.current?.abort()
      setPendingLanguage({ kind, value })
    } else applyLanguage(kind, value)
  }
  async function open(file: File) {
    if (busy || running) return
    setBusy('opening')
    try {
      const doc = await openDocument(file)
      if (!live.current) { doc.dispose(); return }
      setOpened({ file, doc })
      setValues(emptyValues)
      setFailed(0)
      setTranslatedTo(undefined)
      sectionIndex.current = 0
      setCurrentPage(0)
      setZoom(100)
      setOriginal(true)
      setTranslation(true)
      setSplit(50)
      if (!doc.sections.some(section => section.units.length)) showToast({ type: 'error', description: t('documentNoText') })
    } catch (error) { report(error, 'documentInvalid') }
    finally { if (live.current) setBusy(undefined) }
  }
  async function start() {
    const connection = providers.find(item => item.id === provider)
    if (!opened || !connection || request.current) return
    const controller = new AbortController()
    request.current = controller
    const { signal } = controller
    setRunning(true)
    setFailed(0)
    let failures = 0
    let firstError: unknown
    try {
      if (!await requestProviderAccess(connection)) throw new Error('providerPermission')
      signal.throwIfAborted()
      setTranslatedTo(target)
      const pending = new Map(units.filter(unit => !values.has(unit.id)).map(unit => [unit.id, unit]))
      const take = () => {
        const visible = opened.doc.sections[sectionIndex.current]?.units.find(unit => pending.has(unit.id))
        const unit = visible ?? pending.values().next().value
        if (unit) pending.delete(unit.id)
        return unit
      }
      await Promise.all(Array.from({ length: 3 }, async () => {
        for (let unit = take(); unit && !signal.aborted; unit = take()) {
          try {
            const text = await translateUnit(unit, source, target, provider, signal)
            const id = unit.id
            if (!signal.aborted) setValues(previous => new Map(previous).set(id, text))
          } catch (error) {
            if (signal.aborted) return
            firstError ??= error
            failures++
            if (failures === 3) controller.abort()
          }
        }
      }))
      if (failures) { setFailed(failures); report(firstError, 'providerRequestFailed') }
    } catch (error) { if (!signal.aborted) report(error, 'providerRequestFailed') }
    finally {
      request.current = null
      if (live.current) setRunning(false)
    }
  }
  async function download() {
    if (!opened || values.size !== units.length || busy || running) return
    setBusy('exporting')
    try {
      const data = await opened.doc.export(values, translatedTo ?? target)
      const url = URL.createObjectURL(data)
      const link = document.createElement('a')
      link.href = url
      link.download = opened.file.name.replace(/\.[^.]+$/, '') + '.' + (translatedTo ?? target) + '.' + opened.doc.format
      document.body.append(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
    } catch (error) { report(error, 'documentExportFailed') }
    finally { if (live.current) setBusy(undefined) }
  }
  function sync(from: HTMLDivElement, to: HTMLDivElement | null) {
    if (scrollTarget.current === from) { scrollTarget.current = null; return }
    const sections = Array.from(from.querySelectorAll<HTMLElement>('[data-section]'))
    const maxScroll = from.scrollHeight - from.clientHeight
    const current = maxScroll > 0 && from.scrollTop >= maxScroll - 2
      ? sections.at(-1)
      : sections.slice().reverse().find(item => item.offsetTop <= from.scrollTop + from.clientHeight / 3) ?? sections[0]
    if (current) {
      sectionIndex.current = Number(current.dataset.section)
      setCurrentPage(sectionIndex.current)
    }
    if (!to || !both) return
    const peer = current && to.querySelector<HTMLElement>(`[data-section="${current.dataset.section}"]`)
    const fraction = current ? Math.max(0, Math.min(1, (from.scrollTop - current.offsetTop) / Math.max(1, current.offsetHeight))) : 0
    const next = Math.max(0, Math.min(to.scrollHeight - to.clientHeight, peer ? peer.offsetTop + fraction * peer.offsetHeight : 0))
    if (Math.abs(to.scrollTop - next) < 1) return
    scrollTarget.current = to
    to.scrollTop = next
  }
  const changeSplit = (value: number) => setSplit(Math.max(20, Math.min(80, Math.round(value))))
  function goToPage(page: number) {
    if (!opened) return
    const next = Math.max(0, Math.min(opened.doc.sections.length - 1, page))
    sectionIndex.current = next
    setCurrentPage(next)
    const pane = left.current ?? right.current
    const item = pane?.querySelector<HTMLElement>(`[data-section="${next}"]`)
    if (pane && item) pane.scrollTop = next === 0 ? 0 : item.offsetTop
  }
  const [previousLabel, nextLabel, zoomOutLabel, zoomInLabel, pageLabel] = viewerLabels[locale]
  const preview = (side: 'source' | 'target') => {
    if (!opened) return null
    const isSource = side === 'source'
    const label = t(isSource ? 'documentOriginal' : 'documentTranslated')
    return <section className="nola-doc-pane" aria-label={label} lang={isSource ? source === 'auto' ? undefined : source : translatedTo ?? target}>
      <h2>{label}</h2>
      <div className="nola-doc-scroll" ref={isSource ? left : right} onScroll={event => sync(event.currentTarget, isSource ? right.current : left.current)}>
        {opened.doc.sections.map((section, sectionNumber) => {
          const markup = section.markup(isSource ? emptyValues : values)
          return <div className="nola-doc-section" data-section={sectionNumber} key={sectionNumber}>
        {!isSource && !section.units.some(unit => values.has(unit.id)) ? <p className="nola-doc-placeholder">{t('documentWaiting')}</p>
          : section.page && (isSource || section.page.renderTranslated) ? <PdfPage key={section.name} page={section.page} label={label + ' ' + section.name}
            values={isSource ? undefined : values} signature={isSource ? undefined : JSON.stringify(section.units.map(unit => values.get(unit.id) ?? null))} onError={() => report(undefined, 'documentInvalid')} />
          : <div className="nola-doc-sheet" data-format={opened.doc.format} dir="auto">
            {opened.doc.format === 'txt' ? <div className="whitespace-pre-wrap">{markup}</div>
              : opened.doc.format === 'md' ? <ReactMarkdown remarkPlugins={[remarkGfm]} disallowedElements={['img']} components={{ a: props => <a href={props.href} target="_blank" rel="noopener noreferrer">{props.children}</a> }}>{markup}</ReactMarkdown>
              : <div dangerouslySetInnerHTML={{ __html: markup }} />}
          </div>}
          </div>
        })}
      </div>
    </section>
  }

  return <main className="nola-doc-workbench">
    <header className="nola-doc-header">
      <a href="options.html" data-slot="button" data-variant="outline" aria-label={t('settings')} title={t('settings')} className={buttonVariants({ variant: 'outline', size: 'icon-sm', className: 'button' })}><ArrowLeft aria-hidden="true" /></a>
      <h1>{t('documentTranslation')}</h1>
      {opened && <span className="nola-doc-filename truncate" title={opened.file.name}>{opened.file.name}</span>}
      {opened && <div className="nola-doc-header-actions">
        <Button variant="outline" size="sm" disabled={Boolean(busy) || running} onClick={() => picker.current?.click()}><Upload data-icon="inline-start" />{t('documentChoose')}</Button>
        <Button size="sm" disabled={Boolean(busy) || running || !units.length || values.size !== units.length} onClick={() => void download()}><Download data-icon="inline-start" />{t(busy === 'exporting' ? 'documentExporting' : 'documentExport')}</Button>
      </div>}
    </header>
    <input ref={picker} type="file" accept={accept} aria-label={t('documentChoose')} hidden onChange={event => {
      const file = event.currentTarget.files?.[0]
      event.currentTarget.value = ''
      if (file) void open(file)
    }} />
    {!opened ? <div className="nola-doc-import">
      <Empty className="p-10" data-dragging={dragging} aria-busy={busy === 'opening'} onDragOver={event => { event.preventDefault(); setDragging(true) }}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }}
        onDrop={event => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) void open(file) }}>
        <EmptyHeader>
          <EmptyMedia variant="icon"><FileText aria-hidden="true" /></EmptyMedia>
          <EmptyTitle>{t(busy === 'opening' ? 'documentPreparing' : 'documentDrop')}</EmptyTitle>
          <p className="nola-doc-formats">{formatLabel}</p>
        </EmptyHeader>
        <EmptyContent><Button disabled={Boolean(busy)} onClick={() => picker.current?.click()}><Upload data-icon="inline-start" />{t('documentChoose')}</Button></EmptyContent>
      </Empty>
    </div> : <>
      <div className="nola-doc-toolbar">
        <ChoiceField label={t('source')} value={source} options={[{ value: 'auto', label: t('autoDetect') }, ...options]} disabled={Boolean(busy)} onChange={value => changeLanguage('source', value)} t={t} />
        <ChoiceField label={t('target')} value={target} options={options} disabled={Boolean(busy)} onChange={value => changeLanguage('target', value)} t={t} />
        <ChoiceField label={t('provider')} value={provider} options={serviceOptions.map(item => ({ value: item.id, label: item.name }))} disabled={running} onChange={setProvider} t={t} />
        <Button variant={running ? 'outline' : 'default'} disabled={Boolean(busy) || !units.length || values.size === units.length} onClick={() => running ? request.current?.abort() : void start()}>
          {running ? <Pause data-icon="inline-start" /> : <Languages data-icon="inline-start" />}{t(complete ? 'documentDone' : running ? 'documentPause' : values.size || failed ? 'documentResume' : 'documentStart')}
        </Button>
        <div className="nola-doc-views" role="group" aria-label={t('bilingualPage')}>
          <Button variant="outline" size="sm" aria-pressed={original} aria-disabled={original && !translation} onClick={() => { if (translation) setOriginal(!original) }}><PanelLeft data-icon="inline-start" aria-hidden="true" />{t('documentOriginal')}</Button>
          <Button variant="outline" size="sm" aria-pressed={translation} aria-disabled={translation && !original} onClick={() => { if (original) setTranslation(!translation) }}><PanelRight data-icon="inline-start" aria-hidden="true" />{t('documentTranslated')}</Button>
        </div>
      </div>
      {(busy === 'opening' || scans) && <div className="nola-doc-status">
        {busy === 'opening' && <span role="status">{t('documentPreparing')}</span>}
        {scans && <span>{t('documentScanNotice')}</span>}
      </div>}
      <div ref={compare} className="nola-doc-compare" data-both={both} data-resizing={resizing} style={{ '--doc-split': split / 100, '--doc-zoom': zoom / 100 } as CSSProperties}>
      <div className="nola-doc-viewer-toolbar">
        <Button variant="outline" size="icon-sm" aria-label={previousLabel} title={previousLabel} disabled={currentPage === 0} onClick={() => goToPage(currentPage - 1)}><ChevronLeft /></Button>
        <span aria-label={pageLabel} aria-live="polite">{currentPage + 1} / {opened.doc.sections.length}</span>
        <Button variant="outline" size="icon-sm" aria-label={nextLabel} title={nextLabel} disabled={currentPage >= opened.doc.sections.length - 1} onClick={() => goToPage(currentPage + 1)}><ChevronRight /></Button>
        <Button variant="outline" size="icon-sm" aria-label={zoomOutLabel} title={zoomOutLabel} disabled={zoom <= 50} onClick={() => setZoom(value => Math.max(50, value - 10))}><ZoomOut /></Button>
        <span>{zoom}%</span>
        <Button variant="outline" size="icon-sm" aria-label={zoomInLabel} title={zoomInLabel} disabled={zoom >= 200} onClick={() => setZoom(value => Math.min(200, value + 10))}><ZoomIn /></Button>
      </div>
        {original && preview('source')}
        {both && <div className="nola-doc-divider" role="separator" aria-label={t('documentDivider')} aria-orientation="vertical" aria-valuemin={20} aria-valuemax={80} aria-valuenow={split} tabIndex={0}
          onPointerDown={event => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); setResizing(true) }}
          onPointerMove={event => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
            const box = compare.current!.getBoundingClientRect()
            changeSplit((event.clientX - box.left) / box.width * 100)
          }}
          onLostPointerCapture={() => setResizing(false)}
          onDoubleClick={() => setSplit(50)}
          onKeyDown={event => {
            const value = { ArrowLeft: split - 5, ArrowRight: split + 5, Home: 20, End: 80, Enter: 50 }[event.key]
            if (value !== undefined) { event.preventDefault(); changeSplit(value) }
          }} />}
        {translation && preview('target')}
      </div>
    </>}
    <Dialog open={Boolean(pendingLanguage)} onOpenChange={open => { if (!open) setPendingLanguage(undefined) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('documentChangeLanguage')}</DialogTitle>
          <DialogDescription>{t('documentChangeLanguageNotice')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{t('cancel')}</DialogClose>
          <Button onClick={() => { if (pendingLanguage) applyLanguage(pendingLanguage.kind, pendingLanguage.value) }}>{t('documentChangeLanguage')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </main>
}

const mount = document.getElementById('root')
if (mount) createRoot(mount).render(<><DocumentErrorBoundary><DocumentWorkbench /></DocumentErrorBoundary><ToastProvider /></>)
