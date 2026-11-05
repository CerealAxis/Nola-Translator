import { afterEach, expect, it } from 'vitest'
import { createInputTrigger } from './input-trigger'
afterEach(() => document.body.replaceChildren())
function field(value: string) { const input = document.createElement('textarea'); document.body.append(input); input.value = value; input.setSelectionRange(value.length, value.length); return input }
it('recognizes an explicit three-space suffix and never ordinary internal spaces or IME', () => {
  const trigger = createInputTrigger(); const input = field('Hello')
  expect(trigger(new KeyboardEvent('keydown', { key: ' ' }), input)).toBe(false)
  input.value += ' '; input.setSelectionRange(input.value.length, input.value.length)
  expect(trigger(new KeyboardEvent('keydown', { key: ' ' }), input)).toBe(false)
  input.value += ' '; input.setSelectionRange(input.value.length, input.value.length)
  expect(trigger(new KeyboardEvent('keydown', { key: ' ' }), input)).toBe(true)
  expect(trigger(new KeyboardEvent('keydown', { key: ' ', isComposing: true }), input)).toBe(false)
  input.setSelectionRange(1, 1)
  for (let i = 0; i < 3; i++) expect(trigger(new KeyboardEvent('keydown', { key: ' ' }), input)).toBe(false)
})
it('does not carry the sequence across fields or other keys', () => {
  const trigger = createInputTrigger(); const first = field('one  '); const second = field('two  ')
  trigger(new KeyboardEvent('keydown', { key: ' ' }), first)
  trigger(new KeyboardEvent('keydown', { key: ' ' }), first)
  expect(trigger(new KeyboardEvent('keydown', { key: ' ' }), second)).toBe(false)
  trigger(new KeyboardEvent('keydown', { key: 'a' }), second)
  expect(trigger(new KeyboardEvent('keydown', { key: ' ' }), second)).toBe(false)
})

it('expires a slow sequence instead of consuming normal spaces', () => {
  const trigger = createInputTrigger(); const input = field('Hello  ')
  for (const time of [0, 100, 900]) {
    const event = new KeyboardEvent('keydown', { key: ' ' }); Object.defineProperty(event, 'timeStamp', { value: time })
    expect(trigger(event, input)).toBe(false)
  }
})
