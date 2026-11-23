import { useState } from 'react'
import { ArrowRight, ChevronRight } from 'lucide-react'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Dialog, DialogCloseButton, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { devices, isCloud, models, sessions, sharedProcess, sum, type MonitorModel } from './performance-monitor-data'
import { useMonitorCopy } from './performance-monitor-copy'

const stateTone: Record<MonitorModel['state'], BadgeVariant> = {
  running: 'success', resident: 'secondary', loading: 'warning', unloaded: 'outline',
}
const stateOrder: MonitorModel['state'][] = ['running', 'loading', 'resident', 'unloaded']

const gb = (value: number) => `${value.toFixed(2)} GB`
const ms = (value?: number) => value === undefined ? '—' : `${value} ms`

function Filter({ label, value, options, onChange }: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  return <Select value={value} items={options} onValueChange={next => { if (next !== null) onChange(next) }}>
    <SelectTrigger aria-label={label}><SelectValue /></SelectTrigger>
    <SelectContent><SelectGroup>{options.map(option =>
      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
    )}</SelectGroup></SelectContent>
  </Select>
}

const historyFactors = [0.82, 0.96, 0.92, 1.03, 0.97, 1]
function ResourceHistory({ value, label }: { value: number; label: string }) {
  const c = useMonitorCopy()
  const data = historyFactors.map((factor, index) => ({
    time: `14:${22 + index * 2}`,
    usage: Number((value * factor).toFixed(2)),
  }))
  return <div className="performance-monitor-stack">
    <div className="performance-monitor-summary type-muted text-muted">
      <span>{label}</span><span>{c('peak')} · {gb(Math.max(...data.map(point => point.usage)))}</span>
    </div>
    <ChartContainer className="aspect-auto h-40 w-full" config={{ usage: { label, color: 'var(--chart-1)' } }}>
    <LineChart accessibilityLayer data={data}>
      <CartesianGrid vertical={false} />
      <XAxis dataKey="time" tickLine={false} axisLine={false} />
      <YAxis unit=" GB" tickLine={false} axisLine={false} width={64} />
      <ChartTooltip content={<ChartTooltipContent />} />
      <Line type="linear" dataKey="usage" stroke="var(--color-usage)" strokeWidth={2} dot={false} isAnimationActive={false} />
    </LineChart>
    </ChartContainer>
  </div>
}

export function PerformanceMonitor() {
  const c = useMonitorCopy()
  const [source, setSource] = useState('all')
  const [capability, setCapability] = useState('all')
  const [sort, setSort] = useState('state')
  const [selectedModel, setSelectedModel] = useState<MonitorModel | null>(null)
  const [sessionId, setSessionId] = useState('cascade')
  const [scope, setScope] = useState('whole')
  const [deviceName, setDeviceName] = useState(devices[0].name)
  const session = sessions.find(item => item.id === sessionId) ?? sessions[0]
  const device = devices.find(item => item.name === deviceName) ?? devices[0]
  const capabilities = [...new Set(models.map(model => model.capability))]
  const visibleModels = models.filter(model =>
    (source === 'all' || isCloud(model) === (source === 'cloud')) &&
    (capability === 'all' || model.capability === capability)
  )
  if (sort === 'dedicated') visibleModels.sort((a, b) => sum(b, 'dedicated') - sum(a, 'dedicated'))
  else visibleModels.sort((a, b) => stateOrder.indexOf(a.state) - stateOrder.indexOf(b.state))
  const deviceModels = models.filter(model => model.instances.some(instance => instance.device === device.name))
  const sharedOnDevice = device.name === sharedProcess.device
  const deviceProcesses = [
    ...deviceModels.flatMap(model => model.instances.filter(instance => instance.device === device.name)),
    ...(sharedOnDevice ? [sharedProcess] : []),
  ]
  const dedicated = scope === 'whole' ? device.dedicated : deviceProcesses.reduce((total, item) => total + item.dedicated, 0)
  const shared = scope === 'whole' ? device.shared : deviceProcesses.reduce((total, item) => total + item.shared, 0)
  const selectedInstances = selectedModel?.group ? [sharedProcess] : selectedModel?.instances ?? []

  return <>
    <Tabs defaultValue="models" className="performance-monitor">
      <TabsList className="w-fit max-w-full" aria-label={c('title')}>
        <TabsTrigger value="models">{c('models')}</TabsTrigger>
        <TabsTrigger value="pipeline">{c('pipeline')}</TabsTrigger>
        <TabsTrigger value="devices">{c('devices')}</TabsTrigger>
      </TabsList>
      <TabsContent value="models">
        <Card className="performance-monitor-card">
          <CardHeader>
            <div className="performance-monitor-toolbar">
              <CardTitle>{c('models')}</CardTitle>
              <div className="performance-monitor-controls">
                <Filter label={c('all')} value={source} onChange={setSource} options={[
                  { value: 'all', label: c('all') }, { value: 'local', label: c('local') }, { value: 'cloud', label: c('cloud') },
                ]} />
                <Filter label={c('capability')} value={capability} onChange={setCapability} options={[
                  { value: 'all', label: c('kinds') },
                  ...capabilities.map(kind => ({ value: kind, label: c(kind) })),
                ]} />
                <Filter label={c('sort')} value={sort} onChange={setSort} options={[
                  { value: 'state', label: c('state') }, { value: 'dedicated', label: c('dedicated') },
                ]} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table className="performance-monitor-table" aria-label={c('models')}>
              <TableHeader><TableRow>
                <TableHead scope="col">{c('models')}</TableHead>
                <TableHead scope="col">{c('state')}</TableHead>
                <TableHead scope="col" className="performance-monitor-wide">{c('devices')}</TableHead>
                <TableHead scope="col" className="text-end">{c('dedicated')}</TableHead>
                <TableHead scope="col" className="performance-monitor-wide text-end">{c('shared')}</TableHead>
                <TableHead scope="col" className="text-end">{c('ram')}</TableHead>
                <TableHead scope="col" className="performance-monitor-wide text-end">{c('tasks')}</TableHead>
                <TableHead scope="col" className="performance-monitor-wide text-end">{c('latency')}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {visibleModels.map(model => {
                  const location = isCloud(model) ? c('cloud') : model.group ? c('group') : model.instances.map(item => item.device).join(', ') || '—'
                  const footprint = model.instances.length > 0
                  return <TableRow key={model.id}>
                    <TableCell className="performance-monitor-model-cell">
                      <Button variant="tertiary" className="performance-monitor-model-link" onClick={() => setSelectedModel(model)}>
                        <span className="min-w-0 whitespace-normal text-start">{model.name}</span><ChevronRight data-icon="inline-end" aria-hidden="true" />
                      </Button>
                      <div className="type-muted text-muted">{c(model.capability)} · {model.runtime}</div>
                    </TableCell>
                    <TableCell><Badge variant={stateTone[model.state]}>{c(model.state)}</Badge></TableCell>
                    <TableCell className="performance-monitor-wide">{location}</TableCell>
                    <TableCell className="text-end tabular-nums">{footprint ? gb(sum(model, 'dedicated')) : isCloud(model) ? c('cloud') : '—'}</TableCell>
                    <TableCell className="performance-monitor-wide text-end tabular-nums">{footprint ? gb(sum(model, 'shared')) : '—'}</TableCell>
                    <TableCell className="text-end tabular-nums">{footprint ? gb(sum(model, 'ram')) : '—'}</TableCell>
                    <TableCell className="performance-monitor-wide text-end tabular-nums">
                      {model.active}{model.queued > 0 && <span className="text-muted"> · {c('queued')} {model.queued}</span>}
                    </TableCell>
                    <TableCell className="performance-monitor-wide text-end tabular-nums">{ms(model.latency)}</TableCell>
                  </TableRow>
                })}
              </TableBody>
            </Table>
            {visibleModels.length === 0 && <p className="py-6 text-center text-muted">{c('empty')}</p>}
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="pipeline">
        <Card>
          <CardHeader>
            <div className="performance-monitor-toolbar">
              <CardTitle>{c('pipeline')}</CardTitle>
              <Filter label={c('session')} value={sessionId} onChange={setSessionId}
                options={sessions.map(item => ({ value: item.id, label: `${item.start} · ${c(item.id === 'cascade' ? 'cascade' : 'direct')}` }))} />
            </div>
          </CardHeader>
          <CardContent className="performance-monitor-stack">
            <div className="performance-monitor-summary">
              <div><span className="type-muted text-muted">{c('total')}</span><div className="type-h3 tabular-nums">{ms(session.stages.reduce((total, stage) => total + stage.ms, 0))}</div></div>
              <Badge variant={session.active ? 'success' : 'outline'}>{c(session.active ? 'running' : 'ended')}</Badge>
            </div>
            <ol className="performance-monitor-stages">
              {session.stages.map((stage, index) => {
                const model = models.find(item => item.id === stage.model)
                return <li key={stage.key} className="performance-monitor-stage">
                  <div className="performance-monitor-stage-body">
                    <span className="type-small text-muted">{c(stage.key)}</span>
                    <span className="type-h4 tabular-nums">{stage.key === 'input' ? 'PCM' : ms(stage.ms)}</span>
                    {model && <Button variant="outline" onClick={() => setSelectedModel(model)} className="h-auto min-h-[var(--control-height)] whitespace-normal text-start">{model.name}</Button>}
                  </div>
                  {index < session.stages.length - 1 && <ArrowRight className="performance-monitor-stage-arrow" aria-hidden="true" />}
                </li>
              })}
            </ol>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="devices">
        <Card>
          <CardHeader>
            <div className="performance-monitor-toolbar">
              <CardTitle>{c('devices')}</CardTitle>
              <div className="performance-monitor-controls">
                <Filter label={c('devices')} value={device.name} onChange={setDeviceName} options={devices.map(item => ({ value: item.name, label: item.name }))} />
                <Filter label={c('scope')} value={scope} onChange={setScope} options={[{ value: 'whole', label: c('whole') }, { value: 'nola', label: 'Nola' }]} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="performance-monitor-stack">
            <dl className="performance-monitor-metrics">
              <div><dt>GPU · {c('load')}</dt><dd>{scope === 'whole' ? device.load : device.nolaLoad}%</dd></div>
              <div><dt>{c('dedicated')}</dt><dd>{gb(dedicated)}{device.capacity > 0 && <small> / {device.capacity} GB</small>}</dd></div>
              <div><dt>{c('shared')}</dt><dd>{gb(shared)}</dd></div>
              <div><dt>CPU</dt><dd>{scope === 'whole' ? '31%' : '33%'}</dd></div>
              <div><dt>{c('ram')}</dt><dd>{scope === 'whole' ? '14.28 / 32 GB' : gb(models.reduce((total, model) => total + sum(model, 'ram'), sharedProcess.ram))}</dd></div>
            </dl>
            <ResourceHistory value={dedicated || shared} label={c(dedicated ? 'dedicated' : 'shared')} />
            {(deviceModels.length > 0 || sharedOnDevice) && <div className="performance-monitor-controls">
              {deviceModels.map(model => <Button key={model.id} variant="outline" onClick={() => setSelectedModel(model)}>{model.name}</Button>)}
              {sharedOnDevice && <Button variant="outline" onClick={() => setSelectedModel(models.find(model => model.group) ?? null)}>OCR Worker · {c('group')}</Button>}
            </div>}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
    <Dialog open={selectedModel !== null} onOpenChange={open => { if (!open) setSelectedModel(null) }}>
      {selectedModel && <DialogContent className="model-detail-drawer performance-monitor-detail">
        <DialogCloseButton />
        <DialogHeader>
          <DialogTitle>{selectedModel.name}</DialogTitle>
          <DialogDescription>{c(selectedModel.capability)} · {selectedModel.runtime}</DialogDescription>
        </DialogHeader>
        <CardContent className="performance-monitor-stack">
          <div className="performance-monitor-controls">
            <Badge variant={stateTone[selectedModel.state]}>{c(selectedModel.state)}</Badge>
            {isCloud(selectedModel) && <Badge variant="outline">{c('cloud')}</Badge>}
          </div>
          <dl className="performance-monitor-metrics">
            <div><dt>{c('tasks')}</dt><dd>{selectedModel.active}</dd></div>
            <div><dt>{c('queued')}</dt><dd>{selectedModel.queued}</dd></div>
            {selectedModel.speed && <div><dt>{c('speed')}</dt><dd>{selectedModel.speed}</dd></div>}
          </dl>
          {selectedModel.latency !== undefined && <section className="performance-monitor-instance">
            <div className="performance-monitor-summary">
              <h3 className="type-h4">{c('lastRequest')}</h3>
              <Badge variant="success">{c('completed')}</Badge>
            </div>
            <dl className="performance-monitor-metrics">
              <div><dt>{c('latency')}</dt><dd>{ms(selectedModel.latency)}</dd></div>
              {selectedModel.capability === 'llm' && <>
                <div><dt>{c('queued')}</dt><dd>{ms(42)}</dd></div>
                <div><dt>{c('firstOutput')}</dt><dd>{ms(218)}</dd></div>
              </>}
            </dl>
          </section>}
          {selectedModel.id === 'tts' && <div className="performance-monitor-controls">
            <Badge variant="danger">{c('failed')}</Badge><span className="type-muted">{c('timeout')}</span>
          </div>}
          {selectedInstances.length > 0 && <section className="performance-monitor-stack">
            <h3 className="type-h4">{c(selectedModel.group ? 'group' : 'instances')}</h3>
            {selectedModel.group && <div className="type-muted text-muted">
              {selectedModel.group} · {models.filter(model => model.group === selectedModel.group).map(model => model.name).join(' / ')}
            </div>}
            {selectedInstances.map((instance, index) => <div className="performance-monitor-instance" key={`${instance.device}-${index}`}>
              <div className="type-small">{instance.device}</div>
              <dl className="performance-monitor-metrics">
                <div><dt>{c('dedicated')}</dt><dd>{gb(instance.dedicated)}</dd></div>
                <div><dt>{c('shared')}</dt><dd>{gb(instance.shared)}</dd></div>
                <div><dt>{c('ram')}</dt><dd>{gb(instance.ram)}</dd></div>
                <div><dt>CPU</dt><dd>{instance.cpu}%</dd></div>
                {instance.device !== 'CPU' && <div><dt>GPU</dt><dd>{instance.gpu}%</dd></div>}
              </dl>
            </div>)}
            <h3 className="type-h4">{c('history')}</h3>
            <ResourceHistory value={selectedInstances.reduce((total, instance) => total + instance.ram, 0)} label={c('ram')} />
            {(['dedicated', 'shared'] as const).map(field => {
              const value = selectedInstances.reduce((total, instance) => total + instance[field], 0)
              return value > 0 && <ResourceHistory key={field} value={value} label={c(field)} />
            })}
          </section>}
        </CardContent>
      </DialogContent>}
    </Dialog>
  </>
}
