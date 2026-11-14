import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react'
import { ChevronDown, ChevronRight, Eye, ImageIcon, Layers, LockKeyhole, Paintbrush, Plus, ScanLine, Search, Square, Trash2, Type, UnlockKeyhole } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useI18n } from '@/i18n'

export type ComicLayerTreeKind = 'artboard' | 'text' | 'repair' | 'drawing' | 'background' | 'mask'
export interface ComicLayerTreeNode {
  key: string
  pageId: string
  kind: ComicLayerTreeKind
  id: string
  name: string
  visible: boolean
  locked?: boolean
  opacity?: number
  children?: ComicLayerTreeNode[]
}
export interface ComicLayerTreeProps {
  /** Artboards follow this order; each children array is the bottom-to-top layer stack. */
  nodes: ComicLayerTreeNode[]
  expandedKeys: string[]
  selectedKeys: string[]
  activeKey?: string
  disabled?: boolean
  onSelection: (keys: string[], activeKey: string | undefined) => void
  onToggleExpanded: (key: string, expanded: boolean, all: boolean) => void
  onVisibility?: (key: string) => void
  onLocked?: (key: string) => void
  onRename?: (key: string, name: string) => void
  onDelete?: (keys: string[]) => void
  onFocusArtboard?: (pageId: string) => void
  onOpacity?: (key: string, opacity: number) => void
  onAddText?: () => void
  onAddDrawing?: () => void
  onMove?: (key: string, targetKey: string) => void
}

const kindLabels = {
  artboard: 'suite.comicArtboard', text: 'suite.comicTextLayers', repair: 'suite.comicRepairPatch',
  drawing: 'suite.comicPaintLayers', background: 'suite.comicBackground', mask: 'suite.comicMasks',
} as const
const kindIcons = { artboard: Layers, text: Type, repair: ScanLine, drawing: Paintbrush, background: ImageIcon, mask: Square }
type Row = { node: ComicLayerTreeNode; depth: number; parent?: string }

export function ComicLayerTree({ nodes, expandedKeys, selectedKeys, activeKey, disabled = false,
  onSelection, onToggleExpanded, onVisibility, onLocked, onRename, onDelete, onFocusArtboard,
  onOpacity, onAddText, onAddDrawing, onMove }: ComicLayerTreeProps) {
  const { t } = useI18n()
  const id = useId()
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<ComicLayerTreeKind | 'all'>('all')
  const [focused, setFocused] = useState(activeKey)
  const [renaming, setRenaming] = useState<{ key: string; name: string }>()
  const anchor = useRef<string | undefined>(activeKey)
  const lastSelection = useRef(activeKey)
  const items = useRef(new Map<string, HTMLDivElement>())
  const dragged = useRef<string | undefined>(undefined)
  const allNodes = useMemo(() => {
    const result: ComicLayerTreeNode[] = []
    const visit = (values: ComicLayerTreeNode[]) => { for (const node of values) { result.push(node); if (node.children) visit(node.children) } }
    visit(nodes)
    return result
  }, [nodes])
  const ancestorLocks = useMemo(() => {
    const result = new Map<string, boolean>()
    const visit = (values: ComicLayerTreeNode[], locked: boolean) => {
      for (const node of values) {
        result.set(node.key, locked)
        if (node.children) visit(node.children, locked || !!node.locked)
      }
    }
    visit(nodes, false)
    return result
  }, [nodes])
  const isLocked = (node: ComicLayerTreeNode) => !!node.locked || !!ancestorLocks.get(node.key)
  const deletable = (keys: string[]) => keys.filter(key => {
    const node = allNodes.find(value => value.key === key)
    return node && !isLocked(node) && node.kind !== 'background'
  })
  const deleteSelection = (keys: string[]) => {
    const allowed = deletable(keys)
    if (!disabled && allowed.length) onDelete?.(allowed)
  }
  const filtering = !!query.trim() || kind !== 'all'
  const rows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    const matches = new Set<string>()
    const match = (node: ComicLayerTreeNode): boolean => {
      const children = node.children?.map(match).some(Boolean) ?? false
      const own = node.name.toLocaleLowerCase().includes(needle) && (kind === 'all' || node.kind === kind)
      if (own || children) matches.add(node.key)
      return own || children
    }
    nodes.forEach(match)
    const result: Row[] = []
    const visit = (values: ComicLayerTreeNode[], depth: number, parent?: string) => {
      for (const node of values) {
        if (filtering && !matches.has(node.key)) continue
        result.push({ node, depth, parent })
        if (node.children && (filtering || expandedKeys.includes(node.key))) visit([...node.children].reverse(), depth + 1, node.key)
      }
    }
    visit(nodes, 0)
    return result
  }, [nodes, expandedKeys, query, kind, filtering])
  const focusKey = rows.some(row => row.node.key === focused) ? focused : rows.find(row => selectedKeys.includes(row.node.key))?.node.key ?? rows[0]?.node.key
  const selected = selectedKeys.length === 1 ? allNodes.find(node => node.key === selectedKeys[0]) : undefined
  const kinds = Object.keys(kindLabels).filter(value => allNodes.some(node => node.kind === value)) as ComicLayerTreeKind[]
  const canMove = (key: string | undefined, targetKey: string) => {
    if (!onMove || disabled || !key || key === targetKey) return false
    const source = allNodes.find(node => node.key === key), target = allNodes.find(node => node.key === targetKey)
    if (!source || !target || isLocked(source) || isLocked(target) || source.kind !== target.kind) return false
    if (source.kind === 'artboard') return nodes.includes(source) && nodes.includes(target)
    return (source.kind === 'text' || source.kind === 'drawing') && source.pageId === target.pageId
  }

  useEffect(() => {
    if (activeKey) {
      if (activeKey !== lastSelection.current) anchor.current = activeKey
      setFocused(activeKey)
      items.current.get(activeKey)?.scrollIntoView?.({ block: 'nearest' })
    }
  }, [activeKey])

  const publishSelection = (keys: string[], active: string | undefined) => { lastSelection.current = active; onSelection(keys, active) }
  const select = (key: string, modifiers: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) => {
    if (disabled) return
    if (modifiers.shiftKey) {
      const from = rows.findIndex(row => row.node.key === (anchor.current ?? activeKey ?? selectedKeys[0]))
      const to = rows.findIndex(row => row.node.key === key)
      const range = rows.slice(Math.min(from < 0 ? to : from, to), Math.max(from < 0 ? to : from, to) + 1).map(row => row.node.key)
      publishSelection(modifiers.ctrlKey || modifiers.metaKey ? [...new Set([...selectedKeys, ...range])] : range, key)
    } else {
      anchor.current = key
      const keys = modifiers.ctrlKey || modifiers.metaKey
        ? selectedKeys.includes(key) ? selectedKeys.filter(value => value !== key) : [...selectedKeys, key]
        : [key]
      publishSelection(keys, keys.includes(key) ? key : keys.at(-1))
    }
  }
  const focus = (key: string) => { setFocused(key); items.current.get(key)?.focus() }
  const click = (event: MouseEvent<HTMLDivElement>, key: string) => { focus(key); select(key, event) }
  const finishRename = () => {
    if (!renaming) return
    const name = renaming.name.trim()
    const node = allNodes.find(node => node.key === renaming.key)
    if (!disabled && node && !isLocked(node) && name && name !== node.name) onRename?.(renaming.key, name)
    setRenaming(undefined)
  }
  const keyDown = (event: KeyboardEvent<HTMLDivElement>, row: Row) => {
    if (event.target !== event.currentTarget || disabled || event.nativeEvent.isComposing) return
    const { node, parent } = row
    const index = rows.findIndex(item => item.node.key === node.key)
    let target: string | undefined
    if (event.key === 'ArrowDown') target = rows[Math.min(index + 1, rows.length - 1)]?.node.key
    else if (event.key === 'ArrowUp') target = rows[Math.max(0, index - 1)]?.node.key
    else if (event.key === 'Home') target = rows[0]?.node.key
    else if (event.key === 'End') target = rows.at(-1)?.node.key
    else if (event.key === 'ArrowRight' && node.children?.length) {
      if (!filtering && !expandedKeys.includes(node.key)) onToggleExpanded(node.key, true, event.altKey)
      else target = rows[index + 1]?.node.key
    } else if (event.key === 'ArrowLeft') {
      if (node.children?.length && expandedKeys.includes(node.key) && !filtering) onToggleExpanded(node.key, false, event.altKey)
      else target = parent
    } else if (event.key === 'Enter' || event.key === ' ') select(node.key, event)
    else if (event.key === 'F2' && onRename && !isLocked(node)) setRenaming({ key: node.key, name: node.name })
    else if (event.key === 'Delete' && onDelete) deleteSelection(selectedKeys.includes(node.key) ? selectedKeys : [node.key])
    else return
    event.preventDefault()
    event.stopPropagation()
    if (target) { focus(target); if (!(event.ctrlKey || event.metaKey)) select(target, event) }
  }

  return <div className="comic-layer-tree">
    <FieldGroup className="comic-layer-tree__filters">
      <Field>
        <FieldLabel className="sr-only" htmlFor={`${id}-search`}>{t('suite.comicLayerSearch')}</FieldLabel>
        <InputGroup>
          <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
          <InputGroupInput id={`${id}-search`} value={query} placeholder={t('suite.comicLayerSearch')} onChange={event => setQuery(event.target.value)} />
        </InputGroup>
      </Field>
      <Field>
        <FieldLabel className="sr-only" htmlFor={`${id}-kind`}>{t('suite.comicLayerFilter')}</FieldLabel>
        <Select value={kind} onValueChange={value => { if (value) setKind(value as typeof kind) }}>
          <SelectTrigger id={`${id}-kind`} aria-label={t('suite.comicLayerFilter')}><SelectValue>{t(kind === 'all' ? 'suite.comicAllKinds' : kindLabels[kind])}</SelectValue></SelectTrigger>
          <SelectContent><SelectGroup><SelectItem value="all">{t('suite.comicAllKinds')}</SelectItem>{kinds.map(value => <SelectItem key={value} value={value}>{t(kindLabels[value])}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </Field>
      {selected?.opacity !== undefined && onOpacity && <Field className="comic-layer-tree__opacity">
        <FieldLabel htmlFor={`${id}-opacity`}>{t('suite.comicOpacity')}</FieldLabel>
        <Input id={`${id}-opacity`} key={`${selected.key}-${selected.opacity}`} type="number" min={0} max={100}
          defaultValue={Math.round(selected.opacity * 100)} disabled={disabled || isLocked(selected)}
          onBlur={event => {
            if (disabled || isLocked(selected)) return
            const value = event.currentTarget.value.trim() ? event.currentTarget.valueAsNumber : NaN
            if (Number.isFinite(value) && value >= 0 && value <= 100 && value / 100 !== selected.opacity) onOpacity(selected.key, value / 100)
            else event.currentTarget.value = String(Math.round(selected.opacity! * 100))
          }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} />
      </Field>}
    </FieldGroup>
    <div className="comic-layer-tree__list" role="tree" aria-label={t('suite.comicAllLayers')} aria-multiselectable="true" aria-disabled={disabled}>
      {rows.map(row => {
        const { node, depth } = row
        const Icon = kindIcons[node.kind]
        const expanded = filtering || expandedKeys.includes(node.key)
        return <div key={node.key} ref={element => { if (element) items.current.set(node.key, element); else items.current.delete(node.key) }}
          role="treeitem" aria-label={node.name} aria-level={depth + 1} aria-selected={selectedKeys.includes(node.key)}
          aria-expanded={node.children ? expanded : undefined} tabIndex={focusKey === node.key ? 0 : -1}
          className="comic-layer-tree__row" data-key={node.key} data-kind={node.kind} data-active={activeKey === node.key || undefined}
          data-selected={selectedKeys.includes(node.key) || undefined} data-depth={depth}
          draggable={!!onMove && !disabled && !isLocked(node) && !renaming && (node.kind === 'artboard' ? depth === 0 : node.kind === 'text' || node.kind === 'drawing')}
          onDragStart={event => {
            if (disabled || isLocked(node) || (event.target as HTMLElement).closest('button,input')) { event.preventDefault(); return }
            dragged.current = node.key
            event.dataTransfer.setData('application/x-nola-comic-layer', node.key)
            event.dataTransfer.effectAllowed = 'move'
          }} onDragEnd={() => { dragged.current = undefined }}
          onDragOver={event => { if (canMove(dragged.current, node.key)) { event.preventDefault(); event.dataTransfer.dropEffect = 'move' } }}
          onDrop={event => {
            const key = dragged.current ?? event.dataTransfer.getData('application/x-nola-comic-layer')
            if (canMove(key, node.key)) { event.preventDefault(); event.stopPropagation(); onMove!(key, node.key) }
            dragged.current = undefined
          }}
          style={{ '--comic-layer-depth': depth } as CSSProperties} onClick={event => click(event, node.key)} onFocus={() => setFocused(node.key)}
          onKeyDown={event => keyDown(event, row)} onDoubleClick={event => {
            if (disabled || (event.target as HTMLElement).closest('button,input')) return
            if (node.kind === 'artboard') onFocusArtboard?.(node.pageId)
            else if (onRename && !isLocked(node)) setRenaming({ key: node.key, name: node.name })
          }}>
          {onVisibility ? <Button className="comic-layer-tree__visibility" variant="bare" size="icon-xs" tabIndex={focusKey === node.key ? 0 : -1} disabled={disabled || isLocked(node)}
            aria-label={`${t(node.visible ? 'suite.comicHideLayer' : 'suite.comicShowLayer')} ${node.name}`} aria-pressed={node.visible}
            onClick={event => { event.stopPropagation(); onVisibility(node.key) }}>{node.visible ? <Eye aria-hidden="true" /> : <span aria-hidden="true" />}</Button> : <span className="comic-layer-tree__visibility" />}
          {node.children ? <Button className="comic-layer-tree__disclosure" variant="bare" size="icon-xs" tabIndex={focusKey === node.key ? 0 : -1} disabled={disabled || filtering}
            aria-label={node.name} aria-expanded={expanded} onClick={event => { event.stopPropagation(); onToggleExpanded(node.key, !expanded, event.altKey) }}>
            {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
          </Button> : <span className="comic-layer-tree__disclosure" />}
          <span className="comic-layer-tree__kind" title={t(kindLabels[node.kind])}><Icon aria-hidden="true" /></span>
          {renaming?.key === node.key ? <Input className="comic-layer-tree__rename" aria-label={t('suite.comicLayerName')} autoFocus maxLength={200} disabled={disabled || isLocked(node)}
            value={renaming.name} onClick={event => event.stopPropagation()} onChange={event => setRenaming({ key: node.key, name: event.target.value })}
            onBlur={finishRename} onKeyDown={event => {
              event.stopPropagation()
              if (event.nativeEvent.isComposing) return
              if (event.key === 'Enter') { event.preventDefault(); finishRename() }
              if (event.key === 'Escape') { event.preventDefault(); setRenaming(undefined) }
            }} /> : <span className="comic-layer-tree__name" title={node.name}>{node.name}</span>}
          {node.locked !== undefined && onLocked ? <Button className="comic-layer-tree__lock" variant="bare" size="icon-xs" tabIndex={focusKey === node.key ? 0 : -1} disabled={disabled || ancestorLocks.get(node.key)}
            aria-label={`${t(node.locked ? 'suite.comicUnlockLayer' : 'suite.comicLockLayer')} ${node.name}`} aria-pressed={node.locked}
            onClick={event => { event.stopPropagation(); onLocked(node.key) }}>{node.locked ? <LockKeyhole aria-hidden="true" /> : <UnlockKeyhole aria-hidden="true" />}</Button> : <span className="comic-layer-tree__lock" />}
        </div>
      })}
      {!nodes.length && <Empty><EmptyHeader><EmptyTitle>{t('suite.comicLayersEmpty')}</EmptyTitle></EmptyHeader></Empty>}
    </div>
    {(onAddText || onAddDrawing || onDelete) && <div className="comic-layer-tree__footer">
      {onAddText && <Button variant="bare" size="icon-sm" disabled={disabled} aria-label={t('suite.addRegion')} onClick={onAddText}><Type aria-hidden="true" /></Button>}
      {onAddDrawing && <Button variant="bare" size="icon-sm" disabled={disabled} aria-label={t('suite.comicAddDrawingLayer')} onClick={onAddDrawing}><Plus aria-hidden="true" /></Button>}
      {onDelete && <Button variant="bare" size="icon-sm" disabled={disabled || !deletable(selectedKeys).length} aria-label={t('suite.delete')} onClick={() => deleteSelection(selectedKeys)}><Trash2 aria-hidden="true" /></Button>}
    </div>}
  </div>
}
