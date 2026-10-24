export type LocalCallDemoSurface = 'chat'

/** Packaged apps and file-based previews never expose the development windows. */
export function localCallDemoSurface(
  packaged: boolean,
  rendererUrl: string | undefined,
  surface: unknown,
): LocalCallDemoSurface | null {
  if (packaged || !rendererUrl || surface !== 'chat') return null
  try {
    const url = new URL(rendererUrl)
    return ['http:', 'https:'].includes(url.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      ? surface
      : null
  } catch {
    return null
  }
}
