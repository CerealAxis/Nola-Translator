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
 * `electron-vite` bundles the main process to `out/main/index.js`, so the main directory handed in
 * here is `<root>/out/main` and the project root — the one that actually holds `build/icon.ico` — is
 * two levels up, not one: `resolvePreloadPath` and the renderer `loadFile` call in
 * `src/main/index.ts` both confirm the `out/` prefix.
 *
 * A packaged build has no `build/` directory to point at. The `build.files` list in `package.json`
 * ships only the bundled `out` tree and `package.json` itself, so the icon never lands inside the
 * asar, and the executable keeps the one electron-builder already stamps in. Probing for the file is
 * what keeps that production case from handing Electron a path that does not exist — a deliberate
 * branch here rather than a caught exception — so the caller gets `undefined` and omits the option.
 */
export function resolveWindowIconPath(mainDirectory: string): string | undefined {
  const icon = join(mainDirectory, '..', '..', 'build', 'icon.ico')
  return existsSync(icon) ? icon : undefined
}

export function createMainWindowOptions(
  preload: string,
  theme: AppSettings['theme'] = 'system',
  // The main directory is passed in rather than read from `__dirname` here on purpose: only
  // `src/main/index.ts` runs as the real CommonJS bundle, and under the unit tests this module is
  // loaded through Vite, which substitutes a `__dirname` of its own. Resolving at the call site keeps
  // the icon path tied to the genuine bundle location and leaves the option unset when there is no
  // main directory to resolve against.
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
