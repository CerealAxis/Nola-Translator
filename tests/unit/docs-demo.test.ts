import { afterEach, describe, expect, it, vi } from 'vitest'
import { prepareDemo } from '../../docs/media-src/demo'
import { connectDemo } from '../../docs/media-src/demoBridge'
import { disposeStores, getBridge, stores } from '../../src/renderer/store'
import { RECOMMENDED_CONFIGURATIONS } from '../../src/shared/model-capabilities'

afterEach(async () => {
  await disposeStores()
  delete window.nolaTranslator
  vi.unstubAllGlobals()
})

describe('shared documentation and Toy demo', () => {
  it('starts idle for exploration and seeds configured demo models', () => {
    prepareDemo('zh-CN', 'home')
    expect(stores.session.getState().status).toBe('idle')
    expect(stores.session.getState().sessionId).toBeNull()
    const resources = stores.models.getState().resources
    const settings = stores.settings.getState().settings!
    expect(resources.length).toBeGreaterThan(0)
    expect(resources.every(item => item.resourceId in RECOMMENDED_CONFIGURATIONS)).toBe(true)
    expect(resources.some(item => item.resourceId === settings.recognition.modelId)).toBe(true)
    expect(resources.some(item => item.resourceId === settings.translation.localModelId)).toBe(true)
    expect(stores.meetings.getState().meetings[0].segmentCount).toBe(stores.session.getState().segments.length)
  })

  it('keeps deterministic running captions only for explicit screenshots', () => {
    prepareDemo('ja', 'workspace', true)
    expect(stores.session.getState().status).toBe('running')
    expect(stores.session.getState().segments[0].translations[0].targetLanguage).toBe('ja')
  })

  it('simulates component installs and credentials without network requests', async () => {
    const fetch = vi.fn(() => { throw new Error('Demo must not call remote services') })
    vi.stubGlobal('fetch', fetch)
    connectDemo(prepareDemo('zh-CN', 'home'), () => undefined)
    const bridge = getBridge()!
    await bridge.settings.get()
    const runtime = await bridge.runtimes.list()
    const choice = runtime.recipes.find(item => !item.installed)!
    await bridge.runtimes.install(choice.id)
    expect((await bridge.runtimes.list()).local.engine.id).toBe(choice.id)
    await bridge.translation.setCredential('cloud', 'demo-only')
    expect(await bridge.translation.hasCredential('cloud')).toBe(true)
    await bridge.translation.setCredential('cloud', '')
    expect(await bridge.translation.hasCredential('cloud')).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not restore stale captions when an overlay is closed after stopping', async () => {
    const overlay = vi.fn()
    const { closeOverlay } = connectDemo(prepareDemo('en', 'workspace', true), overlay)
    await getBridge()!.overlay.show()
    stores.session.setState({ status: 'idle', sessionId: null, segments: [] })
    closeOverlay()
    expect(overlay.mock.calls).toEqual([[true], [false]])
    expect(stores.session.getState().segments).toEqual([])
  })
})
