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
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { Button, Modal, Spinner, toast } from '@heroui/react'
import { CircleAlert } from 'lucide-react'

import type { MissingResource } from '@/store'
import { actions, getBridge } from '@/store'
import { useI18n } from '@/i18n'

type Stage = 'devices' | 'models' | 'missing' | 'ready'

export interface PreflightDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  /** 由 `findMissingResource` 在 `listResources()` 快照上算出来的缺失项。 */
  missing: MissingResource | null
  /** 开始同传。会话由页面持有配置去调 `startSession`。 */
  onStart: () => void
}

export function PreflightDialog({ isOpen, onOpenChange, missing, onStart }: PreflightDialogProps) {
  const { t } = useI18n()
  const [stage, setStage] = useState<Stage>('devices')
  const [deviceOk, setDeviceOk] = useState(false)
  const [installing, setInstalling] = useState(false)
  const openedRef = useRef(false)

  // 每次打开都重跑一遍：模型可能在"稍后再说"之后被装上了，检查结果不能缓存。
  useEffect(() => {
    if (!isOpen) {
      openedRef.current = false
      return
    }
    if (openedRef.current) return
    openedRef.current = true

    setStage('devices')
    setDeviceOk(false)
    setInstalling(false)

    let cancelled = false
    const bridge = getBridge()
    void (async () => {
      // 探设备。设备列表拉不到也算"这一项过不去"，但不能因此中断：模型检查仍然要给结论。
      try {
        const devices = await bridge?.engine.listDevices()
        if (cancelled) return
        setDeviceOk((devices ?? []).length > 0)
      } catch {
        if (!cancelled) setDeviceOk(false)
      }
      if (cancelled) return
      setStage('models')
      // `missing` 由父组件在资源快照上算出；这里再等一拍，让"正在校验模型"至少被看见一次。
      await new Promise((resolve) => setTimeout(resolve, 260))
      if (cancelled) return
      setStage(missing ? 'missing' : 'ready')
    })()

    return () => {
      cancelled = true
    }
  }, [isOpen, missing])

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

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
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
              <ChecklistRow
                done={stage !== 'devices' && deviceOk}
                failed={stage !== 'devices' && !deviceOk}
                pending={stage === 'devices'}
                label={t('preflight.checkingDevices')}
                failedLabel={t('preflight.deviceUnavailable')}
              />
              <ChecklistRow
                done={stage === 'ready'}
                pending={stage === 'models'}
                label={t('preflight.checkingModels')}
                failedLabel={t('preflight.modelMissing', { name: missing?.name ?? '' })}
                failed={stage === 'missing'}
              />
              {stage === 'ready' ? (
                <p className="nola-caption flex items-center gap-2 text-success">
                  <span className="size-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" />
                  {t('preflight.allReady')}
                </p>
              ) : null}
            </Modal.Body>

            <Modal.Footer>
              <Button variant="tertiary" size="sm" className="rounded-xl" onPress={() => onOpenChange(false)}>
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
                  // 设备没通过时不放行"开始"：点了必然失败，那不是三态齐全，是骗人。
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

