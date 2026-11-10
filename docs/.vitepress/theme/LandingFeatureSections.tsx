import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { Badge } from '../../../src/renderer/components/ui/badge'
import { LandingAudienceShowcase } from './LandingAudienceShowcase'
import { LandingBrandMarquee } from './LandingBrandMarquee'
import { LandingFeatureDownload } from './LandingFeatureDownload'

import { landingContent } from './landing-content'
import type { Locale } from './content'

export function LandingFeatureSections({ locale }: { locale: Locale }) {
  return (
    <>
      <LandingAudienceShowcase locale={locale} />
      <LandingBrandMarquee locale={locale} />
      <LandingFeatureDetails locale={locale} />
    </>
  )
}

function LandingFeatureDetails({ locale }: { locale: Locale }) {
  const content = landingContent[locale]
  const features = content.features
  const railRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState<number | null>(null)

  useLayoutEffect(() => {
    const rail = railRef.current
    const frame = frameRef.current
    if (!rail || !frame) return

    const motion = window.matchMedia('(min-width: 761px) and (min-height: 640px) and (prefers-reduced-motion: no-preference)')
    let pending = 0

    const update = () => {
      pending = 0
      const travel = rail.offsetHeight - frame.offsetHeight
      if (!motion.matches || travel <= 0) {
        frame.style.removeProperty('--feature-progress')
        setActive(null)
        return
      }

      const distance = frame.getBoundingClientRect().top - rail.getBoundingClientRect().top
      const count = features.length
      const progress = Math.min(count, Math.max(0, distance / travel * count))
      frame.style.setProperty('--feature-progress', String(progress))
      setActive(Math.min(count - 1, Math.floor(progress)))
    }

    const schedule = () => {
      if (motion.matches && !pending) pending = window.requestAnimationFrame(update)
    }

    const syncMotion = () => {
      if (pending) window.cancelAnimationFrame(pending)
      rail.dataset.sequenced = String(motion.matches)
      update()
    }

    syncMotion()
    motion.addEventListener('change', syncMotion)
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)

    return () => {
      if (pending) window.cancelAnimationFrame(pending)
      motion.removeEventListener('change', syncMotion)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [features.length])

  return (
    <section id="features" className="site-shell site-section site-feature-preview" aria-labelledby="features-title">
      <div className="site-heading" data-reveal="section">
        <h2 id="features-title">{content.featureHeading}</h2>
        <p>{content.featureIntro}</p>
      </div>
      <div
        ref={railRef}
        className="site-feature-preview-rail"
        style={{ '--feature-count': features.length } as CSSProperties}
      >
        <div ref={frameRef} className="site-feature-preview-frame">
          <div className="site-feature-preview-list" data-reveal="section">
            {features.map(({ id, title, description, experimental }, index) => (
              <article
                className="site-feature-preview-row"
                aria-labelledby={`${id}-title`}
                data-visible={active === null || index === active || index === active + 1}
                style={{ '--feature-index': index } as CSSProperties}
                key={id}
              >
                <div className="site-feature-preview-copy">
                  <div className="site-feature-preview-title">
                    <h3 id={`${id}-title`}>{title}</h3>
                    {experimental && <Badge variant="warning">{content.experimentalLabel}</Badge>}
                  </div>
                  <p>{description}</p>
                  <LandingFeatureDownload label={content.startDownload} tabIndex={active === null || active === index ? undefined : -1} />
                </div>
                <div className="site-feature-preview-stage" aria-hidden="true">
                  <div className="site-feature-preview-mat">
                    <div className="site-feature-preview-window" />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
