import { afterEach, expect, it, vi } from 'vitest'
import { createIpcBridge } from '@/bridge/ipc/ipcBridge'
import { disposeStores, initStores } from './index'
import { attachSettingsStore, checkForAppUpdate, detachSettingsStore, loadSettings, refreshComputeDevices, settingsStore } from './settingsStore'
import { DEFAULT_SETTINGS } from '../../shared/settings'
import type { ComputeSnapshot } from '../../shared/compute'

const snapshot: ComputeSnapshot = { devices: [], notes: [], torchVersion: '', activePlan: null }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

afterEach(async () => { await disposeStores(); detachSettingsStore(); vi.restoreAllMocks() })

it('publishes saved settings while storage and runtime checks are still pending', async () => {
  const bridge = createIpcBridge()
  const storage = deferred<Awaited<ReturnType<typeof bridge.storage.get>>>()
  const runtimes = deferred<Awaited<ReturnType<typeof bridge.runtimes.list>>>()
  vi.spyOn(bridge.settings, 'get').mockResolvedValue(DEFAULT_SETTINGS)
  vi.spyOn(bridge.storage, 'get').mockReturnValue(storage.promise)
  vi.spyOn(bridge.runtimes, 'list').mockReturnValue(runtimes.promise)
  vi.spyOn(bridge.engine, 'listComputeDevices').mockResolvedValue(snapshot)
  initStores(bridge)
  await loadSettings()
  expect(settingsStore.getState()).toMatchObject({ settings: DEFAULT_SETTINGS, loaded: true, loading: false })
  expect(settingsStore.getState().storage).toBeNull()
  storage.resolve({ activePath: 'C:\\Nola', configuredPath: 'C:\\Nola', restartRequired: false })
})

it('does not repeat main-window diagnostics in the caption overlay', async () => {
  const bridge = createIpcBridge()
  const compute = vi.spyOn(bridge.engine, 'listComputeDevices')
  const runtime = vi.spyOn(bridge.runtimes, 'list')
  const storage = vi.spyOn(bridge.storage, 'get')
  initStores(bridge, { backgroundChecks: false })
  await loadSettings()
  expect(settingsStore.getState().settings).not.toBeNull()
  expect(compute).not.toHaveBeenCalled()
  expect(runtime).not.toHaveBeenCalled()
  expect(storage).not.toHaveBeenCalled()
})

it('starts compute detection in the background when stores initialize', async () => {
  const bridge = createIpcBridge()
  const detection = deferred<ComputeSnapshot>()
  const list = vi.spyOn(bridge.engine, 'listComputeDevices').mockReturnValue(detection.promise)
  vi.spyOn(bridge.runtimes, 'list').mockRejectedValue(new Error('runtime unavailable'))
  initStores(bridge)
  await loadSettings()
  expect(settingsStore.getState().settings).not.toBeNull()
  expect(list).toHaveBeenCalledTimes(1)
  detection.resolve(snapshot)
  await detection.promise
})

it('shares concurrent device refreshes and retains the last result on failure', async () => {
  const bridge = createIpcBridge()
  const detection = deferred<ComputeSnapshot>()
  const list = vi.spyOn(bridge.engine, 'listComputeDevices').mockReturnValue(detection.promise)
  attachSettingsStore(bridge)
  const first = refreshComputeDevices()
  const second = refreshComputeDevices()
  expect(list).toHaveBeenCalledTimes(1)
  detection.resolve(snapshot)
  await Promise.all([first, second])
  expect(settingsStore.getState().computeSnapshot).toEqual(snapshot)
  list.mockRejectedValueOnce(new Error('device probe failed'))
  await expect(refreshComputeDevices()).rejects.toThrow('device probe failed')
  expect(settingsStore.getState().computeSnapshot).toEqual(snapshot)
})

it('forces a fresh GitHub version check from settings and publishes the result', async () => {
  const bridge = createIpcBridge()
  const release = {
    currentVersion: '1.0.3', latestVersion: '1.1.0', updateAvailable: true,
    releaseName: 'Release 1.1.0', releaseNotes: 'New features',
    releaseUrl: 'https://github.com/CerealAxis/Nola-Translator/releases/tag/v1.1.0',
  }
  const check = vi.spyOn(bridge.app, 'checkLatestRelease').mockResolvedValue(release)
  attachSettingsStore(bridge, false)

  await expect(checkForAppUpdate(true)).resolves.toEqual(release)

  expect(check).toHaveBeenCalledWith(true)
  expect(settingsStore.getState()).toMatchObject({ appUpdate: release, appUpdateChecking: false, appUpdateError: false })
})
