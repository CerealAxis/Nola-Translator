interface Segment { end: number; prose: boolean }
interface Split { original: Text; pieces: Text[] }
interface PreparedPre { wrappers: Set<HTMLElement>; splits: Split[] }
interface Glyph { node: Text; offset: number }

const inline = new Set(['a', 'b', 'i', 'em', 'strong', 'span'])
const protection = '[translate=no],.notranslate,[data-notranslate=true],[contenteditable]:not([contenteditable=false])'
const paragraphs = new WeakSet<HTMLElement>()
const preparations = new Map<HTMLPreElement, PreparedPre>()
const maximumParagraphLength = 16_384
const headingLine = /^ {0,3}\S/u
const entryLine = /^\s*(?:%[a-z%]\s|bit\s+\d\b|[•●]\s)/iu
const codeLine = /^\s*(?:[$#]\s|\|\/|\/\*|\*\/|#\s*(?:include|define|if|endif)\b|[{}]\s*$)/mu
const codeStatement = /(?:;\s*$|\b(?:if|for|while)\s*\([^\n]*\)|\w+\([^\n]*\)\s*;)/mu

function manpageUrl(url: URL) {
  return ['http:', 'https:'].includes(url.protocol) && url.hostname === 'man7.org' &&
    /^\/linux\/man-pages\/man[1-9][a-z]*\/[^/]+\.html$/u.test(url.pathname)
}

function hasProse(text: string) {
  if (text.length > maximumParagraphLength || codeLine.test(text) || codeStatement.test(text) ||
    /^\s*Linux man-pages\s+\d/mu.test(text)) return false
  const words = text.replace(/\b[\w.-]+\([1-9][a-z]*\)|(?:https?:\/\/|\/)[^\s]+/giu, '')
    .match(/[a-z][a-z'-]+/giu)
  return Boolean(words && words.length >= 2 && words.some(word => /[a-z]{2}/u.test(word)))
}

function splitSections(text: string) {
  const segments: Segment[] = []
  let start = 0
  let offset = 0
  let previousHeading = false
  let sourceCode = false
  const close = (end: number) => {
    if (end <= start) return
    const section = text.slice(start, end)
    sourceCode ||= /^\s*(?:#\s*(?:include|define)\b|\/\*[^\n]*\.[ch]\s*\*\/)/mu.test(section)
    segments.push({ end, prose: !sourceCode && hasProse(section) })
    start = end
  }
  for (const line of text.match(/[^\n]*\n|[^\n]+$/gu) ?? []) {
    const heading = headingLine.test(line)
    if (!line.trim()) {
      close(offset)
      close(offset + line.length)
    } else if (heading || entryLine.test(line) || previousHeading && /^ {7,}\S/u.test(line)) {
      close(offset)
    }
    previousHeading = heading
    offset += line.length
  }
  close(text.length)
  return segments
}

function wrapSections(nodes: ChildNode[], record: PreparedPre) {
  if (nodes.length === 0 || nodes.length > 2048) return
  const text = nodes.map(node => node.textContent ?? '').join('')
  if (!text || text.length > 524_288) return
  const segments = splitSections(text)
  if (!segments.some(segment => segment.prose)) return
  let offset = 0
  let section = 0
  for (const node of nodes) {
    const end = offset + (node.textContent?.length ?? 0)
    while (section < segments.length - 1 && segments[section].end <= offset) section++
    if (node.nodeType !== Node.TEXT_NODE && (!(node instanceof HTMLElement) || !inline.has(node.localName) ||
      Array.from(node.querySelectorAll('*')).some(child => !inline.has(child.localName)) ||
      end > segments[section].end)) return
    offset = end
  }

  const wrappers = segments.map(({ prose }) => {
    const wrapper = nodes[0].ownerDocument!.createElement('span')
    wrapper.dataset.nolaManpage = prose ? 'prose' : 'literal'
    record.wrappers.add(wrapper)
    if (prose) paragraphs.add(wrapper)
    else wrapper.setAttribute('translate', 'no')
    return wrapper
  })
  nodes[0].before(...wrappers)
  offset = section = 0
  for (const node of nodes) {
    while (section < segments.length - 1 && segments[section].end <= offset) section++
    const end = offset + (node.textContent?.length ?? 0)
    if (node instanceof Text && end > segments[section].end) {
      const pieces = [node]
      let piece = node
      while (end > segments[section].end) {
        const rest = piece.splitText(segments[section].end - offset)
        wrappers[section].append(piece)
        pieces.push(rest)
        offset = segments[section++].end
        piece = rest
      }
      wrappers[section].append(piece)
      record.splits.push({ original: node, pieces })
    } else {
      wrappers[section].append(node)
    }
    offset = end
  }
}

function restorePre(pre: HTMLPreElement, record: PreparedPre) {
  for (const wrapper of record.wrappers) {
    paragraphs.delete(wrapper)
    wrapper.replaceWith(...wrapper.childNodes)
  }
  for (const { original, pieces } of record.splits) {
    if (original.parentNode && pieces.every((piece, index) => index === 0 || pieces[index - 1].nextSibling === piece)) {
      original.data = pieces.map(piece => piece.data).join('')
      for (const piece of pieces.slice(1)) piece.remove()
    }
  }
  preparations.delete(pre)
}

export function prepareManpage(doc: Document, url = new URL(doc.URL)) {
  if (!manpageUrl(url)) return
  for (const [pre, record] of preparations) {
    if (pre.ownerDocument === doc && !pre.isConnected) restorePre(pre, record)
  }
  for (const pre of doc.querySelectorAll('h2 + pre')) {
    if (!(pre instanceof HTMLPreElement) || !pre.previousElementSibling?.querySelector('a[id]') ||
      pre.previousElementSibling.querySelector('a[id="SYNOPSIS"]') || pre.closest(protection)) continue
    const record = preparations.get(pre) ?? { wrappers: new Set(), splits: [] }
    let pending: ChildNode[] = []
    for (const node of Array.from(pre.childNodes)) {
      if (node instanceof HTMLElement && record.wrappers.has(node)) {
        wrapSections(pending, record)
        pending = []
      } else pending.push(node)
    }
    wrapSections(pending, record)
    if (record.wrappers.size) preparations.set(pre, record)
  }
}

export function restoreManpage(doc: Document, removeOrphans = false) {
  for (const [pre, record] of preparations) {
    if (pre.ownerDocument === doc) restorePre(pre, record)
  }
  if (removeOrphans && manpageUrl(new URL(doc.URL))) {
    for (const wrapper of doc.querySelectorAll('h2 + pre > span[data-nola-manpage]')) {
      wrapper.replaceWith(...wrapper.childNodes)
    }
  }
}

function readParagraph(block: HTMLElement) {
  const walker = block.ownerDocument.createTreeWalker(block, NodeFilter.SHOW_TEXT)
  const nodes: { node: Text; start: number }[] = []
  let value = ''
  for (let next = walker.nextNode(); next && nodes.length < 2048; next = walker.nextNode()) {
    const node = next as Text
    if (!node.data.length || node.parentElement?.closest('[data-nola-translation]')) continue
    nodes.push({ node, start: value.length })
    value += node.data
    if (value.length > maximumParagraphLength) break
  }
  return { value, nodes }
}

export function manpageParagraph(element: HTMLElement) {
  const block = element.closest<HTMLElement>('[data-nola-manpage=prose]')
  return block && paragraphs.has(block) ? block : null
}

export function isManpageProse(block: HTMLElement) {
  return hasProse(readParagraph(block).value)
}

function glyphAt(nodes: ReturnType<typeof readParagraph>['nodes'], index: number): Glyph | undefined {
  for (let at = nodes.length - 1; at >= 0; at--) {
    const { node, start } = nodes[at]
    if (start <= index) return { node, offset: index - start }
  }
}

function measure(glyph?: Glyph) {
  if (!glyph || !glyph.node.isConnected) return
  const range = glyph.node.ownerDocument.createRange()
  range.setStart(glyph.node, glyph.offset)
  range.setEnd(glyph.node, glyph.offset + 1)
  const box = range.getBoundingClientRect?.()
  if (box && box.width > 0 && box.height > 0) return box
}

export function alignManpageTranslation(block: HTMLElement, annotation: HTMLElement) {
  const pre = block.closest('pre')
  if (!pre || !paragraphs.has(block)) return
  const { value, nodes } = readParagraph(block)
  const starts = Array.from(value.matchAll(/^[^\S\n]*([^\s])/gmu)).slice(0, 2)
  const [first, next] = starts.map(match => measure(glyphAt(nodes, match.index + match[0].length - 1)))
  const box = annotation.getBoundingClientRect()
  if (!first || box.width <= 0) return
  const left = (next ?? first).left - box.left
  if (left < 0 || first.left < box.left) return
  annotation.style.paddingInlineStart = `${left}px`
  annotation.style.textIndent = `${first.left - box.left - left}px`

  // The last physical line is usually short. Measure the shared prose column from wrapped lines.
  const widest = (container: Element) => {
    let columns = 0
    let end: Glyph | undefined
    for (const child of container.children) {
      if (!(child instanceof HTMLElement) || !paragraphs.has(child)) continue
      const text = readParagraph(child)
      const lines = Array.from(text.value.matchAll(/^.*\S.*$/gmu))
      for (const line of lines.slice(0, -1)) {
        const length = line[0].trimEnd().length
        if (length <= columns) continue
        columns = length
        end = glyphAt(text.nodes, line.index + length - 1)
      }
    }
    return { container, columns, end }
  }
  let reference = widest(pre)
  if (!reference.end) {
    for (const other of preparations.keys()) {
      if (other === pre || other.ownerDocument !== pre.ownerDocument) continue
      const candidate = widest(other)
      if (candidate.columns > reference.columns) reference = candidate
    }
  }
  const end = measure(reference.end)
  if (end) {
    const width = end.right - reference.container.getBoundingClientRect().left + pre.getBoundingClientRect().left - box.left
    if (width > left) annotation.style.maxInlineSize = `min(100%, ${width}px)`
  }
}
