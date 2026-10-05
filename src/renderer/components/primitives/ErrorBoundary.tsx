/**
 * Page crash fallback, implemented as a React class boundary.
 *
 * `resetKey` is the only thing callers supply; without it a crash pins the window
 * to this fallback. Copy follows the three parts of an error message — what broke,
 * what the user can do, a copyable code — and the copy button falls back to the
 * page text when the diagnostics channel is missing or throws.
 */

import { Component, useEffect, useRef, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Button, EmptyState } from '@heroui/react'
import { Check, Copy } from 'lucide-react'

import { useI18n } from '@/i18n'
import { getBridge } from '@/store'

/** How long the button shows a checkmark. The feedback is inline, not a toast. */
const COPIED_FEEDBACK_MS = 1500

export interface ErrorBoundaryProps {
  children: ReactNode
  /** Clears the error when it changes. Pass the route path or any page identity. */
  resetKey?: string
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // The render stack goes to the console for developers; the UI gets the three parts.
    console.error('[nola] page crashed', error, info.componentStack)
  }

  override componentDidUpdate(previous: ErrorBoundaryProps): void {
    if (this.state.error !== null && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  override render(): ReactNode {
    const { error } = this.state
    if (error === null) return this.props.children
    // The fallback needs hooks for its copy, so it lives in a function component, not inline.
    return <CrashFallback error={error} />
  }
}

/** Separate component: a class cannot call hooks, and the copy must go through `useI18n`. */
function CrashFallback({ error }: { error: Error }): ReactNode {
  const { t } = useI18n()

  return (
    <EmptyState className="flex flex-col items-start gap-4 py-8">
      <h1 className="nola-display text-foreground">{t('status.error')}</h1>
      <p className="nola-body max-w-[var(--nola-content-max)] text-muted">{t('errors.pageCrashed')}</p>

      <pre className="nola-mono w-full max-w-[var(--nola-content-max)] overflow-x-auto rounded-[8px] bg-surface-tertiary p-4 text-left text-[12.5px] leading-[1.5] text-muted">
        {error.message || error.name}
      </pre>

      <div className="flex flex-wrap items-center gap-2">
        {/* The copy says "reload the window", so the primary action really reloads it. */}
        <Button
          variant="primary"
          size="md"
          className="rounded-full px-5"
          onPress={() => {
            if (typeof window !== 'undefined') window.location.reload()
          }}
        >
          {t('errors.pageCrashedAction')}
        </Button>
        <CopyDiagnosticsButton />
      </div>
    </EmptyState>
  )
}

function CopyDiagnosticsButton(): ReactNode {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!copied) return
    timer.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS)
    return () => {
      if (timer.current !== null) clearTimeout(timer.current)
    }
  }, [copied])

  const onPress = (): void => {
    void (async () => {
      const bridge = getBridge()
      if (bridge) {
        try {
          await bridge.diagnostics.copy()
          setCopied(true)
          return
        } catch {
        // A failed channel falls back to copying the page text rather than failing silently.
        }
      }
      try {
        await navigator.clipboard.writeText(document.body.innerText)
        setCopied(true)
      } catch {
        setCopied(false)
      }
    })()
  }

  return (
    <Button variant="tertiary" size="sm" className="rounded-[6px]" onPress={onPress} isDisabled={copied}>
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {copied ? t('settings.copied') : t('errors.copyDiagnosticsAction')}
    </Button>
  )
}
