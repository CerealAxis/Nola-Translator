import { useEffect, useState } from 'react'
import { Heart, Languages, Sword } from 'lucide-react'
import { useHomeVisualViewport } from './useHomeVisualMotion'
import './game-manga-visuals.css'

const questLines = [
  { source: '北の門で待っている。', translation: '我在北门等你。' },
  { source: '鍵は見つかった？', translation: '找到钥匙了吗？' },
] as const

// 改编自 Magic UI Typing Animation（MIT，见 THIRD_PARTY_NOTICES.md）。
// https://magicui.design/docs/components/typing-animation
export function GameVisual({ playing }: { playing: boolean }) {
  const { ref, inView } = useHomeVisualViewport()
  const [lineIndex, setLineIndex] = useState(0)
  const [visibleCount, setVisibleCount] = useState(0)
  const { source, translation } = questLines[lineIndex]
  const done = visibleCount >= translation.length

  useEffect(() => {
    if (!playing || !inView) return

    const timeout = setTimeout(() => {
      if (done) {
        setLineIndex((current) => (current + 1) % questLines.length)
        setVisibleCount(0)
      } else {
        setVisibleCount((current) => current + 1)
      }
    }, done ? 3400 : 85)

    return () => clearTimeout(timeout)
  }, [done, inView, playing, visibleCount])

  return (
    <div ref={ref} className="nola-home-game-stage">
      <svg className="nola-home-game-scene" viewBox="0 0 400 182" preserveAspectRatio="xMidYMid slice">
        <circle className="nola-home-game-sun" cx="291" cy="51" r="25" />
        <path className="nola-home-game-hills" d="M0 126 80 54l45 41 53-54 71 74 49-28 40 36 62-56v115H0Z" />
        <path className="nola-home-game-peaks" d="m50 81 30-27 29 27-18-5-11 6-9-7Zm99-11 29-29 31 32-22-7-9 10-11-10Z" />
        <path className="nola-home-game-ground" d="M0 120h41v-7h49v-7h46v9h46v-7h42v-8h52v8h42v-9h39v12h43v71H0Z" />
        <path className="nola-home-game-tower" d="M266 103V72h-5V61h8v-8h10v8h9v11h-6v31Zm31 1V82h-5V71h8v-7h10v7h8v11h-5v22Zm-18-7V84h20v20Z" />
        <path className="nola-home-game-road" d="M278 104h20l-42 35 61 43H167l55-43Z" />
        <path className="nola-home-game-ground" d="M49 113h5v-9h-8l7-9h-5l9-12 9 12h-5l7 9H60v9h5Z" />
      </svg>
      <div className="nola-home-game-hud">
        <Heart />
        <Heart />
        <Heart />
      </div>
      <div className="nola-home-game-dialog">
        <div className="nola-home-game-source" lang="ja">
          <Sword />
          <span>{source}</span>
        </div>
        <div className="nola-home-game-translation" lang="zh-CN">
          <Languages />
          <span>{playing ? translation.slice(0, visibleCount) : translation}</span>
          {playing && !done && <span className="nola-home-game-caret" />}
        </div>
      </div>
    </div>
  )
}

function MangaSpread({ translated = false }: { translated?: boolean }) {
  const language = translated ? 'zh-CN' : 'ja'

  return (
    <div className="nola-home-manga-spread">
      <div className="nola-home-manga-panel nola-home-manga-panel--cat">
        <svg className="nola-home-manga-ink" viewBox="0 0 192 148" preserveAspectRatio="xMidYMax slice">
          <path className="nola-home-manga-scenery" d="M7 87h45m-38-6h20m116-9h22m-10 9h24M1 132q42-12 76 0m50-5q42-10 66-2" />
          <path className="nola-home-manga-figure" d="M53 148q4-25 22-30 27-4 47 7 12 7 14 23Zm5-49-2-31 28 15 23 1 28-15-4 30q7 9 0 22-10 14-35 14-27 0-37-13-8-10-1-23Z" />
          <path d="m69 92-4-13 13 8m42 4 8-11-13 7m-42 23 8 2-9 3m45-5-8 2 9 3m-27 3 5 3 5-3m-5 3v3m-8 0q5 4 8 0 4 4 9 0" />
          <path className="nola-home-manga-expression" d="m142 78 9-11m-5 16 14-6m-112 9-12-8" />
        </svg>
        <p className="nola-home-manga-bubble" lang={language}>
          {translated ? '你来晚了。' : '遅かったね。'}
        </p>
      </div>
      <div className="nola-home-manga-panel nola-home-manga-panel--fox">
        <svg className="nola-home-manga-ink" viewBox="0 0 178 148" preserveAspectRatio="xMidYMax slice">
          <path className="nola-home-manga-scenery" d="M15 74 4 68m16 15L3 80m18 11L4 95m151-18 17-11m-13 22 14-5m-18 14 20 3M0 135q42-11 62-2m60-5q22-8 57 1" />
          <path className="nola-home-manga-figure" d="M50 148q7-17 22-24l40 1q18 8 22 23ZM57 105l-6-36 30 17q13-5 25 1l24-17-5 31 13 15-16 3-11 11q-11 9-21 6-13-1-24-16l-18-3Z" />
          <path d="m62 82 13 7-9 9m56-17-12 10 9 6m-50 18q6-8 14-1m22 0q7-8 14-3m-29 12 5 2 5-3m-5 3v3m-7 1 8 2 7-5m-34 13 44-4-13 13" />
          <path className="nola-home-manga-expression" d="m142 84 4-13 5 12q1 5-4 6-5 0-5-5Z" />
        </svg>
        <p className="nola-home-manga-bubble" lang={language}>
          {translated ? '我迷路了…' : '道に迷って…'}
        </p>
      </div>
    </div>
  )
}

// 复用 Magic UI Lens 的双层内容和径向遮罩（MIT）。镜片自动经过两个气泡，露出译文层。
// https://magicui.design/docs/components/lens
export function MangaVisual() {
  return (
    <div className="nola-home-manga-stage">
      <MangaSpread />
      <div className="nola-home-manga-lens">
        <MangaSpread translated />
      </div>
      <div className="nola-home-manga-lens-ring">
        <Languages />
      </div>
    </div>
  )
}
