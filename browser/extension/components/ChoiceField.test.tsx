import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChoiceField } from './ChoiceField'

describe('inline HeroUI choices', () => {
  it('keeps all options in the caller container and routes selection to its action', async () => {
    const action = vi.fn()
    const { container } = render(<ChoiceField label="Audio source" value="tab" options={[{ value: 'tab', label: 'Tab audio' }, { value: 'system', label: 'System audio' }]} onChange={action} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Audio source' }))
    const option = screen.getByRole('option', { name: 'System audio' })
    expect(container.contains(option)).toBe(true)
    await user.click(option)
    expect(action).toHaveBeenCalledWith('system')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(container.querySelector('select')).toBeNull()
  })
  it('locks the selection control while the session is starting or active', async () => {
    const action = vi.fn()
    render(<ChoiceField label="Language" value="en" options={[{ value: 'en', label: 'English' }]} disabled onChange={action} />)
    expect(screen.getByRole('button', { name: 'Language' })).toBeDisabled()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
