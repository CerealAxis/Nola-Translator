export interface PerformanceCall {
  at: number
  model?: string
  duration?: number
  queue?: number | null
  total?: number
  taskId?: string
}

export interface PerformanceTasks {
  at: number
  active: number
  queued: number
}

export interface GpuReading {
  id: string
  name?: string
  used?: number
  sharedUsed?: number
  integrated?: boolean
  capacity?: number
  load?: number
  allocations?: { models: string[]; used: number }[]
}

export interface HardwareReading {
  at: number
  cpu?: number
  ram?: number
  ramCapacity?: number
  gpus: GpuReading[]
}

export interface GatewayPerformanceSnapshot {
  end: number
  calls: PerformanceCall[]
  tasks: PerformanceTasks[]
  hardware: HardwareReading[]
  loadedModels?: Record<string, string>
}
