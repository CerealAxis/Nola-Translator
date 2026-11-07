import { visSidebar } from './vis-sidebar'
import { defineConfig, postcssIsolateStyles, type DefaultTheme } from 'vitepress'
import { vitepressDemoPlugin } from 'vitepress-demo-plugin/markdown'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { groupIconMdPlugin, groupIconVitePlugin } from 'vitepress-plugin-group-icons'
import markdownItTaskCheckbox from 'markdown-it-task-checkbox'
import markdownItGithubAlerts from 'markdown-it-github-alerts'
import timeline from 'vitepress-markdown-timeline'
import { withMermaid } from 'vitepress-plugin-mermaid'
import { generateSidebar } from 'vitepress-sidebar'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { copy, docsNav, localeNames, localePath, downloadUrl, repositoryUrl, siteUrl, license, type Locale } from './theme/content'
import { normalizeEmptyIsCss } from '../scripts/normalize-empty-is-css.mjs'
import { shadcnDemoEntry } from './shadcn-demo-entry'

const base = process.env.DOCS_BASE ?? '/'
const shadcnPreview = fileURLToPath(new URL('../media-src/vis/shadcn-base/', import.meta.url)).replace(/\\/g, '/')
const shadcnPortal = 'body:has(.shadcn-base-doc) :is([data-base-ui-portal], [data-assistant-preview-portal])'
const shadcnScope = `:is(.shadcn-base-doc .vitepress-demo-plugin-preview > div, ${shadcnPortal})`

// Search engines and social previews need a per-page URL, which the static head array cannot provide.
const localeSegments: Record<Locale, string> = { 'zh-CN': 'zh-CN', 'zh-TW': 'zh-TW', 'zh-HK': 'zh-HK', en: 'en', ja: 'ja', ko: 'ko' }
const socialLocales: Record<Locale, string> = { 'zh-CN': 'zh_CN', 'zh-TW': 'zh_TW', 'zh-HK': 'zh_HK', en: 'en_US', ja: 'ja_JP', ko: 'ko_KR' }

const dropLocaleSegment = (relativePath: string, locale: Locale) => relativePath.startsWith(`${locale}/`) ? relativePath.slice(locale.length + 1) : relativePath

const routeFor = (locale: Locale, rest: string) => {
  const segment = localeSegments[locale]
  const clean = `${segment ? `${segment}/` : ''}${rest}`.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '')
  return `${base}${clean}`.replace(/\/{2,}/g, '/')
}

function transformHead({ pageData }: { pageData: { relativePath: string; title?: string; description?: string } }) {
  const leading = pageData.relativePath.split('/')[0]
  const locale = (Object.keys(localeSegments) as Locale[]).find(name => localeSegments[name] === leading) ?? 'zh-CN'
  const rest = dropLocaleSegment(pageData.relativePath, locale)
  const isVis = pageData.relativePath.startsWith('vis/')
  const canonical = pageData.relativePath === 'index.md' ? `${siteUrl}${base}` : isVis
    ? `${siteUrl}${base}${rest.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '')}`
    : `${siteUrl}${routeFor(locale, rest)}`
  const title = pageData.title ? `${pageData.title} | Nola Translator` : 'Nola Translator'
  const description = pageData.description || copy[locale].hero.subtitle
  const image = `${siteUrl}${base}screenshots/${locale === 'zh-CN' ? 'zh-CN' : locale}/home.png`

  const tags: import('vitepress').HeadConfig[] = [
    ['link', { rel: 'canonical', href: canonical }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'Nola Translator' }],
    ['meta', { property: 'og:locale', content: socialLocales[locale] }],
    ['meta', { property: 'og:title', content: title }],
    ['meta', { property: 'og:description', content: description }],
    ['meta', { property: 'og:url', content: canonical }],
    ['meta', { property: 'og:image', content: image }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: title }],
    ['meta', { name: 'twitter:description', content: description }],
    ['meta', { name: 'twitter:image', content: image }],
  ]
  if (!isVis) {
    for (const alternate of Object.keys(localeSegments) as Locale[]) {
      tags.push(['link', { rel: 'alternate', hreflang: alternate, href: `${siteUrl}${routeFor(alternate, rest)}` }])
    }
    tags.push(['link', { rel: 'alternate', hreflang: 'x-default', href: `${siteUrl}${routeFor('zh-CN', rest)}` }])
  }
  return tags
}
const workspace = fileURLToPath(new URL('../..', import.meta.url))

const searchTranslations = {
  'zh-CN': { button: { buttonText: '搜索', buttonAriaLabel: '搜索文档' }, modal: { displayDetails: '显示详细列表', resetButtonTitle: '清除搜索', backButtonTitle: '关闭搜索', noResultsText: '没有找到结果', footer: { selectText: '选择', selectKeyAriaLabel: '回车', navigateText: '导航', navigateUpKeyAriaLabel: '向上', navigateDownKeyAriaLabel: '向下', closeText: '关闭', closeKeyAriaLabel: 'Esc' } } },
  'zh-TW': { button: { buttonText: '搜尋', buttonAriaLabel: '搜尋文件' }, modal: { displayDetails: '顯示詳細列表', resetButtonTitle: '清除搜尋', backButtonTitle: '關閉搜尋', noResultsText: '找不到結果', footer: { selectText: '選擇', selectKeyAriaLabel: 'Enter', navigateText: '導覽', navigateUpKeyAriaLabel: '向上', navigateDownKeyAriaLabel: '向下', closeText: '關閉', closeKeyAriaLabel: 'Esc' } } },
  'zh-HK': { button: { buttonText: '搜尋', buttonAriaLabel: '搜尋文件' }, modal: { displayDetails: '顯示詳細清單', resetButtonTitle: '清除搜尋', backButtonTitle: '關閉搜尋', noResultsText: '找不到結果', footer: { selectText: '選擇', selectKeyAriaLabel: 'Enter', navigateText: '導覽', navigateUpKeyAriaLabel: '向上', navigateDownKeyAriaLabel: '向下', closeText: '關閉', closeKeyAriaLabel: 'Esc' } } },
  en: { button: { buttonText: 'Search', buttonAriaLabel: 'Search docs' }, modal: { displayDetails: 'Show detailed list', resetButtonTitle: 'Clear search', backButtonTitle: 'Close search', noResultsText: 'No results found', footer: { selectText: 'Select', selectKeyAriaLabel: 'Enter', navigateText: 'Navigate', navigateUpKeyAriaLabel: 'Arrow up', navigateDownKeyAriaLabel: 'Arrow down', closeText: 'Close', closeKeyAriaLabel: 'Esc' } } },
  ja: { button: { buttonText: '検索', buttonAriaLabel: 'ドキュメントを検索' }, modal: { displayDetails: '詳細を表示', resetButtonTitle: '検索をクリア', backButtonTitle: '検索を閉じる', noResultsText: '結果が見つかりません', footer: { selectText: '選択', selectKeyAriaLabel: 'Enter', navigateText: '移動', navigateUpKeyAriaLabel: '上矢印', navigateDownKeyAriaLabel: '下矢印', closeText: '閉じる', closeKeyAriaLabel: 'Esc' } } },
  ko: { button: { buttonText: '검색', buttonAriaLabel: '문서 검색' }, modal: { displayDetails: '자세한 목록 표시', resetButtonTitle: '검색 지우기', backButtonTitle: '검색 닫기', noResultsText: '결과가 없습니다', footer: { selectText: '선택', selectKeyAriaLabel: 'Enter', navigateText: '이동', navigateUpKeyAriaLabel: '위쪽 화살표', navigateDownKeyAriaLabel: '아래쪽 화살표', closeText: '닫기', closeKeyAriaLabel: 'Esc' } } },
} satisfies Record<Locale, import('vitepress').DefaultTheme.LocalSearchOptions['translations']>

const sidebarForLocale = (locale: Locale) => {
  const path = localePath(locale)
  const localeFolder = locale
  const label = docsNav[locale].root
  const sidebar = generateSidebar({
    documentRootPath: './help-docs',
    ...(localeFolder ? { scanStartPath: localeFolder } : {}),
    resolvePath: path,
    useTitleFromFileHeading: true,
    useFolderTitleFromIndexFile: true,
    useFolderLinkFromIndexFile: true,
    includeRootIndexFile: false,
    includeFolderIndexFile: false,
    excludeByGlobPattern: [
      'README.md', 'docs.md',
      ...Object.keys(localeNames).filter(name => name !== 'zh-CN').map(name => `${name}/**`),
    ],
    rootGroupText: label,
    rootGroupLink: `${path}docs`,
    collapsed: true,
    collapseDepth: 1,
    manualSortFileNameByPriority: [
      'getting-started', 'features', 'troubleshooting', 'contributing', 'developers', 'legal',
      'introduction.md', 'download-and-install.md', 'environment.md', 'local-models.md', 'cloud-models.md',
      'live-translation.md', 'floating-captions.md', 'browser-captions.md', 'settings.md',
      'feedback.md', 'faq.md',
      'how-to-contribute.md', 'writing-guidelines.md',
      'development-setup.md', 'gpg-signing.md', 'api.md',
      'user-agreement.md', 'privacy-policy.md',
    ],
  })
  const prefixLinks = (items: DefaultTheme.SidebarItem[]): DefaultTheme.SidebarItem[] => items.map(item => ({
    ...item,
    ...(item.link && !item.link.startsWith('/') ? { link: `${path}${item.link}` } : {}),
    ...(item.items ? { items: prefixLinks(item.items) } : {}),
  }))

  if (Array.isArray(sidebar)) return prefixLinks(sidebar)
  return Object.fromEntries(Object.entries(sidebar).map(([key, value]) => Array.isArray(value)
    ? [key, prefixLinks(value)]
    : [key, { ...value, items: prefixLinks(value.items) }]))
}

const locales = Object.fromEntries((Object.keys(localeNames) as Locale[]).map(locale => {
  const text = copy[locale]
  const path = localePath(locale)
  const tutorialSidebar = sidebarForLocale(locale)
  return [locale === 'zh-CN' ? 'root' : locale, {
    ...(locale === 'zh-CN' ? { link: path } : {}),
    label: localeNames[locale],
    lang: locale,
    title: 'Nola Translator',
    description: text.hero.subtitle,
    themeConfig: {
      nav: [
        { text: text.nav.home, link: path },
        ...(locale === 'zh-CN' ? [{ text: '设计原则', link: '/vis/principles/structure' }] : []),
        { text: docsNav[locale].root.replace(/^Nola Translator\s+/, ''), link: path + 'docs' },
        { text: text.nav.download, link: downloadUrl },
      ],
      sidebar: locale === 'zh-CN' ? {
        '/vis/': visSidebar,
        ...(Array.isArray(tutorialSidebar) ? { '/': tutorialSidebar } : tutorialSidebar),
      } : tutorialSidebar,
      outline: { level: [2, 3], label: text.documentation.outline },
      docFooter: { prev: text.documentation.previous, next: text.documentation.next },
      editLink: { pattern: `${repositoryUrl}/edit/main/docs/:path`, text: text.documentation.editPage },
      lastUpdated: { text: text.documentation.lastUpdated, formatOptions: { dateStyle: 'medium', timeStyle: 'short' } },
      returnToTopLabel: text.documentation.backToTop,
      sidebarMenuLabel: text.nav.menu,
      skipToContentLabel: text.nav.skip,
      langMenuLabel: text.nav.language,
    },
  }]
}))

export default withMermaid(defineConfig({
  base,
  title: 'Nola Translator',
  description: copy['zh-CN'].hero.subtitle,
  lang: 'zh-CN',
  srcDir: '.',
  rewrites: {
    'help-docs/:path*': ':path*',
    'design-system/:path*': 'vis/:path*',
  },
  outDir: './dist',
  srcExclude: ['**/README.md', 'PRD/**', 'media-src/**', 'scripts/**', 'public/**', 'dist/**', 'node_modules/**'],
  cleanUrls: true,
  appearance: true,
  lastUpdated: true,
  sitemap: { hostname: siteUrl },
  transformHead,
  transformPageData(page) {
    if (page.relativePath.startsWith('vis/')) {
      const classes = page.frontmatter.pageClass
      if (typeof classes !== 'string' || !classes.split(/\s+/).includes('shadcn-base-doc')) {
        page.frontmatter.pageClass = page.relativePath.startsWith('vis/principles/')
          ? 'nola-vis-doc nola-vis-principles' : 'nola-vis-doc'
      }
      page.frontmatter.comments = false
    }
  },
  markdown: {
    lineNumbers: true,
    math: true,
    image: { lazyLoad: true },
    config(md) {
      md.set({ linkify: true })
      // VitePress core has no task-list rule; task-list.css styles the markup this produces.
      md.use(markdownItTaskCheckbox)
      md.use(markdownItGithubAlerts)
      md.use(timeline)
      md.use(vitepressDemoPlugin, {
        demoDir: resolve(workspace, 'docs/media-src/vis/demos'),
        locale: { 'zh-CN': 'zh-CN' },
        stackblitz: { show: false },
        codesandbox: { show: false },
      })
      // Produces the .vp-code-block-title / .vp-code-group markup styled by vp-code-title.css and vp-code-group.css.
      md.use(groupIconMdPlugin)
    },
  },
  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}nola-logo.svg` }], ['meta', { name: 'theme-color', content: '#f6f9ff' }]],
  locales,
  vite: {
    plugins: [shadcnDemoEntry(), react({ exclude: /node_modules|\.vitepress\/cache/ }), tailwindcss(), groupIconVitePlugin()],
    css: { postcss: { plugins: [
      postcssIsolateStyles({
        includeFiles: [/vp-doc\.css/, /base\.css/],
        prefix: `:not(:where(.vp-raw, .vp-raw *, ${shadcnPortal}, ${shadcnPortal} *))`,
      }),
      postcssIsolateStyles({
        includeFiles: [/shadcn-base[/\\]preview\.css(?:\?|$)/],
        prefix: shadcnScope,
        transform(scope, selector, scopedSelector, _file, rule) {
          for (let parent = rule.parent; parent; parent = parent.parent) {
            if (parent.type === 'rule') return selector
          }
          if (selector === '.dark') return `.dark ${scope}`
          if ([':root', ':host', 'html', 'body'].includes(selector)) return scope
          return scopedSelector
        },
      }),
      normalizeEmptyIsCss(),
    ] } },
    resolve: {
      dedupe: ['@assistant-ui/react', '@assistant-ui/core', '@assistant-ui/store', '@assistant-ui/tap'],
      alias: [
        { find: /^@\/(?:styles\/(?:base-(?:nova|rhea)|radix-rhea)\/ui(?:-rtl)?|registry\/(?:base-nova|new-york-v4)\/ui)\//, replacement: shadcnPreview + 'ui/' },
        { find: /^@\/(components\/(?:language-selector|markdown|message-animated)|hooks\/(?:use-copy-to-clipboard|use-media-query|use-mobile)|lib\/(?:ai|message-animations)|registry\/(?:bases\/base|icons)\/.*)$/, replacement: shadcnPreview + '$1' },
        { find: '@/registry/base-nova/hooks/use-mobile', replacement: shadcnPreview + 'hooks/use-mobile.ts' },
        { find: '@/app/(create)/components/icon-placeholder', replacement: shadcnPreview + 'icon-placeholder.jsx' },
        { find: 'next/image', replacement: shadcnPreview + 'image.jsx' },
        { find: 'next/link', replacement: shadcnPreview + 'link.jsx' },
        { find: 'next/font/google', replacement: shadcnPreview + 'system-font.js' },
        { find: /^cn$/, replacement: resolve(workspace, 'src/renderer/lib/utils.ts') },
        { find: '@', replacement: resolve(workspace, 'src/renderer') },
        { find: '@renderer', replacement: resolve(workspace, 'src/renderer') },
        // Previews and desktop components must share React, including inside optimized dependencies.
        { find: 'react', replacement: resolve(workspace, 'node_modules/react') },
        { find: 'react-dom', replacement: resolve(workspace, 'node_modules/react-dom') },
      ],
    },
    publicDir: resolve(workspace, 'docs/public'),
    server: { fs: { allow: [workspace] }, watch: { ignored: ['**/.electron-cache/**', '**/.vitepress/.temp/**', '**/.vitepress/cache/**', '**/dist/**', '**/public/screenshots/**', '**/public/component-previews/**'] } },
    // The isolated desktop demo is built separately and never scanned as a VitePress entry.
    optimizeDeps: {
      entries: ['.vitepress/theme/index.ts', 'media-src/vis/demos/{shadcn-base,assistant-ui}/*.tsx'],
      // Mermaid's lazy layout chunks import this CommonJS package outside the entry scan.
      include: ['react-dom/client', 'fastdom', 'fastdom/extensions/fastdom-promised.js'],
    },
  },
  themeConfig: {
    logo: `${base}nola-logo.svg`,
    search: {
      provider: 'local',
      options: {
        locales: Object.fromEntries((Object.keys(localeNames) as Locale[]).map(locale => [
          locale === 'zh-CN' ? 'root' : locale,
          { translations: searchTranslations[locale] },
        ])),
      },
    },
    socialLinks: [{ icon: 'github', link: repositoryUrl }],
    externalLinkIcon: true,
    footer: { message: `© Nola Translator · ${license}` },
  },
}))
