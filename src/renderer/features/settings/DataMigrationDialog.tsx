import { Progress } from '@base-ui/react/progress'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useI18n } from '@/i18n'

export interface DataMigrationDialogProps {
  isOpen: boolean
  percent: number
  onOpenChange?: (open: boolean) => void
}

/** The startup window and developer gallery share the exact same dialog. */
export function DataMigrationDialog({ isOpen, percent, onOpenChange }: DataMigrationDialogProps) {
  const { t } = useI18n()
  return <Dialog open={isOpen} onOpenChange={onOpenChange ?? (() => undefined)}>
    <DialogContent className="max-w-md" aria-describedby={undefined}>
      <DialogHeader><DialogTitle>{t('startup.migratingData')}</DialogTitle></DialogHeader>
      <Progress.Root value={percent} aria-label={t('startup.migratingData')}>
        <Progress.Track className="relative h-2 w-full overflow-hidden rounded-sm bg-surface-secondary">
          <Progress.Indicator className="h-full bg-primary transition-[width] motion-reduce:transition-none" />
          <span aria-hidden="true" className="shimmer shimmer-bg absolute inset-0 motion-reduce:animate-none" />
        </Progress.Track>
      </Progress.Root>
    </DialogContent>
  </Dialog>
}
