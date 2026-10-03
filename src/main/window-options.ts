import { join } from 'node:path'

import type { BrowserWindowConstructorOptions } from 'electron'

import type { AppSettings } from '../shared/settings'

/** Matches the light/dark surfaces the renderer paints, so the window never shows a bare white frame before the page draws. */
const SURFACE = { light: '#F2F7FF', dark: '#101A2D' } as const

export function resolvePreloadPath(mainDirectory: string): string {
  return join(mainDirectory, '../preload/index.cjs')
}

export function createMainWindowOptions(
  preload: string,
  theme: AppSettings['theme'] = 'system'
): BrowserWindowConstructorOptions {
  return {
    width: 1180,
    height: 780,
    minWidth: 760,
    minHeight: 560,
    resizable: true,
    show: false,
    autoHideMenuBar: true,
    // Only a definite preference can pick a colour; 'system' has to wait for the renderer to
    // resolve it, and guessing light here is exactly the white flash this is meant to avoid.
    backgroundColor: theme === 'light' || theme === 'dark' ? SURFACE[theme] : '#00000000',
    backgroundMaterial: 'mica',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: '#1f1f1f',
      height: 48
    },
    webPreferences: {
      preload,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  }
}
