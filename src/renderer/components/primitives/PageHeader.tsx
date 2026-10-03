/**
 * 页面头部：标题 + 可选副标题 + 右侧动作插槽。24px 页面标题，24px 下边距。
 *
 * **副标题是可选项且默认为空。** copy 纪律里最容易违反的一条就是补一句复述标题的说明
 * （"存储与下载 / 管理你的存储与下载设置"）。所以这里不提供 `subtitle` 的默认值，
 * 传了就渲染，不传就一个 `<p>` 都不生成。
 *
 * 这不是 HeroUI `Header`：Header 不处理"标题 + 可选副标题 + 右侧动作"这一组合，
 * 也不管 24px 的页面标题字阶。
 */

import type { ReactNode } from 'react'

export interface PageHeaderProps {
  /** 页面标题，24px / 600。唯一带负字距的档。 */
  title: ReactNode
  /** 副标题，**默认不渲染**。只有能回答"这句话告诉用户了什么他不知道的事"时才传。 */
  subtitle?: ReactNode
  /** 右侧动作区。一屏最多一个 `variant="primary"`。 */
  actions?: ReactNode
  className?: string
  /**
   * 块内间距，单位 px，且**只接受 4 / 8 / 12** 这三档。
   * 写不出 6px：间距只有 4px 基数这一条，没有 6px 那个位置。
   */
  gap?: 4 | 8 | 12
}

const GAP_CLASS: Record<4 | 8 | 12, string> = {
  4: 'gap-1',
  8: 'gap-2',
  12: 'gap-3',
}

export function PageHeader({ title, subtitle, actions, className, gap = 4 }: PageHeaderProps) {
  const hasSubtitle = subtitle !== undefined && subtitle !== null && subtitle !== ''

  return (
    <header className={['flex min-w-0 flex-col', GAP_CLASS[gap], className ?? ''].filter(Boolean).join(' ')}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="nola-display min-w-0 text-foreground">{title}</h1>
          {hasSubtitle ? <p className="nola-body min-w-0 text-muted">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  )
}
