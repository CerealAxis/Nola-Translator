import { useState, type ReactNode } from 'react'
import { ArrowLeft, ImageOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ImageGeneration } from '@/components/assistant-ui/native/image-generation'
import { Skeleton } from '@/components/ui/skeleton'
import { useI18n } from '@/i18n'

export function ComicImage({
  src,
  alt,
  loading = true,
  failed,
  retry,
  fallback,
  aspectRatio,
  showStatus = false,
  processing,
}: {
  src?: string
  alt: string
  loading?: boolean
  failed?: boolean
  retry?: () => void
  fallback?: ReactNode
  aspectRatio?: string
  showStatus?: boolean
  processing?: string
}) {
  const { t } = useI18n()
  const [result, setResult] = useState<{ src: string; loaded: boolean }>()
  const decoded = src && result?.src === src ? result.loaded : undefined
  const status = processing
    ? 'processing'
    : failed || decoded === false || (!src && !loading)
      ? 'unavailable'
      : decoded ? 'ready' : 'loading'

  return (
    <div
      className="comic-image"
      style={{ aspectRatio }}
      data-state={status}
      aria-busy={status === 'loading' || undefined}
    >
      {src && status !== 'unavailable' && status !== 'processing' && (
        <img
          key={src}
          src={src}
          alt={alt}
          draggable={false}
          onLoad={() => setResult({ src, loaded: true })}
          onError={() => setResult({ src, loaded: false })}
        />
      )}
      {status === 'processing' ? (
        <ImageGeneration label={showStatus ? processing : undefined} />
      ) : status === 'unavailable' ? (
        <div className="comic-image__fallback">
          {retry ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setResult(undefined)
                retry()
              }}
            >
              {t('suite.retry')}
            </Button>
          ) : fallback ?? <ImageOff aria-hidden="true" />}
        </div>
      ) : (
        <Skeleton className="comic-loading-skeleton comic-image__placeholder" aria-hidden="true" />
      )}
      {showStatus && status === 'loading' && (
        <span className="comic-image__status">{t('common.loading')}</span>
      )}
    </div>
  )
}

export function ComicBooksLoading() {
  const { t } = useI18n()
  return (
    <div className="comic-bookshelf-loading" role="status" aria-label={t('common.loading')}>
      <Skeleton className="comic-loading-skeleton comic-bookshelf-loading__search" aria-hidden="true" />
      <div className="comic-bookshelf" aria-hidden="true">
        {[0, 1, 2, 3].map((item) => (
          <Skeleton key={item} className="comic-loading-skeleton comic-bookshelf-loading__cover" />
        ))}
      </div>
    </div>
  )
}

export function ComicProjectLoading({ comparison = false }: { comparison?: boolean }) {
  const { t } = useI18n()
  return (
    <div className="comic-page comic-page--workspace comic-page--reader">
      <section className="comic-canvas">
        <div className="comic-canvas__toolbar">
          <Button
            variant="bare"
            size="icon-sm"
            aria-label={t('suite.bookshelf')}
            onClick={() => {
              location.hash = '/comic-translation'
            }}
          >
            <ArrowLeft />
          </Button>
        </div>
        <div
          className="comic-canvas__scroll comic-project-loading"
          data-reader
          role="status"
          aria-label={t('common.loading')}
        >
          <div className="comic-project-loading__page">
            <Skeleton className="comic-loading-skeleton absolute inset-0" aria-hidden="true" />
            <span className="comic-image__status" aria-hidden="true">{t('common.loading')}</span>
          </div>
          {comparison && (
            <Skeleton className="comic-loading-skeleton comic-project-loading__page" aria-hidden="true" />
          )}
        </div>
      </section>
    </div>
  )
}
