import { defineConfig } from 'vitepress'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { copy, localeNames, localePath, downloadUrl, repositoryUrl, license, type Locale } from './theme/content'

const base = process.env.DOCS_BASE ?? '/'
const workspace = fileURLToPath(new URL('../..', import.meta.url))

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
        { text: text.nav.product, link: `${path}#product` },
        { text: text.nav.scenarios, link: `${path}#scenarios` },
        { text: text.nav.docs, link: `${path}guide` },
        { text: text.nav.download, link: downloadUrl },
      ],
      sidebar: [
        { text: text.nav.docs, items: [{ text: text.nav.docs, link: `${path}guide` }] },
      ],
      outline: { label: text.nav.docs },
      docFooter: { prev: text.nav.docs, next: text.nav.docs },
      returnToTopLabel: text.nav.docs,
      sidebarMenuLabel: text.nav.menu,
      skipToContentLabel: text.nav.skip,
      langMenuLabel: text.nav.language,
    },
  }]
}))

export default defineConfig({
  base,
  title: 'Nola Translator',
  description: copy['zh-CN'].hero.subtitle,
  lang: 'zh-CN',
  outDir: './dist',
  srcExclude: ['media-src/**', 'scripts/**', 'node_modules/**'],
  cleanUrls: true,
  appearance: false,
  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}nola-logo.svg` }], ['meta', { name: 'theme-color', content: '#f6f9ff' }]],
  locales,
  vite: {
    plugins: [react({ exclude: /node_modules|\.vitepress\/cache/ }), tailwindcss()],
    resolve: { alias: { '@': resolve(workspace, 'src/renderer'), '@renderer': resolve(workspace, 'src/renderer') }, dedupe: ['react', 'react-dom'] },
    server: { fs: { allow: [workspace] }, watch: { ignored: ['**/.electron-cache/**', '**/.vitepress/.temp/**', '**/.vitepress/cache/**', '**/dist/**', '**/public/demo/**', '**/public/screenshots/**'] } },
    // The isolated desktop demo is built separately and never scanned as a VitePress entry.
    optimizeDeps: { entries: ['.vitepress/theme/index.ts'] },
  },
  themeConfig: {
    logo: `${base}nola-logo.svg`,
    socialLinks: [{ icon: 'github', link: repositoryUrl }],
    externalLinkIcon: true,
    footer: { message: `© Nola Translator · ${license}` },
  },
})
