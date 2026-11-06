import { useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from 'recharts'
import { subscribeLatency } from '@/bridge/latency'
import { useNolaTheme } from '@/components/primitives/TitleBar'
import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import type { LatencySnapshot, LatencyWavePoint } from '../../../shared/latency'

const sampleCount = 30
const waveDuration = 16_000
const waveStep = 100
const waveTicks = [-16, -12, -8, -4, 0]
const axisTick = { fill: 'var(--muted)' }
const colors = {
  total: 'var(--primary)',
  asr: 'var(--muted)',
  mt: 'var(--success)',
  tts: 'var(--color-purple)',
  remote: 'var(--success)',
} as const
type Stage = Exclude<keyof typeof colors, 'total'>

export function LatencyWindow() {
  const { t, language } = useI18n()
  useNolaTheme()
  const [snapshot, setSnapshot] = useState<LatencySnapshot | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => subscribeLatency(value => { setSnapshot(value); setFailed(false) }, () => setFailed(true)), [attempt])
  useEffect(() => {
    // The window title follows this feature after the shared provider sets the app title.
    queueMicrotask(() => { document.title = t('latency.title') })
  }, [t, language])

  return <main className="min-h-0 flex-1 overflow-hidden">
    <div className="mx-auto flex h-full w-full max-w-screen-lg flex-col gap-[var(--space-2)] p-[var(--space-2)]">
      <header className="flex flex-wrap items-center justify-between gap-[var(--space-1)]">
        <h1 className="nola-title">{t('latency.title')}</h1>
        {snapshot && snapshot.available !== false && <Badge variant={snapshot.active ? 'accent' : 'secondary'}>{t(snapshot.active ? 'latency.active' : 'latency.ended')}</Badge>}
      </header>
      {snapshot ? <>
        <LatencyTrend snapshot={snapshot} />
        {snapshot.speech && snapshot.available !== false && <AudioTimeline snapshot={snapshot} />}
      </> : <Card size="sm"><Empty><EmptyHeader><EmptyTitle>{t(failed ? 'latency.connectionFailed' : 'latency.loading')}</EmptyTitle></EmptyHeader>{failed && <Button variant="outline" onClick={() => { setFailed(false); setAttempt(value => value + 1) }}>{t('common.retry')}</Button>}</Empty></Card>}
    </div>
  </main>
}

function LatencyTrend({ snapshot }: { snapshot: LatencySnapshot }) {
  const { t, language } = useI18n()
  const rows = useMemo(() => [...snapshot.samples].sort((a, b) => a.at - b.at), [snapshot.samples])
  const totals = rows.flatMap(sample => sample.total === null ? [] : [sample.total]).slice(-sampleCount)
  const current = totals.at(-1)
  const average = totals.length ? totals.reduce((sum, value) => sum + value, 0) / totals.length : undefined
  const stages: Stage[] = snapshot.route === 's2s' ? ['remote'] : ['asr', 'mt']
  if (snapshot.route === 'cascade' && snapshot.speech) stages.push('tts')
  const availableStages = stages.filter(stage => rows.some(row => row[stage] !== undefined))
  const config: ChartConfig = { total: { label: t('latency.total'), color: colors.total } }
  for (const stage of availableStages) {
    config[stage] = { label: t(`latency.${stage}`), color: colors[stage] }
  }
  const clock = useMemo(() => new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit', second: '2-digit' }), [language])
  const formatLatency = (value: number | undefined): string => value === undefined ? '–'
    : t('latency.milliseconds', { value: Math.round(value).toLocaleString(language) })
  const emptyLabel = snapshot.available === false ? 'latency.unavailable' : snapshot.active ? 'latency.waiting' : 'latency.empty'

  return <Card size="sm" className="min-h-0 flex-1 gap-[var(--space-1)]">
    <CardHeader>
      <CardTitle role="heading" aria-level={2}>{t('latency.trend')}</CardTitle>
      <CardAction>
        <dl className="flex gap-[var(--space-2)] tabular-nums">
          <div><dt className="nola-caption">{t('latency.current')}</dt><dd className="nola-body-strong">{formatLatency(current)}</dd></div>
          <div><dt className="nola-caption">{t('latency.average')}</dt><dd className="nola-body-strong">{formatLatency(average)}</dd></div>
        </dl>
      </CardAction>
    </CardHeader>
    <CardContent className="flex min-h-0 flex-1 flex-col">
      {totals.length === 0 && availableStages.length === 0
        ? <Empty><EmptyHeader><EmptyTitle>{t(emptyLabel)}</EmptyTitle></EmptyHeader></Empty>
        : <ChartContainer config={config} className="aspect-auto min-h-0 w-full flex-1" aria-label={t('latency.trend')}>
            <ComposedChart accessibilityLayer data={rows} margin={{ top: 4, right: 16 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="at" tickFormatter={value => clock.format(value)} minTickGap={24} tick={axisTick} tickLine={false} axisLine={false} />
              <YAxis width="auto" unit=" ms" tick={axisTick} tickLine={false} axisLine={false} />
              <ChartLegend verticalAlign="top" itemSorter={null} content={<ChartLegendContent className="nola-caption flex-wrap justify-start gap-x-[var(--space-2)] gap-y-[var(--space-1)] pb-[var(--space-1)]" />} />
              <ChartTooltip cursor={{ stroke: 'var(--muted)' }} content={<ChartTooltipContent labelFormatter={value =>
                typeof value === 'number' ? clock.format(value) : value} />} />
              <Area type="linear" dataKey="total" stroke="var(--color-total)" strokeWidth={2.5}
                fill="var(--color-total)" fillOpacity={0.12} dot={{ r: 2 }} isAnimationActive={false} />
              {availableStages.map(stage => <Line key={stage} type="linear" dataKey={stage} stroke={`var(--color-${stage})`}
                strokeWidth={1.5} dot={{ r: 1.5 }} isAnimationActive={false} />)}
            </ComposedChart>
          </ChartContainer>}
    </CardContent>
  </Card>
}

function AudioTimeline({ snapshot }: { snapshot: LatencySnapshot }) {
  const { t } = useI18n()
  return <Card size="sm" className="shrink-0 gap-[var(--space-1)]">
    <CardHeader><CardTitle role="heading" aria-level={2}>{t('latency.timeline')}</CardTitle></CardHeader>
    <CardContent>
      <div className="overflow-hidden rounded-xl border border-border bg-surface-secondary">
        <AudioLane label="input" points={snapshot.input} now={snapshot.now} active={snapshot.active} />
        <AudioLane label="output" points={snapshot.outputWave} now={snapshot.now} active={snapshot.active} />
      </div>
    </CardContent>
  </Card>
}

export function waveformRows(points: readonly LatencyWavePoint[], now: number): { seconds: number; range: [number, number] | null }[] {
  const bins = Array.from({ length: waveDuration / waveStep + 1 }, (_, index) => ({
    seconds: (index * waveStep - waveDuration) / 1_000,
    range: null as [number, number] | null,
  }))
  for (const point of points) {
    if (point.at < now - waveDuration || point.at > now) continue
    const index = Math.floor((point.at - now + waveDuration) / waveStep)
    const bin = bins[index]
    bin.range = bin.range ? [Math.min(point.min, bin.range[0]), Math.max(point.max, bin.range[1])] : [point.min, point.max]
  }
  return bins
}

function AudioLane({ label, points, now, active }: {
  label: 'input' | 'output'; points: LatencyWavePoint[]; now: number; active: boolean
}) {
  const { t } = useI18n()
  const output = label === 'output'
  const title = t(`latency.${label}`)
  const rows = useMemo(() => waveformRows(points, now), [points, now])
  const hasData = rows.some(row => row.range !== null)
  return <section aria-label={title} className={output ? 'border-t border-border' : undefined}>
    <div className="flex flex-wrap items-center justify-between gap-[var(--space-1)] px-[var(--space-2)] pt-[var(--space-1)]">
      <h3 className="nola-caption">{title}</h3>
      {!hasData && <span className="nola-micro text-muted-foreground">{t('latency.noAudio')}</span>}
    </div>
    <ChartContainer className={output ? 'h-18 w-full' : 'h-12 w-full'}
      config={{ range: { label: title, color: output ? colors.tts : colors.total } }}>
      <AreaChart accessibilityLayer data={rows} margin={{ left: 16, right: 16, top: 4, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke="var(--border)" />
        <XAxis hide={!output} dataKey="seconds" type="number" domain={[-16, 0]} ticks={waveTicks} minTickGap={12}
          tickFormatter={seconds => seconds === 0 ? t(active ? 'latency.now' : 'latency.end') : t('latency.secondsAgo', { seconds: -seconds })}
          height={24} tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis hide domain={[-1, 1]} />
        <ReferenceLine y={0} stroke="var(--border)" />
        <Area type="linear" dataKey="range" stroke="var(--color-range)" fill="var(--color-range)" fillOpacity={0.2}
          isAnimationActive={false} />
      </AreaChart>
    </ChartContainer>
  </section>
}
