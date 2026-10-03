import type { BrowserWindowConstructorOptions, Rectangle } from 'electron'

import { DEFAULT_SETTINGS, type OverlaySettings } from '../shared/settings'

export type OverlayMode = 'free' | 'top' | 'bottom'

type OverlaySize = { width: number; height: number; x?: number; y?: number }

/** Shared with `applyOverlay`, which must not invent a second, different minimum width. */
export const OVERLAY_MIN_WIDTH = 420

/**
 * `.nola-caption-stage` vertical padding, 22px top + 38px bottom.
 *
 * These two values are copied from `.nola-caption-stage` in
 * `src/renderer/theme/caption-card.css` (`padding: 22px 22px 38px`). **Changing the CSS means
 * coming back here** — the main process cannot read a stylesheet, so this is a deliberate
 * duplicate of the layout constants rather than a value that can be derived.
 */
const STAGE_VERTICAL_PADDING = 22 + 38

/**
 * `.nola-caption-stage` row gap, copied from the same rule (`gap: 6px`). Same caveat as above:
 * keep in sync with `caption-card.css` by hand.
 */
const STAGE_TRACK_GAP = 6

/**
 * Height reserved on top of the formula, in DIP, because `minHeight` constrains the **window
 * rectangle** while `allocateCaptionLines` is fed the renderer's **content box** — the two are not
 * the same number, and the gap between them is not something this process can read.
 *
 * Measured on this machine (Windows 11, Electron 43.1.1, `scaleFactor` 1.5) by driving a real
 * `BrowserWindow` built from `createOverlayWindowOptions` and comparing `getBounds().height`
 * against `window.innerHeight`:
 *
 *   minHeight 60/83/111/140/200/300/500  →  bounds 61/85/113/141/201/301/501
 *                                           innerHeight identical in every case → 0 DIP
 *   on the real renderer page at minHeight 111 → bounds 112, innerHeight 112 → 0 DIP
 *
 * So on *this* build the invisible `thickFrame` resize border is drawn **inside** the client area
 * and costs the page nothing. That is a property of the current Chromium/Windows combination, not
 * a guarantee from Electron, and two other losses are real regardless:
 *
 *   1. `.nola-caption-stage`'s `clientHeight` is an integer, while `required` below is fractional,
 *      so the content box can land a whole pixel under the number we asked for.
 *   2. Windows rounds the minimum it hands back (measured: minHeight 111 became a 112 DIP window,
 *      and 258 stayed 258) — the bonus is not something to plan on.
 *
 * Without this slack the formula is *exactly* tight, which is fragile: of the 17995 legal
 * (fontSize, translationFontSize, lineHeight) combinations only 339 survive losing a single DIP,
 * and the factory default 17/16 pair survives exactly one. Two DIPs covers a one-pixel platform
 * inset plus the integer truncation, and costs 2px of an ~113px window.
 */
const OVERLAY_MIN_HEIGHT_SLACK = 2

/**
 * `.nola-overlay-window` 的四周内缩，6px，抄自 `src/renderer/theme/caption-card.css`
 * 的 `padding: 6px`。**同上面那条约定：主进程读不到样式表，只能手工同步。**
 *
 * 为什么最小高度要为它买单：卡片四周各让开 6px，卡片高度就是 `窗口高 - 12`，
 * 而 `minHeight` 卡的是**窗口矩形**。不算这 12 DIP，`minHeight` 会比"够放一行"
 * 少 12 DIP，最小窗高下最后一条轨道的行预算被这条内缩吃掉。
 *
 * 6px 这个数不是为了好看定的，是实测下限之上留了余量：1.5× 缩放下按 1 物理像素
 * 取样，`内缩 6px + box-shadow: 0 1px 3px` 时四角圆角之外的三角区 608 px 与桌面
 * 背景**逐像素一致**（最大偏差 1/255）；内缩 0 时同一测量有 45~62 px 不一致，
 * 残留的正是卡片自己压在窗口边界上的那条 1px 圆角抗锯齿边。
 */
const OVERLAY_CARD_INSET = 6

/**
 * Smallest window height that still shows one line in every visible caption track.
 *
 * `allocateCaptionLines` (renderer) hands every visible track the *same* share of the stage, so a
 * track gets its first line only when that share covers its own line height. With `n` visible
 * tracks the share is `(content - gap * (n - 1)) / n`, which means:
 *
 *   content - gap * (n - 1) >= n * max(line heights)   →   n * max + gap * (n - 1) + padding
 *
 * Concretely, for the four `showSource` / `showTranslation` combinations (with the slack above
 * and the card inset below):
 *   both on   → `2 * max(src, tr) + 6 + 60 + 12 + 2`  (default: 2 * 22.1 + 80 = 125)
 *   source on → `1 * src + 0 + 60 + 12 + 2`          (default: 22.1 + 74 = 97; no gap, the lone
 *                                                      track takes the whole stage)
 *   tr.   on  → `1 * tr + 0 + 60 + 12 + 2`           (default: 21.6 + 74 = 96)
 *   neither  → `0 + 0 + 60 + 12 + 2` = 74            (nothing to reserve for; padding alone
 *                                                      still holds the card)
 *
 * The `+ 12` is `OVERLAY_CARD_INSET * 2`: the card is inset 6px on every side so its rounded
 * corners stop short of the window border (see the constant). Before that inset existed these
 * were 113 / 85 / 84 / 62 — the window, not the card, is what grew, so each track still gets
 * its first line at the new minimum.
 *
 * Tracks whose line height is not a positive finite number are dropped before the max, because
 * `allocateCaptionLines` can never hand those a line either. `settings.load()` spreads a
 * hand-edited `settings.json` without numeric validation, so a missing/NaN/negative font size
 * reaches the main process; without that filter it would propagate a `NaN` minimum height into
 * `setMinimumSize`.
 *
 * `workAreaHeight` clamps the result: a minimum taller than the display's work area would make the
 * window impossible to show, so on a short screen we would rather lose a line than the window.
 */
export function overlayMinimumHeight(overlay: OverlaySettings, workAreaHeight?: number): number {
  const lineHeights = [
    overlay.showSource ? overlay.fontSize * overlay.lineHeight : 0,
    overlay.showTranslation ? overlay.translationFontSize * overlay.translationLineHeight : 0,
  ].filter((lineHeight) => Number.isFinite(lineHeight) && lineHeight > 0)
  const visibleCount = lineHeights.length
  const tallest = visibleCount === 0 ? 0 : Math.max(...lineHeights)
  const required = tallest * visibleCount
    + STAGE_TRACK_GAP * Math.max(0, visibleCount - 1)
    + STAGE_VERTICAL_PADDING
    + OVERLAY_CARD_INSET * 2
    + OVERLAY_MIN_HEIGHT_SLACK
  const minimum = Math.ceil(required)
  return typeof workAreaHeight === 'number' && workAreaHeight > 0 ? Math.min(minimum, workAreaHeight) : minimum
}

export function getOverlayInteractionPolicy(locked: boolean): {
  focusable: boolean
  ignoreMouseEvents: boolean
  movable: boolean
  resizable: boolean
} {
  return {
    focusable: true,
    ignoreMouseEvents: false,
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

export function createOverlayWindowOptions(
  preload: string,
  workAreaWidth?: number,
  overlay: OverlaySettings = DEFAULT_SETTINGS.overlay,
  workAreaHeight?: number,
): BrowserWindowConstructorOptions {
  // The reference console is a compact bar near the lower center of the display, tall enough for
  // three source lines above three translation lines once the reserved control row is deducted.
  const width = workAreaWidth
    ? Math.min(940, Math.max(560, Math.round(workAreaWidth * 0.46)))
    : 820
  return {
    width,
    height: 218,
    minWidth: OVERLAY_MIN_WIDTH,
    // Was a flat 52, which let the user drag the bar into the range where the renderer gives both
    // tracks zero lines and the overlay shows nothing at all. Derived from the current font sizes
    // instead, so the bar always stays tall enough for one line per visible track.
    minHeight: overlayMinimumHeight(overlay, workAreaHeight),
    resizable: true,
    movable: true,
    /*
     * **留着 `thickFrame: true`，别为了"四角干净"关掉它。**
     *
     * 曾经怀疑四角外那条矩形是 Windows 的不可见 resize frame 被画了出来。逐像素量过，
     * 不是：`thickFrame: false` 与 `true` 在同一测量下四角数字**完全一样**（内缩 0 时都是
     * 607/608 px 被污染），改成 false 一点用都没有，却把拖边缘缩放赔了进去。
     *
     * 这条 resize frame 在未锁定时是**唯一**的缩放途径：`overlay.resize` 那条通道
     * (`src/main/ipc.ts`) 在界面上已经没有人调了（见 `OverlayRoot.tsx` 里"原先这里是收起"
     * 那段注释），设置里也没有字幕窗的宽高项。所以关掉它 = 用户再也改不了浮窗大小。
     *
     * 真正的原因是页面自己在画一个不透明的方块，见 `caption-card.css` 的
     * `html.is-overlay body`。
     */
    thickFrame: true,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    // Window-level Acrylic is unusable here: even at 0% content background Windows still
    // renders the whole window as a frosted block, so translucency belongs to the caption card.
    backgroundMaterial: 'none',
    hasShadow: false,
    alwaysOnTop: true,
    // Must stay false: the caption window offers a real "minimize" action, and a skipped taskbar
    // would leave a minimized window with no way back — a ghost that still owns the microphone.
    skipTaskbar: false,
    // applyOverlay() upgrades this to the interaction policy at runtime; it only keeps the window
    // from stealing focus during the roughly one frame between construction and that first call.
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
