import { afterEach, expect, it, vi } from 'vitest'
import { prepareContentRuntime, registerContentRuntime } from './content-lifecycle'
afterEach(() => { document.dispatchEvent(new Event('nola:replace-content-runtime')); delete (globalThis as typeof globalThis & { __nolaContentRuntime?: unknown }).__nolaContentRuntime; document.body.replaceChildren(); document.documentElement.removeAttribute('data-nola-installed'); vi.unstubAllGlobals() })
function validContext() { vi.stubGlobal('chrome', { runtime: { getManifest: () => ({ version: '1' }) } }) }
it('replaces an inert reload marker and keeps exactly one live runtime', () => {
  validContext(); document.documentElement.dataset.nolaInstalled = 'old'
  document.body.innerHTML = '<div data-nola-extension="floating">Old controls</div><p>Source<span data-nola-translation>译文</span></p>'
  const owner = prepareContentRuntime()!
  expect(owner).not.toBe('old'); expect(document.querySelector('[data-nola-extension]')).toBeNull()
  expect(document.querySelector('p')?.textContent).toBe('Source')
  const destroy = vi.fn(); const release = registerContentRuntime(owner, destroy)
  expect(prepareContentRuntime()).toBeUndefined()
  document.dispatchEvent(new Event('nola:replace-content-runtime'))
  expect(destroy).toHaveBeenCalledOnce(); release()
  expect(prepareContentRuntime()).toBeTruthy()
})
it('restores translation-only text on reinjection without changing newer page edits', () => {
  validContext(); document.body.innerHTML = '<p><template data-nola-original="Hello" data-nola-result="你好"></template>你好</p><p><template data-nola-original="Original" data-nola-result="旧译文"></template>New page text</p>'
  prepareContentRuntime()
  expect(document.body.textContent).toBe('HelloNew page text')
  expect(document.querySelector('template')).toBeNull()
})
it('does nothing when the extension API context is invalid', () => {
  vi.stubGlobal('chrome', { runtime: { getManifest: () => { throw new Error('Extension context invalidated') } } })
  document.documentElement.dataset.nolaInstalled = 'preserved'
  expect(prepareContentRuntime()).toBeUndefined()
  expect(document.documentElement.dataset.nolaInstalled).toBe('preserved')
})

it('replaces an old-realm registry whose API context has been invalidated', () => {
  validContext(); const destroy = vi.fn()
  Object.assign(globalThis, { __nolaContentRuntime: { owner: 'stale', destroy, valid: () => false } })
  document.documentElement.dataset.nolaInstalled = 'stale'
  expect(prepareContentRuntime()).toBeTruthy()
  expect(destroy).toHaveBeenCalledOnce()
})
