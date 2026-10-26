import { describe, expect, it } from 'vitest'

import { createMainWindowOptions, isAllowedRendererPermission, isTrustedRendererUrl, resolvePreloadPath } from '../../../src/main/window-options'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

it('allows only trusted microphone capture and sanitized clipboard writes', () => {
  expect(isAllowedRendererPermission('media', true, ['audio'])).toBe(true)
  expect(isAllowedRendererPermission('clipboard-sanitized-write', true)).toBe(true)
  for (const [permission, types] of [
    ['media', []], ['media', ['video']], ['media', ['audio', 'video']], ['media', ['unknown']],
    ['clipboard-read', []], ['geolocation', []], ['notifications', []],
  ] as const) expect(isAllowedRendererPermission(permission, true, types)).toBe(false)
  expect(isAllowedRendererPermission('media', false, ['audio'])).toBe(false)
  expect(isAllowedRendererPermission('clipboard-sanitized-write', false)).toBe(false)
})

it('trusts only application entry documents, including queries and hash routes', () => {
  const directory = 'C:\\app\\out\\main'
  const entry = pathToFileURL(join(directory, '../renderer/index.html')).href
  expect(isTrustedRendererUrl(`${entry}?theme=dark#/home`, directory)).toBe(true)
  expect(isTrustedRendererUrl(pathToFileURL(join(directory, '../renderer/workbench.html')).href, directory)).toBe(true)
  expect(isTrustedRendererUrl('file:///C:/Users/user/Downloads/index.html', directory)).toBe(false)
  expect(isTrustedRendererUrl('https://example.com/index.html', directory)).toBe(false)
  expect(isTrustedRendererUrl('not a URL', directory)).toBe(false)
  expect(isTrustedRendererUrl('http://localhost:5173/workbench.html?theme=dark', directory, 'http://localhost:5173/')).toBe(true)
  expect(isTrustedRendererUrl('http://localhost:5173/?theme=dark', directory, 'http://localhost:5173/')).toBe(true)
  expect(isTrustedRendererUrl('http://localhost:5173/other.html', directory, 'http://localhost:5173/')).toBe(false)
  expect(isTrustedRendererUrl('http://localhost:5174/', directory, 'http://localhost:5173/')).toBe(false)
})

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
