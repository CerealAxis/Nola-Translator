import type { UiFont } from '../../shared/settings'

export async function loadInterfaceFont(font: UiFont): Promise<void> {
  if (font === 'system') return
  const declaration = `14px "${font}"`
  const faces = await document.fonts.load(declaration, 'Nola 中文 日本語 한국어')
  if (!faces.length || faces.some(face => face.status !== 'loaded') || !document.fonts.check(declaration)) {
    throw new Error(`Font unavailable: ${font}`)
  }
}
