import { Collapsible } from '@base-ui/react/collapsible'
import { AlignCenter, AlignLeft, AlignRight, Check, ChevronDown, Type, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { ColorPicker } from '@/components/ui/color-picker'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useI18n } from '@/i18n'
import type { ComicRegion } from '../../../shared/comic'

type Style = ComicRegion['style']
type FontSlot = 'toolbar' | 'properties'
type StyleProps = { style: Style; onChange: (style: Style) => void; disabled?: boolean; fontControl: (slot: FontSlot) => ReactNode }

/** A PhotoCraft-style section: divider and disclosure, without a nested card. */
export function ComicPropertiesSection({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return <Collapsible.Root defaultOpen={defaultOpen} className="comic-properties-section">
    <Collapsible.Trigger render={<Button variant="bare" />} className="comic-properties-section__trigger">
      <ChevronDown data-icon="inline-start" aria-hidden="true" />{title}
    </Collapsible.Trigger>
    <Collapsible.Panel className="comic-properties-section__body">{children}</Collapsible.Panel>
  </Collapsible.Root>
}

function StyleSelect({ style, disabled, patch, label }: { style: Style; disabled?: boolean; patch: (value: Partial<Style>) => void; label: string }) {
  const { t } = useI18n()
  return <Select value={style.fontStyle ?? 'normal'} disabled={disabled} onValueChange={value => { if (value === 'normal' || value === 'italic') patch({ fontStyle: value }) }}>
    <SelectTrigger aria-label={label}><SelectValue>{t(style.fontStyle === 'italic' ? 'suite.comicItalic' : 'suite.comicFontRegular')}</SelectValue></SelectTrigger>
    <SelectContent><SelectGroup><SelectItem value="normal">{t('suite.comicFontRegular')}</SelectItem><SelectItem value="italic">{t('suite.comicItalic')}</SelectItem></SelectGroup></SelectContent>
  </Select>
}

function SizeInput({ style, disabled, patch, label }: { style: Style; disabled?: boolean; patch: (value: Partial<Style>) => void; label: string }) {
  const { t } = useI18n()
  return <Input aria-label={label} type="number" min={6} max={2000} placeholder={t('suite.comicAutoFontSize')} value={style.autoFontSize ? '' : style.fontSize} disabled={disabled}
    onChange={event => patch(event.target.value === '' ? { autoFontSize: true } : { autoFontSize: false, fontSize: Math.max(6, Math.min(2000, Number(event.target.value) || 6)) })} />
}

function Alignment({ style, disabled, patch }: { style: Style; disabled?: boolean; patch: (value: Partial<Style>) => void }) {
  const { t } = useI18n()
  return <ToggleGroup aria-label={t('suite.alignment')} value={[style.align]} disabled={disabled} onValueChange={value => { if (value[0]) patch({ align: value[0] as Style['align'] }) }}>
    {([['left', AlignLeft, 'suite.alignLeft'], ['center', AlignCenter, 'suite.alignCenter'], ['right', AlignRight, 'suite.alignRight']] as const).map(([value, Icon, label]) =>
      <ToggleGroupItem key={value} value={value} aria-label={t(label)} title={t(label)}><Icon aria-hidden="true" /></ToggleGroupItem>)}
  </ToggleGroup>
}

function Direction({ style, disabled, patch }: { style: Style; disabled?: boolean; patch: (value: Partial<Style>) => void }) {
  const { t } = useI18n()
  return <Select value={style.direction} disabled={disabled} onValueChange={value => { if (value === 'horizontal' || value === 'vertical-rl') patch({ direction: value }) }}>
    <SelectTrigger aria-label={t('suite.direction')}><SelectValue>{t(style.direction === 'horizontal' ? 'suite.horizontal' : 'suite.vertical')}</SelectValue></SelectTrigger>
    <SelectContent><SelectGroup><SelectItem value="horizontal">{t('suite.horizontal')}</SelectItem><SelectItem value="vertical-rl">{t('suite.vertical')}</SelectItem></SelectGroup></SelectContent>
  </Select>
}

/** Properties for the selected type object or selected characters. */
export function ComicCharacterControls({ style, onChange, disabled, fontControl, childrenTransform }: StyleProps & { childrenTransform?: ReactNode }) {
  const { t } = useI18n()
  const patch = (value: Partial<Style>) => onChange({ ...style, ...value })
  return <div className="comic-properties-content">
    {childrenTransform && <ComicPropertiesSection title={t('suite.comicTransform')} defaultOpen={false}>{childrenTransform}</ComicPropertiesSection>}
    <ComicPropertiesSection title={t('suite.comicTypeCharacter')}>
      <div className="comic-properties-font">{fontControl('properties')}</div>
      <div className="comic-properties-grid">
        <div className="comic-properties-field"><span aria-hidden="true">Tt</span><StyleSelect style={style} disabled={disabled} patch={patch} label={t('suite.comicFontStyle')} /></div>
        <div className="comic-properties-field"><Type aria-hidden="true" /><SizeInput style={style} disabled={disabled} patch={patch} label={t('screen.fontSize')} /></div>
        <div className="comic-properties-field"><span aria-hidden="true">↕</span><Input aria-label={t('suite.comicLineSpacing')} type="number" min={0.5} max={3} step={0.1} value={style.lineSpacing ?? 1} disabled={disabled} onChange={event => patch({ lineSpacing: Math.max(0.5, Math.min(3, Number(event.target.value) || 1)) })} /></div>
        <div className="comic-properties-field"><span aria-hidden="true">W</span><Select value={String(style.fontWeight ?? 400)} disabled={disabled} onValueChange={value => { if (value) patch({ fontWeight: Number(value) }) }}><SelectTrigger aria-label={t('suite.comicFontWeight')}><SelectValue>{style.fontWeight ?? 400}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{[100, 200, 300, 400, 500, 600, 700, 800, 900].map(value => <SelectItem key={value} value={String(value)}>{value}</SelectItem>)}</SelectGroup></SelectContent></Select></div>
        <div className="comic-properties-field comic-properties-field--wide"><span aria-hidden="true">●</span><fieldset disabled={disabled}><ColorPicker label={t('suite.textColor')} value={style.color} presets={[]} onChange={color => patch({ color })} /></fieldset></div>
      </div>
    </ComicPropertiesSection>
    <ComicPropertiesSection title={t('suite.comicTypeParagraph')}>
      <div className="comic-properties-grid"><div className="comic-properties-field comic-properties-field--wide"><Alignment style={style} disabled={disabled} patch={patch} /></div>
        <div className="comic-properties-field comic-properties-field--wide"><Direction style={style} disabled={disabled} patch={patch} /></div></div>
    </ComicPropertiesSection>
    <ComicPropertiesSection title={t('suite.comicTypeOutline')}>
      <div className="comic-properties-grid"><div className="comic-properties-field"><fieldset disabled={disabled}><ColorPicker label={t('suite.comicStrokeColor')} value={style.strokeColor ?? '#ffffff'} presets={[]} onChange={strokeColor => patch({ strokeColor })} /></fieldset></div>
        <div className="comic-properties-field"><span aria-hidden="true">W</span><Input aria-label={t('suite.comicStrokeWidth')} type="number" min={0} max={100} step={0.5} value={style.strokeWidth ?? 0} disabled={disabled} onChange={event => patch({ strokeWidth: Math.max(0, Math.min(100, Number(event.target.value) || 0)) })} /></div></div>
    </ComicPropertiesSection>
  </div>
}

/** Compact options for the active text tool; the parent owns editing and selection state. */
export function ComicTypeOptions({ style, onChange, disabled, fontControl, editing, onCommit, onCancel }: StyleProps & { editing: boolean; onCommit: () => void; onCancel: () => void }) {
  const { t } = useI18n()
  const patch = (value: Partial<Style>) => onChange({ ...style, ...value })
  return <div className="comic-type-options">
    <Direction style={style} disabled={disabled} patch={patch} />{fontControl('toolbar')}
    <StyleSelect style={style} disabled={disabled} patch={patch} label={t('suite.comicFontStyle')} />
    <SizeInput style={style} disabled={disabled} patch={patch} label={t('screen.fontSize')} />
    <Alignment style={style} disabled={disabled} patch={patch} />
    <fieldset disabled={disabled}><ColorPicker label={t('suite.textColor')} value={style.color} presets={[]} onChange={color => patch({ color })} /></fieldset>
    {editing && <><Button variant="bare" size="icon-sm" disabled={disabled} aria-label={t('suite.save')} title={t('suite.save')} onClick={onCommit}><Check /></Button><Button variant="bare" size="icon-sm" disabled={disabled} aria-label={t('screen.cancel')} title={t('screen.cancel')} onClick={onCancel}><X /></Button></>}
  </div>
}
