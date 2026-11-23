import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { parse } from 'parse5'

const dist = fileURLToPath(new URL('../dist/', import.meta.url))
const { window } = new JSDOM()
const parser = new window.DOMParser()
const read = path => readFileSync(resolve(dist, path), 'utf8')
const parseHtml = path => parse(read(path))
const sitemap = parser.parseFromString(read('sitemap.xml'), 'text/xml')
const entries = [...sitemap.querySelectorAll('urlset > url')]
const urls = new Set(entries.map(entry => entry.querySelector('loc').textContent))
const origin = 'https://nola.xaviermc.top'
const base = process.env.DOCS_BASE ?? '/'
const home = origin + base
const fail = []
const check = (value, context, message) => {
  if (!value) fail.push(`${context}: ${message}`)
}
const children = node => node?.childNodes ?? []
const attr = (node, name) => node?.attrs?.find(attribute => attribute.name === name)?.value
const first = (node, tag) => children(node).find(child => child.tagName === tag)
function* elements(node, match) {
  for (const child of children(node)) {
    if (match(child)) yield child
    yield* elements(child, match)
  }
}
const elementsByTag = (node, tag) => elements(node, child => child.tagName === tag)
const contents = node => node?.value ?? children(node).map(contents).join('')
const headOf = doc => first(first(doc, 'html'), 'head')
const meta = (head, name) => attr(children(head).find(node =>
  node.tagName === 'meta' && (attr(node, 'name') === name || attr(node, 'property') === name)), 'content')
const robots = head => meta(head, 'robots')?.split(/[,\s]+/) ?? []
const headLinks = (head, rel) => children(head).filter(node => node.tagName === 'link' && attr(node, 'rel') === rel)
const references = new Map()
const descriptions = new Map()
const pendingDescriptions = {
  en: 'Documentation pending', ja: '執筆中', ko: '작성 예정',
  'zh-CN': '待补充', 'zh-HK': '待補充', 'zh-TW': '待補充',
}
const pendingValues = new Set(Object.values(pendingDescriptions))
const files = new Set(readdirSync(dist, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile())
  .map(entry => relative(dist, resolve(entry.parentPath, entry.name)).replaceAll('\\', '/')))
const sourcePages = [...files]
  .filter(path => /^(?:index\.html|(?:en|ja|ko|zh-CN|zh-HK|zh-TW|vis)\/.*\.html)$/.test(path))

for (const file of sourcePages) {
  const doc = parseHtml(file)
  const html = first(doc, 'html')
  const head = first(html, 'head')
  const body = first(html, 'body')
  const lang = attr(html, 'lang')
  const path = file.replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '')
  const url = home + path
  const noindex = robots(head).includes('noindex')
  const alias = file === 'en/index.html'
  const description = meta(head, 'description')?.trim()
  const title = contents(first(head, 'title')).trim()
  check(description, file, 'missing page description')
  check(title && !title.endsWith(' | Nola Translator'), file, 'title is empty or has the site suffix')
  check([...elementsByTag(body, 'h1')].length === 1, file, 'expected one static h1')
  check([...elementsByTag(body, 'img')].every(node => attr(node, 'alt') !== undefined), file, 'image missing alt')
  const anchors = [...elementsByTag(body, 'a')]
  for (const anchor of anchors) {
    const href = attr(anchor, 'href')
    if (!href || href.startsWith('#')) continue
    const target = new URL(href, url)
    if (target.origin !== origin || !target.pathname.startsWith(base)) continue
    const local = decodeURIComponent(target.pathname.slice(base.length)).replace(/\/$/, '')
    check(files.has(local) || files.has(local + '.html') ||
      files.has(local ? local + '/index.html' : 'index.html'), file, `broken link to ${target.pathname}`)
  }
  if (pendingValues.has(description)) {
    check(description === pendingDescriptions[lang], file, 'help placeholder description must match the page language')
    check(!noindex && urls.has(url), file, 'help placeholder must remain in sitemap')
  }
  if (noindex || alias) check(!urls.has(url), file, 'non-canonical or noindex URL is in sitemap')
  if (noindex) continue
  const canonicals = headLinks(head, 'canonical')
  check(canonicals.length === 1 && attr(canonicals[0], 'href') === (alias ? home : url), file, 'canonical URL mismatch')
  check(meta(head, 'og:description') === description && meta(head, 'twitter:description') === description,
    file, 'share descriptions differ from the page description')
  check(meta(head, 'og:title') === title && meta(head, 'twitter:title') === title,
    file, 'share titles differ from the page title')
  const image = meta(head, 'og:image')
  check(image?.startsWith(home) && existsSync(resolve(dist, image.slice(home.length))) &&
    meta(head, 'og:image:alt') && meta(head, 'twitter:image') === image, file, 'share image is missing or invalid')
  if (alias) continue
  check(urls.has(url), file, 'canonical URL missing from sitemap')
  if (!pendingValues.has(description)) {
    check(!descriptions.has(description), file, `description duplicates ${descriptions.get(description)}`)
    descriptions.set(description, file)
  }
  const alternates = new Map(headLinks(head, 'alternate').filter(link => attr(link, 'hreflang'))
    .map(link => [attr(link, 'hreflang'), attr(link, 'href')]))
  references.set(url, { lang, alternates })
  const structured = children(head).filter(node => node.tagName === 'script' && attr(node, 'type') === 'application/ld+json')
    .map(node => JSON.parse(contents(node)))
  if (url === home) {
    check(lang === 'en' && alternates.get('en') === home, file, 'default homepage must be English')
    check(structured.some(data => data['@type'] === 'WebSite' && data.url === home), file, 'missing WebSite markup')
    check(anchors.some(anchor => attr(anchor, 'href') === base + 'en/docs') &&
      anchors.filter(anchor => attr(anchor, 'hreflang')).length === 6, file, 'missing static language or documentation links')
  }
  const breadcrumb = structured.find(data => data['@type'] === 'BreadcrumbList')
  const nav = [...elementsByTag(body, 'nav')].find(node => attr(node, 'class')?.split(' ').includes('nola-doc-breadcrumb'))
  const visible = [...elementsByTag(nav, 'li')].map(item =>
    contents(children(item).find(node => node.tagName === 'a' || attr(node, 'aria-current') === 'page')).trim())
  if (visible.length > 1) {
    check(JSON.stringify(visible) === JSON.stringify(breadcrumb?.itemListElement.map(item => item.name)),
      file, 'visible and structured breadcrumbs differ')
    check(breadcrumb?.itemListElement.every(item => urls.has(item.item)), file, 'breadcrumb target missing from sitemap')
  } else {
    check(!breadcrumb, file, 'structured breadcrumbs require at least two items')
  }
}

check(sitemap.documentElement.namespaceURI === 'http://www.sitemaps.org/schemas/sitemap/0.9',
  'sitemap.xml', 'invalid sitemap XML namespace')
const stylesheet = [...sitemap.childNodes].find(node => node.target === 'xml-stylesheet')
check(stylesheet?.data === 'type="text/css" href="sitemap.css"' && files.has('sitemap.css'),
  'sitemap.xml', 'missing browser stylesheet')
check(entries.length > 0 && entries.length === urls.size, 'sitemap.xml', 'empty sitemap or duplicate URLs')
for (const entry of entries) {
  const url = entry.querySelector('loc').textContent
  const page = references.get(url)
  check(page, url, 'URL has no corresponding canonical page')
  if (!page) continue
  const namespace = 'http://www.w3.org/1999/xhtml'
  const links = [...entry.getElementsByTagNameNS(namespace, 'link')]
  check(links.length === page.alternates.size &&
    links.every(link => page.alternates.get(link.getAttribute('hreflang')) === link.getAttribute('href')),
  url, 'sitemap and HTML hreflang differ')
  for (const [lang, target] of page.alternates) {
    const translated = references.get(target)
    check(translated, url, `missing alternate ${target}`)
    if (lang === 'x-default' || !translated) continue
    check(translated.lang === lang && translated.alternates.get(page.lang) === url,
      url, `alternate language or return link mismatch at ${target}`)
  }
}
check(robots(headOf(parseHtml('demo/index.html'))).includes('noindex'), 'demo/index.html', 'missing noindex')
check(robots(headOf(parseHtml('404.html'))).includes('noindex'), '404.html', 'missing noindex')
check(read('robots.txt').includes(`Sitemap: ${origin}/sitemap.xml`), 'robots.txt', 'missing sitemap declaration')

if (fail.length) {
  console.error(fail.join('\n'))
  process.exitCode = 1
} else {
  console.log(`SEO checks passed for ${sourcePages.length} HTML pages and ${urls.size} sitemap URLs`)
}
window.close()
