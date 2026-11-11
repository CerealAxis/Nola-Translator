import { normalizeLanguage } from '../../src/shared/languages'
import { DISABLED_PROVIDER, siteEnabled, type Preferences } from './preferences'
import { TEXT_TRANSLATION_CONCURRENCY, type TextTranslation } from './text-translation'
import { ProviderRequestError } from './provider-client'
import { alignManpageTranslation, isManpageProse, manpageParagraph, prepareManpage, restoreManpage } from './manpage-translation'

const paragraph = 'body, main, article, section, header, footer, aside, div, p, h1, h2, h3, h4, h5, h6, li, blockquote, figcaption, dd, dt, td, th, nav, [role=navigation], nav a, [role=navigation] a'
const protectedContent = [
  'script', 'style', 'noscript', 'svg', 'math', 'canvas', 'time', 'relative-time',
  'textarea', 'select', 'a[rel~=tag]', '.notranslate', '[data-notranslate=true]', '[translate=no]:not(body,html,[data-nola-single-slot])',
  '[contenteditable]:not([contenteditable=false])', '[hidden]', '[aria-hidden=true]', '[role=timer]',
  '[data-nola-extension]', '[data-nola-translation]', '[data-nola-loading]',
].join(',')
const excluded = 'form,input,' + protectedContent
const nativeControl = 'button,.btn,.button,[role=button],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],[role=tab],[role=switch],[role=option],[role=treeitem],[role=radio],[role=checkbox]'
const structural = 'nav,header,footer,aside:not(article aside, [role=article] aside, main :is(aside[role=note], aside.note, aside.callout, aside.admonition, aside.tip, aside.warning, aside.caution, aside.important, aside.notice)),[role=banner],[role=navigation],[role=menu],[role=menubar],[role=tablist],[role=tree],[role=toolbar],[role=listbox]'
const interactive = 'a,label,summary,legend,[role=link],[tabindex]:not([tabindex^="-"])'
const heading = 'h1,h2,h3,h4,h5,h6,[role=heading]'
const prose = 'article,[role=article],p,blockquote,address,figcaption,li,dt,dd,td,th'
const SCROLL_IDLE_MS = 220
const PREFETCH_MARGIN = 600
interface Translation {
  node: Text
  source: string
  result: string
  annotation?: HTMLElement
  group?: HTMLElement
  slot?: HTMLElement
  marker?: HTMLTemplateElement
}

interface ControlValue {
  source: string
  result: string
}

interface SharedRequest {
  controller: AbortController
  result: Promise<string>
  users: number
}

function isValueButton(input: HTMLInputElement) {
  const type = input.type
  // A named submit button sends its value to the form handler.
  return type === 'button' || type === 'reset' || type === 'submit' && !input.name
}

function buttonLabel(input: HTMLElement): string | undefined {
  if (!(input instanceof HTMLInputElement) || !isValueButton(input)) return
  const label = input.getAttribute('value')
  if (label?.trim() && !input.closest('pre,' + protectedContent) && input.getClientRects().length &&
    getComputedStyle(input).visibility === 'visible') return label
}

function restoreControlValue(input: HTMLElement, { source, result }: ControlValue) {
  if (source !== result && input.getAttribute('value') === result) input.setAttribute('value', source)
  delete input.dataset.nolaControlSource
  delete input.dataset.nolaControlResult
}

function candidateOwner(parent: HTMLElement, scope: Preferences['pageScope']) {
  const control = parent.closest<HTMLElement>(nativeControl)
  if (control) return { block: control, control: true }
  const nearest = parent.closest<HTMLElement>(paragraph)
  const section = parent.closest(structural)
  const owner = parent.closest<HTMLElement>(interactive)
  const body = parent.closest<HTMLElement>(prose + ',' + heading)
  const label = owner?.textContent?.trim().replace(/\s+/g, ' ') ?? ''
  const linkedListLabel = body?.matches('li') && body.textContent.trim() === owner?.textContent.trim()
  if (owner && (!body || linkedListLabel || section && section.contains(body) && !body.matches(heading)) &&
    (scope === 'all' || label.length <= 64 && !/[.!?。！？；;]$/u.test(label))) {
    return { block: owner, control: true }
  }
  if (body?.matches(heading)) return { block: body, control: false }
  if (section || scope === 'all' && !body) {
    return { block: parent, control: true }
  }
  return { block: nearest, control: false }
}

function collectBlocks(root: HTMLElement, scope: Preferences['pageScope']) {
  const blocks = new Map<HTMLElement, Text[]>()
  const controls = new Set<HTMLElement>()
  const owners = new Map<HTMLElement, HTMLElement | null>()
  const manualSections = new Map<HTMLElement, boolean>()
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let next = walker.nextNode(); next; next = walker.nextNode()) {
    const node = next as Text
    const parent = node.parentElement
    if (!parent) continue
    if (!owners.has(parent)) {
      const sourceParent = parent.hasAttribute('data-nola-single-slot') ? parent.parentElement : parent
      if (!sourceParent || sourceParent.closest(excluded) || !sourceParent.getClientRects().length) {
        owners.set(parent, null)
        continue
      }
      const pre = sourceParent.closest('pre')
      const manual = pre && manpageParagraph(sourceParent)
      if (manual && !manualSections.has(manual)) manualSections.set(manual, isManpageProse(manual))
      const { block, control } = pre
        ? { block: manual && manualSections.get(manual) ? manual : null, control: false }
        : candidateOwner(sourceParent, scope)
      const style = getComputedStyle(sourceParent)
      const visible = block && root.contains(block) && style.visibility === 'visible'
      if (visible && control) controls.add(block)
      owners.set(parent, visible ? block : null)
    }
    const block = owners.get(parent)
    if (!block) continue
    const nodes = blocks.get(block)
    if (nodes) nodes.push(node)
    else blocks.set(block, [node])
  }
  for (const input of root.querySelectorAll<HTMLInputElement>('input[type]')) {
    if (buttonLabel(input) !== undefined) blocks.set(input, [])
  }
  return { blocks, controls }
}

const literalTags = new Set(['code', 'kbd', 'samp', 'var'])
const inlineTags = new Set(['a', 'b', 'strong', 'em', 'i', 'u', 's', 'del', 'mark', 'small', 'sub', 'sup', 'span', ...literalTags])
const textStyles = ['color', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'letter-spacing', 'text-decoration', 'vertical-align'] as const

interface SourceRun {
  nodes: Text[]
  wrappers: HTMLElement[]
  breakBefore: boolean
  literal: boolean
}

function inlineCopy(source: HTMLElement): HTMLElement {
  const copy = document.createElement(source.localName)
  const style = getComputedStyle(source)
  for (const property of textStyles) {
    const value = style.getPropertyValue(property)
    if (value) copy.style.setProperty(property, value)
  }
  if (source instanceof HTMLAnchorElement && copy instanceof HTMLAnchorElement && source.hasAttribute('href')) {
    try {
      const url = new URL(source.href, document.baseURI)
      if (['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)) {
        copy.href = url.href
        if (source.target === '_blank') { copy.target = '_blank'; copy.rel = 'noopener noreferrer' }
      }
    } catch { /* Ignore invalid links. */ }
  }
  return copy
}

function sourceRuns(block: HTMLElement, nodes: Text[], individual: boolean): SourceRun[] {
  const runs: SourceRun[] = []
  const breaks = [...block.querySelectorAll('br')].filter(node => node.closest(paragraph) === block && !node.closest(excluded))
  let nextBreak = 0
  for (const node of nodes) {
    let breakBefore = false
    while (breaks[nextBreak] && (breaks[nextBreak].compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)) {
      breakBefore ||= runs.length > 0
      nextBreak++
    }
    const wrappers: HTMLElement[] = []
    for (let parent = node.parentElement; parent && parent !== block; parent = parent.parentElement) {
      if (inlineTags.has(parent.localName) && (parent.localName !== 'span' || parent.hasAttribute('class') || parent.hasAttribute('style'))) {
        wrappers.unshift(parent)
      }
    }
    const previous = runs.at(-1)
    if (!individual && !breakBefore && previous && previous.wrappers.length === wrappers.length &&
      previous.wrappers.every((wrapper, index) => wrapper === wrappers[index])) {
      previous.nodes.push(node)
    } else {
      runs.push({ nodes: [node], wrappers, breakBefore, literal: wrappers.some(wrapper => literalTags.has(wrapper.localName)) })
    }
  }
  return runs
}

function renderRuns(runs: SourceRun[], translated: string[]): DocumentFragment {
  const fragment = document.createDocumentFragment()
  let previous: HTMLElement[] = []
  const elements: (HTMLElement | DocumentFragment)[] = [fragment]
  runs.forEach(({ wrappers, breakBefore }, index) => {
    let common = 0
    while (common < previous.length && previous[common] === wrappers[common]) common++
    elements.length = common + 1
    if (breakBefore) elements.at(-1)!.append(document.createElement('br'))
    for (const source of wrappers.slice(common)) {
      const copy = inlineCopy(source)
      elements.at(-1)!.append(copy)
      elements.push(copy)
    }
    elements.at(-1)!.append(document.createTextNode(translated[index]))
    previous = wrappers
  })
  return fragment
}

function translationFlow(block: HTMLElement): 'block' | 'shared-line' | 'skip' {
  const style = getComputedStyle(block)
  if (style.display.includes('grid') || style.display.includes('flex')) {
    const hasElements = [...block.children].some(child => !child.hasAttribute('data-nola-translation'))
    return hasElements ? 'skip' : 'shared-line'
  }
  return 'block'
}

function applyTranslationStyle(annotation: HTMLElement, settings: Preferences, containWidth: boolean) {
  annotation.style.cssText = 'display:block;min-inline-size:0;max-inline-size:100%;box-sizing:border-box;' +
    'font:inherit;color:inherit;text-align:inherit;white-space:normal;text-wrap:wrap;overflow-wrap:break-word;margin:8px 0'
  if (settings.pageStyle === 'block') annotation.style.backgroundColor = 'color-mix(in srgb, currentColor 8%, transparent)'
  if (settings.pageStyle === 'underline') annotation.style.textDecoration = 'underline'
  if (settings.pageCustomCss) annotation.style.cssText += ';' + settings.pageCustomCss
  if (containWidth) annotation.style.setProperty('contain', 'inline-size', 'important')
}

function needsInlineSizeContainment(block: HTMLElement): boolean {
  for (let current: HTMLElement | null = block, depth = 0; current && depth < 32; current = current.parentElement, depth++) {
    const style = getComputedStyle(current)
    if (['inline-block', 'inline-flex', 'inline-grid', 'inline-table'].includes(style.display) ||
      ['left', 'right', 'inline-start', 'inline-end'].includes(style.cssFloat)) return true
    if (style.display === 'table-cell') {
      const table = current.closest('table')
      if (!table || getComputedStyle(table).tableLayout !== 'fixed') return true
    }
  }
  return false
}

const layoutProperties = { '-webkit-line-clamp': 'unset', 'line-clamp': 'unset', 'max-height': 'unset', height: 'auto' }
type LayoutProperty = keyof typeof layoutProperties
type LayoutValue = [LayoutProperty, string, string]
interface LayoutOverride {
  owners: Set<HTMLElement>
  original: string | null
  applied: string | null
  restoreExact: boolean
  values: LayoutValue[]
}
const layoutOverrides = new Map<HTMLElement, LayoutOverride>()
const annotationOverrides = new WeakMap<HTMLElement, HTMLElement[]>()

function positioned(style: CSSStyleDeclaration) {
  return ['absolute', 'fixed', 'sticky'].includes(style.position) ||
    ['transform', 'translate', 'rotate', 'scale'].some(property => {
      const value = style.getPropertyValue(property)
      return value && value !== 'none'
    })
}

function expandClippedContent(block: HTMLElement, annotation: HTMLElement) {
  const owned: HTMLElement[] = []
  let heightBoundary = false
  let branch = block
  for (let current: HTMLElement | null = block, depth = 0; current && current !== document.body && depth < 32; depth++) {
    const style = getComputedStyle(current)
    const overflow = style.overflowY || style.overflow
    const clips = overflow === 'hidden' || overflow === 'clip'
    const overflows = current.scrollHeight > current.clientHeight + 1
    const clamped = ['-webkit-line-clamp', 'line-clamp'].some(property => parseInt(style.getPropertyValue(property), 10) > 0)
    const capped = !['', 'none', 'auto', 'unset', 'initial', 'max-content'].includes(style.maxHeight)
    const properties: LayoutProperty[] = []
    heightBoundary ||= positioned(style) || overflow === 'auto' || overflow === 'scroll'
    if (clamped || clips && capped && overflows) properties.push('-webkit-line-clamp', 'line-clamp', 'max-height')
    if (clamped || !heightBoundary && !clips && parseFloat(style.height) > 0 &&
      ['block', 'flow-root', 'flex', 'grid', 'inline-block', 'inline-flex', 'inline-grid'].includes(style.display)) {
      const spills = branch === current ? overflows : !positioned(getComputedStyle(branch)) &&
        branch.getBoundingClientRect().bottom > current.getBoundingClientRect().bottom + 1
      if (clamped || spills) properties.push('height')
    }

    let override = layoutOverrides.get(current)
    if (properties.length && !override) {
      const original = current.getAttribute('style')
      override = { owners: new Set(), original, applied: original, restoreExact: true, values: [] }
      layoutOverrides.set(current, override)
    }
    if (override) {
      override.owners.add(annotation)
      owned.push(current)
      if (current.getAttribute('style') !== override.applied) override.restoreExact = false
      for (const property of properties) {
        if (override.values.some(([existing]) => existing === property)) continue
        override.values.push([property, current.style.getPropertyValue(property), current.style.getPropertyPriority(property)])
        current.style.setProperty(property, layoutProperties[property], 'important')
      }
      if (properties.length) {
        override.applied = current.getAttribute('style')
        current.dataset.nolaLayout = JSON.stringify(override.values)
      }
    }
    branch = current
    current = current.parentElement
  }
  if (owned.length) annotationOverrides.set(annotation, owned)
}

function restoreLayoutValues(element: HTMLElement, values: LayoutValue[]) {
  for (const [property, value, priority] of values) {
    if (element.style.getPropertyValue(property) !== layoutProperties[property] || element.style.getPropertyPriority(property) !== 'important') continue
    if (value) element.style.setProperty(property, value, priority)
    else element.style.removeProperty(property)
  }
  delete element.dataset.nolaLayout
}

function showBilingual(block: HTMLElement, runs: SourceRun[], translated: string[], settings: Preferences, flow: 'block' | 'shared-line') {
  const annotation = document.createElement('span')
  annotation.dataset.nolaTranslation = 'true'
  annotation.setAttribute('translate', 'no')
  annotation.lang = settings.pageLanguage
  annotation.dir = 'auto'
  applyTranslationStyle(annotation, settings, needsInlineSizeContainment(block))
  annotation.append(renderRuns(runs, translated))

  let group: HTMLElement | undefined
  if (flow === 'shared-line') {
    group = document.createElement('span')
    group.dataset.nolaSourceLine = 'true'
    group.style.minInlineSize = '0'
    group.append(...block.childNodes)
    block.append(group)
  }
  const container = group ?? block
  container.append(annotation)
  alignManpageTranslation(block, annotation)
  expandClippedContent(block, annotation)
  return { annotation, group }
}

function showSingleSlot(node: Text, value: string, language: string): HTMLElement {
  const host = document.createElement('span')
  host.dataset.nolaSingleSlot = 'true'
  host.setAttribute('translate', 'no')
  host.setAttribute('aria-label', value)
  host.lang = language
  host.dir = 'auto'
  host.style.display = 'inline'
  const shadow = host.attachShadow({ mode: 'closed' })
  const text = document.createElement('span')
  text.style.font = 'inherit'
  text.style.color = 'inherit'
  text.textContent = value
  shadow.append(text)
  node.before(host)
  host.append(node)
  return host
}

function unwrapSlot(host: HTMLElement): void {
  if (host.parentNode) host.replaceWith(...host.childNodes)
}

interface PageRender {
  runs: SourceRun[]
  sourceTexts: string[]
  results: string[]
  control: boolean
}

function present(block: HTMLElement, render: PageRender, settings: Preferences): Translation[] {
  const { runs, sourceTexts, results, control } = render
  const entries: Translation[] = []
  const flow = translationFlow(block)
  if (settings.pageDisplay === 'bilingual' && !control && flow !== 'skip') {
    const displayed = results.some((value, index) => value !== sourceTexts[index])
      ? showBilingual(block, runs, results, settings, flow)
      : undefined
    for (const run of runs) {
      for (const node of run.nodes) entries.push({ node, source: node.data, result: node.data, ...displayed })
    }
    return entries
  }
  runs.forEach((run, index) => {
    const changed = results[index] !== sourceTexts[index]
    run.nodes.forEach((node, nodeIndex) => {
      const original = node.data
      if (!changed) { entries.push({ node, source: original, result: original }); return }
      const result = nodeIndex === 0 ? results[index] : ''
      if (!control && flow !== 'skip') {
        const slot = showSingleSlot(node, result, settings.pageLanguage)
        entries.push({ node, source: original, result: original, slot })
        return
      }
      const marker = document.createElement('template')
      marker.dataset.nolaOriginal = original
      marker.dataset.nolaResult = result
      node.before(marker)
      node.data = result
      entries.push({ node, source: original, result, marker })
    })
  })
  return entries
}

export function createPageTranslation(translator: TextTranslation) {
  const translations = new Map<HTMLElement, Translation[]>()
  const controlValues = new Map<HTMLElement, ControlValue>()
  const renderResults = new Map<HTMLElement, PageRender>()
  let settings: Preferences | undefined
  let controller: AbortController | undefined
  const pending = new Map<HTMLElement | Document, AbortController>()
  const requests = new Map<string, SharedRequest>()
  let reconnectAttempts = new WeakMap<HTMLElement | Document, { source: string; count: number }>()
  const reconnectTimers = new Set<number>()
  let silentFailure = false
  let consecutiveFailures = 0
  let failureSince: number | undefined
  let concurrency = TEXT_TRANSLATION_CONCURRENCY
  let error: string | undefined
  let frame = 0
  let discoveryDirty = true
  let orderDirty = true
  let viewportDirty = false
  let prioritizeViewport = false
  let scrollTimer = 0
  let scrollPort: HTMLElement | null = null
  let blocks = new Map<HTMLElement, Text[]>()
  let controls = new Set<HTMLElement>()
  let queue: HTMLElement[] = []
  let failures = new WeakMap<HTMLElement, string>()
  let failedTitle: string | undefined
  let lastScroll = window.scrollY
  let scrollingDown = true
  let title: { source: string; result: string } | undefined
  let hovered: HTMLElement | null = null
  let hoverOnly = false
  const hover = (event: PointerEvent) => {
    if (!settings?.hoverTranslation || !settings.shortcutHover || !siteEnabled(settings, location.href)) return
    const modifiers = (settings.shortcutHover ?? 'Alt').toLowerCase().split('+')
    if (event.altKey !== modifiers.includes('alt') || event.ctrlKey !== modifiers.includes('ctrl') || event.metaKey !== modifiers.includes('meta') || event.shiftKey !== modifiers.includes('shift')) return
    const target = event.target
    const block = target instanceof HTMLElement
      ? buttonLabel(target) !== undefined ? target : manpageParagraph(target) ?? candidateOwner(target, settings.pageScope).block
      : null
    if (block) { hovered = block; if (!controller) start(block); else { orderDirty = true; schedule() } }
  }
  const siteRule = () => settings?.siteRules?.find(rule => rule.host === location.hostname || rule.host === location.origin)
  const matches = (node: HTMLElement, selector: string | undefined) => {
    if (!selector?.trim()) return false
    try { return Boolean(node.closest(selector)) } catch { return false }
  }
  const ownsArtifact = (node: Node) => node instanceof HTMLElement &&
    (node.hasAttribute('data-nola-translation') || node.hasAttribute('data-nola-loading') || node.matches('template[data-nola-original]'))
  const observer = new MutationObserver(records => {
    if (records.every(record => {
      if (record.type === 'childList') return [...record.addedNodes, ...record.removedNodes].every(ownsArtifact)
      const input = record.target
      if (!(input instanceof HTMLInputElement) || !['name', 'type', 'value'].includes(record.attributeName ?? '')) return false
      const current = controlValues.get(input)
      if (record.attributeName === 'value' && current?.result === input.getAttribute('value')) return true
      return !current && !pending.has(input) && !isValueButton(input)
    })) return
    discoveryDirty = true
    schedule()
  })
  const refreshOrder = (event: Event) => {
    if (event.type === 'resize') {
      for (const [block, entries] of translations) {
        const annotation = entries[0]?.annotation
        if (annotation) alignManpageTranslation(block, annotation)
      }
    }
    const position = window.scrollY
    if (position !== lastScroll) scrollingDown = position > lastScroll
    lastScroll = position
    if (!hoverOnly) {
      viewportDirty = prioritizeViewport = true
      if (event.type === 'scroll') {
        scrollPort = event.target instanceof HTMLElement ? event.target : null
        clearTimeout(scrollTimer)
        scrollTimer = window.setTimeout(() => {
          scrollTimer = 0
          orderDirty = true
          schedule()
        }, SCROLL_IDLE_MS)
      }
    }
    orderDirty = true
    schedule()
  }

  const restore = (entries: Translation[]): void => {
    for (const { node, source, result, annotation, group, slot, marker } of entries) {
      marker?.remove()
      if (annotation) removeAnnotation(annotation, group)
      else if (slot) unwrapSlot(slot)
      else if (node.data === result) node.data = source
    }
  }
  const stop = () => {
    controller?.abort(); controller = undefined
    observer.disconnect()
    window.removeEventListener('scroll', refreshOrder, true)
    window.removeEventListener('resize', refreshOrder)
    cancelAnimationFrame(frame); frame = 0
    clearTimeout(scrollTimer); scrollTimer = 0
    for (const timer of reconnectTimers) clearTimeout(timer)
    reconnectTimers.clear()
    reconnectAttempts = new WeakMap()
    silentFailure = false
    consecutiveFailures = 0
    failureSince = undefined
    scrollPort = null
    viewportDirty = prioritizeViewport = false
    for (const entries of translations.values()) restore(entries)
    translations.clear()
    restoreManpage(document)
    for (const [input, value] of controlValues) restoreControlValue(input, value)
    controlValues.clear()
    renderResults.clear()
    if (title && document.title === title.result) document.title = title.source
    title = undefined
    delete document.documentElement.dataset.nolaSourceTitle; delete document.documentElement.dataset.nolaResultTitle
    window.removeEventListener('pointerover', hover)
    pending.clear()
    requests.clear()
    blocks.clear()
    controls.clear()
    queue = []
    failures = new WeakMap()
    failedTitle = error = undefined
    discoveryDirty = orderDirty = true
  }
  function schedule() {
    if (!controller || frame || pending.size >= concurrency && !viewportDirty) return
    frame = requestAnimationFrame(() => { frame = 0; drain() })
  }

  function dispatch(key: HTMLElement | Document, source: string, task: (signal: AbortSignal) => Promise<void>, onFailure: () => void) {
    const job = new AbortController()
    const signal = AbortSignal.any([controller!.signal, job.signal])
    pending.set(key, job)
    void task(signal).then(() => { if (!signal.aborted) reconnectAttempts.delete(key) }).catch(failure => {
      if (signal.aborted) return
      onFailure()
      const code = failure instanceof Error ? failure.message : 'providerRequestFailed'
      silentFailure = true
      const previous = reconnectAttempts.get(key)
      const count = previous?.source === source ? previous.count + 1 : 1
      reconnectAttempts.set(key, { source, count })
      consecutiveFailures++
      failureSince ??= Date.now()
      if (consecutiveFailures >= 3 && Date.now() - failureSince >= 30_000 && pending.size <= 1 && queue.length === 0) error ??= code
      const session = controller
      const serviceDelay = failure instanceof ProviderRequestError ? failure.retryAfterMs ?? 0 : 0
      const delay = Math.min(2_147_000_000, Math.max(serviceDelay, Math.min(30_000, 500 * 2 ** Math.min(count - 1, 6))))
      const timer = window.setTimeout(() => {
        reconnectTimers.delete(timer)
        if (!session || controller !== session || session.signal.aborted) return
        if (key === document) failedTitle = undefined
        else if (key instanceof HTMLElement) failures.delete(key)
        orderDirty = true
        schedule()
      }, delay)
      reconnectTimers.add(timer)
      job.abort()
    }).finally(() => {
      if (pending.get(key) !== job) return
      pending.delete(key)
      if (prioritizeViewport) orderDirty = true
      schedule()
    })
  }

  const sourceOf = (nodes: Text[]) => nodes.map(node => node.data).join('')
  const sourceOfBlock = (block: HTMLElement, nodes: Text[]) => nodes.length ? sourceOf(nodes) : block.getAttribute('value') ?? ''
  const requestText = async (text: string, source: string, target: string, signal: AbortSignal) => {
    signal.throwIfAborted()
    const key = JSON.stringify([text, source, target])
    let request = requests.get(key)
    if (!request) {
      const transport = new AbortController()
      const result = translator.translate(text, source, target, 'web', transport.signal).finally(() => {
        if (requests.get(key)?.controller === transport) requests.delete(key)
      })
      request = { controller: transport, result, users: 0 }
      const session = controller
      void result.then(() => {
        if (session && controller === session && !transport.signal.aborted) { consecutiveFailures = 0; failureSince = undefined; error = undefined }
      }, () => undefined)
      requests.set(key, request)
    }
    const shared = request
    shared.users++
    return new Promise<string>((resolve, reject) => {
      const release = () => {
        signal.removeEventListener('abort', abort)
        shared.users--
      }
      const abort = () => {
        release()
        if (!shared.users && requests.get(key) === shared) {
          requests.delete(key)
          shared.controller.abort()
        }
        reject(signal.reason)
      }
      signal.addEventListener('abort', abort, { once: true })
      void shared.result.then(resolve, reject).finally(() => {
        if (!signal.aborted) release()
      })
    })
  }
  function discover() {
    prepareManpage(document)
    const currentPage = collectBlocks(document.body, settings?.pageScope ?? 'main')
    blocks = currentPage.blocks
    controls = currentPage.controls
    for (const [input, value] of controlValues) {
      if (blocks.has(input) && input.getAttribute('value') === value.result) continue
      restoreControlValue(input, value)
      controlValues.delete(input)
    }
    for (const [block, entries] of translations) {
      const current = blocks.get(block) ?? []
      if (current.length !== entries.length || entries.some((entry, index) =>
        current[index] !== entry.node || entry.node.data !== (entry.annotation ? entry.source : entry.result) ||
        (entry.annotation && !entry.annotation.isConnected || entry.slot && !entry.slot.isConnected))) {
        restore(entries)
        translations.delete(block)
        renderResults.delete(block)
      }
    }
    discoveryDirty = false
    orderDirty = true
  }

  function prioritize(preferences: Preferences) {
    const height = window.innerHeight
    const rule = siteRule()
    const main = document.querySelector('main, article, [role=main]')
    const candidates: { block: HTMLElement; band: number; distance: number; deferred: boolean }[] = []
    const portRect = scrollPort?.isConnected ? scrollPort.getBoundingClientRect() : undefined
    const visible = (block: HTMLElement, { top, bottom }: DOMRect) => {
      const clip = portRect && scrollPort!.contains(block) ? portRect : undefined
      const start = Math.max(0, clip?.top ?? 0)
      const end = Math.min(height, clip?.bottom ?? height)
      return end > start && bottom > start && top < end
    }
    for (const [block, nodes] of blocks) {
      if (translations.has(block) || controlValues.has(block) || pending.has(block) || !block.isConnected ||
        hoverOnly && block !== hovered || preferences.pageScope === 'main' && main && !main.contains(block) ||
        matches(block, rule?.excludeSelectors) || rule?.includeSelectors && !matches(block, rule.includeSelectors)) continue
      const source = sourceOfBlock(block, nodes)
      if (!source.trim() || failures.get(block) === source) continue
      const rect = block.getBoundingClientRect()
      const { top, bottom } = rect
      const distance = Math.max(top - height, -bottom, 0)
      const ahead = scrollingDown ? top >= height : bottom <= 0
      const previous = reconnectAttempts.get(block)
      candidates.push({ block, band: visible(block, rect) ? 0 : distance <= PREFETCH_MARGIN ? (ahead ? 1 : 2) : 3, distance, deferred: previous?.source === source && previous.count >= 3 })
    }
    if (prioritizeViewport) {
      const offscreen: (HTMLElement | Document)[] = []
      let freshVisible = false
      for (const key of pending.keys()) {
        if (key === document || key instanceof HTMLElement && !visible(key, key.getBoundingClientRect())) offscreen.push(key)
        else if (key instanceof HTMLElement) {
          const attempt = reconnectAttempts.get(key)
          const nodes = blocks.get(key)
          if (!attempt || !nodes || attempt.source !== sourceOfBlock(key, nodes) || attempt.count < 3) freshVisible = true
        }
      }
      const hasVisibleWork = freshVisible || candidates.some(item => item.band === 0 && !item.deferred)
      if (!scrollTimer && !hasVisibleWork && candidates.some(item => !item.deferred)) {
        prioritizeViewport = false
      } else if (hasVisibleWork || pending.size > offscreen.length && scrollTimer) {
        for (const key of offscreen) {
          const job = pending.get(key)!
          pending.delete(key)
          job.abort()
        }
      } else if (!scrollTimer) prioritizeViewport = false
    }
    queue = candidates.filter(item => !prioritizeViewport || item.band === 0)
      .sort((a, b) => Number(a.deferred) - Number(b.deferred) || a.band - b.band || a.distance - b.distance).map(item => item.block).reverse()
    viewportDirty = false
    orderDirty = false
  }

  function drain() {
    if (!controller || !settings || !document.body) return
    const preferences = settings
    if (discoveryDirty) discover()
    if (orderDirty) prioritize(preferences)
    const titleRetry = reconnectAttempts.get(document)
    const deferTitle = titleRetry?.source === document.title && titleRetry.count >= 3 && queue.length > 0
    if (!hoverOnly && !prioritizeViewport && pending.size < concurrency && preferences.translateTitle && !pending.has(document) &&
      !deferTitle && document.title.trim() && document.title !== title?.result && document.title !== failedTitle) {
      const source = document.title
      dispatch(document, source, async signal => {
        const result = await requestText(source, preferences.sourceLanguage, preferences.pageLanguage, signal)
        if (!signal.aborted && document.title === source) {
          title = { source, result }
          document.documentElement.dataset.nolaSourceTitle = source
          document.documentElement.dataset.nolaResultTitle = result
          document.title = result
        }
      }, () => { failedTitle = source })
    }
    while (queue.length && pending.size < concurrency) {
      const block = queue.pop()!
      if (!block.isConnected || translations.has(block) || controlValues.has(block) || pending.has(block)) continue
      const nodes = blocks.get(block)!
      const source = sourceOfBlock(block, nodes)
      dispatch(block, source, signal => translateBlock(block, nodes, preferences, signal), () => failures.set(block, source))
    }
  }
  async function translateBlock(block: HTMLElement, nodes: Text[], preferences: Preferences, signal: AbortSignal) {
    const { pageLanguage: target } = preferences
    const sourceCode = block.closest('[lang]')?.getAttribute('lang')
    const source = preferences.sourceLanguage !== 'auto' ? preferences.sourceLanguage : sourceCode ? normalizeLanguage(sourceCode).split(/-(?!Hant$)/)[0] : 'auto'
    const translatable = (text: string) => /\p{L}/u.test(text) && text.length >= (preferences.minTextLength ?? 1) &&
      source !== target && !preferences.skipLanguages?.includes(source)
    if (!nodes.length) {
      const label = buttonLabel(block)
      if (!label) return
      const result = translatable(label.trim()) ? await requestText(label.trim(), source, target, signal) || label : label
      if (signal.aborted || !block.isConnected) return
      if (buttonLabel(block) !== label) { discoveryDirty = true; return }
      controlValues.set(block, { source: label, result })
      if (result !== label) {
        block.dataset.nolaControlSource = label
        block.dataset.nolaControlResult = result
        block.setAttribute('value', result)
      }
      return
    }
    const originals = nodes.map(node => node.data)
    const text = originals.join('').trim()
    const flow = translationFlow(block)
    const control = controls.has(block) || flow === 'skip'
    if (!translatable(text)) {
      translations.set(block, nodes.map(node => ({ node, source: node.data, result: node.data })))
      return
    }

    const runs = sourceRuns(block, nodes, control)
    const manual = manpageParagraph(block) === block
    const sourceTexts = runs.map(run => sourceOf(run.nodes))
    const functionNames = manual ? runs.map(({ wrappers }, index) =>
      /^[a-z_]\w*$/iu.test(sourceTexts[index].trim()) && wrappers.some(wrapper => wrapper.matches('b,strong,i,em')) &&
      sourceTexts[index + 1]?.trimStart().startsWith('(')) : []
    let loading: HTMLElement | undefined
    let loadingTimer: number | undefined
    const clearLoading = () => {
      window.clearTimeout(loadingTimer)
      loading?.remove()
      signal.removeEventListener('abort', clearLoading)
    }
    const scheduleLoading = () => {
      if (loadingTimer !== undefined || control) return
      loadingTimer = window.setTimeout(() => {
        if (signal.aborted || !block.isConnected) return
        loading = document.createElement('span')
        loading.dataset.nolaLoading = ''
        loading.setAttribute('aria-hidden', 'true')
        loading.style.cssText = manual ? 'display:block' : 'display:inline;'
        const spinner = document.createElement('span')
        spinner.style.cssText = 'display:inline-block;width:0.8em;height:0.8em;margin-inline-start:0.4em;vertical-align:middle;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;opacity:0.6;pointer-events:none'
        loading.append(spinner)
        block.append(loading)
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          spinner.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: 900, iterations: Infinity })
        }
      }, hoverOnly ? 0 : 180)
      signal.addEventListener('abort', clearLoading, { once: true })
    }
    const translateRun = async (value: string, index: number) => {
      const signatureEnd = functionNames[index - 1] ? value.match(/^\s*\(\)\s*/u)?.[0] ?? '' : ''
      const sourceText = value.slice(signatureEnd.length)
      const content = manual ? sourceText.trim().replace(/\r?\n\s*/gu, ' ') : sourceText.trim()
      if (runs[index].literal || functionNames[index] || !/\p{L}/u.test(content)) {
        return value
      }
      scheduleLoading()
      const chunks: string[] = []
      let rest = content
      while (rest.length > 4000) {
        const boundary = rest.lastIndexOf(' ', 4000)
        const end = boundary > 2000 ? boundary : 4000
        chunks.push(await requestText(rest.slice(0, end), source, target, signal))
        rest = rest.slice(end).trimStart()
      }
      if (rest) chunks.push(await requestText(rest, source, target, signal))
      return signatureEnd + sourceText.replace(/\S[\s\S]*\S|\S/u, () => chunks.join(' '))
    }
    const results: string[] = []
    let nextRun = 0
    const translateRuns = async () => {
      while (nextRun < sourceTexts.length) {
        signal.throwIfAborted()
        const index = nextRun++
        results[index] = await translateRun(sourceTexts[index], index)
      }
    }
    try {
      await Promise.all(sourceTexts.length > 1 ? [translateRuns(), translateRuns()] : [translateRuns()])
    } finally {
      clearLoading()
    }

    const current = blocks.get(block)
    if (signal.aborted || !block.isConnected) return
    if (!current || current.length !== nodes.length || nodes.some((node, index) =>
      node !== current[index] || node.data !== originals[index] || !block.contains(node))) {
      orderDirty = true
      return
    }

    const currentRuns = sourceRuns(block, nodes, control)
    if (currentRuns.length !== sourceTexts.length || currentRuns.some((run, index) => sourceOf(run.nodes) !== sourceTexts[index])) {
      orderDirty = true
      return
    }
    const rendered = { runs: currentRuns, sourceTexts, results, control }
    renderResults.set(block, rendered)
    translations.set(block, present(block, rendered, settings ?? preferences))
  }
  const start = (only?: HTMLElement) => {
    if (!settings || settings.pageProvider === DISABLED_PROVIDER || !siteEnabled(settings, location.href)) return
    hoverOnly = Boolean(only); hovered = only ?? null
    if (controller) {
      if ((error || silentFailure) && !only) {
        error = failedTitle = undefined
        failures = new WeakMap()
        silentFailure = false
      }
      orderDirty = true
      schedule()
      return
    }
    stop()
    controller = new AbortController()
    prioritizeViewport = !only
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'class', 'style', 'name', 'type', 'value', 'translate'] })
    window.addEventListener('pointerover', hover)
    window.addEventListener('scroll', refreshOrder, true)
    window.addEventListener('resize', refreshOrder)
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
      if (next.pageProvider === DISABLED_PROVIDER || !siteEnabled(next, location.href)) { stop(); return }
      if (previous && (previous.pageStyle !== next.pageStyle || previous.pageCustomCss !== next.pageCustomCss)) {
        for (const [block, entries] of translations) {
          const annotation = entries[0]?.annotation
          if (annotation) {
            applyTranslationStyle(annotation, next, needsInlineSizeContainment(block))
            alignManpageTranslation(block, annotation)
          }
        }
      }
      if (controller && previous && (previous.sourceLanguage !== next.sourceLanguage || previous.pageProvider !== next.pageProvider || previous.pagePrompt !== next.pagePrompt || previous.pageLanguage !== next.pageLanguage || previous.pageScope !== next.pageScope || previous.hoverTranslation !== next.hoverTranslation || previous.translateTitle !== next.translateTitle || previous.minTextLength !== next.minTextLength || JSON.stringify(previous.siteRules) !== JSON.stringify(next.siteRules) || JSON.stringify(previous.skipLanguages) !== JSON.stringify(next.skipLanguages))) { stop(); start(); return }
      if (controller && previous && previous.pageDisplay !== next.pageDisplay) {
        discover()
        for (const [block, rendered] of renderResults) {
          const entries = translations.get(block)
          if (!entries || rendered.control) continue
          restore(entries)
          translations.set(block, present(block, rendered, next))
        }
        schedule()
      }
    },
  }
}

function removeAnnotation(annotation: HTMLElement, group?: HTMLElement): void {
  for (const element of annotationOverrides.get(annotation) ?? []) {
    const override = layoutOverrides.get(element)
    if (!override) continue
    override.owners.delete(annotation)
    if (override.owners.size) continue
    if (override.restoreExact && element.getAttribute('style') === override.applied) {
      if (override.original === null) element.removeAttribute('style')
      else element.setAttribute('style', override.original)
      delete element.dataset.nolaLayout
    } else {
      restoreLayoutValues(element, override.values)
    }
    layoutOverrides.delete(element)
  }
  annotationOverrides.delete(annotation)
  const block = annotation.parentElement
  if (block && annotation.dataset.nolaFlexWrap !== undefined && block.style.getPropertyValue('flex-wrap') === 'wrap' && block.style.getPropertyPriority('flex-wrap') === 'important') {
    const previous = annotation.dataset.nolaFlexWrap
    if (previous) block.style.setProperty('flex-wrap', previous, annotation.dataset.nolaFlexPriority ?? '')
    else block.style.removeProperty('flex-wrap')
  }
  if (block && annotation.dataset.nolaHeight !== undefined && block.style.getPropertyValue('height') === 'auto' && block.style.getPropertyPriority('height') === 'important') {
    const previous = annotation.dataset.nolaHeight
    if (previous) block.style.setProperty('height', previous, annotation.dataset.nolaHeightPriority ?? '')
    else block.style.removeProperty('height')
  }
  annotation.remove()
  if (group?.parentNode) group.replaceWith(...group.childNodes)
}

export function restorePageTranslationArtifacts(doc: Document): void {
  for (const input of doc.querySelectorAll<HTMLInputElement>('input[data-nola-control-source][data-nola-control-result]')) {
    if (isValueButton(input)) restoreControlValue(input, { source: input.dataset.nolaControlSource!, result: input.dataset.nolaControlResult! })
    else {
      delete input.dataset.nolaControlSource
      delete input.dataset.nolaControlResult
    }
  }
  for (const marker of doc.querySelectorAll<HTMLTemplateElement>('template[data-nola-original]')) {
    const node = marker.nextSibling
    if (node?.nodeType === Node.TEXT_NODE && node.textContent === marker.dataset.nolaResult) node.textContent = marker.dataset.nolaOriginal ?? ''
    marker.remove()
  }
  doc.querySelectorAll<HTMLElement>('[data-nola-loading]').forEach(loading => loading.remove())
  doc.querySelectorAll<HTMLElement>('[data-nola-translation]').forEach(annotation => removeAnnotation(annotation))
  doc.querySelectorAll<HTMLElement>('[data-nola-single-slot]').forEach(unwrapSlot)
  doc.querySelectorAll<HTMLElement>('[data-nola-source-line]').forEach(group => group.replaceWith(...group.childNodes))
  restoreManpage(doc, true)
  for (const element of doc.querySelectorAll<HTMLElement>('[data-nola-layout]')) {
    try {
      const stored: unknown = JSON.parse(element.dataset.nolaLayout ?? '[]')
      if (Array.isArray(stored)) restoreLayoutValues(element, stored.filter((entry): entry is LayoutValue =>
        Array.isArray(entry) && entry.length === 3 && Object.hasOwn(layoutProperties, entry[0]) &&
        typeof entry[1] === 'string' && (entry[2] === '' || entry[2] === 'important')))
    } catch { /* Ignore stale page data. */ }
    delete element.dataset.nolaLayout
  }
  const data = doc.documentElement.dataset
  if (data.nolaSourceTitle !== undefined && doc.title === data.nolaResultTitle) doc.title = data.nolaSourceTitle
  delete data.nolaSourceTitle; delete data.nolaResultTitle
}
