import { describe, expect, it } from 'vitest'
import { en, ja, ko, zhCN, zhHK, zhTW } from './index'
import { appNameForLanguage, resolveUiLanguage, translate } from '../i18n'
import { supportErrorCodeForMessage } from '../../shared/error-catalog'

/*
 * Interface language preferences live in the main-process settings store. The renderer resolves
 * `auto` from the system locale; this file keeps dictionary structure, placeholders, and copy rules
 * in sync without duplicating persistence tests.
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
const localeFlats = {
  en: enFlat,
  'zh-CN': zh,
  'zh-TW': leaves(zhTW),
  'zh-HK': leaves(zhHK),
  ko: leaves(ko),
  ja: leaves(ja),
}

describe('语言由主进程设置决定', () => {
  it('核心品牌名按界面语言显示', () => {
    expect(appNameForLanguage('zh-CN')).toBe('诺拉翻译')
    expect(appNameForLanguage('en')).toBe('Nola Translator')
  })

  it('自动检测能识别繁体区域、韩语和日语', () => {
    expect(resolveUiLanguage('auto', 'zh-TW')).toBe('zh-TW')
    expect(resolveUiLanguage('auto', 'zh-Hant-HK')).toBe('zh-HK')
    expect(resolveUiLanguage('auto', 'zh-Hant-MO')).toBe('zh-HK')
    expect(resolveUiLanguage('auto', 'ko-KR')).toBe('ko')
    expect(resolveUiLanguage('auto', 'ja-JP')).toBe('ja')
    expect(resolveUiLanguage('auto', 'fr-FR')).toBe('en')
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

describe('所有界面语言都有完整词典', () => {
  const placeholders = (s: string) => (s.match(/\{[a-zA-Z0-9_]+\}/g) ?? []).sort()

  it('每种语言的键都与简体中文完全对齐', () => {
    for (const [locale, dictionary] of Object.entries(localeFlats)) {
      expect(Object.keys(dictionary).sort(), locale).toEqual(Object.keys(zh).sort())
    }
  })

  it('所有语言的插值占位符都与源词条一致', () => {
    for (const [locale, dictionary] of Object.entries(localeFlats)) {
      for (const [key, source] of Object.entries(zh)) {
        expect(placeholders(dictionary[key]), `${locale}: ${key}`).toEqual(placeholders(source))
      }
    }
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

  it('错误码由共享目录提供，不嵌入本地化句子', () => {
    /*
     * 两条**故意**不带错误码，都是"没发生故障"的情况：
     *   · engineNotReadyPreflight  冷启动预检。引擎没起来是一个状态，用户还没动手，
     *     摆一个 ENG-001 在那儿会让人以为出了事、还要去翻诊断。
     *   · errorCodeLabel           由格式化器追加的固定标签，本身没有独立故障码。
     * 其余支持错误都必须有稳定目录项；文案自身不再维护重复的编号。
     */
    const noCodeByDesign = new Set(['engineNotReadyPreflight', 'errorCodeLabel'])
    const errors = leaves((zhCN as Record<string, unknown>).errors)
    const withoutCatalogEntry = Object.entries(errors)
      .filter(([k]) => !k.endsWith('Action'))
      .filter(([k]) => !noCodeByDesign.has(k))
      .filter(([k]) => !supportErrorCodeForMessage(`errors.${k}`))
      .map(([k]) => k)
    expect(withoutCatalogEntry).toEqual([])
  })
})
