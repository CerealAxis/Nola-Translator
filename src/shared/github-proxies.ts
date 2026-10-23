/**
 * GitHub download prefixes verified against the pinned llama.cpp Windows x64 release asset.
 * Availability can still vary by time and network, so automatic selection probes the asset too.
 */

/** Sentinel meaning region-aware automatic routing: probe nodes in mainland China, otherwise connect directly. */
export const GITHUB_PROXY_AUTO = 'auto'
export const GITHUB_PROXY_OFF = 'off'

/** Default selected prefix. This node returned the pinned runtime archive in a HEAD and Range check. */
export const GITHUB_PROXY_DEFAULT = 'https://gh-proxy.org/'

/** Used when auto cannot reach a node; this prefix returned the runtime asset during validation. */
export const GITHUB_PROXY_FALLBACK = GITHUB_PROXY_DEFAULT

export const GITHUB_PROXY_NODES: readonly string[] = [
  GITHUB_PROXY_DEFAULT,
  'https://git.tangbai.cc/',
  'https://github.mlmle.cn/',
  'https://fastgit.cc/',
  'https://gh.1k.ink/',
  'https://ghproxy.net/',
  'https://github.boringhex.top/',
  'https://ghfast.top/',
  'https://gh.monlor.com/',
  'https://g.blfrp.cn/',
  'https://gh.b52m.cn/',
  'https://tvv.tw/',
  'https://ghproxy.xzhouqd.com/',
  'https://hub.ddayh.com/',
  'https://ghp.keleyaa.com/',
  'https://ghf.无名氏.top/',
  'https://gh.padao.fun/',
  'https://gp.871201.xyz/',
  'https://ggg.clwap.dpdns.org/',
  'https://gh-proxy.com/',
  'https://github.chenc.dev/',
  'https://kenyu.ggff.net/',
  'https://gh.nxnow.top/',
  'https://jiashu.1win.eu.org/',
  'https://proxy.baguoyuyan.com/',
  'https://github.1ms.xx.kg/',
  'https://gh.198962.xyz/',
  'https://30006000.xyz/',
  'https://getgit.love8yun.eu.org/',
  'https://github.788787.xyz/',
  'https://ghm.078465.xyz/',
  'https://ghproxy.sakuramoe.dev/',
  'https://ghproxy.053000.xyz/',
  'https://gh.chjina.com/',
  'https://github.zzrbk.xyz/',
  'https://github.ihnic.com/',
  'https://gh.996986.xyz/',
  'https://github.ednovas.xyz/',
  'https://github.lsdfxdk.nyc.mn/',
  'https://github.crdz.eu.org/',
  'https://gh.shiina-rimo.cafe/',
  'https://ghproxy.mirror.skybyte.me/',
  'https://gh.llkk.cc/',
  'https://gh.noki.icu/',
  'https://gh.39.al/',
  'https://free.cn.eu.org/',
  'https://git.951959483.xyz/',
  'https://git.820828.xyz/',
]

const NODE_SET = new Set(GITHUB_PROXY_NODES)

/**
 * Trailing slashes are optional in a prefix, and settings migrated from the old free-text field may
 * carry either form, so both spellings resolve to the same catalog entry.
 */
export function findGithubProxyNode(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed === GITHUB_PROXY_OFF || trimmed === GITHUB_PROXY_AUTO) return trimmed
  if (NODE_SET.has(trimmed)) return trimmed
  const withSlash = trimmed.endsWith('/') ? trimmed : `${trimmed}/`
  return NODE_SET.has(withSlash) ? withSlash : null
}
