import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { getBridge } from '@/store'
import { useI18n } from '@/i18n'
import { ttsText } from '@/i18n/tts-ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { notifyError, notifySuccess } from '@/components/primitives/notify'

export function ProviderVoicesDialog({ binding, onClose, onSaved }: { binding: string; onClose(): void; onSaved(): void }) {
  const { language } = useI18n()
  const text = (key: Parameters<typeof ttsText>[1]) => ttsText(language, key)
  const [rows, setRows] = useState([{ key: crypto.randomUUID(), id: '', name: '' }])
  const [busy, setBusy] = useState(false)
  const save = async () => {
    const api = getBridge()?.voices
    if (!api) return
    setBusy(true)
    let failures = false
    for (const row of rows) {
      try {
        await api.addProviderVoice(binding, row.id.trim(), row.name.trim() || row.id.trim())
        setRows(items => items.filter(item => item.key !== row.key))
        onSaved()
      } catch (cause) { failures = true; notifyError(text('failed'), { description: row.id, cause }) }
    }
    setBusy(false)
    if (!failures) { notifySuccess(text('saved')); onClose() }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}><DialogContent>
    <DialogHeader><DialogTitle>{text('providerVoices')}</DialogTitle></DialogHeader>
    <div className="flex flex-col gap-[var(--field-gap)]">
      {rows.map((row, index) => <div key={row.key} className="flex min-w-0 flex-wrap gap-[var(--label-gap)]">
        <Input className="min-w-0 flex-1" aria-label={`Voice ID ${index + 1}`} placeholder="Voice ID" value={row.id} disabled={busy}
          onValueChange={id => setRows(items => items.map(item => item.key === row.key ? { ...item, id } : item))} />
        <Input className="min-w-0 flex-1" aria-label={`${text('name')} ${index + 1}`} placeholder={text('name')} value={row.name} disabled={busy}
          onValueChange={name => setRows(items => items.map(item => item.key === row.key ? { ...item, name } : item))} />
        <Button variant="bare" size="icon-sm" aria-label={`${text('remove')} ${index + 1}`} disabled={busy || rows.length === 1}
          onClick={() => setRows(items => items.filter(item => item.key !== row.key))}><Trash2 aria-hidden="true" /></Button>
      </div>)}
      <Button variant="secondary" className="self-start" disabled={busy} onClick={() => setRows(items => [...items, { key: crypto.randomUUID(), id: '', name: '' }])}><Plus aria-hidden="true" />{text('addVoice')}</Button>
    </div>
    <DialogFooter><Button variant="secondary" disabled={busy} onClick={onClose}>{text('cancel')}</Button>
      <Button disabled={busy || !rows.length || rows.some(row => !row.id.trim())} onClick={() => void save()}>{text('save')}</Button></DialogFooter>
  </DialogContent></Dialog>
}
