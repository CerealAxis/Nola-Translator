import { describe, expect, it } from 'vitest'
import { glossaryCsv, parseGlossaryCsv } from './glossary-csv'
describe('terminology CSV', () => {
  it('round-trips commas, quotes, multiline terms and site scopes', () => {
    const terms = [{ source: 'a,b', target: 'c"d\ne', sites: 'example.com' }]
    expect(parseGlossaryCsv(glossaryCsv(terms))).toEqual(terms)
    expect(parseGlossaryCsv('source,target\nhello,你好')).toEqual([{ source: 'hello', target: '你好', sites: '' }])
  })
  it('rejects missing headers and unterminated quoted fields', () => {
    expect(() => parseGlossaryCsv('word,meaning\nx,y')).toThrow('invalidConfig')
    expect(() => parseGlossaryCsv('source,target\n"broken,x')).toThrow('invalidConfig')
  })
})
