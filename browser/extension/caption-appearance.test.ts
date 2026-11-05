import { expect, it } from 'vitest'
import { captionLineAppearance, nativeCaptionStyles, nativeCaptionText } from './caption-appearance'
import type { CaptionConfig } from './store'
const config: CaptionConfig = { showSource: true, showTranslation: true, colorScheme: 'dark', fontFamily: 'system-ui', sourceFontFamily: 'Arial', translationFontFamily: 'Verdana', sourceFontSize: 20, translationFontSize: 28, lineHeight: 1.3, sourceColor: '#112233', translationColor: '#aabbcc', backgroundColor: '#000000', backgroundOpacity: 0.7, bottomOffset: 5, sourceLanguage: 'en', targetLanguage: 'zh', audioSource: 'tab', translationFirst: true, bold: true }
it('uses independent typography and translation-first order without changing logical row indices', () => {
  expect(captionLineAppearance(0, config)).toMatchObject({ color: '#112233', fontSize: '20px', fontFamily: 'Arial', fontWeight: '700', order: '1' })
  expect(captionLineAppearance(1, config)).toMatchObject({ color: '#aabbcc', fontSize: '28px', fontFamily: 'Verdana', order: '0' })
  expect(captionLineAppearance(0, { ...config, showSource: false })).toMatchObject({ fontFamily: 'Verdana', color: '#aabbcc' })
})
it('gives native fullscreen cues the same fonts, colors, sizes, weight and order', () => {
  expect(nativeCaptionStyles(config)).toContain('font-family:"Arial",system-ui,sans-serif;font-size:20px;font-weight:700')
  expect(nativeCaptionStyles(config)).toContain('color:#aabbcc;font-family:"Verdana",system-ui,sans-serif;font-size:28px')
  expect(nativeCaptionText(['Hello <world>', '你好'], config)).toBe('<c.nola-caption-translation>你好</c>\n<c.nola-caption-source>Hello &lt;world&gt;</c>')
  expect(nativeCaptionStyles({ ...config, sourceFontFamily: 'system-ui' })).toContain('font-family:system-ui;')
})
