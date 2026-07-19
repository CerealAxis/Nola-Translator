import type { FluentCaptionsApi } from '../shared/bridge'

declare global {
  interface Window {
    fluentCaptions?: FluentCaptionsApi
  }
}

export {}
