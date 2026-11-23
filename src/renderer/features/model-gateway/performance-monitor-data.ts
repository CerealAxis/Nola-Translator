export type Capability = 'llm' | 'asr' | 'mt' | 'tts' | 'ocr' | 'detect' | 'repair' | 's2s'
export type Instance = { device: string; dedicated: number; shared: number; ram: number; cpu: number; gpu: number }
export type MonitorModel = {
  id: string
  name: string
  capability: Capability
  origin?: 'cloud'
  runtime: string
  state: 'running' | 'resident' | 'loading' | 'unloaded'
  instances: Instance[]
  active: number
  queued: number
  latency?: number
  speed?: string
  group?: string
}

export const models: MonitorModel[] = [
  { id: 'qwen', name: 'Qwen 3.5 4B Q4_K_M', capability: 'llm', runtime: 'llama.cpp', state: 'running', active: 1, queued: 1, latency: 1248, speed: '46 tok/s', instances: [{ device: 'RTX 4060', dedicated: 3.48, shared: 0.12, ram: 1.84, cpu: 8, gpu: 37 }] },
  { id: 'asr', name: 'SenseVoiceSmall Q4_K', capability: 'asr', runtime: 'CrispASR', state: 'running', active: 1, queued: 0, latency: 186, speed: '0.08 RTF', instances: [
    { device: 'RTX 4060', dedicated: 0.42, shared: 0.06, ram: 0.48, cpu: 4, gpu: 11 },
    { device: 'CPU', dedicated: 0, shared: 0, ram: 0.42, cpu: 0, gpu: 0 },
  ] },
  { id: 'mt', name: 'Hy-MT2 1.8B Q4_K_M', capability: 'mt', runtime: 'llama.cpp', state: 'running', active: 1, queued: 0, latency: 214, instances: [{ device: 'RTX 4060', dedicated: 1.18, shared: 0.08, ram: 0.92, cpu: 6, gpu: 19 }] },
  { id: 'ocr', name: 'PP-OCRv5 mobile', capability: 'ocr', runtime: 'ONNX Runtime', state: 'resident', active: 0, queued: 0, latency: 48, speed: '20.8 img/s', group: 'OCR Worker', instances: [] },
  { id: 'detector', name: 'Comic Text Detector', capability: 'detect', runtime: 'ONNX Runtime', state: 'resident', active: 0, queued: 0, latency: 92, group: 'OCR Worker', instances: [] },
  { id: 'repair', name: 'LaMa Manga', capability: 'repair', runtime: 'PyTorch', state: 'loading', active: 0, queued: 1, instances: [{ device: 'CPU', dedicated: 0, shared: 0, ram: 0.63, cpu: 13, gpu: 0 }] },
  { id: 'tts', name: 'MiMo TTS(API)', capability: 'tts', origin: 'cloud', runtime: 'Xiaomi', state: 'running', active: 1, queued: 0, latency: 360, instances: [] },
  { id: 's2s', name: 'LiveTranslate', capability: 's2s', origin: 'cloud', runtime: 'Alibaba Cloud', state: 'resident', active: 0, queued: 0, latency: 720, instances: [] },
  { id: 'cosy', name: 'CosyVoice3 0.5B', capability: 'tts', runtime: 'PyTorch', state: 'unloaded', active: 0, queued: 0, instances: [] },
]

export const sharedProcess: Instance = { device: 'Intel Iris Xe', dedicated: 0, shared: 0.28, ram: 0.72, cpu: 2, gpu: 8 }
export const devices = [
  { name: 'RTX 4060', load: 68, nolaLoad: 54, dedicated: 5.84, shared: 0.43, capacity: 8 },
  { name: 'Intel Iris Xe', load: 13, nolaLoad: 8, dedicated: 0, shared: 0.62, capacity: 0 },
]

export type Stage = { key: 'input' | 'asr' | 'mt' | 'tts' | 's2s' | 'output'; ms: number; model?: string }
export const sessions: { id: string; start: string; active: boolean; stages: Stage[] }[] = [
  { id: 'cascade', start: '14:32', active: true, stages: [
    { key: 'input', ms: 0 }, { key: 'asr', model: 'asr', ms: 186 }, { key: 'mt', model: 'mt', ms: 214 },
    { key: 'tts', model: 'tts', ms: 360 }, { key: 'output', ms: 52 },
  ] },
  { id: 'direct', start: '14:25', active: false, stages: [
    { key: 'input', ms: 0 }, { key: 's2s', model: 's2s', ms: 720 }, { key: 'output', ms: 46 },
  ] },
]

export const isCloud = (model: MonitorModel) => model.origin === 'cloud'
export const sum = (model: MonitorModel, field: 'dedicated' | 'shared' | 'ram') =>
  model.instances.reduce((total, instance) => total + instance[field], 0)
