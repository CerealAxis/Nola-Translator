import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { createExtensionStore } from '../store'
import { Panel } from './Panel'

it('limits the panel to connection controls without repeating desktop settings', () => {
  const store = createExtensionStore({ bridge: { request: vi.fn(async () => undefined), subscribe: () => () => {}, close: vi.fn() } })
  render(<Panel store={store} />)
  expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  expect(screen.queryByText('Audio source')).not.toBeInTheDocument()
  expect(screen.queryByText('Font size')).not.toBeInTheDocument()
  expect(screen.queryByText('Bottom offset')).not.toBeInTheDocument()
})
