import type { BrowserWindowConstructorOptions, Rectangle } from 'electron'

export type OverlayMode = 'free' | 'top' | 'bottom'

type OverlaySize = { width: number; height: number; x?: number; y?: number }

export function getOverlayInteractionPolicy(locked: boolean): {
  focusable: boolean
  ignoreMouseEvents: boolean
  movable: boolean
  resizable: boolean
} {
  return {
    focusable: !locked,
    ignoreMouseEvents: locked,
    movable: !locked,
    resizable: !locked,
  }
}

export function computeOverlayBounds(
  mode: OverlayMode,
  workArea: Rectangle,
  current: OverlaySize
): Rectangle {
  const width = Math.min(current.width, workArea.width)
  const height = Math.min(current.height, workArea.height)
  const centeredX = Math.round(workArea.x + (workArea.width - width) / 2)
  const margin = 24
  if (mode === 'top') {
    return { x: centeredX, y: workArea.y + margin, width, height }
  }
  if (mode === 'bottom') {
    return {
      x: centeredX,
      y: workArea.y + workArea.height - height - margin,
      width,
      height,
    }
  }
  const x = Math.max(workArea.x, Math.min(current.x ?? centeredX, workArea.x + workArea.width - width))
  const y = Math.max(workArea.y, Math.min(current.y ?? workArea.y + margin, workArea.y + workArea.height - height))
  return { x, y, width, height }
}

export function createOverlayWindowOptions(preload: string): BrowserWindowConstructorOptions {
  return {
    width: 900,
    height: 180,
    minWidth: 420,
    minHeight: 100,
    resizable: true,
    movable: true,
    thickFrame: true,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    // 不能在窗口级使用 Acrylic：即使内容背景为 0%，Windows 仍会把整个
    // 窗口渲染成磨砂色块。半透明效果只由网页中的字幕卡片负责。
    backgroundMaterial: 'none',
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    show: false,
    webPreferences: {
      preload,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  }
}
