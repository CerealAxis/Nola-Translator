import { waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createPageTranslation } from './page-translation'
import { prepareManpage } from './manpage-translation'
import { DEFAULT_PREFERENCES } from './preferences'

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren() })

it('does not translate on hover after the hover shortcut is removed', async () => {
  document.body.innerHTML = '<p>A paragraph to translate</p>'
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  const translate = vi.fn(async () => 'Translation')
  const page = createPageTranslation({ translate, close: vi.fn() })
  try {
    page.configure({ ...DEFAULT_PREFERENCES, hoverTranslation: true, shortcutHover: '' })
    const event = new PointerEvent('pointerover')
    Object.defineProperty(event, 'target', { value: document.querySelector('p') })
    page.hover(event)
    await new Promise(resolve => setTimeout(resolve, 300))
    expect(translate).not.toHaveBeenCalled()
  } finally { page.stop() }
})

it('preempts a saturated queue on scroll and resumes offscreen work after the visible result', async () => {
  document.body.innerHTML = '<main><p id="old">Old paragraph</p><p id="visible">New paragraph</p></main>'
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  let scrolled = false
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return new DOMRect(0, (this.id === 'old' ? !scrolled : scrolled) ? 20 : -2000, 300, 40)
  })
  const calls: { text: string; signal: AbortSignal; resolve(result: string): void }[] = []
  const translate = (text: string, _source: string, _target: string, _lane: 'web' | 'video', signal: AbortSignal) =>
    new Promise<string>(resolve => calls.push({ text, signal, resolve }))
  const page = createPageTranslation({ translate, close: vi.fn() })
  try {
    page.configure({ ...DEFAULT_PREFERENCES, translateTitle: false })
    page.setConcurrency(1)
    page.start()
    await waitFor(() => expect(calls.map(call => call.text)).toEqual(['Old paragraph']))
    scrolled = true
    window.dispatchEvent(new Event('scroll'))
    await waitFor(() => expect(calls.map(call => call.text)).toEqual(['Old paragraph', 'New paragraph']))
    expect(calls[0].signal.aborted).toBe(true)
    calls[0].resolve('Stale result')
    calls[1].resolve('Visible result')
    await waitFor(() => expect(calls.map(call => call.text)).toEqual(['Old paragraph', 'New paragraph', 'Old paragraph']))
    expect(document.querySelector('#visible [data-nola-translation]')?.textContent).toBe('Visible result')
    expect(document.querySelector('#old [data-nola-translation]')).toBeNull()
    calls[2].resolve('Background result')
    await waitFor(() => expect(document.querySelector('#old [data-nola-translation]')?.textContent).toBe('Background result'))
    expect(page.state().pageError).toBeUndefined()
  } finally { page.stop() }
})

it('keeps a shared request alive when an offscreen consumer is canceled', async () => {
  document.body.innerHTML = '<main><p id="old">Shared paragraph</p><p id="shared">Shared paragraph</p><p id="next">Next paragraph</p></main>'
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  let scrolled = false
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const visible = this.id === 'shared' || (this.id === 'old' ? !scrolled : scrolled)
    return new DOMRect(0, visible ? 20 : 2000, 300, 40)
  })
  const calls: { text: string; signal: AbortSignal; resolve(result: string): void }[] = []
  const page = createPageTranslation({
    translate: (text, _source, _target, _lane, signal) => new Promise(resolve => calls.push({ text, signal, resolve })),
    close: vi.fn(),
  })
  try {
    page.configure({ ...DEFAULT_PREFERENCES, translateTitle: false })
    page.setConcurrency(2)
    page.start()
    await waitFor(() => expect(calls.map(call => call.text)).toEqual(['Shared paragraph']))
    scrolled = true
    window.dispatchEvent(new Event('scroll'))
    await waitFor(() => expect(calls.map(call => call.text)).toEqual(['Shared paragraph', 'Next paragraph']))
    expect(calls[0].signal.aborted).toBe(false)
    calls[0].resolve('Shared result')
    calls[1].resolve('Next result')
    await waitFor(() => expect(document.querySelector('#shared [data-nola-translation]')?.textContent).toBe('Shared result'))
    expect(document.querySelector('#old [data-nola-translation]')).toBeNull()
  } finally { page.stop() }
})

it('starts two independent text runs concurrently and renders them in source order', async () => {
  document.body.innerHTML = '<article><p>Opening <strong>Middle</strong> Closing</p></article>'
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  const runs = new Map<string, (result: string) => void>()
  const page = createPageTranslation({ translate: text => new Promise(resolve => runs.set(text, resolve)), close: vi.fn() })
  try {
    page.configure({ ...DEFAULT_PREFERENCES, translateTitle: false })
    page.start()
    await waitFor(() => expect([...runs.keys()]).toEqual(['Opening', 'Middle']))
    runs.get('Middle')?.('中间')
    await waitFor(() => expect(runs.has('Closing')).toBe(true))
    runs.get('Closing')?.('结尾')
    runs.get('Opening')?.('开头')
    await waitFor(() => expect(document.querySelector('[data-nola-translation]')?.textContent).toBe('开头 中间 结尾'))
    expect(document.querySelector('[data-nola-translation] strong')?.textContent).toBe('中间')
  } finally { page.stop() }
})

it('only translates visible button values and restores them without overwriting site changes', async () => {
  document.body.innerHTML = `<main><form>
    <input id="button" type="button" value="Open editor">
    <input id="reset" type="reset" value="Clear draft">
    <input id="submit" type="submit" value="Save draft">
    <input type="submit" name="commit" value="Publish draft">
    <input type="submit">
    <input type="text" value="Text draft">
    <input type=" submit " value="Invalid type">
    <input type="password" value="Private draft">
    <input type="button" value="Private action" translate="no">
  </form></main>`
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  const translate = vi.fn(async (source: string) => 'T ' + source)
  const page = createPageTranslation({ translate, close: vi.fn() })
  const button = document.querySelector<HTMLInputElement>('#button')!
  const submit = document.querySelector<HTMLInputElement>('#submit')!
  const settings = { ...DEFAULT_PREFERENCES, translateTitle: false }
  try {
    page.configure(settings)
    page.start()
    await waitFor(() => expect(submit.value).toBe('T Save draft'))
    expect(button.value).toBe('T Open editor')
    expect(translate.mock.calls.map(([source]) => source)).toEqual(['Open editor', 'Clear draft', 'Save draft'])
    expect(document.querySelectorAll('[data-nola-translation]')).toHaveLength(0)
    page.configure({ ...settings, pageDisplay: 'translation' })
    expect(submit.value).toBe('T Save draft')
    submit.name = 'commit'
    await waitFor(() => expect(submit.value).toBe('Save draft'))
    button.setAttribute('value', 'Open library')
    await waitFor(() => expect(button.value).toBe('T Open library'))
    page.stop()
    expect(button.value).toBe('Open library')
    expect(document.querySelector<HTMLInputElement>('#reset')?.value).toBe('Clear draft')
  } finally { page.stop() }
})

it('translates only verified man7 prose and restores the original preformatted nodes', async () => {
  document.body.innerHTML = `<h2><a id="SYNOPSIS">SYNOPSIS</a></h2><pre>       Invoke this function with caution.</pre>
    <h2><a id="DESCRIPTION">DESCRIPTION</a></h2><pre>       This paragraph wraps across
       two source lines and links to <a href="#related">related material</a>. Call <b>parse_value</b>() to continue.

       $ printf example
       Terminal output stays intact.

       #include &lt;stdio.h&gt;

       This comment follows a source declaration.</pre>`
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  const pre = document.querySelectorAll('pre')[1]
  const sourceNode = pre.firstChild
  const link = pre.querySelector('a')
  const original = pre.textContent
  const translate = vi.fn(async (text: string) => 'T ' + text)
  const page = createPageTranslation({ translate, close: vi.fn() })
  try {
    page.configure({ ...DEFAULT_PREFERENCES, translateTitle: false })
    page.start()
    const url = new URL('https://man7.org/linux/man-pages/man3/printf.3.html')
    prepareManpage(document, new URL(url.pathname, 'https://unrelated.example'))
    expect(pre.querySelector('[data-nola-manpage]')).toBeNull()
    prepareManpage(document, url)
    expect(pre.textContent).toBe(original)
    await waitFor(() => expect(pre.querySelector('[data-nola-translation] a')?.textContent).toBe('T related material'))
    expect(translate.mock.calls.map(([text]) => text)).toContain('This paragraph wraps across two source lines and links to')
    expect(pre.querySelector('[data-nola-translation] b')?.textContent).toBe('parse_value')
    expect(pre.querySelector('[data-nola-translation] b')?.nextSibling?.textContent).toBe('() T to continue.\n')
    expect(translate.mock.calls.map(([text]) => text)).not.toContain('parse_value')
    expect(translate.mock.calls.map(([text]) => text).join(' ')).not.toMatch(/Invoke|printf example|Terminal output|source declaration/u)
    expect(pre.querySelector('[data-nola-manpage=literal] [data-nola-translation]')).toBeNull()
    page.stop()
    expect(pre.querySelector('a')).toBe(link)
    expect(pre.firstChild).toBe(sourceNode)
    expect(pre.textContent).toBe(original)
  } finally { page.stop() }
})

it('starts visible paragraphs alongside the title and renders out-of-order results', async () => {
  const originalTitle = document.title
  document.title = 'Slow title'
  document.body.innerHTML = '<main><p>First paragraph</p><p>Second paragraph</p><p>Third paragraph</p></main>'
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  const requests = new Map<string, (translation: string) => void>()
  const translate = vi.fn((text: string) => new Promise<string>(resolve => requests.set(text, resolve)))
  const page = createPageTranslation({ translate, close: vi.fn() })
  try {
    page.configure({ ...DEFAULT_PREFERENCES, pageDisplay: 'translation' })
    page.start()
    await waitFor(() => expect([...requests.keys()]).toEqual(['Slow title', 'First paragraph', 'Second paragraph']))
    requests.get('Second paragraph')?.('Second result')
    await waitFor(() => expect(requests.has('Third paragraph')).toBe(true))
    expect(document.querySelector('p:nth-child(2) [data-nola-single-slot]')?.getAttribute('aria-label')).toBe('Second result')
    expect(document.querySelector('p:nth-child(2)')?.textContent).toBe('Second paragraph')
    page.stop()
    for (const resolve of requests.values()) resolve('Late result')
    await Promise.resolve()
    expect(document.title).toBe('Slow title')
    expect([...document.querySelectorAll('p')].map(p => p.textContent)).toEqual(['First paragraph', 'Second paragraph', 'Third paragraph'])
  } finally { page.stop(); document.title = originalTitle }
})

it('keeps interactive DOM, ignores forms, translates new paragraphs and restores original text', async () => {
  document.documentElement.lang = 'en'
  document.body.innerHTML = '<article><p id="intro">Hello <a href="#details">details</a></p><form><p id="form-label">Search</p></form></article>'
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  const link = document.querySelector('a')!
  const translate = vi.fn(async (text: string) => `T ${text}`)
  const page = createPageTranslation({ translate, close: vi.fn() })
  try {
    page.configure({ ...DEFAULT_PREFERENCES, pageDisplay: 'translation' })
    page.start()
    await waitFor(() => expect(link.querySelector('[data-nola-single-slot]')?.getAttribute('aria-label')).toBe('T details'))
    expect(document.querySelector('a')).toBe(link)
    expect(link.getAttribute('href')).toBe('#details')
    expect(document.querySelector('#form-label')?.textContent).toBe('Search')
    const added = document.createElement('p')
    added.textContent = 'A new paragraph'
    document.querySelector('article')?.append(added)
    await waitFor(() => expect(added.querySelector('[data-nola-single-slot]')?.getAttribute('aria-label')).toBe('T A new paragraph'))
    page.stop()
    expect(link.textContent).toBe('details')
    expect(document.querySelector('#intro')?.textContent).toBe('Hello details')
    expect(added.textContent).toBe('A new paragraph')
    expect(translate.mock.calls.flat()).not.toContain('Search')
  } finally { page.stop(); document.documentElement.removeAttribute('lang') }
})

it('translates and restores a changing title, applies site exclusions and language skips', async () => {
  const original = document.title
  document.title = 'Initial title'
  document.body.innerHTML = '<main><p lang="ja">Skipped Japanese</p><p class="private">Private paragraph</p><p id="public">Public paragraph</p></main><p id="outside">Outside paragraph</p>'
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  const translate = vi.fn(async (text: string) => `T ${text}`)
  const page = createPageTranslation({ translate, close: vi.fn() })
  try {
    page.configure({ ...DEFAULT_PREFERENCES, pageDisplay: 'translation', pageScope: 'main', skipLanguages: ['ja'], siteRules: [{ host: location.hostname, excludeSelectors: '.private', includeSelectors: '' }] })
    page.start()
    await waitFor(() => expect(document.querySelector('#public [data-nola-single-slot]')?.getAttribute('aria-label')).toBe('T Public paragraph'))
    expect(document.title).toBe('T Initial title')
    expect(document.querySelector('.private')?.textContent).toBe('Private paragraph')
    expect(document.querySelector('[lang=ja]')?.textContent).toBe('Skipped Japanese')
    expect(document.querySelector('#outside')?.textContent).toBe('Outside paragraph')
    document.title = 'Changed title'
    await waitFor(() => expect(document.title).toBe('T Changed title'))
    page.stop(); expect(document.title).toBe('Changed title')
  } finally { page.stop(); document.title = original }
})

it('uses the explicit source for paragraphs and titles and blocks every start on disabled sites', async () => {
  const originalTitle = document.title; document.title = 'A title'
  document.body.innerHTML = '<main><p lang="ja">A paragraph</p></main>'
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  const translate = vi.fn(async (text: string) => `T ${text}`)
  const page = createPageTranslation({ translate, close: vi.fn() })
  try {
    page.configure({ ...DEFAULT_PREFERENCES, sourceLanguage: 'en', pageDisplay: 'translation' })
    page.start()
    await waitFor(() => expect(document.querySelector('p [data-nola-single-slot]')?.getAttribute('aria-label')).toBe('T A paragraph'))
    expect(translate).toHaveBeenCalledWith('A title', 'en', 'zh', 'web', expect.any(AbortSignal))
    expect(translate).toHaveBeenCalledWith('A paragraph', 'en', 'zh', 'web', expect.any(AbortSignal))
    page.configure({ ...DEFAULT_PREFERENCES, sourceLanguage: 'en', siteBlacklist: [location.hostname] })
    expect(page.state().pageActive).toBe(false)
    expect(document.querySelector('p')?.textContent).toBe('A paragraph')
    translate.mockClear(); page.start(); page.hover(new PointerEvent('pointerover', { altKey: true }))
    expect(page.state().pageActive).toBe(false)
    expect(translate).not.toHaveBeenCalled()
  } finally { page.stop(); document.title = originalTitle }
})


it('replaces navigation labels in place and lays out prose in two lines', async () => {
  document.body.innerHTML = '<nav><a href="#">Getting Started</a></nav><main><p>Hello <strong>world</strong></p></main>'
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  const translate = vi.fn(async (text: string) => `T ${text}`)
  const page = createPageTranslation({ translate, close: vi.fn() })
  const link = document.querySelector('a')!
  const strong = document.querySelector('strong')!
  try {
    page.configure({ ...DEFAULT_PREFERENCES, pageStyle: 'plain', translateTitle: false, pageScope: 'all' })
    page.start()
    await waitFor(() => expect(link.textContent).toBe('T Getting Started'))
    await waitFor(() => expect(document.querySelector('p [data-nola-translation]')?.textContent).toBe('T Hello T world'))
    expect(link.querySelector('[data-nola-translation]')).toBeNull()
    expect(document.querySelector('strong')).toBe(strong)
    page.stop()
    expect(link.textContent).toBe('Getting Started')
    expect(strong.textContent).toBe('world')
  } finally { page.stop() }
})

it('preserves nested emphasis and links in translated text without interpreting returned HTML', async () => {
  document.body.innerHTML = '<main><p>Hello <strong class="important" style="font-weight:700;width:200px">brave <a href="https://example.com/path" onclick="alert(1)">world</a></strong>!</p></main>'
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  const page = createPageTranslation({ translate: vi.fn(async (text: string) => text.replace('Hello', '<img src=x>').replace('brave', '勇敢的').replace('world', '世界')), close: vi.fn() })
  try {
    page.configure({ ...DEFAULT_PREFERENCES, translateTitle: false })
    page.start()
    await waitFor(() => expect(document.querySelector('[data-nola-translation] strong a')?.textContent).toBe('世界'))
    const annotation = document.querySelector('[data-nola-translation]')!
    expect(annotation.textContent).toContain('<img src=x>')
    expect(annotation.querySelector('img')).toBeNull()
    expect(annotation.querySelector('strong')?.style.fontWeight).toBe('700')
    expect(annotation.querySelector('strong')?.style.width).toBe('')
    expect(annotation.querySelector('a')?.href).toBe('https://example.com/path')
    expect(annotation.querySelector('a')?.hasAttribute('onclick')).toBe(false)
    page.stop()
    expect(document.querySelectorAll('strong')).toHaveLength(1)
  } finally { page.stop() }
})

it('requests only plain text runs and rejects unsafe cloned link destinations', async () => {
  document.body.innerHTML = '<main><p>Hello <strong>world</strong> and <a href="javascript:alert(1)">friend</a></p></main>'
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  const translate = vi.fn(async (text: string) => 'T ' + text)
  const page = createPageTranslation({ translate, close: vi.fn() })
  try {
    page.configure({ ...DEFAULT_PREFERENCES, translateTitle: false })
    page.start()
    await waitFor(() => expect(document.querySelector('[data-nola-translation] strong')?.textContent).toBe('T world'))
    const annotation = document.querySelector('[data-nola-translation]')!
    expect(annotation.textContent).toBe('T Hello T world T and T friend')
    expect(annotation.querySelector('a')?.hasAttribute('href')).toBe(false)
    expect(translate.mock.calls.map(([text]) => text)).toEqual(['Hello', 'world', 'and', 'friend'])
  } finally { page.stop() }
})

it('keeps original spacing, inline code, and hard breaks in the local render tree', async () => {
  document.body.innerHTML = '<main><p><span class="highlight">A <strong>B</strong> C <em>D</em> E</span><br><code>value()</code> <b>F</b></p></main>'
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  const translate = vi.fn(async (text: string) => 'T' + text)
  const page = createPageTranslation({ translate, close: vi.fn() })
  try {
    page.configure({ ...DEFAULT_PREFERENCES, translateTitle: false })
    page.start()
    await waitFor(() => expect(document.querySelector('[data-nola-translation] b')?.textContent).toBe('TF'))
    const annotation = document.querySelector('[data-nola-translation]')!
    expect(annotation.querySelector('span strong')?.textContent).toBe('TB')
    expect(annotation.querySelector('span em')?.textContent).toBe('TD')
    expect(annotation.querySelector('br + code')?.textContent).toBe('value()')
    expect(annotation.textContent).toBe('TA TB TC TD TEvalue() TF')
    expect(translate.mock.calls.map(([text]) => text)).toEqual(['A', 'B', 'C', 'D', 'E', 'F'])
  } finally { page.stop() }
})

it('suppresses duplicate lines when the service returns identical text', async () => {
  document.body.innerHTML = '<main><p>Brand Name</p></main>'
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  const translate = vi.fn(async (text: string) => text)
  const page = createPageTranslation({ translate, close: vi.fn() })
  try {
    page.configure({ ...DEFAULT_PREFERENCES, translateTitle: false })
    page.start()
    await waitFor(() => expect(translate).toHaveBeenCalledOnce())
    expect(document.querySelector('[data-nola-translation]')).toBeNull()
  } finally { page.stop() }
})

it('does not include text from descendants hidden by CSS', async () => {
  document.body.innerHTML = '<main><p>Visible <span class="visually-hidden"><span>hidden duplicate</span></span>text</p></main>'
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) {
    return (this.closest('.visually-hidden') ? [] : [{}]) as unknown as DOMRectList
  })
  const translate = vi.fn(async (text: string) => 'T ' + text)
  const page = createPageTranslation({ translate, close: vi.fn() })
  try {
    page.configure({ ...DEFAULT_PREFERENCES, translateTitle: false })
    page.start()
    await waitFor(() => expect(document.querySelector('[data-nola-translation]')?.textContent).toBe('T Visible text'))
    expect(translate).toHaveBeenCalledWith('Visible text', 'auto', 'zh', 'web', expect.any(AbortSignal))
  } finally { page.stop() }
})

it('continues translating later paragraphs and retries only failed work when requested', async () => {
  document.body.innerHTML = '<main><p>Some text</p><p>Later paragraph</p></main>'
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  const translate = vi.fn(async (text: string) => 'Translated ' + text).mockRejectedValueOnce(new Error('providerNetwork'))
  const page = createPageTranslation({ translate, close: vi.fn() })
  try {
    page.configure({ ...DEFAULT_PREFERENCES, translateTitle: false })
    page.setConcurrency(1)
    page.start()
    await waitFor(() => expect(page.state().pageError).toBe('providerNetwork'))
    await waitFor(() => expect(document.querySelector('p:nth-child(2) [data-nola-translation]')?.textContent).toBe('Translated Later paragraph'))
    expect(translate).toHaveBeenCalledTimes(2)
    page.start()
    await waitFor(() => expect(document.querySelector('p:first-child [data-nola-translation]')?.textContent).toBe('Translated Some text'))
    expect(translate).toHaveBeenCalledTimes(3)
  } finally { page.stop() }
})


it('translates long paragraphs instead of silently skipping them', async () => {
  const source = `${'word '.repeat(900)}end`
  document.body.innerHTML = '<main><p></p></main>'
  document.querySelector('p')!.textContent = source
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  const translate = vi.fn(async (text: string) => `T ${text}`)
  const page = createPageTranslation({ translate, close: vi.fn() })
  try {
    page.configure({ ...DEFAULT_PREFERENCES, translateTitle: false })
    page.start()
    await waitFor(() => expect(document.querySelector('[data-nola-translation]')?.textContent).toContain('end'))
    expect(translate).toHaveBeenCalledTimes(2)
    expect(translate.mock.calls.every(([text]) => text.length <= 4000)).toBe(true)
  } finally { page.stop() }
})


it('removes and retranslates a flex block when its source changes', async () => {
  document.body.innerHTML = '<article><div id="flex" style="display:flex">First text</div></article>'
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  const page = createPageTranslation({ translate: vi.fn(async (text: string) => `T ${text}`), close: vi.fn() })
  const block = document.querySelector<HTMLElement>('#flex')!
  try {
    page.configure({ ...DEFAULT_PREFERENCES, translateTitle: false })
    page.start()
    await waitFor(() => expect(block.querySelector('[data-nola-translation]')?.textContent).toBe('T First text'))
    expect(block.querySelector('[data-nola-source-line]')).not.toBeNull()
    block.querySelector('[data-nola-source-line]')!.firstChild!.textContent = 'Updated text'
    await waitFor(() => expect(block.querySelector('[data-nola-translation]')?.textContent).toBe('T Updated text'))
    expect(document.querySelectorAll('[data-nola-translation]')).toHaveLength(1)
    page.stop()
    expect(block.querySelector('[data-nola-translation]')).toBeNull()
    expect(block.style.flexWrap).toBe('')
  } finally { page.stop() }
})

it('retranslates a paragraph when the site adds text nodes', async () => {
  document.body.innerHTML = '<main><p>Hello</p></main>'
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  const block = document.querySelector('p')!
  const page = createPageTranslation({ translate: vi.fn(async (text: string) => `T ${text}`), close: vi.fn() })
  try {
    page.configure({ ...DEFAULT_PREFERENCES, translateTitle: false })
    page.start()
    await waitFor(() => expect(block.querySelector('[data-nola-translation]')?.textContent).toBe('T Hello'))
    block.insertBefore(document.createTextNode(' again'), block.querySelector('[data-nola-translation]'))
    await waitFor(() => expect(block.querySelector('[data-nola-translation]')?.textContent).toBe('T Hello again'))
    expect(block.querySelectorAll('[data-nola-translation]')).toHaveLength(1)
  } finally { page.stop() }
})

it('reconsiders text that grows beyond the minimum length', async () => {
  document.body.innerHTML = '<main><p>Hi</p></main>'
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  const block = document.querySelector('p')!
  const page = createPageTranslation({ translate: vi.fn(async (text: string) => `T ${text}`), close: vi.fn() })
  try {
    page.configure({ ...DEFAULT_PREFERENCES, translateTitle: false, minTextLength: 3 })
    page.start()
    await new Promise(resolve => setTimeout(resolve, 40))
    expect(block.querySelector('[data-nola-translation]')).toBeNull()
    block.firstChild!.textContent = 'Hi there'
    await waitFor(() => expect(block.querySelector('[data-nola-translation]')?.textContent).toBe('T Hi there'))
  } finally { page.stop() }
})

it('refreshes a paragraph when site styles hide and show it', async () => {
  document.body.innerHTML = '<main><p>Hello</p></main>'
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) {
    return (this.closest('[style*="display: none"]') ? [] : [{}]) as unknown as DOMRectList
  })
  const block = document.querySelector('p')!
  const page = createPageTranslation({ translate: vi.fn(async (text: string) => `T ${text}`), close: vi.fn() })
  try {
    page.configure({ ...DEFAULT_PREFERENCES, translateTitle: false })
    page.start()
    await waitFor(() => expect(block.querySelector('[data-nola-translation]')).not.toBeNull())
    block.style.display = 'none'
    await waitFor(() => expect(block.querySelector('[data-nola-translation]')).toBeNull())
    block.style.display = ''
    await waitFor(() => expect(block.querySelector('[data-nola-translation]')?.textContent).toBe('T Hello'))
  } finally { page.stop() }
})

it('keeps bilingual text in a single flex item and translates compact controls in place', async () => {
  document.body.innerHTML = '<article><div id="flow" style="display:flex">Flexible text</div><button id="fixed" style="display:flex;height:32px">Fixed label</button><nav><a style="white-space:nowrap">Compact label</a></nav><p>Article body</p></article>'
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  const translate = vi.fn(async (text: string) => 'T ' + text)
  const page = createPageTranslation({ translate, close: vi.fn() })
  const flow = document.querySelector<HTMLElement>('#flow')!
  const source = flow.firstChild
  const preferences = { ...DEFAULT_PREFERENCES, translateTitle: false, pageStyle: 'plain' as const }
  try {
    page.configure(preferences)
    page.start()
    await waitFor(() => expect(flow.querySelector('[data-nola-source-line] [data-nola-translation]')?.textContent).toBe('T Flexible text'))
    await waitFor(() => expect(document.querySelector('p [data-nola-translation]')).not.toBeNull())
    expect(flow.children).toHaveLength(1)
    expect(flow.style.cssText).toBe('display: flex;')
    expect(document.querySelector('#fixed')?.textContent).toBe('T Fixed label')
    expect(document.querySelector('nav a')?.textContent).toBe('T Compact label')
    expect(document.querySelector('#fixed [data-nola-translation], nav [data-nola-translation]')).toBeNull()
    const annotation = flow.querySelector<HTMLElement>('[data-nola-translation]')!
    page.configure({ ...preferences, pageStyle: 'underline' })
    expect(annotation.style.textDecoration).toBe('underline')
    expect(translate).toHaveBeenCalledTimes(4)
    page.configure({ ...preferences, pageDisplay: 'translation' })
    expect(flow.querySelector('[data-nola-single-slot]')?.getAttribute('aria-label')).toBe('T Flexible text')
    expect(flow.textContent).toBe('Flexible text')
    page.configure(preferences)
    expect(flow.querySelector('[data-nola-translation]')?.textContent).toBe('T Flexible text')
    expect(translate).toHaveBeenCalledTimes(4)
    page.stop()
    expect(flow.firstChild).toBe(source)
    expect(flow.style.cssText).toBe('display: flex;')
    expect(document.querySelector('[data-nola-source-line]')).toBeNull()
  } finally { page.stop() }
})

it('preserves automatic table widths and restores a shared clipping override', async () => {
  document.body.innerHTML = '<article><div id="clip" style="max-height:24px;overflow-y:hidden"><p>First text</p><p>Second text</p></div><table><tbody><tr><td>Auto table</td></tr></tbody></table><table style="table-layout:fixed"><tbody><tr><td>Fixed table</td></tr></tbody></table></article>'
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  const clipping = document.querySelector<HTMLElement>('#clip')!
  Object.defineProperties(clipping, { clientHeight: { value: 24 }, scrollHeight: { value: 80 } })
  const page = createPageTranslation({ translate: async text => 'T ' + text, close: vi.fn() })
  try {
    page.configure({ ...DEFAULT_PREFERENCES, translateTitle: false })
    page.start()
    await waitFor(() => expect(document.querySelectorAll('[data-nola-translation]')).toHaveLength(4))
    const cells = document.querySelectorAll<HTMLElement>('td [data-nola-translation]')
    expect(cells[0].style.contain).toBe('inline-size')
    expect(cells[1].style.contain).toBe('')
    expect(clipping.style.maxHeight).toBe('unset')
    expect(clipping.style.overflowY).toBe('hidden')
    clipping.firstElementChild!.remove()
    await waitFor(() => expect(document.querySelectorAll('[data-nola-translation]')).toHaveLength(3))
    expect(clipping.style.maxHeight).toBe('unset')
    clipping.style.color = 'red'
    page.stop()
    expect(clipping.style.maxHeight).toBe('24px')
    expect(clipping.style.color).toBe('red')
  } finally { page.stop() }
})
