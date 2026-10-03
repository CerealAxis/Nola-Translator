import { describe, expect, it } from 'vitest'
import { en, zhCN } from './index'
import { appNameForLanguage, translate } from '../i18n'

/*
 * 迁移说明：原型那版还测了 `resolveLanguage()` / `UI_LANGUAGES` / `LANGUAGE_STORAGE_KEY`。
 * 那三个 API 连同 `localStorage` 持久化和 `'system'` 档位一起**被有意丢掉了** ——
 * 语言是 `AppSettings.uiLanguage`，只有 `'zh-CN' | 'en'`，存在主进程的 settings.json 里，
 * 多一个 `'system'` 会写出主进程 zod schema 拒收的值。下面保留的是与持久化无关、
 * 真正有价值的那几组断言：键树对齐、占位符一致、文案纪律。
 */

/** 递归收集叶子字符串，键路径用点号连接。 */
function leaves(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') return { [prefix]: value }
  if (typeof value !== 'object' || value === null) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(value)) {
    Object.assign(out, leaves(v, prefix ? `${prefix}.${k}` : k))
  }
  return out
}

const zh = leaves(zhCN)
const enFlat = leaves(en)

describe('语言由主进程设置决定', () => {
  it('只有两个取值，没有 system 档位', () => {
    // AppSettings.uiLanguage 的并集就是 'zh-CN' | 'en'；多一个档位会被主进程 schema 拒收。
    expect(appNameForLanguage('zh-CN')).toBe('诺拉翻译')
    expect(appNameForLanguage('en')).toBe('Nola Translator')
  })

  it('中文界面直接返回词典里的中文原文', () => {
    expect(translate('nav.home', 'zh-CN')).toBe(zh['nav.home'])
  })

  it('英文界面查英文表', () => {
    expect(translate('nav.home', 'en')).toBe(enFlat['nav.home'])
  })

  it('英文界面缺键时返回键本身，不回退中文', () => {
    // 英文界面里露出中文比露出 `missing:xxx` 之类占位符更糟。
    expect(translate('no.such.key', 'en')).toBe('no.such.key')
  })

  it('按 {name} 插值，未给的值保留原样', () => {
    expect(translate('shellUi.translationFailed', 'zh-CN', { reason: '网络不可达' })).toContain('网络不可达')
    expect(translate('shellUi.translationFailed', 'zh-CN', {})).toContain('{reason}')
  })
})

describe('中英 key 树完全对齐', () => {
  it('键数量一致', () => {
    expect(Object.keys(enFlat)).toHaveLength(Object.keys(zh).length)
  })

  it('英文没有多余键', () => {
    expect(Object.keys(enFlat).filter((k) => !(k in zh))).toEqual([])
  })

  it('中文没有未被翻译的键', () => {
    expect(Object.keys(zh).filter((k) => !(k in enFlat))).toEqual([])
  })

  it('英文值不得与中文完全相同（专有名词、母语名、字幕样例除外）', () => {
    // 三类例外本来就该中英一致：
    //   1. 品牌名 / 产品名
    //   2. 母语自称（简体中文这种语言名）
    //   3. overlay.preview* 是**故意用中文演示字幕渲染效果的样例文本**
    const allowed = new Set(['app.name', 'legal.license'])
    const allowedPrefix = ['language.', 'overlay.preview', 'modelsSettingsUi.previewTranslation']
    // 纯占位符/单位串（'{percent}%'、'{speed} MB/s'）本来就该完全一致
    const isFormatOnly = (s: string) => !/[\u4e00-\u9fff]/.test(s)
    const untranslated = Object.keys(zh).filter(
      (k) =>
        !allowed.has(k) &&
        !allowedPrefix.some((p) => k.startsWith(p)) &&
        !isFormatOnly(zh[k]) &&
        enFlat[k] !== undefined &&
        enFlat[k].trim() === zh[k].trim()
    )
    expect(untranslated).toEqual([])
  })
})

describe('占位符一致性', () => {
  const placeholders = (s: string) => (s.match(/\{[a-zA-Z0-9_]+\}/g) ?? []).sort()

  it('每个含占位符的 key，中英占位符集合相同', () => {
    const withVars = Object.keys(zh).filter((k) => placeholders(zh[k]).length > 0)
    expect(withVars.length).toBeGreaterThan(0)
    for (const k of withVars) {
      expect(placeholders(enFlat[k]), `key: ${k}`).toEqual(placeholders(zh[k]))
    }
  })
})

describe('文案纪律（§1.5）', () => {
  const all = [...Object.values(zh), ...Object.values(enFlat)]

  it('界面文案不含破折号 —— 和 ——', () => {
    const hits = all.filter((s) => s.includes('—') || s.includes('–'))
    expect(hits).toEqual([])
  })

  it('英文界面不残留讯飞式的客套话与废话占位符', () => {
    const filler = [
      /感谢.{0,6}(宝贵|反馈|建议)/,
      /我们将根据/,
      /正在努力/,
      /请输入您的/,
      /^请输入…?$/,
      /暂(无|无数据)/,
      /No data\b/i,
    ]
    const hits = Object.entries(enFlat)
      .filter(([, v]) => filler.some((re) => re.test(v)))
      .map(([k]) => k)
    expect(hits).toEqual([])
  })

  it('英文界面里的中文只允许出现在母语名与字幕样例里', () => {
    const allowedPrefix = ['language.', 'overlay.preview', 'modelsSettingsUi.previewTranslation']
    const hits = Object.entries(enFlat)
      .filter(([, v]) => /[\u4e00-\u9fff]/.test(v))
      .filter(([k]) => !allowedPrefix.some((p) => k.startsWith(p)))
      .map(([k]) => k)
    expect(hits).toEqual([])
  })

  it('首页四个入口只有名字，没有副标题', () => {
    for (const key of ['quickStart', 'overlayCaptions', 'records', 'models']) {
      expect(zh[`home.${key}`], `home.${key} 缺失`).toBeTruthy()
    }
    // 入口卡不允许出现 *Desc / *Subtitle / *Tagline 之类的副标题字段
    const homeSubtitleKeys = Object.keys(zh).filter(
      (k) => k.startsWith('home.') && /(desc|subtitle|tagline|hint)/i.test(k)
    )
    expect(homeSubtitleKeys).toEqual([])
  })

  it('错误文案全部带可复制的错误码', () => {
    /*
     * 两条**故意**不带错误码，都是"没发生故障"的情况：
     *   · engineNotReadyPreflight  冷启动预检。引擎没起来是一个状态，用户还没动手，
     *     摆一个 ENG-001 在那儿会让人以为出了事、还要去翻诊断。
     *   · engineStopped           会话中途崩掉且 `errorCode` 认不出来时的兜底。码都没认出来，
     *     报一个编号等于编一个不存在的码。
     * 除了这两条，其余每条都必须能被用户复制去搜。
     */
    const noCodeByDesign = new Set(['engineNotReadyPreflight', 'engineStopped'])
    const errors = leaves((zhCN as Record<string, unknown>).errors)
    const withoutCode = Object.entries(errors)
      .filter(([k]) => !k.endsWith('Action'))
      .filter(([k]) => !noCodeByDesign.has(k))
      .filter(([, v]) => !/[A-Z]{2,4}-\d{2,3}/.test(v))
      .map(([k]) => k)
    expect(withoutCode).toEqual([])
  })
})
