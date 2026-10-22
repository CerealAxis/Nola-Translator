import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Menu } from '@base-ui/react/menu'
import { actions, stores, useStore } from '@/store'
import { useI18n } from '@/i18n'
import { notifyError } from '@/components/primitives/notify'
import type { OverlayMenuKind } from '../../../shared/overlay-menu'

export interface OverlayDropdownProps {
  kind: OverlayMenuKind
  children: ReactNode
}

/** Reuse the exact trigger, Popover and Menu tree in either the demo or a native menu surface. */
export function OverlayDropdown({ kind, children }: OverlayDropdownProps) {
  const { t } = useI18n()
  const anchor = useRef<HTMLSpanElement>(null)
  const [localOpen, setLocalOpen] = useState(false)
  const presentation = useStore(stores.settings, state => state.overlayMenu)
  const isPopup = new URLSearchParams(window.location.search).get('overlayMenu') === '1'
  const popupKind = isPopup ? presentation?.kind : null
  const modality = useRef<'pointer' | 'keyboard'>('pointer')
  const [popupOpen, setPopupOpen] = useState(true)
  const closeRequested = useRef(false)
  const closeId = useRef<number | null>(null)
  if (popupKind && popupKind !== kind) return null

  const onOpenChange = (open: boolean): void => {
    if (popupKind) {
      if (!open) {
        closeRequested.current = true
        closeId.current = presentation?.id ?? null
        setPopupOpen(false)
      }
      return
    }
    if (!open) {
      setLocalOpen(false)
      return
    }
    const box = anchor.current?.getBoundingClientRect()
    if (!box) return
    void actions.settings.openOverlayMenu({
      kind, modality: modality.current, anchor: { x: box.x, y: box.y, width: box.width, height: box.height },
    }).then(handled => {
      if (!handled) setLocalOpen(true)
    }).catch((error: unknown) => {
      console.warn('[overlay] menu failed', error)
      notifyError(t('overlay.menuFailed'), { cause: error })
    })
  }

  const onOpenChangeComplete = (open: boolean): void => {
    if (open || !popupKind || !closeRequested.current) return
    closeRequested.current = false
    const id = closeId.current
    closeId.current = null
    if (!id) return
    void actions.settings.closeOverlayMenu(id).catch((error: unknown) => {
      console.warn('[overlay] menu close failed', error)
      notifyError(t('overlay.menuFailed'), { cause: error })
    })
  }

  return (
    <span ref={anchor} className="nola-caption-menu-trigger" data-menu-kind={kind}
      onPointerDownCapture={() => { modality.current = 'pointer' }}
      onKeyDownCapture={() => { modality.current = 'keyboard' }}>
      <Menu.Root
        open={isPopup ? popupOpen : localOpen}
        onOpenChange={onOpenChange}
        onOpenChangeComplete={onOpenChangeComplete}
        modal={false}
      >
        {children}
      </Menu.Root>
    </span>
  )
}
