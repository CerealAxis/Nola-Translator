import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import HuggingFace from '@lobehub/icons/es/HuggingFace/components/Color'
import ModelScope from '@lobehub/icons/es/ModelScope/components/Color'
import { ChevronRight, Network } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

import type { ModelDownloadSource, ResourceRecord } from '@/bridge'
import { Dialog, DialogCloseButton, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import { downloadSourcesFor } from '../../../shared/model-download-sources'
import type { DownloadSourceOption } from '../../../shared/model-download-sources'
import './models.css'

const SOURCE_ICONS = { huggingface: HuggingFace, 'hf-mirror': Network, modelscope: ModelScope } as const

export interface DownloadSourceDialogProps {
  record: Pick<ResourceRecord, 'resourceId' | 'name'> | null
  onClose: () => void
  onSelect: (source: ModelDownloadSource) => void
}

export function DownloadSourceDialog({ record, onClose, onSelect }: DownloadSourceDialogProps) {
  const { t } = useI18n()
  const popupRef = useRef<HTMLDivElement>(null)
  if (!record) return null
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
        <DialogContent
          ref={popupRef}
          initialFocus={popupRef}
          className="nola-dialog-content models-source-dialog modal__dialog"
        >
          <DialogCloseButton aria-label={t('common.close')} />
          <div className="models-source-dialog__header modal__header">
            <DialogTitle className="modal__heading">
              {t('models.downloadSources.title')}
            </DialogTitle>
            <p className="models-source-dialog__model">{record.name}</p>
          </div>
          <div className="modal__body">
            <SourceOptions record={record} onSelect={onSelect} />
          </div>
        </DialogContent>
    </Dialog>
  )
}

interface SourceOptionsProps {
  record: Pick<ResourceRecord, 'resourceId' | 'name'>
  onSelect: (source: ModelDownloadSource) => void
}

/**
 * The sources are actions rather than a persisted choice, so the list stays a
 * listbox of options that are never selected: arrow keys, Home and End move the
 * focus, Enter and Space activate the focused option.
 */
function SourceOptions({ record, onSelect }: SourceOptionsProps) {
  const { t } = useI18n()
  const options = downloadSourcesFor(record.resourceId)
  const keyboardNavigation = useKeyboardNavigation()
  const [activeIndex, setActiveIndex] = useState(0)
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])

  const focusOption = (index: number) => {
    const next = (index + options.length) % options.length
    setActiveIndex(next)
    optionRefs.current[next]?.focus()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); focusOption(activeIndex + 1); return }
    if (event.key === 'ArrowUp') { event.preventDefault(); focusOption(activeIndex - 1); return }
    if (event.key === 'Home') { event.preventDefault(); focusOption(0); return }
    if (event.key === 'End') { event.preventDefault(); focusOption(options.length - 1) }
  }

  return (
    <div
      role="listbox"
      aria-label={t('models.downloadSources.title')}
      className="models-source-list list-box"
      onKeyDown={handleKeyDown}
    >
      {options.map((option, index) => (
        <SourceOption
          key={option.source}
          option={option}
          active={index === activeIndex}
          focused={index === focusedIndex}
          hovered={index === hoveredIndex}
          keyboardFocused={index === focusedIndex && keyboardNavigation}
          onSelect={onSelect}
          onFocus={() => { setFocusedIndex(index); setActiveIndex(index) }}
          onBlur={() => setFocusedIndex(current => (current === index ? null : current))}
          onPointerEnter={() => setHoveredIndex(index)}
          onPointerLeave={() => setHoveredIndex(current => (current === index ? null : current))}
          registerRef={element => { optionRefs.current[index] = element }}
        />
      ))}
    </div>
  )
}

interface SourceOptionProps {
  option: DownloadSourceOption
  active: boolean
  focused: boolean
  hovered: boolean
  keyboardFocused: boolean
  onSelect: (source: ModelDownloadSource) => void
  onFocus: () => void
  onBlur: () => void
  onPointerEnter: () => void
  onPointerLeave: () => void
  registerRef: (element: HTMLButtonElement | null) => void
}

function SourceOption({ option, active, focused, hovered, keyboardFocused, onSelect, onFocus, onBlur, onPointerEnter, onPointerLeave, registerRef }: SourceOptionProps) {
  const { t } = useI18n()
  const descriptionId = useId()
  const Icon = SOURCE_ICONS[option.source]
  return (
    <Button
      id={option.source}
      type="button"
      role="option"
      aria-label={t(option.labelKey)}
      aria-describedby={descriptionId}
      tabIndex={active ? 0 : -1}
      variant="tertiary"
      className="models-source-list__item list-box-item"
      data-focused={focused ? 'true' : undefined}
      data-focus-visible={keyboardFocused ? 'true' : undefined}
      data-hovered={hovered ? 'true' : undefined}
      ref={registerRef}
      onClick={() => onSelect(option.source)}
      onFocus={onFocus}
      onBlur={onBlur}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <span className="models-source-list__icon" aria-hidden="true"><Icon aria-hidden="true" /></span>
      <SourceNameTooltip label={t(option.labelKey)} hint={t(option.tooltipKey)} keyboardFocused={keyboardFocused} />
      {/* The hint is the option's description for screen readers; the tooltip only repeats it visually. */}
      <span id={descriptionId} className="sr-only">{t(option.tooltipKey)}</span>
      <ChevronRight aria-hidden="true" className="models-source-list__arrow" />
    </Button>
  )
}

export interface SourceNameTooltipProps {
  label: string
  hint: string
  keyboardFocused: boolean
}

function SourceNameTooltip({ label, hint, keyboardFocused }: SourceNameTooltipProps) {
  const [hovered, setHovered] = useState(false)
  return (
    <Tooltip open={hovered || keyboardFocused} onOpenChange={setHovered}>
      <TooltipTrigger
        delay={250}
        render={<span role="presentation" tabIndex={-1} data-slot="tooltip-trigger" className="models-source-list__name"><span className="label">{label}</span></span>}
      />
      <TooltipContent sideOffset={3}
            role="tooltip"
            className="z-popup max-w-96 whitespace-normal break-all rounded-nola-ui-xl bg-overlay p-2 text-xs text-overlay-foreground shadow-overlay"
          >
            {hint}
          </TooltipContent>
    </Tooltip>
  )
}

/**
 * Whether the last interaction came from the keyboard. The list needs it to tell a
 * keyboard focus from a pointer one: only a keyboard focus opens the hint tooltip,
 * because a pointer user already sees the hovered row.
 */
function useKeyboardNavigation(): boolean {
  const [keyboard, setKeyboard] = useState(false)
  useEffect(() => {
    const onKeyDown = () => setKeyboard(true)
    const onPointerDown = () => setKeyboard(false)
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [])
  return keyboard
}
