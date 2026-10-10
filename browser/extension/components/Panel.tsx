import { useSyncExternalStore } from 'react'
import { Button } from '@heroui/react'
import { captionAudioSource, SYSTEM_DEFAULT_OUTPUT_ID, type ExtensionStore } from '../store'
import { browserText, errorKey } from '../i18n'
import { ChoiceField } from './ChoiceField'

export interface PanelProps { store: ExtensionStore }
/** The desktop owns these values, so the panel mirrors them without offering an editor. */
function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return <div className="nola-row"><span>{label}</span><span className="nola-value">{value}</span></div>
}
type ServiceKey = 'statusDisconnected' | 'statusRecognizing' | 'statusReady' | 'statusEngineNotReady'
function serviceState(connected: boolean, browserAudio: boolean | undefined, working: boolean): ServiceKey {
  if (!connected) return 'statusDisconnected'
  if (working) return 'statusRecognizing'
  return browserAudio ? 'statusReady' : 'statusEngineNotReady'
}
export function Panel({ store }: PanelProps) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const t = browserText(state.summary?.uiLanguage)
  const locked = state.status !== 'idle'
  const config = state.config
  const running = state.status === 'starting' || state.status === 'active'
  const stopping = state.status === 'stopping'
  const service = serviceState(state.connected, state.summary?.browserAudio, running)
  const systemAudio = captionAudioSource(config) === 'system'
  const deviceId = config.audioDeviceId
  // The device list is captured with the summary and holds real devices only, so a device that has
  // disappeared since keeps its own id instead of being shown as the default output.
  const outputName = !deviceId || deviceId === SYSTEM_DEFAULT_OUTPUT_ID
    ? t('defaultOutput')
    : state.summary?.devices.find(device => device.deviceId === deviceId)?.name ?? deviceId
  const startLabel = systemAudio ? t('on') : t('shareTabAudio')
  // A running session turns the same button into the only way to end it, so it stays enabled while
  // the shutdown runs and only blocks once there is nothing left to start.
  const blocked = locked || !state.selectedVideo || !state.connected || !state.summary?.browserAudio || !state.captionServiceActive
  return <section className="nola-extension nola-panel" aria-label={t('button')}>
    <div className="nola-actions"><h2 className="nola-heading">{t('button')}</h2><Button variant="ghost" size="sm" onPress={store.closePanel}>{t('close')}</Button></div>
    <p className="nola-status" data-state={service === 'statusReady' ? 'ready' : service === 'statusRecognizing' ? 'recognizing' : 'unavailable'}>{t(service)}</p>
    {state.connected && !state.captionServiceActive && <p className="nola-muted">{t('captionServiceOff')}</p>}
    {state.videos.length > 1 && <ChoiceField label={t('chooseVideo')} disabled={locked} value={state.selectedVideo ? String(state.videos.indexOf(state.selectedVideo)) : ''} onChange={value => store.chooseVideo(Number(value))} options={state.videos.map((video, index) => ({ value: String(index), label: video.getAttribute('title') || `${t('video')} ${index + 1}` }))} />}
    <ReadOnlyRow label={t('source')} value={systemAudio ? t('systemAudio') : t('tabAudio')} />
    {systemAudio && <ReadOnlyRow label={t('outputDevice')} value={outputName} />}
    <ReadOnlyRow label={t('fontSize')} value={`${config.fontSize}px`} />
    <ReadOnlyRow label={t('position')} value={`${Math.round(config.position)}%`} />
    <p className="nola-muted">{t('configManagedByDesktop')}</p>
    {state.error && <p role="alert" className="nola-error">{t(errorKey(state.error))}</p>}
    {['torchUnavailable', 'llamaUnavailable'].includes(state.error ?? '') && <Button variant="secondary" onPress={() => { void store.openRuntimeSettings() }}>{t('runtimeSettings')}</Button>}
    <div className="nola-actions"><div className="nola-toggle"><Button variant={running || stopping ? 'danger' : 'primary'} isDisabled={running ? stopping : blocked} onPress={running ? () => { void store.stop() } : store.pressStart}>{running ? t('off') : stopping ? t('stopping') : startLabel}</Button></div>
      {!state.connected && <Button variant="secondary" isDisabled={locked} onPress={() => { void store.init() }}>{t('retry')}</Button>}
    </div>
  </section>
}
