import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { ColorPicker } from './color-picker'

afterEach(cleanup)

it('edits the inline color dock through the shared presets, hue and HEX controls', async () => {
  const changed = vi.fn()
  function Dock() {
    const [value, setValue] = useState('#FF0000')
    return <ColorPicker inline label="Color" value={value} presets={['#00FF00']} onChange={color => { changed(color); setValue(color) }} />
  }
  render(<Dock />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Color' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Color #00FF00' }))
  expect(changed).toHaveBeenLastCalledWith('#00FF00')
  const hue = screen.getByRole('slider', { name: 'Color · H' })
  expect(hue).toHaveAttribute('aria-orientation', 'vertical')
  fireEvent.keyDown(hue, { key: 'ArrowUp' })
  expect(changed).toHaveBeenLastCalledWith('#00FF04')
  const hex = screen.getByRole('textbox', { name: 'Color · HEX' })
  fireEvent.change(hex, { target: { value: '#abc' } })
  expect(changed).toHaveBeenLastCalledWith('#AABBCC')
  changed.mockClear()
  fireEvent.change(hex, { target: { value: '#broken' } })
  expect(hex).toHaveAttribute('aria-invalid', 'true')
  expect(changed).not.toHaveBeenCalled()
  fireEvent.blur(hex)
  expect(hex).toHaveValue('#AABBCC')
})

it('keeps the default picker hidden until its trigger opens the existing popover', async () => {
  render(<ColorPicker label="Color" value="#FF0000" presets={[]} onChange={vi.fn()} />)
  expect(screen.queryByRole('textbox', { name: 'Color · HEX' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Color' }))
  expect(await screen.findByRole('dialog', { name: 'Color' })).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: 'Color · HEX' })).toHaveValue('#FF0000')
  expect(screen.getByRole('slider', { name: 'Color · H' })).toHaveAttribute('aria-orientation', 'horizontal')
})
