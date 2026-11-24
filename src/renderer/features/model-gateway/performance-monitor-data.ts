import type { GatewayPerformanceSnapshot } from '../../../shared/gateway-performance'

export type Sample = { at: number } & Record<string, number | null>
type Series = { id: string; label: string; color: number }
type Adapter = { name?: string; capacity?: number; integrated?: boolean; allocations: Map<string, Series & { models: string[] }> }
export const modelLabel = (model: string) => model.replace(/^llm:/, '')

const round = (value?: number) => value === undefined ? null : Math.round(value * 100) / 100

export function performanceWindow(snapshot: GatewayPerformanceSnapshot, minutes: number, selectedModel: string, sharedLabel: string) {
  const start = snapshot.end - minutes * 60_000
  const inside = (point: { at: number }) => point.at >= start && point.at <= snapshot.end
  const models = new Map<string, Series>()
  const ensureModel = (model: string) => {
    let series = models.get(model)
    if (!series) {
      series = { id: 'model_' + models.size, label: snapshot.loadedModels?.[model] ?? modelLabel(model), color: models.size % 4 + 2 }
      models.set(model, series)
    }
    return series
  }

  const gpus = new Map<string, Adapter>()
  for (const model of Object.keys(snapshot.loadedModels ?? {})) ensureModel(model)
  for (const point of snapshot.calls) if (point.model) ensureModel(point.model)
  for (const point of snapshot.hardware) {
    for (const reading of point.gpus) {
      const device: Adapter = gpus.get(reading.id) ?? { allocations: new Map() }
      device.name = reading.name ?? device.name
      device.capacity = reading.capacity ?? device.capacity
      device.integrated = reading.integrated ?? device.integrated
      gpus.set(reading.id, device)
      for (const allocation of reading.allocations ?? []) {
        const series = allocation.models.map(ensureModel)
        const key = JSON.stringify(allocation.models)
        if (!device.allocations.has(key)) device.allocations.set(key, {
          id: 'allocation_' + device.allocations.size, models: allocation.models,
          label: series.length === 1 ? series[0].label : sharedLabel + ' · ' + series.map(s => s.label).join(' / '),
          color: series.length === 1 ? series[0].color : 5,
        })
      }
    }
  }
  const shown = (model: string) => selectedModel === 'all' || selectedModel === model
  const eventData: Sample[] = []
  for (const point of snapshot.calls) {
    if (!inside(point)) continue
    if (point.model && shown(point.model)) {
      eventData.push({ at: point.at, [ensureModel(point.model).id]: round(point.duration), queue: round(point.queue ?? undefined) })
    } else if (point.taskId && point.total !== undefined && selectedModel === 'all') {
      eventData.push({ at: point.at, total: round(point.total) })
    }
  }

  const tasks: Sample[] = snapshot.tasks.filter(inside).map(point => ({ ...point }))
  const first = snapshot.tasks.findIndex(point => point.at >= start)
  const before = first < 0 ? snapshot.tasks.at(-1) : snapshot.tasks[first - 1]
  if (before) tasks.unshift({ ...before, at: start })
  const lastTask = tasks.at(-1)
  if (lastTask) tasks.push({ ...lastTask, at: snapshot.end })

  const readings = snapshot.hardware.filter(inside)
  const system = readings.map(point => ({ at: point.at, cpu: round(point.cpu), ram: round(point.ram) }))
  const adapters = [...gpus].map(([id, device], index) => {
    const discrete = device.integrated === false
    const data = readings.map((point): Sample => {
      const gpu = point.gpus.find(item => item.id === id)
      const used = discrete ? gpu?.used
        : gpu?.used != null && gpu.sharedUsed != null ? gpu.used + gpu.sharedUsed : undefined
      const sample: Sample = { at: point.at, used: round(used), load: round(gpu?.load) }
      for (const allocation of discrete ? gpu?.allocations ?? [] : []) {
        const series = device.allocations.get(JSON.stringify(allocation.models))
        if (series) sample[series.id] = round(allocation.used)
      }
      return sample
    })
    return {
      id, label: 'GPU ' + index + (device.name ? ' · ' + device.name : ''),
      capacity: discrete ? round(device.capacity) ?? undefined : undefined,
      allocations: discrete ? [...device.allocations.values()].filter(series => series.models.some(shown)) : [],
      data,
    }
  })
  return {
    start, end: snapshot.end, adapters, models, eventData, tasks, system,
    ramCapacity: round(readings.at(-1)?.ramCapacity) ?? undefined,
    modelLines: [...models].filter(([model]) => shown(model)).map(([, series]) => series),
  }
}
