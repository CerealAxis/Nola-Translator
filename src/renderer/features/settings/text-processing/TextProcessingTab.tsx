import { useEffect, useId, useMemo, useState } from 'react'
import { GripVertical, Settings2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Field, FieldLabel } from '@/components/ui/field'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { notifyError } from '@/components/primitives/notify'
import { useI18n, type TranslationKey } from '@/i18n'
import type { Route, TextProcessingLibrary } from '@/routes'
import { getBridge } from '@/store'
import type { GlossaryDocument } from '../../../../shared/glossary'
import { SettingGroup, SettingSwitch } from '../SettingsPage'
import { SettingsRow } from '../SettingsRow'
import { GlossaryTab } from '../glossary/GlossaryTab'
import { WordRulesTab } from '../word-rules/WordRulesTab'
import { useWordRules } from '../word-rules/useWordRules'
import { FeatureOptionDialog } from './FeatureOptionDialog'
import { ProcessingIconButton, ProcessingPageHeading, textProcessingPath } from './ProcessingPage'
import { TextProcessingEditor } from './TextProcessingEditor'
import { runPreprocessingPreview } from './text-processing-engine'
import { optimization, preprocessing, vndb, type ProcessingFeature } from './text-processing-features'
import { readPreviewSetting, usePreviewSetting, useProcessingPreview, useTextProcessingReady, writePreviewSetting, type FeatureOptions, type RuleTable } from './text-processing-preview'

const libraryLabels = {
  glossary: 'suite.glossaryTitle',
  'preserve-words': 'suite.preserveWords',
  'subtitle-words': 'suite.subtitleBlockedWords',
} satisfies Record<TextProcessingLibrary, TranslationKey>

const SIMPLE_DIALOG_EDITORS = new Set<ProcessingFeature['editor']>(['normalize', 'lines', 'repeat', 'vndb'])

function useFeatureSummary() {
  const { t } = useI18n()
  return (feature: ProcessingFeature): string | null => {
    if (feature.id === 'normalize') {
      const options = readPreviewSetting<FeatureOptions>('options:normalize', { form: 'NFKC' })
      return options.form ?? 'NFKC'
    }
    if (feature.id === 'lines') {
      const options = readPreviewSetting<FeatureOptions>('options:lines', { count: '1', keepEnd: true })
      const count = options.count || '1'
      return t(options.keepEnd ?? true ? 'suite.textLinesTail' : 'suite.textLinesHead', { count })
    }
    if (feature.id === 'repeat-chars' || feature.id === 'repeat-block') {
      const options = readPreviewSetting<FeatureOptions>('options:' + feature.id, { count: '1' })
      const count = Number(options.count || '1')
      return count <= 1 ? t('suite.textRepeatAuto') : t('suite.textRepeatTimes', { count })
    }
    if (feature.editor === 'replace') {
      const tables = readPreviewSetting<RuleTable[]>('tables:' + feature.id, [])
      if (!tables.length) return t('suite.textNotConfigured')
      const rules = tables.reduce((sum, table) => sum + table.rules.length, 0)
      return t('suite.textTablesSummary', { tables: tables.length, rules })
    }
    if (feature.editor === 'script') {
      const script = readPreviewSetting<string | null>('script:' + feature.id, null)
      return script?.trim() ? t('suite.textScriptCustom') : t('suite.textScriptTemplate')
    }
    if (feature.id === 'vndb') {
      const options = readPreviewSetting<FeatureOptions>('options:vndb', {})
      return options.vndbId?.trim() || null
    }
    return null
  }
}

function LibraryRows() {
  const { t } = useI18n()
  const glossary = getBridge()?.glossary
  const [document, setDocument] = useState<GlossaryDocument>()
  const { api, document: words, failed, refresh } = useWordRules()
  const [busy, setBusy] = useState({ glossary: false, words: false })

  useEffect(() => {
    if (!glossary) return
    let active = true
    const load = () => {
      void glossary.snapshot().then(value => {
        if (active) setDocument(current => !current || value.revision >= current.revision ? value : current)
      }).catch(() => undefined)
    }
    load()
    const unsubscribe = glossary.onChanged(load)
    return () => { active = false; unsubscribe() }
  }, [glossary])

  async function toggle(library: TextProcessingLibrary, enabled: boolean) {
    const group = library === 'glossary' ? 'glossary' : 'words'
    setBusy(current => ({ ...current, [group]: true }))
    const operationId = crypto.randomUUID()
    try {
      if (library === 'glossary' && glossary && document) {
        const updated = await glossary.command({
          operationId, expectedRevision: document.revision, command: { action: 'setEnabled', enabled },
        })
        setDocument(current => !current || updated.revision >= current.revision ? updated : current)
      } else if (api) {
        await api.command({
          operationId, expectedRevision: words.revision,
          command: { action: 'setEnabled', kind: library === 'preserve-words' ? 'preserve' : 'mask', enabled },
        })
        await refresh()
      }
    } catch (cause) {
      notifyError(t('suite.actionFailed'), { cause })
    } finally {
      setBusy(current => ({ ...current, [group]: false }))
    }
  }

  return Object.entries(libraryLabels).map(([raw, title]) => {
    const library = raw as TextProcessingLibrary
    const label = t(title)
    const checked = library === 'glossary' ? document?.enabled
      : library === 'preserve-words' ? words.preserveEnabled : words.maskEnabled
    const count = library === 'glossary'
      ? document?.libraries.length ?? 0
      : words.libraries.filter(item => item.kind === (library === 'preserve-words' ? 'preserve' : 'mask')).length
    return (
      <SettingsRow key={library} label={
        <span className="inline-flex flex-wrap items-center gap-2">
          <span>{label}</span>
          <Badge variant="secondary">{t('suite.textLibrariesSummary', { count })}</Badge>
        </span>
      }>
        <ProcessingIconButton label={t('suite.textOptions') + ' ' + label}
          nativeButton={false} render={<a href={textProcessingPath + '/' + library} />}>
          <Settings2 />
        </ProcessingIconButton>
        <SettingSwitch ariaLabel={label} isSelected={checked ?? false}
          isDisabled={busy[library === 'glossary' ? 'glossary' : 'words'] || (library === 'glossary' ? !document : !api || failed)}
          onChange={value => void toggle(library, value)} />
      </SettingsRow>
    )
  })
}

const optimizePath = textProcessingPath + '/optimization'

export function TextProcessingTab({ route }: { route: Route }) {
  const { t } = useI18n()
  const previewInputId = useId()
  const previewOutputId = useId()
  const ready = useTextProcessingReady()
  const [enabled, saveEnabled] = usePreviewSetting<Record<string, boolean>>('enabled', {})
  const [rank, saveRank] = usePreviewSetting<string[]>('rank', [])
  const [activeDialogFeature, setActiveDialogFeature] = useState<ProcessingFeature | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; position: 'before' | 'after' } | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [sampleInput, setSampleInput] = useState('')
  const summarize = useFeatureSummary()

  const order = [...rank.filter(id => preprocessing.some(feature => feature.id === id)),
    ...preprocessing.map(feature => feature.id).filter(id => !rank.includes(id))]
  const library = route.textProcessingLibrary
  const featureId = route.textProcessingFeature

  const optionsMap = useMemo(() => {
    const map: Record<string, FeatureOptions | undefined> = {}
    for (const feature of preprocessing) {
      if (feature.editor && feature.editor !== 'replace' && feature.editor !== 'script') {
        map[feature.id] = readPreviewSetting<FeatureOptions>('options:' + feature.id, {})
      }
    }
    return map
  }, [activeDialogFeature])

  const replaceTables = useMemo(() => {
    return readPreviewSetting<RuleTable[]>('tables:replace', [])
  }, [activeDialogFeature])

  const sandboxOutput = useProcessingPreview(sampleInput,
    () => runPreprocessingPreview(sampleInput, order, enabled, optionsMap, replaceTables))

  if (!ready) return <Spinner />
  if (library === 'glossary') return <GlossaryTab libraryId={route.glossaryLibraryId} />
  if (library) {
    return <WordRulesTab key={library} kind={library === 'preserve-words' ? 'preserve' : 'mask'}
      libraryId={route.glossaryLibraryId} />
  }
  if (featureId) {
    const pre = preprocessing.find(item => item.id === featureId)
    const feature = pre ?? [...optimization, vndb].find(item => item.id === featureId)
    const back = pre ? textProcessingPath : optimizePath
    const sectionLabel = t(pre ? 'suite.textPreprocess' : 'suite.textOptimize')
    return feature?.editor ? (
      <TextProcessingEditor feature={feature} back={back} sectionLabel={sectionLabel} tableId={route.textProcessingTableId} />
    ) : (
      <ProcessingPageHeading title={t('suite.notFound')} back={textProcessingPath} />
    )
  }

  function move(index: number, target: number) {
    if (index === target || index < 0 || target < 0 || target >= order.length) return
    const next = [...order]
    const [id] = next.splice(index, 1)
    next.splice(target, 0, id)
    saveRank(next)
    setAnnouncement(t('suite.textMovedToPosition', { position: target + 1 }))
  }

  function handleDrop(targetId: string, position: 'before' | 'after') {
    if (!draggingId || draggingId === targetId) return
    const from = order.indexOf(draggingId)
    const toBase = order.indexOf(targetId)
    if (from === -1 || toBase === -1) return
    let to = position === 'after' ? toBase + 1 : toBase
    if (from < to) to -= 1
    move(from, to)
    setDraggingId(null)
    setDropTarget(null)
  }

  function renderFeatureAction(feature: ProcessingFeature, label: string) {
    if (!feature.editor) return null
    if (SIMPLE_DIALOG_EDITORS.has(feature.editor)) {
      return (
        <Tooltip>
          <TooltipTrigger render={
            <ProcessingIconButton label={t('suite.textOptions') + ' ' + label}
              onClick={() => setActiveDialogFeature(feature)}>
              <Settings2 />
            </ProcessingIconButton>
          } />
          <TooltipContent>{t('suite.textOptions')}</TooltipContent>
        </Tooltip>
      )
    }
    return (
      <Tooltip>
        <TooltipTrigger render={
          <ProcessingIconButton label={t('suite.textOptions') + ' ' + label}
            nativeButton={false} render={<a href={textProcessingPath + '/config/' + feature.id} />}>
            <Settings2 />
          </ProcessingIconButton>
        } />
        <TooltipContent>{t('suite.textOptions')}</TooltipContent>
      </Tooltip>
    )
  }

  function row(feature: ProcessingFeature, index?: number) {
    const label = t(feature.label)
    const summary = summarize(feature)
    const isPreprocess = index !== undefined
    const isDragging = draggingId === feature.id
    const dropPos = dropTarget?.id === feature.id ? dropTarget.position : undefined
    const tooltipDesc = feature.id === 'skip-punctuation'
      ? t('suite.textSkipPunctuationDesc')
      : feature.id === 'arabic'
        ? t('suite.textArabicDesc')
        : undefined

    const labelNode = (
      <span className="inline-flex flex-wrap items-center gap-2">
        {isPreprocess && (
          <Tooltip>
            <TooltipTrigger render={
              <button
                type="button"
                className="processing-drag-handle"
                aria-label={t('suite.textDragReorder') + ' ' + label}
                onKeyDown={event => {
                  if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    move(index, index - 1)
                  } else if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    move(index, index + 1)
                  }
                }}
              >
                <GripVertical aria-hidden="true" />
              </button>
            } />
            <TooltipContent>{t('suite.textDragReorder')}</TooltipContent>
          </Tooltip>
        )}
        <span>{label}</span>
        {summary && <Badge variant="secondary">{summary}</Badge>}
      </span>
    )

    const content = (
      <SettingsRow
        key={isPreprocess ? undefined : feature.id}
        label={labelNode}
        desc={tooltipDesc ?? feature.example}
        descriptionTooltip={Boolean(tooltipDesc ?? feature.example)}
        className={isPreprocess ? 'processing-sortable-row' : undefined}
      >
        {renderFeatureAction(feature, label)}
        {feature.id !== 'vndb' && (
          <SettingSwitch
            ariaLabel={label}
            isSelected={enabled[feature.id] ?? false}
            onChange={checked => saveEnabled({ ...enabled, [feature.id]: checked })}
          />
        )}
      </SettingsRow>
    )

    if (!isPreprocess) return content

    return (
      <div
        key={feature.id}
        draggable
        data-dragging={isDragging || undefined}
        data-drop-position={dropPos}
        className="processing-sortable-item"
        onDragStart={event => {
          setDraggingId(feature.id)
          event.dataTransfer.effectAllowed = 'move'
          event.dataTransfer.setData('text/plain', feature.id)
        }}
        onDragOver={event => {
          if (!draggingId || draggingId === feature.id) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
          const rect = event.currentTarget.getBoundingClientRect()
          const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
          setDropTarget(current =>
            current?.id === feature.id && current.position === position ? current : { id: feature.id, position },
          )
        }}
        onDragLeave={() => {
          setDropTarget(current => current?.id === feature.id ? null : current)
        }}
        onDrop={event => {
          event.preventDefault()
          const rect = event.currentTarget.getBoundingClientRect()
          const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
          handleDrop(feature.id, position)
        }}
        onDragEnd={() => {
          setDraggingId(null)
          setDropTarget(null)
        }}
      >
        {content}
      </div>
    )
  }

  return (
    <>
      <Tabs value={route.textProcessingSection ?? 'preprocess'}
        onValueChange={value => { location.hash = value === 'optimization' ? optimizePath : textProcessingPath }}>
        <TabsList className="text-processing-tabs">
          <TabsTrigger value="preprocess">{t('suite.textPreprocess')}</TabsTrigger>
          <TabsTrigger value="optimization">{t('suite.textOptimize')}</TabsTrigger>
        </TabsList>
        <TabsContent value="preprocess" className="text-processing-panel">
          <div className="settings-panel">
            <div className="sr-only" aria-live="polite">{announcement}</div>
            <SettingGroup legend={t('suite.textSteps')} legendHint={<span className="type-muted">{t('suite.textReorderHint')}</span>}>
              {order.map((id, index) => row(preprocessing.find(item => item.id === id)!, index))}
            </SettingGroup>
            <SettingGroup legend={t('suite.textPreviewTest')}>
              <div className="flex flex-col gap-3 pt-2">
                <div className="text-processing-columns">
                  <Field>
                    <FieldLabel htmlFor={previewInputId}>{t('suite.textPreviewInput')}</FieldLabel>
                    <Textarea
                      id={previewInputId}
                      rows={3}
                      placeholder={t('suite.textPreviewInputPlaceholder')}
                      value={sampleInput}
                      onChange={event => setSampleInput(event.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={previewOutputId}>{t('suite.textPreviewOutput')}</FieldLabel>
                    <Textarea id={previewOutputId} rows={3} readOnly value={sandboxOutput} />
                  </Field>
                </div>
              </div>
            </SettingGroup>
          </div>
        </TabsContent>
        <TabsContent value="optimization" className="text-processing-panel">
          <div className="settings-panel">
            <SettingGroup legend={t('suite.textRules')}>
              {optimization.map(item => row(item))}
            </SettingGroup>
            <SettingGroup legend={t('suite.textLibraries')}>
              <LibraryRows />
              {row(vndb)}
            </SettingGroup>
          </div>
        </TabsContent>
      </Tabs>
      <FeatureOptionDialog
        key={activeDialogFeature?.id ?? 'closed'}
        feature={activeDialogFeature}
        open={Boolean(activeDialogFeature)}
        onOpenChange={open => { if (!open) setActiveDialogFeature(null) }}
        onSave={(id, nextOptions) => writePreviewSetting('options:' + id, nextOptions)}
      />
    </>
  )
}
