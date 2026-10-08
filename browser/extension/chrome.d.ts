interface ChromeEvent<T extends (...args: never[]) => void> { addListener(listener: T): void; removeListener(listener: T): void }
interface ChromePort {
  name: string
  sender?: { tab?: { id?: number; url?: string }; frameId?: number; url?: string }
  onMessage: ChromeEvent<(message: unknown) => void>
  onDisconnect: ChromeEvent<(port: ChromePort) => void>
  postMessage(message: unknown): void
  disconnect(): void
}
interface ChromeScript { id: string; matches: string[]; js: string[]; runAt: 'document_start' | 'document_idle'; world?: 'MAIN' | 'ISOLATED'; persistAcrossSessions?: boolean }
declare const chrome: {
  runtime: { connect(options: { name: string }): ChromePort; connectNative(name: string): ChromePort; getURL(path: string): string; lastError?: { message?: string }; onConnect: ChromeEvent<(port: ChromePort) => void>; onInstalled: ChromeEvent<() => void>; onStartup: ChromeEvent<() => void>; onMessage: ChromeEvent<(message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => void> }
  permissions: { request(permissions: { origins: string[] }): Promise<boolean>; getAll(): Promise<{ origins?: string[] }>; contains(permissions: { origins: string[] }): Promise<boolean> }
  scripting: { getRegisteredContentScripts(): Promise<ChromeScript[]>; registerContentScripts(scripts: ChromeScript[]): Promise<void>; updateContentScripts(scripts: ChromeScript[]): Promise<void>; executeScript(options: { target: { tabId: number; allFrames?: boolean }; files: string[]; world?: 'MAIN' | 'ISOLATED' }): Promise<unknown> }
  tabs: { query(query: { active: boolean; currentWindow: boolean }): Promise<{ id?: number; url?: string }[]> }
  storage: { local: { get(keys: string[]): Promise<Record<string, unknown>>; set(values: Record<string, unknown>): Promise<void> } }
}
interface MediaTrackSettings { displaySurface?: string }
interface MediaStreamTrack { getCaptureHandle?: () => { handle: string; origin?: string } | null }
interface MediaDevices { setCaptureHandleConfig?: (config: { handle: string; exposeOrigin: boolean; permittedOrigins: string[] }) => void }
interface AudioWorkletProcessor { readonly port: MessagePort; process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean }
declare const AudioWorkletProcessor: { new (): AudioWorkletProcessor }
declare const sampleRate: number
declare function registerProcessor(name: string, processor: { new (): AudioWorkletProcessor }): void
declare module '*.css?inline' { const value: string; export default value }
