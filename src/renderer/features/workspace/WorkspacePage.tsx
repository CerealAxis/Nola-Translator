/** The quick-speak workspace: driven by the session store. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Captions } from 'lucide-react'

import { findMissingResource } from '@/store'
import { savedBindingOf } from '@/available-models'
import type { MissingResource, SessionState } from '@/store'
import { actions, getBridge, sessionStore, stores, useStore } from '@/store'
import { unsupportedRecognitionLanguageOf } from '@/store/sessionStore'
import { CaptionStage } from '@/components/caption'
import type { CaptionDisplayMode, CaptionLayout } from '@/components/caption'
import { NotesPanel } from '@/components/notes'
import { notifyError, notifySuccess, notifyWarning, describeError } from '@/components/primitives/notify'
import { FeatureActivityNotice, requestFeatureStart } from '@/components/primitives/FeatureActivityNotice'
import { useI18n } from '@/i18n'
import { recordPath, useRoute } from '@/routes'
import { NO_TRANSLATION_LANGUAGE } from '@/bridge'
import type { DiagnosticCopyContext } from '@/bridge'
import { audioDeviceNameOf, targetLanguagePatch, translationModelPatch } from '@/session-config'

import { PreflightDialog } from './PreflightDialog'
import { SessionBar } from './SessionBar'
import { SessionSetupDialog } from './SessionSetupDialog'
import type { SetupDraft } from './SessionSetupDialog'
import { errorCodeOfSession, errorCopyOf } from './error-copy'
import { isSessionAlreadyRunningError } from '../../../shared/ipc-error'
import { SessionErrorDialog, StopSessionDialog } from './WorkspaceDialogs'
import { WorkspaceToolbar } from './WorkspaceToolbar'
import './workspace.css'

export { errorCopyOf } from './error-copy'

/** Default reading size, one step smaller or larger. */
const FONT_STEPS = [14, 16, 18] as const

/** Below this the notes panel collapses to a handle (DESIGN section 3). */
const NOTES_COLLAPSE_PX = 1000

export function WorkspacePage() {
  const { t, language } = useI18n()
  const { navigate } = useRoute()

  const session = useStore(sessionStore, (state) => state)
  const settings = useStore(stores.settings, (state) => state.settings)
  const devices = useStore(stores.models, (state) => state.devices)
  const resources = useStore(stores.models, (state) => state.resources)
  const meetings = useStore(stores.meetings, (state) => state.meetings)

  // -- Session config: the draft exists only while the dialog is open ------
  const [draft, setDraft] = useState<SetupDraft | null>(null)
  const [pendingConfig, setPendingConfig] = useState<Parameters<typeof actions.session.startSession>[0] | null>(null)
  const [setupOpen, setSetupOpen] = useState(false)
  const [preflightOpen, setPreflightOpen] = useState(false)
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [notesCollapsed, setNotesCollapsed] = useState(false)
  // -- View preferences: display mode is a setting (the overlay follows it),
  //    while layout and size belong to the workspace alone ----------------
  const overlay = settings?.overlay
  const displayMode: CaptionDisplayMode = useMemo(() => {
    if (settings?.translation.targetLanguage === NO_TRANSLATION_LANGUAGE) return 'source'
    const source = overlay?.showSource ?? true
    const target = overlay?.showTranslation ?? true
    if (source && target) return 'both'
    return source ? 'source' : 'translation'
  }, [overlay?.showSource, overlay?.showTranslation, settings?.translation.targetLanguage])
  const [layout, setLayout] = useState<CaptionLayout>('split')
  const [fontStep, setFontStep] = useState(1)
  const [notesOpen, setNotesOpen] = useState(true)

  const status = session.status
  /**
   * `starting` is not active: the engine is still handshaking, so the guide
   * block stays and its CTA becomes pending. Switching to the transcript here
   * would make the button vanish on press, leaving an empty stage where "no
   * reaction" and "connecting" look identical.
   *
   * `stopping` is active: the transcript holds the last view, and stopping is
   * not interruptible.
   */
  const active = status === 'running' || status === 'paused' || status === 'stopping'

  // -- Window width: the notes panel collapses in a narrow window ---------
  useEffect(() => {
    if (typeof window === 'undefined') return
    const query = window.matchMedia(`(max-width: ${NOTES_COLLAPSE_PX - 1}px)`)
    const sync = (): void => setNotesCollapsed(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  // -- Notes: follow the meeting, auto-saved with an 800ms debounce --------
  //
  // The debounce is required, not an optimisation: in the main process a notes
  // write reads the whole meeting.json, changes one field and rewrites it, so
  // per-keystroke calls mean continuous small-file IO for a two-hour meeting.
  // 800ms is imperceptible and short enough to land before the user navigates
  // away.
  const meetingId = session.meetingId
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedNotes = useRef('')
  // A write still in flight, so unmount can land it without waiting out the 800ms.
  const pendingNotes = useRef<string | null>(null)
  const pendingMeetingId = useRef<string | null>(null)
  /*
   * The save runs after every pause in typing, so a write that keeps failing
   * would otherwise stack one notice per pause. The text of the last reported
   * failure is enough to tell them apart.
   */
  const notesFailure = useRef<string | null>(null)
  const reportNotesFailure = useCallback((error: unknown): void => {
    const text = describeError(error) ?? 'unknown'
    if (notesFailure.current === text) return
    notesFailure.current = text
    notifyError(t('errors.notesSaveFailed'), { cause: error })
  }, [t])
  const clearNotesFailure = useCallback((): void => { notesFailure.current = null }, [])

  // Flush a pending write first when the meeting changes, or it lands on
  // the next meeting.
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = null
    const pendingValue = pendingNotes.current
    const pendingId = pendingMeetingId.current
    pendingNotes.current = null
    pendingMeetingId.current = null
    if (pendingValue !== null && pendingId !== null && pendingValue !== savedNotes.current) {
      void actions.meetings.setMeetingNotes(pendingId, pendingValue).then(clearNotesFailure, reportNotesFailure)
    }
    savedNotes.current = ''
    if (!meetingId) {
      setNotes('')
      return
    }
    const existing = meetings.find((meeting) => meeting.meetingId === meetingId)?.notes ?? ''
    savedNotes.current = existing
    setNotes(existing)
  }, [meetingId])

  const editNotes = useCallback(
    (value: string) => {
      setNotes(value)
      if (!meetingId) return
      if (saveTimer.current) clearTimeout(saveTimer.current)
      pendingNotes.current = value
      pendingMeetingId.current = meetingId
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null
        pendingNotes.current = null
        pendingMeetingId.current = null
        if (value === savedNotes.current) return
        savedNotes.current = value
        /*
         * A lost note is the user's own writing, so it is worth interrupting
         * for: nothing else tells them the sentence they just typed is gone.
         */
        void actions.meetings.setMeetingNotes(meetingId, value).then(clearNotesFailure, reportNotesFailure)
      }, 800)
    },
    [clearNotesFailure, meetingId, reportNotesFailure],
  )

  // Land a pending write on unmount, or closing the window right after typing
  // the last character loses it.
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      const value = pendingNotes.current
      const id = pendingMeetingId.current
      if (value !== null && id !== null && value !== savedNotes.current) {
        savedNotes.current = value
        void actions.meetings.setMeetingNotes(id, value).then(clearNotesFailure, reportNotesFailure)
      }
    },
    [clearNotesFailure, reportNotesFailure],
  )

  // -- Open the dialog seeded from current settings, not a separate draft ---
  const openSetup = useCallback(async () => {
    try {
      if (!await actions.settings.canStartDesktopCaptions()) {
        notifyError(t('errors.serviceConflict', { running: t('videoCaptions.title') }))
        return
      }
    } catch (error) {
      notifyError(t('errors.startFailed'), { cause: error })
      return
    }
    setDraft({
      title: '',
      audioSource: settings?.recognition.audioSource ?? 'defaultOutput',
      sourceLanguage: settings?.recognition.sourceLanguage ?? 'auto',
      recognitionModelId: settings?.recognition.modelId ?? 'qwen3-asr-1.7b-hf',
      recognitionBinding: settings ? savedBindingOf('asr', settings) : '',
      translate: settings?.translation.targetLanguage !== NO_TRANSLATION_LANGUAGE,
      targetLanguage: settings?.translation.targetLanguage ?? 'zh',
      translationModelId: settings?.translation.localModelId ?? '',
      translationBinding: settings ? savedBindingOf('mt', settings) : '',
      keepAudio: settings?.recording.keepAudio ?? true,
    })
    setSetupOpen(true)
  }, [settings, t])

  const submitSetup = useCallback((config: Parameters<typeof actions.session.startSession>[0]) => {
    setPendingConfig(config)
    setSetupOpen(false)
    setPreflightOpen(true)
  }, [])

  const missing: MissingResource | null = useMemo(() => {
    if (!pendingConfig) return null
    // The whole `pendingConfig`, not just the two model ids: `findMissingResource`
    // also needs `targetLanguages` and `translationProvider` to decide whether a
    // local translation model is required. A cloud provider's model id is not on
    // this machine and stays out of preflight. `pendingConfig` is already a
    // complete SessionConfig, since that is what `onSubmit` passes.
    return findMissingResource({ storagePath: '', resources }, pendingConfig)
  }, [pendingConfig, resources])

  // -- Start / pause / resume / end ----------------------------------------
  const configRef = useRef(pendingConfig)
  configRef.current = pendingConfig

  const start = useCallback(async () => {
    const config = configRef.current
    if (config === null) return
    setPreflightOpen(false)
    if (draft) {
      /*
       * The recording toggle is a global preference rather than part of this
       * session: it writes `settings.recording.keepAudio`, and the main process
       * uses that to decide whether to hand the engine a `recordingPath`. No path
       * means no audio file at all, so toggling it also changes the default for later
       * sessions.
       */
      try {
        await actions.settings.updateSettings({ recording: { keepAudio: draft.keepAudio } })
      } catch (error) {
        notifyError(t('workspaceUi.recordingPreferenceFailed'), { cause: error })
        return
      }
    }
    try {
      await requestFeatureStart(() => actions.session.startSession(config), 'interpretation')
      if (sessionStore.getState().status !== 'running') return
      setNotes('')
      const meetingId = sessionStore.getState().meetingId
      if (meetingId) {
        await actions.meetings.loadMeetings().catch((error: unknown) => {
          notifyError(t('errors.meetingsLoadFailed'), { cause: error })
        })
        if (draft?.title.trim()) {
          await actions.meetings.renameMeeting(meetingId, draft.title.trim()).catch((error: unknown) => {
            notifyWarning(t('workspaceUi.titleFailed'), { cause: error })
          })
        }
      }
    } catch (error) {
      // SessionController is the final cross-client mutex. Turn its conflict into a
      // named toast instead of also opening the generic start-failure dialog.
      if (isSessionAlreadyRunningError(error)) {
        notifyError(t('errors.serviceConflict', { running: t('videoCaptions.title') }))
      } else if (unsupportedRecognitionLanguageOf(error)) {
        notifyError(t('errors.unsupportedRecognitionLanguage', { language: unsupportedRecognitionLanguageOf(error) ?? '' }))
      } else if (sessionStore.getState().errorCode === 'AUDIODEVICEUNAVAILABLE') {
        notifyError(t('overlay.audioDeviceOpenFailed', { device: audioDeviceNameOf(config.audioSource, devices, t('overlay.selectedAudioDevice')) }))
      } else if (sessionStore.getState().status !== 'error') {
        /*
         * The store leaves the status at 'idle' for the failures it does not own,
         * a missing model or a session that has not wound down, so the error
         * dialog never opens and nothing else says the session did not start.
         */
        notifyError(t('errors.startFailed'), { cause: error })
      }
    }
  }, [devices, draft, t])

  const stop = useCallback(async () => {
    // Read before stopping: the store's `finally` clears it unconditionally.
    const meetingId = sessionStore.getState().meetingId
    setStopConfirmOpen(false)
    try {
      await actions.session.stopSession()
      if (meetingId && new URLSearchParams(window.location.search).get('workspace') !== '1') navigate(recordPath(meetingId))
    } catch (error) {
      notifyError(sessionErrorMessage(t, errorCodeOfSession(sessionStore.getState())))
    } finally {
      // Back to the idle entry either way: the store cleared the session id in
      // its `finally`, and leaving a "running" shell here would suggest the
      // session can still be recorded.
      setPendingConfig(null)
    }
  }, [navigate, t])

  const copyDiagnostics = useCallback(async (context?: DiagnosticCopyContext) => {
    try {
      await getBridge()?.diagnostics.copy(context)
      notifySuccess(t('common.copied'))
    } catch (error) {
      notifyError(t('errors.copyDiagnosticsFailed'), { cause: error })
    }
  }, [t])

  const resetError = useCallback(() => {
    actions.session.resetSessionError()
  }, [])

  /*
   * The most recent meeting id this window held.
   *
   * When the engine dies mid-session, `abandonSessionOnEngineLoss` clears the
   * `meetingId` along with the session. The record is on disk and the main
   * process has already stamped its end time, so the user's next stop is that
   * record rather than an empty workspace. Keep the id before it is cleared.
   *
   * A ref, not state: it is read at the moment of a click and never needs to
   * re-render, which is also why `stop()` reads the id the same way.
   */
  const lastMeetingIdRef = useRef<string | null>(null)
  if (session.meetingId !== null) lastMeetingIdRef.current = session.meetingId

  const viewRecord = useCallback(() => {
    const meetingId = lastMeetingIdRef.current
    // Reset before navigating: without it, returning here from the record page
    // reopens the same dialog (`status` is still `error`) on a screen with no
    // session and no engine to report.
    actions.session.resetSessionError()
    if (meetingId) navigate(recordPath(meetingId))
  }, [navigate])

  const currentConfig = !['idle', 'error'].includes(status) ? pendingConfig : null
  const sourceLanguage = currentConfig?.sourceLanguage ?? settings?.recognition.sourceLanguage ?? 'auto'
  const targetLanguage = currentConfig ? currentConfig.targetLanguages[0] ?? NO_TRANSLATION_LANGUAGE : settings?.translation.targetLanguage ?? 'zh'
  const audioSource = currentConfig?.audioSource.kind === 'defaultOutput' ? 'defaultOutput' : currentConfig && 'deviceId' in currentConfig.audioSource ? currentConfig.audioSource.deviceId : settings?.recognition.audioSource ?? 'defaultOutput'
  const audioLabel = audioSource === 'defaultOutput' ? t('workspaceUi.systemAudio') : devices.find((device) => device.deviceId === audioSource)?.name ?? audioSource
  const timer = <SessionBar status={status} elapsedMs={session.elapsedMs} audioLabel={audioLabel} onPause={() => actions.session.pauseSession()} onResume={() => actions.session.resumeSession()} onStop={() => setStopConfirmOpen(true)} />

  return (
    <div
      data-slot="workspace"
      role="region"
      aria-label={t('home.quickStart')}
      className="nola-workspace"
    >
      <FeatureActivityNotice />
      <WorkspaceToolbar readerOnly
        audioSource={audioSource}
        devices={devices}
        onAudioSourceChange={(next) => { void actions.settings.updateSettings({ recognition: { audioSource: next } }).catch(() => undefined) }}
        onOpenOverlay={() => {
          void actions.settings.showOverlay().then(opened => {
            if (opened === false) {
              notifyError(t('errors.serviceConflict', { running: t('videoCaptions.title') }))
            }
          }).catch((error: unknown) => { notifyError(t('workspaceUi.overlayFailed'), { cause: error }) })
        }}
        sourceLanguage={sourceLanguage}
        targetLanguage={targetLanguage}
        onSourceLanguageChange={(sourceLanguage) => {
          void actions.settings.updateSettings({ recognition: { sourceLanguage } }).catch(() => undefined)
        }}
        onTargetLanguageChange={(targetLanguage) => {
          void actions.settings.updateSettings(targetLanguagePatch(targetLanguage, settings?.translation.targetLanguage ?? 'zh')).catch(() => undefined)
        }}
        onLanguagePairChange={(sourceLanguage, targetLanguage) => {
          void actions.settings.updateSettings({ recognition: { sourceLanguage }, translation: { targetLanguage } }).catch(() => undefined)
        }}
        displayMode={displayMode}
        onDisplayModeChange={(mode) => {
          void actions.settings
            .updateSettings({ overlay: { showSource: mode !== 'translation', showTranslation: mode !== 'source' } })
            .catch(() => undefined)
        }}
        layout={layout}
        onLayoutChange={setLayout}
        fontSize={FONT_STEPS[fontStep]}
        onFontSizeChange={(size) => setFontStep(Math.max(0, FONT_STEPS.indexOf(size as (typeof FONT_STEPS)[number])))}
        notesOpen={notesOpen}
        onToggleNotes={() => setNotesOpen((open) => !open)}
        // The engine fixes the model when the session starts, so a later change
        // to settings does not affect the running session.
        sessionLocked={status !== 'idle' && status !== 'error'}
        language={language}
      />

      {status === 'paused' ? (
        <div
          data-slot="paused-banner"
          className="flex shrink-0 items-center gap-2 bg-warning-soft px-6 py-2 text-warning-soft-foreground"
        >
          <span className="size-1.5 shrink-0 rounded-full bg-warning" aria-hidden="true" />
          <span className="nola-caption text-[13px] leading-[1.5] font-normal">{t('workspace.paused')}</span>
        </div>
      ) : null}

      <div className="nola-workspace-body" data-notes-open={notesOpen && !notesCollapsed}>
        <Card className="nola-workspace-transcript">
          {active ? (
            <>
              <CardHeader className="nola-transcript-head" data-layout={layout} data-mode={displayMode}>
                {displayMode !== 'translation' ? <CardTitle>{t('workspace.sourcePanel')}</CardTitle> : null}
                {displayMode !== 'source' ? <CardTitle>{t('workspace.translationPanel')}</CardTitle> : null}
              </CardHeader>
              <CaptionStage
                className="nola-workspace-caption"
                segments={session.segments}
                interim={session.interim}
                layout={layout}
                displayMode={displayMode}
                fontSize={FONT_STEPS[fontStep]}
                paused={status === 'paused'}
                showTimestamps
                sourceLanguage={settings?.recognition.sourceLanguage ?? 'auto'}
                emptyState={<Empty className="nola-workspace-empty"><EmptyHeader><EmptyTitle>{t('workspace.nothingYet')}</EmptyTitle><EmptyDescription>{t('workspace.nothingYetHint')}</EmptyDescription></EmptyHeader></Empty>}
              />
            </>
          ) : (
            <IdleGuide
              // `session.status`, not the narrowed `status` above: this branch
              // does not render while starting, but the button's pending state
              // still has to line up.
              starting={session.status === 'starting'}
              engineStatus={session.engineStatus}
              onStart={openSetup}
            />
          )}
        </Card>

        {notesOpen && !notesCollapsed ? (
          <NotesPanel key={meetingId ?? 'draft'} value={notes} onChange={editNotes} />
        ) : null}
        {notesOpen && notesCollapsed ? (
          <NotesPanel key={meetingId ?? 'draft'} value={notes} onChange={editNotes} collapsed onToggleCollapsed={() => setNotesCollapsed(false)} />
        ) : null}
      </div>

      {active ? timer : null}

      <SessionSetupDialog
        isOpen={setupOpen && draft !== null}
        onOpenChange={setSetupOpen}
        draft={draft ?? EMPTY_DRAFT}
        onDraftChange={setDraft}
        devices={devices}
        language={language}
        onSubmit={submitSetup}
      />
      <PreflightDialog
        isOpen={preflightOpen}
        onOpenChange={setPreflightOpen}
        missing={missing}
        config={pendingConfig ?? undefined}
        onStart={() => void start()}
        onCopyDiagnostics={copyDiagnostics}
      />

      <StopSessionDialog isOpen={stopConfirmOpen} onOpenChange={setStopConfirmOpen} onEnd={() => void stop()} />

      {/* Session failure: copy comes from the errorCode table; the diagnostic reason remains visible alongside the translated action. */}
      <SessionErrorDialog state={session} onCopyDiagnostics={(context) => void copyDiagnostics(context)} onReset={resetError} onViewRecord={viewRecord} />
    </div>
  )
}

const EMPTY_DRAFT: SetupDraft = {
  title: '',
  audioSource: 'defaultOutput',
  sourceLanguage: 'auto',
  recognitionModelId: 'qwen3-asr-1.7b-hf',
  translate: true,
  targetLanguage: 'zh',
  translationModelId: '',
  keepAudio: true,
}

/**
 * The centred idle guide, and the only primary CTA on this screen.
 *
 * A dead engine reports the reason in the Alert below; an engine that has not
 * come up yet says nothing, and one that is reconnecting gets a single grey
 * line. See below for why the three differ.
 */
function IdleGuide({
  starting,
  engineStatus,
  onStart,
}: {
  starting: boolean
  engineStatus: SessionState['engineStatus']
  onStart: () => void
}) {
  const { t } = useI18n()
  const failureToastShown = useRef(false)
  useEffect(() => {
    if (engineStatus !== 'failed') {
      failureToastShown.current = false
      return
    }
    if (failureToastShown.current) return
    failureToastShown.current = true
    notifyError(t('errors.engineNotReady'), {
      action: { label: t('errors.engineNotReadyAction'), onPress: onStart },
    })
  }, [engineStatus, onStart, t])
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-8">
      <div className="flex max-w-96 flex-col items-start gap-3">
        <span className="flex size-10 items-center justify-center rounded-[10px] bg-surface-tertiary text-accent">
          <Captions className="size-5" aria-hidden="true" />
        </span>
        <h2 className="nola-display text-foreground">{t('workspaceUi.idleTitle')}</h2>
        <p className="nola-body text-muted">{t('workspace.nothingYetHint')}</p>
        {/*
         * A persistent Toast is only for an engine that cannot start.
         *
         * `engineStatus` is observed in the main process (`engine-process.ts`
         * emits `state`, `src/main/ipc.ts` forwards it as `engineStateChanged`,
         * `sessionStore` maps it one to one). The main process starts the engine
         * in `app.whenReady()`, so this window is not the thing that spawns it:
         * `booting` is the first seconds after launch, and the `ensureReady()` in
         * the `startSession` handler is a fallback for an engine that has actually
         * gone away.
         *
         * Three non-ready values, three renderings, because the user's way out
         * differs:
         *   · `idle` / `booting` say nothing: nothing is broken, and the primary
         *     CTA stays clickable. Reporting a fault here would also disable the
         *     only action that could resolve it.
         *   · `recovering` gets one grey line: the process just crashed but the
         *     main process still has retries (250ms / 1s / 4s) and the engine will
         *     return by itself. A retry action is unnecessary while that runs.
         *   · `failed` is the real fault: the main process exhausted its retries
         *     and it will not heal. Reuses the existing copy pair
         *     (`engineNotReady` carries ENG-001, plus `engineNotReadyAction`).
         *
         * The button is disabled only while `starting`: `startSession` is already
         * in flight, and the store sets `status: 'starting'` before any await,
         * so that covers the engine handshake too.
         */}
        {engineStatus === 'recovering' ? (
          <p className="nola-caption flex items-center gap-2 text-muted">
            <span className="size-1.5 shrink-0 rounded-full bg-warning" aria-hidden="true" />
            {t('workspaceUi.engineRecovering')}
          </p>
        ) : null}
        <Button
          variant="default"
          size="default"
          className="mt-2 rounded-full px-5"
          onClick={onStart}
          aria-busy={starting}
          disabled={starting}
        >
          {starting ? <Spinner /> : null}{starting ? t('workspace.starting') : t('workspace.start')}
        </Button>
      </div>
    </div>
  )
}

/** A ready-made line for a toast, from the same table. */
function sessionErrorMessage(t: ReturnType<typeof useI18n>['t'], code: string | null): string {
  const copy = errorCopyOf(code, 'stop')
  return `${t(copy.message)} ${t(copy.action)}`
}

