/** 快速同传工作台：由会话 store 驱动，布局受主内容区约束。 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Alert, AlertDialog, Button, Card, EmptyState, toast } from '@heroui/react'
import { Captions } from 'lucide-react'

import { findMissingResource } from '@/store'
import type { MissingResource, SessionState } from '@/store'
import { ENGINE_LOST_CODE, actions, getBridge, sessionStore, stores, useStore } from '@/store'
import { CaptionStage } from '@/components/caption'
import type { CaptionDisplayMode, CaptionLayout } from '@/components/caption'
import { NotesPanel } from '@/components/notes'
import { useI18n } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { recordPath, useRoute } from '@/routes'

import { PreflightDialog } from './PreflightDialog'
import { SessionBar } from './SessionBar'
import { SessionSetupDialog } from './SessionSetupDialog'
import type { SetupDraft } from './SessionSetupDialog'
import { WorkspaceToolbar } from './WorkspaceToolbar'
import './workspace.css'

/** 工作台默认阅读字号16px，允许缩小或放大一档。 */
const FONT_STEPS = [14, 16, 18] as const

/** 笔记区在窗口 < 1000px 时折叠为拉手（DESIGN 第 14.2 节）。 */
const NOTES_COLLAPSE_PX = 1000

export function WorkspacePage() {
  const { t, language } = useI18n()
  const { navigate } = useRoute()

  const session = useStore(sessionStore, (state) => state)
  const settings = useStore(stores.settings, (state) => state.settings)
  const devices = useStore(stores.models, (state) => state.devices)
  const resources = useStore(stores.models, (state) => state.resources)
  const meetings = useStore(stores.meetings, (state) => state.meetings)

  // -- 会话配置：草稿态只在弹窗打开期间存在，关掉就丢 --------------------------------
  const [draft, setDraft] = useState<SetupDraft | null>(null)
  const [pendingConfig, setPendingConfig] = useState<Parameters<typeof actions.session.startSession>[0] | null>(null)
  const [setupOpen, setSetupOpen] = useState(false)
  const [preflightOpen, setPreflightOpen] = useState(false)
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [notesCollapsed, setNotesCollapsed] = useState(false)
  // -- 视图偏好：显示模式走设置（悬浮窗要跟着一起变），版式与字号是工作台自己的 ---------
  const overlay = settings?.overlay
  const displayMode: CaptionDisplayMode = useMemo(() => {
    const source = overlay?.showSource ?? true
    const target = overlay?.showTranslation ?? true
    if (source && target) return 'both'
    return source ? 'source' : 'translation'
  }, [overlay?.showSource, overlay?.showTranslation])
  const [layout, setLayout] = useState<CaptionLayout>('split')
  const [fontStep, setFontStep] = useState(1)
  const [notesOpen, setNotesOpen] = useState(true)

  const status = session.status
  /**
   * `starting` **不算** active：引擎还在握手，主区继续显示引导块，那颗主 CTA 因此留在原地
   * 转成 pending（`workspace.starting`）。如果这一态切到字幕区，用户点了开始之后按钮就消失了，
   * 只剩一个空舞台，"点了没反应"和"在连引擎"看起来一模一样。
   * `stopping` 算 active：字幕区保持最后一眼，结束是一个不能被打断的过程。
   */
  const active = status === 'running' || status === 'paused' || status === 'stopping'

  // -- 窗口宽度：笔记区在窄窗折叠 ---------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return
    const query = window.matchMedia(`(max-width: ${NOTES_COLLAPSE_PX - 1}px)`)
    const sync = (): void => setNotesCollapsed(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  // -- 笔记：跟着会议走，800ms 防抖自动保存 -----------------------------------------
  //
  // 防抖是必需的，不是优化：setNotes 在主进程是「读整份 meeting.json → 改一个字段 → 原子重写」，
  // 逐字调用会在一场两小时的会议里制造持续的小文件 IO 抖动。800ms 让人眼察觉不到，
  // 又短到「切走页面之前基本已经落盘」。
  const meetingId = session.meetingId
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedNotes = useRef('')
  // 挂起中的写入：卸载时用来补一次落盘，不必等 800ms 走完。
  const pendingNotes = useRef<string | null>(null)
  const pendingMeetingId = useRef<string | null>(null)

  // 换一场会议先把已挂起的写入冲掉，否则它会落到下一场会议头上。
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = null
    savedNotes.current = ''
    if (!meetingId) {
      setNotes('')
      return
    }
    const existing = meetings.find((meeting) => meeting.meetingId === meetingId)?.notes ?? ''
    savedNotes.current = existing
    setNotes(existing)
  }, [meetingId])

  const editNotes = useCallback(
    (value: string) => {
      setNotes(value)
      if (!meetingId) return
      if (saveTimer.current) clearTimeout(saveTimer.current)
      pendingNotes.current = value
      pendingMeetingId.current = meetingId
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null
        pendingNotes.current = null
        pendingMeetingId.current = null
        if (value === savedNotes.current) return
        savedNotes.current = value
        // 失败不打扰用户：笔记是辅助信息，丢一段不该比一次红色报错更让人记住这场会。
        void actions.meetings.setMeetingNotes(meetingId, value).catch(() => undefined)
      }, 800)
    },
    [meetingId],
  )

  // 卸载时把挂起的写入立刻落盘，否则"刚打完最后一个字就关窗"会丢掉这一段。
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      const value = pendingNotes.current
      const id = pendingMeetingId.current
      if (value !== null && id !== null && value !== savedNotes.current) {
        savedNotes.current = value
        void actions.meetings.setMeetingNotes(id, value).catch(() => undefined)
      }
    },
    [],
  )

  // -- 打开设置弹窗：用当前设置做初值，而不是另一份草稿 -------------------------------
  const openSetup = useCallback(() => {
    setDraft({
      title: '',
      audioSource: settings?.recognition.audioSource ?? 'defaultOutput',
      sourceLanguage: settings?.recognition.sourceLanguage ?? 'auto',
      recognitionModelId: settings?.recognition.modelId ?? 'qwen3-asr-1.7b-hf',
      translate: true,
      targetLanguage: settings?.translation.targetLanguage ?? 'zh',
      keepAudio: settings?.recording.keepAudio ?? true,
    })
    setSetupOpen(true)
  }, [settings])

  const submitSetup = useCallback((config: Parameters<typeof actions.session.startSession>[0]) => {
    setPendingConfig(config)
    setSetupOpen(false)
    setPreflightOpen(true)
  }, [])

  const missing: MissingResource | null = useMemo(() => {
    if (!pendingConfig) return null
    // 传**整个** `pendingConfig`，不是只挑两个模型 id。
    // `findMissingResource` 还需要 `targetLanguages` 与 `translationProvider` 才能算出
    // 「这次要不要本地翻译模型」—— 云端模型的 id 不在本机，不进预检。
    // `pendingConfig` 本来就是完整的 SessionConfig（`SessionSetupDialog` 的 onSubmit
    // 传的就是它），不需要拼。
    return findMissingResource({ storagePath: '', resources }, pendingConfig)
  }, [pendingConfig, resources])

  // -- 开始 / 暂停 / 继续 / 结束 --------------------------------------------------------
  const configRef = useRef(pendingConfig)
  configRef.current = pendingConfig

  const start = useCallback(async () => {
    const config = configRef.current
    if (config === null) return
    setPreflightOpen(false)
    if (draft) {
      try {
        await actions.settings.updateSettings({ recording: { keepAudio: draft.keepAudio } })
      } catch {
        toast.danger(t('workspaceUi.recordingPreferenceFailed'))
        return
      }
    }
    try {
      await actions.session.startSession(config)
      setNotes('')
      const meetingId = sessionStore.getState().meetingId
      if (meetingId) {
        await actions.meetings.loadMeetings().catch(() => undefined)
        if (draft?.title.trim()) {
          await actions.meetings.renameMeeting(meetingId, draft.title.trim()).catch(() => {
            toast.warning(t('workspaceUi.titleFailed'))
          })
        }
      }
    } catch {
      // 错误已经落在 store 的 errorCode 上，由下面的 AlertDialog 统一呈现。
      // 这里**不**再弹一次 toast：同一个错误说两遍只会让人以为是两个问题。
    }
  }, [draft, t])

  const stop = useCallback(async () => {
    // meetingId 必须在 stop 之前取：store 的 finally 会无条件清掉它（见 sessionStore 文件头第 1 条）。
    const meetingId = sessionStore.getState().meetingId
    setStopConfirmOpen(false)
    try {
      await actions.session.stopSession()
      if (meetingId) navigate(recordPath(meetingId))
    } catch (error) {
      toast.danger(describeError(t, errorCodeOfSession(sessionStore.getState())))
    } finally {
      // 无论成败都回到 idle 入口：store 在 stop 的 finally 里已经清了 sessionId，
      // 界面上再留一个"进行中"的壳子只会让用户以为还能继续录。
      setPendingConfig(null)
    }
  }, [navigate, t])

  const copyDiagnostics = useCallback(async () => {
    try {
      await getBridge()?.diagnostics.copy()
      toast.success(t('common.copied'))
    } catch {
      toast.danger(t('errors.copyDiagnosticsAction'))
    }
  }, [t])

  const resetError = useCallback(() => {
    actions.session.resetSessionError()
  }, [])

  /*
   * 本窗**最近一次持有过**的会议 id。
   *
   * 引擎在同传途中没了时，`sessionStore` 的 `abandonSessionOnEngineLoss` 会照
   * `sessionStopped` 的做法把 `meetingId` 一起清掉（会话确实结束了，不留着冒充"还在跑"）。
   * 但那场会的记录在磁盘上、也已经由主进程落了结束时间，**用户的下一站是那条记录**而不是
   * 一个空工作台 —— 所以 id 在被清掉之前先在这里留一份。
   *
   * 用 ref 而不是 state：它只在点击那一刻被读，不需要触发重渲染；`stop()` 取 meetingId
   * 也是同一个理由（store 的 finally 会清掉它）。
   */
  const lastMeetingIdRef = useRef<string | null>(null)
  if (session.meetingId !== null) lastMeetingIdRef.current = session.meetingId

  const viewRecord = useCallback(() => {
    const meetingId = lastMeetingIdRef.current
    // 先复位再跳转：不清掉的话，用户从记录页回到工作台会被同一个对话框重新弹一次
    // （`status` 仍是 `error`），而这一屏此时既没有会话也没有引擎可说。
    actions.session.resetSessionError()
    if (meetingId) navigate(recordPath(meetingId))
  }, [navigate])

  // 会话开着的时候不允许直接把窗口换成别的路由：那里没有底栏，用户会以为同传停了。
  // 结束之后跳到记录详情是刻意的，那是这场同传的下一站。

  const sourceLanguage = pendingConfig?.sourceLanguage ?? settings?.recognition.sourceLanguage ?? 'auto'
  const targetLanguage = pendingConfig?.targetLanguages[0] ?? settings?.translation.targetLanguage ?? 'zh'
  const audioSource = pendingConfig?.audioSource.kind === 'defaultOutput' ? 'defaultOutput' : pendingConfig?.audioSource.deviceId ?? settings?.recognition.audioSource ?? 'defaultOutput'
  const audioLabel = audioSource === 'defaultOutput' ? t('workspaceUi.systemAudio') : devices.find((device) => device.deviceId === audioSource)?.name ?? audioSource
  const timer = <SessionBar status={status} elapsedMs={session.elapsedMs} audioLabel={audioLabel} showControls={active} onPause={() => actions.session.pauseSession()} onResume={() => actions.session.resumeSession()} onStop={() => setStopConfirmOpen(true)} />

  return (
    <div
      data-slot="workspace"
      className="nola-workspace"
    >
      <header className="nola-workspace-heading">
        <h1>{t('home.quickStart')}</h1>
      </header>

      <WorkspaceToolbar
        modelId={pendingConfig?.recognitionModelId ?? settings?.recognition.modelId ?? 'qwen3-asr-1.7b-hf'} onModelChange={(modelId) => {
          void actions.settings.updateSettings({ recognition: { modelId } }).catch(() => undefined)
        }}
        audioSource={audioSource}
        devices={devices}
        onAudioSourceChange={(next) => { void actions.settings.updateSettings({ recognition: { audioSource: next } }).catch(() => undefined) }}
        onOpenOverlay={() => { void getBridge()?.overlay.show().catch(() => toast.danger(t('workspaceUi.overlayFailed'))) }}
        sourceLanguage={sourceLanguage}
        targetLanguage={targetLanguage}
        onSourceLanguageChange={(sourceLanguage) => {
          void actions.settings.updateSettings({ recognition: { sourceLanguage } }).catch(() => undefined)
        }}
        onTargetLanguageChange={(targetLanguage) => {
          void actions.settings.updateSettings({ translation: { targetLanguage } }).catch(() => undefined)
        }}
        displayMode={displayMode}
        onDisplayModeChange={(mode) => {
          void actions.settings
            .updateSettings({ overlay: { showSource: mode !== 'translation', showTranslation: mode !== 'source' } })
            .catch(() => undefined)
        }}
        layout={layout}
        onLayoutChange={setLayout}
        fontSize={FONT_STEPS[fontStep]}
        onFontSizeChange={(size) => setFontStep(Math.max(0, FONT_STEPS.indexOf(size as (typeof FONT_STEPS)[number])))}
        notesOpen={notesOpen}
        onToggleNotes={() => setNotesOpen((open) => !open)}
        // 模型在 startSession 那一刻就被引擎握定了，starting 之后改设置对这一场没有影响。
        sessionLocked={status !== 'idle' && status !== 'error'}
        language={language}
      />

      {status === 'paused' ? (
        <div
          data-slot="paused-banner"
          className="flex shrink-0 items-center gap-2 bg-warning-soft px-6 py-2 text-warning-soft-foreground"
        >
          <span className="size-1.5 shrink-0 rounded-full bg-warning" aria-hidden="true" />
          <span className="nola-caption text-[12.5px] leading-[1.5] font-normal">{t('workspace.paused')}</span>
        </div>
      ) : null}

      <div className="nola-workspace-body" data-notes-open={notesOpen && !notesCollapsed}>
        <Card className="nola-workspace-transcript">
          {active ? (
            <>
              <Card.Header className="nola-transcript-head" data-layout={layout} data-mode={displayMode}>
                {displayMode !== 'translation' ? <Card.Title>{t('workspace.sourcePanel')}</Card.Title> : null}
                {displayMode !== 'source' ? <Card.Title>{t('workspace.translationPanel')}</Card.Title> : null}
              </Card.Header>
              <CaptionStage
                className="nola-workspace-caption"
                segments={session.segments}
                interim={session.interim}
                layout={layout}
                displayMode={displayMode}
                fontSize={FONT_STEPS[fontStep]}
                paused={status === 'paused'}
                showTimestamps
                emptyState={<EmptyState className="nola-workspace-empty"><p>{t('workspace.nothingYet')}</p><p className="text-muted">{t('workspace.nothingYetHint')}</p></EmptyState>}
              />
            </>
          ) : (
            <IdleGuide
              // 这里读 session.status 而不是上面那个被 !active 收窄过的 status：
              // idle 才是 idle，starting 时这个分支不会渲染，但按钮的 pending 态仍然要接得上。
              starting={session.status === 'starting'}
              engineStatus={session.engineStatus}
              onStart={openSetup}
            />
          )}
        </Card>

        {notesOpen && !notesCollapsed ? (
          <NotesPanel value={notes} onChange={editNotes} />
        ) : null}
        {notesOpen && notesCollapsed ? (
          <NotesPanel value={notes} onChange={editNotes} collapsed onToggleCollapsed={() => setNotesCollapsed(false)} />
        ) : null}
      </div>

      {timer}

      <SessionSetupDialog
        isOpen={setupOpen && draft !== null}
        onOpenChange={setSetupOpen}
        draft={draft ?? EMPTY_DRAFT}
        onDraftChange={setDraft}
        devices={devices}
        language={language}
        onSubmit={submitSetup}
      />
      <PreflightDialog
        isOpen={preflightOpen}
        onOpenChange={setPreflightOpen}
        missing={missing}
        onStart={() => void start()}
      />

      {/* 结束同传：破坏性确认走 AlertDialog，不是 Modal（DESIGN 第 10.1 节）。 */}
      <AlertDialog isOpen={stopConfirmOpen} onOpenChange={setStopConfirmOpen}>
        <AlertDialog.Backdrop className="z-overlay">
          <AlertDialog.Container>
            <AlertDialog.Dialog className="rounded-2xl border border-border">
              <AlertDialog.Header>
                <AlertDialog.Heading className="nola-title text-foreground">
                  {t('workspace.endConfirmTitle')}
                </AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p className="nola-body text-muted">{t('workspace.endConfirmBody')}</p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button variant="tertiary" size="sm" className="rounded-xl" onPress={() => setStopConfirmOpen(false)}>
                  {t('workspace.keepGoing')}
                </Button>
                <Button variant="danger" size="sm" className="rounded-xl" onPress={() => void stop()}>
                  {t('workspace.end')}
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>

      {/* 会话异常：文案由 errorCode 查表得到，state.error 那串诊断原文**不进界面**。 */}
      <SessionErrorDialog state={session} onCopyDiagnostics={() => void copyDiagnostics()} onReset={resetError} onViewRecord={viewRecord} />
    </div>
  )
}

const EMPTY_DRAFT: SetupDraft = {
  title: '',
  audioSource: 'defaultOutput',
  sourceLanguage: 'auto',
  recognitionModelId: 'qwen3-asr-1.7b-hf',
  translate: true,
  targetLanguage: 'zh',
  keepAudio: true,
}

/**
 * 未开始态的居中引导块。
 *
 * 只在 idle 出现，也是这一屏唯一的主 CTA（`rounded-full`，第 17 节检查清单第一条）。
 * 引擎**起不来**时，原因写在下面那条 Alert 里并给出「重试启动」；引擎只是**还没起**
 * （刚打开应用的那几秒）时这里什么都不写；引擎刚崩、正在重连时只给一行灰字 ——
 * 三种情况的区别见下面那段注释。
 */
function IdleGuide({
  starting,
  engineStatus,
  onStart,
}: {
  starting: boolean
  engineStatus: SessionState['engineStatus']
  onStart: () => void
}) {
  const { t } = useI18n()
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-8">
      <div className="flex max-w-96 flex-col items-start gap-3">
        <span className="flex size-10 items-center justify-center rounded-[10px] bg-surface-tertiary text-accent">
          <Captions className="size-5" aria-hidden="true" />
        </span>
        <h2 className="nola-display text-foreground">{t('workspaceUi.idleTitle')}</h2>
        <p className="nola-body text-muted">{t('workspace.nothingYetHint')}</p>
        {/*
         * **红色 Alert 只给"起不来"这一种。**
         *
         * `engineStatus` 是**主进程观测**出来的（`engine-process.ts` 的 `state` 事件经
         * `src/main/ipc.ts` 的 `forwardState` 转发，`sessionStore` 一对一映射），不是这里推的。
         * 主进程在 `app.whenReady()` 里就 `engine.start()` 了（`src/main/index.ts`），
         * 所以引擎**不是**懒启动：应用刚打开的那几秒是 `booting`，再往后是 `ready`，
         * 而 `startSession` 处理器第一句的 `ensureReady()` 只是兜底（引擎真的掉过时才起作用），
         * 不是"按下开始同传才会有人 spawn 它"。这里曾经按 `!engineReady` 报
         * 「本地引擎没有运行，识别暂时无法开始」**并且禁用按钮**，等于当着一个还没坏的
         * 东西报故障，同时禁掉唯一能解掉它所报状况的那个动作。
         *
         * 三个非就绪的取值给出三种画法，因为它们的用户出路不同：
         *   · `idle` / `booting` 什么都不写：什么都没坏，主 CTA 照常可点。
         *   · `recovering` 一行灰字：进程刚崩、但主进程还有重试次数（退避 250ms / 1s / 4s），
         *     引擎自己会好。报红色等于报一个正在被处理的状况，还附赠一个用户不需要按的
         *     「重试启动」。
         *   · `failed` 才是真的坏了：主进程退避耗尽（`connectWithRetries` 置 `failed`），
         *     它不会自己变好。文案复用现成的失败文案对（`engineNotReady` 带错误码 ENG-001 +
         *     `engineNotReadyAction`），不另造一句说法相近的句子。
         *
         * 按钮只在 `starting` 时禁用：那时 `startSession` 已经在飞，而它**第一句**就是
         * `ensureReady()`，所以 `starting` 已经把引擎握手的那几秒一起盖住了（store 在
         * 任何 await 之前就置 `status: 'starting'`）。
         */}
        {engineStatus === 'failed' ? (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title className="nola-body-strong">{t('errors.engineNotReady')}</Alert.Title>
              <Alert.Description className="nola-caption">
                <Button
                  variant="tertiary"
                  size="sm"
                  className="rounded-[6px]"
                  onPress={onStart}
                >
                  {t('errors.engineNotReadyAction')}
                </Button>
              </Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}
        {/*
         * 正在重连：只给一行灰字。主进程还剩重试次数时引擎会自己回来，
         * 这不是故障，也不该在它旁边摆「重试启动」—— 摆出来等于教用户去按一个
         * 系统正在自己做的动作。`Alert` 那一支（红色）留给退避耗尽的 `failed`。
         */}
        {engineStatus === 'recovering' ? (
          <p className="nola-caption flex items-center gap-2 text-muted">
            <span className="size-1.5 shrink-0 rounded-full bg-warning" aria-hidden="true" />
            {t('workspaceUi.engineRecovering')}
          </p>
        ) : null}
        <Button
          variant="primary"
          size="md"
          className="mt-2 rounded-full px-5"
          onPress={onStart}
          isPending={starting}
          isDisabled={starting}
        >
          {starting ? t('workspace.starting') : t('workspace.start')}
        </Button>
      </div>
    </div>
  )
}

/**
 * 会话异常对话框。
 *
 * 动作按"这一场会还剩什么"分三种，因为它们的用户出路完全不同：
 * - `errorCode === ENGINE_LOST`：**引擎进程没了**，这一场已经结束（`sessionStore` 的
 *   `abandonSessionOnEngineLoss` 清掉了 `sessionId`）。出路是**那条记录**：字幕逐句落盘，
 *   主进程也已经给会议落了结束时间，用户要的是"半场的会议怎么拿到"，不是重试。
 * - `sessionId === null`：会话没开起来（引擎没起 / 设备没了 / 模型没装）。出路是重试或去装模型。
 * - `sessionId !== null`：会话还开着，只是中途报错。出路是结束这场同传（能存下已经有的字幕）。
 *
 * 前两种都落在 `errorCopyOf(code, 'start')` 那一支上，这是有意的：查表按
 * `errorCode` 走，而只有 `ENGINE_LOST` 会在表里命中 `errors.engineLost`，
 * 于是主按钮自然变成「查看这场记录」。**行为上的例外只有这一个**，所以单独判一次码，
 * 不去改 `errorCopyOf` 的签名 —— 浮窗那份 `StartFailureNotice` 也调它（见 `OverlayControls`）。
 *
 * `state.error` 是诊断串，只给 console 与"复制诊断信息"，**不渲染**。
 */
function SessionErrorDialog({
  state,
  onCopyDiagnostics,
  onReset,
  onViewRecord,
}: {
  state: SessionState
  onCopyDiagnostics: () => void
  onReset: () => void
  onViewRecord: () => void
}) {
  const { t } = useI18n()
  const isOpen = state.status === 'error'
  const alive = state.sessionId !== null
  const engineLost = state.errorCode === ENGINE_LOST_CODE

  const handle = useMemo(() => errorCopyOf(state.errorCode, alive ? 'stop' : 'start'), [state.errorCode, alive])

  return (
    <AlertDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        // ESC 与遮罩点击都会走到这里：这一屏的错误没有"稍后再说"的选项，
        // 不复位就会一直挡着字幕区，所以关掉即复位。
        if (!open) onReset()
      }}
    >
      <AlertDialog.Backdrop className="z-overlay">
        <AlertDialog.Container>
          <AlertDialog.Dialog className="rounded-2xl border border-border">
            <AlertDialog.Header>
              <AlertDialog.Heading className="nola-title text-foreground">
                {t(handle.message)}
              </AlertDialog.Heading>
            </AlertDialog.Header>
            {handle.detail ? (
              <AlertDialog.Body>
                <p className="nola-body text-muted">{t(handle.detail)}</p>
              </AlertDialog.Body>
            ) : null}
            <AlertDialog.Footer>
              <Button variant="tertiary" size="sm" className="rounded-xl" onPress={onCopyDiagnostics}>
                {t('errors.copyDiagnosticsAction')}
              </Button>
              <Button
                variant={alive ? 'danger' : 'primary'}
                size="sm"
                className="rounded-xl"
                onPress={() => {
                  if (engineLost) onViewRecord()
                  else if (alive) void actions.session.stopSession().catch(() => onReset())
                  else onReset()
                }}
              >
                {t(handle.action)}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  )
}

// -- 错误码到文案 ------------------------------------------------------------------

export interface ErrorCopy {
  message: TranslationKey
  /**
   * 可选的第二行。**默认是 null**：`errors.*` 的 message 本身已经是一句完整的话
   * （发生了什么 + 错误码），原来的 detail 直接填了按钮那一条，于是对话框正文和
   * 主按钮会显示同一句"重试启动"。真要补第二行时，它必须和 action 不是同一句。
   */
  detail: TranslationKey | null
  /** 主按钮。 */
  action: TranslationKey
}

/**
 * `errorCode` 到 `errors.*` 的映射。
 *
 * `sessionStore.errorCodeOf()` 把引擎抛出的 `FOO: ...` 取前缀并大写，引擎事件则直接
 * `toUpperCase()`，所以同一个故障可能有三种写法（`MODEL_MISSING` /
 * `MODELUNAVAILABLE` / `MODEL_UNAVAILABLE`）。这里先归一化（大写 + 去分隔符）再查表，
 * 查不到就落到**上下文兜底**——宁可文案不够精确，也不能让界面显示 `missing:errors.xxx`
 * （i18n 层对缺 key 的处理就是这样）。
 *
 * `context` 决定两件事：兜底文案，以及**主按钮**。会话还活着的时候（`stop`）主按钮一律是
 * 「结束同传」：错误发生后，引擎还握着的这场同传能做的唯一有价值的事就是把已经有的字幕存下来；
 * 把「重试」摆在那里只会让用户对着一个已经死掉的会话反复点。
 *
 * 查表命中的条目按 `errorCode` 走，与 `context` 无关，所以「引擎没了这场会」（`ENGINELOST`）
 * 落进哪个 context 都取到它自己那一行 —— 引擎把这场会带走时 `sessionId` 已经被清掉了，
 * 于是它落在 `start` 那一支上，而那支只做兜底、不改写表里命中的东西，正好合适。
 */
const ERROR_TABLE: Record<string, ErrorCopy> = {
  MODELMISSING: { message: 'errors.modelMissing', detail: null, action: 'errors.modelMissingAction' },
  MODELUNAVAILABLE: { message: 'errors.modelMissing', detail: null, action: 'errors.modelMissingAction' },
  RESOURCEUNAVAILABLE: { message: 'errors.modelMissing', detail: null, action: 'errors.modelMissingAction' },
  RESOURCEUNFOUND: { message: 'errors.modelMissing', detail: null, action: 'errors.modelMissingAction' },
  ENGINENOTREADY: { message: 'errors.engineNotReady', detail: null, action: 'errors.engineNotReadyAction' },
  ENGINENOTRUNNING: { message: 'errors.engineNotReady', detail: null, action: 'errors.engineNotReadyAction' },
  INTERNALERROR: { message: 'errors.engineNotReady', detail: null, action: 'errors.engineNotReadyAction' },
  // 键是 `ENGINE_LOST` 归一化之后的样子（大写 + 去分隔符），与
  // `sessionStore.ENGINE_LOST_CODE` 是同一个码的两个写法，别当成两个码。
  ENGINELOST: { message: 'errors.engineLost', detail: null, action: 'errors.engineLostAction' },
  AUDIODEVICEUNAVAILABLE: { message: 'errors.deviceNotFound', detail: null, action: 'errors.deviceNotFoundAction' },
  DEVICENOTFOUND: { message: 'errors.deviceNotFound', detail: null, action: 'errors.deviceNotFoundAction' },
  TRANSLATIONUNAVAILABLE: { message: 'errors.translateFailed', detail: null, action: 'errors.translateFailedAction' },
}

const FALLBACK: Record<'start' | 'stop', ErrorCopy> = {
  start: { message: 'errors.startFailed', detail: null, action: 'errors.startFailedAction' },
  // 会话中途崩掉且码认不出来：最接近的说法是"引擎没了"。这里不能用 engineNotReady ——
  // 那句说的是"识别无法开始"，可这场明明已经在跑了，说的是"停了"。
  // 也正因为码认不出来，这里不带错误码。
  stop: { message: 'errors.engineStopped', detail: null, action: 'workspace.end' },
}

/**
 * 主语是「开始识别」的文案。会话**已经跑起来**之后照抄这些就是说反了。
 *
 * 这一族以前只有兜底路径（`FALLBACK.stop`）躲开了，查表命中的路径没有躲：引擎报
 * `internalError` 时 `errorCopyOf(code, 'stop')` 会照 `ERROR_TABLE` 取出
 * `errors.engineNotReady`（「本地引擎没有运行，识别无法开始。错误码 ENG-001」）——
 * 可这场会明明正在跑，用户读到的是"没法开始"，而实际发生的是"中途停了"。
 * 同一个文件里两处兜底口径不一致，所以在这里统一。
 */
const START_ONLY_MESSAGES: ReadonlySet<TranslationKey> = new Set<TranslationKey>([
  'errors.engineNotReady',
  'errors.startFailed',
])

/** 归一化 + 查表 + 按上下文选主按钮。**纯函数，独立可测。** */
export function errorCopyOf(code: string | null, context: 'start' | 'stop'): ErrorCopy {
  const normalized = code === null ? '' : code.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const base = (normalized.length > 0 ? ERROR_TABLE[normalized] : undefined) ?? FALLBACK[context]
  // 会话还活着的时候，主按钮一律是「结束同传」：这场同传能做的唯一有价值的事就是把已经
  // 识别到的字幕存下来。把「重试」摆在那里只会让用户对着一个引擎已经掉线的会话反复点。
  if (context !== 'stop') return base
  return {
    ...base,
    message: START_ONLY_MESSAGES.has(base.message) ? 'errors.engineStopped' : base.message,
    action: 'workspace.end',
  }
}

/** 从 store 快照里取 errorCode（`stop` 的 catch 分支要读终态）。 */
export function errorCodeOfSession(state: SessionState): string | null {
  return state.errorCode
}

/** toast 需要一句现成的话，复用同一张表。 */
function describeError(t: ReturnType<typeof useI18n>['t'], code: string | null): string {
  const copy = errorCopyOf(code, 'stop')
  return `${t(copy.message)} ${t(copy.action)}`
}

