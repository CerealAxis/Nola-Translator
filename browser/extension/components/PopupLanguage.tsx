import { Combobox, ComboboxTrigger, ComboboxInput, ComboboxContent, ComboboxList, ComboboxItem, ComboboxEmpty } from '../../../src/renderer/components/ui/combobox'
import type { ChoiceOption } from './ChoiceField'
import type { browserText } from '../i18n'
import { usePortalContainer } from './usePortalContainer'

export function PopupLanguage({ label, value, options, onChange, t, disabled, size = 'default' }: { label: string; value: string; options: ChoiceOption[]; onChange(value: string): void; t: ReturnType<typeof browserText>; disabled?: boolean; size?: 'default' | 'sm' }) {
  const [container, containerRef] = usePortalContainer()
  const selected = options.find(option => option.value === value) ?? options[0]
  return <Combobox disabled={disabled} items={options} value={selected} onValueChange={option => { if (option) onChange(option.value) }} itemToStringLabel={option => option.label} isItemEqualToValue={(a, b) => a.value === b.value}>
    <ComboboxTrigger className="nola-popup-language-card" data-size={size} aria-label={label} title={selected?.label}>
      <span><strong>{selected?.label}</strong><small>{label}</small></span>
    </ComboboxTrigger>
    <div ref={containerRef} className="nola-portal-container" />
    {container && <ComboboxContent container={container} className="nola-popup-language-list">
      <ComboboxInput aria-label={t('searchLanguages')} placeholder={t('searchLanguages')} />
      <ComboboxEmpty>{t('noLanguages')}</ComboboxEmpty>
      <ComboboxList>{(option: ChoiceOption) => <ComboboxItem key={option.value} value={option} disabled={option.disabled}>{option.label}</ComboboxItem>}</ComboboxList>
    </ComboboxContent>}
  </Combobox>
}
