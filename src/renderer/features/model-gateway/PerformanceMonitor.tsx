import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Clock3, Pause, Play, RefreshCw, Settings2, ZoomIn, ZoomOut } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch, SwitchThumb } from '@/components/ui/switch'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { performanceWindow, type Sample } from './performance-monitor-data'
import { useMonitorCopy } from './performance-monitor-copy'
import type { GatewayPerformanceSnapshot } from '../../../shared/gateway-performance'

type Series = { id: string; label: string; color: number }
const Appearance = createContext({ grid: true, legend: true, start: 0, end: 0 })
const panelScales = [{ columns: 4, height: 9 }, { columns: 3, height: 11 }, { columns: 2, height: 14 }, { columns: 1, height: 19 }]
const axisTime = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
const time = (value: number) => timeFormat.format(value)

function Filter({ label, value, options, change, clock }: {
  label: string; value: string; options: { value: string; label: string }[]; change: (value: string) => void; clock?: boolean
}) {
  return <Select value={value} items={options} onValueChange={next => { if (next !== null) change(next) }}>
    <SelectTrigger aria-label={label}>{clock && <Clock3 aria-hidden="true" />}<SelectValue /></SelectTrigger>
    <SelectContent><SelectGroup>{options.map(option =>
      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
    )}</SelectGroup></SelectContent>
  </Select>
}

function Plot({ title, data, series, unit = '', max, events = false, steps = false }: {
  title: string; data: Sample[]; series: Series[]; unit?: string; max?: number; events?: boolean; steps?: boolean
}) {
  const { grid, legend, start, end } = useContext(Appearance)
  const config = Object.fromEntries(series.map(s => [s.id, { label: s.label, color: 'var(--chart-' + s.color + ')' }]))
  const value = series[0] && data.at(-1)?.[series[0].id]
  const reading = max !== undefined && unit === 'GiB'
    ? (value == null ? '' : value + ' / ') + max + ' ' + unit
    : value == null ? '' : [value, unit].filter(v => v !== '').join(' ')
  const minute = 60_000
  const interval = Math.max(1, Math.ceil((end - start) / (5 * minute))) * minute
  const firstTick = Math.ceil(start / interval) * interval
  const ticks = Array.from({ length: Math.floor((end - firstTick) / interval) + 1 }, (_, i) => firstTick + i * interval)
  return <section aria-label={title} className="monitor-tile">
    <header className="monitor-tile-header">
      <h3 className="type-small">{title}</h3>
      <span className="type-small tabular-nums text-muted-foreground">
        {events ? unit : reading}
      </span>
    </header>
    <ChartContainer config={config} className="performance-monitor-trend-chart">
      <LineChart accessibilityLayer data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        {grid && <CartesianGrid stroke="var(--border)" />}
        <XAxis dataKey="at" type="number" domain={[start, end]} allowDataOverflow ticks={ticks} tickFormatter={value => axisTime.format(value)} height={22} minTickGap={32} axisLine={false} tickLine={false} />
        <YAxis width="auto" domain={[0,max || 'auto']} tickCount={4} allowDecimals={unit === 'GiB'} axisLine={false} tickLine={false} />
        {max && unit === 'GiB' && <ReferenceLine y={max} stroke="var(--muted-foreground)" strokeDasharray="4 4" />}
        <ChartTooltip content={<ChartTooltipContent
          labelFormatter={(_, payload) => payload[0] ? time(payload[0].payload.at) : ''}
          formatter={(reading, name, item) => <div className="monitor-tooltip-reading">
            <span aria-hidden="true" className="size-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
            <span className="truncate text-muted-foreground">{config[name ?? '']?.label ?? name}</span>
            <span className="font-medium tabular-nums">{typeof reading === 'number' ? reading.toLocaleString() : String(reading)}</span>
          </div>}
        />} />
        {series.map(s => <Line key={s.id} name={s.id} dataKey={s.id} type={steps ? 'stepAfter' : 'linear'}
          stroke={'var(--color-' + s.id + ')'} strokeWidth={s.id === 'total' ? 2.5 : 1.8}
          dot={events ? { r: 1.5, fill: 'var(--color-' + s.id + ')' } : false}
          isAnimationActive={false} connectNulls={false} />)}
      </LineChart>
    </ChartContainer>
    {legend && <div className="monitor-legend flex flex-wrap gap-x-3 gap-y-1 type-muted">{series.map(s =>
      <span key={s.id} className="inline-flex items-center gap-2">
        <i aria-hidden="true" className="inline-block h-0.5 w-3" style={{ background: 'var(--chart-' + s.color + ')' }} />{s.label}
      </span>)}</div>}
  </section>
}

export function PerformanceMonitor({ read }: { read?: () => Promise<GatewayPerformanceSnapshot> }) {
  const c = useMonitorCopy()
  const [model, setModel] = useState('all')
  const [gpu, setGpu] = useState('all')
  const [minutes, setMinutes] = useState('5')
  const [paused, setPaused] = useState(false)
  const [scale, setScale] = useState(2)
  const [grid, setGrid] = useState(true)
  const [legend, setLegend] = useState(true)
  const [snapshot, setSnapshot] = useState<GatewayPerformanceSnapshot>(() =>
    ({ end: Date.now(), calls: [], tasks: [], hardware: [] }))
  const [readFailed, setReadFailed] = useState(!read)
  const [refresh, setRefresh] = useState(0)
  const previousRefresh = useRef(refresh)
  useEffect(() => {
    const manuallyRefreshed = previousRefresh.current !== refresh
    previousRefresh.current = refresh
    if (!read || (paused && !manuallyRefreshed)) return
    let stopped = false
    let timer: number
    const poll = async () => {
      try {
        const next = await read()
        if (!stopped) {
          setSnapshot(next)
          setReadFailed(false)
        }
      } catch {
        if (!stopped) setReadFailed(true)
      }
      if (!stopped && !paused) timer = window.setTimeout(poll, 5000)
    }
    void poll()
    return () => { stopped = true; window.clearTimeout(timer) }
  }, [paused, read, refresh])
  const shared = c('shared')
  const data = useMemo(() => performanceWindow(snapshot, Number(minutes), model, shared), [snapshot, minutes, model, shared])
  useEffect(() => { if (model !== 'all' && !data.models.has(model)) setModel('all') }, [data.models, model])
  useEffect(() => { if (gpu !== 'all' && !data.adapters.some(device => device.id === gpu)) setGpu('all') }, [data.adapters, gpu])
  const modelLines = [
    ...data.modelLines,
    ...(data.eventData.some(point => point.queue != null) ? [{ id: 'queue', label: c('queueTime'), color: 5 }] : []),
    ...(data.eventData.some(point => point.total != null) ? [{ id: 'total', label: c('total'), color: 1 }] : []),
  ]
  const pauseLabel = c(paused ? 'resume' : 'pause')
  const { columns, height } = panelScales[scale]
  return <main aria-label={c('title')} className="performance-monitor-window monitor-dashboard"><div className="performance-monitor">
    <header className="performance-monitor-header">
      <div className="performance-monitor-toolbar">
        <Filter label={c('models')} value={model} change={setModel} options={[{ value: 'all', label: c('models') }, ...Array.from(data.models, ([value, s]) => ({ value, label: s.label }))]} />
        <Filter label={c('devices')} value={gpu} change={setGpu} options={[{ value: 'all', label: c('devices') }, ...data.adapters.map(s => ({ value: s.id, label: s.label }))]} />
        <Filter clock label={c('period')} value={minutes} change={setMinutes} options={['1','5','15','30'].map(value => ({ value, label: value + ' ' + c('minute') }))} />
      </div>
      <div className="performance-monitor-toolbar monitor-time-tools">
        <Button variant="bare" size="icon-sm" aria-label={c('smaller')} tooltip={c('smaller')} disabled={scale === 0} onClick={() => setScale(s => s - 1)}><ZoomOut /></Button>
        <Button variant="bare" size="icon-sm" aria-label={c('larger')} tooltip={c('larger')} disabled={scale === panelScales.length - 1} onClick={() => setScale(s => s + 1)}><ZoomIn /></Button>
        <Button variant="bare" size="icon-sm" aria-label={c('refresh')} tooltip={c('refresh')} onClick={() => setRefresh(value => value + 1)}><RefreshCw /></Button>
        <Button variant="bare" size="icon-sm" aria-label={pauseLabel} tooltip={pauseLabel} onClick={() => setPaused(!paused)}>{paused ? <Play /> : <Pause />}</Button>
        <Popover>
          <PopoverTrigger render={<Button variant="bare" size="icon-sm" aria-label={c('display')} tooltip={c('display')} />}><Settings2 /></PopoverTrigger>
          <PopoverContent align="end" sideOffset={8} aria-label={c('display')} className="w-max min-w-40 gap-[var(--label-gap)] p-[var(--section-heading-gap)] [&>label]:gap-[var(--field-gap)]">
            <label className="flex items-center justify-between">{c('grid')}<Switch checked={grid} onCheckedChange={setGrid}><SwitchThumb /></Switch></label>
            <label className="flex items-center justify-between">{c('legend')}<Switch checked={legend} onCheckedChange={setLegend}><SwitchThumb /></Switch></label>
          </PopoverContent>
        </Popover>
      </div>
    </header>
    {readFailed && <Alert><AlertDescription>{c('readFailed')}</AlertDescription></Alert>}
    <Appearance.Provider value={{ grid, legend, start: data.start, end: data.end }}>
    <div className="monitor-tiles" data-compact={scale === 0} style={{ '--monitor-columns': columns, '--monitor-chart-height': `${height}rem` } as CSSProperties}>
      <Plot title={c('latency')} data={data.eventData} series={modelLines} events unit="ms" />
      <Plot title={c('tasks')} data={data.tasks} series={[{ id: 'active', label: c('active'), color: 1 }, { id: 'queued', label: c('queued'), color: 4 }]} steps />
    {data.adapters.filter(device => gpu === 'all' || device.id === gpu).map(device =>
      <section key={device.id} aria-label={device.label} className="contents">
          <Plot title={device.label + ' · ' + c('gpuMemory')} data={device.data} series={[
            { id: 'used', label: c('used'), color: 1 },
            ...device.allocations,
          ]} unit="GiB" max={device.capacity} />
          <Plot title={device.label + ' · ' + c('load')} data={device.data} series={[{ id: 'load', label: device.label, color: 2 }]} unit="%" max={100} />
      </section>)}
      <Plot title={c('cpu')} data={data.system} series={[{ id: 'cpu', label: 'CPU', color: 3 }]} unit="%" max={100} />
      <Plot title={c('ram')} data={data.system} series={[{ id: 'ram', label: c('ram'), color: 4 }]} unit="GiB" max={data.ramCapacity} />
    </div>
    </Appearance.Provider>
  </div></main>
}
