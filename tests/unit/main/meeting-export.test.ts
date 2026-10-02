import type { CaptionSegment } from '../../../src/shared/contracts'
import { exportSrt, exportText, exportWebVtt } from '../../../src/main/meeting-store'

const segments: CaptionSegment[] = [
  { segmentId: '1', revision: 1, startedAtMs: 0, endedAtMs: 1000, sourceText: 'Hello', isFinal: true, translations: [{ targetLanguage: 'zh', text: '你好', state: 'complete', provider: 'hymt2' }] },
  { segmentId: '2', revision: 1, startedAtMs: 1200, sourceText: 'World', isFinal: true, translations: [] },
]

describe('字幕导出', () => {
  it('导出可读 TXT', () => {
    expect(exportText(segments)).toContain('Hello\n你好')
  })

  it('为缺少结束时间的最后一段补 2 秒并导出 SRT/VTT', () => {
    expect(exportSrt(segments)).toContain('00:00:01,200 --> 00:00:03,200')
    expect(exportWebVtt(segments)).toContain('00:00:01.200 --> 00:00:03.200')
  })
})
