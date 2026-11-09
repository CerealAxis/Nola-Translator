import { AudioLines, BookOpen, Captions, CircleHelp, Cpu, FlaskConical, FolderOpen, Keyboard, PanelsTopLeft, SlidersHorizontal } from 'lucide-react'
import type { SettingsTab } from '@/routes'

export const SETTINGS_NAVIGATION = {
  general: { label: 'modelsSettingsUi.general', icon: SlidersHorizontal },
  audio: { label: 'modelsSettingsUi.audio', icon: AudioLines },
  appearance: { label: 'modelsSettingsUi.appearance', icon: Captions },
  browser: { label: 'browser.title', icon: PanelsTopLeft },
  shortcuts: { label: 'modelsSettingsUi.shortcuts', icon: Keyboard },
  engine: { label: 'modelsSettingsUi.engine', icon: Cpu },
  storage: { label: 'modelsSettingsUi.storage', icon: FolderOpen },
  glossary: { label: 'suite.glossaryTitle', icon: BookOpen },
  help: { label: 'modelsSettingsUi.help', icon: CircleHelp },
  developer: { label: 'dev.tabLabel', icon: FlaskConical },
} as const satisfies Record<SettingsTab, { label: string; icon: typeof AudioLines }>
