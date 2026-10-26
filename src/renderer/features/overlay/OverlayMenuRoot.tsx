import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { actions, getBridge, stores, useStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { OverlayControls } from './OverlayControls'
import { useI18n } from '@/i18n'
import { notifyError } from '@/components/primitives/notify'

/** The preloaded document only receives snapshots; it performs no engine, device or meeting queries. */
export function OverlayMenuRoot() {
  const menu = useStore(stores.settings, state => state.overlayMenu)
  const { t } = useI18n()
  useLayoutEffect(() => {
    if (!menu) return
    // The mouse press happened in the caption document, so the menu document here has not seen that input modality.
    document.documentElement.dataset.overlayMenuInput = menu.modality
    const dark = menu.settings.theme === 'dark'
      || menu.settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches
    document.documentElement.classList.toggle('dark', dark)
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    const keyboard = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') document.documentElement.dataset.overlayMenuInput = 'keyboard'
    }
    const pointer = (): void => { document.documentElement.dataset.overlayMenuInput = 'pointer' }
    document.addEventListener('keydown', keyboard, true)
    document.addEventListener('pointerdown', pointer, true)
    return () => {
      document.removeEventListener('keydown', keyboard, true)
      document.removeEventListener('pointerdown', pointer, true)
      delete document.documentElement.dataset.overlayMenuInput
    }
  }, [menu?.id])

  useEffect(() => {
    if (!menu) return
    const id = menu.id
    let frame = 0
    let painted = false
    const present = (): void => {
      const content = document.querySelector(menu.kind === 'confirm' ? '.nola-confirm-dialog' : '.nola-caption-menu')
      if (content && content.getBoundingClientRect().height > 0) {
        if (painted) {
          void actions.settings.presentOverlayMenu(id).catch((error: unknown) => {
            console.warn('[overlay] menu show failed', error)
            notifyError(t('overlay.menuFailed'), { cause: error })
          })
          return
        }
        painted = true
      }
      frame = requestAnimationFrame(present)
    }
    frame = requestAnimationFrame(present)
    return () => cancelAnimationFrame(frame)
  }, [menu?.id])

  if (!menu) return null
  if (menu.kind === 'confirm') return <OverlayCloseConfirmation id={menu.id} />
  return (
    <main className="nola-overlay-menu-surface" data-placement={menu.placement}
      style={{
        '--nola-menu-trigger-width': `${menu.anchor.width}px`,
        '--nola-menu-trigger-height': `${menu.anchor.height}px`,
        '--nola-menu-trigger-x': `${menu.triggerX}px`,
      } as CSSProperties}>
      <OverlayControls key={menu.id} active={false} locked={false} />
    </main>
  )
}

/** Keep the existing confirmation card intact while its native surface escapes the caption bounds. */
function OverlayCloseConfirmation({ id }: { id: number }) {
  const { t } = useI18n()
  const [pending, setPending] = useState(false)
  const surfaceRef = useRef<HTMLElement>(null)
  const cancel = (): void => {
    if (pending) return
    void actions.settings.closeOverlayMenu(id).catch((error: unknown) => {
      notifyError(t('overlay.menuFailed'), { cause: error })
    })
  }

  const close = async (): Promise<void> => {
    if (pending) return
    setPending(true)
    try {
      const bridge = getBridge()
      if (!bridge) throw new Error('Overlay bridge unavailable')
      await bridge.overlay.close()
    } catch (error) {
      console.error('[overlay] close failed', error)
      notifyError(t('overlay.closeFailed'), { cause: error })
    } finally {
      setPending(false)
    }
  }

  return (
    <main ref={surfaceRef} className="nola-overlay-confirm-surface">
      <BaseDialog.Root open onOpenChange={open => { if (!open) cancel() }}>
      <BaseDialog.Portal container={surfaceRef}>
      <BaseDialog.Popup className="nola-confirm-dialog">
        <BaseDialog.Title render={<p />} className="nola-confirm-title">{t('overlay.closeTitle')}</BaseDialog.Title>
        <BaseDialog.Description render={<p />} className="nola-confirm-text">{t('overlay.closeBody')}</BaseDialog.Description>
        <div className="nola-confirm-actions">
          <Button variant="secondary" size="sm" disabled={pending}
            onClick={cancel}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" size="sm" disabled={pending} aria-busy={pending} onClick={() => void close()}>
            {t(pending ? 'overlay.closing' : 'overlay.closeConfirm')}
          </Button>
        </div>
      </BaseDialog.Popup>
      </BaseDialog.Portal>
      </BaseDialog.Root>
    </main>
  )
}
