/**
 * 模型品牌标识。
 *
 * 素材来自 `@lobehub/icons`（MIT，"Popular AI / LLM Model Brand SVG Logo and
 * Icon Collection"），深导入各品牌的 Mono 变体 —— 那是 `currentColor` 的单色
 * path，所以深浅主题零改动，`.models-card__icon` 上的 `color` 直接透传下去。
 *
 * **为什么不按 `record.provider` 查。** provider 说的是"哪个引擎跑它"（能力
 * 分类），不是"谁做的"（品牌归属），两个语义挤在同一个字段里。Hub 搜索结果
 * 没法表达"未知家族"，mock 只能硬塞一个占位 provider：
 *
 *   openai/whisper-large-v3         → 'qwen3-asr'   （会画出阿里的 logo）
 *   meta-llama/Llama-3.2-3B-Instruct → 'hy-mt2'      （会画出腾讯的 logo）
 *
 * 那是错误归属，比没有 logo 更糟。所以这里分两条路径：
 *   · Hub 搜索结果 → resourceId 的 `hub:<repo>` 前缀里解析 repo
 *   · 本地已安装   → resourceId（只有四个真实家族，键可靠），provider 兜底
 *
 * 两条路径都不够时返回 'unknown'，由调用方退回按类别分的通用图标：让用户一眼
 * 看出"这个我不认识"，比猜一个品牌出来诚实。
 */

/*
 * 刻意深导入 `components/Mono`，不走 `@lobehub/icons/es/Qwen` 这个品牌目录的
 * barrel。那个 index.js 会连带 re-export Avatar / Color / Combine / Text，而
 * Avatar 走的是 `../../features/IconAvatar` → @lobehub/ui → @emoji-mart，
 * 于是 vitest（Node ESM，摇树比 Rollup 弱）会在
 * `@emoji-mart/data/sets/15/native.json` 上炸 "needs an import attribute of
 * type: json"，三个测试套件直接加载失败。直接指向 Mono 就没有这条链 ——
 * Mono 自己只 import 本地 style 与 react/jsx-runtime。
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

/**
 * 家族 token，按具体度从高到低排；先命中先赢。
 * `unsloth/Hy-MT2-1.8B-GGUF` 这条是重点：HF 命名空间是**发布者**不是**作者**，
 * unsloth 只是二次分发方，所以不能只看 `owner/`，得在整条路径里找家族名。
 */
const REPO_TOKENS: ReadonlyArray<readonly [RegExp, KnownBrand]> = [
  [/qwen/i, 'qwen'],
  [/sensevoice|funaudiollm/i, 'alibaba'],
  [/hy-?mt2|hunyuan/i, 'hunyuan'],
  [/m2m100|nllb|llama/i, 'meta'],
]

/** 本地资源的 resourceId 比 repo 干净，直接按家族名匹配。 */
const LOCAL_TOKENS: ReadonlyArray<readonly [RegExp, KnownBrand]> = [
  [/qwen/i, 'qwen'],
  [/sensevoice/i, 'alibaba'],
  [/hy-?mt2|hunyuan/i, 'hunyuan'],
  [/m2m100/i, 'meta'],
]

/** resourceId 认不出来时的最后一档。provider 对本地模型是可靠的，对 Hub 结果不可靠。 */
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

/** 腾讯混元的字形是铺满 24×24 的实心圆盘（fill-rule=evenodd 挖空），其余三家是裸字形。同尺寸排在一起它会明显更重，缩一点做视觉配平。 */
const HUNYUAN_SCALE = 0.8

export interface ModelMarkProps {
  /** `null` 表示"这不是本地模型"（云端服务商），按类别退回通用图标。 */
  record: { resourceId: string; provider: string } | null
  /** 只在品牌认不出来时用：退回按类别分的通用图标。 */
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
      // 卡片标题里已经写了模型名，图标再报一遍名字是纯噪音。
      aria-hidden="true"
      focusable="false"
      // SVG 的 width/height 是表现属性，会被 .models-card__icon svg 那条 CSS 盖掉，
      // 所以配平尺寸必须走 inline style（行内样式优先级高于样式表）。
      style={brand === 'hunyuan' ? { width: size * HUNYUAN_SCALE, height: size * HUNYUAN_SCALE } : undefined}
    />
  )
}
