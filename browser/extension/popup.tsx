import { useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { Button } from '@heroui/react'
import { createPopupStore } from './popupStore'
import { browserText, errorKey } from './i18n'
import './styles.css'

export interface PopupProps { store: ReturnType<typeof createPopupStore> }
export function Popup({ store }: PopupProps) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const t = browserText(state.language)
  return <main className="nola-popup"><h1 className="nola-heading">{t('button')}</h1><p className="nola-muted">{state.origin ?? t('guideThree')}</p>
    <Button variant="primary" isDisabled={!state.origin || state.pending} onPress={store.enable}>{state.enabled ? t('siteEnabled') : t('enableSite')}</Button>
    {state.error && <p role="alert" className="nola-error">{t(errorKey(state.error))}</p>}
  </main>
}
const mount = document.getElementById('root')
if (mount) {
  const store = createPopupStore()
  createRoot(mount).render(<Popup store={store} />)
  void store.init().catch(() => undefined)
}
