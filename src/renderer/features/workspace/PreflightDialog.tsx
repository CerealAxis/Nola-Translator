/**
 * The pre-start check: prepare the runtime, probe devices, then check models.
 *
 * A missing model is caught here rather than reported by the engine, so it
 * stays out of `errors.*` and out of the session status, and the dialog offers
 * the action that resolves it instead.
 *
 * With the engine down, none of the later steps can complete and the dialog
 * stops at the first one. `listDevices` starts with `await ensureReady()` in the
 * main process, so that probe rejects when the engine is unavailable, and the
 * rejection alone cannot tell "engine down" from "no input device". See the
 * device check below for how the two are told apart.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { Alert, Button, Modal, Spinner, toast } from '@heroui/react'
import { CircleAlert } from 'lucide-react'

import type { MissingResource } from '@/store'
import { actions, getBridge, sessionStore, updateSettings } from '@/store'
import { useI18n } from '@/i18n'
import { computeUi } from '../settings/compute-ui'
import type { RuntimeSnapshot } from '../../../shared/compute'

/** `engineFailed` is not "a step failed" but "this dialog cannot reach a verdict". */
type Stage = 'environment' | 'environmentFailed' | 'devices' | 'models' | 'missing' | 'ready' | 'engineFailed'

export interface PreflightDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  /** The missing resource, computed by `findMissingResource` from the `listResources()` snapshot. */
  missing: MissingResource | null
  /** Start the session. The page holds the config and calls `startSession`. */
  onStart: () => void
}

export function PreflightDialog({ isOpen, onOpenChange, missing, onStart }: PreflightDialogProps) {
  const { t, language } = useI18n()
  const c = language === 'en' ? computeUi.en : computeUi.zh
  const [stage, setStage] = useState<Stage>('environment')
  const [runtime, setRuntime] = useState<RuntimeSnapshot | null>(null)
  const [environmentError, setEnvironmentError] = useState('')
  const missingRef = useRef(missing)
  missingRef.current = missing
  const [deviceOk, setDeviceOk] = useState(false)
  const [installing, setInstalling] = useState(false)
  const openedRef = useRef(false)
  const runRef = useRef(0)

  const runCheck = useCallback(() => {
    const run = (runRef.current += 1)
    const alive = (): boolean => runRef.current === run

    setStage('environment')
    setEnvironmentError('')
    setDeviceOk(false)
    setInstalling(false)

    const bridge = getBridge()
    void (async () => {
      try {
        if (!bridge) throw new Error('IPC bridge unavailable')
        await bridge.runtimes.prepare()
      } catch (error) {
        if (alive()) { setEnvironmentError(String(error)); setStage('environmentFailed') }
        return
      }
      if (!alive()) return
      setStage('devices')
      // A device list that cannot be fetched fails this row but must not stop
      // the run: the model check still owes an answer — unless the failure is the
      // engine not answering, which makes a model conclusion false too.
      let engineIsCause = false
      try {
        const devices = await bridge?.engine.listDevices()
        if (alive()) setDeviceOk((devices ?? []).length > 0)
      } catch {
        /*
         * A `listDevices` rejection cannot tell these two failures apart on its own,
         * and the error text is no help: in the main process the throw may come
         * from `engine.start()` (handshake failed, retries exhausted) or from the
         * later `engine.request` timing out.
         *
         * The discriminator is `sessionStore.engineStatus`, an observation: the
         * main process forwards `EngineProcess` `state` on the same `engine:event`
         * channel as `engineStateChanged`, and `applyEngineState` is the only writer.
         * So:
         *   · not `ready` -> the engine never completed a handshake this round, so
         *     the failure is in the handshake and ENG-001 is the honest report;
         *   · already `ready` -> the engine did answer, so the failure is after the
         *     handshake and belongs to device enumeration.
         *
         * No ordering compensation is needed. The main process sets the state
         * before it throws (`setState('failed')` -> `emit('fatalError')` -> `throw`)
         * and `engineStateChanged` shares one IPC pipe with this rejection, so the
         * state is already `failed` by the time this `catch` runs. A mid-run crash
         * lands here too: `handleTermination` sets `recovering` or `failed` before
         * emitting, so the crash is already visible in the status.
         *
         * Written as `!== 'ready'` rather than only `failed` so that `recovering`
         * counts as engine-side: the process is gone and nothing was listening for
         * that probe, so ENG-001 is the truth.
         */
        engineIsCause = sessionStore.getState().engineStatus !== 'ready'
      }
      if (!alive()) return
      if (engineIsCause) {
        /*
         * Stop at the first step. The model step reads `modelsStore.resources`,
         * and that snapshot is left empty by the same failed engine start, so a
         * "missing model" verdict here would be a false conclusion covering a
         * real one — and the install it offers would fail on the same
         * `ensureReady()`.
         */
        setStage('engineFailed')
        return
      }
      setStage('models')
      try { await actions.models.loadModels() }
      catch { if (alive()) setStage('engineFailed'); return }
      // `missing` is computed by the parent from the resource snapshot; this
      // pause lets "checking models" be seen at least once.
      await new Promise((resolve) => setTimeout(resolve, 260))
      if (!alive()) return
      setStage(missingRef.current ? 'missing' : 'ready')
    })()
  }, [])

  useEffect(() => {
    if (!isOpen || stage !== 'environment') return
    const refresh = () => { void getBridge()?.runtimes.list().then(setRuntime).catch(() => undefined) }
    refresh()
    const timer = setInterval(refresh, 1000)
    return () => clearInterval(timer)
  }, [isOpen, stage])

  // Re-run on every open: the model may have been installed after "later", so
  // the result cannot be cached.
  useEffect(() => {
    if (!isOpen) {
      openedRef.current = false
      return
    }
    if (openedRef.current) return
    openedRef.current = true
    runCheck()
    return () => {
      openedRef.current = false
      // Closing, or a dependency change: invalidate the run in flight, whose
      // result would otherwise overwrite the next one.
      runRef.current += 1
    }
  }, [isOpen, runCheck])

  const install = useCallback(async () => {
    if (!missing) return
    setInstalling(true)
    try {
      await actions.models.manageResource(missing.resourceId, 'install')
      await actions.models.loadModels()
      toast.success(t('preflight.allReady'))
    } catch {
      toast.danger(t('errors.downloadFailed'))
    } finally {
      setInstalling(false)
    }
  }, [missing, t])

  // The parent's recomputed `missing` becomes null once installed, which is
  // read as passing. Not a full re-run: the devices were just probed, so probing
  // again would only spin the dialog a second time.
  useEffect(() => {
    if (isOpen && stage === 'missing' && missing === null) setStage('ready')
  }, [isOpen, stage, missing])

  const engineFailed = stage === 'engineFailed'
  const environmentPending = stage === 'environment'
  const environmentFailed = stage === 'environmentFailed'
  const close = (open: boolean) => {
    if (!open) {
      runRef.current += 1
      if (environmentPending) void getBridge()?.runtimes.cancel()
    }
    onOpenChange(open)
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={close}>
      <Modal.Backdrop className="z-overlay">
        <Modal.Container size="sm" placement="center">
          <Modal.Dialog className="rounded-2xl border border-border">
            <Modal.Header>
              <Modal.Heading className="nola-title text-foreground">{t('preflight.title')}</Modal.Heading>
              <span className="nola-micro text-[11px] leading-[1.45] font-normal text-muted">
                {t('session.stepPreflight')}
              </span>
            </Modal.Header>

            <Modal.Body className="flex flex-col gap-3">
              <ChecklistRow done={!environmentPending && !environmentFailed} failed={environmentFailed}
                pending={environmentPending} label={c.checkingEnvironment} failedLabel={c.environmentFailed} />
              {environmentPending && runtime?.operation ? <p role="status" className="nola-caption text-muted">
                {c[runtime.operation.phase]} · {Math.round(runtime.operation.bytes / 2 ** 20)} / {Math.round(runtime.operation.totalBytes / 2 ** 20)} MiB
              </p> : null}
              {environmentFailed ? <Alert status="danger"><Alert.Content><Alert.Description>{environmentError}</Alert.Description>
                <Button variant="tertiary" size="sm" onPress={runCheck}>{c.retry}</Button>
                <Button variant="tertiary" size="sm" onPress={() => {
                  void updateSettings({ compute: { runtimeId: 'bundled', llamaRuntimeId: 'bundled', recognitionDevice: 'cpu', translationDevice: 'cpu', precision: 'auto', quantization: 'none' } })
                    .then(runCheck).catch(error => setEnvironmentError(String(error)))
                }}>{c.useCpu}</Button>
              </Alert.Content></Alert> : null}
              {!environmentPending && !environmentFailed ? <>
              <ChecklistRow
                done={stage !== 'devices' && deviceOk}
                failed={stage !== 'devices' && !deviceOk}
                pending={stage === 'devices'}
                label={t('preflight.checkingDevices')}
                // Never "no audio input detected" when the engine did not answer:
                // nothing was probed on any device, so that would report a real
                // fault as a hardware one.
                failedLabel={engineFailed ? t('preflight.deviceCheckBlocked') : t('preflight.deviceUnavailable')}
              />
              {/* The model step has not run yet: no verdict to show. */}
              {engineFailed ? null : (
                <ChecklistRow
                  done={stage === 'ready'}
                  pending={stage === 'models'}
                  label={t('preflight.checkingModels')}
                  failedLabel={t('preflight.modelMissing', { name: missing?.name ?? '' })}
                  failed={stage === 'missing'}
                />
              )}
              </> : null}
              {/*
               * The engine is down: state the cause and offer the way out, reusing
               * the `errors.engineNotReady` copy pair (ENG-001 plus its action).
               *
               * "Retry" reruns this device check, whose first step is
               * `ensureReady()`, so it literally retries the engine start. Same
               * Alert+Button shape as `IdleGuide` and the `main.tsx` banner.
               */}
              {engineFailed ? (
                <Alert status="danger">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title className="nola-body-strong">{t('errors.engineNotReady')}</Alert.Title>
                    <Alert.Description className="nola-caption">
                      <Button
                        variant="tertiary"
                        size="sm"
                        className="rounded-[6px]"
                        onPress={runCheck}
                      >
                        {t('errors.engineNotReadyAction')}
                      </Button>
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : null}
              {stage === 'ready' ? (
                <p className="nola-caption flex items-center gap-2 text-success">
                  <span className="size-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" />
                  {t('preflight.allReady')}
                </p>
              ) : null}
            </Modal.Body>

            <Modal.Footer>
              <Button variant="tertiary" size="sm" className="rounded-xl" onPress={() => close(false)}>
                {stage === 'missing' ? t('preflight.later') : t('session.cancel')}
              </Button>
              {stage === 'missing' ? (
                <Button variant="primary" size="sm" className="rounded-full px-5" onPress={install} isPending={installing}>
                  <CircleAlert aria-hidden="true" />
                  {t('preflight.installNow')}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  className="rounded-full px-5"
                  onPress={onStart}
                  // Disabled here when the engine is down, but not because a press
                  // would "inevitably fail": `startSession` begins with
                  // `prepareEnvironment` and then `ensureReady()`, so a press can
                  // still bring the engine up. When it cannot, the same ENG-001 and
                  // the same way out are already on this screen, so a second press
                  // adds nothing — the "retry" above is the useful action.
                  isDisabled={stage !== 'ready' || !deviceOk}
                >
                  {t('preflight.start')}
                </Button>
              )}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}

/** One check row: spinner while pending, tick when done, a sentence when failed. */
function ChecklistRow({
  label,
  failedLabel,
  pending,
  done,
  failed = false,
}: {
  label: string
  failedLabel: string
  pending: boolean
  done: boolean
  failed?: boolean
}) {
  const { t } = useI18n()
  return (
    <div className="flex items-center gap-2">
      {pending ? <Spinner size="sm" /> : null}
      {!pending && done ? <span className="size-1.5 shrink-0 rounded-full bg-success" aria-label={t('preflight.allReady')} /> : null}
      {!pending && !done && failed ? (
        <CircleAlert className="size-4 shrink-0 text-danger" aria-hidden="true" />
      ) : null}
      <span className={['nola-body min-w-0 flex-1 truncate', failed ? 'text-danger' : 'text-foreground'].join(' ')}>
        {pending || done ? label : failedLabel}
      </span>
    </div>
  )
}
