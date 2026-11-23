import { ArrowLeft } from 'lucide-react'
import { Fragment, useEffect, useRef, type ComponentProps, type ReactNode } from 'react'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'

export const textProcessingPath = '#/settings/text-processing'

export interface BreadcrumbEntry {
  label: string
  href?: string
}

export function ProcessingIconButton({
  label, children, nativeButton, ...props
}: ComponentProps<typeof Button> & { label: string }) {
  return (
    <Button variant="bare" size="icon-sm" nativeButton={nativeButton}
      role={nativeButton === false ? 'link' : undefined}
      type={nativeButton === false ? undefined : 'button'} aria-label={label} title={label} {...props}>
      {children}
    </Button>
  )
}

export function ProcessingPageHeading({
  title, back, actions, breadcrumbs,
}: {
  title: string
  back: string | (() => void)
  actions?: ReactNode
  breadcrumbs?: readonly BreadcrumbEntry[]
}) {
  const { t } = useI18n()
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [title])
  return (
    <div className="flex min-w-0 flex-col gap-[var(--description-gap)]">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumb aria-label={t('suite.textProcessing')}>
          <BreadcrumbList>
            {breadcrumbs.map((crumb, index) => (
              <Fragment key={`${crumb.label}-${index}`}>
                {index > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {crumb.href ? (
                    <a className="transition-colors hover:text-foreground" href={crumb.href}>{crumb.label}</a>
                  ) : (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      )}
      <header className="processing-page-heading">
        <div className="processing-heading-title">
          {typeof back === 'string' ? (
            <ProcessingIconButton label={t('suite.back')} nativeButton={false} render={<a href={back} />}>
              <ArrowLeft />
            </ProcessingIconButton>
          ) : (
            <ProcessingIconButton label={t('suite.back')} onClick={back}><ArrowLeft /></ProcessingIconButton>
          )}
          <h1 id="settings-heading" ref={heading} tabIndex={-1} className="settings-page__heading">{title}</h1>
        </div>
        {actions && <div className="text-processing-actions">{actions}</div>}
      </header>
    </div>
  )
}
