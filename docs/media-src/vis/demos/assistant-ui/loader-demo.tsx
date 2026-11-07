import { useEffect, useState } from 'react'
import { GenerationLoader, type GenerationLoaderVariant } from '../../assistant-ui/elements/loading-state'
import { AssistantPreview } from '../../assistant-ui/preview-scope'
import { Button } from '../../shadcn-base/ui/button'

const shapes = [
  ['dots', '圆点'],
  ['squares', '方块'],
  ['rounded', '圆角方块'],
] as const

export default function LoaderDemo() {
  const [tick, setTick] = useState(0)
  const [active, setActive] = useState(true)
  const [variant, setVariant] = useState<GenerationLoaderVariant>('dots')
  const [tinted, setTinted] = useState(false)

  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setTick(value => value + 1), 120)
    return () => window.clearInterval(timer)
  }, [active])

  return (
    <AssistantPreview>
      <div className="flex flex-col items-center gap-6 py-6">
        <div className="grid min-h-20 place-items-center" role="status">
          {active ? (
            <GenerationLoader
              label="正在生成"
              tick={tick}
              variant={variant}
              className={tinted ? '[&_[aria-hidden]_span]:bg-primary' : undefined}
            />
          ) : '生成完成'}
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {shapes.map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={variant === value ? 'default' : 'outline'}
              aria-pressed={variant === value}
              onClick={() => setVariant(value)}
            >
              {label}
            </Button>
          ))}
          <Button size="sm" variant="outline" aria-pressed={tinted} onClick={() => setTinted(value => !value)}>
            使用主题色
          </Button>
          <Button size="sm" variant="outline" onClick={() => setActive(value => !value)}>
            {active ? '结束生成' : '重新生成'}
          </Button>
        </div>
      </div>
    </AssistantPreview>
  )
}
