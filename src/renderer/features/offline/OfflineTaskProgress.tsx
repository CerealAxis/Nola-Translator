import { Progress } from '@base-ui/react/progress'
import { Check, LoaderCircle, Minus, X } from 'lucide-react'
import { useI18n } from '@/i18n'
import type { OfflineTask, OfflineWorkflow } from '../../../shared/offline'

export interface OfflineTaskProgressProps {
  task: OfflineTask
  workflow?: OfflineWorkflow
}

const workflows = {
  'model-import': ['check', 'copy'],
  'model-download': ['check', 'download', 'pack'],
  'bundle-prepare': ['check', 'download', 'pack'],
  'bundle-install': ['extract', 'check', 'copy', 'verify', 'install'],
} as const

export function OfflineTaskProgress({ task, workflow }: OfflineTaskProgressProps) {
  const { t, language } = useI18n()
  const plan = workflow ?? (task.phase === 'download' || task.phase === 'pack' ? 'bundle-prepare' : 'model-import')
  const steps: readonly OfflineTask['phase'][] = workflows[plan]
  const index = Math.max(0, steps.indexOf(task.phase) === -1 ? steps.length - 1 : steps.indexOf(task.phase))
  const completed = task.state === 'completed'
  const running = task.state === 'running'
  const done = completed ? steps.length : index
  const measurable = task.total > 0 && Number.isFinite(task.total) && Number.isFinite(task.current)
  const fraction = measurable ? Math.max(0, Math.min(1, task.current / task.total)) : 0
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 0 })
  const bytes = (value: number) => `${new Intl.NumberFormat(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 1024 ** 3)} GB`
  const amount = measurable && running ? task.unit === 'bytes' || task.phase === 'copy' || task.phase === 'download' || task.phase === 'extract'
    ? `${bytes(task.current)} / ${bytes(task.total)}` : `${number.format(task.current)} / ${number.format(task.total)}` : null
  const summary = t('offline.stepsComplete').replace('{done}', number.format(done)).replace('{total}', number.format(steps.length))
  const detail = task.detail && !task.detail.startsWith('hub:') ? task.detail : null
  // A running task without a known total has no percentage to show, so the bar stays indeterminate.
  const indeterminate = running && !measurable
  return <section className="offline-task-progress" aria-label={t('offline.task')}>
    <div className="offline-task-progress__heading" role="status" aria-live="polite">
      {!running ? <strong>{t(`offline.${task.state === 'idle' ? 'ready' : task.state === 'running' ? task.phase : task.state}`)}</strong> : null}
      <span>{summary}</span>
    </div>
    <Progress.Root className="offline-task-progress__bar" value={completed ? 1 : indeterminate ? null : fraction} min={0} max={1}
      locale={language} aria-label={t(`offline.${task.phase}`)} getAriaValueText={indeterminate ? () => t('common.loading') : undefined}>
      <Progress.Track className="relative h-2 w-full overflow-hidden rounded-sm bg-surface-secondary">
        <Progress.Indicator className={[
          'h-full rounded-sm',
          task.state === 'failed' ? 'bg-danger' : 'bg-accent',
          indeterminate ? 'w-2/5 animate-pulse motion-reduce:animate-none' : '',
        ].filter(Boolean).join(' ')} />
      </Progress.Track>
    </Progress.Root>
    <ol className="offline-task-steps">
      {steps.map((phase, position) => {
        const finished = completed || position < index
        const active = !completed && position === index
        const failure = active && task.state === 'failed'
        return <li key={phase} data-state={finished ? 'completed' : failure ? 'failed' : active ? 'active' : 'pending'} aria-current={active ? 'step' : undefined}>
          <span className="offline-task-steps__marker" aria-hidden="true">
            {finished ? <Check /> : active && running ? <LoaderCircle className="animate-spin" /> : failure ? <X /> : active && task.state === 'cancelled' ? <Minus /> : null}
          </span>
          <div className="offline-task-steps__copy"><span>{t(`offline.${phase}`)}</span>
            {active && detail ? <span className="offline-task-steps__detail">{detail}</span> : null}
          </div>
          {active && amount ? <span className="offline-task-steps__amount">{amount}</span> : null}
        </li>
      })}
    </ol>
  </section>
}
