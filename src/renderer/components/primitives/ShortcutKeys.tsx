import { Kbd, KbdGroup } from '@/components/ui/kbd'

const mac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)
const LABELS: Record<string, string> = { CommandOrControl: mac ? '⌘' : 'Ctrl', CmdOrCtrl: mac ? '⌘' : 'Ctrl', Control: 'Ctrl', Ctrl: 'Ctrl',
  Command: '⌘', Cmd: '⌘', Super: mac ? '⌘' : 'Win', Alt: mac ? '⌥' : 'Alt', Shift: 'Shift', Escape: 'Esc', Up: '↑', Down: '↓', Left: '←', Right: '→',
  Plus: '+', Minus: '-', Equal: '=', Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backquote: '`' }

export function ShortcutKeys({ value }: { value: string }) {
  return <KbdGroup>{value.split('+').filter(Boolean).map((key, index) => <Kbd key={`${key}-${index}`}>{LABELS[key] ?? key}</Kbd>)}</KbdGroup>
}

export function shortcutLabel(value: string): string {
  return value.split('+').map(key => LABELS[key] ?? key).join('+')
}
