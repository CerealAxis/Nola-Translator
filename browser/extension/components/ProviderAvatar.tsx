import AlibabaCloud from '@lobehub/icons/es/AlibabaCloud/components/Color'
import AtlasCloud from '@lobehub/icons/es/AtlasCloud/components/Mono'
import Aws from '@lobehub/icons/es/Aws/components/Color'
import Azure from '@lobehub/icons/es/Azure/components/Color'
import Bilibili from '@lobehub/icons/es/Bilibili/components/Color'
import Cerebras from '@lobehub/icons/es/Cerebras/components/Color'
import Claude from '@lobehub/icons/es/Claude/components/Color'
import Cohere from '@lobehub/icons/es/Cohere/components/Color'
import DeepInfra from '@lobehub/icons/es/DeepInfra/components/Color'
import DeepL from '@lobehub/icons/es/DeepL/components/Color'
import DeepSeek from '@lobehub/icons/es/DeepSeek/components/Color'
import Fireworks from '@lobehub/icons/es/Fireworks/components/Color'
import Gemini from '@lobehub/icons/es/Gemini/components/Color'
import Google from '@lobehub/icons/es/Google/components/Color'
import Groq from '@lobehub/icons/es/Groq/components/Mono'
import HuggingFace from '@lobehub/icons/es/HuggingFace/components/Color'
import Microsoft from '@lobehub/icons/es/Microsoft/components/Color'
import MiniMax from '@lobehub/icons/es/Minimax/components/Color'
import Mistral from '@lobehub/icons/es/Mistral/components/Color'
import Moonshot from '@lobehub/icons/es/Moonshot/components/Mono'
import Ollama from '@lobehub/icons/es/Ollama/components/Mono'
import OpenAI from '@lobehub/icons/es/OpenAI/components/Mono'
import OpenRouter from '@lobehub/icons/es/OpenRouter/components/Color'
import Perplexity from '@lobehub/icons/es/Perplexity/components/Color'
import Replicate from '@lobehub/icons/es/Replicate/components/Mono'
import SiliconCloud from '@lobehub/icons/es/SiliconCloud/components/Color'
import Together from '@lobehub/icons/es/Together/components/Color'
import Volcengine from '@lobehub/icons/es/Volcengine/components/Color'
import XAI from '@lobehub/icons/es/XAI/components/Mono'
import { Cloud, Plug, Server } from 'lucide-react'
import type { ComponentType } from 'react'
import edgeLogo from '../../../src/renderer/assets/browsers/edge.png'
import { Avatar, AvatarFallback } from '../../../src/renderer/components/ui/avatar'
import { NolaLogo } from '../logo'
import type { ProviderConnection } from '../providers'

const providerIcons: Partial<Record<string, ComponentType>> = {
  nola: NolaLogo,
  'google-translate': Google,
  'index-translate': Bilibili,
  'microsoft-translate': Microsoft,
  deepl: DeepL,
  deeplx: DeepL,
  openai: OpenAI,
  'openai-compatible': OpenAI,
  'open-responses': OpenAI,
  anthropic: Claude,
  google: Gemini,
  ollama: Ollama,
  alibaba: AlibabaCloud,
  minimax: MiniMax,
  cohere: Cohere,
  bedrock: Aws,
  replicate: Replicate,
  deepseek: DeepSeek,
  xai: XAI,
  openrouter: OpenRouter,
  siliconflow: SiliconCloud,
  volcengine: Volcengine,
  moonshotai: Moonshot,
  groq: Groq,
  deepinfra: DeepInfra,
  mistral: Mistral,
  togetherai: Together,
  fireworks: Fireworks,
  cerebras: Cerebras,
  perplexity: Perplexity,
  huggingface: HuggingFace,
  atlascloud: AtlasCloud,
  jalapenocloud: Cloud,
  tensdaq: Server,
  azure: Azure,
}

export function ProviderAvatar({ provider }: { provider?: Pick<ProviderConnection, 'preset' | 'name'> }) {
  const preset = provider?.preset ?? ''
  const Icon = providerIcons[preset] ?? Plug
  return <Avatar className="nola-provider-avatar" title={provider?.name} aria-hidden="true">
    <AvatarFallback>
      {preset === 'edge-tts' ? <img src={edgeLogo} alt="" /> : <Icon />}
    </AvatarFallback>
  </Avatar>
}
