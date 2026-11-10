import { useState } from 'react'
import { Tabs } from '@base-ui/react/tabs'
import { AudioLines, BookOpen, Gamepad2, Headphones, ScanText, Video } from 'lucide-react'
import { Button } from '../../../src/renderer/components/ui/button'
import type { Locale } from './content'

const scenes = [
  { id: 'meeting', icon: Headphones, original: 'では、来週の予定を確認しましょう。' },
  { id: 'game', icon: Gamepad2, original: '夜明けまでに、灯台へ急ごう。' },
  { id: 'comic', icon: BookOpen, original: 'あの光は、きっと私たちを待ってる。' },
  { id: 'screen', icon: ScanText, original: '変更を保存してから閉じてください。' },
  { id: 'live', icon: AudioLines, original: 'それでは、今日の放送を始めます。' },
  { id: 'video', icon: Video, original: 'まず、光の向きを見てみましょう。' },
] as const

type Scene = typeof scenes[number]
type SceneCopy = [tab: string, title: string, body: string, translation: string]
type ScenarioCopy = {
  title: string
  intro: string
  labels: [sample: string, original: string, translated: string]
  scenes: Record<Scene['id'], SceneCopy>
}

const zhTW: ScenarioCopy = {
  title: '從會議到漫畫，讀懂每個場景',
  intro: '選擇你正在做的事，看看原文如何變成可讀的譯文。',
  labels: ['示意預覽', '原文', '譯文'],
  scenes: {
    meeting: ['會議口譯', '跨語言會議，跟上每一句', '分開設定收音與譯文播報，會中看雙語字幕，會後回顧會議記錄。', '那麼，我們來確認一下下週的行程吧。'],
    game: ['遊戲翻譯', '遊戲對白，邊玩邊懂', '依遊戲選擇 OCR、文字 Hook 或剪貼簿，讓譯文顯示在浮動字幕上。', '天亮之前，快趕到燈塔。'],
    comic: ['漫畫翻譯', '譯文回到原本的對話框', '匯入漫畫頁面，辨識、翻譯與排版，再校對並調整每個對話框。', '那道光，一定在等著我們。'],
    screen: ['螢幕翻譯', '框選畫面，就能讀懂文字', '選取應用程式中的一塊區域，辨識無法複製的文字並顯示譯文。', '請先儲存變更，再關閉視窗。'],
    live: ['快速口譯', '把正在聽的聲音變成雙語字幕', '用麥克風或系統音訊開始，原文與譯文並排，也可放進浮動字幕視窗。', '那麼，今天的直播就開始吧。'],
    video: ['瀏覽器字幕', '看外語影片，字幕留在播放器裡', '使用瀏覽器擴充功能，為網頁影片產生雙語字幕。', '首先，我們來看看光線的方向。'],
  },
}

const scenarioCopy: Record<Locale, ScenarioCopy> = {
  'zh-CN': {
    title: '从会议到漫画，读懂每个场景',
    intro: '选一个你正在做的事，看看原文如何变成看得懂的译文。',
    labels: ['示意预览', '原文', '译文'],
    scenes: {
      meeting: ['会议口译', '跨语言会议，跟上每一句', '分别设置收音和译文播报，会中看双语字幕，会后回看会议记录。', '接下来，我们确认一下下周的安排。'],
      game: ['游戏翻译', '游戏对白，边玩边懂', '按游戏选择 OCR、文本 Hook 或剪贴板，让译文出现在浮动字幕上。', '天亮之前，快赶到灯塔。'],
      comic: ['漫画翻译', '译文回到原来的气泡里', '导入漫画页，识别、翻译并重新排版，再逐个校对和调整气泡。', '那束光，一定在等着我们。'],
      screen: ['屏幕翻译', '框选屏幕，读懂眼前的文字', '选中应用里的一块区域，识别无法复制的文字并显示译文。', '请先保存更改，再关闭窗口。'],
      live: ['快速同传', '把正在听的声音变成双语字幕', '用麦克风或系统音频开始，原文和译文并排显示，也可以放到悬浮字幕窗。', '那么，今天的直播就开始吧。'],
      video: ['浏览器字幕', '看外语视频，字幕留在播放器里', '使用浏览器扩展，为网页视频生成双语字幕。', '首先，我们来看看光线的方向。'],
    },
  },
  'zh-TW': zhTW,
  'zh-HK': {
    ...zhTW,
    scenes: {
      ...zhTW.scenes,
      screen: ['螢幕翻譯', '框選畫面，就能讀懂文字', '選取程式中的一個範圍，辨識無法複製的文字並顯示譯文。', '請先儲存變更，再關閉視窗。'],
      live: ['即時傳譯', '把正在聽的聲音變成雙語字幕', '用咪高峰或系統音訊開始，原文與譯文並排，也可放在懸浮字幕視窗。', '那麼，今天的直播就開始吧。'],
    },
  },
  en: {
    title: 'From meetings to manga',
    intro: 'Pick a scene and see where the translation appears.',
    labels: ['Illustrative preview', 'Original', 'Translation'],
    scenes: {
      meeting: ['Meeting interpreting', 'Keep up with a multilingual meeting', 'Set up audio input and translated playback, follow bilingual captions, and revisit the meeting record.', 'Next, let’s confirm the schedule for next week.'],
      game: ['Games', 'Follow game dialogue as you play', 'Choose OCR, a text hook, or clipboard input for your game and read the translation in a floating overlay.', 'Hurry to the lighthouse before dawn.'],
      comic: ['Comics', 'Put the translation back in the bubble', 'Import pages, detect and translate text, then review and adjust the typesetting bubble by bubble.', 'That light must be waiting for us.'],
      screen: ['Screen', 'Translate text you can’t copy', 'Select an area of an app and see the translation of the text inside it.', 'Save your changes before closing the window.'],
      live: ['Live translation', 'Turn the audio you hear into captions', 'Start with your microphone or system audio, then read both languages side by side or in a floating window.', 'Let’s start today’s stream.'],
      video: ['Browser captions', 'Watch with captions in the player', 'Use the browser extension to generate bilingual captions for web videos.', 'First, let’s look at the direction of the light.'],
    },
  },
  ja: {
    title: '会議から漫画まで、場面に合った翻訳を',
    intro: '使いたい場面を選び、原文と訳文の表示を見比べてみましょう。',
    labels: ['表示イメージ', '原文', '訳文'],
    scenes: {
      meeting: ['会議通訳', '多言語の会議でも、話についていく', '入力音声と訳文の読み上げを設定し、会議中は二言語字幕、終了後は記録を確認できます。', 'では、来週の予定を確認しましょう。'],
      game: ['ゲーム翻訳', '遊びながらセリフを読む', 'ゲームに応じて OCR、テキストフック、クリップボードを選び、訳文をオーバーレイに表示します。', '夜明けまでに、灯台へ急ごう。'],
      comic: ['漫画翻訳', '訳文を元の吹き出しに', '漫画ページを読み込み、文字の認識・翻訳・組版を行い、吹き出しごとに調整できます。', 'あの光は、きっと私たちを待ってる。'],
      screen: ['画面翻訳', 'コピーできない文字を翻訳', 'アプリの画面を範囲選択し、その中の文字を認識して訳文を表示します。', '変更を保存してから閉じてください。'],
      live: ['リアルタイム通訳', '聞こえる音声を二言語字幕に', 'マイクやシステム音声を使い、原文と訳文を並べるか、字幕ウィンドウに表示します。', 'それでは、今日の放送を始めます。'],
      video: ['ブラウザー字幕', 'プレーヤーで字幕を読みながら視聴', 'ブラウザー拡張機能でウェブ動画の二言語字幕を生成します。', 'まず、光の向きを見てみましょう。'],
    },
  },
  ko: {
    title: '회의부터 만화까지, 상황에 맞는 번역',
    intro: '상황을 선택하고 원문과 번역문이 어떻게 표시되는지 살펴보세요.',
    labels: ['예시 미리보기', '원문', '번역문'],
    scenes: {
      meeting: ['회의 통역', '다국어 회의의 흐름을 따라가세요', '오디오 입력과 번역 음성 출력을 설정하고, 이중 언어 자막과 회의 기록을 확인하세요.', '이제 다음 주 일정을 확인해 보죠.'],
      game: ['게임 번역', '플레이하면서 대사를 읽으세요', '게임에 맞춰 OCR, 텍스트 훅, 클립보드 중 하나를 선택하고 오버레이로 번역을 보세요.', '동이 트기 전에 등대로 서두르자.'],
      comic: ['만화 번역', '번역문을 원래 말풍선으로', '만화 페이지를 가져와 인식·번역·배치한 뒤 말풍선별로 검토하고 조정하세요.', '저 빛은 분명 우리를 기다리고 있어.'],
      screen: ['화면 번역', '복사할 수 없는 글자도 번역', '앱 화면의 영역을 선택하고 그 안의 글자를 인식해 번역문을 표시하세요.', '창을 닫기 전에 변경 사항을 저장하세요.'],
      live: ['실시간 통역', '들리는 소리를 이중 언어 자막으로', '마이크나 시스템 오디오로 시작하고 원문과 번역문을 나란히 또는 오버레이로 보세요.', '그럼 오늘 방송을 시작하겠습니다.'],
      video: ['브라우저 자막', '플레이어에서 자막을 보며 시청', '브라우저 확장 프로그램으로 웹 동영상에 이중 언어 자막을 생성하세요.', '먼저 빛의 방향을 살펴봅시다.'],
    },
  },
}

export function LandingScenarios({ locale }: { locale: Locale }) {
  const { title, intro, scenes: copy, labels } = scenarioCopy[locale]
  return (
    <section id="scenarios" className="site-scenarios site-shell site-section" data-reveal>
      <div className="site-heading">
        <h2>{title}</h2>
        <p>{intro}</p>
      </div>
      <Tabs.Root defaultValue="meeting" className="site-scenario-tabs">
        <Tabs.List className="tabs__list" aria-label={title}>
          {scenes.map(({ id, icon: Icon }) => (
            <Tabs.Tab className="tabs__tab" value={id} key={id}>
              <Icon aria-hidden="true" />
              {copy[id][0]}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        {scenes.map(scene => {
          const [, heading, body, translation] = copy[scene.id]
          return (
            <Tabs.Panel value={scene.id} key={scene.id}>
              <div className="site-scenario-panel">
                <div className="site-scenario-copy">
                  <h3>{heading}</h3>
                  <p>{body}</p>
                </div>
                <ScenarioSample
                  scene={scene}
                  labels={labels}
                  original={locale === 'ja' ? sourceEnglish[scene.id] : scene.original}
                  originalLanguage={locale === 'ja' ? 'en' : 'ja'}
                  translation={translation}
                />
              </div>
            </Tabs.Panel>
          )
        })}
      </Tabs.Root>
    </section>
  )
}

const sourceEnglish: Record<Scene['id'], string> = {
  meeting: 'Next, let’s confirm the schedule for next week.',
  game: 'Hurry to the lighthouse before dawn.',
  comic: 'That light must be waiting for us.',
  screen: 'Save your changes before closing the window.',
  live: 'Let’s start today’s stream.',
  video: 'First, let’s look at the direction of the light.',
}

function ScenarioSample({ scene, labels, original, originalLanguage, translation }: {
  scene: Scene
  labels: ScenarioCopy['labels']
  original: string
  originalLanguage: string
  translation: string
}) {
  const [translated, setTranslated] = useState(true)
  const [sampleLabel, originalLabel, translatedLabel] = labels
  const Icon = scene.icon
  return (
    <figure className="site-scenario-sample" data-scene={scene.id}>
      <figcaption>
        <Icon aria-hidden="true" />
        {sampleLabel}
      </figcaption>
      <div className="site-scenario-canvas">
        {scene.id === 'game' || scene.id === 'comic' || scene.id === 'video' ? <SceneLandscape /> : (
          <Icon className="site-scenario-watermark" aria-hidden="true" />
        )}
        <div className="site-scenario-output" aria-live="polite">
          {(scene.id === 'meeting' || scene.id === 'live' || scene.id === 'video') && translated && (
            <small lang={originalLanguage}>{original}</small>
          )}
          <p lang={translated ? undefined : originalLanguage}>{translated ? translation : original}</p>
        </div>
      </div>
      <div className="site-scenario-switch" role="group" aria-label={sampleLabel}>
        <Button size="sm" variant="bare" aria-pressed={!translated} onClick={() => setTranslated(false)}>{originalLabel}</Button>
        <Button size="sm" variant="bare" aria-pressed={translated} onClick={() => setTranslated(true)}>{translatedLabel}</Button>
      </div>
    </figure>
  )
}

function SceneLandscape() {
  return (
    <svg className="site-scenario-landscape" viewBox="0 0 620 280" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <circle cx="480" cy="74" r="43" fill="currentColor" opacity=".4" />
      <path d="M0 193 124 90l94 75 82-101 169 128 81-44 70 36v96H0Z" fill="currentColor" opacity=".2" />
      <path d="M0 229 155 172l93 29 79-37 109 44 184-42v114H0Z" fill="currentColor" opacity=".35" />
      <path d="m284 179 4-56h18l5 56zm1-60 12-12 13 12zM0 257l181-22 179 15 260-41v71H0Z" fill="currentColor" opacity=".8" />
    </svg>
  )
}
