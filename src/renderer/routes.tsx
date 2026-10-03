/**
 * 手写 hash 路由。约 80 行，不引 react-router。
 *
 * 为什么不引：主仓是 `loadFile` 加载单页，hash 路由连服务端重写都不需要；六条路由、
 * 没有嵌套、没有参数解析库，react-router 的代价（体积、Provider、类型体操）换不回任何东西。
 *
 * 路由表（与 `bridge` 的 `RouteId` 对齐）：
 *   #/                home
 *   #/workspace       workspace
 *   #/records         records
 *   #/records/:id     record
 *   #/models          models
 *   #/settings/:tab   settings
 *
 * 路由切换只做 `opacity 0.85 -> 1` 的 160ms 淡入（`.nola-page-enter`），**不滑动**：
 * 桌面应用里横向滑动的页面切换像在演示 PPT。
 */

import { useCallback, useMemo, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { EmptyState, Spinner } from '@heroui/react'
import type { RouteId } from '@/bridge'
import { useI18n } from '@/i18n'

export type SettingsTab = 'general' | 'audio' | 'translation' | 'appearance' | 'storage' | 'advanced'

export const SETTINGS_TABS: readonly SettingsTab[] = [
  'general',
  'audio',
  'translation',
  'appearance',
  'storage',
  'advanced',
]

/** 未在表内的 tab 一律回落到 general，不进 404：设置页是横向切换，不该有"页面不存在"。 */
export const DEFAULT_SETTINGS_TAB: SettingsTab = 'general'

export interface Route {
  route: RouteId
  /** 仅 `settings` 有。 */
  tab?: SettingsTab
  /** 仅 `record` 有，是 meetingId。 */
  id?: string
  /** 规范化后的 hash，例如 `#/settings/audio`。用作过渡动画的 key。 */
  path: string
}

// -- 解析 ---------------------------------------------------------------------

export function settingsPath(tab: SettingsTab): string {
  return `#/settings/${tab}`
}

export function recordPath(id: string): string {
  return `#/records/${encodeURIComponent(id)}`
}

export function pathOf(route: RouteId, options?: { tab?: SettingsTab; id?: string }): string {
  switch (route) {
    case 'home':
      return '#/'
    case 'workspace':
      return '#/workspace'
    case 'overlay':
      return '#/overlay'
    case 'records':
      return '#/records'
    case 'record':
      return options?.id ? recordPath(options.id) : '#/records'
    case 'models':
      return '#/models'
    case 'settings':
      return options?.tab ? settingsPath(options.tab) : `#/settings/${DEFAULT_SETTINGS_TAB}`
  }
}

/**
 * 每个路由的上一级，`null` 表示"没有上一级，返回键不该出现"。
 *
 * 写成完整的 `Record` 而不是 `Partial`：新增路由时会被强制在这张表里表态，
 * 不会又漏一个"进得去出不来"的页面。应用里没有侧边导航，标题栏的返回键是唯一的退路，
 * 这张表就是那张退路的地图。
 *
 * 二级页面（记录详情、工作台、记录列表、模型、设置）一律走确定路径而不是浏览器历史：
 * 单页应用可以被深链直接打开，此时历史里没有上一条，`history.back()` 要么没反应，
 * 要么把窗口带出应用。
 */
const PARENT_ROUTES: Record<RouteId, RouteId | null> = {
  home: null,
  workspace: 'home',
  overlay: 'home',
  records: 'home',
  record: 'records',
  models: 'home',
  settings: 'home',
}

/** 当前路由的上一级路径；没有上一级时返回 null（调用方据此决定画不画返回键）。 */
export function parentPathOf(route: RouteId): string | null {
  const parent = PARENT_ROUTES[route]
  return parent ? pathOf(parent) : null
}

function normalizeTab(raw: string | undefined): SettingsTab {
  return SETTINGS_TABS.find((tab) => tab === raw) ?? DEFAULT_SETTINGS_TAB
}

export function parseRoute(hash: string): Route {
  // 去掉前导 `#`，再丢掉 query 与 hash 尾巴。桌面应用的路由没有查询串，但手输 URL 可能有。
  const withoutHash = hash.startsWith('#') ? hash.slice(1) : hash
  const [pathname] = withoutHash.split(/[?#]/)
  const segments = pathname.split('/').filter((segment) => segment.length > 0)

  if (segments.length === 0) return { route: 'home', path: '#/' }

  switch (segments[0]) {
    case 'workspace':
      return { route: 'workspace', path: '#/workspace' }
    case 'overlay':
      return { route: 'overlay', path: '#/overlay' }
    case 'records': {
      const id = segments[1]
      if (id === undefined) return { route: 'records', path: '#/records' }
      const decoded = safeDecode(id)
      return { route: 'record', id: decoded, path: `#/records/${id}` }
    }
    case 'models':
      return { route: 'models', path: '#/models' }
    case 'settings': {
      const tab = normalizeTab(segments[1])
      return { route: 'settings', tab, path: `#/settings/${tab}` }
    }
    case 'home':
      return { route: 'home', path: '#/' }
    default:
      // 认不出来的路径回首页，不渲染"页面不存在"：这个应用里没有 404 这个概念。
      return { route: 'home', path: '#/' }
  }
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    // 手输了非法的百分号编码，原样当 id 用比抛异常好。
    return value
  }
}

// -- 订阅 ---------------------------------------------------------------------

const listeners = new Set<() => void>()
let cachedHash: string | null = null
let cachedRoute: Route | null = null

function readHash(): string {
  return typeof window === 'undefined' ? '' : window.location.hash
}

/** 快照按 hash 缓存，保证同一帧内多次读拿到的是同一个对象引用。 */
function getSnapshot(): Route {
  const hash = readHash()
  if (hash === cachedHash && cachedRoute !== null) return cachedRoute
  cachedHash = hash
  cachedRoute = parseRoute(hash)
  return cachedRoute
}

function notify(): void {
  for (const listener of [...listeners]) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (listeners.size === 1 && typeof window !== 'undefined') {
    window.addEventListener('hashchange', notify)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && typeof window !== 'undefined') {
      window.removeEventListener('hashchange', notify)
    }
  }
}

export interface UseRoute extends Route {
  /** 跳到某个路径，接受 `#/records/xxx` 或 `/records/xxx`。 */
  navigate: (path: string) => void
  /** 走浏览器历史。路由跳转都该用它，反馈才用 `navigate`。 */
  back: () => void
}

export function useRoute(): UseRoute {
  const route = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const navigate = useCallback((path: string) => {
    if (typeof window === 'undefined') return
    const target = path.startsWith('#') ? path : `#${path.startsWith('/') ? '' : '/'}${path}`
    if (window.location.hash === target) return
    window.location.hash = target
  }, [])

  const back = useCallback(() => {
    if (typeof window === 'undefined') return
    window.history.back()
  }, [])

  return useMemo(() => ({ ...route, navigate, back }), [route, navigate, back])
}

// -- 渲染 ---------------------------------------------------------------------

/** 路由 id 到页面标题。文案是页面自己的名字，不是"占位"两个字。 */
const ROUTE_TITLES: Record<RouteId, 'nav.home' | 'nav.workspace' | 'nav.records' | 'nav.models' | 'nav.settings' | 'shellUi.overlay'> = {
  home: 'nav.home',
  workspace: 'nav.workspace',
  overlay: 'shellUi.overlay',
  records: 'nav.records',
  record: 'nav.records',
  models: 'nav.models',
  settings: 'nav.settings',
}

export interface RoutesProps {
  /**
   * 页面映射。**允许缺 key**：feature 组件还没写完时缺一个页面不该让整窗崩掉，
   * 缺的那个位置渲染占位（页面名 + Spinner），feature 组件接上就自动消失。
   * 因此这里是 `Partial` 而不是完整 `Record`。
   */
  pages: Partial<Record<RouteId, () => ReactNode>>
}

export function Routes({ pages }: RoutesProps): ReactNode {
  const { route, path } = useRoute()
  const { t } = useI18n()
  const render = pages[route]

  return (
    <div
      // key 用 path：同一路由换 tab 也算一次进入，淡入才会重新播。
      key={path}
      data-page={route}
      className="nola-page-enter nola-route-content"
    >
      {render ? render() : <MissingPage title={t(ROUTE_TITLES[route])} label={t('common.loading')} />}
    </div>
  )
}

function MissingPage({ title, label }: { title: string; label: string }): ReactNode {
  return (
    <EmptyState className="flex flex-col items-start gap-4 py-8">
      <h1 className="nola-display text-foreground">{title}</h1>
      <p className="nola-caption flex items-center gap-2">
        <Spinner size="sm" />
        {label}
      </p>
    </EmptyState>
  )
}
