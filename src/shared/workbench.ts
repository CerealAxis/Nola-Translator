export type WorkbenchSurface = 'chat'

export function workbenchSurface(surface: unknown): WorkbenchSurface | null {
  return surface === 'chat' ? 'chat' : null
}
