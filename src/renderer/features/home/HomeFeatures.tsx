import { useId } from 'react'
import { ArrowRight, AudioLines, BookOpen, Cpu, Gamepad2, Headphones, Network } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import { pathOf, useRoute } from '@/routes'
import { stores } from '@/store'
import { useStore } from '@/store/createStore'
import { GameVisual, MangaVisual } from './visuals/GameMangaVisuals'
import { GatewayVisual, MeetingVisual } from './visuals/GatewayMeetingVisuals'
import { ProviderIconCloud } from './visuals/ProviderIconCloud'
import { QuickInterpretationVisual } from './visuals/QuickInterpretationVisual'
import { useHomeReducedMotion } from './visuals/useHomeVisualMotion'
import './home-features.css'

const features = [
  { route: 'models', title: 'home.models', Icon: Cpu, Visual: ProviderIconCloud, size: 'small', target: 'home-models' },
  { route: 'model-gateway', title: 'homeRecordsUi.gatewayTitle', Icon: Network, Visual: GatewayVisual, size: 'wide' },
  { route: 'workspace', title: 'home.quickStart', Icon: AudioLines, Visual: QuickInterpretationVisual, size: 'wide', target: 'home-quick' },
  { route: 'meeting', title: 'meeting.navTitle', Icon: Headphones, Visual: MeetingVisual, size: 'small' },
  { route: 'game-translation', title: 'suite.gameTitle', Icon: Gamepad2, Visual: GameVisual, size: 'small' },
  { route: 'comic-translation', title: 'suite.comicTitle', Icon: BookOpen, Visual: MangaVisual, size: 'wide' },
] as const

const traditionalChinese = {
  heading: '功能速覽',
  action: '了解更多',
  models: '安裝和管理辨識與翻譯模型。',
  'model-gateway': '統一載入本機模型，依能力呼叫。',
  workspace: '把麥克風或電腦聲音即時譯成字幕。',
  meeting: '為會議裡的不同發言人提供即時口譯。',
  'game-translation': '遊玩時翻譯遊戲對話和介面文字。',
  'comic-translation': '辨識漫畫對白並把譯文排回畫面。',
}

const copy = {
  'zh-CN': {
    heading: '功能速览',
    action: '了解更多',
    models: '安装和管理识别与翻译模型。',
    'model-gateway': '统一加载本地模型，按能力调用。',
    workspace: '把麦克风或电脑声音实时译成字幕。',
    meeting: '为会议里的不同发言人提供实时口译。',
    'game-translation': '游玩时翻译游戏对话和界面文字。',
    'comic-translation': '识别漫画对白并把译文排回画面。',
  },
  'zh-TW': traditionalChinese,
  'zh-HK': traditionalChinese,
  en: {
    heading: 'Explore features',
    action: 'Learn more',
    models: 'Install and manage recognition and translation models.',
    'model-gateway': 'Load local models and call them by capability.',
    workspace: 'Translate microphone or computer audio into live captions.',
    meeting: 'Get live interpretation for each speaker in a meeting.',
    'game-translation': 'Translate game dialogue and on-screen text as you play.',
    'comic-translation': 'Recognize comic dialogue and typeset it back onto the page.',
  },
  ja: {
    heading: '機能一覧',
    action: '詳しく見る',
    models: '認識モデルと翻訳モデルをインストール・管理します。',
    'model-gateway': 'ローカルモデルを一元管理し、機能別に呼び出します。',
    workspace: 'マイクやパソコンの音声をリアルタイムで翻訳し、字幕にします。',
    meeting: '会議の発言を話者ごとにリアルタイムで通訳します。',
    'game-translation': 'プレイしながらゲームの会話や画面の文字を翻訳します。',
    'comic-translation': '漫画のせりふを認識し、翻訳を元のコマに配置します。',
  },
  ko: {
    heading: '기능 둘러보기',
    action: '자세히 보기',
    models: '인식 및 번역 모델을 설치하고 관리합니다.',
    'model-gateway': '로컬 모델을 한곳에서 불러오고 기능별로 호출합니다.',
    workspace: '마이크나 컴퓨터의 소리를 실시간 번역 자막으로 표시합니다.',
    meeting: '회의에서 발언자별로 실시간 통역을 제공합니다.',
    'game-translation': '플레이 중 게임 대화와 화면의 문구를 번역합니다.',
    'comic-translation': '만화 대사를 인식하고 번역을 원래 컷에 배치합니다.',
  },
}

// 适配 Magic UI Bento Grid（MIT，见 THIRD_PARTY_NOTICES.md）。
export function HomeFeatures() {
  const headingId = useId()
  const { language, t } = useI18n()
  const { navigate } = useRoute()
  const onboardingActive = useStore(stores.settings, state => state.onboardingActive)
  const reduceMotion = useHomeReducedMotion()
  const labels = copy[language]

  return (
    <section className="nola-home-section" aria-labelledby={headingId}>
      <h2 className="nola-home-section__heading" id={headingId}>{labels.heading}</h2>
      <div
        className="nola-home-bento"
        data-onboarding="home-entries"
        data-reduce-motion={reduceMotion || undefined}
      >
        {features.map(feature => {
          const { route, title, Icon, Visual, size } = feature
          const name = t(title)
          const titleId = 'home-feature-title-' + route
          const onboardingTarget = 'target' in feature ? feature.target : undefined

          return (
            <article
              className={'nola-home-feature-card nola-home-feature--' + size}
              id={'home-feature-' + route}
              key={route}
              aria-labelledby={titleId}
              data-onboarding={onboardingTarget}
              data-onboarding-cta={onboardingActive && onboardingTarget === 'home-models' || undefined}
            >
              <div className="nola-home-bento-visual" aria-hidden="true"><Visual reduceMotion={reduceMotion} /></div>
              <div className="nola-home-bento-copy">
                <Icon className="nola-home-bento-icon" aria-hidden="true" />
                <h3 id={titleId}>{name}</h3>
                <p>{labels[route]}</p>
              </div>
              <div className="nola-home-bento-cta">
                <Button variant="link" size="sm" aria-describedby={titleId} onClick={() => navigate(pathOf(route))}>
                  {labels.action}
                  <ArrowRight data-icon="inline-end" aria-hidden="true" />
                </Button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
