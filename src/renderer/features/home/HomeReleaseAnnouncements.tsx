import { useEffect, useState } from 'react'
import { ArrowRight, ChevronRight, Newspaper } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { notifyError } from '@/components/primitives/notify'
import { useI18n } from '@/i18n'
import { actions, getBridge } from '@/store'
import type { ReleaseAnnouncement } from '../../../shared/app-updates'
import { ReleaseNotesMarkdown } from '../settings/AppUpdateNotice'
import { HomeListRow } from './HomeListRow'

const copyByLanguage = {
  'zh-CN': {
    heading: '版本动态', open: '打开公告', announcement: '更新公告', github: '在 GitHub 查看', empty: '暂无版本公告。', replay: '再次查看教程',
  },
  'zh-TW': {
    heading: '版本動態', open: '開啟公告', announcement: '更新公告', github: '在 GitHub 查看', empty: '暫無版本公告。', replay: '再次查看教學',
  },
  'zh-HK': {
    heading: '版本動態', open: '開啟公告', announcement: '更新公告', github: '在 GitHub 查看', empty: '暫無版本公告。', replay: '再次查看教學',
  },
  en: {
    heading: 'Release notes', open: 'Open announcement', announcement: 'Release notes',
    github: 'View on GitHub', empty: 'No release announcements yet.', replay: 'View tutorial again',
  },
  ja: {
    heading: 'リリース情報', open: '更新情報を開く', announcement: 'リリースノート',
    github: 'GitHub で表示', empty: 'リリースのお知らせはありません。', replay: 'ガイドをもう一度見る',
  },
  ko: {
    heading: '릴리스 소식', open: '공지 열기', announcement: '릴리스 노트',
    github: 'GitHub에서 보기', empty: '릴리스 공지가 없습니다.', replay: '튜토리얼 다시 보기',
  },
}

type ReleaseFeed =
  | { status: 'loading' | 'error' }
  | { status: 'ready'; releases: readonly ReleaseAnnouncement[] }

function HomeReleaseRow({ release }: { release: ReleaseAnnouncement }) {
  const { language, t } = useI18n()
  const { open, announcement, github, replay } = copyByLanguage[language]
  const [opening, setOpening] = useState(false)
  const date = new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(new Date(release.publishedAt))
  const published = <time dateTime={release.publishedAt}>{date}</time>
  const title = language === 'en' ? announcement + ' ' + release.tag : release.tag + ' ' + announcement

  async function openOnGitHub() {
    setOpening(true)
    try {
      const bridge = getBridge()
      if (!bridge) throw new Error('Release browser bridge unavailable')
      await bridge.app.openReleasePage(release.url)
    } catch (error) {
      notifyError(t('appUpdate.openFailed'), { cause: error })
    } finally {
      setOpening(false)
    }
  }

  return (
    <Dialog>
      <HomeListRow
        icon={Newspaper}
        title={release.tag}
        detail={published}
        action={
          <DialogTrigger
            render={<Button variant="outline" size="sm" />}
            aria-label={open + ' ' + release.tag}
          >
            {open}<ChevronRight data-icon="inline-end" aria-hidden="true" />
          </DialogTrigger>
        }
      />
      <DialogContent className="app-update-dialog modal__dialog--lg">
        <DialogHeader className="app-update-dialog-header">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{published}</DialogDescription>
        </DialogHeader>
        <div className="app-update-dialog-body nola-scrollbar flex-1" role="region" aria-label={t('appUpdate.notes')} tabIndex={0}>
          {release.notes.trim()
            ? <ReleaseNotesMarkdown notes={release.notes} releaseUrl={release.url} />
            : <p className="nola-body">{t('appUpdate.notesUnavailable')}</p>}
        </div>
        <DialogFooter className="app-update-dialog-footer">
          <DialogClose render={<Button variant="outline" size="sm" onClick={() => actions.settings.startOnboarding('welcome')}>{replay}</Button>} />
          <DialogClose render={<Button variant="outline" size="sm">{t('common.close')}</Button>} />
          <Button size="sm" disabled={opening} onClick={() => void openOnGitHub()}>
            {github}<ArrowRight data-icon="inline-end" aria-hidden="true" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function HomeReleaseAnnouncements() {
  const { language, t } = useI18n()
  const { heading, empty } = copyByLanguage[language]
  const [feed, setFeed] = useState<ReleaseFeed>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    const request = getBridge()?.app.listRecentReleases?.()
    if (!request) {
      setFeed({ status: 'error' })
      return
    }
    void request.then(
      releases => { if (active) setFeed({ status: 'ready', releases }) },
      () => { if (active) setFeed({ status: 'error' }) },
    )
    return () => { active = false }
  }, [attempt])

  function retry() {
    setFeed({ status: 'loading' })
    setAttempt(value => value + 1)
  }

  return (
    <section className="nola-home-section" aria-labelledby="nola-home-releases-title">
      <h2 id="nola-home-releases-title" className="nola-home-section__heading">{heading}</h2>
      <Card>
        <CardContent>
          {feed.status === 'loading' && <p className="nola-body" role="status">{t('common.loading')}</p>}
          {feed.status === 'error' && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="nola-body" role="status">{t('appUpdate.checkFailed')}</p>
              <Button variant="outline" size="sm" onClick={retry}>{t('common.retry')}</Button>
            </div>
          )}
          {feed.status === 'ready' && (feed.releases.length > 0 ? (
            <ul className="m-0 list-none p-0" aria-label={heading}>
              {feed.releases.map((release, index) => (
                <li key={release.tag}>
                  {index > 0 && <Separator />}
                  <HomeReleaseRow release={release} />
                </li>
              ))}
            </ul>
          ) : <p className="nola-body">{empty}</p>)}
        </CardContent>
      </Card>
    </section>
  )
}
