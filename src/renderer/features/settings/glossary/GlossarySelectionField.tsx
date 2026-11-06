import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n'
import { getBridge } from '@/store'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch, SwitchThumb } from '@/components/ui/switch'
import type { GlossaryDocument, GlossarySelection } from '../../../../shared/glossary'

export function GlossarySelectionField({ value, onChange, disabled = false, className }: { value: GlossarySelection; onChange: (selection: GlossarySelection) => void; disabled?: boolean; className?: string }) {
  const { t } = useI18n()
  const api = getBridge()?.glossary
  const [document, setDocument] = useState<GlossaryDocument>()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!api) return
    let live = true
    const load = () => { void api.snapshot().then(value => { if (live) { setDocument(previous => !previous || value.revision >= previous.revision ? value : previous); setFailed(false) } }).catch(() => { if (live) setFailed(true) }) }
    load(); const unsubscribe = api.onChanged(load)
    return () => { live = false; unsubscribe() }
  }, [api])
  const labels = { auto: t('suite.auto'), off: t('suite.glossaryOff'), selected: t('suite.chooseLibraries') }
  return <Field className={className}><FieldLabel>{t('suite.glossaryTitle')}</FieldLabel><div className="flex min-w-0 flex-wrap items-center gap-2">
    <Select value={value.mode} disabled={disabled} onValueChange={mode => { if (mode === 'auto' || mode === 'off') onChange({ mode }); else if (mode === 'selected') onChange({ mode, libraryIds: value.mode === 'selected' ? value.libraryIds : [] }) }}>
      <SelectTrigger aria-label={t('suite.glossaryTitle')}><SelectValue>{labels[value.mode]}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="auto">{labels.auto}</SelectItem><SelectItem value="off">{labels.off}</SelectItem><SelectItem value="selected" disabled={!document?.libraries.length}>{labels.selected}</SelectItem></SelectGroup></SelectContent>
    </Select>
    {value.mode === 'selected' && <Popover><PopoverTrigger render={<Button variant="outline" size="sm" disabled={disabled || !document} />}>{t('suite.selectedLibraries', { count: value.libraryIds.length })}</PopoverTrigger><PopoverContent className="flex max-h-80 flex-col gap-3 overflow-y-auto">{document?.libraries.map(library => <div key={library.id} className="flex items-center justify-between gap-3"><span>{library.name}</span><Switch checked={value.libraryIds.includes(library.id)} disabled={disabled || !library.enabled} aria-label={library.name} onCheckedChange={checked => onChange({ mode: 'selected', libraryIds: checked ? [...value.libraryIds, library.id] : value.libraryIds.filter(id => id !== library.id) })}><SwitchThumb /></Switch></div>)}</PopoverContent></Popover>}
    {failed && <span role="status">{t('suite.actionFailed')}</span>}
  </div></Field>
}
