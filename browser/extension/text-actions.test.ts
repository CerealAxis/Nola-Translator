import { expect, it, vi } from 'vitest'
import { editableTarget, editableText, replaceEditable, matchesShortcut } from './text-actions'
vi.mock('./provider-client', () => ({ synthesize: vi.fn() }))
it('updates controlled form fields without replacing elements and excludes secrets', () => {
  const input = document.createElement('input'); input.value = 'source'
  const listener = vi.fn(); input.addEventListener('input', listener)
  expect(editableTarget(input)).toBe(input)
  replaceEditable(input, 'translated')
  expect(editableText(input)).toBe('translated'); expect(listener).toHaveBeenCalledOnce()
  input.type = 'password'; expect(editableTarget(input)).toBeNull()
})
it('matches shortcuts without swallowing extra modifiers', () => {
  expect(matchesShortcut(new KeyboardEvent('keydown', { key: 't', altKey: true }), 'Alt+T')).toBe(true)
  expect(matchesShortcut(new KeyboardEvent('keydown', { key: 't', altKey: true, ctrlKey: true }), 'Alt+T')).toBe(false)
})

it('respects disabled contenteditable descendants', () => {
  const parent = document.createElement('div'); parent.contentEditable = 'true'; parent.setAttribute('contenteditable', 'true')
  const locked = document.createElement('span'); locked.setAttribute('contenteditable', 'false'); parent.append(locked)
  expect(editableTarget(locked)).toBeNull()
  const password = document.createElement('input'); password.type = 'password'; parent.append(password)
  expect(editableTarget(password)).toBeNull()
})
