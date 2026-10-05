/** The quick-speak workspace: driven by the session store. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Alert, AlertDialog, Button, Card, EmptyState, toast } from '@heroui/react'
import { Captions } from 'lucide-react'

import { findMissingResource } from '@/store'
import type { MissingResource, SessionState } from '@/store'
import { ENGINE_LOST_CODE, actions, getBridge, sessionStore, stores, useStore } from '@/store'
import { CaptionStage } from '@/components/caption'
import type { CaptionDisplayMode, CaptionLayout } from '@/components/caption'
import { NotesPanel } from '@/components/notes'
import { useI18n } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { recordPath, useRoute } from '@/routes'

import { PreflightDialog } from './PreflightDialog'
import { SessionBar } from './SessionBar'
import { SessionSetupDialog } from './SessionSetupDialog'
import type { SetupDraft } from './SessionSetupDialog'
import { WorkspaceToolbar } from './WorkspaceToolbar'
import './workspace.css'

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
    const source = overlay?.showSource ?? true
    const target = overlay?.showTranslation ?? true
    if (source && target) return 'both'
    return source ? 'source' : 'translation'
  }, [overlay?.showSource, overlay?.showTranslation])
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

  // Flush a pending write first when the meeting changes, or it lands on
  // the next meeting.
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = null
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
        // A failed save is not worth interrupting for: losing a passage of notes
        // should not outlast a red error in memory.
        void actions.meetings.setMeetingNotes(meetingId, value).catch(() => undefined)
      }, 800)
    },
    [meetingId],
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
        void actions.meetings.setMeetingNotes(id, value).catch(() => undefined)
      }
    },
    [],
  )

  // -- Open the dialog seeded from current settings, not a separate draft ---
  const openSetup = useCallback(() => {
    setDraft({
      title: '',
      audioSource: settings?.recognition.audioSource ?? 'defaultOutput',
      sourceLanguage: settings?.recognition.sourceLanguage ?? 'auto',
      recognitionModelId: settings?.recognition.modelId ?? 'qwen3-asr-1.7b-hf',
      translate: true,
      targetLanguage: settings?.translation.targetLanguage ?? 'zh',
      translationModelId: settings?.translation.localModelId ?? '',
      keepAudio: settings?.recording.keepAudio ?? true,
    })
    setSetupOpen(true)
  }, [settings])

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
       * means no WAV at all, so toggling it also changes the default for later
       * sessions.
       */
      try {
        await actions.settings.updateSettings({ recording: { keepAudio: draft.keepAudio } })
      } catch {
        toast.danger(t('workspaceUi.recordingPreferenceFailed'))
        return
      }
    }
    try {
      await actions.session.startSession(config)
      setNotes('')
      const meetingId = sessionStore.getState().meetingId
      if (meetingId) {
        await actions.meetings.loadMeetings().catch(() => undefined)
        if (draft?.title.trim()) {
          await actions.meetings.renameMeeting(meetingId, draft.title.trim()).catch(() => {
            toast.warning(t('workspaceUi.titleFailed'))
          })
        }
      }
    } catch {
      // The error is already on the store as an errorCode, and the dialog
      //      // below reports it. No second toast: saying it twice reads as two problems.
    }
  }, [draft, t])

  const stop = useCallback(async () => {
    // Read before stopping: the store's `finally` clears it unconditionally.
    const meetingId = sessionStore.getState().meetingId
    setStopConfirmOpen(false)
    try {
      await actions.session.stopSession()
      if (meetingId) navigate(recordPath(meetingId))
    } catch (error) {
      toast.danger(describeError(t, errorCodeOfSession(sessionStore.getState())))
    } finally {
      // Back to the idle entry either way: the store cleared the session id in
      // its `finally`, and leaving a "running" shell here would suggest the
      // session can still be recorded.
      setPendingConfig(null)
    }
  }, [navigate, t])

  const copyDiagnostics = useCallback(async () => {
    try {
      await getBridge()?.diagnostics.copy()
      toast.success(t('common.copied'))
    } catch {
      toast.danger(t('errors.copyDiagnosticsAction'))
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

  const sourceLanguage = pendingConfig?.sourceLanguage ?? settings?.recognition.sourceLanguage ?? 'auto'
  const targetLanguage = pendingConfig?.targetLanguages[0] ?? settings?.translation.targetLanguage ?? 'zh'
  const audioSource = pendingConfig?.audioSource.kind === 'defaultOutput' ? 'defaultOutput' : pendingConfig?.audioSource.deviceId ?? settings?.recognition.audioSource ?? 'defaultOutput'
  const audioLabel = audioSource === 'defaultOutput' ? t('workspaceUi.systemAudio') : devices.find((device) => device.deviceId === audioSource)?.name ?? audioSource
  const timer = <SessionBar status={status} elapsedMs={session.elapsedMs} audioLabel={audioLabel} showControls={active} onPause={() => actions.session.pauseSession()} onResume={() => actions.session.resumeSession()} onStop={() => setStopConfirmOpen(true)} />

  return (
    <div
      data-slot="workspace"
      className="nola-workspace"
    >
      <header className="nola-workspace-heading">
        <h1>{t('home.quickStart')}</h1>
      </header>

      <WorkspaceToolbar
        modelId={pendingConfig?.recognitionModelId ?? settings?.recognition.modelId ?? 'qwen3-asr-1.7b-hf'} onModelChange={(modelId) => {
          void actions.settings.updateSettings({ recognition: { modelId } }).catch(() => undefined)
        }}
        audioSource={audioSource}
        devices={devices}
        onAudioSourceChange={(next) => { void actions.settings.updateSettings({ recognition: { audioSource: next } }).catch(() => undefined) }}
        onOpenOverlay={() => { void getBridge()?.overlay.show().catch(() => toast.danger(t('workspaceUi.overlayFailed'))) }}
        sourceLanguage={sourceLanguage}
        targetLanguage={targetLanguage}
        onSourceLanguageChange={(sourceLanguage) => {
          void actions.settings.updateSettings({ recognition: { sourceLanguage } }).catch(() => undefined)
        }}
        onTargetLanguageChange={(targetLanguage) => {
          void actions.settings.updateSettings({ translation: { targetLanguage } }).catch(() => undefined)
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
          <span className="nola-caption text-[12.5px] leading-[1.5] font-normal">{t('workspace.paused')}</span>
        </div>
      ) : null}

      <div className="nola-workspace-body" data-notes-open={notesOpen && !notesCollapsed}>
        <Card className="nola-workspace-transcript">
          {active ? (
            <>
              <Card.Header className="nola-transcript-head" data-layout={layout} data-mode={displayMode}>
                {displayMode !== 'translation' ? <Card.Title>{t('workspace.sourcePanel')}</Card.Title> : null}
                {displayMode !== 'source' ? <Card.Title>{t('workspace.translationPanel')}</Card.Title> : null}
              </Card.Header>
              <CaptionStage
                className="nola-workspace-caption"
                segments={session.segments}
                interim={session.interim}
                layout={layout}
                displayMode={displayMode}
                fontSize={FONT_STEPS[fontStep]}
                paused={status === 'paused'}
                showTimestamps
                emptyState={<EmptyState className="nola-workspace-empty"><p>{t('workspace.nothingYet')}</p><p className="text-muted">{t('workspace.nothingYetHint')}</p></EmptyState>}
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
          <NotesPanel value={notes} onChange={editNotes} />
        ) : null}
        {notesOpen && notesCollapsed ? (
          <NotesPanel value={notes} onChange={editNotes} collapsed onToggleCollapsed={() => setNotesCollapsed(false)} />
        ) : null}
      </div>

      {timer}

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
        onStart={() => void start()}
      />

      <AlertDialog isOpen={stopConfirmOpen} onOpenChange={setStopConfirmOpen}>
        <AlertDialog.Backdrop className="z-overlay">
          <AlertDialog.Container>
            <AlertDialog.Dialog className="rounded-2xl border border-border">
              <AlertDialog.Header>
                <AlertDialog.Heading className="nola-title text-foreground">
                  {t('workspace.endConfirmTitle')}
                </AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p className="nola-body text-muted">{t('workspace.endConfirmBody')}</p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button variant="tertiary" size="sm" className="rounded-xl" onPress={() => setStopConfirmOpen(false)}>
                  {t('workspace.keepGoing')}
                </Button>
                <Button variant="danger" size="sm" className="rounded-xl" onPress={() => void stop()}>
                  {t('workspace.end')}
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>

      {/* Session failure: copy comes from the errorCode table; the `state.error` diagnostic string never reaches the UI. */}
      <SessionErrorDialog state={session} onCopyDiagnostics={() => void copyDiagnostics()} onReset={resetError} onViewRecord={viewRecord} />
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
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-8">
      <div className="flex max-w-96 flex-col items-start gap-3">
        <span className="flex size-10 items-center justify-center rounded-[10px] bg-surface-tertiary text-accent">
          <Captions className="size-5" aria-hidden="true" />
        </span>
        <h2 className="nola-display text-foreground">{t('workspaceUi.idleTitle')}</h2>
        <p className="nola-body text-muted">{t('workspace.nothingYetHint')}</p>
        {/*
         * The red Alert is only for an engine that cannot start.
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
         *     return by itself. A red alert would also offer a "retry" the user
         *     does not need.
         *   · `failed` is the real fault: the main process exhausted its retries
         *     and it will not heal. Reuses the existing copy pair
         *     (`engineNotReady` carries ENG-001, plus `engineNotReadyAction`).
         *
         * The button is disabled only while `starting`: `startSession` is already
         * in flight, and the store sets `status: 'starting'` before any await,
         * so that covers the engine handshake too.
         */}
        {engineStatus === 'failed' ? (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title className="nola-body-strong">{t('errors.engineNotReady')}</Alert.Title>
              <Alert.Description className="nola-caption">
                <Button
                  variant="tertiary"
                  size="sm"
                  className="rounded-[6px]"
                  onPress={onStart}
                >
                  {t('errors.engineNotReadyAction')}
                </Button>
              </Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}
        {engineStatus === 'recovering' ? (
          <p className="nola-caption flex items-center gap-2 text-muted">
            <span className="size-1.5 shrink-0 rounded-full bg-warning" aria-hidden="true" />
            {t('workspaceUi.engineRecovering')}
          </p>
        ) : null}
        <Button
          variant="primary"
          size="md"
          className="mt-2 rounded-full px-5"
          onPress={onStart}
          isPending={starting}
          isDisabled={starting}
        >
          {starting ? t('workspace.starting') : t('workspace.start')}
        </Button>
      </div>
    </div>
  )
}

/**
 * Session failure dialog.
 *
 * The three actions follow what is left of the session, because the ways out
 * differ:
 * - `ENGINE_LOST`: the engine process is gone and the session is over
 *   (`abandonSessionOnEngineLoss` cleared the `sessionId`). The way out is the
 *   record: captions are on disk per line and the main process has stamped the
 *   end time, so the user wants "how do I get the half-finished meeting", not a
 *   retry.
 * - `sessionId === null`: the session never started. Retry, or install the model.
 * - `sessionId !== null`: still running, just erroring. End the session, which
 *   saves the captions so far.
 *
 * The first two go through `errorCopyOf(code, 'start')`. Only `ENGINE_LOST`
 * matches a table row, so the primary button becomes "view this record". That
 * is the only behavioural exception, so it tests the code once here rather than
 * changing the `errorCopyOf` signature, which the overlay's `StartFailureNotice`
 * also calls.
 *
 * `state.error` is a diagnostic string for the console and "copy diagnostics",
 * never rendered.
 */
function SessionErrorDialog({
  state,
  onCopyDiagnostics,
  onReset,
  onViewRecord,
}: {
  state: SessionState
  onCopyDiagnostics: () => void
  onReset: () => void
  onViewRecord: () => void
}) {
  const { t } = useI18n()
  const isOpen = state.status === 'error'
  const alive = state.sessionId !== null
  const engineLost = state.errorCode === ENGINE_LOST_CODE

  const handle = useMemo(() => errorCopyOf(state.errorCode, alive ? 'stop' : 'start'), [state.errorCode, alive])

  return (
    <AlertDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        // Reached by ESC and by a backdrop click. This failure has no "later"
        // option, and without a reset it would keep covering the transcript, so
        // closing resets.
        if (!open) onReset()
      }}
    >
      <AlertDialog.Backdrop className="z-overlay">
        <AlertDialog.Container>
          <AlertDialog.Dialog className="rounded-2xl border border-border">
            <AlertDialog.Header>
              <AlertDialog.Heading className="nola-title text-foreground">
                {t(handle.message)}
              </AlertDialog.Heading>
            </AlertDialog.Header>
            {handle.detail ? (
              <AlertDialog.Body>
                <p className="nola-body text-muted">{t(handle.detail)}</p>
              </AlertDialog.Body>
            ) : null}
            <AlertDialog.Footer>
              <Button variant="tertiary" size="sm" className="rounded-xl" onPress={onCopyDiagnostics}>
                {t('errors.copyDiagnosticsAction')}
              </Button>
              <Button
                variant={alive ? 'danger' : 'primary'}
                size="sm"
                className="rounded-xl"
                onPress={() => {
                  if (engineLost) onViewRecord()
                  else if (alive) void actions.session.stopSession().catch(() => onReset())
                  else onReset()
                }}
              >
                {t(handle.action)}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  )
}

// -- Error code to copy ------------------------------------------------------------

export interface ErrorCopy {
  message: TranslationKey
  /**
   * Optional second line, null by default: an `errors.*` message is already a
   * complete sentence, so a detail repeating the action would show the same
   * "retry" text in the body and on the primary button.
   */
  detail: TranslationKey | null
  /** The primary button. */
  action: TranslationKey
}

/**
 * `errorCode` to `errors.*` copy.
 *
 * `sessionStore.errorCodeOf()` takes the prefix of a thrown `FOO: ...` and
 * uppercases it, while engine events are uppercased directly, so one fault can
 * arrive three ways (`MODEL_MISSING` / `MODELUNAVAILABLE` / `MODEL_UNAVAILABLE`).
 * Normalise before lookup, and fall back on context: an imprecise message beats
 * the UI rendering `missing:errors.xxx`, which is what the i18n layer does with
 * an unknown key.
 *
 * `context` decides the fallback copy and the primary button. A live session
 * always gets "end session": once an error has happened, saving the captions
 * already captured is the only useful thing left to do, and a "retry" there
 * invites clicking a dead session.
 *
 * A matched row is chosen by `errorCode` alone, so `ENGINELOST` resolves to its
 * own row in either context. The engine takes the session with it and clears
 * the `sessionId`, so it lands in the `start` branch, which only supplies a
 * fallback and leaves a matched row alone.
 */
const ERROR_TABLE: Record<string, ErrorCopy> = {
  MODELMISSING: { message: 'errors.modelMissing', detail: null, action: 'errors.modelMissingAction' },
  MODELUNAVAILABLE: { message: 'errors.modelMissing', detail: null, action: 'errors.modelMissingAction' },
  RESOURCEUNAVAILABLE: { message: 'errors.modelMissing', detail: null, action: 'errors.modelMissingAction' },
  RESOURCEUNFOUND: { message: 'errors.modelMissing', detail: null, action: 'errors.modelMissingAction' },
  ENGINENOTREADY: { message: 'errors.engineNotReady', detail: null, action: 'errors.engineNotReadyAction' },
  ENGINENOTRUNNING: { message: 'errors.engineNotReady', detail: null, action: 'errors.engineNotReadyAction' },
  INTERNALERROR: { message: 'errors.engineNotReady', detail: null, action: 'errors.engineNotReadyAction' },
  // The normalised form of `ENGINE_LOST` (uppercase, separators removed) —
  // the same code as `sessionStore.ENGINE_LOST_CODE`, not a second code.
  ENGINELOST: { message: 'errors.engineLost', detail: null, action: 'errors.engineLostAction' },
  AUDIODEVICEUNAVAILABLE: { message: 'errors.deviceNotFound', detail: null, action: 'errors.deviceNotFoundAction' },
  DEVICENOTFOUND: { message: 'errors.deviceNotFound', detail: null, action: 'errors.deviceNotFoundAction' },
  TRANSLATIONUNAVAILABLE: { message: 'errors.translateFailed', detail: null, action: 'errors.translateFailedAction' },
}

const FALLBACK: Record<'start' | 'stop', ErrorCopy> = {
  start: { message: 'errors.startFailed', detail: null, action: 'errors.startFailedAction' },
  // A session that died mid-run with an unrecognised code is closest to
  // "the engine stopped". `engineNotReady` says recognition cannot start,
  // which is the opposite of what happened here. The code stays off because it
  // could not be read.
  stop: { message: 'errors.engineStopped', detail: null, action: 'workspace.end' },
}

/**
 * Copy whose subject is "starting recognition", so it reads backwards once a
 * session is already running. `errorCopyOf(code, 'stop')` would otherwise take
 * `errors.engineNotReady` ("local engine not running, recognition cannot
 * start") from the table for an `internalError` raised mid-session, telling the
 * user it could not start when it actually stopped.
 */
const START_ONLY_MESSAGES: ReadonlySet<TranslationKey> = new Set<TranslationKey>([
  'errors.engineNotReady',
  'errors.startFailed',
])

/** Normalise, look up, and pick the primary button by context. */
export function errorCopyOf(code: string | null, context: 'start' | 'stop'): ErrorCopy {
  const normalized = code === null ? '' : code.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const base = (normalized.length > 0 ? ERROR_TABLE[normalized] : undefined) ?? FALLBACK[context]
  // A live session always gets "end session": saving the captions already
  // recognised is the only useful thing left, and a "retry" would invite
  // clicking a session whose engine is already gone.
  if (context !== 'stop') return base
  return {
    ...base,
    message: START_ONLY_MESSAGES.has(base.message) ? 'errors.engineStopped' : base.message,
    action: 'workspace.end',
  }
}

/** The errorCode from a store snapshot, read after the fact by `stop`'s catch. */
export function errorCodeOfSession(state: SessionState): string | null {
  return state.errorCode
}

/** A ready-made line for a toast, from the same table. */
function describeError(t: ReturnType<typeof useI18n>['t'], code: string | null): string {
  const copy = errorCopyOf(code, 'stop')
  return `${t(copy.message)} ${t(copy.action)}`
}

