import { useEffect, useRef, useState } from 'react'
import { configurationOf, supportsTranslation } from '../../../shared/model-capabilities'
import { DEFAULT_COMPUTE_SETTINGS } from '../../../shared/compute'
import { actions, stores, useStore } from '@/store'
import { NO_TRANSLATION_LANGUAGE } from '@/bridge'
import { targetLanguagePatch } from '@/session-config'
import { TranslationCompatibilityDialog } from './TranslationCompatibilityDialog'
import { ModelConfigurationDialog } from './ModelConfigurationDialog'

/** User changes are handled here; detected speech never changes the saved language pair. */
export function ModelCapabilityNotices() {
  const settings = useStore(stores.settings, state => state.settings)
  const resources = useStore(stores.models, state => state.resources)
  const status = useStore(stores.session, state => state.status)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [configurationQueue, setConfigurationQueue] = useState<string[]>([])
  const previous = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (resources.length === 0) return
    const installed = new Set(resources.filter(record => record.installed).map(record => record.resourceId))
    const justInstalled = previous.current ? resources.filter(record => record.installed && record.resourceId.startsWith('hub:') && !configurationOf(record) && !previous.current?.has(record.resourceId)).map(record => record.resourceId) : []
    previous.current = installed
    if (justInstalled.length > 0) setConfigurationQueue(queue => [...new Set([...queue, ...justInstalled])])
  }, [resources])
  if (!settings) return null
  const configuring = resources.find(record => record.resourceId === configurationQueue[0])
  const recognition = resources.find(record => record.resourceId === settings.recognition.modelId)
  const translation = resources.find(record => record.resourceId === settings.translation.localModelId)
  const source = settings.recognition.sourceLanguage, target = settings.translation.targetLanguage
  const signature = `${translation?.resourceId}|${source}|${target}`
  const incompatible = settings.translation.provider === 'local' && target !== NO_TRANSLATION_LANGUAGE && !!configurationOf(translation) && !supportsTranslation(translation, source, target)
  const idle = status === 'idle' || status === 'error'
  return <>
    {configuring && idle ? <ModelConfigurationDialog key={configuring.resourceId} record={configuring} onClose={() => setConfigurationQueue(queue => queue.slice(1))} /> : null}
    <TranslationCompatibilityDialog key={signature} isOpen={idle && incompatible && signature !== dismissed && !configuring} onClose={() => setDismissed(signature)}
      source={source} target={target} recognition={recognition} translation={translation} resources={resources} compute={settings.compute ?? DEFAULT_COMPUTE_SETTINGS}
      onChangeSource={sourceLanguage => { void actions.settings.updateSettings({ recognition: { sourceLanguage } }).catch(() => undefined) }}
      onChangeModel={localModelId => { void actions.settings.updateSettings({ translation: { localModelId } }).catch(() => undefined) }}
      onDisableTranslation={() => { void actions.settings.updateSettings(targetLanguagePatch(NO_TRANSLATION_LANGUAGE, target)).catch(() => undefined) }} />
  </>
}
