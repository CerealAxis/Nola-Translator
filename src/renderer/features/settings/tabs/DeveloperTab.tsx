/**
 * Developer-only triggers for every shared visual primitive, plus a gallery of the dialogs the
 * app really ships, each driven by fabricated data.
 *
 * Every dialog here is handed made-up ids, so confirming one lands on its failure state instead of
 * writing to a real record. Two paths still reach outward: opening the preflight dialog probes the
 * runtime and starts the engine, and opening the export dialog clears the meetings error.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Alert,
  AlertDialog,
  Button,
  EmptyState,
  Modal,
  ProgressBar,
  Skeleton,
  Typography,
  toast,
} from '@heroui/react'

import { StatusPill } from '@/components/primitives'
import type { StatusPillTone } from '@/components/primitives'
import { useI18n } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { stores, useStore } from '@/store'
import type { SessionState } from '@/store'
import { ModelConfigurationDialog } from '../../models/ModelConfigurationDialog'
import { DetailDrawer } from '../../models/HubSearchTab'
import { TranslationCompatibilityDialog } from '../../models/TranslationCompatibilityDialog'
import { ExportDialog } from '../../records/ExportDialog'
import { RecordDeleteDialog } from '../../records/RecordDeleteDialog'
import { RenameDialog } from '../../records/RenameDialog'
import { PreflightDialog } from '../../workspace/PreflightDialog'
import { SessionSetupDialog } from '../../workspace/SessionSetupDialog'
import type { SetupDraft } from '../../workspace/SessionSetupDialog'
import { SessionErrorDialog, StopSessionDialog } from '../../workspace/WorkspaceDialogs'
import { DEFAULT_COMPUTE_SETTINGS } from '../../../../shared/compute'
import { ThirdPartyNotices } from '../ThirdPartyNotices'
import { AppUpdateDialog } from '../AppUpdateNotice'
import { RuntimeNoticeDialog } from '../RuntimeNotice'
import {
  DEMO_APP_UPDATE,
  DEMO_ASR_RECORD,
  DEMO_BULK_COUNT,
  DEMO_DEVICES,
  DEMO_DRAFT,
  DEMO_ERROR_SESSION,
  DEMO_HUB_DESCRIPTION,
  DEMO_HUB_HIT,
  DEMO_MEETING_ID,
  DEMO_MISSING,
  DEMO_MT_RECORD,
  DEMO_RUNTIME_ISSUES,
  DEMO_TITLE,
} from '../developer-demo-data'
import { SettingsRow } from '../SettingsRow'
import { SettingGroup, SettingSwitch } from '../SettingsPage'

/** Delay between the two states of the in-place toast rewrite. */
const TOAST_UPDATE_MS = 1200

const TOAST_FLOOD = 6

/**
 * Variants rotated by the flood trigger, so one press fills the queue with every tone instead of
 * six copies of the same card.
 */
const FLOOD_VARIANTS: ReadonlyArray<'default' | 'accent' | 'success' | 'warning' | 'danger'> = [
  'default',
  'accent',
  'success',
  'warning',
  'danger',
  'accent',
]

const PILL_TONES: ReadonlyArray<{ tone: StatusPillTone; label: TranslationKey }> = [
  { tone: 'neutral', label: 'titleBar.engineIdle' },
  { tone: 'accent', label: 'titleBar.language' },
  { tone: 'success', label: 'titleBar.engineReady' },
  { tone: 'warning', label: 'titleBar.engineStarting' },
  { tone: 'danger', label: 'titleBar.engineFailed' },
]

const ALERT_STATUSES = ['default', 'accent', 'success', 'warning', 'danger'] as const

export function DeveloperTab() {
  const { t } = useI18n()
  const reduceMotion = useStore(stores.settings, (state) => state.settings?.appearance?.reduceMotion ?? false)
  const [motionPreview, setMotionPreview] = useState(false)

  return (
    <div className="settings-panel">
      <p className="nola-caption text-muted">{t('dev.intro')}</p>

      <ToastGroup />
      <DialogGroup />
      <DialogGalleryGroup />
      <StatusGroup />
      <TokenGroup />
      <MotionGroup reduceMotion={reduceMotion} preview={motionPreview} onPreviewChange={setMotionPreview} />
    </div>
  )
}

/** A row whose control is a single trigger button, which is every toast row. */
function ToastTrigger({ label, desc, run }: { label: string; desc: string; run: () => void }) {
  const { t } = useI18n()
  return (
    <SettingsRow label={label} desc={desc} descriptionTooltip>
      <Button variant="tertiary" size="sm" className="rounded-[6px]" onPress={run}>
        {t('dev.run')}
      </Button>
    </SettingsRow>
  )
}

function ToastGroup() {
  const { t } = useI18n()
  const updateTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // A rewrite scheduled after the tab closes would fire into an unmounted tree.
  useEffect(() => () => {
    if (updateTimer.current !== null) clearTimeout(updateTimer.current)
  }, [])

  const rewrite = useCallback(() => {
    const id = toast(t('dev.toastSampleTitle'), { description: t('dev.toastSampleBody') })
    if (updateTimer.current !== null) clearTimeout(updateTimer.current)
    updateTimer.current = setTimeout(() => {
      updateTimer.current = null
      toast.update(id, t('dev.toastActionDone'), { description: t('dev.toastSampleBody') })
    }, TOAST_UPDATE_MS)
  }, [t])

  const flood = useCallback(() => {
    for (let index = 0; index < TOAST_FLOOD; index += 1) {
      toast(t('dev.toastSampleTitle'), {
        variant: FLOOD_VARIANTS[index % FLOOD_VARIANTS.length],
        description: t('dev.toastSampleBody'),
      })
    }
  }, [t])

  return (
    <SettingGroup legend={t('dev.sectionToast')}>
      <ToastTrigger
        label={t('dev.toastDefault')}
        desc={t('dev.toastDefaultDesc')}
        run={() => toast(t('dev.toastSampleTitle'), { description: t('dev.toastSampleBody') })}
      />
      <ToastTrigger
        label={t('dev.toastAccent')}
        desc={t('dev.toastAccentDesc')}
        run={() => toast(t('dev.toastSampleTitle'), { description: t('dev.toastSampleBody'), variant: 'accent' })}
      />
      <ToastTrigger
        label={t('dev.toastSuccess')}
        desc={t('dev.toastSuccessDesc')}
        run={() => toast.success(t('dev.toastSampleTitle'), { description: t('dev.toastSampleBody') })}
      />
      <ToastTrigger
        label={t('dev.toastWarning')}
        desc={t('dev.toastWarningDesc')}
        run={() => toast.warning(t('dev.toastSampleTitle'), { description: t('dev.toastSampleBody') })}
      />
      <ToastTrigger
        label={t('dev.toastDanger')}
        desc={t('dev.toastDangerDesc')}
        run={() => toast.danger(t('dev.toastSampleTitle'), { description: t('dev.toastSampleBody') })}
      />
      <ToastTrigger
        label={t('dev.toastSticky')}
        desc={t('dev.toastStickyDesc')}
        run={() => toast(t('dev.toastSampleTitle'), { description: t('dev.toastSampleBody'), timeout: 0 })}
      />
      <ToastTrigger
        label={t('dev.toastLoading')}
        desc={t('dev.toastLoadingDesc')}
        run={() => {
          toast(t('dev.toastSampleTitle'), { description: t('dev.toastSampleBody'), isLoading: true })
          // The promise demo rides on this row rather than getting its own: its loading card is the
          // same `isLoading` render, and it exists to check the loading -> success hand-off. The
          // promise is already resolved, so the success card appears one frame later.
          toast.promise(Promise.resolve(), {
            loading: t('dev.toastSampleTitle'),
            success: t('dev.toastLoadingDone'),
            error: t('dev.toastSampleBody'),
          })
        }}
      />
      <ToastTrigger
        label={t('dev.toastAction')}
        desc={t('dev.toastActionDesc')}
        run={() => toast(t('dev.toastSampleTitle'), {
          description: t('dev.toastSampleBody'),
          actionProps: {
            children: t('dev.toastActionLabel'),
            variant: 'tertiary',
            size: 'sm',
            className: 'rounded-[6px]',
            onPress: () => { toast.success(t('dev.toastActionDone')) },
          },
        })}
      />
      <ToastTrigger
        label={t('dev.toastUpdate')}
        desc={t('dev.toastUpdateDesc')}
        run={rewrite}
      />
      <ToastTrigger
        label={t('dev.toastFlood')}
        desc={t('dev.toastFloodDesc')}
        run={flood}
      />
      <ToastTrigger
        label={t('dev.toastClear')}
        desc={t('dev.toastClearDesc')}
        run={() => toast.clear()}
      />
    </SettingGroup>
  )
}

/**
 * One trigger button plus the dialog it opens.
 *
 * The body renders unconditionally inside the closed dialog: HeroUI only mounts the dialog while it
 * is open, so keeping the markup in a shared shape keeps the four rows identical apart from the
 * tone and the footer.
 */
function DialogTrigger({ label, desc, tone, pending, open, onOpenChange, title, body, confirm, footer }: {
  label: string
  desc: string
  tone: 'default' | 'danger'
  pending: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  body: string
  confirm: string
  footer?: ReactNode
}) {
  const { t } = useI18n()
  return (
    <>
      <SettingsRow label={label} desc={desc} descriptionTooltip>
        <Button variant="tertiary" size="sm" className="rounded-[6px]" onPress={() => onOpenChange(true)}>
          {t('dev.run')}
        </Button>
      </SettingsRow>

      <AlertDialog isOpen={open} onOpenChange={onOpenChange}>
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog>
              <AlertDialog.Header>
                <AlertDialog.Heading className="nola-title text-foreground">{title}</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p className="nola-body text-muted">{body}</p>
              </AlertDialog.Body>
              <AlertDialog.Footer className="flex justify-end gap-2">
                <Button variant="tertiary" size="sm" className="rounded-[6px]" onPress={() => onOpenChange(false)}>
                  {t('common.cancel')}
                </Button>
                {footer}
                <Button
                  variant={tone === 'danger' ? 'danger-soft' : 'primary'}
                  size="sm"
                  className="rounded-[6px]"
                  isPending={pending}
                  onPress={() => onOpenChange(false)}
                >
                  {confirm}
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </>
  )
}

function DialogGroup() {
  const { t } = useI18n()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [destructiveOpen, setDestructiveOpen] = useState(false)
  const [pendingOpen, setPendingOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  // The pending dialog stays open for the length of the fake work so the confirm button's spinner
  // is actually on screen long enough to see.
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (pendingTimer.current !== null) clearTimeout(pendingTimer.current)
  }, [])

  const startPending = useCallback(() => {
    setPendingOpen(true)
    setPending(true)
    if (pendingTimer.current !== null) clearTimeout(pendingTimer.current)
    pendingTimer.current = setTimeout(() => {
      pendingTimer.current = null
      setPending(false)
      setPendingOpen(false)
    }, TOAST_UPDATE_MS)
  }, [])

  return (
    <>
      <SettingGroup legend={t('dev.sectionDialog')}>
        <DialogTrigger
          label={t('dev.dialogConfirm')}
          desc={t('dev.dialogConfirmDesc')}
          tone="default"
          pending={false}
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={t('dev.dialogConfirmTitle')}
          body={t('dev.dialogConfirmBody')}
          confirm={t('common.confirm')}
        />
        <DialogTrigger
          label={t('dev.dialogDestructive')}
          desc={t('dev.dialogDestructiveDesc')}
          tone="danger"
          pending={false}
          open={destructiveOpen}
          onOpenChange={setDestructiveOpen}
          title={t('dev.dialogDestructiveTitle')}
          body={t('dev.dialogDestructiveBody')}
          confirm={t('common.confirm')}
        />
        <DialogTrigger
          label={t('dev.dialogPending')}
          desc={t('dev.dialogPendingDesc')}
          tone="default"
          pending={pending}
          open={pendingOpen}
          onOpenChange={(open) => {
            setPendingOpen(open)
            if (!open) {
              if (pendingTimer.current !== null) clearTimeout(pendingTimer.current)
              pendingTimer.current = null
              setPending(false)
            }
          }}
          title={t('dev.dialogPendingTitle')}
          body={pending ? t('dev.dialogPendingWorking') : t('dev.dialogPendingBody')}
          confirm={pending ? t('dev.dialogPendingDone') : t('common.confirm')}
          footer={(
            <Button
              variant="secondary"
              size="sm"
              className="rounded-[6px]"
              onPress={() => {
                toast.success(t('dev.dialogPendingDone'))
              }}
            >
              {t('dev.run')}
            </Button>
          )}
        />
        <SettingsRow label={t('dev.dialogModal')} desc={t('dev.dialogModalDesc')} descriptionTooltip>
          <Button variant="tertiary" size="sm" className="rounded-[6px]" onPress={() => setModalOpen(true)}>
            {t('dev.run')}
          </Button>
        </SettingsRow>
      </SettingGroup>

      <Modal isOpen={modalOpen} onOpenChange={setModalOpen}>
        <Modal.Backdrop className="z-overlay">
          <Modal.Container size="md" placement="center">
            <Modal.Dialog className="rounded-2xl border border-border">
              <Modal.Header>
                <Modal.Heading className="nola-title text-foreground">{t('dev.dialogModalTitle')}</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="flex flex-col gap-3">
                <p className="nola-body text-muted">{t('dev.dialogModalBody')}</p>
              </Modal.Body>
              <Modal.Footer className="flex justify-end gap-2">
                <Button variant="tertiary" size="sm" className="rounded-[6px]" onPress={() => setModalOpen(false)}>
                  {t('dev.dialogModalClose')}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </>
  )
}

/** Every dialog the gallery can open, one trigger row each. */
type GalleryDialog =
  | 'sessionSetup'
  | 'preflight'
  | 'rename'
  | 'export'
  | 'modelConfig'
  | 'compat'
  | 'stopSession'
  | 'sessionError'
  | 'bulkDelete'
  | 'runtimeMissing'
  | 'appUpdate'
  | 'modelDetail'

const ALL_CLOSED: Record<GalleryDialog, boolean> = {
  sessionSetup: false,
  preflight: false,
  rename: false,
  export: false,
  modelConfig: false,
  compat: false,
  stopSession: false,
  sessionError: false,
  bulkDelete: false,
  runtimeMissing: false,
  appUpdate: false,
  modelDetail: false,
}

/** The gallery has no page behind it, so an action that would belong to a page is deliberately inert. */
const inert = (): void => {}

function GalleryRow({ label, desc, children }: { label: string; desc: string; children: ReactNode }) {
  return (
    <SettingsRow label={label} desc={desc} descriptionTooltip>
      {children}
    </SettingsRow>
  )
}

function RunButton({ onPress }: { onPress: () => void }) {
  const { t } = useI18n()
  return (
    <Button variant="tertiary" size="sm" className="rounded-[6px]" onPress={onPress}>
      {t('dev.run')}
    </Button>
  )
}

/**
 * The dialogs the app really ships, each driven by fabricated data.
 *
 * They stay mounted while closed so the first open costs the same as a page mount. The two that
 * open on mount instead (the model configuration dialog, and the session error dialog whose open
 * state comes from its status) render only while a run wants them; the error dialog holds its state
 * here because every one of its dismissals routes through `onReset`, which is the only handle this
 * gallery has on it.
 */
function DialogGalleryGroup() {
  const { t, language } = useI18n()
  const [open, setOpen] = useState<Record<GalleryDialog, boolean>>(ALL_CLOSED)
  const [draft, setDraft] = useState<SetupDraft>(DEMO_DRAFT)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [errorSession, setErrorSession] = useState<SessionState | null>(null)

  const show = (key: GalleryDialog): void => setOpen(previous => ({ ...previous, [key]: true }))
  const track = (key: GalleryDialog): ((next: boolean) => void) =>
    next => setOpen(previous => ({ ...previous, [key]: next }))
  const hide = (key: GalleryDialog): void => setOpen(previous => ({ ...previous, [key]: false }))

  return (
    <>
      <SettingGroup legend={t('dev.sectionAppDialogs')}>
        <GalleryRow label={t('dev.dialogSessionSetup')} desc={t('dev.dialogSessionSetupDesc')}>
          <RunButton onPress={() => show('sessionSetup')} />
        </GalleryRow>
        <GalleryRow label={t('dev.dialogPreflight')} desc={t('dev.dialogPreflightDesc')}>
          <RunButton onPress={() => show('preflight')} />
        </GalleryRow>
        <GalleryRow label={t('dev.dialogRename')} desc={t('dev.dialogRenameDesc')}>
          <RunButton onPress={() => setRenameId(DEMO_MEETING_ID)} />
        </GalleryRow>
        <GalleryRow label={t('dev.dialogExport')} desc={t('dev.dialogExportDesc')}>
          <RunButton onPress={() => show('export')} />
        </GalleryRow>
        <GalleryRow label={t('dev.dialogModelConfig')} desc={t('dev.dialogModelConfigDesc')}>
          <RunButton onPress={() => show('modelConfig')} />
        </GalleryRow>
        <GalleryRow label={t('dev.dialogCompat')} desc={t('dev.dialogCompatDesc')}>
          <RunButton onPress={() => show('compat')} />
        </GalleryRow>
        <GalleryRow label={t('dev.dialogNotices')} desc={t('dev.dialogNoticesDesc')}>
          <ThirdPartyNotices />
        </GalleryRow>
        <GalleryRow label={t('dev.dialogStopSession')} desc={t('dev.dialogStopSessionDesc')}>
          <RunButton onPress={() => show('stopSession')} />
        </GalleryRow>
        <GalleryRow label={t('dev.dialogSessionError')} desc={t('dev.dialogSessionErrorDesc')}>
          <RunButton onPress={() => setErrorSession(DEMO_ERROR_SESSION)} />
        </GalleryRow>
        <GalleryRow label={t('dev.dialogBulkDelete')} desc={t('dev.dialogBulkDeleteDesc')}>
          <RunButton onPress={() => show('bulkDelete')} />
        </GalleryRow>
        <GalleryRow label={t('dev.dialogRuntimeMissing')} desc={t('dev.dialogRuntimeMissingDesc')}>
          <RunButton onPress={() => show('runtimeMissing')} />
        </GalleryRow>
        <GalleryRow label={t('dev.dialogAppUpdate')} desc={t('dev.dialogAppUpdateDesc')}>
          <RunButton onPress={() => show('appUpdate')} />
        </GalleryRow>
        <GalleryRow label={t('dev.dialogModelDetail')} desc={t('dev.dialogModelDetailDesc')}>
          <RunButton onPress={() => show('modelDetail')} />
        </GalleryRow>
      </SettingGroup>

      <SessionSetupDialog
        isOpen={open.sessionSetup}
        onOpenChange={track('sessionSetup')}
        draft={draft}
        onDraftChange={setDraft}
        devices={DEMO_DEVICES}
        language={language}
        onSubmit={inert}
      />
      <PreflightDialog
        isOpen={open.preflight}
        onOpenChange={track('preflight')}
        missing={DEMO_MISSING}
        onStart={inert}
      />
      <RenameDialog meetingId={renameId} initialTitle={DEMO_TITLE} onClose={() => setRenameId(null)} />
      <ExportDialog meetingId={DEMO_MEETING_ID} isOpen={open.export} onOpenChange={track('export')} />
      {open.modelConfig ? (
        <ModelConfigurationDialog record={DEMO_ASR_RECORD} onClose={() => hide('modelConfig')} />
      ) : null}
      <TranslationCompatibilityDialog
        isOpen={open.compat}
        onClose={() => hide('compat')}
        source="zh"
        target="en"
        recognition={DEMO_ASR_RECORD}
        translation={DEMO_MT_RECORD}
        resources={[DEMO_ASR_RECORD, DEMO_MT_RECORD]}
        compute={DEFAULT_COMPUTE_SETTINGS}
        onChangeSource={inert}
        onChangeModel={inert}
        onDisableTranslation={inert}
      />
      <StopSessionDialog
        isOpen={open.stopSession}
        onOpenChange={track('stopSession')}
        onEnd={inert}
      />
      {errorSession ? (
        <SessionErrorDialog
          state={errorSession}
          onCopyDiagnostics={inert}
          onReset={() => setErrorSession(null)}
          onViewRecord={inert}
        />
      ) : null}
      <RecordDeleteDialog
        isOpen={open.bulkDelete}
        onOpenChange={track('bulkDelete')}
        bulk
        selectedCount={DEMO_BULK_COUNT}
        isPending={false}
        onConfirm={inert}
      />
      <RuntimeNoticeDialog
        issues={DEMO_RUNTIME_ISSUES}
        isOpen={open.runtimeMissing}
        onOpenChange={track('runtimeMissing')}
        onOpenSettings={inert}
        onDismiss={() => hide('runtimeMissing')}
      />
      <AppUpdateDialog
        result={DEMO_APP_UPDATE}
        isOpen={open.appUpdate}
        onOpenChange={track('appUpdate')}
        onOpenRelease={inert}
        isOpening={false}
      />
      {/* The gallery key is the only open state here, so the drawer cannot drift out of sync with its row. */}
      <DetailDrawer
        hit={open.modelDetail ? DEMO_HUB_HIT : null}
        description={DEMO_HUB_DESCRIPTION}
        onClose={() => hide('modelDetail')}
        onInstall={inert}
      />
    </>
  )
}

/** A row whose control is a previews strip rather than a button. */
function StatusRow({ label, desc, children }: { label: string; desc: string; children: ReactNode }) {
  return (
    <SettingsRow label={label} desc={desc} descriptionTooltip>
      {children}
    </SettingsRow>
  )
}

function StatusGroup() {
  const { t } = useI18n()

  return (
    <SettingGroup legend={t('dev.sectionStatus')}>
      <StatusRow label={t('dev.statusPill')} desc={t('dev.statusPillDesc')}>
        <div className="dev-strip">
          {PILL_TONES.map((item) => (
            <StatusPill key={item.tone} label={t(item.label)} tone={item.tone} />
          ))}
        </div>
      </StatusRow>

      <StatusRow label={t('dev.statusAlert')} desc={t('dev.statusAlertDesc')}>
        <div className="dev-stack">
          {ALERT_STATUSES.map((status) => (
            <Alert key={status} status={status}>
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title className="nola-body-strong">{t('dev.statusAlertTitle')}</Alert.Title>
                <Alert.Description className="nola-caption">{t('dev.statusAlertBody')}</Alert.Description>
              </Alert.Content>
            </Alert>
          ))}
        </div>
      </StatusRow>

      <StatusRow label={t('dev.statusEmpty')} desc={t('dev.statusEmptyDesc')}>
        <EmptyState className="dev-empty">
          <p className="nola-body-strong text-foreground">{t('dev.statusEmptyTitle')}</p>
          <p className="nola-caption">{t('dev.statusEmptyBody')}</p>
          <Button variant="secondary" size="sm" className="rounded-[6px]">
            {t('dev.statusEmptyAction')}
          </Button>
        </EmptyState>
      </StatusRow>

      <StatusRow label={t('dev.statusSkeleton')} desc={t('dev.statusSkeletonDesc')}>
        <div className="dev-stack">
          <Skeleton className="dev-skeleton-line" />
          <Skeleton className="dev-skeleton-line" />
          <Skeleton className="dev-skeleton-line dev-skeleton-line--short" />
        </div>
      </StatusRow>

      <StatusRow label={t('dev.statusProgress')} desc={t('dev.statusProgressDesc')}>
        <div className="dev-stack">
          <div className="dev-progress">
            <span className="nola-micro text-muted">{t('dev.statusProgressPending')}</span>
            <ProgressBar value={0.35} maxValue={1} className="w-full" aria-label={t('dev.statusProgressPending')}>
              <ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track>
            </ProgressBar>
          </div>
          <div className="dev-progress">
            <span className="nola-micro text-muted">{t('dev.statusProgressDone')}</span>
            <ProgressBar value={0.85} maxValue={1} className="w-full" aria-label={t('dev.statusProgressDone')}>
              <ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track>
            </ProgressBar>
          </div>
        </div>
      </StatusRow>
    </SettingGroup>
  )
}

const COLOR_TOKENS = [
  '--background',
  '--surface',
  '--surface-secondary',
  '--surface-tertiary',
  '--overlay',
  '--foreground',
  '--muted',
  '--border',
  '--separator',
  '--accent',
  '--accent-soft',
  '--success',
  '--warning',
  '--danger',
  '--backdrop',
] as const

const RADIUS_TOKENS = ['--radius-sm', '--radius-md', '--radius-lg', '--radius-xl', '--radius-2xl', '--radius-full'] as const

const SPACE_TOKENS = ['--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6', '--space-7', '--space-8'] as const

const FONT_TOKENS = [
  '--nola-text-display',
  '--nola-text-title',
  '--nola-text-subtitle',
  '--nola-text-body',
  '--nola-text-caption',
  '--nola-text-micro',
  '--nola-text-mono',
] as const

/**
 * Reads a custom property off the live document.
 *
 * The gallery has to report the value the app is actually rendering — a token whose light value
 * drifted from its dark value, or one that a later rule overrode, would look correct in the source
 * file and wrong on screen. Reading after paint is also why this is stateful rather than a constant.
 */
function useTokenValues(tokens: readonly string[]): Record<string, string> {
  const [values, setValues] = useState<Record<string, string>>({})

  useEffect(() => {
    const style = getComputedStyle(document.documentElement)
    const next: Record<string, string> = {}
    for (const token of tokens) next[token] = style.getPropertyValue(token).trim()
    setValues(next)
  }, [tokens])

  return values
}

function TokenCaption({ token, value }: { token: string; value: string | undefined }) {
  return (
    <span className="dev-token__caption">
      <Typography.Code className="nola-mono text-foreground">{token}</Typography.Code>
      <Typography.Code className="nola-mono text-muted">{value || '-'}</Typography.Code>
    </span>
  )
}

/**
 * Token rows carry no trigger button: the gallery itself is the result, and the value beside each
 * swatch is read off the live document, so a token that a later rule overrides shows its real
 * computed value rather than the one written in the source file.
 */
function TokenRow({ label, children }: { label: string; children: ReactNode }) {
  return <SettingsRow label={label}>{children}</SettingsRow>
}

function TokenGroup() {
  const { t } = useI18n()
  const colors = useTokenValues(COLOR_TOKENS)
  const radii = useTokenValues(RADIUS_TOKENS)
  const spaces = useTokenValues(SPACE_TOKENS)
  const fonts = useTokenValues(FONT_TOKENS)

  return (
    <SettingGroup legend={t('dev.sectionToken')}>
      <TokenRow label={t('dev.tokenColor')}>
        <div className="dev-gallery">
          {COLOR_TOKENS.map((token) => (
            <div key={token} className="dev-token">
              <span className="dev-token__chip" style={{ background: `var(${token})` }} aria-hidden="true" />
              <TokenCaption token={token} value={colors[token]} />
            </div>
          ))}
        </div>
      </TokenRow>

      <TokenRow label={t('dev.tokenRadius')}>
        <div className="dev-gallery">
          {RADIUS_TOKENS.map((token) => (
            <div key={token} className="dev-token">
              <span className="dev-token__radius" style={{ borderRadius: `var(${token})` }} aria-hidden="true" />
              <TokenCaption token={token} value={radii[token]} />
            </div>
          ))}
        </div>
      </TokenRow>

      <TokenRow label={t('dev.tokenSpace')}>
        <div className="dev-gallery">
          {SPACE_TOKENS.map((token) => (
            <div key={token} className="dev-token">
              <span className="dev-token__space" style={{ width: `var(${token})` }} aria-hidden="true" />
              <TokenCaption token={token} value={spaces[token]} />
            </div>
          ))}
        </div>
      </TokenRow>

      <TokenRow label={t('dev.tokenFont')}>
        <div className="dev-gallery">
          {FONT_TOKENS.map((token) => (
            <div key={token} className="dev-token">
              <span className="dev-token__sample" style={{ font: `var(${token})` }} aria-hidden="true">
                {t('dev.toastSampleTitle')}
              </span>
              <TokenCaption token={token} value={fonts[token]} />
            </div>
          ))}
        </div>
      </TokenRow>
    </SettingGroup>
  )
}

function MotionGroup({ reduceMotion, preview, onPreviewChange }: {
  reduceMotion: boolean
  preview: boolean
  onPreviewChange: (next: boolean) => void
}) {
  const { t } = useI18n()

  return (
    <SettingGroup legend={t('dev.sectionMotion')}>
      {/* Read-only: the persisted flag is shown, but the switch next to it only drives the local
          demo. Writing here would let a diagnostic preview change a setting the user owns. */}
      <SettingsRow label={t('dev.motionReduced')} desc={t('dev.motionReducedDesc')} descriptionTooltip>
        <StatusPill
          label={reduceMotion ? t('status.ok') : t('status.running')}
          tone={reduceMotion ? 'warning' : 'success'}
        />
      </SettingsRow>

      <SettingsRow label={t('dev.motionPreview')} desc={t('dev.motionPreviewDesc')} descriptionTooltip>
        <div className="dev-strip">
          <span className="dev-motion-box" data-running={preview ? 'true' : 'false'} aria-hidden="true" />
          <span className="dev-motion-track" aria-hidden="true">
            <span className="dev-motion-dot" data-running={preview ? 'true' : 'false'} />
          </span>
          <SettingSwitch isSelected={preview} ariaLabel={t('dev.motionPreview')} onChange={onPreviewChange} />
        </div>
      </SettingsRow>
    </SettingGroup>
  )
}