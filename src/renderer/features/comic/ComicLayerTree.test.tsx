import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ComicLayerTree, type ComicLayerTreeNode, type ComicLayerTreeProps } from './ComicLayerTree'

const nodes: ComicLayerTreeNode[] = [
  { key: 'board-a', id: 'a', pageId: 'a', kind: 'artboard', name: 'Cover', visible: true, children: [
    { key: 'background', id: 'bg', pageId: 'a', kind: 'background', name: 'Original', visible: true, locked: true },
    { key: 'repair', id: 'r', pageId: 'a', kind: 'repair', name: 'Cleanup', visible: true, opacity: .7 },
    { key: 'text', id: 't', pageId: 'a', kind: 'text', name: 'Manual text', visible: true, locked: false, opacity: .8 },
  ] },
  { key: 'board-b', id: 'b', pageId: 'b', kind: 'artboard', name: 'Dialogue', visible: true, children: [
    { key: 'drawing', id: 'd', pageId: 'b', kind: 'drawing', name: 'Paint', visible: true, locked: false, opacity: 1 },
  ] },
]
const names = () => screen.getAllByRole('treeitem').map(row => row.getAttribute('aria-label'))
const item = (name: string) => screen.getByRole('treeitem', { name })

function setup(overrides: Partial<ComicLayerTreeProps> = {}) {
  const onSelection = vi.fn(), onToggleExpanded = vi.fn(), onFocusArtboard = vi.fn()
  function Harness() {
    const [selectedKeys, setSelectedKeys] = useState(overrides.selectedKeys ?? [])
    const [activeKey, setActiveKey] = useState<string | undefined>(overrides.activeKey)
    const [expandedKeys, setExpandedKeys] = useState(overrides.expandedKeys ?? ['board-a', 'board-b'])
    return <ComicLayerTree nodes={nodes} {...overrides} selectedKeys={selectedKeys} activeKey={activeKey} expandedKeys={expandedKeys}
      onFocusArtboard={onFocusArtboard} onSelection={(keys, active) => { onSelection(keys, active); setSelectedKeys(keys); setActiveKey(active) }}
      onToggleExpanded={(key, expanded, all) => {
        onToggleExpanded(key, expanded, all)
        setExpandedKeys(previous => all ? expanded ? ['board-a', 'board-b'] : [] : expanded ? [...previous, key] : previous.filter(value => value !== key))
      }} />
  }
  render(<Harness />)
  return { onSelection, onToggleExpanded, onFocusArtboard }
}

afterEach(cleanup)

describe('comic global layer tree', () => {
  it('keeps every artboard in page order and renders each child stack from top to bottom', () => {
    setup()
    expect(names()).toEqual(['Cover', 'Manual text', 'Cleanup', 'Original', 'Dialogue', 'Paint'])
    expect(item('Manual text')).toHaveAttribute('aria-level', '2')
    expect(item('Cover')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.queryByRole('button', { name: /隐藏图层/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument()
  })

  it('replaces, toggles and range-selects across visible rows without fitting the canvas', () => {
    const { onSelection, onFocusArtboard } = setup()
    fireEvent.click(item('Manual text'))
    expect(onSelection).toHaveBeenLastCalledWith(['text'], 'text')
    fireEvent.click(item('Paint'), { ctrlKey: true })
    expect(onSelection).toHaveBeenLastCalledWith(['text', 'drawing'], 'drawing')
    fireEvent.click(item('Paint'), { metaKey: true })
    expect(onSelection).toHaveBeenLastCalledWith(['text'], 'text')
    fireEvent.click(item('Manual text'))
    fireEvent.click(item('Original'), { shiftKey: true })
    expect(onSelection).toHaveBeenLastCalledWith(['text', 'repair', 'background'], 'background')
    expect(onFocusArtboard).not.toHaveBeenCalled()
    fireEvent.doubleClick(item('Dialogue'))
    expect(onFocusArtboard).toHaveBeenCalledExactlyOnceWith('b')
  })

  it('collapses one board or all boards with Alt without changing the layer selection', () => {
    const { onSelection, onToggleExpanded } = setup({ selectedKeys: ['text'] })
    fireEvent.click(within(item('Cover')).getByRole('button', { name: 'Cover' }), { altKey: true })
    expect(onToggleExpanded).toHaveBeenLastCalledWith('board-a', false, true)
    expect(names()).toEqual(['Cover', 'Dialogue'])
    expect(onSelection).not.toHaveBeenCalled()
    fireEvent.click(within(item('Dialogue')).getByRole('button', { name: 'Dialogue' }))
    expect(names()).toEqual(['Cover', 'Dialogue', 'Paint'])
  })

  it('supports arrow traversal, collapse, parent selection and Enter without auto-fit', () => {
    const { onSelection, onToggleExpanded, onFocusArtboard } = setup({ expandedKeys: [] })
    fireEvent.keyDown(item('Cover'), { key: 'ArrowRight' })
    expect(onToggleExpanded).toHaveBeenLastCalledWith('board-a', true, false)
    fireEvent.keyDown(item('Cover'), { key: 'ArrowRight' })
    expect(item('Manual text')).toHaveFocus()
    expect(onSelection).toHaveBeenLastCalledWith(['text'], 'text')
    fireEvent.keyDown(item('Manual text'), { key: 'ArrowDown', shiftKey: true })
    expect(onSelection).toHaveBeenLastCalledWith(['text', 'repair'], 'repair')
    fireEvent.keyDown(item('Cleanup'), { key: 'ArrowLeft' })
    expect(item('Cover')).toHaveFocus()
    fireEvent.keyDown(item('Cover'), { key: 'ArrowLeft' })
    expect(onToggleExpanded).toHaveBeenLastCalledWith('board-a', false, false)
    fireEvent.keyDown(item('Cover'), { key: 'Enter' })
    expect(onSelection).toHaveBeenLastCalledWith(['board-a'], 'board-a')
    expect(onFocusArtboard).not.toHaveBeenCalled()
  })

  it('finds text inside collapsed boards and filters real kinds while keeping their parent heading', async () => {
    setup({ expandedKeys: [] })
    fireEvent.change(screen.getByRole('textbox', { name: '搜索图层' }), { target: { value: 'MANUAL' } })
    expect(names()).toEqual(['Cover', 'Manual text'])
    fireEvent.change(screen.getByRole('textbox', { name: '搜索图层' }), { target: { value: '' } })
    await userEvent.click(screen.getByRole('combobox', { name: '图层筛选' }))
    await userEvent.click(await screen.findByRole('option', { name: '绘图' }))
    expect(names()).toEqual(['Dialogue', 'Paint'])
  })

  it('renames in place with F2 and Enter, and discards Escape without deleting or selecting rows', () => {
    const onRename = vi.fn(), onDelete = vi.fn()
    setup({ onRename, onDelete })
    fireEvent.keyDown(item('Manual text'), { key: 'F2' })
    let input = screen.getByRole('textbox', { name: '图层名称' })
    fireEvent.change(input, { target: { value: '  Renamed  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRename).toHaveBeenCalledExactlyOnceWith('text', 'Renamed')
    fireEvent.keyDown(item('Manual text'), { key: 'F2' })
    input = screen.getByRole('textbox', { name: '图层名称' })
    fireEvent.change(input, { target: { value: 'Discard' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onRename).toHaveBeenCalledTimes(1)
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('routes visibility, locks, opacity and necessary footer actions without changing selection', () => {
    const onVisibility = vi.fn(), onLocked = vi.fn(), onOpacity = vi.fn(), onDelete = vi.fn(), onAddText = vi.fn(), onAddDrawing = vi.fn()
    const { onSelection } = setup({ selectedKeys: ['text'], onVisibility, onLocked, onOpacity, onDelete, onAddText, onAddDrawing })
    fireEvent.click(within(item('Manual text')).getByRole('button', { name: '隐藏图层 Manual text' }))
    fireEvent.click(within(item('Manual text')).getByRole('button', { name: '锁定图层 Manual text' }))
    expect(onVisibility).toHaveBeenCalledExactlyOnceWith('text')
    expect(onLocked).toHaveBeenCalledExactlyOnceWith('text')
    expect(onSelection).not.toHaveBeenCalled()
    const opacity = screen.getByRole('spinbutton', { name: '不透明度（%）' })
    fireEvent.change(opacity, { target: { value: '43' } }); fireEvent.blur(opacity)
    expect(onOpacity).toHaveBeenCalledExactlyOnceWith('text', .43)
    fireEvent.change(opacity, { target: { value: '' } }); fireEvent.blur(opacity)
    fireEvent.change(opacity, { target: { value: '-5' } }); fireEvent.blur(opacity)
    expect(onOpacity).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '新增气泡框' }))
    fireEvent.click(screen.getByRole('button', { name: '添加绘画图层' }))
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(onAddText).toHaveBeenCalledOnce(); expect(onAddDrawing).toHaveBeenCalledOnce()
    expect(onDelete).toHaveBeenCalledExactlyOnceWith(['text'])
  })

  it('leaves selection and mutation callbacks untouched while disabled', () => {
    const onVisibility = vi.fn(), onDelete = vi.fn()
    const { onSelection } = setup({ disabled: true, selectedKeys: ['text'], onVisibility, onDelete })
    fireEvent.click(item('Paint'))
    fireEvent.keyDown(item('Manual text'), { key: 'Delete' })
    fireEvent.click(screen.getByRole('button', { name: '隐藏图层 Manual text' }))
    expect(onSelection).not.toHaveBeenCalled(); expect(onDelete).not.toHaveBeenCalled(); expect(onVisibility).not.toHaveBeenCalled()
  })

  it('only reorders top-level artboards or matching movable kinds in the same artboard', () => {
    const onMove = vi.fn()
    const extra: ComicLayerTreeNode = { key: 'text-2', id: 't2', pageId: 'a', kind: 'text', name: 'Other text', visible: true }
    const otherPageText = { ...extra, key: 'other-page-text', pageId: 'b', name: 'Other page text' }
    setup({ nodes: [{ ...nodes[0], children: [...nodes[0].children!, extra] }, { ...nodes[1], children: [...nodes[1].children!, otherPageText] }], onMove })
    const values = new Map<string, string>()
    const dataTransfer = { setData: (type: string, value: string) => values.set(type, value), getData: (type: string) => values.get(type) ?? '', effectAllowed: '', dropEffect: '' }
    fireEvent.dragStart(item('Manual text'), { dataTransfer })
    fireEvent.drop(item('Cleanup'), { dataTransfer })
    expect(onMove).not.toHaveBeenCalled()
    fireEvent.dragStart(item('Manual text'), { dataTransfer })
    fireEvent.drop(item('Paint'), { dataTransfer })
    expect(onMove).not.toHaveBeenCalled()
    fireEvent.dragStart(item('Manual text'), { dataTransfer })
    fireEvent.drop(item('Other page text'), { dataTransfer })
    expect(onMove).not.toHaveBeenCalled()
    fireEvent.dragStart(item('Other text'), { dataTransfer })
    fireEvent.drop(item('Manual text'), { dataTransfer })
    expect(onMove).toHaveBeenLastCalledWith('text-2', 'text')
    fireEvent.dragStart(item('Cover'), { dataTransfer })
    fireEvent.drop(item('Dialogue'), { dataTransfer })
    expect(onMove).toHaveBeenLastCalledWith('board-a', 'board-b')
    expect(onMove).toHaveBeenCalledTimes(2)
    expect(item('Cleanup')).toHaveAttribute('draggable', 'false')
    expect(item('Original')).toHaveAttribute('draggable', 'false')
  })
  it('inherits artboard locks for every child mutation while allowing the board itself to unlock', () => {
    const onRename = vi.fn(), onVisibility = vi.fn(), onLocked = vi.fn(), onDelete = vi.fn(), onOpacity = vi.fn(), onMove = vi.fn()
    setup({ nodes: [{ ...nodes[0], locked: true }, nodes[1]], selectedKeys: ['text'], onRename, onVisibility, onLocked, onDelete, onOpacity, onMove })
    const row = item('Manual text')
    expect(row).toHaveAttribute('draggable', 'false')
    for (const button of within(row).getAllByRole('button')) expect(button).toBeDisabled()
    fireEvent.keyDown(row, { key: 'F2' }); fireEvent.doubleClick(row)
    expect(screen.queryByRole('textbox', { name: '图层名称' })).not.toBeInTheDocument()
    fireEvent.keyDown(row, { key: 'Delete' })
    const opacity = screen.getByRole('spinbutton', { name: '不透明度（%）' })
    expect(opacity).toBeDisabled()
    fireEvent.change(opacity, { target: { value: '30' } }); fireEvent.blur(opacity)
    const dataTransfer = { setData: vi.fn(), getData: () => 'text' }
    fireEvent.dragStart(row, { dataTransfer }); fireEvent.drop(row, { dataTransfer })
    expect(dataTransfer.setData).not.toHaveBeenCalled()
    expect(onMove).not.toHaveBeenCalled(); expect(onRename).not.toHaveBeenCalled()
    expect(onVisibility).not.toHaveBeenCalled(); expect(onDelete).not.toHaveBeenCalled(); expect(onOpacity).not.toHaveBeenCalled()
    fireEvent.keyDown(item('Cover'), { key: 'Delete' })
    expect(onDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '解锁图层 Cover' }))
    expect(onLocked).toHaveBeenCalledExactlyOnceWith('board-a')
  })

  it('permits unlocking a locally locked layer but filters protected nodes from keyboard and footer deletion', () => {
    const onDelete = vi.fn(), onLocked = vi.fn(), onRename = vi.fn(), onVisibility = vi.fn()
    setup({ nodes: [{ ...nodes[0], children: nodes[0].children!.map(node => node.key === 'text' ? { ...node, locked: true } : node) }, nodes[1]],
      selectedKeys: ['board-a', 'background', 'text', 'repair', 'drawing'], onDelete, onLocked, onRename, onVisibility })
    const row = item('Manual text')
    expect(row).toHaveAttribute('draggable', 'false')
    expect(screen.getByRole('button', { name: '隐藏图层 Manual text' })).toBeDisabled()
    fireEvent.keyDown(row, { key: 'F2' }); fireEvent.doubleClick(row)
    expect(screen.queryByRole('textbox', { name: '图层名称' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '解锁图层 Manual text' }))
    expect(onLocked).toHaveBeenCalledExactlyOnceWith('text')
    fireEvent.keyDown(row, { key: 'Delete' })
    expect(onDelete).toHaveBeenLastCalledWith(['board-a', 'repair', 'drawing'])
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(onDelete).toHaveBeenLastCalledWith(['board-a', 'repair', 'drawing'])
    expect(onDelete).toHaveBeenCalledTimes(2)
    expect(onRename).not.toHaveBeenCalled(); expect(onVisibility).not.toHaveBeenCalled()
  })

})
