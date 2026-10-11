import { useSyncExternalStore } from 'react'
import { Button } from '@heroui/react'
import { AudioLines, Play, RefreshCw, Square, X } from 'lucide-react'
import { captionAudioSource, type ExtensionStore } from '../store'
import { browserText, errorKey } from '../i18n'
import { NolaLogo } from '../logo'

export interface PanelProps { store: ExtensionStore }
export function Panel({ store }: PanelProps) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const t = browserText(state.summary?.uiLanguage)
  const locked = state.status !== 'idle' || state.capturePending
  const running = state.status === 'starting' || state.status === 'active'
  const tabAudio = captionAudioSource(state.config) === 'tab'
  const compatible = state.summary?.extensionCompatible !== false
  const blocked = !state.selectedVideo || !state.connected || !state.summary?.browserAudio || !state.captionServiceActive || !compatible
  const primaryDisabled = state.status === 'active' ? false : blocked || locked
  const status = !state.connected ? 'statusDisconnected' : !compatible ? 'extensionVersionMismatch' : state.status === 'starting' ? 'starting' : state.status === 'stopping' ? 'stopping' : running ? 'statusRecognizing' : state.captionServiceActive ? 'statusReady' : 'captionServiceOff'
  return <section className="nola-extension nola-panel" aria-label={t('button')}>
    <header className="nola-panel-header">
      <span className="nola-panel-brand"><NolaLogo /><h2 className="nola-heading">{t('button')}</h2></span>
      <Button isIconOnly variant="secondary" className="nola-panel-close" aria-label={t('close')} onPress={store.closePanel}><X aria-hidden="true" /></Button>
    </header>
    <p className="nola-status" role="status" data-state={running ? 'recognizing' : state.connected && compatible && state.captionServiceActive ? 'ready' : 'unavailable'}>{t(status)}</p>
    {state.error === 'tabAudioSilent'
      ? <p role="status" className="nola-warning">{t(errorKey(state.error))}</p>
      : state.error ? <p role="alert" className="nola-error">{t(errorKey(state.error))}</p> : null}
    <div className="nola-panel-controls">
      <Button variant="primary" isDisabled={primaryDisabled} onPress={() => { if (state.status === 'active') void store.stop(); else store.pressStart() }}>
        {state.status === 'active' ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}
        {state.status === 'active' ? t('end') : state.status === 'starting' ? t('starting') : state.status === 'stopping' ? t('stopping') : t('start')}
      </Button>
      <Button variant="secondary" isDisabled={state.status === 'starting' || state.status === 'stopping' || state.capturePending} onPress={() => { void store.refresh() }}><RefreshCw aria-hidden="true" />{t('refresh')}</Button>
    </div>
    {tabAudio && <Button variant="secondary" isDisabled={locked || !state.connected || !compatible} onPress={store.pressCapture}><AudioLines aria-hidden="true" />{t(state.audioCaptured ? 'audioCaptured' : 'captureAudio')}</Button>}
  </section>
}
