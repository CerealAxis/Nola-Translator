import AlibabaCloud from '@lobehub/icons/es/AlibabaCloud/components/Color'
import Aws from '@lobehub/icons/es/Aws/components/Color'
import Azure from '@lobehub/icons/es/Azure/components/Color'
import Cerebras from '@lobehub/icons/es/Cerebras/components/Color'
import Claude from '@lobehub/icons/es/Claude/components/Color'
import Cohere from '@lobehub/icons/es/Cohere/components/Color'
import DeepInfra from '@lobehub/icons/es/DeepInfra/components/Color'
import DeepL from '@lobehub/icons/es/DeepL/components/Color'
import DeepSeek from '@lobehub/icons/es/DeepSeek/components/Color'
import Fireworks from '@lobehub/icons/es/Fireworks/components/Color'
import Gemini from '@lobehub/icons/es/Gemini/components/Color'
import Google from '@lobehub/icons/es/Google/components/Color'
import HuggingFace from '@lobehub/icons/es/HuggingFace/components/Color'
import Microsoft from '@lobehub/icons/es/Microsoft/components/Color'
import MiniMax from '@lobehub/icons/es/Minimax/components/Color'
import Mistral from '@lobehub/icons/es/Mistral/components/Color'
import OpenRouter from '@lobehub/icons/es/OpenRouter/components/Color'
import Perplexity from '@lobehub/icons/es/Perplexity/components/Color'
import SiliconCloud from '@lobehub/icons/es/SiliconCloud/components/Color'
import Together from '@lobehub/icons/es/Together/components/Color'
import Volcengine from '@lobehub/icons/es/Volcengine/components/Color'
import type { ComponentType } from 'react'
import edgeLogo from '../../../src/renderer/assets/browsers/edge.png'
import { Avatar, AvatarFallback } from '../../../src/renderer/components/ui/avatar'
import { NolaLogo } from '../logo'
import type { ProviderConnection } from '../providers'

const providerIcons: Partial<Record<string, ComponentType>> = {
  nola: NolaLogo,
  'google-translate': Google,
  'microsoft-translate': Microsoft,
  deepl: DeepL,
  deeplx: DeepL,
  anthropic: Claude,
  google: Gemini,
  alibaba: AlibabaCloud,
  minimax: MiniMax,
  cohere: Cohere,
  bedrock: Aws,
  deepseek: DeepSeek,
  openrouter: OpenRouter,
  siliconflow: SiliconCloud,
  volcengine: Volcengine,
  deepinfra: DeepInfra,
  mistral: Mistral,
  togetherai: Together,
  fireworks: Fireworks,
  cerebras: Cerebras,
  perplexity: Perplexity,
  huggingface: HuggingFace,
  azure: Azure,
}

export function ProviderAvatar({ provider }: { provider?: ProviderConnection }) {
  const preset = provider?.preset ?? ''
  const Icon = providerIcons[preset]
  return <Avatar className="nola-provider-avatar" title={provider?.name} aria-hidden="true">
    <AvatarFallback className={Icon || preset === 'edge-tts' ? undefined : 'bg-accent text-accent-foreground'}>
      {Icon ? <Icon /> : preset === 'edge-tts' ? <img src={edgeLogo} alt="" /> : provider?.name.slice(0, 1) ?? '?'}
    </AvatarFallback>
  </Avatar>
}
