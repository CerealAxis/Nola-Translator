import { join } from 'node:path'

import type { BrowserWindowConstructorOptions } from 'electron'

export function resolvePreloadPath(mainDirectory: string): string {
  return join(mainDirectory, '../preload/index.cjs')
}

export function createMainWindowOptions(preload: string): BrowserWindowConstructorOptions {
  return {
    width: 1180,
    height: 780,
    minWidth: 760,
    minHeight: 560,
    resizable: true,
    show: false,
    autoHideMenuBar: true,
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
