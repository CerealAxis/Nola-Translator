/** PyPI simple-index URLs offered by the network settings picker. */
export const PYPI_MIRROR_DEFAULT = 'https://mirrors.aliyun.com/pypi/simple/'

export const PYPI_MIRROR_NODES = [
  PYPI_MIRROR_DEFAULT,
  'https://pypi.tuna.tsinghua.edu.cn/simple/',
  'https://repo.huaweicloud.com/repository/pypi/simple/',
  'https://mirrors.cloud.tencent.com/pypi/simple/',
] as const

const NODE_SET = new Set<string>(PYPI_MIRROR_NODES)

/** Normalize a saved index URL to a picker entry, or return null for an unknown URL. */
export function findPypiMirrorNode(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (NODE_SET.has(trimmed)) return trimmed
  const withSlash = trimmed.endsWith('/') ? trimmed : `${trimmed}/`
  return NODE_SET.has(withSlash) ? withSlash : null
}
