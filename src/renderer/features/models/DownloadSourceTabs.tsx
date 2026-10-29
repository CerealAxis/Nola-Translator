import HuggingFace from '@lobehub/icons/es/HuggingFace/components/Color'
import ModelScope from '@lobehub/icons/es/ModelScope/components/Color'
import type { ReactNode } from 'react'
import { TabsList, TabsRoot, TabsTrigger } from '@/components/ui'
import type { ModelDownloadSource } from '@/bridge'
import type { DownloadSourceOption } from '../../../shared/model-download-sources'

export interface DownloadSourceTabsProps {
  options: readonly DownloadSourceOption[]
  value: ModelDownloadSource
  onValueChange: (source: ModelDownloadSource) => void
  ariaLabel: string
  getLabel: (option: DownloadSourceOption) => ReactNode
  dataOnboarding?: string
}

export function DownloadSourceTabs({ options, value, onValueChange, ariaLabel, getLabel, dataOnboarding }: DownloadSourceTabsProps) {
  return (
    <TabsRoot value={value} onValueChange={source => {
      if (source) onValueChange(source as ModelDownloadSource)
    }}>
      <TabsList className="models-family-dialog__sources" aria-label={ariaLabel}>
        {options.map(option => <TabsTrigger key={option.source} value={option.source} data-onboarding={dataOnboarding}>
          {option.source === 'modelscope' ? <ModelScope aria-hidden="true" /> : <HuggingFace aria-hidden="true" />}
          {getLabel(option)}
        </TabsTrigger>)}
      </TabsList>
    </TabsRoot>
  )
}
