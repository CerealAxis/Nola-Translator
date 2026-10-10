/**
 * Fabricated data for the developer dialog gallery.
 *
 * Every id here is invented on purpose. Rename, export and model configuration all resolve their id
 * before writing anything, so a fabricated one lands on the dialog's own failure path instead of
 * touching a real meeting, file or model.
 */

import type { AppUpdateCheckResult, AudioDevice, ResourceRecord } from '@/bridge'
import type { MissingResource, SessionState } from '@/store'
import type { RuntimeIssue } from './RuntimeNotice'
import type { HubHit } from '../models/HubSearchTab'
import type { SetupDraft } from '../workspace/SessionSetupDialog'

/** The setup dialog prepends a synthetic `defaultOutput` option, so it is not in this list. */
export const DEMO_DEVICES: AudioDevice[] = [
  { deviceId: 'demo-speakers', name: 'Demo Speakers (Simulated Output)', kind: 'systemOutput', isDefault: true },
  { deviceId: 'demo-mic', name: 'Demo Microphone (Simulated Input)', kind: 'microphone', isDefault: false },
]

export const DEMO_DRAFT: SetupDraft = {
  title: '',
  audioSource: 'defaultOutput',
  sourceLanguage: 'zh',
  recognitionModelId: 'qwen3-asr-1.7b-hf',
  translate: true,
  targetLanguage: 'en',
  translationModelId: 'hy-mt2-1.8b-q3-k-m',
  keepAudio: true,
}

/** `qwen3-asr` maps to the PyTorch engine, which is what keeps the configuration dialog's save button usable. */
export const DEMO_ASR_RECORD: ResourceRecord = {
  resourceId: 'demo-recognition-model',
  kind: 'recognitionModel',
  provider: 'qwen3-asr',
  name: 'Demo ASR (Simulated Recognition Model)',
  description: 'Sample data for the developer tab',
  languages: ['zh', 'en', 'yue', 'ja', 'ko'],
  configuration: {
    slot: 'recognition',
    engine: 'pytorch',
    languages: ['zh', 'en', 'yue', 'ja', 'ko'],
    supportsAutoDetection: true,
    sourceLanguages: [],
    targetLanguages: [],
  },
  installed: true,
  installedBytes: 1_200_000_000,
  state: 'idle',
  cancellable: false,
}

export const DEMO_MT_RECORD: ResourceRecord = {
  resourceId: 'demo-translation-model',
  kind: 'translationModel',
  provider: 'hymt2',
  name: 'Demo MT (Simulated Translation Model)',
  description: 'Sample data for the developer tab',
  languages: ['zh', 'en', 'ja', 'ko'],
  configuration: {
    slot: 'translation',
    engine: 'llama',
    languages: [],
    supportsAutoDetection: false,
    sourceLanguages: ['zh', 'en', 'ja', 'ko'],
    targetLanguages: ['zh', 'en', 'ja', 'ko'],
    translationPairs: [{ source: 'zh', target: 'en' }],
  },
  installed: true,
  installedBytes: 1_000_000_000,
  state: 'idle',
  cancellable: false,
}

export const DEMO_MISSING: MissingResource = {
  resourceId: 'demo-missing-model',
  name: 'Demo Model (Simulated Missing Model)',
  kind: 'recognition',
}

export const DEMO_MEETING_ID = 'demo-meeting-not-real'

/**
 * The owner and repo are invented, so the drawer's Hub link resolves to a repository that does not
 * exist. Every optional field is filled because the drawer only renders a row once its field is set,
 * and the point of the sample is to see the full column of rows at once.
 */
export const DEMO_HUB_HIT: HubHit = {
  kind: 'quant',
  summary: {
    repo: 'nola-translator-audio/demo-whisper-extra-small-gguf',
    resourceId: 'hub:nola-translator-audio/demo-whisper-extra-small-gguf',
    revision: 'refs/pr/418',
    formats: ['gguf'],
    description: '',
    author: 'nola-translator-audio',
    pipelineTag: 'automatic-speech-recognition',
    libraryName: 'ctranslate2',
    downloads: 184_233,
    lastModified: '2026-04-18T09:24:00Z',
    hasGguf: true,
    ggufArchitecture: 'whisper',
    fileCount: 12,
    downloadBytes: 291_482_112,
    installed: false,
  },
}

export const DEMO_HUB_DESCRIPTION = `A speech recognition model distilled for short segments and low latency decoding.

The card text the drawer receives is separate from the summary metadata, because the real drawer is
handed the repository card after the README card finishes loading. Filling every optional field puts
the author, task type, loader, size and file count rows on screen at once.

Pressing install is inert in the gallery, so this sample never reaches the network.`

export const DEMO_TITLE = 'Demo Meeting Name'

export const DEMO_BULK_COUNT = 3

/**
 * `MODEL_MISSING` keeps the dialog on its retry branch, and a null session id means the primary
 * button offers to retry instead of offering to end a session that is not running. The runtime
 * error codes are avoided because their primary button navigates to the settings page.
 */
export const DEMO_ERROR_SESSION: SessionState = {
  status: 'error',
  sessionId: null,
  meetingId: DEMO_MEETING_ID,
  startedAtMs: null,
  elapsedMs: 0,
  error: 'Demo ASR (Simulated Recognition Model) is not installed',
  errorCode: 'MODEL_MISSING',
  missing: DEMO_MISSING,
  engineStatus: 'ready',
  engineVersion: null,
  segments: [],
  interim: null,
}

/**
 * Both components are missing, so the dialog renders one install button per issue. Only the engine
 * carries a probe reason, which puts the reported reason and the built-in copy on screen at once.
 */
export const DEMO_RUNTIME_ISSUES: RuntimeIssue[] = [
  { kind: 'engine', reason: 'Demo probe: the torch wheel is not in the shared Python environment' },
  { kind: 'llama' },
]

/** The notes are several paragraphs, so the dialog body has real text to wrap and scroll. */
export const DEMO_APP_UPDATE: AppUpdateCheckResult = {
  currentVersion: '1.0.0',
  latestVersion: '1.1.0',
  updateAvailable: true,
  releaseName: 'Nola Translator 1.1.0 (Demo Release)',
  releaseNotes: `Captions no longer drop when the window moves to another display.

The PyTorch engine and llama.cpp can now be pointed at different GPUs: the backend picker is per model slot, and each slot keeps its own choice after a restart.

Release notes keep the line breaks they were written with, which is what this sample is here to show. The body scrolls, so a long note list stays inside the dialog instead of pushing the buttons off screen.`,
  releaseUrl: 'https://example.invalid/nola-translator/releases/tag/demo-1.1.0',
}