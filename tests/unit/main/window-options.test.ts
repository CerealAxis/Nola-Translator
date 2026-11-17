import { describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'

import { createMainWindowOptions, isAllowedRendererPermission, isTrustedRendererUrl, resolvePreloadPath, sendToRenderer } from '../../../src/main/window-options'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

describe('renderer message delivery', () => {
  function target() {
    const frame = { detached: false, isDestroyed: vi.fn(() => false), send: vi.fn() }
    const contents = { isDestroyed: vi.fn(() => false), isCrashed: vi.fn(() => false), mainFrame: frame }
    const window = { isDestroyed: vi.fn(() => false), webContents: contents }
    return { frame, contents, window: window as unknown as BrowserWindow }
  }
  it('sends to the current live frame', () => {
    const { window, frame } = target()
    expect(sendToRenderer(window, 'engine:event', { type: 'ready' })).toBe(true)
    expect(frame.send).toHaveBeenCalledWith('engine:event', { type: 'ready' })
  })
  it.each(['window', 'contents', 'crashed', 'frame', 'detached'])('skips a %s that cannot receive messages', state => {
    const { window, contents, frame } = target()
    if (state === 'window') vi.spyOn(window, 'isDestroyed').mockReturnValue(true)
    if (state === 'contents') contents.isDestroyed.mockReturnValue(true)
    if (state === 'crashed') contents.isCrashed.mockReturnValue(true)
    if (state === 'frame') frame.isDestroyed.mockReturnValue(true)
    if (state === 'detached') frame.detached = true
    expect(sendToRenderer(window, 'engine:event', {})).toBe(false)
    expect(frame.send).not.toHaveBeenCalled()
  })
  it('handles a frame disposed during delivery while preserving unrelated errors', () => {
    const { window, frame } = target()
    frame.send.mockImplementationOnce(() => { throw new Error('Render frame was disposed before WebFrameMain could be accessed') })
    expect(sendToRenderer(window, 'engine:event', {})).toBe(false)
    frame.send.mockImplementationOnce(() => { throw new Error('An object could not be cloned') })
    expect(() => sendToRenderer(window, 'engine:event', {})).toThrow('could not be cloned')
  })
})

it('allows trusted microphone capture, speaker selection and sanitized clipboard writes', () => {
  expect(isAllowedRendererPermission('media', true, ['audio'])).toBe(true)
  expect(isAllowedRendererPermission('clipboard-sanitized-write', true)).toBe(true)
  expect(isAllowedRendererPermission('speaker-selection', true)).toBe(true)
  for (const [permission, types] of [
    ['media', []], ['media', ['video']], ['media', ['audio', 'video']], ['media', ['unknown']],
    ['clipboard-read', []], ['geolocation', []], ['notifications', []],
  ] as const) expect(isAllowedRendererPermission(permission, true, types)).toBe(false)
  expect(isAllowedRendererPermission('media', false, ['audio'])).toBe(false)
  expect(isAllowedRendererPermission('clipboard-sanitized-write', false)).toBe(false)
  expect(isAllowedRendererPermission('speaker-selection', false)).toBe(false)
})

it('trusts only application entry documents, including queries and hash routes', () => {
  const directory = 'C:\\app\\out\\main'
  const entry = pathToFileURL(join(directory, '../renderer/index.html')).href
  expect(isTrustedRendererUrl(`${entry}?theme=dark#/home`, directory)).toBe(true)
  expect(isTrustedRendererUrl(pathToFileURL(join(directory, '../renderer/workbench.html')).href, directory)).toBe(false)
  expect(isTrustedRendererUrl(pathToFileURL(join(directory, '../renderer/screen.html')).href + '?role=capture', directory)).toBe(true)
  expect(isTrustedRendererUrl('file:///C:/Users/user/Downloads/index.html', directory)).toBe(false)
  expect(isTrustedRendererUrl('https://example.com/index.html', directory)).toBe(false)
  expect(isTrustedRendererUrl('not a URL', directory)).toBe(false)
  expect(isTrustedRendererUrl('http://localhost:5173/workbench.html?theme=dark', directory, 'http://localhost:5173/')).toBe(false)
  expect(isTrustedRendererUrl('http://localhost:5173/screen.html?role=editor', directory, 'http://localhost:5173/')).toBe(true)
  expect(isTrustedRendererUrl('http://localhost:5173/?theme=dark', directory, 'http://localhost:5173/')).toBe(true)
  expect(isTrustedRendererUrl('http://localhost:5173/comic-editor.html?projectId=123', directory, 'http://localhost:5173/')).toBe(false)
  expect(isTrustedRendererUrl(pathToFileURL(join(directory, '../renderer/comic-editor.html')).href, directory)).toBe(false)
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


