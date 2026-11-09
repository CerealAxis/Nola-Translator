import type { CSSProperties } from 'react'
import { AudioLines, BrainCircuit, Languages, Mic, Volume2 } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import logo from '../../../../../assets/brand/nola-logo.svg'
import { useHomeVisualViewport } from './useHomeVisualMotion'
import './gateway-meeting-visuals.css'

const capabilities = [
  { name: 'ASR', Icon: Mic, tone: 'primary' },
  { name: 'MT', Icon: Languages, tone: 'teal' },
  { name: 'TTS', Icon: Volume2, tone: 'violet' },
  { name: 'LLM', Icon: BrainCircuit, tone: 'amber' },
] as const

// 使用 Magic UI Orbiting Circles 的等分轨道与反向旋转，让文字始终朝上（MIT）。
// https://magicui.design/docs/components/orbiting-circles
export function GatewayVisual() {
  return (
    <div className="nola-home-gateway-orbit" aria-hidden="true">
      <div className="nola-home-gateway-orbit__diagram">
        <svg className="nola-home-gateway-orbit__track" viewBox="0 0 224 224" fill="none">
          <circle cx="112" cy="112" r="77" />
          <circle cx="112" cy="112" r="52" strokeDasharray="2 5" />
        </svg>
        <div className="nola-home-gateway-orbit__center">
          <img src={logo} alt="" />
        </div>
        {capabilities.map(({ name, Icon, tone }, index) => (
          <div
            key={name}
            className="nola-home-gateway-orbit__node"
            data-tone={tone}
            style={{ '--orbit-angle': `${45 + (360 / capabilities.length) * index}deg` } as CSSProperties}
          >
            <Icon />
            <span>{name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const turns = [
  {
    speaker: 'Emily', initial: 'E', language: 'en', tone: 'primary',
    source: 'Can we send the draft on Friday?',
    translation: ['我们能', '周五', '发出草稿吗？'],
  },
  {
    speaker: '佐藤', initial: '佐', language: 'ja', tone: 'teal',
    source: 'はい、午前中に送ります。',
    translation: ['可以，', '我会在', '上午发出。'],
  },
] as const

// 从 Magic UI Text Animate 的 blurInUp 取分段显现效果，按中文语义短语推进（MIT）。
// https://magicui.design/docs/components/text-animate
export function MeetingVisual() {
  const { ref, inView } = useHomeVisualViewport(0.5, true)

  return (
    <div ref={ref} className="nola-home-meeting-turns" data-playing={inView} aria-hidden="true">
      {turns.map(({ speaker, initial, language, tone, source, translation }, index) => (
        <div className="nola-home-meeting-turns__row" data-tone={tone} key={speaker}>
          <Avatar size="sm">
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
          <div className="nola-home-meeting-turns__copy">
            <div className="nola-home-meeting-turns__speaker">
              <span lang={language}>{speaker}</span>
              <AudioLines />
            </div>
            <p className="nola-home-meeting-turns__source" lang={language}>{source}</p>
            <p className="nola-home-meeting-turns__translation" lang="zh-CN">
              {translation.map((phrase, phraseIndex) => (
                <span key={phrase} style={{ '--turn-delay': (0.18 + index * 0.65 + phraseIndex * 0.13) + 's' } as CSSProperties}>
                  {phrase}
                </span>
              ))}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
