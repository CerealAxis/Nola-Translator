import type { ReactNode } from 'react'
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui'
import { actions, stores, useStore } from '@/store'
import { useI18n } from '@/i18n'
import { modelEngines, translationEngine } from '../../../shared/model-engines'
import { NO_TRANSLATION_LANGUAGE } from '../../../shared/settings'

/** A runtime component that is not ready. */
export interface RuntimeIssue {
  kind: 'engine' | 'llama' | 'crisp'
  /** Why the probe failed, when it reported one. The dialog falls back to its own copy. */
  reason?: string
}

export interface RuntimeNoticeDialogProps {
  issues: readonly RuntimeIssue[]
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  /** Opens the settings page for one component. Called once per issue, in the order of `issues`. */
  onOpenSettings: (component: RuntimeIssue['kind']) => void
  onDismiss: () => void
}

export function RuntimeNoticeDialog({ issues, isOpen, onOpenChange, onOpenSettings, onDismiss }: RuntimeNoticeDialogProps): ReactNode {
  const { t } = useI18n()
  const firstIssue = issues[0]
  const componentName = (kind: RuntimeIssue['kind']) => t(kind === 'engine' ? 'runtime.pytorch' : kind === 'llama' ? 'runtime.llama' : 'runtime.crisp')
  const openSettings = () => {
    if (!firstIssue) return
    onOpenChange(false)
    onOpenSettings(firstIssue.kind)
  }
  return <Dialog open={isOpen} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle data-slot="dialog-title">{t('runtime.noticeTitle')}</DialogTitle>
      </DialogHeader>
      <div className="nola-body flex flex-col gap-2 text-muted">
        <p>{t('runtime.missingComponents', { components: issues.map(issue => componentName(issue.kind)).join(' · ') })}</p>
        <p>{t('runtime.noticeBody')}</p>
      </div>
      <DialogFooter>
        <Button onClick={openSettings} disabled={!firstIssue}>{t('runtime.openSettings')}</Button>
        <Button variant="tertiary" onClick={() => { onOpenChange(false); onDismiss() }}>{t('runtime.close')}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}

export function RuntimeNotice() {
  const { runtimes, runtimeNoticeDismissed, settings, onboardingActive, onboardingAutoAttempted } = useStore(stores.settings, state => state)
  const deferForTour = onboardingActive || (!!settings && !settings.onboardingSeen && !onboardingAutoAttempted)
  const resources = useStore(stores.models, state => state.resources)
  const modelId = settings?.translation.localModelId
  const model = resources.find(resource => resource.resourceId === modelId)
  const recognitionModel = resources.find(resource => resource.resourceId === settings?.recognition.modelId)
  const recognitionLoader = recognitionModel ? modelEngines(recognitionModel)[0] : undefined
  const usesLocalTranslation = settings?.translation.provider === 'local'
    && settings.translation.targetLanguage !== NO_TRANSLATION_LANGUAGE
  const selectedTranslationEngine = settings ? translationEngine(settings.compute, model?.provider, modelId) : 'llama'
  const needsTorch = (settings?.recognition.provider === 'local' && recognitionLoader === 'pytorch')
    || (usesLocalTranslation && selectedTranslationEngine === 'pytorch')
  const needsLlama = (settings?.recognition.provider === 'local' && recognitionLoader === 'llama')
    || (usesLocalTranslation && selectedTranslationEngine === 'llama')
  const needsCrisp = settings?.recognition.provider === 'local' && recognitionLoader === 'crisp'
  const issues: RuntimeIssue[] = runtimes
    ? (['engine', 'llama', 'crisp'] as const)
      .filter(kind => (kind === 'engine' ? needsTorch : kind === 'llama' ? needsLlama : needsCrisp) && runtimes.local[kind]?.status !== 'ready')
      .map(kind => ({ kind, reason: runtimes.local[kind]?.reason }))
    : []
  return <RuntimeNoticeDialog
    issues={issues}
    isOpen={issues.length > 0 && !runtimeNoticeDismissed && !deferForTour}
    onOpenChange={open => { if (!open) actions.settings.dismissRuntimeNotice() }}
    onOpenSettings={component => { void actions.settings.openRuntimeSettings(component) }}
    onDismiss={() => actions.settings.dismissRuntimeNotice()}
  />
}
