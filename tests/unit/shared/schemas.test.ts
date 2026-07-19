import messages from '../../fixtures/protocol/messages.json'

import { MAX_PROTOCOL_LINE_BYTES, parseCommandLine, parseEventLine } from '../../../src/shared/schemas'

describe('JSONL 协议校验', () => {
  it('接受 TS 与 Python 共用的全部命令样例', () => {
    for (const command of messages.commands) {
      expect(parseCommandLine(JSON.stringify(command))).toMatchObject(command)
    }
  })

  it('接受 TS 与 Python 共用的全部事件样例', () => {
    for (const event of messages.events) {
      expect(parseEventLine(JSON.stringify(event))).toMatchObject(event)
    }
  })

  it('拒绝未知类型、缺少 requestId 和负数 revision', () => {
    expect(() =>
      parseCommandLine(JSON.stringify({ protocolVersion: 1, type: 'unknown', requestId: 'req-1' }))
    ).toThrow()
    expect(() => parseCommandLine(JSON.stringify({ protocolVersion: 1, type: 'listDevices' }))).toThrow()

    const caption = structuredClone(messages.events[1]) as { segment: { revision: number } }
    caption.segment.revision = -1
    expect(() => parseEventLine(JSON.stringify(caption))).toThrow()
  })

  it('忽略未知非关键字段以支持向后兼容', () => {
    const command = { ...messages.commands[0], futureOptionalField: true }
    expect(parseCommandLine(JSON.stringify(command))).not.toHaveProperty('futureOptionalField')
  })

  it('拒绝超过 32 KiB 的单行', () => {
    const oversized = JSON.stringify({
      protocolVersion: 1,
      type: 'hello',
      requestId: 'req-large',
      clientVersion: 'x'.repeat(MAX_PROTOCOL_LINE_BYTES)
    })
    expect(() => parseCommandLine(oversized)).toThrow(/32 KiB/)
  })
})
