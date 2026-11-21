import type { TranslationKey } from '@/i18n'

export interface ProcessingFeature {
  id: string
  label: TranslationKey
  editor?: 'replace' | 'normalize' | 'lines' | 'repeat' | 'script' | 'vndb'
  example?: string
}

export const preprocessing: readonly ProcessingFeature[] = [
  { id: 'normalize', label: 'suite.textNormalize', editor: 'normalize', example: 'ＡＢＣ → ABC' },
  { id: 'controls', label: 'suite.textControls' },
  { id: 'breaks', label: 'suite.textBreaks' },
  { id: 'lines', label: 'suite.textLines', editor: 'lines' },
  { id: 'tags', label: 'suite.textTags' },
  { id: 'braces', label: 'suite.textBraces' },
  { id: 'quotes', label: 'suite.textQuotes' },
  { id: 'shift-jis', label: 'suite.textShiftJis' },
  { id: 'ascii-punctuation', label: 'suite.textAsciiPunctuation' },
  { id: 'digits', label: 'suite.textDigits' },
  { id: 'letters', label: 'suite.textLetters' },
  { id: 'replace', label: 'suite.textReplace', editor: 'replace' },
  { id: 'repeat-chars', label: 'suite.textRepeatChars', editor: 'repeat', example: 'AAAABBBBCCCC → ABC' },
  { id: 'repeat-block', label: 'suite.textRepeatBlock', editor: 'repeat', example: 'ABCDABCDABCD → ABCD' },
  { id: 'repeat-segments', label: 'suite.textRepeatSegments', example: 'S1S1S1S2S2S2 → S1S2' },
  { id: 'repeat-suffix', label: 'suite.textRepeatSuffix', example: 'ABCDBCDCDD → ABCD' },
  { id: 'repeat-prefix', label: 'suite.textRepeatPrefix', example: 'AABABCABCD → ABCD' },
  { id: 'python-pre', label: 'suite.textPythonPre', editor: 'script' },
]

export const optimization: readonly ProcessingFeature[] = [
  { id: 'replace-before', label: 'suite.textReplaceBefore', editor: 'replace' },
  { id: 'skip-punctuation', label: 'suite.textSkipPunctuation' },
  { id: 'replace-after', label: 'suite.textReplaceAfter', editor: 'replace' },
  { id: 'python-optimize', label: 'suite.textPythonOptimize', editor: 'script' },
  { id: 'arabic', label: 'suite.textArabic' },
]

export const vndb: ProcessingFeature = { id: 'vndb', label: 'suite.textVndb', editor: 'vndb' }
