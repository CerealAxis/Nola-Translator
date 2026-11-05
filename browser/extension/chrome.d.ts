interface ChromeEvent<T extends (...args: never[]) => void> { addListener(listener: T): void; removeListener(listener: T): void }
interface ChromePort {
  name: string
  sender?: { tab?: { id?: number; url?: string }; frameId?: number; url?: string }
  onMessage: ChromeEvent<(message: unknown) => void>
  onDisconnect: ChromeEvent<(port: ChromePort) => void>
  postMessage(message: unknown): void
  disconnect(): void
}
interface ChromeSender { id?: string; tab?: { id?: number; url?: string }; frameId?: number; url?: string }
interface ChromeScript { id: string; matches: string[]; js: string[]; runAt: 'document_start' | 'document_idle'; world?: 'MAIN' | 'ISOLATED'; persistAcrossSessions?: boolean }
declare const chrome: {
  offscreen?: { createDocument(options: { url: string; reasons: string[]; justification: string }): Promise<void>; closeDocument(): Promise<void> }
  contextMenus: { removeAll(): Promise<void>; create(options: { id: string; title: string; contexts: string[] }): void; onClicked: ChromeEvent<(info: { menuItemId: string | number; selectionText?: string }, tab?: { id?: number }) => void> }
  commands: { onCommand: ChromeEvent<(command: string) => void> }
  sidePanel?: { open(options: { tabId: number }): Promise<void> }
  sidebarAction?: { open(): Promise<void> }
  runtime: { id: string; getContexts?(filter: { contextTypes: string[]; documentUrls?: string[] }): Promise<Array<{ contextType: string; documentUrl?: string }>>; getManifest(): { version: string }; connect(options: { name: string }): ChromePort; connectNative(name: string): ChromePort; getURL(path: string): string; openOptionsPage(): Promise<void>; sendMessage(message: unknown): Promise<unknown>; lastError?: { message?: string }; onConnect: ChromeEvent<(port: ChromePort) => void>; onInstalled: ChromeEvent<() => void>; onStartup: ChromeEvent<() => void>; onMessage: ChromeEvent<(message: unknown, sender: ChromeSender, sendResponse: (response: unknown) => void) => void> }
  permissions: { request(permissions: { origins: string[] }): Promise<boolean>; getAll(): Promise<{ origins?: string[] }>; contains(permissions: { origins: string[] }): Promise<boolean>; onRemoved: ChromeEvent<() => void> }
  scripting: { getRegisteredContentScripts(): Promise<ChromeScript[]>; registerContentScripts(scripts: ChromeScript[]): Promise<void>; unregisterContentScripts(options: { ids: string[] }): Promise<void>; updateContentScripts(scripts: ChromeScript[]): Promise<void>; executeScript(options: { target: { tabId: number; allFrames?: boolean }; files: string[]; world?: 'MAIN' | 'ISOLATED' }): Promise<unknown> }
  tabs: { onActivated: ChromeEvent<(info: { tabId: number; windowId: number }) => void>; onUpdated: ChromeEvent<(tabId: number, changeInfo: { status?: string; url?: string }, tab: { id?: number; url?: string }) => void>; query(query: { active?: boolean; currentWindow?: boolean }): Promise<{ id?: number; url?: string }[]>; sendMessage(tabId: number, message: unknown): Promise<unknown> }
  tabCapture?: { getMediaStreamId(options: { targetTabId: number; consumerTabId?: number }): Promise<string> }
  storage: { local: { get(keys: string[]): Promise<Record<string, unknown>>; set(values: Record<string, unknown>): Promise<void> }; onChanged: ChromeEvent<(changes: Record<string, { newValue?: unknown }>, area: string) => void> }
}
interface MediaTrackSettings { displaySurface?: string }
interface MediaStreamTrack { getCaptureHandle?: () => { handle: string; origin?: string } | null }
interface MediaDevices { setCaptureHandleConfig?: (config: { handle: string; exposeOrigin: boolean; permittedOrigins: string[] }) => void }
interface AudioWorkletProcessor { readonly port: MessagePort; process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean }
declare const AudioWorkletProcessor: { new (): AudioWorkletProcessor }
declare const sampleRate: number
declare function registerProcessor(name: string, processor: { new (): AudioWorkletProcessor }): void
declare module '*.css?inline' { const value: string; export default value }
