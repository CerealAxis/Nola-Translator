import { afterEach, expect, it } from 'vitest'
import { createInputTrigger } from './input-trigger'
afterEach(() => document.body.replaceChildren())
function field(value: string) { const input = document.createElement('textarea'); document.body.append(input); input.value = value; input.setSelectionRange(value.length, value.length); return input }
it('reconstructs the original draft from three spaces at the caret and ignores IME', () => {
  const trigger = createInputTrigger(); const input = field('Hello')
  input.setSelectionRange(2, 2)
  expect(trigger(new KeyboardEvent('keydown', { key: ' ' }), input)).toBeUndefined()
  input.value = 'He llo'; input.setSelectionRange(3, 3)
  expect(trigger(new KeyboardEvent('keydown', { key: ' ' }), input)).toBeUndefined()
  input.value = 'He  llo'; input.setSelectionRange(4, 4)
  expect(trigger(new KeyboardEvent('keydown', { key: ' ' }), input)).toBe('Hello')
  expect(trigger(new KeyboardEvent('keydown', { key: ' ', isComposing: true }), input)).toBeUndefined()
})
it('does not carry the sequence across fields or other keys', () => {
  const trigger = createInputTrigger(); const first = field('one  '); const second = field('two  ')
  trigger(new KeyboardEvent('keydown', { key: ' ' }), first)
  trigger(new KeyboardEvent('keydown', { key: ' ' }), first)
  expect(trigger(new KeyboardEvent('keydown', { key: ' ' }), second)).toBeUndefined()
  trigger(new KeyboardEvent('keydown', { key: 'a' }), second)
  expect(trigger(new KeyboardEvent('keydown', { key: ' ' }), second)).toBeUndefined()
})

it('expires a slow sequence instead of consuming normal spaces', () => {
  const trigger = createInputTrigger(); const input = field('Hello')
  for (const time of [0, 100, 1200]) {
    const event = new KeyboardEvent('keydown', { key: ' ' }); Object.defineProperty(event, 'timeStamp', { value: time })
    expect(trigger(event, input)).toBeUndefined()
    input.value += ' '; input.setSelectionRange(input.value.length, input.value.length)
  }
})
