/**
 * The pre-start check: check components without installation, probe devices, then check models.
 *
 * A missing model is caught here rather than reported by the engine, so it
 * stays out of `errors.*` and out of the session status, and the dialog offers
 * the action that resolves it instead.
 *
 * Device discovery is advisory: it populates source choices, but `startSession`
 * resolves the selected source again. A transient listing failure must not block
 * a session that can still open its configured source.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CircleAlert, LoaderCircle } from 'lucide-react'

import type { MissingResource } from '@/store'
import type { DiagnosticCopyContext } from '@/bridge'
import type { SessionConfig } from '../../../shared/contracts'
import { DEFAULT_COMPUTE_SETTINGS } from '../../../shared/compute'
import { actions, sessionStore, stores } from '@/store'
import { useI18n } from '@/i18n'
import { notifyError, notifyRetryableFailure, notifySuccess } from '@/components/primitives/notify'
import { modelEngines, translationEngine as fallbackTranslationEngine } from '../../../shared/model-engines'
import { NO_TRANSLATION_LANGUAGE } from '../../../shared/settings'
import { DownloadSourceDialog } from '../models/DownloadSourceDialog'

/** `engineFailed` is not "a step failed" but "this dialog cannot reach a verdict". */
type Stage = 'environment' | 'environmentFailed' | 'devices' | 'models' | 'missing' | 'ready' | 'engineFailed' | 'modelCheckFailed'
type PreflightFailure = DiagnosticCopyContext & { supportCode: NonNullable<DiagnosticCopyContext['supportCode']> }
type RuntimeComponent = 'engine' | 'llama' | 'crisp'

function correlationIdOf(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'requestId' in error && typeof error.requestId === 'string'
    ? error.requestId
    : undefined
}

function engineErrorCodeOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null
  if ('engineCode' in error && typeof error.engineCode === 'string') return error.engineCode.toUpperCase()
  if (error instanceof Error) {
    const match = /引擎错误[：:]\s*([a-z][a-z0-9_]*)/i.exec(error.message)
    return match?.[1]?.toUpperCase() ?? null
  }
  return null
}

export interface PreflightDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  /** The missing resource, computed by `findMissingResource` from the `listResources()` snapshot. */
  missing: MissingResource | null
  /** The exact session settings that will be passed to `startSession`. */
  config?: SessionConfig
  /** Start the session. The page holds the config and calls `startSession`. */
  onStart: () => void
  /** Opens the existing safe report-copy path with this failure's correlation details. */
  onCopyDiagnostics?: (context: DiagnosticCopyContext) => void
}

export function PreflightDialog({ isOpen, onOpenChange, missing, config, onStart, onCopyDiagnostics }: PreflightDialogProps) {
  const { t } = useI18n()
  const [stage, setStage] = useState<Stage>('environment')
  const missingRef = useRef(missing)
  missingRef.current = missing
  const [deviceOk, setDeviceOk] = useState(false)
  const [deviceFailure, setDeviceFailure] = useState<'enumeration' | 'operation' | 'empty' | null>(null)
  const [failureContext, setFailureContext] = useState<PreflightFailure | null>(null)
  const [missingRuntime, setMissingRuntime] = useState<RuntimeComponent | null>(null)
  const [installing, setInstalling] = useState(false)
  const [downloadTarget, setDownloadTarget] = useState<MissingResource | null>(null)
  const openedRef = useRef(false)
  const runRef = useRef(0)

  /*
   * `manual` marks the run the user asked for with the recheck button. The run
   * that opens the dialog is not announced: the dialog itself shows every step
   * of it, and a notice for it would greet the user with a toast every time a
   * session starts.
   */
  const runCheck = useCallback((manual = false) => {
    const run = (runRef.current += 1)
    const alive = (): boolean => runRef.current === run
    const reportCheckFailure = (cause: unknown): void => {
      notifyError(t('preflight.checkFailedTitle'), {
        cause,
        description: t('preflight.checkFailedDescription'),
        action: { label: t('runtime.recheck'), onPress: () => runCheck(true) },
      })
    }

    setStage('environment')
    setDeviceOk(false)
    setDeviceFailure(null)
    setFailureContext(null)
    setMissingRuntime(null)
    setInstalling(false)
    const previousErrorRequestId = sessionStore.getState().errorRequestId

    void (async () => {
      let environmentSupportCode: PreflightFailure['supportCode'] = 'ERR-999'
      try {
        const settings = stores.settings.getState().settings
        const recognitionProvider = config?.recognitionProvider ?? settings?.recognition.provider ?? 'local'
        const translationProvider = config?.translationProvider ?? settings?.translation.provider ?? 'local'
        const targetLanguages = config?.targetLanguages ?? (settings?.translation.targetLanguage && settings.translation.targetLanguage !== NO_TRANSLATION_LANGUAGE ? [settings.translation.targetLanguage] : [])
        const modelId = config?.translationModelId ?? settings?.translation.localModelId
        const recognitionModelId = config?.recognitionModelId ?? settings?.recognition.modelId
        const compute = config?.compute ?? settings?.compute
        const resources = stores.models.getState().resources
        const resource = resources.find(r => r.resourceId === modelId)
        const recognitionResource = resources.find(r => r.resourceId === recognitionModelId)
        const usesLocalTranslation = (translationProvider === 'local' || config?.fallbackTranslationProvider === 'local') && targetLanguages.length > 0
        const recognitionLoader = recognitionResource
          ? modelEngines(recognitionResource)[0] ?? compute?.recognitionEngine
          : compute?.recognitionEngine
        const selectedEngine = (resource ? modelEngines(resource)[0] : undefined)
          ?? fallbackTranslationEngine(compute ?? DEFAULT_COMPUTE_SETTINGS, undefined, modelId)
        const requiredComponents = new Set<RuntimeComponent>()
        if (recognitionProvider === 'local' && recognitionLoader) {
          requiredComponents.add(recognitionLoader === 'pytorch' ? 'engine' : recognitionLoader === 'llama' ? 'llama' : 'crisp')
        }
        if (usesLocalTranslation && selectedEngine) {
          requiredComponents.add(selectedEngine === 'pytorch' ? 'engine' : selectedEngine === 'llama' ? 'llama' : 'crisp')
        }
        const components = [...requiredComponents]
        const runtime = await actions.settings.loadRuntimeComponents(true, components)
        const missing = components.find(component => runtime.local[component]?.status !== 'ready')
        if (missing) {
          environmentSupportCode = missing === 'engine' ? 'RNT-001' : missing === 'llama' ? 'RNT-002' : 'ERR-999'
          if (alive()) {
            setMissingRuntime(missing)
            setFailureContext({ supportCode: environmentSupportCode })
            setStage('environmentFailed')
          }
          return
        }
      } catch (error) {
        if (alive()) {
          setFailureContext({ supportCode: environmentSupportCode })
          setStage('environmentFailed')
          reportCheckFailure(error)
        }
        return
      }
      if (!alive()) return
      setStage('devices')
      // A device list that cannot be fetched fails this row but must not stop
      // the run: the model check still owes an answer — unless the failure is the
      // engine not answering, which makes a model conclusion false too.
      let engineIsCause = false
      let deviceFailureError: unknown = null
      try {
        const devices = await actions.models.probeAudioDevices()
        if (alive()) {
          const foundDevices = (devices ?? []).length > 0
          setDeviceOk(foundDevices)
          setDeviceFailure(foundDevices ? null : 'empty')
          setFailureContext(foundDevices ? null : { supportCode: 'AUD-002' })
        }
      } catch (error) {
        /*
         * A new engine error event or structured engine code means the command
         * reached the engine. That evidence wins over the lifecycle status, which
         * may still be stale in this renderer. Only a failure before an engine
         * reply, combined with a non-ready process state, is a startup fault.
         * A timed-out request while the process still appears ready is an operation
         * failure (ENG-003), not proof that audio enumeration itself failed.
         */
        deviceFailureError = error
        const latestSession = sessionStore.getState()
        const engineRepliedWithError = engineErrorCodeOf(error) !== null
          || (latestSession.errorRequestId !== null && latestSession.errorRequestId !== previousErrorRequestId)
        engineIsCause = !engineRepliedWithError && latestSession.engineStatus !== 'ready'
        const requestTimedOut = correlationIdOf(error) !== undefined && !engineRepliedWithError
        if (alive()) {
          setDeviceFailure(engineIsCause ? null : requestTimedOut ? 'operation' : 'enumeration')
          setFailureContext({
            supportCode: engineIsCause ? 'ENG-001' : requestTimedOut ? 'ENG-003' : 'AUD-001',
            correlationId: correlationIdOf(error),
          })
        }
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
        if (manual) reportCheckFailure(deviceFailureError)
        return
      }
      setStage('models')
      try { await actions.models.loadModels({ includeDevices: false }) }
      catch (error) {
        if (alive()) {
          const engineUnavailable = sessionStore.getState().engineStatus !== 'ready'
          setFailureContext({ supportCode: engineUnavailable ? 'ENG-001' : 'ENG-003', correlationId: correlationIdOf(error) })
          setStage(engineUnavailable ? 'engineFailed' : 'modelCheckFailed')
          if (manual) reportCheckFailure(error)
        }
        return
      }
      // `missing` is computed by the parent from the resource snapshot; this
      // pause lets "checking models" be seen at least once.
      await new Promise((resolve) => setTimeout(resolve, 260))
      if (!alive()) return
      setStage(missingRef.current ? 'missing' : 'ready')
      if (manual && !missingRef.current) notifySuccess(t('common.refreshed'))
    })()
  }, [config, t])

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

  const install = useCallback(async (source: import('../../../shared/contracts').ModelDownloadSource) => {
    if (!missing) return
    setInstalling(true)
    try {
      await actions.models.manageResource(missing.resourceId, 'install', source)
      await actions.models.loadModels({ includeDevices: false })
    } catch (error) {
      notifyRetryableFailure(t('models.installFailed'), {
        cause: error,
        description: t('models.downloadReasonInstall'),
        action: { label: t('errors.downloadFailedAction'), onPress: () => { void install(source) } },
      })
    } finally {
      setInstalling(false)
    }
  }, [missing, t])

  const requestInstall = useCallback(() => {
    if (missing) setDownloadTarget(missing)
  }, [missing])

  // The parent's recomputed `missing` becomes null once installed, which is
  // read as passing. Not a full re-run: the devices were just probed, so probing
  // again would only spin the dialog a second time.
  useEffect(() => {
    if (isOpen && stage === 'missing' && missing === null) setStage('ready')
  }, [isOpen, stage, missing])

  const engineFailed = stage === 'engineFailed'
  const environmentPending = stage === 'environment'
  const environmentFailed = stage === 'environmentFailed'
  /*
   * The engine and model-check failures stay inside this dialog: the checklist
   * rows already name them, and the way out is the dialog's own recheck button,
   * which every failure stage offers. A recheck the user asked for also raises
   * a notice, so the result of that run is never only a row in the dialog.
   */
  const failedStage = stage === 'engineFailed' || stage === 'modelCheckFailed' || stage === 'environmentFailed'
  const close = (open: boolean) => {
    if (!open) {
      runRef.current += 1
      setDownloadTarget(null)
    }
    onOpenChange(open)
  }

  return (
    <>
    <DownloadSourceDialog record={downloadTarget} onClose={() => setDownloadTarget(null)} onSelect={source => {
      setDownloadTarget(null)
      void install(source)
    }} />
    <Dialog open={isOpen} onOpenChange={close}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('preflight.title')}</DialogTitle>
          <span className="nola-micro text-[12px] leading-[1.45] font-normal text-muted">
            {t('session.stepPreflight')}
          </span>
        </DialogHeader>

        <div className="flex flex-col gap-3">
              <ChecklistRow done={!environmentPending && !environmentFailed} failed={environmentFailed}
                pending={environmentPending} label={t('runtime.checking')} failedLabel={t('runtime.noticeTitle')} />
              {!environmentPending && !environmentFailed ? <>
              <ChecklistRow
                done={stage !== 'devices' && deviceOk}
                failed={stage !== 'devices' && !deviceOk}
                pending={stage === 'devices'}
                label={t('preflight.checkingDevices')}
                failedLabel={engineFailed
                  ? t('preflight.deviceCheckBlocked')
                  : deviceFailure === 'operation'
                    ? t('errors.engineOperationFailed')
                    : deviceFailure === 'enumeration'
                      ? t('errors.audioDeviceEnumerationFailed')
                      : t('errors.deviceNotFound')}
              />
              {/* The model step has not run yet: no verdict to show. */}
              {engineFailed ? null : (
                <ChecklistRow
                  done={stage === 'ready'}
                  pending={stage === 'models'}
                  label={t('preflight.checkingModels')}
                  failedLabel={stage === 'modelCheckFailed'
                    ? t('errors.engineOperationFailed')
                    : t('preflight.modelMissing', { name: missing?.name ?? '' })}
                  failed={stage === 'missing' || stage === 'modelCheckFailed'}
                />
              )}
              </> : null}
              {stage === 'ready' ? (
                deviceOk ? (
                  <p className="nola-caption flex items-center gap-2 text-success">
                    <span className="size-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" />
                    {t('preflight.allReady')}
                  </p>
                ) : <p className="nola-caption text-warning">{t('preflight.deviceCheckWarning')}</p>
              ) : null}
        </div>

        <DialogFooter>
          {failureContext && onCopyDiagnostics ? (
            <Button variant="tertiary" size="sm" className="rounded-xl" onClick={() => onCopyDiagnostics(failureContext)}>
              {t('errors.copyDiagnosticsAction')}
            </Button>
          ) : null}
          {failedStage ? (
            <Button variant="secondary" size="sm" className="rounded-xl" onClick={() => runCheck(true)}>
              {t('runtime.recheck')}
            </Button>
          ) : null}
          {environmentFailed && missingRuntime ? (
            <Button variant="secondary" size="sm" className="rounded-xl" onClick={() => {
              const component = missingRuntime
              close(false)
              void actions.settings.openRuntimeSettings(component).catch((error: unknown) => {
                notifyError(t('errors.runtimeSettingsFailed'), { cause: error })
              })
            }}>
              {missingRuntime === 'engine' ? t('runtime.goTorch') : missingRuntime === 'llama' ? t('runtime.goLlama') : t('runtime.installCrisp')}
            </Button>
          ) : null}
          <Button variant="tertiary" size="sm" className="rounded-xl" onClick={() => close(false)}>
            {stage === 'missing' ? t('preflight.later') : t('session.cancel')}
          </Button>
          {stage === 'missing' ? (
            <Button variant="default" size="sm" className="rounded-full px-5" onClick={requestInstall} disabled={installing}>
              {installing ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
              {t('preflight.installNow')}
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              className="rounded-full px-5"
              onClick={onStart}
              // Device enumeration is advisory: the selected source is resolved again
              // by startSession, so a transient list failure must not block a usable source.
              disabled={stage !== 'ready'}
            >
              {t('preflight.start')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
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
      {pending ? <LoaderCircle className="size-4 animate-spin text-accent" aria-label={t('common.loading')} /> : null}
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
