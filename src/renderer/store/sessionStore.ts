/**
 * Live session state machine: `idle | starting | running | paused | stopping | error`.
 *
 * Two invariants hold the file together: `engineStatus` is only ever observed,
 * never inferred, and every teardown path clears `sessionId` unconditionally.
 */

import { DEFAULT_SETTINGS } from '@/bridge'
import type { NolaBridge } from '@/bridge'
import type {
  CaptionSegment,
  EngineChannelEvent,
  EngineEvent,
  EngineProcessState,
  ResourceSnapshot,
  SessionConfig,
  SessionStatus,
} from '@/bridge'
import { createStore } from './createStore'

/** Cap on finalized segments. Two to three hours of speech fits, and memory stays bounded. */
export const MAX_FINALIZED_SEGMENTS = 2048
/** Interim coalescing window. The engine revises every 100-200ms, so 60ms collapses a burst into one render. */
const INTERIM_BATCH_MS = 60
const TICK_MS = 1000

export interface MissingResource {
  resourceId: string
  name: string
  kind: 'recognition' | 'translation'
}

/**
 * Engine process state as the main process measures it. `recovering` vs `failed`
 * is only whether the main process has retries left; `idle` is not a fault.
 * `booting` is the first seconds of a launch: store init calls `listResources`,
 * and that is what starts the engine.
 */
export type EngineStatus = 'idle' | 'booting' | 'ready' | 'recovering' | 'failed'

/**
 * The only `EngineProcessState` -> `EngineStatus` mapping, written exhaustively
 * so a sixth state fails to compile instead of falling through to `?? 'idle'`.
 * `stopping` maps to `idle`, not `booting`: a closing engine is already unusable.
 * Ending a session does not stop the engine process, so `idle` is not a stall.
 */
const ENGINE_PROCESS_STATE_TO_UI: Record<EngineProcessState, EngineStatus> = {
  stopped: 'idle',
  starting: 'booting',
  ready: 'ready',
  stopping: 'idle',
  recovering: 'recovering',
  failed: 'failed',
}


export interface SessionState {
  status: SessionStatus
  sessionId: string | null
  meetingId: string | null
  startedAtMs: number | null
  /** Timer reading. Frozen while paused, resumes from the frozen point. */
  elapsedMs: number
  /**
   * Diagnostic string, verbatim from the engine and possibly Chinese. It never
   * goes through i18n, so the UI shows `errorCode` via `t('errors.*')` instead
   * and this one is for the console and "copy diagnostics".
   */
  error: string | null
  /** UPPER_SNAKE code; the UI looks its copy up by this. */
  errorCode: string | null
  /** Missing model caught by preflight, so the UI can offer "install now". */
  missing: MissingResource | null
  /**
   * Process-level state, keeping "never started", "cannot start" and
   * "reconnecting" apart. Observed, never inferred.
   */
  engineStatus: EngineStatus
  engineVersion: string | null
  /** Finalized segments, ascending by startedAtMs, capped at MAX_FINALIZED_SEGMENTS. */
  segments: readonly CaptionSegment[]
  /** Current unconfirmed segment. At most one, because the engine revises the last line. */
  interim: CaptionSegment | null
}

const initialState: SessionState = {
  status: 'idle',
  sessionId: null,
  meetingId: null,
  startedAtMs: null,
  elapsedMs: 0,
  error: null,
  errorCode: null,
  missing: null,
  engineStatus: 'idle',
  engineVersion: null,
  segments: [],
  interim: null,
}

export const sessionStore = createStore<SessionState>(initialState)

let bridge: NolaBridge | null = null
let unsubscribe: (() => void) | null = null

/**
* Whether an `engineStateChanged` has arrived since the last attach.
*
* `getEngineState()` is a round trip, and the state can change while it is in
* flight — as an event, which overtakes the reply — so the edge wins.
*/
let engineStateSeen = false

let tickTimer: ReturnType<typeof setInterval> | null = null
let interimTimer: ReturnType<typeof setTimeout> | null = null
/** Ticker pause ledger. */
let pausedAtMs: number | null = null
let pausedTotalMs = 0

/**
 * Pause/resume needs no capability probe: the protocol carries it
 * (`EngineCommand.setSessionPaused`, preload `setSessionPaused`). The bridge
 * call is a synchronous void, so the clock stops on the press and a refusal
 * arrives later as an `error` event.
 */
function pauseControl(): { pause: () => void; resume: () => void } | undefined {
  if (!bridge) return undefined
  const { sessionId } = sessionStore.getState()
  if (sessionId === null) return undefined
  return {
    pause: () => bridge?.engine.setPaused(sessionId, true),
    resume: () => bridge?.engine.setPaused(sessionId, false),
  }
}


function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function errorCodeOf(error: unknown): string {
  const message = errorMessage(error)
  const match = /([a-zA-Z]+):/.exec(message)
  return match ? match[1].toUpperCase() : 'SESSION_ERROR'
}

/**
 * Engine `status` code -> `SessionStatus`, the only place this mapping happens
 * (`ipcBridge` forwards `EngineEvent` untouched). `ready` maps to `undefined`:
 * it is the engine-level handshake, which `engineStatus` already reports. The
 * engine emits only `listening` / `idle` / `paused` today.
 */
const ENGINE_STATUS_TO_UI: Record<Extract<EngineEvent, { type: 'status' }>['code'], SessionStatus | undefined> = {
  idle: 'idle',
  starting: 'starting',
  ready: undefined,
  listening: 'running',
  paused: 'paused',
  stopping: 'stopping',
}

/**
 * Error code for `state === 'error'` when the engine process is gone.
 */
export const ENGINE_LOST_CODE = 'ENGINE_LOST'

/**
* Writes `engineStatus` from the main process's measured state
* (`engineStateChanged`, or the `getEngineState()` read at attach time), and
* finalises a lost engine here so both entry points pass through one place.
*/
function applyEngineState(state: EngineProcessState): void {
  const engineStatus = ENGINE_PROCESS_STATE_TO_UI[state]
  sessionStore.setState({ engineStatus })
  if (engineStatus === 'recovering' || engineStatus === 'failed') abandonSessionOnEngineLoss()
}

/**
* The engine process is gone while this window still holds a session. A restart
* is a *new* process with no session, recording or loaded weights, so remaining
* retries change nothing: the engine may heal, this session will not. Teardown
* matches `sessionStopped` except the verdict, `error` + `ENGINE_LOST`.
*/
function abandonSessionOnEngineLoss(): void {
  const { sessionId } = sessionStore.getState()
  // No session here: the main window is idle, the overlay has not adopted `sessionStarted`, or teardown ran.
  if (sessionId === null) return
  stopTicker()
  pausedAtMs = null
  pausedTotalMs = 0
  // The caption stream is dead with the engine; keeping it would freeze the last line on screen.
  clearSessionTranscript()
  sessionStore.setState({
    status: 'error',
    // Diagnostic only: exit code and signal live in the main process, not on this edge.
    error: '本地引擎进程已退出',
    errorCode: ENGINE_LOST_CODE,
    sessionId: null,
    meetingId: null,
    startedAtMs: null,
    elapsedMs: elapsedNow(),
  })
}

/**
 * The resource `SessionConfig` needs but the snapshot lacks; null means it can
 * start. Runs before `startSession`, so an unfinished config is never reported as
 * a broken engine. Only `local` is preflighted, and `translationModelId` alone
 * decides which local model is required.
 */
export function findMissingResource(
  snapshot: { readonly resources: readonly { resourceId: string; name: string; installed: boolean; kind?: string }[]; storagePath?: string },
  config: SessionConfig,
): MissingResource | null {
  // No target language, or not a local provider: no local model to preflight.
  const translationResourceId = config.targetLanguages.length === 0 || config.translationProvider !== 'local'
    ? null
    : config.translationModelId?.trim() || DEFAULT_SETTINGS.translation.localModelId
  const requiredIds = [config.recognitionModelId, ...(translationResourceId ? [translationResourceId] : [])]

  for (const id of requiredIds) {
    const record = id ? snapshot.resources.find((item) => item.resourceId === id) : undefined
    if (!record?.installed) {
      return { resourceId: record?.resourceId ?? id ?? '', name: record?.name ?? '所选识别', kind: record?.kind === 'translationModel' || translationResourceId === id ? 'translation' : 'recognition' }
    }
  }
  return null
}

function elapsedNow(): number {
  const { startedAtMs, elapsedMs } = sessionStore.getState()
  if (startedAtMs === null) return elapsedMs
  if (pausedAtMs !== null) return pausedAtMs - startedAtMs - pausedTotalMs
  return Date.now() - startedAtMs - pausedTotalMs
}

function startTicker(): void {
  stopTicker()
  tickTimer = setInterval(() => {
    // Only while running: a paused or stopping session has had its interval removed.
    if (sessionStore.getState().status !== 'running') return
    sessionStore.setState({ elapsedMs: elapsedNow() })
  }, TICK_MS)
}

function stopTicker(): void {
  if (tickTimer !== null) {
    clearInterval(tickTimer)
    tickTimer = null
  }
}

/** Interim batching: only the last revision within 60ms is rendered. Later revisions overwrite the interim line, so dropping intermediates loses nothing. */
function scheduleInterim(segment: CaptionSegment): void {
  if (interimTimer !== null) clearTimeout(interimTimer)
  interimTimer = setTimeout(() => {
    interimTimer = null
    sessionStore.setState({ interim: segment })
  }, INTERIM_BATCH_MS)
}

function appendFinal(segment: CaptionSegment): void {
  sessionStore.setState((state) => {
    const previous = state.segments.find((item) => item.segmentId === segment.segmentId)
    // The engine sometimes resends a segment; a lower revision must not roll back a finalized one.
    if (previous && previous.revision > segment.revision) return state

    const next = [...state.segments.filter((item) => item.segmentId !== segment.segmentId), segment]
      .sort((left, right) => left.startedAtMs - right.startedAtMs)
    // Over the cap, drop the oldest: finalized segments are only trimmed from the head.
    const capped = next.length > MAX_FINALIZED_SEGMENTS
      ? next.slice(next.length - MAX_FINALIZED_SEGMENTS)
      : next

    return {
      segments: capped,
      interim: state.interim?.segmentId === segment.segmentId ? null : state.interim,
    }
  })
}

/**
 * Starts a session. Preflight runs first: a missing model is refused with
 * `missing` exposed for the UI. A second call while `starting` is rejected so
 * the engine never receives two starts.
 */
export async function startSession(config: SessionConfig): Promise<void> {
  if (!bridge) throw new Error('initStores 还没注入 bridge')
  const status = sessionStore.getState().status
  if (status === 'starting' || status === 'stopping') {
    throw new Error('上一次会话还没收尾')
  }
  if (status === 'running' || status === 'paused') {
    throw new Error('已有会话在运行')
  }

  sessionStore.setState({ status: 'starting', error: null, errorCode: null, missing: null })

  // Preflight stays outside the try: its failure means no session started, not an engine fault.
  let missing: MissingResource | null
  try {
    missing = findMissingResource(await bridge.engine.listResources(), config)
  } catch (error) {
    /*
     * Not even the resource list. The main process sets `failed` and forwards
     * `engineStateChanged` before it throws, so any engine verdict has already
     * landed in `engineStatus`; what arrives here is this call's own failure.
     */
    sessionStore.setState({
      status: 'error',
      error: errorMessage(error),
      errorCode: errorCodeOf(error),
    })
    throw error
  }
  if (missing) {
    // Back to `idle`; the UI drives the install from `missing`.
    sessionStore.setState({ status: 'idle', missing, errorCode: 'MODEL_MISSING' })
    throw new Error(`缺少模型：${missing.name}`)
  }

  try {
    const started = await bridge.engine.startSession(config)
    pausedAtMs = null
    pausedTotalMs = 0
    sessionStore.setState({
      status: 'running',
      sessionId: started.sessionId,
      meetingId: started.meetingId,
      startedAtMs: Date.now(),
      elapsedMs: 0,
      segments: [],
      interim: null,
      error: null,
      errorCode: null,
    })
    startTicker()
  } catch (error) {
    // The session's own failure (bad config, one already running); `engineStatus` is left alone.
    sessionStore.setState({
      status: 'error',
      error: errorMessage(error),
      errorCode: errorCodeOf(error),
    })
    throw error
  }
}

/**
 * Ends the session. The `finally` clears the session id and the ticker
 * unconditionally: a retained id points the next `stopSession` at a dead
 * session, the engine answers `sessionNotRunning`, and no session can start
 * again.
 */
export async function stopSession(): Promise<void> {
  if (!bridge) throw new Error('initStores 还没注入 bridge')
  const { sessionId, status } = sessionStore.getState()
  if (sessionId === null) {
    sessionStore.setState({ status: 'idle' })
    return
  }
  if (status === 'stopping') throw new Error('正在结束中')
  if (status === 'paused') {
    // A paused session may still look live to the engine; resume so `stopSession` finds it.
    resumeSession()
  }

  sessionStore.setState({ status: 'stopping', error: null, errorCode: null })
  try {
    await bridge.engine.stopSession(sessionId)
    sessionStore.setState({ status: 'idle', error: null, errorCode: null })
  } catch (error) {
    // Keep `ENGINE_LOST`: that edge told the truth, and a code guessed from the text inverts it.
    const engineLost = sessionStore.getState().errorCode === ENGINE_LOST_CODE
    sessionStore.setState({
      status: 'error',
      error: errorMessage(error),
      errorCode: engineLost ? ENGINE_LOST_CODE : errorCodeOf(error),
      elapsedMs: elapsedNow(),
    })
    throw error
  } finally {
    // Unconditional, failure included.
    stopTicker()
    pausedAtMs = null
    pausedTotalMs = 0
    // Captions go too: this window considers the session over, and they would outlive it on screen.
    clearSessionTranscript()
    sessionStore.setState({ sessionId: null, meetingId: null, startedAtMs: null })
  }
}

export function pauseSession(): void {
  const { status, sessionId } = sessionStore.getState()
  if (status !== 'running' || sessionId === null) return
  pauseControl()?.pause()
  pausedAtMs = Date.now()
  sessionStore.setState({ status: 'paused', elapsedMs: elapsedNow() })
  // Stop the ticker; a live interval would make the pause cosmetic.
  stopTicker()
}

export function resumeSession(): void {
  const { status, sessionId } = sessionStore.getState()
  if (status !== 'paused' || sessionId === null) return
  pauseControl()?.resume()
  if (pausedAtMs !== null) pausedTotalMs += Date.now() - pausedAtMs
  pausedAtMs = null
  sessionStore.setState({ status: 'running' })
  startTicker()
}

export function resetSessionError(): void {
  if (sessionStore.getState().status !== 'error') return
  // `engineStatus` stays untouched: the guide's own ENG-001 alert owns it, and only the main process clears it.
  sessionStore.setState({ status: 'idle', error: null, errorCode: null })
}

/**
 * Clear this session's live captions. Every teardown path calls it: the
 * `stopSession` `finally`, `sessionStopped`, and `abandonSessionOnEngineLoss`.
 * Keeping them is not harmless — `CaptionTrack` is keyed on `sessionId ?? 'idle'`,
 * so a null id remounts it and redraws the last line.
 */
export function clearSessionTranscript(): void {
  sessionStore.setState({ segments: [], interim: null })
}
export function attachSessionStore(next: NolaBridge): void {
  bridge = next
  unsubscribe?.()
  unsubscribe = next.events.onEngineEvent((event: EngineChannelEvent) => {
    switch (event.type) {
      /*
      * Engine process lifecycle: the only source of `engineStatus`. The main
      * process forwards `EngineProcess.state` on this same channel
      * (`forwardState` in `src/main/ipc.ts`). Crashes arrive here too, because
      * `engine-process.ts` sets `failed` / `recovering` before it emits them.
      */
      case 'engineStateChanged':
        // The edge has been seen, so the initial read below must not overwrite it.
        engineStateSeen = true
        applyEngineState(event.state)
        break
      case 'ready':
        /*
         * Only `engineVersion` is read here — engine-reported data available
         * nowhere else. A successful handshake is not evidence for
         * `engineStatus`: the process may already have died, which is why that
         * field comes from `engineStateChanged` instead.
         */
        sessionStore.setState({ engineVersion: event.engineVersion })
        break
      /*
       * Adopt the session. The overlay is a separate document that never calls
       * `startSession()`, so without this branch its `sessionId` stays null and the
       * `caption` branch below drops every line. Adoption happens only when nothing
       * is held, so a late event cannot replace a live session.
       */
      case 'sessionStarted': {
        let adopted = false
        sessionStore.setState((state) => {
          if (state.sessionId !== null) return state
          adopted = true
          return {
            ...state,
            status: 'running',
            sessionId: event.sessionId,
            startedAtMs: Date.now(),
            elapsedMs: 0,
            segments: [],
            interim: null,
          }
        })
        if (adopted) {
          pausedAtMs = null
          pausedTotalMs = 0
          startTicker()
        }
        break
      }
      case 'caption': {
        const { sessionId } = sessionStore.getState()
        // A late event from an older session must not pollute this one's captions.
        if (sessionId === null || event.sessionId !== sessionId) return
        if (event.segment.isFinal) {
          if (interimTimer !== null) {
            clearTimeout(interimTimer)
            interimTimer = null
          }
          appendFinal(event.segment)
        } else {
          scheduleInterim(event.segment)
        }
        break
      }
      case 'error':
        sessionStore.setState({
          status: sessionStore.getState().sessionId === null ? sessionStore.getState().status : 'error',
          error: event.code,
          errorCode: event.code.toUpperCase(),
        })
        break
      /*
       * The engine's authoritative session state: pause and resume are answered with
       * a `status` event, not an `error`, so ignoring it leaves the UI showing
       * "running" for a session the engine has left. `ready` stays out, and with no
       * session held the event is ignored — the engine broadcasts to both windows.
       */
      case 'status': {
        const next = ENGINE_STATUS_TO_UI[event.code]
        if (next === undefined) break
        const current = sessionStore.getState()
        if (current.sessionId === null) break
        // Already painted by `pauseSession`; moving the ledger again counts the pause twice.
        if (current.status === next) break

        if (next === 'paused') {
          if (pausedAtMs === null) pausedAtMs = Date.now()
          sessionStore.setState({ status: 'paused', elapsedMs: elapsedNow() })
          stopTicker()
        } else {
          if (pausedAtMs !== null) {
            pausedTotalMs += Date.now() - pausedAtMs
            pausedAtMs = null
          }
          sessionStore.setState({ status: next, elapsedMs: elapsedNow() })
          if (next === 'running') startTicker()
          else stopTicker()
        }
        break
      }
      case 'sessionStopped':
        // The engine has finished; align the UI without guessing the final duration.
        if (sessionStore.getState().sessionId !== event.sessionId) return
        stopTicker()
        // The main process stopped the session, so this window never ran `stopSession` and clears captions itself.
        clearSessionTranscript()
        sessionStore.setState({ status: 'idle', sessionId: null, meetingId: null, startedAtMs: null })
        pausedAtMs = null
        pausedTotalMs = 0
        break
      default:
        break
    }
  })

  /*
   * Read the level once, after subscribing. Events carry edges only, and a reload
   * usually finds the engine already ready — an edge that will never fire again —
   * so without this read the window sits at `idle` forever. It does not start the
   * engine.
   */
  engineStateSeen = false
  void Promise.resolve()
    .then(() => next.engine.getEngineState())
    .then(
      (state) => {
        if (engineStateSeen) return
        applyEngineState(state)
      },
      () => undefined
    )
}

export function detachSessionStore(): void {
  unsubscribe?.()
  unsubscribe = null
  bridge = null
  stopTicker()
  if (interimTimer !== null) {
    clearTimeout(interimTimer)
    interimTimer = null
  }
  pausedAtMs = null
  pausedTotalMs = 0
  // Reset to `idle`; the next attach re-reads, so a carried-over value would claim a readiness never seen.
  engineStateSeen = false
  sessionStore.setState(initialState)
}
