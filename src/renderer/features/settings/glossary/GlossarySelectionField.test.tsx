import { useState } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import * as store from '@/store'
import type { NolaBridge } from '@/bridge'
import type { GlossarySelection } from '../../../../shared/glossary'
import { GlossarySelectionField } from './GlossarySelectionField'

afterEach(() => { cleanup(); vi.restoreAllMocks() })
it('binds library IDs to the scene without editing or duplicating the shared library', async () => {
  const command = vi.fn(), changed = vi.fn()
  vi.spyOn(store, 'getBridge').mockReturnValue({ glossary: { snapshot: async () => ({ revision: 1, libraries: [{ id: 'library', name: 'Game names', enabled: true }] }), command, onChanged: () => () => {} } } as unknown as NolaBridge)
  function Harness() {
    const [value, setValue] = useState<GlossarySelection>({ mode: 'auto' })
    return <GlossarySelectionField value={value} onChange={next => { changed(next); setValue(next) }} />
  }
  render(<Harness />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: '术语表' }))
  await waitFor(() => expect(screen.getByRole('option', { name: '选择术语库' })).toBeEnabled())
  await user.click(screen.getByRole('option', { name: '选择术语库' }))
  await user.click(screen.getByRole('button', { name: '已选 0 个库' }))
  await user.click(await screen.findByRole('switch', { name: 'Game names' }))
  expect(changed).toHaveBeenLastCalledWith({ mode: 'selected', libraryIds: ['library'] })
  expect(command).not.toHaveBeenCalled()
})
