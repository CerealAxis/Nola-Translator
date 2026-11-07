import { useState } from 'react'
import { VoiceOrb, type VoiceOrbState, type VoiceOrbVariant } from '../../assistant-ui/elements/voice'
import { AssistantPreview } from '../../assistant-ui/preview-scope'
import { Button } from '../../shadcn-base/ui/button'

const states: Array<[VoiceOrbState, string]> = [['idle', '空闲'], ['connecting', '连接中'], ['listening', '聆听'], ['speaking', '说话'], ['muted', '静音']]
const colors: Array<[VoiceOrbVariant, string]> = [['default', '默认'], ['blue', '蓝色'], ['violet', '紫色'], ['emerald', '绿色']]

export default function Demo() {
  const [state, setState] = useState<VoiceOrbState>('speaking')
  const [variant, setVariant] = useState<VoiceOrbVariant>('blue')
  return (
    <AssistantPreview>
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4">
        <VoiceOrb state={state} variant={variant} volume={state === 'speaking' ? 0.6 : 0} className="size-32" />
        <div className="flex flex-wrap justify-center gap-2">
          {states.map(([value, label]) => <Button key={value} size="sm" variant={state === value ? 'default' : 'outline'} aria-pressed={state === value} onClick={() => setState(value)}>{label}</Button>)}
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {colors.map(([value, label]) => <Button key={value} size="sm" variant={variant === value ? 'default' : 'outline'} aria-pressed={variant === value} onClick={() => setVariant(value)}>{label}</Button>)}
        </div>
      </div>
    </AssistantPreview>
  )
}
