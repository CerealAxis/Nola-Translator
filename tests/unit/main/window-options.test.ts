import { describe, expect, it } from 'vitest'

import { createMainWindowOptions, resolvePreloadPath } from '../../../src/main/window-options'

describe('createMainWindowOptions', () => {
  it('creates a freely resizable Windows 11 window with usable minimum bounds', () => {
    const options = createMainWindowOptions('C:\\app\\preload.js')

    expect(options).toMatchObject({
      width: 1180,
      height: 780,
      minWidth: 760,
      minHeight: 560,
      resizable: true,
      show: false,
      autoHideMenuBar: true,
      backgroundMaterial: 'mica',
      titleBarStyle: 'hidden',
      webPreferences: {
        preload: 'C:\\app\\preload.js',
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false
      }
    })
  })
})

describe('resolvePreloadPath', () => {
  it('points to the CommonJS preload artifact supported by sandboxed renderers', () => {
    expect(resolvePreloadPath('C:\\app\\out\\main')).toBe('C:\\app\\out\\preload\\index.cjs')
  })
})
