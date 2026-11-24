import {
  ArrowRight,
  AudioLines,
  Book,
  BookOpen,
  Camera,
  CaseSensitive,
  Clipboard,
  ClipboardPaste,
  Copy,
  Eye,
  EyeOff,
  FilePenLine,
  Gamepad2,
  Grip,
  History,
  Keyboard,
  Layers,
  Link,
  List,
  Lock,
  Maximize,
  Minus,
  MousePointer2,
  Notebook,
  PanelTop,
  Pause,
  Pin,
  Play,
  RefreshCw,
  Scan,
  ScanLine,
  Search,
  Settings,
  Square,
  TextCursorInput,
  VolumeX,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { actions, type ToolAction } from './tools-catalog'
import { useToolLabels } from './tools-labels'

const icons: Record<ToolAction, LucideIcon> = {
  logo: Gamepad2,
  run: RefreshCw,
  auto: Pause,
  settings: Settings,
  clipboard: ClipboardPaste,
  gameSettings: Gamepad2,
  through: MousePointer2,
  transparent: Layers,
  lock: Lock,
  pickGame: Link,
  pickText: List,
  range: Scan,
  rangeFrame: Square,
  once: ScanLine,
  repeat: RefreshCw,
  reset: RefreshCw,
  before: Book,
  nouns: BookOpen,
  correction: CaseSensitive,
  tray: Minus,
  exit: X,
  move: Grip,
  scale: Maximize,
  screenshot: Camera,
  mute: VolumeX,
  original: Eye,
  translated: EyeOff,
  speech: AudioLines,
  copy: Copy,
  history: History,
  library: Gamepad2,
  edit: FilePenLine,
  editTranslation: FilePenLine,
  ctrl: Keyboard,
  enter: ArrowRight,
  notes: Notebook,
  bind: PanelTop,
  top: Pin,
  selectable: TextCursorInput,
  lookup: Search,
}
export function SubtitleToolbar({
  ids,
  flags,
  onAction,
  restore,
}: {
  ids: ToolAction[]
  flags: Record<string, boolean>
  onAction: (id: ToolAction, right?: boolean) => void
  restore: () => void
}) {
  const { label, translate } = useToolLabels()
  if (flags.through || flags.overlay || flags.hide)
    return (
      <Button
        variant="outline"
        className="gt-toolbar-restore"
        size="icon-sm"
        data-through={flags.through}
        data-overlay-hidden={flags.overlay}
        aria-label={label('restore')}
        tooltip={label('restore')}
        onClick={restore}
      >
        <Play />
      </Button>
    )
  return (
    <div
      className="gt-floating-toolbar"
      role="group"
      aria-label={label('toolbar')}
      data-transparent={!!flags.transparent}
      data-locked={!!flags.lock}
      data-moved={!!flags.move}
      data-selectable={!!flags.selectable}
      data-top={!!flags.top}
    >
      {ids.map((id) => {
        const Icon = icons[id] ?? Clipboard,
          name = translate(actions[id])
        return (
          <Button
            variant="bare"
            size="icon-sm"
            key={id}
            aria-label={name}
            tooltip={name}
            aria-pressed={id in flags ? Boolean(flags[id]) : undefined}
            onClick={() => onAction(id)}
            onContextMenu={(e) => {
              e.preventDefault()
              onAction(id, true)
            }}
          >
            <Icon aria-hidden="true" />
          </Button>
        )
      })}
    </div>
  )
}
