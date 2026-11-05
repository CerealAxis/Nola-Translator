import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChoiceField } from './ChoiceField'
import { browserText } from '../i18n'

describe('inline choice field', () => {
  it('keeps all options in the caller container and routes selection to its action', async () => {
    const action = vi.fn()
    const { container } = render(<ChoiceField label="Audio source" value="tab" options={[{ value: 'tab', label: 'Tab audio' }, { value: 'system', label: 'System audio' }]} onChange={action} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'Audio source' }))
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
    expect(screen.getByRole('combobox', { name: 'Language' })).toBeDisabled()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
  it('searches long lists within the caller container and selects the requested value', async () => {
    const action = vi.fn()
    const options = ['English', 'Chinese', 'Japanese', 'Korean', 'French', 'German', 'Italian', 'Spanish'].map(label => ({ value: label.toLowerCase(), label }))
    const { container } = render(<ChoiceField label="Language" value="english" options={options} onChange={action} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'Language' }))
    await user.type(await screen.findByRole('combobox', { name: browserText('en')('searchOptions') }), 'span')
    const option = screen.getByRole('option', { name: 'Spanish' })
    expect(container.contains(option)).toBe(true)
    expect(screen.queryByRole('option', { name: 'Japanese' })).not.toBeInTheDocument()
    await user.click(option)
    expect(action).toHaveBeenCalledWith('spanish')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
  it('shows localized no-results feedback and respects disabled long-list choices', async () => {
    const action = vi.fn()
    const t = browserText('zh-CN')
    const options = Array.from({ length: 8 }, (_, index) => ({ value: String(index), label: `Option ${index}`, disabled: index === 1 }))
    render(<ChoiceField label="Language" value="0" options={options} onChange={action} t={t} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'Language' }))
    expect(await screen.findByRole('option', { name: 'Option 1' })).toHaveAttribute('aria-disabled', 'true')
    await user.type(screen.getByRole('combobox', { name: t('searchOptions') }), 'missing')
    expect(screen.getByText(t('noResults'))).toBeInTheDocument()
    expect(action).not.toHaveBeenCalled()
  })
})
