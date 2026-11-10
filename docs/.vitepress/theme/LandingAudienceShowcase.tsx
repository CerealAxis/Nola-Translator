import { useRef, useState, type CSSProperties } from 'react'
import { Sparkles } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../src/renderer/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../src/renderer/components/ui/tabs'
import { LandingAudienceArt } from './LandingAudienceArt'

import { landingContent } from './landing-content'
import type { Locale } from './content'

export function LandingAudienceShowcase({ locale }: { locale: Locale }) {
  const content = landingContent[locale]
  const audiences = content.audiences
  const [active, setActive] = useState(0)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  return (
    <section id="scenarios" className="site-section site-audience" aria-labelledby="site-audience-title">
      <div className="site-heading site-shell" data-reveal="section">
        <h2 id="site-audience-title">{content.audienceHeading}</h2>
      </div>
      <Tabs value={active} onValueChange={value => setActive(Number(value))} data-reveal="section">
        <TabsList className="site-audience-tabs" aria-label={content.audienceLabel} activateOnFocus>
          {audiences.map(({ id, label }, index) => (
            <TabsTrigger key={id} value={index} ref={tab => { tabRefs.current[index] = tab }}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="site-audience-deck">
          {audiences.map((audience, index) => {
            const count = audiences.length
            const distance = (index - active + count) % count
            const offset = distance > count / 2 ? distance - count : distance
            const selected = offset === 0
            const adjacent = Math.abs(offset) === 1

            return (
              <div
                key={audience.id}
                className="site-audience-slide"
                data-position={selected ? 'center' : adjacent ? 'side' : 'offstage'}
                data-audience={audience.id}
                style={{ '--audience-offset': offset } as CSSProperties}
              >
                {/* Keep neighboring cards visible while Base UI keeps their content inert. */}
                <TabsContent value={index} keepMounted hidden={false} aria-hidden={!selected}>
                  <Card className="site-audience-card">
                    <CardContent className="site-audience-art">
                      <div className="site-audience-scene" aria-hidden="true">
                        <LandingAudienceArt audience={audience.id} />
                      </div>
                      <ul className="site-audience-keywords" aria-label={content.keywordsLabel}>
                        {audience.keywords.map(keyword => <li key={keyword}>{keyword}</li>)}
                      </ul>
                    </CardContent>
                    <CardHeader className="site-audience-copy">
                      <CardTitle role="heading" aria-level={3}>{audience.title}</CardTitle>
                      <CardDescription>{audience.description}</CardDescription>
                    </CardHeader>
                    <Sparkles className="site-audience-sparkles" aria-hidden="true" strokeWidth={1.2} />
                  </Card>
                </TabsContent>
                {adjacent && (
                  <button
                    type="button"
                    className="site-audience-side-trigger"
                    aria-label={content.viewAudience(audience.label)}
                    onClick={() => {
                      setActive(index)
                      tabRefs.current[index]?.focus()
                    }}
                  />
                )}
              </div>
            )
          })}
        </div>
      </Tabs>
    </section>
  )
}
