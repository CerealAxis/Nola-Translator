import { useContext, useEffect, useState } from 'react'
import { BookOpen, Download, ImagePlus, Play, Plus, Square } from 'lucide-react'
import { Button, Input, showToast } from '@/components/ui'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/i18n'
import { captureDemoSceneScreenshot } from './DemoScene'
import { sceneText } from './scene-copy'
import { Choice, SettingSwitch } from './tools-controls'
import { useToolLabels } from './tools-labels'
import type { DemoHistoryItem } from './tools-processing'
import { ToolState, useToolState } from './tools-state'
import type { HotkeyId } from './tools-catalog'

function timestamp(seconds: number) {
  const two = (n: number) => String(n).padStart(2, '0')
  return two(Math.floor(seconds / 3600)) + ':' + two(Math.floor(seconds / 60) % 60) + ':' + two(seconds % 60) + ',000'
}
export function exportHistory(rows: DemoHistoryItem[], format: 'TXT' | 'SRT') {
  return rows
    .map((row, i) =>
      [
        ...(format === 'SRT' ? [String(i + 1), timestamp(i * 3) + ' --> ' + timestamp(i * 3 + 3)] : []),
        row.original,
        row.translation,
      ].join('\n'),
    )
    .join('\n\n')
}
function downloadText(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function HistoryTools({
  history,
  onEdit,
  gameName,
  gameId,
}: {
  history: DemoHistoryItem[]
  onEdit: (id: number, translation: string) => void
  gameName: string
  gameId: string
}) {
  const { label } = useToolLabels()
  const [id, setId] = useState<number | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const [autoSave, setAutoSave] = useToolState('autoSaveTxt', false)
  const [format, setFormat] = useToolState<'TXT' | 'SRT'>('exportFormat', 'TXT')
  const [preview, setPreview] = useState(false)
  const selected = history.find((row) => row.id === id) ?? history.at(-1)
  const content = exportHistory(history, format)
  const fileName = (gameName || 'history') + '.' + format.toLowerCase()
  const cache = useContext(ToolState)
  const savedKey = 'history.txt/'+gameId
  useEffect(()=>{
    if(autoSave && history.length) cache?.set(savedKey,exportHistory(history,'TXT'))
  },[autoSave,cache,savedKey,history])
  return (
    <div className="gt-tool-stack">
      <SettingSwitch title={label('autoSave')} checked={autoSave} onChange={setAutoSave} />
      {history.length > 0 && selected ? (
        <>
          <Choice
            title={label('record')}
            value={String(selected.id)}
            options={history.map((row) => [String(row.id), row.original])}
            onChange={(next) => {
              setId(Number(next))
              setDraft(null)
            }}
          />
          <label className="gt-tool-field">
            {label('translation')}
            <Textarea value={draft ?? selected.translation} onChange={(e) => setDraft(e.target.value)} />
          </label>
          <Button
            className="gt-tool-fit"
            disabled={draft === null || draft === selected.translation || !draft.trim()}
            onClick={() => {
              if (draft !== null) onEdit(selected.id, draft)
              setDraft(null)
            }}
          >
            {label('apply')}
          </Button>
          <div className="gt-tool-actions">
            <Choice
              title={label('export')}
              value={format}
              onChange={setFormat}
              options={[
                ['TXT', 'TXT'],
                ['SRT', 'SRT'],
              ]}
            />
            <Button variant="outline" aria-expanded={preview} onClick={() => setPreview(!preview)}>
              <BookOpen />
              {label('export')}
            </Button>
            <Button variant="outline" onClick={() => downloadText(fileName, content)}>
              <Download />
              {fileName}
            </Button>
          </div>
          {preview && <pre className="gt-tool-preview">{content}</pre>}
          {autoSave && (
            <details>
              <summary>history.txt</summary>
              <pre className="gt-tool-preview">{String(cache?.get(savedKey) ?? exportHistory(history, 'TXT'))}</pre>
            </details>
          )}
        </>
      ) : (
        <p className="type-muted">{label('empty')}</p>
      )}
    </div>
  )
}

interface NotePage {
  text: string
  media?: boolean | { src: string; title: string }
}

function imageDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(reader.error ?? new Error('Image encoding failed'))
    }
    reader.readAsDataURL(blob)
  })
}
export function NoteTools({
  gameId,
  gameName,
  scope,
  onScope,
}: {
  gameId: string
  gameName: string
  scope: 'game' | 'global'
  onScope: (scope: 'game' | 'global') => void
}) {
  const { label } = useToolLabels()
  const { language } = useI18n()
  const [capturing, setCapturing] = useState(false)
  const [books, setBooks] = useToolState<Record<string, NotePage[]>>('notebooks', {})
  const [active, setActive] = useToolState<Record<string, number>>('notebookPage', {})
  const key = scope === 'global' ? 'global' : 'game/' + gameId
  const pages = books[key] ?? [{ text: '', media: false }]
  const index = active[key] ?? 0
  const page = pages[index] ?? pages[0]
  const attachment = typeof page.media === 'object' ? page.media : undefined
  function update(patch: Partial<NotePage>) {
    setBooks(current => ({
      ...current,
      [key]: (current[key] ?? [{ text: '' }]).map((p, i) => i === index ? { ...p, ...patch } : p),
    }))
  }
  async function attachImage() {
    setCapturing(true)
    try {
      const src = await imageDataUrl(await captureDemoSceneScreenshot())
      update({ media: { src, title: gameName || label('capture') } })
    } catch {
      showToast({ type: 'error', description: sceneText(language)('shotFailed') })
    } finally {
      setCapturing(false)
    }
  }
  function addPage() {
    setBooks({ ...books, [key]: [...pages, { text: '', media: false }] })
    setActive({ ...active, [key]: pages.length })
  }
  return (
    <div className="gt-tool-stack">
      <Choice
        title={label('notes')}
        value={scope}
        onChange={onScope}
        options={[
          ['game', gameName || label('game')],
          ['global', label('global')],
        ]}
      />
      <div className="gt-tool-actions">
        <Choice
          title={label('page')}
          value={String(index)}
          onChange={(v) => setActive({ ...active, [key]: Number(v) })}
          options={pages.map((p, i) => [
            String(i),
            i + 1 + ' · ' + (p.text.split('\n')[0].slice(0, 32) || label('page')),
          ])}
        />
        <Button size="sm" variant="outline" onClick={addPage}>
          <Plus />
          {label('addPage')}
        </Button>
      </div>
      <Textarea
        aria-label={label('notes')}
        rows={7}
        value={page.text}
        onChange={(e) => update({ text: e.target.value })}
      />
      {attachment && (
        <figure className="gt-tool-shot">
          <img src={attachment.src} alt={label('capture')} />
          <figcaption>{attachment.title}</figcaption>
        </figure>
      )}
      <Button className="gt-tool-fit" size="sm" variant="outline" disabled={capturing}
        onClick={() => attachment ? update({ media: undefined }) : void attachImage()}>
        <ImagePlus />
        {label(attachment ? 'clear' : 'media')}
      </Button>
    </div>
  )
}

const words = [
  { word: '港', reading: 'みなと', meaning: 'harbor' },
  { word: '船', reading: 'ふね', meaning: 'ship' },
  { word: '最終便', reading: 'さいしゅうびん', meaning: 'lastFerry' },
  { word: '桟橋', reading: 'さんばし', meaning: 'pier' },
  { word: '灯台', reading: 'とうだい', meaning: 'lighthouse' },
] as const
export function StudyTools({
  current,
  onAdvance,
  available,
  command,
  request,
}: {
  current?: DemoHistoryItem
  onAdvance: () => void
  available: boolean
  command?: HotkeyId
  request: number
}) {
  const { label } = useToolLabels()
  const [role, setRole] = useToolState('speakingRole', '澪')
  const [skip, setSkip] = useToolState<Record<string, boolean>>('skipRole', {})
  const [auto, setAuto] = useToolState('advanceAfterSpeech', false)
  const [voice, setVoice] = useToolState<'original' | 'translation'>('readSource', 'original')
  const [reading, setReading] = useState(false)
  const [recognizing, setRecognizing] = useState(false)
  const [heard, setHeard] = useState('')
  const [query, setQuery] = useState<string>(words.find((w) => current?.original.includes(w.word))?.word ?? '港')
  const [dict, setDict] = useToolState<'standard' | 'none'>('dictionary', 'standard')
  const [result, setResult] = useState<(typeof words)[number] | null>(null)
  const [anki, setAnki] = useToolState('ankiConnected', false)
  const [cards, setCards] = useToolState<string[]>('ankiCards', [])
  const [handled, setHandled] = useToolState('handledStudyRequest', 0)
  useEffect(() => {
    if (!request || handled === request) return
    setHandled(request)
    if (command === 'addCard') addCard()
    else if (command === 'stopSpeech') setReading(false)
    else if (command === 'speech' || command === 'speakWord' || command === 'autoSpeech') {
      if (!current) showToast({ type: 'info', description: label('empty') })
      else if (!skip[role]) startVoice(() => setReading(true))
    } else lookup()
  }, [request, handled])
  useEffect(() => {
    if (!reading) return
    const timer = window.setTimeout(() => {
      setReading(false)
      if (auto) onAdvance()
    }, 2200)
    return () => window.clearTimeout(timer)
  }, [reading, auto, onAdvance])
  useEffect(() => {
    if (!recognizing) return
    const timer = window.setTimeout(() => {
      setRecognizing(false)
      setHeard(current?.original ?? '最終便にはまだ間に合う。')
    }, 1300)
    return () => window.clearTimeout(timer)
  }, [recognizing, current?.original])
  function startVoice(action: () => void) {
    if (!available) showToast({ type: 'warning', description: label('gatewayUnavailable') })
    else action()
  }
  function lookup() {
    const found =
      dict === 'standard'
        ? words.find(
            (w) =>
              query.trim() === w.word ||
              query.trim() === w.reading ||
              label(w.meaning).toLocaleLowerCase() === query.trim().toLocaleLowerCase(),
          )
        : undefined
    setResult(found ?? null)
    if (!found) showToast({ type: 'info', description: label(dict === 'none' ? 'missingDict' : 'noEntry') })
  }
  function addCard() {
    if (!anki) {
      showToast({ type: 'warning', description: label('missingAnki') })
      return
    }
    if (!result) return
    if (cards.includes(result.word)) {
      showToast({ type: 'info', description: label('cardExists') })
      return
    }
    setCards([...cards, result.word])
  }
  return (
    <div className="gt-tool-stack">
      <div className="gt-tool-columns">
        <Choice
          title={label('voice')}
          value={role}
          onChange={(next) => {
            setRole(next)
            setReading(false)
          }}
          options={[
            ['澪', '澪 · Mio'],
            ['春', '春 · Haru'],
          ]}
        />
        <Choice
          title={label('speak')}
          value={voice}
          onChange={setVoice}
          options={[
            ['original', label('original')],
            ['translation', label('translation')],
          ]}
        />
      </div>
      <SettingSwitch
        title={label('skip')}
        checked={!!skip[role]}
        onChange={(v) => {
          setSkip({ ...skip, [role]: v })
          setReading(false)
        }}
      />
      <SettingSwitch title={label('autoAdvance')} checked={auto} onChange={setAuto} />
      <div className="gt-tool-actions">
        <Button
          disabled={!!skip[role] || !current}
          variant="outline"
          onClick={() => (reading ? setReading(false) : startVoice(() => setReading(true)))}
        >
          {reading ? <Square /> : <Play />}
          {label(reading ? 'stop' : 'speak')}
        </Button>
        <Button
          variant="outline"
          onClick={() => (recognizing ? setRecognizing(false) : startVoice(() => setRecognizing(true)))}
        >
          {label(recognizing ? 'stop' : 'recognize')}
        </Button>
      </div>
      <output aria-live="polite">
        {reading ? role + ' · ' + current?.[voice] : recognizing ? label('listening') : heard}
      </output>
      <hr />
      <div className="gt-tool-columns">
        <Choice
          title={label('lookup')}
          value={dict}
          onChange={(v) => {
            setDict(v)
            setResult(null)
          }}
          options={[
            ['standard', '和英辞典'],
            ['none', label('none')],
          ]}
        />
        <label className="gt-tool-field">
          {label('term')}
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setResult(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') lookup()
            }}
          />
        </label>
      </div>
      <Button className="gt-tool-fit" variant="outline" onClick={lookup}>
        <BookOpen />
        {label('lookup')}
      </Button>
      {result && (
        <div className="gt-tool-preview">
          <ruby>
            {result.word}
            <rt>{result.reading}</rt>
          </ruby>
          <p>{label(result.meaning)}</p>
          <Button size="sm" variant="outline" onClick={addCard}>
            <Plus />
            {label('card')}
          </Button>
        </div>
      )}
      <div className="gt-tool-actions">
        <span>AnkiConnect</span>
        <Button size="sm" variant="outline" onClick={() => setAnki(!anki)}>
          {label(anki ? 'disconnect' : 'connect')}
        </Button>
        {anki && <span className="type-muted">{label('connected')}</span>}
      </div>
      {cards.length > 0 && (
        <details>
          <summary>
            {label('cards')} · {cards.length}
          </summary>
          <ul>
            {cards.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
