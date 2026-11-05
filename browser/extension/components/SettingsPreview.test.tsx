import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { browserText } from '../i18n'
import { DEFAULT_PREFERENCES } from '../preferences'
import { SettingsPreview, type PreviewKind } from './SettingsPreview'

describe('settings effect previews', () => {
  const t = browserText('en')
  it.each<PreviewKind>(['web', 'video', 'floatingButton', 'selection', 'inputTranslation', 'contextMenu'])('uses the same compact illustration for %s', kind => {
    const { container } = render(<SettingsPreview kind={kind} settings={DEFAULT_PREFERENCES} t={t} />)
    expect(screen.getByRole('figure', { name: t('livePreview') })).toHaveClass('nola-illustration')
    expect(container.querySelector('.nola-demo-browser')).toBeInTheDocument()
    expect(container.querySelector('figcaption')).not.toBeInTheDocument()
    expect(screen.queryByText(t('exampleHeading'))).not.toBeInTheDocument()
  })
  it('shows only enabled context menu actions without paragraphs', () => {
    render(<SettingsPreview kind="contextMenu" settings={{ ...DEFAULT_PREFERENCES, contextMenuPage: false, contextMenuInput: false }} t={t} />)
    expect(screen.queryByRole('img', { name: t('togglePageTranslation') })).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: t('inputTranslation') })).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: t('translateSelection') })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: t('speakSelection') })).toBeInTheDocument()
  })
  it('reflects page display and translation style', () => {
    const { rerender } = render(<SettingsPreview kind="web" settings={DEFAULT_PREFERENCES} t={t} />)
    expect(screen.getByRole('img', { name: t('sourceCaption') })).toBeInTheDocument()
    rerender(<SettingsPreview kind="web" settings={{ ...DEFAULT_PREFERENCES, pageDisplay: 'translation', pageStyle: 'block' }} t={t} />)
    expect(screen.queryByRole('img', { name: t('sourceCaption') })).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: t('translatedCaption') })).toHaveAttribute('data-style', 'block')
  })
  it('keeps the selection translation example interactive and respects disabled actions', () => {
    render(<SettingsPreview kind="selection" settings={{ ...DEFAULT_PREFERENCES, selectionSpeak: false, selectionCopy: false }} t={t} />)
    expect(screen.queryByRole('img', { name: t('tts') })).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: t('copyTranslation') })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: t('translateText') }))
    expect(screen.getByRole('img', { name: t('translatedCaption') })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: t('restorePage') })).toBeInTheDocument()
  })
  it('preserves the actual subtitle appearance controls', () => {
    render(<SettingsPreview kind="video" settings={{ ...DEFAULT_PREFERENCES, videoDisplay: 'translation', subtitleTranslationSize: 24, subtitleTranslationFirst: true }} t={t} />)
    expect(screen.queryByText(t('exampleText'))).not.toBeInTheDocument()
    expect(screen.getByText(browserText('zh-CN')('exampleText'))).toHaveStyle({ fontSize: '24px' })
  })
  it('keeps copy in the more menu and reflects its enabled setting', () => {
    const { rerender } = render(<SettingsPreview kind="selection" settings={DEFAULT_PREFERENCES} t={t} />)
    expect(screen.queryByRole('img', { name: t('copyTranslation') })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: t('more') }))
    expect(screen.getByRole('img', { name: t('copyTranslation') })).toBeInTheDocument()
    rerender(<SettingsPreview kind="selection" settings={{ ...DEFAULT_PREFERENCES, selectionCopy: false }} t={t} />)
    expect(screen.queryByRole('img', { name: t('copyTranslation') })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: t('close') }))
    expect(screen.getByRole('button', { name: t('more') })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('group', { name: t('more') })).not.toBeInTheDocument()
  })
})
