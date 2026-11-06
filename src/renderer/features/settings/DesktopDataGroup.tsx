import { useEffect, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { getBridge } from '@/store'
import { useI18n } from '@/i18n'
import { normalizeThrownError } from '../../../shared/ipc-error'
import { SUPPORT_ERROR_CATALOG } from '../../../shared/error-catalog'
import { desktopDataKinds, type DesktopDataSnapshot } from '../../../shared/desktop-data'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogCloseButton } from '@/components/ui/dialog'
import { SettingGroup, SettingSwitch } from './SettingsPage'
import { SettingsRow } from './SettingsRow'
import { formatBytes } from '../models/ModelCard'

export function DesktopDataGroup() {
  const { t } = useI18n()
  const api = getBridge()?.desktopData
  const [snapshot, setSnapshot] = useState<DesktopDataSnapshot>()
  const [mode, setMode] = useState<'backup' | 'restore'>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [audio, setAudio] = useState(true)
  const [models, setModels] = useState(false)
  const [keys, setKeys] = useState(false)
  const [password, setPassword] = useState('')
  useEffect(() => {
    let mounted = true
    if (api) void api.snapshot().then(value => { if (mounted) setSnapshot(value) }).catch(() => { if (mounted) setError(t('desktopData.usageFailed')) })
    return () => { mounted = false }
  }, [api, t])
  if (!api) return null
  const errorText = (cause: unknown) => {
    const normalized = normalizeThrownError(cause instanceof Error ? { message: cause.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '') } : cause)
    return normalized.supportCode && normalized.supportCode !== 'ERR-999' ? t(SUPPORT_ERROR_CATALOG[normalized.supportCode as keyof typeof SUPPORT_ERROR_CATALOG].messageKey) : t('desktopData.failed')
  }
  const run = async () => {
    if (!mode || busy) return
    setBusy(true); setError(undefined)
    try {
      const scheduled = mode === 'backup' ? await api.backup({ audio, models, ...(keys ? { password } : {}) }) : await api.restore(password || undefined)
      if (!scheduled) setBusy(false)
    } catch (cause) { setError(errorText(cause)); setBusy(false) }
  }
  const open = (next: 'backup' | 'restore') => { setPassword(''); setError(undefined); setMode(next) }
  const result = snapshot?.lastResult
  return <>
    <SettingGroup id="desktop-data-usage" legend={t('desktopData.usage')}>
      {desktopDataKinds.map(kind => <SettingsRow key={kind} label={t(`desktopData.${kind}`)}>
        <span className="nola-body-strong tabular-nums">{snapshot ? formatBytes(snapshot.usage[kind] ?? 0) : '—'}</span>
      </SettingsRow>)}
    </SettingGroup>
    <SettingGroup id="desktop-data-backup" legend={t('desktopData.title')}>
      <SettingsRow label={t('desktopData.backup')}><Button variant="secondary" size="sm" disabled={busy} onClick={() => open('backup')}>{t('desktopData.backup')}</Button></SettingsRow>
      <SettingsRow label={t('desktopData.restore')}><Button variant="secondary" size="sm" disabled={busy} onClick={() => open('restore')}>{t('desktopData.restore')}</Button></SettingsRow>
      {result && <div className="px-4 pb-4 break-words" role={result.state === 'failed' ? 'alert' : 'status'}>
        {result.state === 'completed' ? t(result.action === 'backup' ? 'desktopData.backupDone' : 'desktopData.restoreDone') : errorText(new Error(result.error))}
        {result.path && <p className="nola-caption">{result.path}</p>}
      </div>}
      {!mode && error && <p role="alert" className="px-4 pb-4">{error}</p>}
    </SettingGroup>
    <Dialog open={!!mode} onOpenChange={value => { if (!value && !busy) { setMode(undefined); setPassword('') } }}>
      <DialogContent><DialogHeader>
        <DialogTitle>{t(mode === 'restore' ? 'desktopData.restore' : 'desktopData.backup')}</DialogTitle>
        <DialogDescription>{t(mode === 'restore' ? 'desktopData.restoreHint' : 'desktopData.backupHint')}</DialogDescription>
        <DialogCloseButton disabled={busy} />
      </DialogHeader><CardContent className="flex flex-col gap-4">
        {mode === 'backup' && <>
          <SettingsRow label={t('desktopData.audio')}><SettingSwitch ariaLabel={t('desktopData.audio')} isSelected={audio} onChange={setAudio} /></SettingsRow>
          <SettingsRow label={t('desktopData.models')}><SettingSwitch ariaLabel={t('desktopData.models')} isSelected={models} onChange={setModels} /></SettingsRow>
          <SettingsRow label={t('desktopData.includeKeys')}><SettingSwitch ariaLabel={t('desktopData.includeKeys')} isSelected={keys} onChange={setKeys} /></SettingsRow>
        </>}
        {(mode === 'restore' || keys) && <label className="flex flex-col gap-2">{t(mode === 'restore' ? 'desktopData.restorePassword' : 'desktopData.backupPassword')}
          <Input type="password" autoComplete="off" value={password} disabled={busy} onChange={event => setPassword(event.target.value)} />
        </label>}
        {mode === 'restore' && <p className="nola-caption">{t('desktopData.omitted')}</p>}
        {error && <p role="alert">{error}</p>}
        <Button disabled={busy || mode === 'backup' && keys && password.length < 12} onClick={() => void run()}>
          {busy && <LoaderCircle aria-hidden="true" className="animate-spin" />}
          {t(busy ? 'desktopData.checking' : mode === 'restore' ? 'desktopData.restoreRestart' : 'desktopData.backupRestart')}
        </Button>
      </CardContent></DialogContent>
    </Dialog>
  </>
}
