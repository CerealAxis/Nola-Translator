import Claude from '@lobehub/icons/es/Claude/components/Color'
import DeepSeek from '@lobehub/icons/es/DeepSeek/components/Color'
import Gemini from '@lobehub/icons/es/Gemini/components/Color'
import Google from '@lobehub/icons/es/Google/components/Color'
import Hunyuan from '@lobehub/icons/es/Hunyuan/components/Color'
import Kimi from '@lobehub/icons/es/Kimi/components/Mono'
import Microsoft from '@lobehub/icons/es/Microsoft/components/Color'
import MiniMax from '@lobehub/icons/es/Minimax/components/Color'
import OpenAI from '@lobehub/icons/es/OpenAI/components/Mono'
import Qwen from '@lobehub/icons/es/Qwen/components/Color'
import StepFun from '@lobehub/icons/es/Stepfun/components/Mono'
import MiMo from '@lobehub/icons/es/XiaomiMiMo/components/Mono'
import ZAI from '@lobehub/icons/es/ZAI/components/Mono'
import { Pause, Play } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../../src/renderer/components/ui/button'
import { landingContent } from './landing-content'
import type { Locale } from './content'

const brands = [
  ['OpenAI', OpenAI],
  ['Claude', Claude],
  ['Gemini', Gemini],
  ['MiniMax', MiniMax],
  ['MiMo', MiMo],
  ['DeepSeek', DeepSeek],
  ['Qwen', Qwen],
  ['GLM', ZAI],
  ['StepFun', StepFun],
  ['Kimi', Kimi],

] as const

export function LandingBrandMarquee({ locale }: { locale: Locale }) {
  const content = landingContent[locale]
  const localizedBrands = [...brands, [content.brandNames.hunyuan, Hunyuan], [content.brandNames.google, Google], [content.brandNames.microsoft, Microsoft]] as const
  const [paused, setPaused] = useState(false)
  const action = paused ? content.brandResume : content.brandPause

  return (
    <section className="site-brand-strip" aria-label={content.brandLabel} data-paused={paused} data-reveal="section">
      <div className="site-brand-strip-viewport">
        <div className="site-brand-strip-track">
          {[0, 1].map(copy => (
            <ul key={copy} className="site-brand-strip-list" aria-hidden={copy === 1 || undefined}>
              {localizedBrands.map(([name, Mark]) => (
                <li key={name} className="site-brand-strip-item">
                  <Mark aria-hidden="true" />
                  <span>{name}</span>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
      <Button
        type="button"
        variant="bare"
        size="icon-sm"
        className="site-brand-strip-toggle"
        aria-label={action}
        title={action}
        onClick={() => setPaused(current => !current)}
      >
        {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
      </Button>
    </section>
  )
}
