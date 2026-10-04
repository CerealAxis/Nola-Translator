import { z } from 'zod'

export const computeSettingsSchema = z.object({
  recognitionEngine: z.enum(['pytorch', 'llama']).default('pytorch'),
  translationEngine: z.enum(['auto', 'pytorch', 'llama']).default('auto'),
  recognitionDevice: z.string().min(1).max(512).default('auto'),
  translationDevice: z.string().min(1).max(512).default('auto'),
  allowCpuFallback: z.boolean().default(true),
  precision: z.enum(['auto', 'fp32', 'fp16', 'bf16']).default('auto'),
  quantization: z.enum(['auto', 'none', 'nf4', '8bit']).default('auto'),
  reservedVramMb: z.number().int().min(256).max(65536).default(1024),
  cpuThreads: z.number().int().min(0).max(256).default(0),
  gpuLayers: z.number().int().min(-1).max(1000).default(-1),
  contextSize: z.number().int().min(512).max(32768).default(2048),
  flashAttention: z.enum(['auto', 'on', 'off']).default('auto'),
  runtimeId: z.string().regex(/^(bundled|[a-z0-9][a-z0-9-]{0,79})$/).default('auto'),
  llamaRuntimeId: z.string().regex(/^(bundled|[a-z0-9][a-z0-9-]{0,79})$/).default('auto'),
})

export type ComputeSettings = z.infer<typeof computeSettingsSchema>
export const DEFAULT_COMPUTE_SETTINGS: ComputeSettings = computeSettingsSchema.parse({})

// Patches must not fill omitted fields with defaults (including through Zod optional fields).
const computeFields = computeSettingsSchema.shape
export const computeSettingsPatchSchema = z.object({
  recognitionEngine: computeFields.recognitionEngine.removeDefault(),
  translationEngine: computeFields.translationEngine.removeDefault(),
  recognitionDevice: computeFields.recognitionDevice.removeDefault(),
  translationDevice: computeFields.translationDevice.removeDefault(),
  allowCpuFallback: computeFields.allowCpuFallback.removeDefault(),
  precision: computeFields.precision.removeDefault(),
  quantization: computeFields.quantization.removeDefault(),
  reservedVramMb: computeFields.reservedVramMb.removeDefault(),
  cpuThreads: computeFields.cpuThreads.removeDefault(),
  gpuLayers: computeFields.gpuLayers.removeDefault(),
  contextSize: computeFields.contextSize.removeDefault(),
  flashAttention: computeFields.flashAttention.removeDefault(),
  runtimeId: computeFields.runtimeId.removeDefault(),
  llamaRuntimeId: computeFields.llamaRuntimeId.removeDefault(),
}).partial()

export const computeDeviceSchema = z.object({
  id: z.string().min(1).max(512), name: z.string().max(256),
  backend: z.string().max(32), torchDevice: z.string().max(64).nullable(),
  llamaDevice: z.string().max(64).nullable(),
  totalMemoryMb: z.number().nonnegative(), freeMemoryMb: z.number().nonnegative(),
  integrated: z.boolean(), stableId: z.boolean(),
  recognition: z.boolean(), translation: z.boolean(),
  reason: z.string().max(1024), score: z.number(),
})
export type ComputeDevice = z.infer<typeof computeDeviceSchema>
export const computeSnapshotSchema = z.object({
  devices: z.array(computeDeviceSchema).max(64), notes: z.array(z.string().max(1024)).max(32),
  torchVersion: z.string().max(64),
  // Python's serializer omits None fields while no session is running.
  activePlan: z.record(z.string(), z.unknown()).nullable().default(null),
})
export type ComputeSnapshot = z.infer<typeof computeSnapshotSchema>

export const runtimePackageSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/), name: z.string().min(1).max(256),
  kind: z.enum(['engine', 'llama']), backend: z.enum(['cpu', 'cuda', 'xpu', 'rocm', 'vulkan']),
  version: z.string().min(1).max(64), url: z.string().url().startsWith('https://'),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().positive(),
  companions: z.array(z.object({ url: z.string().url().startsWith('https://'),
    sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().positive() })).max(4).optional(),
})
export type RuntimePackage = z.infer<typeof runtimePackageSchema>
export type RuntimePackageState = RuntimePackage & { installed: boolean }
export const runtimeRecipeSchema = z.object({
  id: z.string().regex(/^(?!auto$|bundled$)[a-z0-9][a-z0-9-]{0,79}$/),
  name: z.string().min(1).max(256), backend: z.literal('cuda'),
  pythonAbi: z.literal('cp313-win_amd64'), torchVersion: z.string().regex(/^\d+\.\d+\.\d+\+cu\d+$/),
  minimumDriver: z.string().regex(/^\d+\.\d+$/),
  wheel: z.object({
    url: z.string().url().startsWith('https://download.pytorch.org/whl/'),
    filename: z.string().regex(/^torch-[a-zA-Z0-9+_.-]+\.whl$/),
    sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().positive(),
  }),
})
export type RuntimeRecipe = z.infer<typeof runtimeRecipeSchema>
export type RuntimeRecipeState = RuntimeRecipe & { installed: boolean; available: boolean; reason: string }
export type HardwareInventory = {
  adapters: { name: string; vendor: 'nvidia' | 'amd' | 'intel' | 'other'; driver: string; hardwareId: string }[]
  nvidiaDriver: string | null
  notes: string[]
}
export type RuntimeRecommendation = { engineId: string | null; llamaId: string | null; reasons: string[] }
export type LocalRuntime = {
  path: string
  source: 'project' | 'bundled'
  status: 'ready' | 'missing' | 'failed'
  backend: string
  version: string
  gpuAvailable: boolean
  reason: string
}
export type RuntimeSnapshot = {
  packages: RuntimePackageState[]
  recipes: RuntimeRecipeState[]
  hardware: HardwareInventory
  recommendation: RuntimeRecommendation
  local: { engine: LocalRuntime; llama: LocalRuntime }
  operation: { id: string; phase: 'download' | 'verify' | 'extract' | 'prepare' | 'check'; bytes: number; totalBytes: number } | null
  lastError: string | null
  directory: string
}
