import type { ReactNode } from 'react'
import { Star } from 'lucide-react'
import { ErrorBoundary } from '@/components/primitives'
import { buttonVariants } from '@/components/ui/button'
import { useI18n, type UiLanguage } from '@/i18n'
import { useRoute } from '@/routes'
import poster from '@/assets/home-poster.png'
import { HomeFeatures } from './HomeFeatures'
import { HomeReleaseAnnouncements } from './HomeReleaseAnnouncements'
import { RecentMeetings } from './RecentMeetings'
import './home-page.css'

const posterCopy = {
  'zh-CN': { description: '免费开源的实时翻译软件', action: '点个 Star', website: '官网' },
  'zh-TW': { description: '免費開源的即時翻譯軟體', action: '點個 Star', website: '官網' },
  'zh-HK': { description: '免費開源的即時翻譯軟件', action: '點個 Star', website: '官網' },
  ja: { description: '無料で使えるオープンソースのリアルタイム翻訳ソフト', action: 'スターを付ける', website: '公式サイト' },
  ko: { description: '무료 오픈 소스 실시간 번역 소프트웨어', action: '스타 누르기', website: '공식 사이트' },
  en: { description: 'Free, open-source real-time translation software', action: 'Star on GitHub', website: 'Official website' },
} satisfies Record<UiLanguage, { description: string; action: string; website: string }>

export function HomePage(): ReactNode {
  const { language, t } = useI18n()
  const { path } = useRoute()
  const copy = posterCopy[language]

  return (
    <ErrorBoundary resetKey={path}>
      <div className="nola-home nola-home--dashboard">
        <section className="nola-home-poster" aria-labelledby="home-poster-title">
          <img src={poster} alt="" className="nola-home-poster__image" />
          <div className="nola-home-poster__copy">
            <div className="nola-home-poster__heading">
              <h1 id="home-poster-title">{t('app.name')}</h1>
              <p>{copy.description}</p>
            </div>
            <div className="flex flex-wrap gap-[var(--space-1)]">
              <a
                href="https://github.com/CerealAxis/Nola-Translator"
                target="_blank"
                rel="noreferrer"
                data-slot="button"
                data-variant="default"
                className={buttonVariants({ size: 'sm', className: 'button no-underline' })}
              >
                <Star data-icon="inline-start" aria-hidden="true" />
                {copy.action}
              </a>
              <a
                href="https://nola.xaviermc.top"
                target="_blank"
                rel="noreferrer"
                data-slot="button"
                data-variant="outline"
                className={buttonVariants({ variant: 'outline', size: 'sm', className: 'button no-underline' })}
              >
                {copy.website}
              </a>
            </div>
          </div>
        </section>
        <HomeFeatures />
        <RecentMeetings />
        <HomeReleaseAnnouncements />
      </div>
    </ErrorBoundary>
  )
}
