import OpenCC from 'opencc-js'

const toTraditional = OpenCC.Converter({ from: 'cn', to: 'tw' })
const toSimplified = OpenCC.Converter({ from: 't', to: 'cn' })

export function formatChineseCaption(text: string, language: string): string {
  if (language === 'zh-Hant' || language === 'zh-TW' || language === 'zh-HK' || language === 'zh-MO') return toTraditional(text)
  if (language === 'zh' || language === 'zh-Hans' || language === 'zh-CN' || language === 'zh-SG') return toSimplified(text)
  return text
}
