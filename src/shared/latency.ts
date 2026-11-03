export type LatencyProvider = 'local' | 'cloud'

export interface LatencyWavePoint {
  at: number
  min: number
  max: number
}

export interface LatencySample {
  id: string
  at: number
  total: number | null
  asr?: number
  mt?: number
  tts?: number
  wait?: number
  remote?: number
  providers?: { mt?: LatencyProvider }
}

export interface LatencySnapshot {
  active: boolean
  available?: boolean
  speech: boolean
  output: 'source' | 'translation' | 'speech'
  route: 'cascade' | 's2s'
  providers: { asr?: LatencyProvider; mt?: LatencyProvider; tts?: LatencyProvider }
  samples: LatencySample[]
  input: LatencyWavePoint[]
  outputWave: LatencyWavePoint[]
  now: number
}
