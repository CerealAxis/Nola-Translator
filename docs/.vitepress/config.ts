import { defineConfig } from 'vitepress'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { groupIconMdPlugin, groupIconVitePlugin } from 'vitepress-plugin-group-icons'
import markdownItTaskCheckbox from 'markdown-it-task-checkbox'
import timeline from 'vitepress-markdown-timeline'
import { withMermaid } from 'vitepress-plugin-mermaid'
import { generateSidebar } from 'vitepress-sidebar'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { copy, docsNav, localeNames, localePath, downloadUrl, repositoryUrl, license, type Locale } from './theme/content'
import { normalizeEmptyIsCss } from '../scripts/normalize-empty-is-css.mjs'

const base = process.env.DOCS_BASE ?? '/'
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
  const localeFolder = locale === 'zh-CN' ? '' : locale
  const label = docsNav[locale].root
  return generateSidebar({
    documentRootPath: './nola-docs',
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
}

const locales = Object.fromEntries((Object.keys(localeNames) as Locale[]).map(locale => {
  const text = copy[locale]
  const path = localePath(locale)
  return [locale === 'zh-CN' ? 'root' : locale, {
    label: localeNames[locale],
    lang: locale,
    title: 'Nola Translator',
    description: text.hero.subtitle,
    themeConfig: {
      nav: [
        { text: text.nav.home, link: path },
        { text: text.nav.download, link: downloadUrl },
      ],
      sidebar: sidebarForLocale(locale),
      outline: { label: text.documentation.outline },
      docFooter: { prev: text.documentation.previous, next: text.documentation.next },
      editLink: { pattern: `${repositoryUrl}/edit/main/docs/nola-docs/:path`, text: text.documentation.editPage },
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
  srcDir: './nola-docs',
  outDir: './dist',
  srcExclude: ['**/README.md'],
  cleanUrls: true,
  appearance: true,
  lastUpdated: true,
  sitemap: { hostname: 'https://nola.xaviermc.top' },
  markdown: {
    lineNumbers: true,
    math: true,
    image: { lazyLoad: true },
    config(md) {
      md.set({ linkify: true })
      // VitePress core has no task-list rule; task-list.css styles the markup this produces.
      md.use(markdownItTaskCheckbox)
      md.use(timeline)
      // Produces the .vp-code-block-title / .vp-code-group markup styled by vp-code-title.css and vp-code-group.css.
      md.use(groupIconMdPlugin)
    },
  },
  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}nola-logo.svg` }], ['meta', { name: 'theme-color', content: '#f6f9ff' }]],
  locales,
  vite: {
    plugins: [react({ exclude: /node_modules|\.vitepress\/cache/ }), tailwindcss(), groupIconVitePlugin()],
    css: { postcss: { plugins: [normalizeEmptyIsCss()] } },
    resolve: { alias: { '@': resolve(workspace, 'src/renderer'), '@renderer': resolve(workspace, 'src/renderer') }, dedupe: ['react', 'react-dom'] },
    publicDir: resolve(workspace, 'docs/public'),
    server: { fs: { allow: [workspace] }, watch: { ignored: ['**/.electron-cache/**', '**/.vitepress/.temp/**', '**/.vitepress/cache/**', '**/dist/**', '**/public/demo/**', '**/public/screenshots/**'] } },
    // The isolated desktop demo is built separately and never scanned as a VitePress entry.
    optimizeDeps: {
      entries: ['.vitepress/theme/index.ts'],
      // Mermaid's lazy layout chunks import this CommonJS package outside the entry scan.
      include: ['fastdom', 'fastdom/extensions/fastdom-promised.js'],
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
