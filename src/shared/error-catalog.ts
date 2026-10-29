/** Stable support codes are a user-facing contract; wire error names may change independently. */

/**
 * One registry, two indexes.
 *
 * Every entry names the copy that belongs to the code, the engine causes that resolve to it and
 * the extra message keys that show the same failure. The indexes below are derived from these
 * entries, so the code behind a message and the code behind a cause come out of the same lookup
 * and cannot drift apart.
 *
 * A message key belongs to exactly one code and a cause token belongs to exactly one code, which
 * is what lets a user-visible code be found from either side.
 */
interface SupportErrorEntry {
  readonly messageKey: string
  readonly retryable: boolean
  /** Engine causes that resolve to this code, in the spelling the engine uses. */
  readonly causes: readonly string[]
  /** Message keys that show the same failure under a different wording. */
  readonly aliases?: readonly string[]
  /**
   * The generic codes this one replaces, and the operations where the replacement applies. A cause
   * that already names a specific failure keeps its own code, so an operation never overrules a
   * cause that says what actually went wrong.
   */
  readonly refines?: { readonly from: readonly string[]; readonly operations: readonly string[] }
}

export const SUPPORT_ERROR_CATALOG = {
  'MDL-024': { messageKey: 'modelsPolicy.modelDisabled', retryable: false, causes: ['MODELDISABLED'] },
  'MDL-025': { messageKey: 'modelsPolicy.modelNotLoaded', retryable: false, causes: ['MODELNOTLOADED', 'MODELNOTFOUND'] },
  'ARG-001': { messageKey: 'errors.invalidArgument', retryable: false, causes: ['INVALID_ARGUMENT'] },
  'ARG-002': { messageKey: 'errors.meetingNameEmpty', retryable: false, causes: ['MEETING_NAME_EMPTY'] },
  'ARG-003': { messageKey: 'errors.meetingNotFound', retryable: false, causes: ['MEETING_NOT_FOUND'] },
  'ARG-004': { messageKey: 'errors.invalidCredential', retryable: false, causes: ['INVALID_CREDENTIAL'] },
  'ASR-001': { messageKey: 'errors.cloudRecognitionCredentialMissing', retryable: false, causes: ['CLOUDRECOGNITIONCREDENTIALMISSING'] },
  // MiniMax separates a spent account from a rejected key, and the two need different user action.
  // https://platform.minimax.io/docs/api-reference/speech-to-text → 402 / 429.
  'ASR-002': { messageKey: 'errors.cloudRecognitionInsufficientBalance', retryable: false, causes: ['CLOUDRECOGNITIONINSUFFICIENTBALANCE'] },
  'ASR-003': { messageKey: 'errors.cloudRecognitionRateLimited', retryable: true, causes: ['CLOUDRECOGNITIONRATELIMITED'] },
  'ASR-004': { messageKey: 'errors.cloudRecognitionNetworkUnavailable', retryable: true, causes: ['RECOGNITIONNETWORKUNAVAILABLE'] },
  'ASR-005': { messageKey: 'errors.cloudRecognitionTimeout', retryable: true, causes: ['RECOGNITIONTIMEOUT'] },
  'ASR-006': { messageKey: 'errors.cloudRecognitionInvalidResponse', retryable: false, causes: ['RECOGNITIONINVALIDRESPONSE'] },
  'ASR-007': { messageKey: 'errors.cloudRecognitionClosed', retryable: true, causes: ['RECOGNITIONCLOSED'] },
  'ASR-008': { messageKey: 'errors.cloudRecognitionBufferOverflow', retryable: true, causes: ['RECOGNITIONBUFFEROVERFLOW'] },
  'AUD-001': { messageKey: 'errors.audioDeviceEnumerationFailed', retryable: true, causes: ['AUDIODEVICEENUMERATIONFAILED'], refines: { from: ['ENG-003', 'ERR-999'], operations: ['listDevices', 'engine:list-devices'] } },
  'AUD-002': { messageKey: 'errors.deviceNotFound', retryable: false, causes: ['AUDIODEVICEUNAVAILABLE'] },
  'AUD-003': { messageKey: 'errors.audioDeviceDisconnected', retryable: false, causes: ['AUDIODEVICEDISCONNECTED'] },
  'AUD-004': { messageKey: 'errors.audioBufferOverflow', retryable: true, causes: ['AUDIOBUFFEROVERFLOW'] },
  'ENG-001': { messageKey: 'errors.engineNotReady', retryable: true, causes: ['ENGINENOTREADY'], aliases: ['preflight.deviceCheckBlocked'] },
  'ENG-002': { messageKey: 'errors.engineLost', retryable: false, causes: ['ENGINELOST'] },
  'ENG-003': { messageKey: 'errors.engineOperationFailed', retryable: true, causes: ['INTERNALERROR'] },
  'ENG-004': { messageKey: 'errors.engineTransportUnavailable', retryable: true, causes: ['ENGINETRANSPORTUNAVAILABLE'] },
  'ENG-005': { messageKey: 'errors.engineUnavailable', retryable: true, causes: ['ENGINE_UNAVAILABLE'] },
  'ENG-006': { messageKey: 'errors.engineProtocolMismatch', retryable: false, causes: ['UNSUPPORTEDPROTOCOL'] },
  'ENG-007': { messageKey: 'errors.engineProtocolInvalid', retryable: true, causes: ['INVALIDMESSAGE', 'LINE_TOO_LARGE', 'PROTOCOLVALIDATIONFAILED', 'ENGINEPROTOCOLERROR'] },
  'ERR-999': { messageKey: 'errors.unknownFailure', retryable: true, causes: [] },
  'EXP-009': { messageKey: 'errors.exportFailed', retryable: true, causes: [] },
  'MDL-003': { messageKey: 'errors.modelMissing', retryable: false, causes: ['MODELUNAVAILABLE', 'MODELMISSING'] },
  'MDL-012': { messageKey: 'errors.prewarm.modelUnavailable', retryable: false, causes: [], aliases: ['shellUi.error.llamaServerUnavailable'] },
  'MDL-013': { messageKey: 'errors.prewarm.resourceUnavailable', retryable: true, causes: ['RESOURCEUNAVAILABLE'], aliases: ['shellUi.error.resourceUnavailable'] },
  'MDL-014': { messageKey: 'errors.prewarm.invalidConfiguration', retryable: false, causes: ['INVALIDCONFIGURATION'], aliases: ['errors.unsupportedRecognitionLanguage', 'shellUi.error.unsupportedLanguagePair'] },
  'MDL-015': { messageKey: 'errors.prewarm.resourceBusy', retryable: true, causes: ['RESOURCEBUSY', 'RESOURCEINUSE'] },
  'MDL-017': { messageKey: 'errors.modelLoadFailed', retryable: true, causes: ['MODELLOADFAILED'] },
  'MDL-018': { messageKey: 'errors.modelDependencyMissing', retryable: false, causes: ['MODELDEPENDENCYMISSING'] },
  'MDL-019': { messageKey: 'errors.modelWeightsInvalid', retryable: false, causes: ['MODELWEIGHTSINVALID'] },
  'MDL-020': { messageKey: 'errors.modelOutOfMemory', retryable: false, causes: ['MODELOUTOFMEMORY'] },
  'MDL-021': { messageKey: 'errors.modelRemoveFailed', retryable: true, causes: ['RESOURCEREMOVEFAILED'] },
  'MDL-022': { messageKey: 'errors.modelInstallFailed', retryable: true, causes: ['INSTALLFAILED'] },
  'MDL-023': { messageKey: 'errors.resourceNotFound', retryable: false, causes: ['RESOURCENOTFOUND'] },
  'MT-007': { messageKey: 'errors.translateFailed', retryable: true, causes: ['TRANSLATIONUNAVAILABLE'], aliases: ['shellUi.error.translationUnavailable'] },
  'MT-008': { messageKey: 'shellUi.error.URLError', retryable: true, causes: ['URLERROR', 'CONNECTIONERROR'], aliases: ['shellUi.error.ConnectionError'] },
  'MT-009': { messageKey: 'shellUi.error.HTTPError', retryable: true, causes: ['HTTPERROR'] },
  'MT-010': { messageKey: 'shellUi.error.translationRateLimited', retryable: true, causes: ['TRANSLATIONRATELIMITED'] },
  'MT-011': { messageKey: 'shellUi.error.translationTimeout', retryable: true, causes: ['TRANSLATIONTIMEOUT', 'TIMEOUTERROR'], aliases: ['shellUi.error.TimeoutError'] },
  'MT-012': { messageKey: 'shellUi.error.RuntimeError', retryable: true, causes: [] },
  'MT-013': { messageKey: 'shellUi.error.ValueError', retryable: false, causes: [] },
  'MT-014': { messageKey: 'errors.translationProviderUnavailable', retryable: true, causes: ['TRANSLATIONPROVIDERUNAVAILABLE'] },
  'MT-015': { messageKey: 'errors.translationNetworkUnavailable', retryable: true, causes: ['TRANSLATIONNETWORKUNAVAILABLE'] },
  'MT-016': { messageKey: 'errors.translationInvalidResponse', retryable: false, causes: ['TRANSLATIONINVALIDRESPONSE'] },
  'MT-017': { messageKey: 'errors.translationUnsupportedLanguagePair', retryable: false, causes: ['TRANSLATIONUNSUPPORTEDLANGUAGEPAIR'] },
  'MT-018': { messageKey: 'errors.translationInputTooLong', retryable: false, causes: ['TRANSLATIONINPUTTOOLONG'] },
  'MT-019': { messageKey: 'errors.translationOutputTooLong', retryable: false, causes: ['TRANSLATIONOUTPUTTOOLONG'] },
  'MT-020': { messageKey: 'errors.translationSourceLanguageRequired', retryable: false, causes: ['TRANSLATIONSOURCELANGUAGERQUIRED'] },
  'MT-021': { messageKey: 'errors.translationRejected', retryable: true, causes: ['TRANSLATIONREJECTED'] },
  'MT-022': { messageKey: 'errors.translationCancelled', retryable: true, causes: ['TRANSLATIONCANCELLED'] },
  'NET-006': { messageKey: 'errors.downloadFailed', retryable: true, causes: ['RESOURCEVERIFICATIONFAILED'], refines: { from: ['ENG-003', 'ERR-999'], operations: ['installHubRepo', 'manageResource:install', 'hub:install'] } },
  'NET-007': { messageKey: 'errors.searchFailed', retryable: true, causes: [], refines: { from: ['ENG-003', 'ERR-999'], operations: ['searchHubModels', 'hub:search'] } },
  'NET-008': { messageKey: 'errors.requestTimeout', retryable: true, causes: ['REQUEST_TIMEOUT'] },
  'NET-009': { messageKey: 'errors.networkUnavailable', retryable: true, causes: ['NETWORKUNAVAILABLE', 'NETWORK_UNAVAILABLE'] },
  'NET-010': { messageKey: 'errors.modelIntegrityCheckFailed', retryable: false, causes: ['INTEGRITYCHECKFAILED'] },
  'RNT-001': { messageKey: 'errors.torchRuntimeUnavailable', retryable: true, causes: ['RUNTIMETORCH'] },
  'RNT-002': { messageKey: 'errors.llamaRuntimeUnavailable', retryable: true, causes: ['RUNTIMELLAMA'] },
  'RNT-003': { messageKey: 'errors.crispRuntimeUnavailable', retryable: true, causes: ['RUNTIMECRISP'] },
  'SES-004': { messageKey: 'errors.startFailed', retryable: true, causes: ['SESSIONERROR'] },
  'SES-005': { messageKey: 'errors.sessionStreamDesynced', retryable: false, causes: ['SESSIONINVALIDSTREAM', 'SESSIONSTALEEPOCH', 'SESSIONAUDIOOUTOFORDER'] },
  'SES-008': { messageKey: 'errors.serviceConflict', retryable: true, causes: ['SESSIONALREADYRUNNING'], aliases: ['errors.prewarm.sessionAlreadyRunning'] },
  'SES-009': { messageKey: 'errors.sessionNotRunning', retryable: false, causes: ['SESSIONNOTRUNNING'] },
  'STO-008': { messageKey: 'errors.storageChanged', retryable: false, causes: [] },
  'STO-018': { messageKey: 'errors.settingsWriteDenied', retryable: false, causes: [] },
  'STO-019': { messageKey: 'errors.settingsFileLocked', retryable: true, causes: [] },
  'STO-020': { messageKey: 'errors.settingsDiskFull', retryable: false, causes: [] },
  'STO-021': { messageKey: 'errors.settingsSaveFailed', retryable: true, causes: [] },
  'STO-022': { messageKey: 'errors.diskSpaceInsufficient', retryable: false, causes: ['RESOURCEDISKSPACEINSUFFICIENT'] },
  'STO-023': { messageKey: 'errors.fileNotFound', retryable: false, causes: ['FILE_NOT_FOUND'] },
  'STO-024': { messageKey: 'errors.fileNotAccessible', retryable: false, causes: ['FILE_NOT_ACCESSIBLE'] },
  'UIP-010': { messageKey: 'errors.pageCrashed', retryable: true, causes: [] },
  'UIP-011': { messageKey: 'errors.engineNotConnected', retryable: true, causes: [] },
  'UIP-017': { messageKey: 'videoCaptions.errorOpeningBrowser', retryable: true, causes: [] },
  'UIP-022': { messageKey: 'errors.captionServiceToggleFailed', retryable: true, causes: [] },
  'UIP-023': { messageKey: 'errors.captionServiceStopFailed', retryable: true, causes: [] },
  'UIP-024': { messageKey: 'errors.windowStateFailed', retryable: true, causes: [] },
  'UIP-025': { messageKey: 'errors.languageChangeFailed', retryable: true, causes: [] },
  'UIP-026': { messageKey: 'errors.meetingsLoadFailed', retryable: true, causes: [] },
  'UIP-027': { messageKey: 'errors.runtimeSettingsFailed', retryable: true, causes: [] },
  'UIP-028': { messageKey: 'errors.browserServiceUnavailable', retryable: true, causes: [] },
  'UIP-029': { messageKey: 'errors.copyDiagnosticsFailed', retryable: true, causes: [] },
  'UIP-030': { messageKey: 'errors.notesSaveFailed', retryable: true, causes: [] },
  'UIP-031': { messageKey: 'errors.modelsLoadFailed', retryable: true, causes: [] },
  'UIP-033': { messageKey: 'errors.settingsStoragePickFailed', retryable: true, causes: [] },
  'UIP-034': { messageKey: 'errors.settingsStorageRestartFailed', retryable: true, causes: [] },
  'UIP-035': { messageKey: 'errors.settingsCaptionStopFailed', retryable: true, causes: [] },
} as const

export type SupportErrorCode = keyof typeof SUPPORT_ERROR_CATALOG
export const SUPPORT_ERROR_CODES = Object.keys(SUPPORT_ERROR_CATALOG) as [SupportErrorCode, ...SupportErrorCode[]]

/**
 * Internal error spellings fold to one token: uppercase, separators removed. A cause therefore
 * reads the same whether the engine wrote `MODEL_MISSING`, `modelMissing` or `MODELMISSING`, and a
 * Chinese sentence contributes nothing because it holds no ASCII identifier.
 */
function normalizeCause(cause: string): string {
  return cause.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

const causeCodes = new Map<string, SupportErrorCode>()
const messageCodes = new Map<string, SupportErrorCode>()
const operationRefinements = new Map<string, Map<string, SupportErrorCode>>()

for (const code of SUPPORT_ERROR_CODES) {
  const entry: SupportErrorEntry = SUPPORT_ERROR_CATALOG[code]
  messageCodes.set(entry.messageKey, code)
  for (const alias of entry.aliases ?? []) messageCodes.set(alias, code)
  for (const cause of entry.causes) causeCodes.set(normalizeCause(cause), code)
  const refines = entry.refines
  if (!refines) continue
  for (const operation of refines.operations) {
    let byGeneric = operationRefinements.get(operation)
    if (!byGeneric) {
      byGeneric = new Map<string, SupportErrorCode>()
      operationRefinements.set(operation, byGeneric)
    }
    for (const generic of refines.from) byGeneric.set(generic, code)
  }
}

/** The operation a failure happened in, as the catalog names it. */
export interface SupportErrorOperation {
  commandType?: string
  action?: string
}

function operationToken(operation: SupportErrorOperation | undefined): string | undefined {
  if (!operation?.commandType) return undefined
  return operation.action ? `${operation.commandType}:${operation.action}` : operation.commandType
}

/**
 * The code a cause belongs to; a cause nobody claims stays the generic failure.
 *
 * The operation only refines a generic code. A cause that names its own failure keeps that code,
 * so the same protocol code reads differently in the operation that gives it a meaning and in the
 * one that does not.
 */
export function supportErrorCodeForCause(cause: string | null | undefined, operation?: SupportErrorOperation): SupportErrorCode {
  if (!cause) return 'ERR-999'
  const direct = causeCodes.get(normalizeCause(cause)) ?? 'ERR-999'
  const token = operationToken(operation)
  if (!token) return direct
  return operationRefinements.get(token)?.get(direct) ?? direct
}

/** The code a message key belongs to; a key outside the catalog has no code. */
export function supportErrorCodeForMessage(messageKey: string): SupportErrorCode | undefined {
  return messageCodes.get(messageKey)
}
