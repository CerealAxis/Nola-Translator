import { useState } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CardContent } from '@/components/ui/card'
import { Dialog, DialogCloseButton, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { useI18n } from '@/i18n'
import { CloudMark } from './ProviderIconPicker'
import { LocalMark } from './LocalPreview'
import { useCloudTemplateName } from './cloud-preview-copy'
import { capabilities, templates, type Capability, type Service } from './cloud-preview-data'
import { engineNames, type Category, type PreviewFamily } from './local-preview-catalog'
import { localSeriesName, modelWorkspaceText } from './preview-copy'

export type ModelType = Category | Capability
const excludedServices = new Set<Service>(['ollama', 'aihubmix', 'mirarouter', 'ssycloud', '302ai', 'ppio', 'tokenpony', 'compshare', 'fastgpt'])
const services = (Object.keys(templates) as Service[]).filter(service => !excludedServices.has(service))

interface SourcePickerProps {
  type: ModelType
  families: readonly PreviewFamily[]
  onCloud: (service: Service, capability: Capability) => void
  onLocal: (family: PreviewFamily) => void
  onClose: () => void
}

export function SourcePicker({ type, families, onCloud, onLocal, onClose }: SourcePickerProps) {
  const { t, language } = useI18n()
  const templateName = useCloudTemplateName()
  const [search, setSearch] = useState('')
  const query = search.trim().toLowerCase()
  const capability = capabilities.find(value => value === type)
  const cloud = capability ? services.filter(service => templates[service].models[capability]
    && [templateName(service), templates[service].name, service].some(value => value.toLowerCase().includes(query))) : []
  const local = families.filter(family => [localSeriesName(language, family.name), ...family.engines.map(engine => engineNames[engine]), ...family.records.map(record => record.name)]
      .some(value => value.toLowerCase().includes(query)))

  return <Dialog open onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent className="model-source-picker" data-onboarding="models-source-picker" initialFocus={false}>
      <DialogHeader><DialogTitle>{modelWorkspaceText(language, 'addSource')}</DialogTitle></DialogHeader>
      <DialogCloseButton data-onboarding="models-source-picker-close" />
      <InputGroup>
        <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
        <InputGroupInput type="search" aria-label={modelWorkspaceText(language, 'search')}
          placeholder={modelWorkspaceText(language, 'search')} value={search} onChange={event => setSearch(event.currentTarget.value)} />
      </InputGroup>
      <CardContent className="model-source-picker__body">
        {local.length > 0 && <section>
          <h3 className="type-body font-semibold">{t('modelsSettingsUi.localModels')}</h3>
          <div className="model-source-picker__grid">
            {local.map(family => {
              const name = localSeriesName(language, family.name)
              return <Button key={family.key} className="model-source-option" variant="secondary"
                data-family={family.key} tooltip={name} onClick={() => onLocal(family)}>
                <LocalMark family={family} /><span>{name}</span>
              </Button>
            })}
          </div>
        </section>}
        {capability && cloud.length > 0 && <section>
          <h3 className="type-body font-semibold">{modelWorkspaceText(language, 'providers')}</h3>
          <div className="model-source-picker__grid">
            {cloud.map(service => {
              const name = templateName(service)
              return <Button key={service} className="model-source-option" variant="secondary"
                data-service={service} tooltip={name} onClick={() => onCloud(service, capability)}>
                <CloudMark service={service} /><span>{name}</span>
              </Button>
            })}
          </div>
        </section>}
        {!local.length && !cloud.length && <p className="model-source-picker__empty type-muted" role="status">{t('models.noResults')}</p>}
      </CardContent>
    </DialogContent>
  </Dialog>
}
