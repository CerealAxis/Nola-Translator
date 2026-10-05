import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { BrowserWindowConstructorOptions } from 'electron'

import type { AppSettings } from '../shared/settings'

/** Matches the light/dark surfaces the renderer paints, so the window never shows a bare white frame before the page draws. */
const SURFACE = { light: '#F2F7FF', dark: '#101A2D' } as const

export function resolvePreloadPath(mainDirectory: string): string {
  return join(mainDirectory, '../preload/index.cjs')
}

/**
 * `electron-vite` bundles the main process to `out/main/index.js`, so the project root that
 * holds `build/icon.ico` is two levels up from the directory handed in here.
 *
 * A packaged build has no `build/` directory: `package.json` ships only the bundled `out` tree
 * and `package.json` itself, and electron-builder stamps the icon into the executable. Probing
 * for the file — rather than catching an exception — is what lets the caller get `undefined` and
 * omit the option entirely.
 */
export function resolveWindowIconPath(mainDirectory: string): string | undefined {
  const icon = join(mainDirectory, '..', '..', 'build', 'icon.ico')
  return existsSync(icon) ? icon : undefined
}

export function createMainWindowOptions(
  preload: string,
  theme: AppSettings['theme'] = 'system',
  // Passed in rather than read from `__dirname`: only `src/main/index.ts` runs as the real
  // CommonJS bundle, and the unit tests load this module through Vite, which substitutes its own
  // `__dirname`.
  mainDirectory?: string
): BrowserWindowConstructorOptions {
  const icon = mainDirectory ? resolveWindowIconPath(mainDirectory) : undefined
  return {
    width: 1180,
    height: 780,
    minWidth: 760,
    minHeight: 560,
    resizable: true,
    show: false,
    autoHideMenuBar: true,
    // Without this, dev shows the Electron atom logo: the running process really is `electron.exe`
    // there, and Windows has no way to know which product is asking. A packaged build is unaffected
    // either way, because there the icon is compiled into the exe by electron-builder.
    ...(icon ? { icon } : {}),
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
