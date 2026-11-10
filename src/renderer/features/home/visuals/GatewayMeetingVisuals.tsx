import { useEffect, useState, type ReactElement } from 'react'
import Claude from '@lobehub/icons/es/Claude/components/Color'
import DeepSeek from '@lobehub/icons/es/DeepSeek/components/Color'
import Gemini from '@lobehub/icons/es/Gemini/components/Color'
import Mistral from '@lobehub/icons/es/Mistral/components/Color'
import OpenAI from '@lobehub/icons/es/OpenAI/components/Mono'
import Qwen from '@lobehub/icons/es/Qwen/components/Color'
import { AudioLines } from 'lucide-react'
import { motion } from 'motion/react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import logo from '../../../../../assets/brand/nola-logo.svg'

const modelMarks = [
  { name: 'GPT', Mark: OpenAI, x: 14, y: 18 },
  { name: 'Claude', Mark: Claude, x: 14, y: 50 },
  { name: 'Gemini', Mark: Gemini, x: 14, y: 82 },
  { name: 'Qwen', Mark: Qwen, x: 86, y: 18 },
  { name: 'DeepSeek', Mark: DeepSeek, x: 86, y: 50 },
  { name: 'Mistral', Mark: Mistral, x: 86, y: 82 },
] as const

// 参考 Magic UI Animated Beam 的双侧连线，路径和 Logo 共用坐标。
// https://magicui.design/docs/components/animated-beam
export function GatewayVisual({ playing }: { playing: boolean }) {
  return (
    <div className="nola-home-gateway-beam" aria-hidden="true">
      <svg className="nola-home-gateway-beam__tracks" viewBox="0 0 100 100" preserveAspectRatio="none" fill="none">
        {modelMarks.map(({ name, x, y }, index) => {
          const bend = (x + 50) / 2
          const path = `M ${x} ${y} Q ${bend} 50 50 50`
          return (
            <g key={name}>
              <path className="nola-home-gateway-beam__track" d={path} vectorEffect="non-scaling-stroke" />
              {playing && (
                <path className="nola-home-gateway-beam__pulse" d={path} pathLength={100}
                  vectorEffect="non-scaling-stroke" style={{ animationDelay: `${index * 0.22}s` }} />
              )}
            </g>
          )
        })}
      </svg>
      <div className="nola-home-gateway-beam__center">
        <img src={logo} alt="" />
      </div>
      {modelMarks.map(({ name, Mark, x, y }) => (
        <div key={name} className="nola-home-gateway-beam__node" style={{ left: `${x}%`, top: `${y}%` }}>
          <Mark />
        </div>
      ))}
    </div>
  )
}

const turns = [
  {
    speaker: 'Emily', initial: 'E', language: 'en', tone: 'primary',
    source: 'Can we send the draft on Friday?',
    translation: '我们能周五发出草稿吗？',
  },
  {
    speaker: '佐藤', initial: '佐', language: 'ja', tone: 'teal',
    source: 'はい、午前中に送ります。',
    translation: '可以，我会在上午发出。',
  },
] as const

// 适配 Magic UI Animated List（MIT），循环时保留最新两条消息。
// https://magicui.design/docs/components/animated-list
function AnimatedList({ children }: { children: ReactElement[] }) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const interval = window.setInterval(() => setIndex(current => current + 1), 3000)
    return () => window.clearInterval(interval)
  }, [])

  return (
    <div className="nola-home-meeting-turns">
      {Array.from({ length: Math.min(index + 1, 2) }, (_, offset) => {
        const messageIndex = index - offset
        return (
          <motion.div
            key={messageIndex}
            layout="position"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1, originY: 0 }}
            transition={{
              type: 'spring', stiffness: 350, damping: 40,
              layout: { duration: 0.18, ease: 'easeOut' },
            }}
          >
            {children[messageIndex % children.length]}
          </motion.div>
        )
      })}
    </div>
  )
}

export function MeetingVisual({ playing }: { playing: boolean }) {
  const messages = turns.map(({ speaker, initial, language, tone, source, translation }) => (
    <div className="nola-home-meeting-turns__row" data-tone={tone} key={speaker}>
      <Avatar size="sm"><AvatarFallback>{initial}</AvatarFallback></Avatar>
      <div className="nola-home-meeting-turns__copy">
        <div className="nola-home-meeting-turns__speaker">
          <span lang={language}>{speaker}</span>
          <AudioLines />
        </div>
        <p className="nola-home-meeting-turns__source" lang={language}>{source}</p>
        <p className="nola-home-meeting-turns__translation" lang="zh-CN">{translation}</p>
      </div>
    </div>
  ))

  return playing
    ? <AnimatedList>{messages}</AnimatedList>
    : <div className="nola-home-meeting-turns">{messages}</div>
}
