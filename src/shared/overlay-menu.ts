import type { AppSettings } from './settings'
import type { ResourceRecord } from './contracts'

export const OVERLAY_MENU_KINDS = ['model', 'source', 'target', 'display', 'layout', 'confirm'] as const
export type OverlayMenuKind = typeof OVERLAY_MENU_KINDS[number]

export interface OverlayMenuRequest {
  kind: OverlayMenuKind
  /** Trigger rectangle relative to the caption's content viewport, in DIP. */
  anchor: { x: number; y: number; width: number; height: number }
  modality: 'pointer' | 'keyboard'
  settings: AppSettings
  resources: readonly ResourceRecord[]
}

export interface OverlayMenuPresentation extends OverlayMenuRequest {
  id: number
  placement: 'top' | 'bottom'
  maxHeight: number
  triggerX: number
}

/** Match `.nola-language-options`: min(4 * --space-8, 45dvh). */
export const LANGUAGE_MENU_MAX_HEIGHT = 320
export const LANGUAGE_MENU_SCREEN_FRACTION = 0.45
