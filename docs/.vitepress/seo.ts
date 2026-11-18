import type { DefaultTheme, HeadConfig, PageData, TransformContext } from 'vitepress'
import { copy, docsNav, localeNames, siteUrl, type Locale } from './theme/content'
import { defaultLocale, homePath, localeOfPath } from './theme/siteLocale'
import { visSidebar } from './vis-sidebar'

const languages = Object.keys(localeNames) as Locale[]
const socialLocales: Record<Locale, string> = {
  'zh-CN': 'zh_CN', 'zh-TW': 'zh_TW', 'zh-HK': 'zh_HK', en: 'en_US', ja: 'ja_JP', ko: 'ko_KR',
}
const screenshotAlt: Record<Locale, string> = {
  'zh-CN': 'Nola Translator 桌面应用首页截图',
  'zh-TW': 'Nola Translator 桌面應用程式首頁截圖',
  'zh-HK': 'Nola Translator 桌面應用程式首頁截圖',
  en: 'Screenshot of the Nola Translator desktop home screen',
  ja: 'Nola Translator デスクトップ版ホーム画面のスクリーンショット',
  ko: 'Nola Translator 데스크톱 앱 홈 화면 스크린샷',
}
const helpSections = {
  'getting-started': 'gettingStarted',
  features: 'features',
  troubleshooting: 'troubleshooting',
  contributing: 'contributing',
  developers: 'developers',
  legal: 'legal',
} as const

interface Crumb { text: string; path: string }

const pagePath = (page: string) => '/' + page.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '')
const canonicalPath = (path: string) => path === '/en/' ? '/' : path

function designAncestors(items: DefaultTheme.SidebarItem[], path: string): Crumb[] | undefined {
  for (const item of items) {
    if (item.link === path) return []
    const children = item.items && designAncestors(item.items, path)
    if (children) return item.link && item.text ? [{ text: item.text, path: item.link }, ...children] : children
  }
}

function breadcrumbs(page: PageData): Crumb[] {
  const path = pagePath(page.relativePath)
  if (path === '/vis/' || page.frontmatter.noindex) return []
  if (path.startsWith('/vis/')) {
    const ancestors = designAncestors(visSidebar, path) ?? [{ text: copy['zh-CN'].nav.designDocs, path: '/vis/' }]
    return [...ancestors, { text: page.title, path }]
  }
  const [, segment, section, article] = path.split('/')
  if (!Object.hasOwn(localeNames, segment) || !section || section === 'docs') return []
  const locale = segment as Locale
  const trail = [{ text: docsNav[locale].root, path: `/${locale}/docs` }]
  if (article && Object.hasOwn(helpSections, section)) {
    const sectionTitle = helpSections[section as keyof typeof helpSections]
    trail.push({ text: docsNav[locale][sectionTitle], path: `/${locale}/${section}/` })
  }
  return [...trail, { text: page.title, path }]
}

function alternates(path: string, indexable: ReadonlySet<string>) {
  const [, locale, ...rest] = path.split('/')
  if (path !== '/' && !Object.hasOwn(localeNames, locale)) return []
  const isHome = path === '/' || rest.join('/') === ''
  const links = languages.flatMap(lang => {
    const url = isHome ? homePath(lang, '/') : `/${lang}/${rest.join('/')}`
    return indexable.has(url) ? [{ lang, url }] : []
  })
  if (links.length < 2) return []
  const english = links.find(link => link.lang === defaultLocale)
  return english ? [...links, { lang: 'x-default', url: english.url }] : links
}

export function siteSeo(base: string) {
  const indexable = new Set<string>()
  const withBase = (path: string) => base + path.slice(1)
  const absolute = (path: string) => siteUrl + withBase(path)
  const jsonLd = (type: string, data: Record<string, unknown>): HeadConfig => [
    'script', { type: 'application/ld+json' },
    JSON.stringify({ '@context': 'https://schema.org', '@type': type, ...data }).replaceAll('<', '\\u003c'),
  ]

  return {
    registerPage(page: PageData) {
      const path = pagePath(page.relativePath)
      if (path !== '/en/' && path !== '/404' && !page.frontmatter.noindex) indexable.add(path)
      else indexable.delete(path)
      page.frontmatter.breadcrumbs = breadcrumbs(page)
    },
    sitemap: {
      hostname: siteUrl,
      transformItems<T extends { url: string }>(items: T[]) {
        return items.flatMap(item => {
          const path = '/' + item.url.replace(/^\//, '')
          if (!indexable.has(path)) return []
          const links = alternates(path, indexable).map(({ lang, url }) => ({ lang, url: withBase(url) }))
          return [{ ...item, url: withBase(path), links }]
        })
      },
    },
    transformHead({ page, pageData, title, description }: TransformContext): HeadConfig[] {
      if (page === '404.md' || pageData.frontmatter.noindex) return [['meta', { name: 'robots', content: 'noindex' }]]
      const path = canonicalPath(pagePath(pageData.relativePath))
      const locale = localeOfPath(path, '/')
      const canonical = absolute(path)
      const image = absolute(`/screenshots/${locale}/home.png`)
      const tags: HeadConfig[] = [
        ['link', { rel: 'canonical', href: canonical }],
        ['meta', { property: 'og:type', content: 'website' }],
        ['meta', { property: 'og:site_name', content: 'Nola Translator' }],
        ['meta', { property: 'og:locale', content: socialLocales[locale] }],
        ['meta', { property: 'og:title', content: title }],
        ['meta', { property: 'og:description', content: description }],
        ['meta', { property: 'og:url', content: canonical }],
        ['meta', { property: 'og:image', content: image }],
        ['meta', { property: 'og:image:alt', content: screenshotAlt[locale] }],
        ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
        ['meta', { name: 'twitter:title', content: title }],
        ['meta', { name: 'twitter:description', content: description }],
        ['meta', { name: 'twitter:image', content: image }],
        ['meta', { name: 'twitter:image:alt', content: screenshotAlt[locale] }],
      ]
      for (const { lang, url } of alternates(path, indexable)) {
        tags.push(['link', { rel: 'alternate', hreflang: lang, href: absolute(url) }])
      }
      if (path === '/') tags.push(jsonLd('WebSite', { name: 'Nola Translator', url: canonical }))
      const trail = breadcrumbs(pageData)
      if (trail.length > 1) {
        tags.push(jsonLd('BreadcrumbList', {
          itemListElement: trail.map(({ text, path }, index) => ({
            '@type': 'ListItem', position: index + 1, name: text, item: absolute(path),
          })),
        }))
      }
      return tags
    },
  }
}
