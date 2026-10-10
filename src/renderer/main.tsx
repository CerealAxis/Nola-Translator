import { ModelCapabilityNotices } from './features/models/ModelCapabilityNotices'
import './index.css'
import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { Alert, Button, Toast } from '@heroui/react'
import { Home, Mic, Captions, Clock, SlidersHorizontal, Settings, Video } from 'lucide-react'
import { createIpcBridge, isIpcBridgeAvailable } from './bridge/ipc/ipcBridge'
import { I18nProvider, useI18n } from './i18n'
import { AppShell, ErrorBoundary } from './components/primitives'
import { Routes, useRoute } from './routes'
import { disposeStores, initStores, isEngineConnected, stores, useStore } from './store'
import { HomePage } from './features/home'
import { RecordsPage, RecordDetailPage } from './features/records'
import { WorkspacePage } from './features/workspace'
import { OverlayRoot } from './features/overlay'
import { OverlayPage } from './features/overlay/OverlayPage'
import { VideoCaptionsPage } from './features/video-captions/VideoCaptionsPage'
import { ModelsPage } from './features/models'
import { SettingsPage } from './features/settings'
import { RuntimeNotice } from './features/settings/RuntimeNotice'
import { AppUpdateNotice } from './features/settings/AppUpdateNotice'

/*
 * 桥接的唯一挂载点。
 *
 * 整个应用里只有这一段知道"背后是 IPC 桥接而不是 mock" —— 原型那版在这里挂
 * `createDemoBridge()`，现在换成 `createIpcBridge()`，组件一个字都没改。
 * 组件永远不 import `bridge/ipc/*`，只 import `@/bridge` 与 `@/store`。
 *
 * "背后到底有没有引擎"这个判断也只在这里做一次（`isIpcBridgeAvailable()`），结果同时喂给
 * `initStores`（决定要不要发首屏拉取）和下面那条横幅。分两处判断过一次，迟早会有一次忘了同步：
 * 一边开始拉数据、另一边安静如常，比一直坏着更难查。
 */

/** `?overlay=1` 走悬浮字幕的独立文档分叉，对齐主仓旧 `main.tsx` 的做法。 */
const isOverlayDocument = new URLSearchParams(window.location.search).get('overlay') === '1'
const bridge = createIpcBridge()
initStores(bridge, { engineConnected: isIpcBridgeAvailable(), backgroundChecks: !isOverlayDocument })

/** 页面表。四个 feature 都自己读路由取 id / tab，所以这里一律无 props。 */
const PAGES = {
  home: () => <HomePage />,
  workspace: () => <WorkspacePage />,
  overlay: () => <OverlayPage />,
  'video-captions': () => <VideoCaptionsPage />,
  records: () => <RecordsPage />,
  record: () => <RecordDetailPage />,
  models: () => <ModelsPage />,
  settings: () => <SettingsPage />
} as const

/**
 * 浮窗点「字幕外观」→ 主窗跳到对应设置页。
 *
 * 链路是三跳：浮窗调 `openAppearance('appearance')` → 主进程 `app:open-appearance` →
 * 主进程再 `app:appearance-requested` 推给**所有**渲染进程 → 主窗这份订阅收到并改 hash。
 *
 * 载荷要带目标 hash 而不只是路由 id：四个页面里 `appearance` 与 `translation` 都落在
 * `settings` 路由上，只给 id 分不出该开哪个 tab（这正是原型 `OVERLAY_PAGE_TO_ROUTE` 抄错的地方）。
 *
 * **只在主窗订阅**：浮窗自己没有 hash 路由，收到也是空转。
 */
function useOverlayNavigation(): void {
  const { navigate } = useRoute()
  useEffect(() => {
    if (isOverlayDocument) return
    return bridge.events.onOverlayRequest((_route, path) => navigate(path))
  }, [navigate])
}

/**
 * 没连上引擎时的横幅。
 *
 * 这个状态在正式版不存在（总有 preload），它真实存在的地方是 e2e 截图脚本、浏览器里开
 * `out/renderer/index.html`、以及打包漏掉 preload 的那一次。**正因为少见，它才必须自己会说话**：
 * 以前这个状态下界面停在启动画面，"正在加载"骗了四秒钟，然后 `test:ui` 截到一张只有 logo 的图
 * 还退出码 0。现在界面照常渲染（各页显示自己的空态），顶上这一条讲清楚"不是加载中，是没连上"。
 *
 * 动作复用 `errors.pageCrashedAction`：preload 每次导航都会重新注入，"重新载入界面"就是正解，
 * 不另造一条意思相同的 key 让两份文案各自漂移。
 */
function EngineDisconnectedNotice() {
  const { t } = useI18n()
  return (
    // 贴着 `.nola-route-content` 的居中与内边距，两者上下相邻才不会错位。
    <div className="mx-auto w-full min-w-0 max-w-[var(--nola-content-max)] px-[var(--nola-page-padding)] pt-[var(--nola-page-padding)]">
      <Alert status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title className="nola-body-strong">{t('errors.engineNotConnected')}</Alert.Title>
          <Alert.Description className="nola-caption">
            <Button
              variant="tertiary"
              size="sm"
              className="rounded-[6px]"
              onPress={() => window.location.reload()}
            >
              {t('errors.pageCrashedAction')}
            </Button>
          </Alert.Description>
        </Alert.Content>
      </Alert>
    </div>
  )
}

/** 侧边栏导航 + 路由联动 */
function Shell() {
  const { route, navigate } = useRoute()
  const { t } = useI18n()
  useOverlayNavigation()

  const navigation = [
    {
      id: 'home',
      label: t('nav.home'),
      icon: Home,
      path: '#/',
      active: route === 'home',
      onPress: () => navigate('#/'),
    },
    {
      id: 'workspace',
      label: t('nav.workspace'),
      icon: Mic,
      path: '#/workspace',
      active: route === 'workspace',
      onPress: () => navigate('#/workspace'),
    },
    {
      id: 'overlay',
      label: t('shellUi.overlay'),
      icon: Captions,
      path: '#/overlay',
      active: route === 'overlay',
      onPress: () => navigate('#/overlay'),
    },
    {
      id: 'video-captions',
      label: t('videoCaptions.title'),
      icon: Video,
      path: '#/video-captions',
      active: route === 'video-captions',
      onPress: () => navigate('#/video-captions'),
    },
    {
      id: 'records',
      label: t('nav.records'),
      icon: Clock,
      path: '#/records',
      active: route === 'records' || route === 'record',
      onPress: () => navigate('#/records'),
    },
    {
      id: 'models',
      label: t('nav.models'),
      icon: SlidersHorizontal,
      path: '#/models',
      active: route === 'models',
      onPress: () => navigate('#/models'),
    },
    {
      id: 'settings',
      label: t('nav.settings'),
      icon: Settings,
      path: '#/settings/appearance',
      active: route === 'settings',
      onPress: () => navigate('#/settings/appearance'),
    },
  ]

  return (
    <AppShell navigation={navigation}>
      {isEngineConnected() ? null : <EngineDisconnectedNotice />}
      <Routes pages={PAGES} />
    </AppShell>
  )
}

/**
 * 启动画面的退场。
 *
 * 退场时机会写在 index.html 那段 <style> 里（进场 240ms / 退场 120ms），
 * 这里只负责加标记和移除节点，120ms 必须与 CSS 对齐，不要单方面改。
 *
 * 为什么用 useEffect 而不是 render 里直接调：useEffect 在 React commit 之后、
 * 浏览器绘制之后才跑。render 阶段调会让 splash 在 React 的第一帧之前就消失，
 * 用户看到"Logo 闪一下 → 白底 → 应用"，比不做启动画面更糟。
 */
const SPLASH_EXIT_MS = 120

function dismissSplash() {
  const splash = document.getElementById('splash')
  // 字幕文档里它被 CSS 隐藏（html.is-overlay），getElementById 仍会命中，
  // 移除掉是干净的收尾，不会报错。
  if (!splash) return
  splash.setAttribute('data-exit', '')
  window.setTimeout(() => splash.remove(), SPLASH_EXIT_MS)
}

/** Release the splash after the component check and base engine settle; settings remain available on failure. */
function useSplashUntilEngineSettles(): void {
  const engineStatus = useStore(stores.session, (state) => state.engineStatus)
  const settled = !isIpcBridgeAvailable() || engineStatus === 'ready' || engineStatus === 'failed'

  useEffect(() => {
    if (settled) dismissSplash()
  }, [settled])
}

function Root() {
  useSplashUntilEngineSettles()
  useEffect(() => {
    const teardown = () => {
      void disposeStores()
    }
    window.addEventListener('beforeunload', teardown)
    return () => window.removeEventListener('beforeunload', teardown)
  }, [])

  if (isOverlayDocument) {
    return (
      <ErrorBoundary>
        <OverlayRoot />
        <ModelCapabilityNotices />
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
      <Shell />
      <ModelCapabilityNotices />
      <RuntimeNotice />
      <AppUpdateNotice />
    </ErrorBoundary>
  )
}

/*
 * 首次挂载用 `flushSync` 同步出第一帧。
 *
 * 不加它的时候，concurrent React 会把初次渲染排到调度器任务里，**排在 `load` 事件之后**
 * （实测：load 在 677ms，首帧 commit 在 load 之后 310~344ms）。主进程是
 * `ready-to-show` → `show()`，而 `ready-to-show` 跟的是首帧绘制，于是窗口亮起来的瞬间
 * 摆着的必然是启动画面，之后还要再等 430ms（310ms 渲染 + 120ms 退场）应用才顶上来。
 *
 * 启动画面的职责是"盖住文档画完到应用画完之间那段空窗"，越过 `load` 继续挂着就越过了职责：
 * 那一刻文档已经画完了。同步渲染不引入额外工作，只是把这 310ms 从 load 之后挪到之前 ——
 * 没有输入需要响应、整棵树只渲染一次、这段时间里用户看到的仍然是启动画面。
 */
flushSync(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Toast.Provider />
      <I18nProvider>
        <Root />
      </I18nProvider>
    </StrictMode>
  )
})
