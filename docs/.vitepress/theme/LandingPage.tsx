import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Accordion } from '@base-ui/react/accordion'
import { Menu } from '@base-ui/react/menu'
import { AnimatedThemeToggler } from '../../../src/renderer/components/ui/animated-theme-toggler'
import { Button } from '../../../src/renderer/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../src/renderer/components/ui/card'
import { ArrowDown, ArrowUpRight, ChevronDown, Globe2, Monitor, Terminal, Check, Github, Sparkle, Star } from 'lucide-react'
import { copy, downloadSources, downloadUrl, license, localeNames, localePath, repositoryUrl } from './content'
import type { LandingCopy, Locale } from './content'
import { autoLocaleNames, detectSiteLocale, localizedSitePath, readLocalePreference, saveLocalePreference } from './siteLocale'
import { LandingFeatureSections } from './LandingFeatureSections'
import { landingContent } from './landing-content'
import type { LocalePreference } from './siteLocale'
import chromeIcon from '../../../src/renderer/assets/browsers/chrome.png'
import edgeIcon from '../../../src/renderer/assets/browsers/edge.png'
import './landing.css'

export interface LandingPageProps {
  locale: Locale
  base: string
  dark: boolean
  onToggleTheme: () => void
}
export interface DemoFrameProps { locale: Locale; base: string; dark: boolean; text: LandingCopy['demo']; page?: string }

export function LandingPage({ locale, base, dark, onToggleTheme }: LandingPageProps) {
  const t = copy[locale]
  const landing = landingContent[locale]
  const themeLabel = dark ? t.nav.themeToLight : t.nav.themeToDark
  const site = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)
  const [languagePreference, setLanguagePreference] = useState<LocalePreference>(readLocalePreference)
  const selectLanguage = (preference: LocalePreference) => {
    saveLocalePreference(preference)
    setLanguagePreference(preference)
    const next = preference === 'auto' ? detectSiteLocale(navigator.languages.length ? navigator.languages : [navigator.language]) : preference
    const path = localizedSitePath(location.pathname, next, base)
    if (path !== location.pathname) location.href = `${path}${location.search}${location.hash}`
  }
  const docUrl = `${base}${localePath(locale).slice(1)}docs`
  const image = (name: string) => `${base}screenshots/${locale}/${name}${dark ? '-dark' : ''}.png`
  useEffect(() => {
    const sync = () => setScrolled(window.scrollY > 40)
    sync()
    window.addEventListener('scroll', sync, { passive: true })
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.target.getAttribute('data-reveal') === 'section') {
        entry.target.classList.toggle('is-offscreen', !entry.isIntersecting)
        return
      }
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target) }
    }), { threshold: .12 })
    site.current?.querySelectorAll('[data-reveal]').forEach(element => observer.observe(element))
    return () => { window.removeEventListener('scroll', sync); observer.disconnect() }
  }, [])
  return <div ref={site} className="nola-site" lang={locale}>
    <a className="site-skip z-overlay" href="#main">{t.nav.skip}</a>
    <header className={['site-nav', 'z-sticky', scrolled && 'site-nav--scrolled'].filter(Boolean).join(' ')}>
      <a className="site-brand" href={`${base}${localePath(locale).slice(1)}`}><img src={`${base}nola-logo.svg`} alt="" /><span>Nola Translator</span></a>
      <nav className="site-nav-links" aria-label={t.nav.menu}><a href="#product">{t.nav.product}</a><a href="#scenarios">{t.nav.scenarios}</a><a href="#download">{t.nav.download}</a><a href={docUrl}>{t.nav.docs}</a><a href={`${base}vis/`}>{t.nav.designDocs}</a></nav>
      <div className="site-nav-end">
        <Menu.Root>
          <Menu.Trigger render={<Button variant="secondary" size="sm" />} className="site-locale" aria-label={t.nav.language}><Globe2 aria-hidden="true" /><span>{languagePreference === 'auto' ? autoLocaleNames[locale] : localeNames[locale]}</span><ChevronDown aria-hidden="true" /></Menu.Trigger>
          <Menu.Portal><Menu.Positioner className="z-dropdown" sideOffset={4} align="end"><Menu.Popup className="site-locale-menu" aria-label={t.nav.language}>
            <Menu.RadioGroup value={languagePreference} onValueChange={(next: LocalePreference) => selectLanguage(next)}>
              <Menu.RadioItem value="auto">{autoLocaleNames[locale]}<Menu.RadioItemIndicator><Check aria-hidden="true" /></Menu.RadioItemIndicator></Menu.RadioItem>
              {(Object.keys(localeNames) as Locale[]).map(item => <Menu.RadioItem key={item} value={item}>{localeNames[item]}<Menu.RadioItemIndicator><Check aria-hidden="true" /></Menu.RadioItemIndicator></Menu.RadioItem>)}
            </Menu.RadioGroup>
          </Menu.Popup></Menu.Positioner></Menu.Portal>
        </Menu.Root>
        <AnimatedThemeToggler className="site-theme site-theme--animated" theme={dark ? 'dark' : 'light'} aria-label={themeLabel} onThemeChange={onToggleTheme} />
      </div>
    </header>
    <main id="main">
      <section id="product" className="site-hero">
        <div className="site-hero-art" aria-hidden="true"><span className="site-hero-orb" /><span className="site-hero-orb site-hero-orb--second" /><span className="site-hero-ribbon" /><span className="site-hero-ribbon site-hero-ribbon--second" />
          <svg className="site-signal-field" viewBox="0 0 1600 700" fill="none" aria-hidden="true">
            {Array.from({ length: 16 }, (_, band) => <path key={band} d={Array.from({ length: 65 }, (_, point) => {
              const x = point * 25
              const y = 370 + Math.sin(point / 10 + band / 18) * (95 + band * 6) + Math.sin(point / 5) * 18 + band * 7
              return `${point ? 'L' : 'M'}${x},${y}`
            }).join(' ')} />)}
          </svg>
          <HeroPointerTrail />
        </div>
        <div className="site-hero-copy site-hero-copy--preview">
          <h1 className="site-hero-wordmark">
            <span className="site-hero-mark"><img src={`${base}nola-logo.svg`} alt="" /></span>
            <span className="site-hero-title">
              Nola Translator
              <span className="site-hero-title-sparkles" aria-hidden="true">
                <Sparkle /><Sparkle /><Sparkle /><Sparkle />
              </span>
            </span>
          </h1>
          <p className="site-hero-lede">{landing.heroSubtitle}</p>
          <div className="site-hero-actions">
            <DownloadButton locale={locale} text={t.final.cta} menuLabel={t.nav.download} soon={t.platforms.soonLabel} compact />
            <a className="site-hero-star" href={repositoryUrl} target="_blank" rel="noopener noreferrer">
              <Star aria-hidden="true" />{landing.star}
            </a>
          </div>
        </div>
        <div className="site-hero-demo"><DemoFrame locale={locale} base={base} dark={dark} text={t.demo} /></div>
      </section>

      <LandingFeatureSections locale={locale} />

      <section id="download" className="site-shell site-section site-downloads">
        <div className="site-heading" data-reveal="section"><p className="site-kicker">{landing.downloadKicker}</p><h2>{t.platforms.title}</h2><p>{t.platforms.intro}</p></div>
        <div className="site-download-grid" data-reveal="section">
          <DownloadCard icon={<Monitor aria-hidden="true" />} title={t.platforms.desktop} description={t.platforms.desktopBody}>
            <div className="site-download-art site-download-art--desktop"><img src={image('home')} loading="lazy" alt="" /></div>
            <DownloadSourceButton locale={locale} label={t.nav.download} className="site-download-link"><WindowsIcon />Windows<ArrowDown aria-hidden="true" /></DownloadSourceButton>
            <Button className="site-coming" variant="secondary" disabled><AppleLogo /><span>macOS</span><small>{t.platforms.soonLabel}</small></Button>
          </DownloadCard>
          <DownloadCard icon={<Globe2 aria-hidden="true" />} title={t.platforms.browser} description={t.platforms.browserBody}>
            <div className="site-download-art site-download-art--browser"><img src={image('browser-scene')} loading="lazy" alt="" /></div>
            <DownloadSourceButton locale={locale} label={t.nav.download} className="site-download-link"><img src={chromeIcon} alt="" />Chrome<ArrowDown aria-hidden="true" /></DownloadSourceButton>
            <DownloadSourceButton locale={locale} label={t.nav.download} className="site-download-link site-download-link--secondary"><img src={edgeIcon} alt="" />Microsoft Edge<ArrowDown aria-hidden="true" /></DownloadSourceButton>
          </DownloadCard>
          <DownloadCard icon={<Terminal aria-hidden="true" />} title={t.platforms.terminal} description={t.platforms.terminalBody}>
            <div className="site-download-art site-download-art--terminal" aria-hidden="true"><div><i /><i /><i /></div><p><span>❯</span> nola<span className="site-terminal-cursor">▏</span></p><small>Nola Translator</small></div>
            <Button className="site-coming" variant="secondary" disabled><Terminal aria-hidden="true" /><span>CLI</span><small>{t.platforms.soonLabel}</small></Button>
            <a className="site-download-link site-download-link--secondary" href={docUrl}>{t.nav.docs}<ArrowUpRight aria-hidden="true" /></a>
          </DownloadCard>
        </div>
      </section>

      <section className="site-faq site-shell site-section" data-reveal>
        <div className="site-heading"><h2>{t.faq.title}</h2></div>
        <Accordion.Root className="site-faq-list">{t.faq.items.map((item, i) => <Accordion.Item className="accordion__item" value={String(i)} key={i}>
          <Accordion.Header><Accordion.Trigger className="accordion__trigger">{item.question}<ChevronDown className="accordion__indicator" aria-hidden="true" /></Accordion.Trigger></Accordion.Header><Accordion.Panel><div className="accordion__body">{item.answer}</div></Accordion.Panel>
        </Accordion.Item>)}</Accordion.Root>
      </section>

      <section className="site-final" data-reveal><div className="site-final-orb" aria-hidden="true" /><p className="site-kicker">NOLA TRANSLATOR</p><h2>{t.final.title}</h2><p>{t.final.body}</p><DownloadSourceButton locale={locale} label={t.nav.download} className="site-final-link"><WindowsIcon />{t.final.cta}<ArrowDown aria-hidden="true" /></DownloadSourceButton></section>
    </main>
    <footer className="site-footer site-shell"><div><a className="site-brand" href={`${base}${localePath(locale).slice(1)}`}><img src={`${base}nola-logo.svg`} alt="" />Nola Translator</a><p>{t.footer.tagline}</p></div><nav aria-label={t.nav.menu}><a href={docUrl}>{t.nav.docs}</a><a href={downloadUrl}>{t.footer.releases}</a><a href={repositoryUrl}><Github aria-hidden="true" />GitHub</a></nav><div className="site-footer-bottom"><span>{t.footer.copyright}</span><a href={`${repositoryUrl}/blob/main/LICENSE`}>{license}</a></div></footer>
  </div>
}

function WindowsIcon() {
  return <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M1 3.6 8.3 2.6v7H1zm8.5-1.2L19 1v8.6H9.5zM1 10.8h7.3v7L1 16.8zm8.5 0H19v8.3l-9.5-1.2z" /></svg>
}

function AppleLogo() {
  // Apple brand mark from Simple Icons.
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  )
}

function HeroPointerTrail() {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const surface = canvas.current
    if (!surface || matchMedia('(prefers-reduced-motion: reduce)').matches || !matchMedia('(pointer: fine)').matches) return
    const context = surface.getContext('2d')
    if (!context) return
    const points: { x: number; y: number; at: number }[] = []
    const color = getComputedStyle(surface).getPropertyValue('--primary-foreground').trim()
    let frame = 0
    let width = 0
    let height = 0
    const resize = () => {
      const rect = surface.getBoundingClientRect()
      width = rect.width
      height = rect.height
      const scale = Math.min(devicePixelRatio, 2)
      surface.width = Math.round(width * scale)
      surface.height = Math.round(height * scale)
      context.setTransform(scale, 0, 0, scale, 0, 0)
    }
    const draw = (now: number) => {
      context.clearRect(0, 0, width, height)
      while (points.length && now - points[0].at > 850) points.shift()
      context.strokeStyle = color
      context.fillStyle = color
      context.lineCap = 'round'
      points.forEach((point, index) => {
        const life = Math.max(0, 1 - (now - point.at) / 850)
        const drift = (1 - life) * 12
        context.globalAlpha = life * life * .5
        context.lineWidth = 1.5 * life
        context.beginPath()
        const previous = points[index - 1]
        if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 60) {
          context.moveTo(previous.x, previous.y - drift)
          context.lineTo(point.x, point.y - drift)
        }
        context.stroke()
        context.globalAlpha = life * .7
        context.beginPath()
        const pulse = (3 + Math.sin(index * 1.7) * 2) * life
        context.moveTo(point.x, point.y - drift - pulse)
        context.lineTo(point.x, point.y - drift + pulse)
        context.stroke()
      })
      context.globalAlpha = 1
      // Stop drawing as soon as the last trace fades; a still pointer creates no new particles.
      frame = points.length ? requestAnimationFrame(draw) : 0
    }
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || (event.target instanceof Element && event.target.closest('.site-demo-window'))) return
      const rect = surface.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      if (x < 0 || y < 0 || x > width || y > height) return
      const previous = points.at(-1)
      if (previous && Math.hypot(x - previous.x, y - previous.y) < 5) return
      points.push({ x, y, at: performance.now() })
      if (points.length > 64) points.shift()
      if (!frame) frame = requestAnimationFrame(draw)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(surface)
    window.addEventListener('pointermove', move, { passive: true })
    return () => { observer.disconnect(); window.removeEventListener('pointermove', move); cancelAnimationFrame(frame) }
  }, [])
  return <canvas ref={canvas} className="site-pointer-trail" aria-hidden="true" />
}

export interface DownloadSourceButtonProps {
  locale: Locale
  children: ReactNode
  className: string
  label: string
  compact?: boolean
}

export interface DownloadSourceMenuProps { label: string; locale: Locale }

function DownloadSourceMenu({ label, locale }: DownloadSourceMenuProps) {
  const names = locale === 'zh-CN'
    ? { quark: '夸克网盘', baidu: '百度网盘' }
    : locale.startsWith('zh-')
      ? { quark: '夸克網盤', baidu: '百度網盤' }
      : { quark: 'Quark', baidu: 'Baidu' }

  return <Menu.Group aria-label={label}>
    {downloadSources.map(source => <Menu.LinkItem key={source.id} href={source.url} target="_blank" rel="noopener noreferrer">
      {source.icon ? <img className="site-download-source-icon" src={`${import.meta.env.BASE_URL}${source.icon}`} alt="" /> : <Github aria-hidden="true" />}
      <span>{source.id === 'github' ? source.name : names[source.id]}</span>
    </Menu.LinkItem>)}
  </Menu.Group>
}

function DownloadSourceButton({ children, className, label, locale, compact }: DownloadSourceButtonProps) {
  return <Menu.Root>
    <Menu.Trigger render={<Button variant="secondary" />} className={className}>{children}</Menu.Trigger>
    <Menu.Portal><Menu.Positioner className="z-dropdown" side="bottom" sideOffset={4}>
      <Menu.Popup className={compact ? 'site-download-menu site-download-menu--compact' : 'site-download-menu'} aria-label={label}><DownloadSourceMenu label={label} locale={locale} /></Menu.Popup>
    </Menu.Positioner></Menu.Portal>
  </Menu.Root>
}

export interface DownloadButtonProps { locale: Locale; text: string; menuLabel: string; soon: string; compact?: boolean }

function DownloadButton({ locale, text, menuLabel, soon, compact }: DownloadButtonProps) {
  const anchor = useRef<HTMLDivElement>(null)
  const menuClass = compact ? 'site-download-menu site-download-menu--compact' : 'site-download-menu'
  return <div className="site-download-button" ref={anchor}>
    <DownloadSourceButton locale={locale} label={menuLabel} className="site-download-primary" compact={compact}><WindowsIcon />{text}</DownloadSourceButton>
    <Menu.Root>
      <Menu.Trigger render={<Button size="icon" variant="secondary" />} className="site-download-trigger" aria-label={menuLabel}><ChevronDown aria-hidden="true" /></Menu.Trigger>
      <Menu.Portal><Menu.Positioner className="z-dropdown" anchor={anchor} side="bottom" sideOffset={4}>
        <Menu.Popup className={menuClass} aria-label={menuLabel}>
          <Menu.Group>
            <Menu.SubmenuRoot>
              <Menu.SubmenuTrigger><WindowsIcon /><span>Windows</span><ChevronDown className="site-submenu-indicator" aria-hidden="true" /></Menu.SubmenuTrigger>
              <Menu.Portal><Menu.Positioner className="z-dropdown" side="right" align="start" sideOffset={4}>
                <Menu.Popup className={menuClass} aria-label={menuLabel}><DownloadSourceMenu label={menuLabel} locale={locale} /></Menu.Popup>
              </Menu.Positioner></Menu.Portal>
            </Menu.SubmenuRoot>
            <Menu.Item disabled><AppleLogo /><span>macOS</span><span className="site-menu-note">{soon}</span></Menu.Item>
          </Menu.Group>
        </Menu.Popup>
      </Menu.Positioner></Menu.Portal>
    </Menu.Root>
  </div>
}

export function DemoFrame({ locale, base, dark, text, page = 'home' }: DemoFrameProps) {
  const viewport = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const [scale, setScale] = useState(.8)
  const [ready, setReady] = useState(false)
  // Keep the iframe mounted so a site theme change preserves the current demo session and page.
  const [initialTheme] = useState(dark ? 'dark' : 'light')
  useEffect(() => {
    if (ready) frame.current?.contentWindow?.postMessage({ type: 'nola-demo-theme', theme: dark ? 'dark' : 'light' }, location.origin)
  }, [dark, ready])
  useEffect(() => {
    const observer = new ResizeObserver(entries => setScale(entries[0].contentRect.width / 1440))
    if (viewport.current) observer.observe(viewport.current)
    const receive = (event: MessageEvent) => {
      if (event.origin === location.origin && event.source === frame.current?.contentWindow && event.data?.type === 'nola-demo-ready') setReady(true)
    }
    const navigate = (event: Event) => frame.current?.contentWindow?.postMessage({ type: 'nola-demo-navigate', page: (event as CustomEvent<string>).detail }, location.origin)
    window.addEventListener('message', receive)
    window.addEventListener('nola-demo-page', navigate)
    return () => { observer.disconnect(); window.removeEventListener('message', receive); window.removeEventListener('nola-demo-page', navigate) }
  }, [])
  return <div className="site-demo-window">
    <div ref={viewport} className="site-demo-viewport" style={{ '--demo-scale': scale } as CSSProperties}>
      <iframe ref={frame} key={locale} src={`${base}demo/index.html?locale=${locale}&page=${page}&theme=${initialTheme}#/`} title={`Nola Translator — ${text.hint}`} style={{ visibility: ready ? 'visible' : 'hidden' }} />
      {!ready ? <div className="site-demo-loading"><img src={`${base}screenshots/${locale}/home${dark ? '-dark' : ''}.png`} alt="" /><span>{text.loading}</span></div> : null}
    </div>
  </div>
}

export interface DownloadCardProps { icon: ReactNode; title: string; description: string; children: ReactNode }

function DownloadCard({ icon, title, description, children }: DownloadCardProps) {
  return <Card className="site-download-card"><CardHeader className="card__header"><div className="site-download-card-icon">{icon}</div><CardTitle className="card__title">{title}</CardTitle><CardDescription className="card__description">{description}</CardDescription></CardHeader><CardContent className="card__content">{children}</CardContent></Card>
}
