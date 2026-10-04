/**
 * 开始前检查（`preflight.title`）。两个 await 步骤，三态齐全：
 *
 * 1. **探设备**：拉引擎的设备列表，判定"有没有可用的输入设备"。等待期间是 `Spinner` +
 *    一句"正在检测音频输入"，不是"加载中"（DESIGN 第 10.1 节）。
 * 2. **查模型**：用 `findMissingResource` 在资源快照里找缺的那个。缺了就直接给出
 *    "缺哪个 + 现在安装 / 稍后再说"，而不是让用户点完开始、等引擎起动、再报错。
 *
 * 缺模型这一步是**预检拦下来的**，不是引擎报的错：所以它不进 `errors.*`，
 * 也不把会话状态改成 error，而是就地给一个可执行的动作（DESIGN 第 10.4 节）。
 *
 * **引擎起不来时两步都做不成，这时弹窗停在第一步。** 主进程 `listDevices` 处理器的第一句
 * 是 `await ensureReady()`，所以这一次探测在引擎不可用时可能直接 reject，而 reject
 * 分不清"引擎没起来"和"没有输入设备"。硬报成后者就是拿一条硬件故障盖掉引擎故障，
 * 判据与做法见下面设备检查那段。
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { Alert, Button, Modal, Spinner, toast } from '@heroui/react'
import { CircleAlert } from 'lucide-react'

import type { MissingResource } from '@/store'
import { actions, getBridge, sessionStore, updateSettings } from '@/store'
import { useI18n } from '@/i18n'
import { computeUi } from '../settings/compute-ui'
import type { RuntimeSnapshot } from '../../../shared/compute'

/** `engineFailed` 不是"第几步没过"，是"这个弹窗没资格给结论"，所以它单独成一态。 */
type Stage = 'environment' | 'environmentFailed' | 'devices' | 'models' | 'missing' | 'ready' | 'engineFailed'

export interface PreflightDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  /** 由 `findMissingResource` 在 `listResources()` 快照上算出来的缺失项。 */
  missing: MissingResource | null
  /** 开始同传。会话由页面持有配置去调 `startSession`。 */
  onStart: () => void
}

export function PreflightDialog({ isOpen, onOpenChange, missing, onStart }: PreflightDialogProps) {
  const { t, language } = useI18n()
  const c = language === 'en' ? computeUi.en : computeUi.zh
  const [stage, setStage] = useState<Stage>('environment')
  const [runtime, setRuntime] = useState<RuntimeSnapshot | null>(null)
  const [environmentError, setEnvironmentError] = useState('')
  const missingRef = useRef(missing)
  missingRef.current = missing
  const [deviceOk, setDeviceOk] = useState(false)
  const [installing, setInstalling] = useState(false)
  const openedRef = useRef(false)
  /**
   * 正在跑的那一轮检查。作废旧的一轮用这个而不是 `cancelled` 布尔：关闭弹窗与"重试"是
   * **同一件事**（这一轮的结论没人要了），让两处共用一个出口，才不会出现"重试"跑完又被
   * 上一轮迟到的 `setStage` 覆盖回去。
   */
  const runRef = useRef(0)

  const runCheck = useCallback(() => {
    const run = (runRef.current += 1)
    const alive = (): boolean => runRef.current === run

    setStage('environment')
    setEnvironmentError('')
    setDeviceOk(false)
    setInstalling(false)

    const bridge = getBridge()
    void (async () => {
      try {
        if (!bridge) throw new Error('IPC bridge unavailable')
        await bridge.runtimes.prepare()
      } catch (error) {
        if (alive()) { setEnvironmentError(String(error)); setStage('environmentFailed') }
        return
      }
      if (!alive()) return
      setStage('devices')
      // 探设备。设备列表拉不到也算"这一项过不去"，但不能因此中断：模型检查仍然要给结论
      // —— **除非**失败的原因是引擎没答上话，那时的模型结论是假的，见下面那个分支。
      let engineIsCause = false
      try {
        const devices = await bridge?.engine.listDevices()
        if (alive()) setDeviceOk((devices ?? []).length > 0)
      } catch {
        /*
         * `listDevices` 的 reject **自己分不清**两种完全不同的故障，这里也不能拿错误文案去猜。
         *
         * 引擎**不是懒启动的**：主进程在 `app.whenReady()` 里就 `engine.start()` 了
         * （`src/main/index.ts`），所以它通常早就 `ready`。`ipc.ts` 里 `listDevices`
         * 处理器的第一句 `await ensureReady()` 是**兜底**（引擎真的掉过、或者应用刚起来
         * 还没握上手时才起作用），不是"预检这一次探测兼着启动引擎"。
         *
         * 但结论不变：这次 reject 在主进程里可能是 `engine.start()` 抛的（握手失败、
         * 重试耗尽），也可能只是之后的 `engine.request` 超时，两种形状一模一样。
         *
         * 判据是 `sessionStore.engineStatus`，而它现在是一个**观测值**，不是这里推出来的：
         * 主进程 `ipc.ts` 的 `forwardState` 监听 `EngineProcess` 的 `state`，把它转成同一条
         * `engine:event` 通道上的 `engineStateChanged`（主进程还提供 `engine:get-state`
         * 供挂载时读一次当前值），`sessionStore.applyEngineState` 是全仓唯一写它的地方。
         * 于是这一行读到的"引擎此刻是什么"就是引擎进程此刻是什么：
         *   · 还不是 `ready` → 引擎这一轮确实没握上手，失败就发生在握手里，报 ENG-001；
         *   · 已经是 `ready` → 引擎答过话了，失败排在握手之后，落在设备枚举那一步，是设备问题。
         *
         * 顺序上不用做任何补偿：主进程是**先**把状态置好、**后**抛错的 ——
         * `engine-process.ts` 重试耗尽时按 `setState('failed')` → `emit('fatalError')` →
         * `throw` 的次序走，而 `engineStateChanged` 与这次 reject 走同一条 IPC 管道、
         * 按发送顺序排队。所以走到这个 `catch` 时 `engineStatus` 早已是 `failed`。
         *
         * **跑着跑着崩掉（旧的"已知漏判"）也归到这一支。** `engine.on('crash')` /
         * `fatalError` 确实**没有**被 `ipc.ts` 转发，那句话本身没写错；错的是它当时推的
         * 结论（"`engineStatus` 会停在 `ready`，于是报成设备问题"）。机制是：`state`
         * 转发之后就不需要再转发那两条了 —— `engine-process.ts` 的 `handleTermination`
         * 是**先**置 `recovering`（还有重试次数）或 `failed`（重试耗尽）、**后** `emit('crash')`
         * （重试耗尽那条是 `setState('failed')` → `emit('fatalError')` → `throw`），
         * 崩溃在状态上已经可见。所以中途崩掉时 `engineStatus` 是 `recovering` 或 `failed`
         * 而非 `ready`，这一行照旧判成引擎问题。
         *
         * 判据写成 `!== 'ready'` 而不是只认 `failed`，正是为了把 `recovering` 也算成引擎侧：
         * 进程已经没了、探设备那一次调用根本没有引擎在听，报 ENG-001 是实话。
         *
         * **这一段判据的来历要记清楚，别再退回去。** 它最初是**推断**：那时主进程只转发
         * 引擎协议事件，进程状态从没到过渲染进程，于是只能靠"`ready` 事件一定**先于**这次
         * reject 送达"这种报文顺序反推引擎状态 —— 支撑它的从来是那条管道的报文顺序，不是
         * 观测。猜不中时它就把一次引擎故障报成设备故障。现在有权威信号了，别再按顺序推。
         */
        engineIsCause = sessionStore.getState().engineStatus !== 'ready'
        if (engineIsCause) {
          // 不看 `alive()`：引擎起不来是**引擎的现状**，不是这个弹窗的现状。关掉弹窗之后
          // 引导块上那条 ENG-001 Alert 还要留着（`WorkspacePage` 的 `IdleGuide` 读的就是它）——
          // 而那条 Alert 不需要这里补写任何东西：`engineStatus` 已经是主进程送来的
          // `failed`，`IdleGuide` 判的就是这个值。**不要在这里写 `engineStatus`**，
          // 那等于给一个观测值再添一个与它竞争的写者（旧的 `markEngineFailed()` 就是，
          // 它连同 `PreflightDialog` 里那次调用已经一起删掉了）。
        }
      }
      if (!alive()) return
      if (engineIsCause) {
        /*
         * 停在第一步，不去查模型：模型那一步读的是 `modelsStore.resources`，而那份快照是
         * `initStores` 的 `loadModels()` 拉的，同一轮引擎启动失败已经把它留在空态了。此时
         * 报「缺少模型：所选识别」并给出「现在安装」是拿一条假结论盖住真结论，而那条安装
         * 动作自己也会死在同一句 `ensureReady()` 上。
         */
        setStage('engineFailed')
        return
      }
      setStage('models')
      try { await actions.models.loadModels() }
      catch { if (alive()) setStage('engineFailed'); return }
      // `missing` 由父组件在资源快照上算出；这里再等一拍，让"正在校验模型"至少被看见一次。
      await new Promise((resolve) => setTimeout(resolve, 260))
      if (!alive()) return
      setStage(missingRef.current ? 'missing' : 'ready')
    })()
  }, [])

  useEffect(() => {
    if (!isOpen || stage !== 'environment') return
    const refresh = () => { void getBridge()?.runtimes.list().then(setRuntime).catch(() => undefined) }
    refresh()
    const timer = setInterval(refresh, 1000)
    return () => clearInterval(timer)
  }, [isOpen, stage])

  // 每次打开都重跑一遍：模型可能在"稍后再说"之后被装上了，检查结果不能缓存。
  useEffect(() => {
    if (!isOpen) {
      openedRef.current = false
      return
    }
    if (openedRef.current) return
    openedRef.current = true
    runCheck()
    return () => {
      openedRef.current = false
      // 关闭弹窗或依赖变化：作废还在飞的那一轮，它落地会覆盖下一轮的状态。
      runRef.current += 1
    }
  }, [isOpen, runCheck])

  const install = useCallback(async () => {
    if (!missing) return
    setInstalling(true)
    try {
      await actions.models.manageResource(missing.resourceId, 'install')
      await actions.models.loadModels()
      toast.success(t('preflight.allReady'))
    } catch {
      toast.danger(t('errors.downloadFailed'))
    } finally {
      setInstalling(false)
    }
  }, [missing, t])

  // 装完之后父组件重算出的 missing 会变成 null，这里把它接成"通过"。
  // 不重跑整个检查：设备刚探过，重探一次只会让弹窗再转一次圈。
  useEffect(() => {
    if (isOpen && stage === 'missing' && missing === null) setStage('ready')
  }, [isOpen, stage, missing])

  const engineFailed = stage === 'engineFailed'
  const environmentPending = stage === 'environment'
  const environmentFailed = stage === 'environmentFailed'
  const close = (open: boolean) => {
    if (!open) {
      runRef.current += 1
      if (environmentPending) void getBridge()?.runtimes.cancel()
    }
    onOpenChange(open)
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={close}>
      <Modal.Backdrop className="z-overlay">
        <Modal.Container size="sm" placement="center">
          <Modal.Dialog className="rounded-2xl border border-border">
            <Modal.Header>
              <Modal.Heading className="nola-title text-foreground">{t('preflight.title')}</Modal.Heading>
              <span className="nola-micro text-[11px] leading-[1.45] font-normal text-muted">
                {t('session.stepPreflight')}
              </span>
            </Modal.Header>

            <Modal.Body className="flex flex-col gap-3">
              <ChecklistRow done={!environmentPending && !environmentFailed} failed={environmentFailed}
                pending={environmentPending} label={c.checkingEnvironment} failedLabel={c.environmentFailed} />
              {environmentPending && runtime?.operation ? <p role="status" className="nola-caption text-muted">
                {c[runtime.operation.phase]} · {Math.round(runtime.operation.bytes / 2 ** 20)} / {Math.round(runtime.operation.totalBytes / 2 ** 20)} MiB
              </p> : null}
              {environmentFailed ? <Alert status="danger"><Alert.Content><Alert.Description>{environmentError}</Alert.Description>
                <Button variant="tertiary" size="sm" onPress={runCheck}>{c.retry}</Button>
                <Button variant="tertiary" size="sm" onPress={() => {
                  void updateSettings({ compute: { runtimeId: 'bundled', llamaRuntimeId: 'bundled', recognitionDevice: 'cpu', translationDevice: 'cpu', precision: 'auto', quantization: 'none' } })
                    .then(runCheck).catch(error => setEnvironmentError(String(error)))
                }}>{c.useCpu}</Button>
              </Alert.Content></Alert> : null}
              {!environmentPending && !environmentFailed ? <>
              <ChecklistRow
                done={stage !== 'devices' && deviceOk}
                failed={stage !== 'devices' && !deviceOk}
                pending={stage === 'devices'}
                label={t('preflight.checkingDevices')}
                // 引擎没答上话时**不能**报"没有检测到可用的音频输入"：引擎不可用时这一行
                // 根本没能在任何设备上探成，报一条设备的结论就是把真故障说成硬件故障。
                failedLabel={engineFailed ? t('preflight.deviceCheckBlocked') : t('preflight.deviceUnavailable')}
              />
              {/* 引擎这一关没过，模型那一步就还没开始：不显示一个没跑过的结论。 */}
              {engineFailed ? null : (
                <ChecklistRow
                  done={stage === 'ready'}
                  pending={stage === 'models'}
                  label={t('preflight.checkingModels')}
                  failedLabel={t('preflight.modelMissing', { name: missing?.name ?? '' })}
                  failed={stage === 'missing'}
                />
              )}
              </> : null}
              {/*
               * 引擎起不来：说真正的因果，并就地给出路。文案对复用现成的
               * `errors.engineNotReady`（带 ENG-001）+ `errors.engineNotReadyAction`，
               * 不另造一句说法相近的。
               *
               * 「重试启动」按的就是同一个动作：重跑这一次设备检查，而检查的第一句又是
               * `ensureReady()`，所以它字面上就是在重试启动引擎。用同一个 Alert+Button
               * 形状（与 `WorkspacePage` 的 `IdleGuide`、`main.tsx` 的横幅一致），不新造交互。
               */}
              {engineFailed ? (
                <Alert status="danger">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title className="nola-body-strong">{t('errors.engineNotReady')}</Alert.Title>
                    <Alert.Description className="nola-caption">
                      <Button
                        variant="tertiary"
                        size="sm"
                        className="rounded-[6px]"
                        onPress={runCheck}
                      >
                        {t('errors.engineNotReadyAction')}
                      </Button>
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : null}
              {stage === 'ready' ? (
                <p className="nola-caption flex items-center gap-2 text-success">
                  <span className="size-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" />
                  {t('preflight.allReady')}
                </p>
              ) : null}
            </Modal.Body>

            <Modal.Footer>
              <Button variant="tertiary" size="sm" className="rounded-xl" onPress={() => close(false)}>
                {stage === 'missing' ? t('preflight.later') : t('session.cancel')}
              </Button>
              {stage === 'missing' ? (
                <Button variant="primary" size="sm" className="rounded-full px-5" onPress={install} isPending={installing}>
                  <CircleAlert aria-hidden="true" />
                  {t('preflight.installNow')}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  className="rounded-full px-5"
                  onPress={onStart}
                  // 引擎起不来时这里也禁着，但**理由与原来那句"点了必然失败"不是一回事**，
                  // 原来那句是假的、这才是真的：
                  // 点下去**不会**必然失败。`startSession` 的第一句同样是 `await ensureReady()`，
                  // 引擎通得了它就开了，引擎通不了它把上面那条 ENG-001 再说一遍（落在
                  // `WorkspacePage` 的 `SessionErrorDialog`）。那句话连同出路已经摆在同一屏里，
                  // 再点一次不产生任何新信息 —— 这时该按的是上面那个「重试启动」。
                  // **设备**确实不可用时才是原来那个理由：点了必然失败。
                  isDisabled={stage !== 'ready' || !deviceOk}
                >
                  {t('preflight.start')}
                </Button>
              )}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}

/** 一步检查的读法：进行中转圈、通过打勾、失败给一句话。 */
function ChecklistRow({
  label,
  failedLabel,
  pending,
  done,
  failed = false,
}: {
  label: string
  failedLabel: string
  pending: boolean
  done: boolean
  failed?: boolean
}) {
  const { t } = useI18n()
  return (
    <div className="flex items-center gap-2">
      {pending ? <Spinner size="sm" /> : null}
      {!pending && done ? <span className="size-1.5 shrink-0 rounded-full bg-success" aria-label={t('preflight.allReady')} /> : null}
      {!pending && !done && failed ? (
        <CircleAlert className="size-4 shrink-0 text-danger" aria-hidden="true" />
      ) : null}
      <span className={['nola-body min-w-0 flex-1 truncate', failed ? 'text-danger' : 'text-foreground'].join(' ')}>
        {pending || done ? label : failedLabel}
      </span>
    </div>
  )
}
