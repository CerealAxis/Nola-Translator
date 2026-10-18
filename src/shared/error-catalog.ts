/** Stable support codes are a user-facing contract; wire error names may change independently. */
export const SUPPORT_ERROR_CATALOG = {
  'ASR-001': { domain: 'ASR', messageKey: 'errors.cloudRecognitionCredentialMissing', retryable: false },
  // MiniMax separates a spent account from a rejected key, and the two need different user action.
  // https://platform.minimax.io/docs/api-reference/speech-to-text → 402 / 429.
  'ASR-002': { domain: 'ASR', messageKey: 'errors.cloudRecognitionInsufficientBalance', retryable: false },
  'ASR-003': { domain: 'ASR', messageKey: 'errors.cloudRecognitionRateLimited', retryable: true },
  'ASR-004': { domain: 'ASR', messageKey: 'errors.cloudRecognitionNetworkUnavailable', retryable: true },
  'ASR-005': { domain: 'ASR', messageKey: 'errors.cloudRecognitionTimeout', retryable: true },
  'ASR-006': { domain: 'ASR', messageKey: 'errors.cloudRecognitionInvalidResponse', retryable: false },
  'AUD-001': { domain: 'AUD', messageKey: 'errors.audioDeviceEnumerationFailed', retryable: true },
  'AUD-002': { domain: 'AUD', messageKey: 'errors.deviceNotFound', retryable: false },
  'AUD-003': { domain: 'AUD', messageKey: 'errors.deviceNotFound', retryable: false },
  'ENG-001': { domain: 'ENG', messageKey: 'errors.engineNotReady', retryable: true },
  'ENG-002': { domain: 'ENG', messageKey: 'errors.engineLost', retryable: false },
  'ENG-003': { domain: 'ENG', messageKey: 'errors.engineOperationFailed', retryable: true },
  'ENG-004': { domain: 'ENG', messageKey: 'errors.engineOperationFailed', retryable: true },
  'ERR-999': { domain: 'ERR', messageKey: 'errors.unknownFailure', retryable: true },
  'EXP-009': { domain: 'EXP', messageKey: 'errors.exportFailed', retryable: true },
  'MDL-003': { domain: 'MDL', messageKey: 'errors.modelMissing', retryable: false },
  'MDL-012': { domain: 'MDL', messageKey: 'errors.prewarm.modelUnavailable', retryable: false },
  'MDL-013': { domain: 'MDL', messageKey: 'errors.prewarm.resourceUnavailable', retryable: true },
  'MDL-014': { domain: 'MDL', messageKey: 'errors.prewarm.invalidConfiguration', retryable: false },
  'MDL-015': { domain: 'MDL', messageKey: 'errors.prewarm.resourceBusy', retryable: true },
  'MDL-016': { domain: 'MDL', messageKey: 'errors.prewarm.sessionAlreadyRunning', retryable: true },
  'MDL-017': { domain: 'MDL', messageKey: 'errors.modelLoadFailed', retryable: true },
  'MDL-018': { domain: 'MDL', messageKey: 'errors.modelMissing', retryable: false },
  'MDL-019': { domain: 'MDL', messageKey: 'errors.modelLoadFailed', retryable: false },
  'MDL-020': { domain: 'MDL', messageKey: 'errors.modelLoadFailed', retryable: false },
  'MT-007': { domain: 'MT', messageKey: 'errors.translateFailed', retryable: true },
  'MT-008': { domain: 'MT', messageKey: 'shellUi.error.URLError', retryable: true },
  'MT-009': { domain: 'MT', messageKey: 'shellUi.error.HTTPError', retryable: true },
  'MT-010': { domain: 'MT', messageKey: 'shellUi.error.translationRateLimited', retryable: true },
  'MT-011': { domain: 'MT', messageKey: 'shellUi.error.translationTimeout', retryable: true },
  'MT-012': { domain: 'MT', messageKey: 'shellUi.error.RuntimeError', retryable: true },
  'MT-013': { domain: 'MT', messageKey: 'shellUi.error.ValueError', retryable: false },
  'MT-014': { domain: 'MT', messageKey: 'errors.translateFailed', retryable: true },
  'MT-015': { domain: 'MT', messageKey: 'errors.translateFailed', retryable: true },
  'MT-016': { domain: 'MT', messageKey: 'errors.translateFailed', retryable: false },
  'MT-017': { domain: 'MT', messageKey: 'errors.translateFailed', retryable: false },
  'NET-006': { domain: 'NET', messageKey: 'errors.downloadFailed', retryable: true },
  'NET-007': { domain: 'NET', messageKey: 'errors.searchFailed', retryable: true },
  'RNT-001': { domain: 'RNT', messageKey: 'errors.torchRuntimeUnavailable', retryable: true },
  'RNT-002': { domain: 'RNT', messageKey: 'errors.llamaRuntimeUnavailable', retryable: true },
  'SES-004': { domain: 'SES', messageKey: 'errors.startFailed', retryable: true },
  'SES-005': { domain: 'SES', messageKey: 'errors.engineOperationFailed', retryable: false },
  'SES-006': { domain: 'SES', messageKey: 'errors.engineOperationFailed', retryable: true },
  'SES-007': { domain: 'SES', messageKey: 'errors.engineOperationFailed', retryable: false },
  'SES-008': { domain: 'SES', messageKey: 'errors.serviceConflict', retryable: true },
  'STO-008': { domain: 'STO', messageKey: 'errors.storageChanged', retryable: false },
  'STO-018': { domain: 'STO', messageKey: 'errors.settingsWriteDenied', retryable: false },
  'STO-019': { domain: 'STO', messageKey: 'errors.settingsFileLocked', retryable: true },
  'STO-020': { domain: 'STO', messageKey: 'errors.settingsDiskFull', retryable: false },
  'STO-021': { domain: 'STO', messageKey: 'errors.settingsSaveFailed', retryable: true },
  'UIP-010': { domain: 'UIP', messageKey: 'errors.pageCrashed', retryable: true },
  'UIP-011': { domain: 'UIP', messageKey: 'errors.engineNotConnected', retryable: true },
  'UIP-017': { domain: 'UIP', messageKey: 'videoCaptions.errorOpeningBrowser', retryable: true },
  'UIP-022': { domain: 'UIP', messageKey: 'errors.captionServiceToggleFailed', retryable: true },
  'UIP-023': { domain: 'UIP', messageKey: 'errors.captionServiceStopFailed', retryable: true },
} as const

export type SupportErrorCode = keyof typeof SUPPORT_ERROR_CATALOG
export type SupportErrorOperation = { commandType?: string; action?: string }
export const SUPPORT_ERROR_CODES = Object.keys(SUPPORT_ERROR_CATALOG) as [SupportErrorCode, ...SupportErrorCode[]]

const SUPPORT_ERROR_MESSAGE_ALIASES = {
  'preflight.deviceCheckBlocked': 'ENG-001',
  'shellUi.error.translationUnavailable': 'MT-007',
  'shellUi.error.TimeoutError': 'MT-011',
  'shellUi.error.ConnectionError': 'MT-008',
  'shellUi.error.resourceUnavailable': 'MDL-013',
  'shellUi.error.llamaServerUnavailable': 'MDL-012',
  'shellUi.error.unsupportedLanguagePair': 'MDL-014',
  'browser.sessionNotRunning': 'SES-004',
  'browser.audioDeviceUnavailable': 'AUD-002',
  'browser.invalidConfiguration': 'MDL-014',
  'browser.modelUnavailable': 'MDL-012',
  'browser.resourceUnavailable': 'MDL-013',
  'browser.resourceNotFound': 'MDL-013',
  'browser.resourceInUse': 'MDL-015',
  'browser.resourceBusy': 'MDL-015',
  'browser.networkUnavailable': 'MT-008',
  'browser.integrityCheckFailed': 'MDL-013',
  'browser.installFailed': 'MDL-013',
  'browser.internalError': 'ENG-003',
  'browser.unknownError': 'ERR-999',
} as const satisfies Readonly<Record<string, SupportErrorCode>>

/** Shared copy can represent several causes, so choose its displayed code explicitly. */
const SUPPORT_ERROR_MESSAGE_CANONICAL_CODES = {
  'errors.engineOperationFailed': 'ENG-003',
  'errors.modelMissing': 'MDL-003',
  'errors.modelLoadFailed': 'MDL-017',
  'errors.deviceNotFound': 'AUD-002',
  'errors.translateFailed': 'MT-007',
} as const satisfies Readonly<Record<string, SupportErrorCode>>

/** Localized messages use this map so the same code is rendered in every locale. */
const supportErrorMessageCodes = Object.fromEntries(
  Object.entries(SUPPORT_ERROR_CATALOG).filter(([, entry], _index, entries) =>
    entries.filter(([, candidate]) => candidate.messageKey === entry.messageKey).length === 1
  ).map(([code, entry]) => [entry.messageKey, code])
) as Readonly<Record<string, SupportErrorCode>>

export const SUPPORT_ERROR_CODE_BY_MESSAGE: Readonly<Record<string, SupportErrorCode>> = {
  ...supportErrorMessageCodes,
  ...SUPPORT_ERROR_MESSAGE_CANONICAL_CODES,
  ...SUPPORT_ERROR_MESSAGE_ALIASES,
}

const CAUSE_CODES: Readonly<Record<string, SupportErrorCode>> = {
  CLOUDRECOGNITIONCREDENTIALMISSING: 'ASR-001',
  CLOUDRECOGNITIONINSUFFICIENTBALANCE: 'ASR-002',
  INSUFFICIENTBALANCEERROR: 'ASR-002',
  CLOUDRECOGNITIONRATELIMITED: 'ASR-003',
  RECOGNITIONNETWORKUNAVAILABLE: 'ASR-004',
  RECOGNITIONTIMEOUT: 'ASR-005',
  RECOGNITIONINVALIDRESPONSE: 'ASR-006',
  AUDIODEVICEENUMERATIONFAILED: 'AUD-001',
  AUDIODEVICEUNAVAILABLE: 'AUD-002',
  AUDIODEVICEDISCONNECTED: 'AUD-003',
  DEVICENOTFOUND: 'AUD-002',
  SESSIONINVALIDSTREAM: 'SES-005',
  SESSIONSTALEEPOCH: 'SES-006',
  SESSIONAUDIOOUTOFORDER: 'SES-007',
  ENGINETRANSPORTUNAVAILABLE: 'ENG-004',
  ENGINENOTREADY: 'ENG-001',
  ENGINENOTRUNNING: 'ENG-001',
  ENGINELOST: 'ENG-002',
  INTERNALERROR: 'ENG-003',
  PROTOCOLVALIDATIONFAILED: 'ENG-003',
  MODELUNAVAILABLE: 'MDL-003',
  MODELLOADFAILED: 'MDL-017',
  MODELDEPENDENCYMISSING: 'MDL-018',
  MODELWEIGHTSINVALID: 'MDL-019',
  MODELOUTOFMEMORY: 'MDL-020',
  MODELMISSING: 'MDL-003',
  RESOURCEUNFOUND: 'MDL-003',
  RESOURCEUNAVAILABLE: 'MDL-013',
  RESOURCEVERIFICATIONFAILED: 'NET-006',
  RESOURCEREMOVEFAILED: 'NET-006',
  RESOURCEDISKSPACEINSUFFICIENT: 'STO-020',
  INVALIDCONFIGURATION: 'MDL-014',
  RESOURCEBUSY: 'MDL-015',
  SESSIONALREADYRUNNING: 'SES-008',
  TRANSLATIONUNAVAILABLE: 'MT-007',
  TRANSLATIONPROVIDERUNAVAILABLE: 'MT-014',
  TRANSLATIONNETWORKUNAVAILABLE: 'MT-015',
  TRANSLATIONINVALIDRESPONSE: 'MT-016',
  TRANSLATIONUNSUPPORTEDLANGUAGEPAIR: 'MT-017',
  TRANSLATIONTIMEOUT: 'MT-011',
  TRANSLATIONRATELIMITED: 'MT-010',
  NETWORKUNAVAILABLE: 'MT-008',
  URLERROR: 'MT-008',
  HTTPERROR: 'MT-009',
  RUNTIMETORCH: 'RNT-001',
  RUNTIMELLAMA: 'RNT-002',
  SESSIONERROR: 'SES-004',
}

/** Normalize internal error spellings and keep unknown causes searchable as ERR-999. */
export function supportErrorCodeForCause(cause: string | null | undefined, operation: SupportErrorOperation = {}): SupportErrorCode {
  if (!cause) return 'ERR-999'
  const normalized = cause.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (operation.commandType === 'searchHubModels') return 'NET-007'
  if (operation.commandType === 'installHubRepo' || (operation.commandType === 'manageResource' && operation.action === 'install')) return 'NET-006'
  if (operation.commandType === 'listDevices' && normalized === 'INTERNALERROR') return 'AUD-001'
  return CAUSE_CODES[normalized] ?? 'ERR-999'
}

export function supportErrorCodeForMessage(messageKey: string): SupportErrorCode | undefined {
  return SUPPORT_ERROR_CODE_BY_MESSAGE[messageKey]
}
