import type { CaptionConfig } from './store'
export function captionLineKind(index: number, config: CaptionConfig): 'source' | 'translation' {
  return config.showSource && index === 0 ? 'source' : 'translation'
}
export function captionLineAppearance(index: number, config: CaptionConfig) {
  const source = captionLineKind(index, config) === 'source'
  return {
    color: source ? config.sourceColor : config.translationColor,
    fontSize: `${source ? config.sourceFontSize : config.translationFontSize}px`,
    fontFamily: (source ? config.sourceFontFamily : config.translationFontFamily) || config.fontFamily,
    fontWeight: config.bold ? '700' : '400',
    order: config.translationFirst ? source ? '1' : '0' : source ? '0' : '1',
  }
}
export function nativeCaptionStyles(config: CaptionConfig): string {
  const font = (value: string) => value.replace(/[\\"\r\n]/g, character => `\\${character}`)
  const family = (value: string) => /^(system-ui|sans-serif|serif|monospace|cursive|fantasy)$/i.test(value) ? value : `"${font(value)}",system-ui,sans-serif`
  const color = (value: string) => /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ? value : '#ffffff'
  const background = `color-mix(in oklab, ${color(config.backgroundColor)} ${config.backgroundOpacity * 100}%, transparent)`
  return ['source', 'translation'].map(kind => {
    const source = kind === 'source'
    return `video::cue(.nola-caption-${kind}){color:${color(source ? config.sourceColor : config.translationColor)};font-family:${family((source ? config.sourceFontFamily : config.translationFontFamily) || config.fontFamily)};font-size:${source ? config.sourceFontSize : config.translationFontSize}px;font-weight:${config.bold ? 700 : 400};line-height:${config.lineHeight};background-color:${background}}`
  }).join('')
}
export function nativeCaptionText(lines: string[], config: CaptionConfig): string {
  const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  const entries = lines.map((line, index) => ({ kind: captionLineKind(index, config), line }))
  if (config.translationFirst && config.showSource && entries.length > 1) entries.reverse()
  return entries.map(({ kind, line }) => `<c.nola-caption-${kind}>${escape(line)}</c>`).join('\n')
}
