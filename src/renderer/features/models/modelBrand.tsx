/**
 * Brand marks from `@lobehub/icons` (MIT); the Mono variants are single `currentColor` paths,
 * so a theme switch needs nothing. `provider` is not the key: it names the loader that will
 * run a model, not who made it, and a hub repo carries an adapter id like `llama.cpp`. Hub ids
 * match on the repo path, local ids on their resourceId, anything else stays `'unknown'`.
 */
import Alibaba from '@lobehub/icons/es/Alibaba/components/Mono'
import AlibabaColor from '@lobehub/icons/es/Alibaba/components/Color'
import Bilibili from '@lobehub/icons/es/Bilibili/components/Mono'
import BilibiliColor from '@lobehub/icons/es/Bilibili/components/Color'
import Hunyuan from '@lobehub/icons/es/Hunyuan/components/Mono'
import HunyuanColor from '@lobehub/icons/es/Hunyuan/components/Color'
import Meta from '@lobehub/icons/es/Meta/components/Mono'
import MetaColor from '@lobehub/icons/es/Meta/components/Color'
import Microsoft from '@lobehub/icons/es/Microsoft/components/Mono'
import MicrosoftColor from '@lobehub/icons/es/Microsoft/components/Color'
import Qwen from '@lobehub/icons/es/Qwen/components/Mono'
import QwenColor from '@lobehub/icons/es/Qwen/components/Color'
import XiaomiMiMo from '@lobehub/icons/es/XiaomiMiMo/components/Mono'
import Baidu from '@lobehub/icons/es/Baidu/components/Mono'
import BaiduColor from '@lobehub/icons/es/Baidu/components/Color'
import { AudioLines, Globe, ScanText } from 'lucide-react'
import type { ComponentType, SVGProps } from 'react'
import comicTranslate from '@/assets/models/comic-translate.ico?url'
import koharu from '@/assets/models/koharu.png'
import kellenok from '@/assets/models/kellenok.webp'
import storia from '@/assets/models/storia.webp'
import mayocream from '@/assets/models/mayocream.webp'
import opencv from '@/assets/models/opencv.webp'
import { visualSeriesOf } from './visual-model-display'

export type ModelBrand = 'qwen' | 'alibaba' | 'hunyuan' | 'bilibili' | 'meta' | 'microsoft' | 'xiaomi-mimo' | 'baidu' | 'unknown'
type KnownBrand = Exclude<ModelBrand, 'unknown'>

type MarkProps = SVGProps<SVGSVGElement> & { size?: string | number; color?: string; title?: string }
type Mark = ComponentType<MarkProps>

const MARK_BY_BRAND: Record<KnownBrand, Mark> = {
  qwen: Qwen,
  baidu: Baidu,
  alibaba: Alibaba,
  hunyuan: Hunyuan,
  bilibili: Bilibili,
  meta: Meta,
  microsoft: Microsoft,
  'xiaomi-mimo': XiaomiMiMo,
}

const COLOR_MARK_BY_BRAND: Record<KnownBrand, Mark> = {
  qwen: QwenColor,
  baidu: BaiduColor,
  alibaba: AlibabaColor,
  hunyuan: HunyuanColor,
  bilibili: BilibiliColor,
  meta: MetaColor,
  microsoft: MicrosoftColor,
  'xiaomi-mimo': XiaomiMiMo,
}

/** Brand tokens, first match wins. */
const REPO_TOKENS: ReadonlyArray<readonly [RegExp, KnownBrand]> = [
  [/qwen/i, 'qwen'],
  [/sensevoice|funaudiollm|fun-asr/i, 'alibaba'],
  [/hy-?mt2|hunyuan/i, 'hunyuan'],
  [/index-translate|indexteam|bilibili/i, 'bilibili'],
  [/vibevoice|microsoft/i, 'microsoft'],
  [/mimo-v2|xiaomi/i, 'xiaomi-mimo'],
  [/m2m100|nllb|llama/i, 'meta'],
]

/** A local resource id is the family name itself, so it needs none of the repo heuristics. */
const LOCAL_TOKENS: ReadonlyArray<readonly [RegExp, KnownBrand]> = [
  [/qwen/i, 'qwen'],
  [/sensevoice|fun-asr/i, 'alibaba'],
  [/hy-?mt2|hunyuan/i, 'hunyuan'],
  [/index-translate/i, 'bilibili'],
  [/vibevoice/i, 'microsoft'],
  [/mimo-v2|xiaomi/i, 'xiaomi-mimo'],
  [/m2m100/i, 'meta'],
]

/** Last resort when the resourceId names no family; the keys are the built-in loader ids. */
const BY_PROVIDER: Record<string, KnownBrand> = {
  'qwen3-asr': 'qwen',
  sensevoice: 'alibaba',
  'hy-mt2': 'hunyuan',
  'index-translate': 'bilibili',
  'vibevoice-asr': 'microsoft',
  'mimo-v2.5-asr': 'xiaomi-mimo',
  m2m100: 'meta',
}

const HUB_PREFIX = /^hub:(.+)$/

export function brandOfRepo(repo: string): ModelBrand {
  for (const [pattern, brand] of REPO_TOKENS) if (pattern.test(repo)) return brand
  return 'unknown'
}

export function brandOf(record: { resourceId: string; provider: string }): ModelBrand {
  const id = record.resourceId
  if (/^(pp-ocrv[56]-|paddleocr-vl-)/.test(id)) return 'baidu'
  const hub = HUB_PREFIX.exec(id)
  if (hub) return brandOfRepo(hub[1])
  for (const [pattern, brand] of LOCAL_TOKENS) if (pattern.test(id)) return brand
  return BY_PROVIDER[record.provider] ?? 'unknown'
}

/**
 * Hunyuan's glyph is a solid disc filling the whole 24×24 box, punched out with `fill-rule`,
 * while the other brand marks are bare outlines, so at one size it reads much heavier and is scaled
 * down to balance the row.
 */
const HUNYUAN_SCALE = 0.8

const visualMarks: Readonly<Record<string, string>> = {
  // ogkalu's Comic Translate app icon. Its README links the detector's model card.
  'comic-rtdetr-onnx': comicTranslate,
  'comic-yuzu-font-onnx': comicTranslate,
  // Project icon from koharu-rs/koharu, packages/docs/assets/koharu-icon.png.
  'comic-rfdetr-seg-onnx': koharu,
  // Avatars published by the respective providers on Hugging Face.
  'comic-anglenet-onnx': kellenok,
  'comic-font-classifier-onnx': storia,
  'manga-ocr-onnx': mayocream,
  'lama-manga': mayocream,
  'comic-lama-manga-onnx': mayocream,
  'comic-lama-onnx': opencv,
}

export function hasModelMark(record: NonNullable<ModelMarkProps['record']>): boolean {
  return !visualSeriesOf(record) || Boolean(visualMarks[record.resourceId]) || brandOf(record) !== 'unknown'
}

export interface ModelMarkProps {
  /** `null` when the slot holds no local model, which falls back to the generic per-kind icon. */
  record: { resourceId: string; provider: string } | null
  /** Only used when no brand matches: falls back to the generic icon for `kind`. */
  kind: 'recognitionModel' | 'translationModel' | 'ttsModel' | 'ocrModel' | 'detectModel' | 'inpaintModel'
  size?: number
  brandColors?: boolean
}

export function ModelMark({ record, kind, size = 30, brandColors = false }: ModelMarkProps) {
  const logo = record && visualMarks[record.resourceId]
  if (logo) return <img className="model-project-logo shrink-0 object-contain" src={logo} width={size} height={size} alt="" />
  if (record && !hasModelMark(record)) return null
  const brand = record ? brandOf(record) : 'unknown'
  const Mark = brand === 'unknown' ? null : (brandColors ? COLOR_MARK_BY_BRAND : MARK_BY_BRAND)[brand]

  if (!Mark) {
    const Icon = kind === 'translationModel' ? Globe
      : kind === 'ocrModel' || kind === 'detectModel' || kind === 'inpaintModel' ? ScanText : AudioLines
    return <Icon size={size} aria-hidden="true" />
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
