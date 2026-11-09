import { normalizeLanguage } from '../../src/shared/languages'
import { BrowserFailure } from './bridge'
import { siteEnabled, type Preferences } from './preferences'
import { TEXT_TRANSLATION_CONCURRENCY, type TextTranslation } from './text-translation'

const paragraph = 'body, main, article, section, div, p, h1, h2, h3, h4, h5, h6, li, blockquote, figcaption, dd, dt, td, th'
const excluded = 'script, style, noscript, pre, code, kbd, samp, form, textarea, input, select, button, nav, [role=navigation], [role=button], [contenteditable]:not([contenteditable=false]), [hidden], [aria-hidden=true], [data-nola-extension], [data-nola-translation]'
interface Translation {
  node: Text
  source: string
  result: string
  annotation?: HTMLElement
  marker?: HTMLTemplateElement
}

function findNodes(root: HTMLElement): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: node => {
      const parent = node.parentElement
      return parent && parent.closest(paragraph) === root && !parent.closest(excluded) && node.textContent?.trim()
        ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    },
  })
  const nodes: Text[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text)
  return nodes
}

export function createPageTranslation(translator: TextTranslation) {
  const translations = new Map<HTMLElement, Translation[]>()
  let settings: Preferences | undefined
  let controller: AbortController | undefined
  const pending = new Set<HTMLElement | Document>()
  let concurrency = TEXT_TRANSLATION_CONCURRENCY
  let error: string | undefined
  let frame = 0
  let title: { source: string; result: string } | undefined
  let hovered: HTMLElement | null = null
  let hoverOnly = false
  const hover = (event: PointerEvent) => {
    if (!settings?.hoverTranslation || !siteEnabled(settings, location.href)) return
    const modifiers = (settings.shortcutHover ?? 'Alt').toLowerCase().split('+')
    if (event.altKey !== modifiers.includes('alt') || event.ctrlKey !== modifiers.includes('ctrl') || event.metaKey !== modifiers.includes('meta') || event.shiftKey !== modifiers.includes('shift')) return
    const block = event.target instanceof Element ? event.target.closest<HTMLElement>(paragraph) : null
    if (block) { hovered = block; if (!controller) start(block); else schedule() }
  }
  const siteRule = () => settings?.siteRules?.find(rule => rule.host === location.hostname || rule.host === location.origin)
  const matches = (node: HTMLElement, selector: string | undefined) => {
    if (!selector?.trim()) return false
    try { return Boolean(node.closest(selector)) } catch { return false }
  }
  const observer = new MutationObserver(() => schedule())

  const restore = (entries: Translation[]): void => {
    for (const { node, source, result, annotation, marker } of entries) {
      marker?.remove()
      if (annotation) annotation.remove()
      else if (node.data === result) node.data = source
    }
  }
  const stop = () => {
    controller?.abort(); controller = undefined
    observer.disconnect()
    window.removeEventListener('scroll', schedule, true)
    window.removeEventListener('resize', schedule)
    cancelAnimationFrame(frame); frame = 0
    for (const entries of translations.values()) restore(entries)
    translations.clear()
    if (title && document.title === title.result) document.title = title.source
    title = undefined
    delete document.documentElement.dataset.nolaSourceTitle; delete document.documentElement.dataset.nolaResultTitle
    window.removeEventListener('pointerover', hover)
    pending.clear(); error = undefined
  }
  function schedule() {
    if (!controller || frame || pending.size >= concurrency || error) return
    frame = requestAnimationFrame(() => { frame = 0; translateNext() })
  }
  function queueTranslation(key: HTMLElement | Document, signal: AbortSignal, task: () => Promise<void>) {
    pending.add(key)
    void task().catch(failure => {
      if (!signal.aborted) error ??= failure instanceof BrowserFailure ? failure.code : 'internalError'
    }).finally(() => {
      if (signal.aborted) return
      pending.delete(key)
      schedule()
    })
  }
  function translateNext() {
    if (!controller || !settings || pending.size >= concurrency || error) return
    const preferences = settings
    const { signal } = controller
    for (const [block, entries] of translations) {
      if (!block.isConnected || entries.some(entry => !entry.node.isConnected || entry.node.data !== (entry.annotation ? entry.source : entry.result) || entry.annotation && !entry.annotation.isConnected)) {
        restore(entries); translations.delete(block)
      }
    }
    if (!hoverOnly && preferences.translateTitle && !pending.has(document) && document.title.trim() && (!title || document.title !== title.result)) {
      const source = document.title
      queueTranslation(document, signal, async () => {
        const result = await translator.translate(source, preferences.sourceLanguage, preferences.pageLanguage, 'web', signal)
        if (!signal.aborted && document.title === source) { title = { source, result }; document.documentElement.dataset.nolaSourceTitle = source; document.documentElement.dataset.nolaResultTitle = result; document.title = result }
      })
    }
    const screen = window.innerHeight
    const rule = siteRule()
    const main = document.querySelector('main, article, [role=main]')
    const blocks = [...document.querySelectorAll<HTMLElement>(paragraph)].flatMap(block => {
      if (preferences.pageScope === 'main' && main && !main.contains(block)) return []
      if (hoverOnly && block !== hovered) return []
      if (matches(block, rule?.excludeSelectors) || rule?.includeSelectors && !matches(block, rule.includeSelectors)) return []
      if (translations.has(block) || pending.has(block) || block.closest(excluded) || !block.getClientRects().length || getComputedStyle(block).visibility !== 'visible') return []
      const rect = block.getBoundingClientRect()
      return rect.bottom >= -screen && rect.top <= screen * 2 ? [{ block, distance: Math.max(rect.top - screen, -rect.bottom, 0) }] : []
    }).sort((a, b) => a.distance - b.distance)
    for (const { block } of blocks) {
      if (pending.size >= concurrency) break
      const nodes = findNodes(block)
      if (nodes.length) queueTranslation(block, signal, () => translateBlock(block, nodes, preferences, signal))
    }
  }
  async function translateBlock(block: HTMLElement, nodes: Text[], settings: Preferences, signal: AbortSignal) {
    const { pageLanguage: target, pageDisplay } = settings
    const sourceCode = block.closest('[lang]')?.getAttribute('lang')
    const source = settings.sourceLanguage !== 'auto' ? settings.sourceLanguage : sourceCode ? normalizeLanguage(sourceCode).split(/-(?!Hant$)/)[0] : 'auto'
    const originals = nodes.map(node => node.data)
    const text = originals.map(value => value.trim()).join(' ').trim()
    const entries: Translation[] = []
    if (text.length > 4000 || text.length < (settings.minTextLength ?? 1) || source === target || settings.skipLanguages?.includes(source)) { translations.set(block, entries); return }
    if (pageDisplay === 'bilingual') {
      const result = await translator.translate(text, source, target, 'web', signal)
      if (signal.aborted || !block.isConnected || nodes.some((node, index) => node.data !== originals[index] || !block.contains(node))) return
      const annotation = document.createElement('span')
      annotation.dataset.nolaTranslation = 'true'
      annotation.lang = target; annotation.dir = 'auto'; annotation.textContent = result
      annotation.style.cssText = settings.pageCustomCss ?? ''
      annotation.style.display = settings.pageStyle === 'plain' ? 'inline' : 'block'
      if (settings.pageStyle === 'block') annotation.style.backgroundColor = 'color-mix(in srgb, currentColor 8%, transparent)'
      if (settings.pageStyle === 'underline') annotation.style.textDecoration = 'underline'
      block.append(annotation)
      nodes.forEach((node, index) => entries.push({ node, source: originals[index], result, annotation }))
    } else {
      // Keep the original elements and event targets, including inline links and emphasis.
      const results: string[] = []
      if (!block.querySelector('a, [role=link], button, input, [contenteditable]')) {
        results.push(await translator.translate(text, source, target, 'web', signal), ...nodes.slice(1).map(() => ''))
      } else {
        for (const value of originals) results.push(await translator.translate(value.trim(), source, target, 'web', signal))
      }
      if (signal.aborted || !block.isConnected || nodes.some((node, index) => node.data !== originals[index] || !block.contains(node))) return
      nodes.forEach((node, index) => {
        const original = originals[index]
        const result = results[index] ? original.replace(/\S[\s\S]*\S|\S/u, () => results[index]) : ''
        const marker = document.createElement('template')
        marker.dataset.nolaOriginal = original; marker.dataset.nolaResult = result
        node.before(marker)
        node.data = result
        entries.push({ node, source: original, result, marker })
      })
    }
    translations.set(block, entries)
  }
  const start = (only?: HTMLElement) => {
    if (!settings || !siteEnabled(settings, location.href)) return
    hoverOnly = Boolean(only); hovered = only ?? null
    if (controller && !error) { schedule(); return }
    stop()
    controller = new AbortController()
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'class'] })
    window.addEventListener('pointerover', hover)
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    schedule()
  }
  return {
    start, stop,
    setConcurrency(next: number) { if (next !== concurrency) { concurrency = next; schedule() } },
    hover(event: PointerEvent) { hover(event) },
    state: () => ({ pageActive: Boolean(controller), pageError: error }),
    configure(next: Preferences) {
      const previous = settings
      settings = next
      if (!siteEnabled(next, location.href)) { stop(); return }
      if (controller && previous && (previous.sourceLanguage !== next.sourceLanguage || previous.pageProvider !== next.pageProvider || previous.pagePrompt !== next.pagePrompt || previous.pageCustomCss !== next.pageCustomCss || previous.pageStyle !== next.pageStyle || previous.pageLanguage !== next.pageLanguage || previous.pageDisplay !== next.pageDisplay || previous.pageScope !== next.pageScope || previous.hoverTranslation !== next.hoverTranslation || previous.translateTitle !== next.translateTitle || previous.minTextLength !== next.minTextLength || JSON.stringify(previous.siteRules) !== JSON.stringify(next.siteRules) || JSON.stringify(previous.skipLanguages) !== JSON.stringify(next.skipLanguages))) { stop(); start() }
    },
  }
}

export function restorePageTranslationArtifacts(doc: Document): void {
  for (const marker of doc.querySelectorAll<HTMLTemplateElement>('template[data-nola-original]')) {
    const node = marker.nextSibling
    if (node?.nodeType === Node.TEXT_NODE && node.textContent === marker.dataset.nolaResult) node.textContent = marker.dataset.nolaOriginal ?? ''
    marker.remove()
  }
  doc.querySelectorAll('[data-nola-translation]').forEach(node => node.remove())
  const data = doc.documentElement.dataset
  if (data.nolaSourceTitle !== undefined && doc.title === data.nolaResultTitle) doc.title = data.nolaSourceTitle
  delete data.nolaSourceTitle; delete data.nolaResultTitle
}
