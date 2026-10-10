/**
 * GitHub download accelerators offered by the network settings node picker.
 *
 * The catalog mirrors the public list published by https://www.moretools.app/zh-CN/github-proxy,
 * which keeps it as a hardcoded client-side array rather than serving it over an API. A node is
 * identified by its URL, so the persisted setting stays valid when the list is reordered or extended.
 */

/** Sentinel stored by the picker meaning "probe the catalog and use the fastest reachable node". */
export const GITHUB_PROXY_AUTO = 'auto'

/**
 * Used when the picker resolves to auto but no node answered the probe. It is the first entry of
 * the public catalog, so it is the node the publisher itself selects before any measurement.
 */
export const GITHUB_PROXY_FALLBACK = 'https://gh-proxy.net/'

export const GITHUB_PROXY_NODES: readonly string[] = [
  'https://gh-proxy.net/',
  'https://github.cnxiaobai.com/',
  'https://hub.gitmirror.com/',
  'https://www.5555.cab/',
  'https://git.tangbai.cc/',
  'https://gh.ddlc.top/',
  'https://ghproxy.xiaopa.cc/',
  'https://ghproxy.cfd/',
  'https://ghproxy.cc/',
  'https://ghproxy.monkeyray.net/',
  'https://cf.ghproxy.cc/',
  'https://gitproxy.mrhjx.cn/',
  'https://gh.xxooo.cf/',
  'https://github.xxlab.tech/',
  'https://ghproxy.1888866.xyz/',
  'https://github.mlmle.cn/',
  'https://fastgit.cc/',
  'https://gh.1k.ink/',
  'https://ghproxy.net/',
  'https://github.boringhex.top/',
  'https://ghfast.top/',
  'https://y.whereisdoge.work/',
  'https://ghproxy.imciel.com/',
  'https://gh.jdck.fun/',
  'https://xiaomo-station.top/',
  'https://gh.monlor.com/',
  'https://g.blfrp.cn/',
  'https://gh.con.sh/',
  'https://gh.b52m.cn/',
  'https://github.dpik.top/',
  'https://github.geekery.cn/',
  'https://gh.halonice.com/',
  'https://github.limoruirui.com/',
  'https://git.yylx.win/',
  'https://github.tbedu.top/',
  'https://ghproxy.vansour.top/',
  'https://tvv.tw/',
  'https://ghproxy.xzhouqd.com/',
  'https://github-proxy.memory-echoes.cn/',
  'https://gh.catmak.name/',
  'https://hub.ddayh.com/',
  'https://github.ruojian.space/',
  'https://ghproxy.cxkpro.top/',
  'https://ghp.keleyaa.com/',
  'https://ghf.无名氏.top/',
  'https://github-proxy.lixxing.top/',
  'https://gh.padao.fun/',
  'https://gp.871201.xyz/',
  'https://gh.wsmdn.dpdns.org/',
  'https://ggg.clwap.dpdns.org/',
  'https://gh-proxy.com/',
  'https://gh.dpik.top/',
  'https://gp.zkitefly.eu.org/',
  'https://gh.bugdey.us.kg/',
  'https://code-hub-hk.freexy.top/',
  'https://github.chenc.dev/',
  'https://ghfile.geekertao.top/',
  'https://kenyu.ggff.net/',
  'https://gh.nxnow.top/',
  'https://github.bullb.net/',
  'https://gitproxy.197545.xyz/',
  'https://gitproxy.127731.xyz/',
  'https://gitproxy1.127731.xyz/',
  'https://jiashu.1win.eu.org/',
  'https://ghproxy.mf-dust.dpdns.org/',
  'https://j.1lin.dpdns.org/',
  'https://gh.jasonzeng.dev/',
  'https://proxy.baguoyuyan.com/',
  'https://github.1ms.xx.kg/',
  'https://gh.198962.xyz/',
  'https://github.880824.xyz/',
  'https://ghps.cc/',
  'https://30006000.xyz/',
  'https://github.tianrld.top/',
  'https://getgit.love8yun.eu.org/',
  'https://github.788787.xyz/',
  'https://ghm.078465.xyz/',
  'https://github-proxy.com/',
  'https://proxy.yaoyaoling.net/',
  'https://ghproxy.sakuramoe.dev/',
  'https://ghproxy.053000.xyz/',
  'https://gh.chjina.com/',
  'https://git.zeas.cc/',
  'https://ghpxy.hwinzniej.top/',
  'https://gh.echofree.xyz/',
  'https://github.zzrbk.xyz/',
  'https://git.669966.xyz/',
  'https://github.ihnic.com/',
  'https://gh.996986.xyz/',
  'https://gh.idayer.com/',
  'https://github.ednovas.xyz/',
  'https://gh.chalin.tk/',
  'https://j.1win.ggff.net/',
  'https://github.lsdfxdk.nyc.mn/',
  'https://gh.aaa.team/',
  'https://github.crdz.eu.org/',
  'https://gh.shiina-rimo.cafe/',
  'https://ghproxy.mirror.skybyte.me/',
  'https://gh.llkk.cc/',
  'https://git.40609891.xyz/',
  'https://github.oterea.top/',
  'https://gh.noki.icu/',
  'https://gh.39.al/',
  'https://ghproxy.cn/',
  'https://down.npee.cn/',
  'https://github.kkproxy.dpdns.org/',
  'https://free.cn.eu.org/',
  'https://git.951959483.xyz/',
  'https://git.820828.xyz/',
  'https://ghproxy.fangkuai.fun/',
  'https://github.cn86.dev/',
  'https://github.zjzzy.cloudns.org/',
  'https://ghb.nilive.top/',
  'https://gitproxy.click/',
  'https://proxy.atoposs.com/',
]

const NODE_SET = new Set(GITHUB_PROXY_NODES)

/**
 * Trailing slashes are optional in a prefix, and settings migrated from the old free-text field may
 * carry either form, so both spellings resolve to the same catalog entry.
 */
export function findGithubProxyNode(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (NODE_SET.has(trimmed)) return trimmed
  const withSlash = trimmed.endsWith('/') ? trimmed : `${trimmed}/`
  return NODE_SET.has(withSlash) ? withSlash : null
}
