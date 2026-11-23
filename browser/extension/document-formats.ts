import DOMPurify from 'dompurify'
import { BlobReader, BlobWriter, TextReader, TextWriter, ZipReader, ZipWriter, type FileEntry } from '@zip.js/zip.js'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import type { Node, Parent } from 'unist'

export const documentFormats = ['pdf', 'epub', 'docx', 'html', 'txt', 'md', 'xlsx', 'pptx'] as const
type Format = typeof documentFormats[number]
export interface DocumentUnit { id: number; source: string; image?: () => Promise<string> }
export type DocumentValues = ReadonlyMap<number, string>
export interface DocumentSection {
  name: string
  units: DocumentUnit[]
  markup(values: DocumentValues): string
  page?: {
    width: number
    height: number
    render(canvas: HTMLCanvasElement, scale: number): { promise: Promise<unknown>; cancel(): void }
    renderTranslated?(canvas: HTMLCanvasElement, values: DocumentValues, scale: number): { promise: Promise<unknown>; cancel(): void }
  }
}
export interface OpenDocument {
  format: Format
  sections: DocumentSection[]
  export(values: DocumentValues, language: string): Promise<Blob>
  dispose(): void
}

const MB = 1024 * 1024
const xmlParser = new DOMParser()
const xmlSerializer = new XMLSerializer()
const html = (tag = 'div') => document.createElement(tag)
const elements = (parent: Document | Element, name: string) => Array.from(parent.getElementsByTagNameNS('*', name))
const child = (parent: Element, name: string) => Array.from(parent.children).find(node => node.localName === name)
const attribute = (node: Element, name: string) => Array.from(node.attributes).find(item => item.localName === name)?.value ?? ''
function parseXml(source: string): XMLDocument {
  const content = source.replace(/<!DOCTYPE\s+html(?:\s+[^\[<>]*)?>/i, '')
  if (/<!DOCTYPE/i.test(content)) throw new Error('documentInvalid')
  const xml = xmlParser.parseFromString(content, 'application/xml')
  if (!xml.documentElement || xml.documentElement.localName === 'parsererror') throw new Error('documentInvalid')
  return xml
}

function unitFactory() {
  let id = 0
  return (source: string): DocumentUnit => {
    if (++id > 25000) throw new Error('documentLimit')
    return { id, source }
  }
}
type NewUnit = ReturnType<typeof unitFactory>

function textUnit(source: string, next: NewUnit): DocumentUnit | undefined {
  const text = source.trim()
  if (!text || !/\p{L}/u.test(text) || /^(?:https?:\/\/|mailto:)\S+$/i.test(text)) return
  return next(text)
}

function replaceText(source: string, unit: DocumentUnit, values: DocumentValues) {
  const translated = values.get(unit.id)
  return translated === undefined ? source : source.replace(source.trim(), () => translated)
}

function markupView(root: HTMLElement, values: DocumentValues) {
  const copy = root.cloneNode(true) as HTMLElement
  for (const node of copy.querySelectorAll<HTMLElement>('[data-unit]')) {
    const value = values.get(Number(node.dataset.unit))
    if (value !== undefined) node.textContent = value
  }
  return copy.innerHTML
}

function addPreviewUnit(parent: HTMLElement, source: string, unit?: DocumentUnit) {
  const span = html('span')
  if (unit) span.dataset.unit = String(unit.id)
  span.textContent = source
  parent.append(span)
}

function openPlain(source: string, format: 'md' | 'txt'): OpenDocument {
  const next = unitFactory()
  const ranges: { start: number; end: number; unit: DocumentUnit; markdown?: boolean }[] = []
  const add = (start: number, end: number, value: string, markdown = false) => {
    const unit = textUnit(value, next)
    if (unit) ranges.push({ start, end, unit, markdown })
  }
  if (format === 'md') {
    const visit = (node: Node) => {
      const start = node.position?.start.offset, end = node.position?.end.offset
      if (node.type === 'text' && start !== undefined && end !== undefined) {
        const value = (node as Node & { value: string }).value
        add(start, end, value, true)
      }
      if ('children' in node) (node as Parent).children.forEach(visit)
    }
    visit(unified().use(remarkParse).use(remarkGfm).parse(source))
  } else {
    for (const match of source.matchAll(/[^\S\r\n]*\S[^\r\n]*(?:\r?\n[^\S\r\n]*\S[^\r\n]*)*/g)) {
      add(match.index, match.index + match[0].length, match[0])
    }
  }
  const write = (values: DocumentValues) => {
    const chunks: string[] = []
    let offset = 0
    for (const range of ranges) {
      const raw = source.slice(range.start, range.end)
      const value = values.get(range.unit.id)
      chunks.push(source.slice(offset, range.start), value === undefined ? raw : range.markdown
        ? (raw.match(/^\s*/u)?.[0] ?? '') + value.replace(/\r?\n/g, ' ').replace(/[\\`*_{}\[\]()#+.!|<>~-]/g, '\\$&') + (raw.match(/\s*$/u)?.[0] ?? '')
        : replaceText(raw, range.unit, values))
      offset = range.end
    }
    return chunks.join('') + source.slice(offset)
  }
  return { format, sections: [{ name: '', units: ranges.map(range => range.unit), markup: write }], export: async values => new Blob([write(values)], { type: format === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8' }), dispose() {} }
}

// Preview runs in an extension page. Only local images prepared by the importer may load there.
function cleanMarkup(source: DocumentFragment, images: ReadonlySet<string>) {
  for (const node of source.querySelectorAll('*')) {
    for (const name of node.getAttributeNames()) if (name.startsWith('on')) node.removeAttribute(name)
    if (node.hasAttribute('src') && (node.localName !== 'img' || !images.has(node.getAttribute('src')!))) node.removeAttribute('src')
  }
  const root = source.ownerDocument.createElement('div')
  root.append(source)
  DOMPurify.sanitize(root, {
    IN_PLACE: true, USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'link', 'iframe', 'form', 'video', 'audio', 'source', 'base', 'button', 'input', 'select', 'textarea', 'template'],
    FORBID_ATTR: ['style', 'srcset', 'ping', 'background', 'poster', 'autofocus', 'data-unit', 'class', 'id', 'name'],
    ADD_URI_SAFE_ATTR: ['src'],
  })
  for (const item of root.querySelectorAll('[src]')) {
    const src = item.getAttribute('src') ?? ''
    if (item.localName !== 'img' || !images.has(src)) item.removeAttribute('src')
  }
  for (const link of root.querySelectorAll('a[href]')) {
    const href = link.getAttribute('href') ?? ''
    if (!/^(?:https?:|mailto:|#)/i.test(href)) link.removeAttribute('href')
    link.setAttribute('target', '_blank')
    link.setAttribute('rel', 'noopener noreferrer')
  }
  return root
}

function webSection(root: HTMLElement, name: string, next: NewUnit, preview: (root: HTMLElement) => string) {
  const entries: { node: Text; unit: DocumentUnit; source: string }[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest('script, style, code, pre, kbd, samp, math, svg, [translate="no"]')) continue
    const source = node.nodeValue ?? ''
    const unit = textUnit(source, next)
    if (unit) entries.push({ node: node as Text, unit, source })
  }
  const apply = (values: DocumentValues) => {
    for (const entry of entries) entry.node.data = replaceText(entry.source, entry.unit, values)
  }
  const section: DocumentSection = {
    name, units: entries.map(entry => entry.unit),
    markup(values) { apply(values); return preview(root) },
  }
  return { section, apply }
}

function openHtml(source: string): OpenDocument {
  const parsed = document.createElement('template')
  parsed.innerHTML = source
  const title = parsed.content.querySelector('title')?.textContent ?? ''
  parsed.content.querySelectorAll('title').forEach(node => node.remove())
  const images = new Set(Array.from(parsed.content.querySelectorAll('img[src]'), image => image.getAttribute('src') ?? '')
    .filter(src => /^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(src)))
  const root = cleanMarkup(parsed.content, images)
  const { section, apply } = webSection(root, title, unitFactory(), value => value.innerHTML)
  return {
    format: 'html', sections: [section], dispose() {},
    async export(values, language) {
      apply(values)
      const page = document.implementation.createHTMLDocument(title)
      page.documentElement.lang = language
      const meta = page.createElement('meta')
      meta.setAttribute('charset', 'utf-8')
      page.head.prepend(meta)
      page.body.replaceChildren(...Array.from(root.childNodes, node => node.cloneNode(true)))
      return new Blob(['<!doctype html>\n', page.documentElement.outerHTML], { type: 'text/html;charset=utf-8' })
    },
  }
}

function resolvePart(base: string, target: string) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target)) return ''
  try {
    const url = new URL(target, new URL(base, 'https://package.invalid/'))
    return url.origin === 'https://package.invalid' ? decodeURIComponent(url.pathname.slice(1)) : ''
  } catch { return '' }
}

const rasterTypes: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }

async function openPackage(file: File, format: 'epub' | 'docx' | 'xlsx' | 'pptx'): Promise<OpenDocument> {
  const reader = new ZipReader(new BlobReader(file), { useWebWorkers: false })
  const urls = new Set<string>()
  const dispose = () => {
    for (const url of urls) URL.revokeObjectURL(url)
    void reader.close()
  }
  try {
    const files = new Map<string, FileEntry>()
    let bytes = 0
    for await (const entry of reader.getEntriesGenerator()) {
      if (entry.directory) continue
      bytes += entry.uncompressedSize
      if (bytes > 160 * MB || files.size >= 10000 || entry.encrypted || entry.filename.split('/').some(piece => piece === '..') || files.has(entry.filename)) throw new Error('documentLimit')
      files.set(entry.filename, entry)
    }
    const read = async (path: string) => {
      const entry = files.get(path)
      if (!entry || entry.uncompressedSize > 24 * MB) throw new Error('documentInvalid')
      return entry.getData(new TextWriter(), { checkSignature: true })
    }
    const readXml = async (path: string) => parseXml(await read(path))
    const changed = new Map<string, () => string>()
    const next = unitFactory()
    const sections: DocumentSection[] = []
    const edits: { node: Element; unit: DocumentUnit; source: string }[] = []
    const applyWeb: Array<(values: DocumentValues) => void> = []
    const assetUrls = new Map<string, string>()
    const asset = async (path: string) => {
      const known = assetUrls.get(path)
      if (known) return known
      const entry = files.get(path)
      const mime = rasterTypes[path.split('.').pop()?.toLowerCase() ?? '']
      if (!entry || !mime || entry.uncompressedSize > 12 * MB) return ''
      const url = URL.createObjectURL(await entry.getData(new BlobWriter(mime), { checkSignature: true }))
      assetUrls.set(path, url)
      urls.add(url)
      return url
    }
    const relationships = async (part: string) => {
      const slash = part.lastIndexOf('/')
      const path = part.slice(0, slash + 1) + '_rels/' + part.slice(slash + 1) + '.rels'
      if (!files.has(path)) return new Map<string, string>()
      return new Map(elements(await readXml(path), 'Relationship').map(rel => {
        const target = attribute(rel, 'Target')
        const link = attribute(rel, 'Type').endsWith('/hyperlink') && /^(?:https?:|mailto:)/i.test(target)
        return [attribute(rel, 'Id'), attribute(rel, 'TargetMode') === 'External' ? link ? target : '' : resolvePart(part, target)]
      }))
    }
    const edit = (node: Element, units: DocumentUnit[]) => {
      const source = node.textContent ?? ''
      const unit = textUnit(source, next)
      if (unit) { edits.push({ node, unit, source }); units.push(unit) }
      return unit
    }
    const register = (path: string, xml: XMLDocument) => changed.set(path, () => xmlSerializer.serializeToString(xml))
    const addSection = (name: string, view: HTMLElement, units: DocumentUnit[]) => sections.push({ name, units, markup: values => markupView(view, values) })
    if (format === 'epub') {
      if ((await read('mimetype')).trim() !== 'application/epub+zip') throw new Error('documentInvalid')
      const container = await readXml('META-INF/container.xml')
      const packagePath = attribute(elements(container, 'rootfile')[0] ?? container.documentElement, 'full-path')
      const opf = await readXml(packagePath)
      const manifest = new Map(elements(opf, 'item').map(item => [attribute(item, 'id'), item]))
      for (const ref of elements(opf, 'itemref')) {
        const item = manifest.get(attribute(ref, 'idref'))
        if (!item || !['application/xhtml+xml', 'text/html'].includes(attribute(item, 'media-type'))) continue
        const path = resolvePart(packagePath, attribute(item, 'href'))
        const xml = await readXml(path)
        const body = elements(xml, 'body')[0]
        if (!body) continue
        const assets = new Map<string, string>()
        for (const image of elements(body, 'img')) {
          const src = attribute(image, 'src')
          assets.set(src, await asset(resolvePart(path, src)))
        }
        const name = elements(xml, 'title')[0]?.textContent?.trim() ?? ''
        const { section, apply } = webSection(body as unknown as HTMLElement, name, next, value => {
          const wrapper = html('template') as HTMLTemplateElement
          wrapper.innerHTML = value.innerHTML
          for (const img of wrapper.content.querySelectorAll('img')) img.setAttribute('src', assets.get(img.getAttribute('src') ?? '') ?? '')
          return cleanMarkup(wrapper.content, urls).innerHTML
        })
        sections.push(section)
        applyWeb.push(apply)
        register(path, xml)
      }
    } else {
      const rootRels = await relationships('')
      const main = [...rootRels.values()].find(path => path.startsWith({ docx: 'word/', xlsx: 'xl/', pptx: 'ppt/' }[format]))
      if (!main) throw new Error('documentInvalid')
      const xml = await readXml(main)
      const refs = await relationships(main)
      if (format === 'docx') {
        for (const path of [main, ...[...refs.values()].filter(path => /\/(?:header\d*|footer\d*|footnotes|endnotes)\.xml$/i.test(path))]) {
          const doc = path === main ? xml : await readXml(path)
          const related = path === main ? refs : await relationships(path)
          const view = html()
          const units: DocumentUnit[] = []
          const render = async (source: Element, target: HTMLElement) => {
            for (const node of Array.from(source.children)) {
              const tag = node.localName
              if (tag === 'pPr' || tag === 'rPr' || tag === 'instrText' || tag === 'del') continue
              if (tag === 't' && node.prefix !== 'a') {
                addPreviewUnit(target, node.textContent ?? '', edit(node, units))
                continue
              }
              if (tag === 'br' || tag === 'cr') { target.append(html('br')); continue }
              if (tag === 'tab') { target.append('    '); continue }
              if (tag === 'drawing') {
                for (const blip of elements(node, 'blip')) {
                  const src = await asset(related.get(attribute(blip, 'embed')) ?? '')
                  if (src) { const img = document.createElement('img'); img.src = src; img.alt = ''; target.append(img) }
                }
                continue
              }
              const heading = tag === 'p' ? /^Heading([1-6])$/i.exec(attribute(elements(node, 'pStyle')[0] ?? node, 'val')) : null
              const href = tag === 'hyperlink' ? related.get(attribute(node, 'id')) : undefined
              const converted = heading ? 'h' + heading[1] : href ? 'a' : ({ p: 'p', tbl: 'table', tr: 'tr', tc: 'td' } as Record<string, string>)[tag]
              let container = converted ? html(converted) : target
              if (href && /^(?:https?:|mailto:)/i.test(href)) {
                container.setAttribute('href', href)
                container.setAttribute('target', '_blank')
                container.setAttribute('rel', 'noopener noreferrer')
              }
              if (converted) target.append(container)
              const props = child(node, 'rPr')
              for (const [property, style] of [['b', 'strong'], ['i', 'em'], ['u', 'u']]) {
                const flag = props && child(props, property)
                if (!flag || ['0', 'false', 'none'].includes(attribute(flag, 'val'))) continue
                const styled = html(style)
                container.append(styled)
                container = styled
              }
              await render(node, container)
            }
          }
          await render(doc.documentElement, view)
          addSection(path === main ? '' : path.split('/').pop() ?? '', view, units)
          register(path, doc)
        }
      } else if (format === 'pptx') {
        for (const ref of elements(xml, 'sldId')) {
          const path = refs.get(ref.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? Array.from(ref.attributes).find(item => item.localName === 'id' && item.namespaceURI)?.value ?? '')
          if (!path) continue
          const slide = await readXml(path)
          const related = await relationships(path)
          const layout = [...related.values()].find(part => part.startsWith('ppt/slideLayouts/') && files.has(part))
          const layoutShapes = layout ? elements(await readXml(layout), 'sp') : []
          const view = html()
          const units: DocumentUnit[] = []
          const size = elements(xml, 'sldSz')[0]
          const width = Number(size && attribute(size, 'cx')) || 9144000
          const height = Number(size && attribute(size, 'cy')) || 5143500
          const canvas = html()
          canvas.className = 'nola-doc-slide'
          canvas.style.aspectRatio = String(width / height)
          view.append(canvas)
          const tree = elements(slide, 'spTree')[0]
          for (const shape of Array.from(tree?.children ?? []).filter(node => ['sp', 'pic', 'graphicFrame', 'grpSp'].includes(node.localName))) {
            const box = html()
            const ph = elements(shape, 'ph')[0]
            const layoutShape = ph && layoutShapes.find(item => {
              const candidate = elements(item, 'ph')[0]
              if (!candidate) return false
              const idx = attribute(ph, 'idx')
              return idx ? idx === attribute(candidate, 'idx') : attribute(ph, 'type') === attribute(candidate, 'type')
            })
            const transform = elements(shape, 'xfrm')[0] ?? (layoutShape && elements(layoutShape, 'xfrm')[0])
            const off = transform && child(transform, 'off'), ext = transform && child(transform, 'ext')
            if (off && ext) {
              box.style.position = 'absolute'
              box.style.insetInlineStart = Number(attribute(off, 'x')) * 100 / width + '%'
              box.style.insetBlockStart = Number(attribute(off, 'y')) * 100 / height + '%'
              box.style.width = Number(attribute(ext, 'cx')) * 100 / width + '%'
            }
            for (const blip of elements(shape, 'blip')) {
              const src = await asset(related.get(attribute(blip, 'embed')) ?? '')
              if (src) { const img = document.createElement('img'); img.src = src; img.alt = ''; box.append(img) }
            }
            for (const paragraph of elements(shape, 'p')) {
              const line = html('p')
              for (const node of elements(paragraph, 't')) addPreviewUnit(line, node.textContent ?? '', edit(node, units))
              box.append(line)
            }
            canvas.append(box)
          }
          addSection(String(sections.length + 1), view, units)
          register(path, slide)
        }
      } else {
        const strings = [...refs.values()].find(path => path.endsWith('/sharedStrings.xml'))
        const stringDoc = strings && await readXml(strings)
        const shared = stringDoc ? elements(stringDoc, 'si') : []
        const sharedEdits = new Map<Element, DocumentUnit | undefined>()
        if (strings && stringDoc) register(strings, stringDoc)
        for (const sheet of elements(xml, 'sheet')) {
          const path = refs.get(Array.from(sheet.attributes).find(item => item.localName === 'id' && item.namespaceURI)?.value ?? '')
          if (!path || !files.has(path) || !/\/worksheets\//.test(path)) continue
          const sheetXml = await readXml(path)
          const table = html('table')
          const units: DocumentUnit[] = []
          for (const row of elements(sheetXml, 'row')) {
            const tr = html('tr')
            const heading = html('th')
            heading.textContent = attribute(row, 'r')
            tr.append(heading)
            let previousColumn = 0
            for (const cell of elements(row, 'c')) {
              const td = html('td')
              td.dataset.cell = attribute(cell, 'r')
              td.title = td.dataset.cell
              const address = /^[A-Z]{1,3}/.exec(td.dataset.cell)?.[0]
              const column = address ? [...address].reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0) : previousColumn + 1
              if (column > previousColumn + 1) {
                const blank = document.createElement('td')
                blank.colSpan = Math.min(1000, column - previousColumn - 1)
                blank.setAttribute('aria-hidden', 'true')
                tr.append(blank)
              }
              previousColumn = column
              const value = child(cell, 'v')?.textContent ?? ''
              const type = attribute(cell, 't')
              const sharedNode = type === 's' && /^\d+$/.test(value) ? shared[Number(value)] : undefined
              if (!child(cell, 'f') && (sharedNode || type === 'inlineStr')) {
                for (const node of elements(sharedNode ?? cell, 't').filter(node => node.parentElement?.localName !== 'rPh')) {
                  let unit: DocumentUnit | undefined
                  if (sharedNode) {
                    if (!sharedEdits.has(node)) sharedEdits.set(node, edit(node, units))
                    unit = sharedEdits.get(node)
                  } else unit = edit(node, units)
                  if (unit && !units.includes(unit)) units.push(unit)
                  addPreviewUnit(td, node.textContent ?? '', unit)
                }
              } else td.textContent = sharedNode?.textContent ?? value
              tr.append(td)
            }
            table.append(tr)
          }
          addSection(attribute(sheet, 'name'), table, units)
          const section = sections.at(-1)!
          section.markup = values => '<table>' + markupView(table, values) + '</table>'
          register(path, sheetXml)
        }
      }
    }
    if (!sections.length) throw new Error('documentInvalid')
    return { format, sections, dispose, async export(values) {
      for (const entry of edits) entry.node.textContent = replaceText(entry.source, entry.unit, values)
      for (const apply of applyWeb) apply(values)
      const writer = new ZipWriter(new BlobWriter({ epub: 'application/epub+zip', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }[format]), { useWebWorkers: false })
      for (const path of format === 'epub' ? ['mimetype', ...[...files.keys()].filter(key => key !== 'mimetype')] : files.keys()) {
        const serialize = changed.get(path)
        const entry = files.get(path)!
        const content = serialize ? new TextReader(serialize()) : new BlobReader(await entry.getData(new BlobWriter(), { checkSignature: true }))
        const options = format === 'epub' && path === 'mimetype'
          ? { level: 0, extendedTimestamp: false, dataDescriptor: false }
          : { level: 6 }
        await writer.add(path, content, options)
      }
      return writer.close()
    } }
  } catch (error) { dispose(); throw error }
}

async function readText(file: File) {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes)
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes)
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

export async function openDocument(file: File): Promise<OpenDocument> {
  const ext = file.name.toLowerCase().split('.').pop()
  const format = (ext === 'htm' ? 'html' : ext === 'markdown' ? 'md' : ext) as Format
  if (!documentFormats.includes(format)) throw new Error('documentType')
  if (file.size > (format === 'pdf' ? 50 : 20) * MB) throw new Error('documentLimit')
  if (format === 'pdf') return (await import('./document-pdf')).openPdf(file)
  if (format === 'epub' || format === 'docx' || format === 'xlsx' || format === 'pptx') return openPackage(file, format)
  const source = await readText(file)
  return format === 'html' ? openHtml(source) : openPlain(source, format)
}
