/**
 * Brand marks from `@lobehub/icons` (MIT); the Mono variants are single `currentColor` paths,
 * so a theme switch needs nothing. `provider` is not the key: it names the loader that will
 * run a model, not who made it, and a hub repo carries an adapter id like `llama.cpp`. Hub ids
 * match on the repo path, local ids on their resourceId, anything else stays `'unknown'`.
 */
import Alibaba from '@lobehub/icons/es/Alibaba/components/Mono'
import Hunyuan from '@lobehub/icons/es/Hunyuan/components/Mono'
import Meta from '@lobehub/icons/es/Meta/components/Mono'
import Qwen from '@lobehub/icons/es/Qwen/components/Mono'
import { AudioLines, Globe } from 'lucide-react'
import type { ComponentType, SVGProps } from 'react'

export type ModelBrand = 'qwen' | 'alibaba' | 'hunyuan' | 'meta' | 'unknown'
type KnownBrand = Exclude<ModelBrand, 'unknown'>

type MarkProps = SVGProps<SVGSVGElement> & { size?: string | number; color?: string; title?: string }
type Mark = ComponentType<MarkProps>

const MARK_BY_BRAND: Record<KnownBrand, Mark> = { qwen: Qwen, alibaba: Alibaba, hunyuan: Hunyuan, meta: Meta }

/** Brand tokens, first match wins. */
const REPO_TOKENS: ReadonlyArray<readonly [RegExp, KnownBrand]> = [
  [/qwen/i, 'qwen'],
  [/sensevoice|funaudiollm/i, 'alibaba'],
  [/hy-?mt2|hunyuan/i, 'hunyuan'],
  [/m2m100|nllb|llama/i, 'meta'],
]

/** A local resource id is the family name itself, so it needs none of the repo heuristics. */
const LOCAL_TOKENS: ReadonlyArray<readonly [RegExp, KnownBrand]> = [
  [/qwen/i, 'qwen'],
  [/sensevoice/i, 'alibaba'],
  [/hy-?mt2|hunyuan/i, 'hunyuan'],
  [/m2m100/i, 'meta'],
]

/** Last resort when the resourceId names no family; the keys are the built-in loader ids. */
const BY_PROVIDER: Record<string, KnownBrand> = {
  'qwen3-asr': 'qwen',
  sensevoice: 'alibaba',
  'hy-mt2': 'hunyuan',
  m2m100: 'meta',
}

const HUB_PREFIX = /^hub:(.+)$/

export function brandOfRepo(repo: string): ModelBrand {
  for (const [pattern, brand] of REPO_TOKENS) if (pattern.test(repo)) return brand
  return 'unknown'
}

export function brandOf(record: { resourceId: string; provider: string }): ModelBrand {
  const id = record.resourceId
  const hub = HUB_PREFIX.exec(id)
  if (hub) return brandOfRepo(hub[1])
  for (const [pattern, brand] of LOCAL_TOKENS) if (pattern.test(id)) return brand
  return BY_PROVIDER[record.provider] ?? 'unknown'
}

/**
 * Hunyuan's glyph is a solid disc filling the whole 24×24 box, punched out with `fill-rule`,
 * while the other three are bare outlines, so at one size it reads much heavier and is scaled
 * down to balance the row.
 */
const HUNYUAN_SCALE = 0.8

export interface ModelMarkProps {
  /** `null` when the slot holds no local model, which falls back to the generic per-kind icon. */
  record: { resourceId: string; provider: string } | null
  /** Only used when no brand matches: falls back to the generic icon for `kind`. */
  kind: 'recognitionModel' | 'translationModel'
  size?: number
}

export function ModelMark({ record, kind, size = 30 }: ModelMarkProps) {
  const brand = record ? brandOf(record) : 'unknown'
  const Mark = brand === 'unknown' ? null : MARK_BY_BRAND[brand]

  if (!Mark) {
    return kind === 'recognitionModel' ? <AudioLines aria-hidden="true" /> : <Globe aria-hidden="true" />
  }

  return (
    <Mark
      size={size}
      aria-hidden="true"
      focusable="false"
      // `width`/`height` on an SVG are presentational and lose to `.models-card__icon svg`.
      // Inline style outranks the stylesheet, so the size balance has to go through it.
      style={brand === 'hunyuan' ? { width: size * HUNYUAN_SCALE, height: size * HUNYUAN_SCALE } : undefined}
    />
  )
}
