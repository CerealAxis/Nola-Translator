import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Dropdown } from '@heroui/react'
import { actions, stores, useStore } from '@/store'
import type { OverlayMenuKind } from '../../../shared/overlay-menu'

export interface OverlayDropdownProps {
  kind: OverlayMenuKind
  children: ReactNode
}

/** Reuse the exact trigger, Popover and Menu tree in either the demo or a native menu surface. */
export function OverlayDropdown({ kind, children }: OverlayDropdownProps) {
  const anchor = useRef<HTMLSpanElement>(null)
  const [localOpen, setLocalOpen] = useState(false)
  const presentation = useStore(stores.settings, state => state.overlayMenu)
  const isPopup = new URLSearchParams(window.location.search).get('overlayMenu') === '1'
  const popupKind = isPopup ? presentation?.kind : null
  const modality = useRef<'pointer' | 'keyboard'>('pointer')
  const [popupOpen, setPopupOpen] = useState(true)
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (closing.current !== null) clearTimeout(closing.current)
  }, [])
  if (popupKind && popupKind !== kind) return null

  const onOpenChange = (open: boolean): void => {
    if (popupKind) {
      if (!open && closing.current === null) {
        const id = presentation!.id
        setPopupOpen(false)
        // Keep HeroUI's exit animation and let the item's settings IPC leave before hiding the surface.
        closing.current = setTimeout(() => {
          void actions.settings.closeOverlayMenu(id).catch((error: unknown) => console.warn('[overlay] menu close failed', error))
        }, 120)
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
    }).catch((error: unknown) => console.warn('[overlay] menu failed', error))
  }

  return (
    <span ref={anchor} className="nola-caption-menu-trigger" data-menu-kind={kind}
      onPointerDownCapture={() => { modality.current = 'pointer' }}
      onKeyDownCapture={() => { modality.current = 'keyboard' }}>
      <Dropdown isOpen={isPopup ? popupOpen : localOpen} onOpenChange={onOpenChange}>
        {children}
      </Dropdown>
    </span>
  )
}
