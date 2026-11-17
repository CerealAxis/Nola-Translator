import type { ComicPrototypeText } from './comic-prototype-copy'

const errorLabels: Record<string, ComicPrototypeText> = {
  modelUnavailable: 'errorModelUnavailable',
  modelConfigChanged: 'errorModelChanged',
  comicInvalidModelResult: 'errorModelResult',
  invalidTranslationResult: 'errorModelResult',
  comicVisualImageMissing: 'errorVisualImage',
  ocrUnavailable: 'errorOcrUnavailable',
  inpaintUnavailable: 'errorRepairUnavailable',
  interrupted: 'errorInterrupted',
  resourceBusy: 'errorResourceBusy',
  fontMissing: 'errorFontMissing',
}

export function comicErrorMessage(
  error: unknown,
  text: (key: ComicPrototypeText) => string,
) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : ''
  for (const [code, label] of Object.entries(errorLabels)) {
    if (new RegExp(`\\b${code}\\b`).test(message)) return text(label)
  }
  return message
}
