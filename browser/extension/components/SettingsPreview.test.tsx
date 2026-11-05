import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { browserText } from '../i18n'
import { DEFAULT_PREFERENCES } from '../preferences'
import { SettingsPreview } from './SettingsPreview'

describe('settings effect previews', () => {
  it('shows only the enabled context menu actions', () => {
    const t = browserText('en')
    render(<SettingsPreview kind="contextMenu" settings={{ ...DEFAULT_PREFERENCES, contextMenuPage: false, contextMenuInput: false }} t={t} />)
    expect(screen.queryByText(t('togglePageTranslation'))).not.toBeInTheDocument()
    expect(screen.queryByText(t('inputTranslation'))).not.toBeInTheDocument()
    expect(screen.getByText(t('translateSelection'))).toBeInTheDocument()
    expect(screen.getByText(t('speakSelection'))).toBeInTheDocument()
  })
  it('hides the original paragraph in translation-only mode', () => {
    const t = browserText('en')
    const { rerender } = render(<SettingsPreview kind="web" settings={DEFAULT_PREFERENCES} t={t} />)
    expect(screen.getByText(t('exampleText'))).toBeInTheDocument()
    rerender(<SettingsPreview kind="web" settings={{ ...DEFAULT_PREFERENCES, pageDisplay: 'translation' }} t={t} />)
    expect(screen.queryByText(t('exampleText'))).not.toBeInTheDocument()
    expect(screen.getByText(browserText('zh-CN')('exampleText'))).toBeInTheDocument()
  })
})
