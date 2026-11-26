import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { Textarea } from '@/components/ui/textarea'
import { Choice, SettingSwitch } from './tools-controls'
import { useToolLabels } from './tools-labels'
import type { ToolSource } from './tools-catalog'
import { useToolState } from './tools-state'
import { lookupMemory, lookupSample, sampleLine, type SampleLanguage } from './session'

interface Rule {
  id: string
  name: string
  embed?: boolean
  hook?: boolean
  apply: (value: string, find: string, replacement: string) => string
}
const rules: Rule[] = [
  {
    id: 'replace',
    name: '字符串替换|字串取代|Replace text|文字列置換|문자열 치환',
    embed: true,
    apply: (s, find, to) => (find ? s.replaceAll(find, to) : s),
  },
  {
    id: 'japanese',
    name: '过滤非日语字符|過濾非日語字元|Keep Shift-JIS characters|Shift-JIS 文字を残す|Shift-JIS 문자만 유지',
    apply: filterJapanese,
  },
  {
    id: 'controls',
    name: '过滤控制字符|過濾控制字元|Remove control characters|制御文字を除去|제어 문자 제거',
    apply: (s) =>
      Array.from(s)
        .filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)
        .join(''),
  },
  {
    id: 'punctuation',
    name: '过滤英文标点|過濾英文標點|Remove ASCII punctuation|英語の句読点を除去|영문 문장 부호 제거',
    apply: (s) => s.replace(/[!-/:-@\[-`{-~]/gu, ''),
  },
  {
    id: 'quotes',
    name: '保留「」内文本|保留「」內文字|Keep text in 「」|「」内を保持|「」 안쪽만 유지',
    apply: (s) => s.match(/「[^」]*」/gu)?.join('') ?? s,
  },
  {
    id: 'braces',
    name: '去除花括号|去除大括號|Remove brace tags|波括弧を除去|중괄호 제거',
    embed: true,
    apply: (s) =>
      s.replace(/\{([^{}]*)\}/gu, (_, tag: string) =>
        tag.split(/[:/]/u).length > 1 && !tag.startsWith('/') ? tag.split(/[:/]/u)[0] : '',
      ),
  },
  {
    id: 'normalize',
    name: 'Unicode 正规化|Unicode 正規化|Normalize Unicode|Unicode 正規化|유니코드 정규화',
    embed: true,
    apply: (s) => s.normalize('NFKC'),
  },
  {
    id: 'lines',
    name: '截取末行|擷取末行|Keep last line|末尾行を保持|마지막 줄 유지',
    apply: (s) => s.split(/\r?\n/u).at(-1) ?? s,
  },
  {
    id: 'repeatChars',
    name: '重复字符 · AABB → AB|重複字元 · AABB → AB|Repeated characters · AABB → AB|重複文字 · AABB → AB|중복 문자 · AABB → AB',
    hook: true,
    apply: deduplicateRuns,
  },
  {
    id: 'repeatBlock',
    name: '重复行 · ABCABC → ABC|重複行 · ABCABC → ABC|Repeated block · ABCABC → ABC|反復行 · ABCABC → ABC|반복 행 · ABCABC → ABC',
    hook: true,
    apply: deduplicateBlock,
  },
  {
    id: 'repeatLines',
    name: '连续重复行|連續重複行|Consecutive duplicate lines|連続した重複行|연속 중복 행',
    hook: true,
    apply: (s) =>
      s
        .split('\n')
        .filter((v, i, lines) => i === 0 || v !== lines[i - 1])
        .join('\n'),
  },
  {
    id: 'tags',
    name: '去除尖括号标签|去除角括號標籤|Remove angle tags|タグを除去|꺾쇠 태그 제거',
    embed: true,
    apply: (s) => s.replace(/<[^>]*>/g, ''),
  },
  {
    id: 'newlines',
    name: '过滤换行|過濾換行|Remove line breaks|改行を除去|줄바꿈 제거',
    embed: true,
    apply: (s) => s.replace(/\r?\n/g, ''),
  },
  { id: 'digits', name: '过滤数字|過濾數字|Remove digits|数字を除去|숫자 제거', apply: (s) => s.replace(/\d/g, '') },
  {
    id: 'letters',
    name: '过滤英文字母|過濾英文字母|Remove Latin letters|英字を除去|영문자 제거',
    apply: (s) => s.replace(/[a-z]/gi, ''),
  },
  {
    id: 'suffix',
    name: '递减重复 · ABCDBCDCDD|遞減重複 · ABCDBCDCDD|Repeated suffixes · ABCDBCDCDD|後方反復 · ABCDBCDCDD|접미 반복 · ABCDBCDCDD',
    hook: true,
    apply: (s) => unfold(s, false),
  },
  {
    id: 'prefix',
    name: '递增重复 · AABABCABCD|遞增重複 · AABABCABCD|Repeated prefixes · AABABCABCD|前方反復 · AABABCABCD|접두 반복 · AABABCABCD',
    hook: true,
    apply: (s) => unfold(s, true),
  },
  {
    id: 'script',
    name: '自定义 Python · strip()|自訂 Python · strip()|Custom Python · strip()|カスタム Python · strip()|사용자 Python · strip()',
    embed: true,
    apply: (s) => s.trim(),
  },
]
let repertoire: Set<string> | undefined
function filterJapanese(text: string) {
  if (!repertoire) {
    const decoder = new TextDecoder('shift_jis')
    const bytes: number[] = []
    for (let i = 0; i < 128; i++) bytes.push(i)
    for (let i = 161; i <= 223; i++) bytes.push(i)
    for (let lead = 129; lead <= 234; lead++) {
      if (lead > 159 && lead < 224) continue
      for (let trail = 64; trail <= 252; trail++) if (trail !== 127) bytes.push(lead, trail)
    }
    repertoire = new Set(decoder.decode(Uint8Array.from(bytes)))
    repertoire.delete('\uFFFD')
  }
  return Array.from(text)
    .filter((c) => repertoire!.has(c))
    .join('')
}
function deduplicateRuns(text: string) {
  const runs = Array.from(text.matchAll(/(.)\1*/gsu), (m) => ({ length: Array.from(m[0]).length, character: m[1] }))
  const frequencies = new Map<number, number>([[1, 1]])
  for (const run of runs) frequencies.set(run.length, (frequencies.get(run.length) ?? 0) + 1)
  const ranked = [...frequencies].sort(([a, ac], [b, bc]) => bc - ac || (a === 1 ? 1 : b === 1 ? -1 : a - b))
  const size = ranked[0][0]
  if (size === 1) return text
  return runs.map((run) => run.character.repeat(Math.floor(run.length / size) + (run.length % size))).join('')
}
function deduplicateBlock(text: string) {
  if (text.length < 2) return text
  const boundary = new Uint32Array(text.length)
  for (let i = 1; i < text.length; i++) {
    let prefix = boundary[i - 1]
    while (prefix && text[i] !== text[prefix]) prefix = boundary[prefix - 1]
    boundary[i] = text[i] === text[prefix] ? prefix + 1 : prefix
  }
  const period = text.length - boundary[text.length - 1]
  return text.length % period === 0 ? text.slice(0, period) : text
}
function unfold(s: string, forward: boolean) {
  const size = (Math.sqrt(1 + 8 * s.length) - 1) / 2
  if (!Number.isInteger(size)) return s
  const base = forward ? s.slice(-size) : s.slice(0, size)
  const ladder = Array.from({ length: size }, (_, i) => (forward ? base.slice(0, i + 1) : base.slice(i)))
  return ladder.join('') === s ? base : s
}
const initialRules = {
  order: rules.map((r) => r.id),
  active: ['normalize', 'repeatChars', 'repeatBlock'],
  find: '',
  replacement: '',
  term: '',
  termValue: '',
  correction: '',
  corrected: '',
}
type Rules = typeof initialRules
type Optimizer = 'before' | 'nouns' | 'correction'
export type TextProcessor = (text: string, stage: 'input' | 'translation', embedded?: boolean) => string
export function processGameText(
  cache: Map<string, unknown>,
  gameId: string,
  source: ToolSource,
  enabled: boolean,
  text: string,
  stage: 'input' | 'translation',
  embedded = false,
) {
  if (!enabled) return text
  const byScope = cache.get('rulesByScope') as Record<string, Rules> | undefined
  const inherit = cache.get('inheritRules') as Record<string, boolean> | undefined
  const key = inherit?.[gameId] === false ? 'game/' + gameId : 'global'
  const config = byScope?.[key] ?? byScope?.global ?? initialRules
  return applyTextRules(config, source, text, stage, embedded)
}
function applyTextRules(
  config: Rules,
  source: ToolSource,
  text: string,
  stage: 'input' | 'translation',
  embedded: boolean,
) {
  const replace = (s: string, from: string, to: string) => (from ? s.replaceAll(from, to) : s)
  if (stage === 'translation') return replace(text, config.correction, config.corrected)
  const input = config.order.reduce((s, id) => {
    const rule = rules.find((item) => item.id === id)
    if (!rule || (rule.hook && source !== 'hook') || (embedded && !rule.embed) || !config.active.includes(id)) return s
    return rule.apply(s, config.find, config.replacement)
  }, text)
  return replace(replace(input, config.find, config.replacement), config.term, config.termValue)
}
export function ProcessingTools({
  source,
  gameId,
  enabled,
  onEnabled,
  optimizer,
  onOptimizer,
}: {
  source: ToolSource
  gameId: string
  enabled: boolean
  onEnabled: (enabled: boolean) => void
  optimizer: Optimizer
  onOptimizer: (name: Optimizer) => void
}) {
  const { label, translate } = useToolLabels()
  const [scope, setScope] = useState<'game' | 'global'>('global')
  const [byScope, setByScope] = useToolState<Record<string, Rules>>('rulesByScope', {})
  const [inherit, setInherit] = useToolState<Record<string, boolean>>('inheritRules', {})
  const [embedded, setEmbedded] = useState(false)
  const [sample, setSample] = useState('ＡＡＢＢ「Tideglass 埠頭」')
  const [open, setOpen] = useState(false)
  const isInherited = scope === 'game' && (inherit[gameId] ?? true)
  const key = scope === 'global' || isInherited ? 'global' : 'game/' + gameId
  const config = byScope[key] ?? byScope.global ?? initialRules
  const update = (patch: Partial<Rules>) => setByScope((current) => ({ ...current, [key]: { ...config, ...patch } }))
  const available = (rule: Rule) => (!rule.hook || source === 'hook') && (!embedded || rule.embed)
  const replacements =
    optimizer === 'before'
      ? (['find', 'replacement'] as const)
      : optimizer === 'nouns'
        ? (['term', 'termValue'] as const)
        : (['correction', 'corrected'] as const)
  const result = enabled
    ? applyTextRules(config, source, sample, optimizer === 'correction' ? 'translation' : 'input', embedded)
    : sample
  function move(id: string, delta: number) {
    const order = [...config.order],
      i = order.indexOf(id)
    if (i + delta < 0 || i + delta >= order.length) return
    ;[order[i], order[i + delta]] = [order[i + delta], order[i]]
    update({ order })
  }
  return (
    <div className="gt-tool-stack">
      <SettingSwitch title={label('rules')} checked={enabled} onChange={onEnabled} />
      <Choice
        title={label('scope')}
        value={scope}
        onChange={setScope}
        options={(['global', 'game'] as const).map((k) => [k, label(k)])}
      />
      {scope === 'game' && (
        <SettingSwitch
          title={label('inherit')}
          checked={isInherited}
          onChange={(v) => setInherit({ ...inherit, [gameId]: v })}
        />
      )}
      <SettingSwitch title={label('embedded')} checked={embedded} onChange={setEmbedded} />
      <label className="gt-tool-field">
        {label('input')}
        <Textarea value={sample} maxLength={512} onChange={(e) => setSample(e.target.value)} />
      </label>
      <Choice
        title={label('rules')}
        value={optimizer}
        onChange={onOptimizer}
        options={[
          ['before', label('replaceBefore')],
          ['nouns', label('proper')],
          ['correction', label('correct')],
        ]}
      />
      <div className="gt-tool-columns">
        {replacements.map((field, i) => (
          <label className="gt-tool-field" key={field}>
            {label(i ? 'replace' : 'find')}
            <Input value={config[field]} disabled={isInherited} onChange={(e) => update({ [field]: e.target.value })} />
          </label>
        ))}
      </div>
      <div>
        <h3>{label('result')}</h3>
        <output className="gt-tool-preview">{result || '—'}</output>
      </div>
      <Button variant="secondary" onClick={() => setOpen(!open)} aria-expanded={open}>
        {label('order')}
      </Button>
      {open && (
        <ol className="gt-tool-list">
          {config.order.map((id, i) => {
            const rule = rules.find((r) => r.id === id)!
            const name = translate(rule.name)
            return (
              <li key={id}>
                <SettingSwitch
                  title={name}
                  checked={config.active.includes(id)}
                  disabled={isInherited || !available(rule)}
                  onChange={(v) =>
                    update({ active: v ? [...config.active, id] : config.active.filter((k) => k !== id) })
                  }
                />
                <Button
                  variant="bare"
                  size="icon-sm"
                  aria-label={label('up') + ' ' + name}
                  disabled={isInherited || i === 0}
                  onClick={() => move(id, -1)}
                >
                  <ChevronUp />
                </Button>
                <Button
                  variant="bare"
                  size="icon-sm"
                  aria-label={label('down') + ' ' + name}
                  disabled={isInherited || i === config.order.length - 1}
                  onClick={() => move(id, 1)}
                >
                  <ChevronDown />
                </Button>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

export interface DemoHistoryItem {
  id: number
  original: string
  translation: string
}
export function MemoryTools({
  history,
  enabled,
  onEnabled,
  from,
  to,
  gameId,
}: {
  history: DemoHistoryItem[]
  enabled: boolean
  onEnabled: (value: boolean) => void
  from: SampleLanguage | 'auto'
  to: SampleLanguage
  gameId: string
}) {
  const { label } = useToolLabels()
  const [mode, setMode] = useToolState<'manual' | 'machine' | 'sqlite'>('memoryFile/' + gameId, 'manual')
  const [other, setOther] = useToolState('continueOnMemoryHit', true)
  const first = sampleLine(0, from, to)
  const [input, setInput] = useState<string | null>(null)
  const query = input ?? first.original
  const value = lookupMemory(query,from,to)
  const hit = enabled && value !== undefined
  return (
    <div className="gt-tool-stack">
      <SettingSwitch title={label('memory')} checked={enabled} onChange={onEnabled} />
      <Choice
        title={label('source')}
        value={mode}
        onChange={setMode}
        options={[
          ['manual', 'harbor-edited.json'],
          ['machine', 'harbor-mt.json'],
          ['sqlite', 'harbor.sqlite'],
        ]}
      />
      <SettingSwitch title={label('continue')} checked={other} onChange={setOther} />
      <label className="gt-tool-field">
        {label('input')}
        <Input value={query} onChange={(e) => setInput(e.target.value)} />
      </label>
      <div className="gt-tool-preview" aria-live="polite">
        <b>{label(hit ? 'match' : 'miss')}</b>
        {hit && (
          <p>
            <small>{mode === 'sqlite' ? 'SQLite' : 'JSON · ' + label(mode === 'manual' ? 'manual' : 'machine')}</small>
            <br />
            {value}
          </p>
        )}
        {(!hit || other) && (
          <p>
            <small>{label('gateway')}</small>
            <br />
            {lookupSample(query,to) ?? history.find((row) => row.original === query)?.translation ?? '—'}
          </p>
        )}
      </div>
    </div>
  )
}
