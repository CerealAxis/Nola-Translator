import type { NolaTranslatorApi } from '../shared/bridge'

declare global {
  interface Window {
    nolaTranslator?: NolaTranslatorApi
  }
}

export {}
