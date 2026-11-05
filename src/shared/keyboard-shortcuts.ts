export const EDITOR_SHORTCUT_DEFAULTS = {
  cancel: 'Escape', remove: 'Delete', left: 'Left', right: 'Right', up: 'Up', down: 'Down',
  fastLeft: 'Shift+Left', fastRight: 'Shift+Right', fastUp: 'Shift+Up', fastDown: 'Shift+Down',
} as const
export type EditorShortcut = keyof typeof EDITOR_SHORTCUT_DEFAULTS

const KEYS: Record<string, string> = { ' ': 'Space', ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down',
  '+': 'Plus', '-': 'Minus', ',': 'Comma', '.': 'Period', '/': 'Slash', '\\': 'Backslash', ';': 'Semicolon', "'": 'Quote', '[': 'BracketLeft', ']': 'BracketRight', '`': 'Backquote', '=': 'Equal' }
const SPECIAL_KEYS = ['Space', 'Tab', 'Enter', 'Escape', 'Backspace', 'Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown', 'Up', 'Down', 'Left', 'Right', ...Object.values(KEYS)]
const PUNCTUATION = Object.fromEntries(Object.entries(KEYS).filter(([key]) => key.length === 1 && key !== ' ').map(([key, name]) => [name, key]))
const ALIASES: Record<string, string> = { commandorcontrol: 'Control', cmdorctrl: 'Control', ctrl: 'Control', control: 'Control', shift: 'Shift', alt: 'Alt', option: 'Alt', meta: 'Super', super: 'Super', command: 'Super', cmd: 'Super' }

export function normalizeShortcut(value: string, mac = false): string {
  return value.split('+').filter(Boolean).map(part => {
    const key = part.toLowerCase()
    return mac && ['commandorcontrol', 'cmdorctrl'].includes(key) ? 'Super' : ALIASES[key] ?? part
  }).sort().join('+')
}

export function isSupportedShortcut(value: string): boolean {
  if (!value) return true
  const parts = value.split('+'), key = parts.pop() ?? ''
  return new Set(parts.map(part => ALIASES[part.toLowerCase()])).size === parts.length && parts.every(part => Object.hasOwn(ALIASES, part.toLowerCase()))
    && (/^[A-Z0-9]$/.test(key) || /^F([1-9]|1\d|2[0-4])$/.test(key) || SPECIAL_KEYS.includes(key))
}

export function shortcutFromEvent(event: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey' | 'isComposing'>): string | null {
  if (event.isComposing) return null
  const key = /^[a-z]$/i.test(event.key) ? event.key.toUpperCase() : /^Key[A-Z]$/.test(event.code) ? event.code.slice(3) : /^Digit\d$/.test(event.code) ? event.code.slice(5) : KEYS[event.key] ?? event.key
  const result = [event.ctrlKey && 'Control', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Super', key].filter(Boolean).join('+')
  return isSupportedShortcut(result) ? result : null
}

export function matchesShortcut(binding: string, event: KeyboardEvent): boolean {
  const pressed = shortcutFromEvent(event)
  return !!binding && !!pressed && normalizeShortcut(binding) === normalizeShortcut(pressed)
}

export function electronShortcut(binding: string): string {
  return binding.split('+').map(key => key === 'Plus' ? key : PUNCTUATION[key] ?? key).join('+')
}
