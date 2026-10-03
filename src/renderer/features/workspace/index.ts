export { WorkspacePage, errorCopyOf } from './WorkspacePage'
export { WorkspaceToolbar } from './WorkspaceToolbar'
export { SessionBar, formatElapsed, isoDuration } from './SessionBar'
export { SessionSetupDialog, audioSourceFrom } from './SessionSetupDialog'
export type { SetupDraft } from './SessionSetupDialog'
export { PreflightDialog } from './PreflightDialog'
/*
 * `OverlaySettingsDialog` 与它的 `FONT_SIZE_MIN` / `FONT_SIZE_MAX` 一起删掉了：
 * 前者是死代码（右上角那颗「字幕外观」现在是直接跳设置页的按钮，不再弹这个弹窗，
 * 弹窗里的字号滑杆在真实交互里也点不动），后两个常量只被它自己用。
 * 字号范围的真值在 `features/settings/tabs/AppearanceTab.tsx` 的滑杆上（10–48px）。
 */
