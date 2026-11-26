import { useEffect, useState, type ReactNode } from 'react'
import { Crop, Play, Square, MoreHorizontal } from 'lucide-react'
import { PageHeader } from '@/components/primitives'
import { LanguageDirectionSelect } from '@/components/primitives/LanguageDirectionSelect'
import { notifyError } from '@/components/primitives/notify'
import { Button } from '@/components/ui/button'
import { Menu } from '@base-ui/react/menu'
import { z } from 'zod'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogCloseButton } from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useI18n } from '@/i18n'
import { TextProcessingSceneField } from '../../settings/text-processing/TextProcessingSceneField'
import { DemoScene, type Region } from './DemoScene'
import { pageText } from './page-copy'
import { sampleLanguages, sampleLine, type CapabilityState, type SampleLanguage } from './session'

const processes = [
  { id: 'lantern', name: 'Lantern Letters', exe: 'LanternLetters.exe' },
  { id: 'ppsspp', name: 'Glass Harbor Portable', exe: 'PPSSPPWindows64.exe' },
  { id: 'vita', name: 'Lantern Letters', exe: 'Vita3K.exe' },
  { id: 'ps2', name: 'Lantern Letters', exe: 'pcsx2-qt.exe' },
  { id: 'ps3', name: 'Lantern Letters', exe: 'rpcs3.exe' },
  { id: 'eden', name: 'Lantern Letters', exe: 'eden.exe' },
  { id: 'citron', name: 'Lantern Letters', exe: 'citron.exe' },
]

const presetKey = 'nola:game-area-presets:v1'
const regionSchema = z.object({ x: z.number().min(0).max(460), y: z.number().min(0).max(208), width: z.number().positive().max(460), height: z.number().positive().max(208) }).refine(r => r.x + r.width <= 460 && r.y + r.height <= 208)
const presetSchema = z.array(z.object({ id: z.string(), name: z.string().trim().min(1).max(80), regions: z.array(regionSchema).min(1) }))
type AreaPreset = z.infer<typeof presetSchema>[number]
function loadPresets(): AreaPreset[] {
  try { return presetSchema.parse(JSON.parse(localStorage.getItem(presetKey) ?? '[]')) } catch { return [] }
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return <FieldGroup className="nola-settings-fields" role="region" aria-label={title}>
    <h2 className="nola-settings-heading">{title}</h2>{children}
  </FieldGroup>
}

export default function GameTranslationDemoPage({ capability = 'ready' }: { capability?: CapabilityState } = {}) {
  const { t, language } = useI18n()
  const label = (key: Parameters<typeof pageText>[1]) => pageText(language, key)
  const [source, setSource] = useState('hook')
  const [process, setProcess] = useState('')
  const [running, setRunning] = useState(false)
  const [from, setFrom] = useState<SampleLanguage | 'auto'>('auto')
  const [to, setTo] = useState<SampleLanguage>('zh')
  const [captureMode, setCaptureMode] = useState('regions')
  const [method, setMethod] = useState('period')
  const [interval, setIntervalMs] = useState(600)
  const [threshold, setThreshold] = useState(3)
  const [regions, setRegions] = useState<Region[]>([])
  const [presets, setPresets] = useState(loadPresets)
  const [presetId, setPresetId] = useState('draft')
  const [presetDialog, setPresetDialog] = useState<'save' | 'rename' | 'delete'>()
  const [presetName, setPresetName] = useState('')
  const [intervalDraft, setIntervalDraft] = useState<string | null>(null)
  const selectedPreset = presets.find(item => item.id === presetId)
  const dirty = !!selectedPreset && JSON.stringify(selectedPreset.regions) !== JSON.stringify(regions)
  function openPreset(action: 'save' | 'rename' | 'delete') {
    setPresetName(selectedPreset?.name ?? '')
    setPresetDialog(action)
  }
  function commitPreset(copy = false) {
    const name = presetName.trim()
    const id = copy ? crypto.randomUUID() : selectedPreset?.id ?? crypto.randomUUID()
    if (presetDialog !== 'delete' && presets.some(item => item.id !== id && item.name === name)) {
      notifyError(t('screen.presetNameExists')); return
    }
    const next = presetDialog === 'delete' ? presets.filter(item => item.id !== presetId)
      : [...presets.filter(item => item.id !== id), { id, name, regions: presetDialog === 'rename' ? selectedPreset!.regions : regions }]
    try { localStorage.setItem(presetKey, JSON.stringify(presetSchema.parse(next))) }
    catch { notifyError(t('screen.presetFailed')); return }
    setPresets(next)
    setPresetId(presetDialog === 'delete' ? 'draft' : id)
    setPresetDialog(undefined)
  }
  const [capture, setCapture] = useState<{ id: number; kind: 'ocr' } | null>(null)
  const [step, setStep] = useState(0)
  const selected = processes.find(item => item.id === process)
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setStep(value => value + 1), source === 'ocr' && method === 'period' ? Math.max(1500, interval) : 3500)
    return () => window.clearInterval(timer)
  }, [running, source, method, interval])
  const choose = (id: string, title: string, value: string, items: { value: string; label: string }[], change: (value: string) => void) => <Field className="nola-settings-field">
    <FieldLabel htmlFor={id}>{title}</FieldLabel>
    <Select value={value} items={items} disabled={running} onValueChange={next => { if (next) change(next) }}>
      <SelectTrigger id={id}><SelectValue /></SelectTrigger>
      <SelectContent><SelectGroup>{items.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
    </Select>
  </Field>
  const software = <Field className="nola-settings-field"><FieldLabel htmlFor="game-software">{label('software')}</FieldLabel>
    <Select value={process} disabled={running} items={processes.map(item => ({ value: item.id, label: item.name + ' · ' + item.exe }))} onValueChange={next => { if (next) setProcess(next) }}>
      <SelectTrigger id="game-software"><SelectValue placeholder={label('selectSoftware')} /></SelectTrigger>
      <SelectContent><SelectGroup>{processes.map(item => <SelectItem key={item.id} value={item.id}>
        {item.name} · {item.exe}
      </SelectItem>)}</SelectGroup></SelectContent>
    </Select>
  </Field>
  const number = (id: string, title: string, value: number, min: number, change: (value: number) => void) => <Field className="nola-settings-field">
    <FieldLabel htmlFor={id}>{title}</FieldLabel><Input id={id} type="number" min={min} max={100000} disabled={running} defaultValue={value}
      onBlur={event => { const next = Number(event.target.value); const valid = event.target.value.trim() && Number.isInteger(next) && next >= min && next <= 100000; if (valid) change(next); else event.target.value = String(value) }} />
  </Field>
  function start() {
    if (running) { setRunning(false); return }
    if ((source === 'hook' || captureMode === 'window') && !selected) { notifyError(label('selectSoftware')); return }
    if (source === 'ocr' && captureMode === 'regions' && !regions.length) { notifyError(label('range')); return }
    if (capability !== 'ready') { notifyError(label(capability)); return }
    setStep(0)
    setRunning(true)
  }
  const dialogue = sampleLine(step, from, to)
  return <div className="screen-page game-translation-page" data-slot="game-page">
    <PageHeader title={t('suite.gameTitle')} actions={<Button variant={running ? 'danger' : 'default'} onClick={start}>
      {running ? <Square data-icon="inline-start" /> : <Play data-icon="inline-start" />}{t(running ? 'screen.stop' : 'screen.start')}
    </Button>} />
    <DemoScene source={source === 'hook' ? 'hook' : 'ocr'} gameName={selected?.name} active={false} paused={!running}
      line={{ original: '', translation: '' }} dialogue={dialogue} showOriginal showTranslation embedded={false} targetLanguage={to}
      fontSize={18} originalFontSize={16} onAdvance={() => setStep(value => value + 1)} simplified
      onSelectionEnd={() => setCapture(null)} savedRegions={regions} onRegionsChange={value => { setRegions(value); setCapture(null) }}
      onCapture={() => setCapture(null)} captureRequest={capture} />
    <Card className="nola-section-card nola-settings-card" data-slot="game-settings"><CardContent className="nola-settings-content">
      <Group title={t('screen.translationSettings')}>
        {choose('game-input-source', label('source'), source, [{ value: 'hook', label: 'Hook' }, { value: 'ocr', label: 'OCR' }], value => { setSource(value); setCapture(null) })}
        <Field className="nola-settings-field nola-language-pair-field"><FieldLabel>{t('shellUi.languageDirection')}</FieldLabel>
          <LanguageDirectionSelect source={from} target={to} sourceCodes={['auto', ...sampleLanguages]} targetCodes={sampleLanguages} disabled={running}
            onSourceChange={value => setFrom(value as typeof from)} onTargetChange={value => setTo(value as SampleLanguage)}
            onSwap={from === 'auto' ? undefined : () => { setFrom(to); setTo(from) }} />
        </Field>
        <TextProcessingSceneField scene="game:translation" disabled={running} />
      </Group>
      {source === 'hook' ? <Group title={label('hookSettings')}>
        {software}
      </Group> : <Group title={t('screen.ocrSettings')}>
        {choose('game-capture-mode', t('suite.captureMode'), captureMode, ['cursor', 'regions', 'window'].map(value => ({ value, label: t(`suite.${value as 'cursor' | 'regions' | 'window'}`) })), value => { setCaptureMode(value); setCapture(null) })}
        {captureMode === 'window' && software}
        {captureMode === 'regions' && <Field className="nola-settings-field"><FieldLabel htmlFor="game-preset">{t('screen.regions')}</FieldLabel>
          <div className="nola-inline-field-controls screen-region-controls">
            <Select value={presetId} disabled={running || !!capture} onValueChange={id => {
              if (!id) return
              setPresetId(id)
              setRegions(presets.find(item => item.id === id)?.regions ?? [])
            }}>
              <SelectTrigger id="game-preset"><SelectValue>{selectedPreset ? selectedPreset.name + (dirty ? ` · ${t('screen.presetModified')}` : '') : t('screen.presetDraft')}</SelectValue></SelectTrigger>
              <SelectContent><SelectGroup><SelectItem value="draft">{t('screen.presetDraft')}</SelectItem>{presets.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
            <Button variant="bare" size="icon-sm" disabled={running || !!capture} aria-label={t('screen.edit')} tooltip={t('screen.edit')} onClick={() => setCapture({ id: Date.now(), kind: 'ocr' })}><Crop /></Button>
            <Menu.Root>
              <Menu.Trigger render={<Button variant="bare" size="icon-sm" disabled={running || !!capture} aria-label={t('screen.presetManage')} tooltip={t('screen.presetManage')}><MoreHorizontal /></Button>} />
              <Menu.Portal><Menu.Positioner className="z-dropdown" align="end" sideOffset={4}>
                <Menu.Popup data-slot="dropdown-menu-content" className="min-w-40 rounded-nola-ui-xl bg-overlay p-1 text-overlay-foreground shadow-overlay">
                  <Menu.Item className="nola-menu-item" disabled={!regions.length} onClick={() => openPreset('save')}>{t('screen.presetSave')}</Menu.Item>
                  {selectedPreset && <><Menu.Item className="nola-menu-item" onClick={() => openPreset('rename')}>{t('screen.presetRename')}</Menu.Item>
                    <Menu.Item className="nola-menu-item" onClick={() => openPreset('delete')}>{t('screen.presetDelete')}</Menu.Item></>}
                </Menu.Popup>
              </Menu.Positioner></Menu.Portal>
            </Menu.Root>
          </div>
        </Field>}
        {choose('game-ocr-mode', t('screen.ocrMode'), method, [{ value: 'period', label: t('screen.ocrPeriod') }, { value: 'analysis', label: t('screen.ocrAnalysis') }, { value: 'trigger', label: t('screen.ocrTrigger') }], setMethod)}
        {method === 'period' && <Field className="nola-settings-field"><FieldLabel htmlFor="game-interval">{label('interval')}</FieldLabel>
          <Input id="game-interval" type={intervalDraft === null ? 'text' : 'number'} inputMode="numeric" min={100} max={100000} step={100} disabled={running}
            value={intervalDraft ?? `${interval} ms`} onFocus={() => setIntervalDraft(String(interval))} onChange={event => setIntervalDraft(event.target.value)}
            onBlur={event => { const value = Number(event.target.value); if (event.target.value.trim() && Number.isInteger(value) && value >= 100 && value <= 100000) setIntervalMs(value); setIntervalDraft(null) }}
            onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.value = String(interval); event.currentTarget.blur() } }} />
        </Field>}
        {number('game-threshold', t('screen.textChangeThreshold'), threshold, 0, setThreshold)}
      </Group>}
    </CardContent></Card>
    <Dialog open={!!presetDialog} onOpenChange={open => { if (!open) setPresetDialog(undefined) }}>
      <DialogContent><DialogHeader><DialogTitle>{t(presetDialog === 'delete' ? 'screen.presetDelete' : presetDialog === 'rename' ? 'screen.presetRename' : 'screen.presetSave')}</DialogTitle><DialogCloseButton /></DialogHeader>
        {presetDialog === 'delete' ? <p>{selectedPreset?.name}</p> : <Field><FieldLabel htmlFor="game-preset-name">{t('screen.presetName')}</FieldLabel>
          <Input id="game-preset-name" value={presetName} maxLength={80} onChange={event => setPresetName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && presetName.trim()) commitPreset() }} /></Field>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setPresetDialog(undefined)}>{t('screen.cancel')}</Button>
          {presetDialog === 'save' && selectedPreset && <Button variant="secondary" disabled={!presetName.trim()} onClick={() => commitPreset(true)}>{t('screen.presetSaveAs')}</Button>}
          <Button variant={presetDialog === 'delete' ? 'danger' : 'default'} disabled={presetDialog !== 'delete' && !presetName.trim()} onClick={() => commitPreset()}>{t(presetDialog === 'delete' ? 'screen.presetDelete' : presetDialog === 'rename' ? 'screen.presetRename' : selectedPreset ? 'screen.presetUpdate' : 'screen.presetSave')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>
}
