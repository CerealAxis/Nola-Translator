/**
 * 页面崩溃兜底。React 类组件边界，HeroUI 没有对应物。
 *
 * 落在 `EmptyState` + 标题 + 说明 + 原始错误 + 两个可点的按钮。文案遵守错误信息三要素：
 * 发生了什么（哪一步崩了）/ 用户能做什么（两个按钮）/ 可复制的错误码
 * （`errors.pageCrashed` 自带 UIP-010，页面渲染出来的原始错误也一并给出，方便直接贴进反馈）。
 *
 * `resetKey` 是调用方唯一需要关心的东西：**路由变了就清错**。没有它，一次崩溃会把整窗
 * 钉死在兜底页上，用户只能杀进程重开。
 *
 * 复制诊断走 `bridge.diagnostics.copy()`；没有注入 bridge 或通道失败时退回复制页面文本，
 * 不让"复制诊断"变成一个点了没反应的按钮。
 */

import { Component, useEffect, useRef, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Button, EmptyState } from '@heroui/react'
import { Check, Copy } from 'lucide-react'

import { useI18n } from '@/i18n'
import { getBridge } from '@/store'

/** 复制成功后按钮原地变对勾的时长。DESIGN 第 8 节：复制按钮不用 toast。 */
const COPIED_FEEDBACK_MS = 1500

export interface ErrorBoundaryProps {
  children: ReactNode
  /** 变了就清掉错误状态。传路由的 `path` 或任意能标识"换了一个页面"的字符串。 */
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
    // 渲染栈进 console 是给开发者的；界面上只给用户能复制的三要素。
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
    // 兜底内容必须能用 hook 取文案，所以委托给函数组件而不是写在 render 里。
    return <CrashFallback error={error} />
  }
}

/** 单独拆成函数组件：类组件里不能调 hook，而文案必须走 `useI18n().t()`。 */
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
        {/* 文案是"重新载入界面"，主按钮就真的重载窗口，不做一个名不副实的 reset。 */}
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
          // 通道失败不静默：退回复制页面文本，至少让用户拿得到东西。
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
