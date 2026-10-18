/** PyPI simple-index URLs offered by the network settings picker. */
export const PYPI_MIRROR_DEFAULT = 'https://mirrors.aliyun.com/pypi/simple/'
export const PYPI_MIRROR_AUTO = 'auto'

export const PYPI_MIRROR_NODES = [
  PYPI_MIRROR_AUTO,
  PYPI_MIRROR_DEFAULT,
  'https://pypi.tuna.tsinghua.edu.cn/simple/',
  'https://repo.huaweicloud.com/repository/pypi/simple/',
  'https://mirrors.cloud.tencent.com/pypi/simple/',
] as const

/** PyTorch wheel mirrors ordered by measured throughput; each keeps the official `/whl/<channel>/<file>` shape. */
export const PYTORCH_WHEEL_MIRRORS = [
  'https://mirror.sjtu.edu.cn/pytorch-wheels/',
  'https://mirrors.aliyun.com/pytorch-wheels/',
] as const

/** Wheel-mirror selection that tries every catalog entry in order. */
export const PYTORCH_WHEEL_MIRROR_AUTO = 'auto'
/** Official wheel host; selected on its own it is used verbatim, otherwise it closes every candidate list. */
export const PYTORCH_WHEEL_MIRROR_OFFICIAL = 'https://download-r2.pytorch.org/whl/'

export const PYTORCH_WHEEL_MIRROR_NODES = [
  PYTORCH_WHEEL_MIRROR_AUTO, ...PYTORCH_WHEEL_MIRRORS, PYTORCH_WHEEL_MIRROR_OFFICIAL,
] as const

const NODE_SET = new Set<string>(PYPI_MIRROR_NODES)
const WHEEL_NODE_SET = new Set<string>(PYTORCH_WHEEL_MIRROR_NODES)

/**
 * Rewrite an official PyTorch wheel address to the mirror candidates chosen by `selection`, official
 * address last. A value outside the catalog is read as `auto`, so a hand-edited file still resolves.
 */
export function pytorchWheelUrls(url: string, selection: string = PYTORCH_WHEEL_MIRROR_AUTO): string[] {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'download-r2.pytorch.org' || !parsed.pathname.startsWith('/whl/')) return [url]
    if (selection === PYTORCH_WHEEL_MIRROR_OFFICIAL) return [url]
    const suffix = `${parsed.pathname.slice('/whl/'.length)}${parsed.search}`
    const base = selection === PYTORCH_WHEEL_MIRROR_AUTO ? null : findPytorchWheelMirrorNode(selection)
    const mirrors = base && base !== PYTORCH_WHEEL_MIRROR_OFFICIAL ? [base] : PYTORCH_WHEEL_MIRRORS
    return [...mirrors.map(entry => entry + suffix), url]
  } catch { return [url] }
}

/** Normalize a saved index URL to a picker entry, or return null for an unknown URL. */
export function findPypiMirrorNode(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed === PYPI_MIRROR_AUTO) return trimmed
  if (NODE_SET.has(trimmed)) return trimmed
  const withSlash = trimmed.endsWith('/') ? trimmed : `${trimmed}/`
  return NODE_SET.has(withSlash) ? withSlash : null
}

/** Mirror choices in automatic mode, with the official index last for a reliable fallback. */
export function pypiIndexUrls(selection: string = PYPI_MIRROR_AUTO): string[] {
  if (selection === PYPI_MIRROR_AUTO) return [...PYPI_MIRROR_NODES.slice(1), 'https://pypi.org/simple/']
  const node = findPypiMirrorNode(selection)
  return node ? [node, 'https://pypi.org/simple/'] : ['https://pypi.org/simple/']
}

/** Normalize a saved wheel-mirror selection to a picker entry, or return null for an unknown value. */
export function findPytorchWheelMirrorNode(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (WHEEL_NODE_SET.has(trimmed)) return trimmed
  const withSlash = trimmed.endsWith('/') ? trimmed : `${trimmed}/`
  return WHEEL_NODE_SET.has(withSlash) ? withSlash : null
}
