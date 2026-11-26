import { useI18n } from '@/i18n'
import { Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch, SwitchThumb } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { GlossarySelection } from '../../../../shared/glossary'
import type { WordRuleKind } from '../../../../shared/word-rules'
import { useWordRules } from './useWordRules'
import { useWordRuleText } from './word-rules-copy'

export function WordRuleSelectionField({
  value,
  onChange,
  disabled,
  kind = 'preserve',
  showSettings = true,
  className,
  compact = false,
}: {
  value: GlossarySelection
  onChange: (value: GlossarySelection) => void
  disabled?: boolean
  kind?: WordRuleKind
  showSettings?: boolean
  className?: string
  compact?: boolean
}) {
  const { t } = useI18n(),
    p = useWordRuleText(),
    { document, failed } = useWordRules()
  const libraries = document.libraries.filter((library) => library.kind === kind)
  const settingsHref = `#/settings/${kind === 'preserve' ? 'preserve-words' : 'subtitle-words'}`
  return (
    <Field className={className}>
      <FieldLabel>{p(kind)}</FieldLabel>
      <div className={compact ? 'nola-inline-field-controls' : 'flex min-w-0 flex-wrap gap-2'}>
        <Select
          value={value.mode}
          disabled={disabled}
          onValueChange={(mode) => {
            if (mode === 'auto' || mode === 'off') onChange({ mode })
            else if (mode === 'selected')
              onChange({ mode, libraryIds: value.mode === 'selected' ? value.libraryIds : [] })
          }}
        >
          <SelectTrigger aria-label={p(kind)}>
            <SelectValue>
              {value.mode === 'auto'
                ? t('suite.auto')
                : value.mode === 'off'
                  ? p('off')
                  : p('selected')}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="auto">{t('suite.auto')}</SelectItem>
              <SelectItem value="off">{p('off')}</SelectItem>
              <SelectItem value="selected" disabled={!libraries.length}>
                {p('selected')}
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        {value.mode === 'selected' && (
          <Popover>
            <PopoverTrigger render={<Button variant="secondary" size={compact ? 'icon-sm' : 'sm'} disabled={disabled} aria-label={compact ? t('suite.selectedLibraries', { count: value.libraryIds.length }) : undefined} />}>
              {value.libraryIds.length}
            </PopoverTrigger>
            <PopoverContent>
              {libraries.map((library) => (
                <div className="flex items-center justify-between gap-3" key={library.id}>
                  <span>{library.name}</span>
                  <Switch
                    aria-label={library.name}
                    disabled={!library.enabled}
                    checked={value.libraryIds.includes(library.id)}
                    onCheckedChange={(checked) =>
                      onChange({
                        mode: 'selected',
                        libraryIds: checked
                          ? [...value.libraryIds, library.id]
                          : value.libraryIds.filter((id) => id !== library.id),
                      })
                    }
                  >
                    <SwitchThumb />
                  </Switch>
                </div>
              ))}
            </PopoverContent>
          </Popover>
        )}
        {showSettings && (compact
          ? <Tooltip><TooltipTrigger render={<Button variant="bare" size="icon-sm" nativeButton={false} aria-label={p('settings')} render={<a role="link" href={settingsHref} />}><Settings2 /></Button>} /><TooltipContent>{p('settings')}</TooltipContent></Tooltip>
          : <Button
          variant="secondary"
          size="sm"
          nativeButton={false}
          render={
            <a href={settingsHref} />
          }
        >
          {p('settings')}
        </Button>)}
        {failed && <span role="status">{t('suite.actionFailed')}</span>}
      </div>
    </Field>
  )
}
