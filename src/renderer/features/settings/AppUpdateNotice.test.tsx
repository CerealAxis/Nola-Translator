import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { AppUpdateDialog } from './AppUpdateNotice'

afterEach(cleanup)

function renderNotes(releaseNotes: string) {
  return render(<AppUpdateDialog
    result={{ currentVersion: '1.1.0', latestVersion: '1.1.0', updateAvailable: false,
      releaseName: 'Nola Translator 1.1.0', releaseNotes,
      releaseUrl: 'https://github.com/CerealAxis/Nola-Translator/releases/tag/v1.1.0' }}
    isOpen isCurrentVersion isOpening={false} onOpenChange={() => undefined} onOpenRelease={() => undefined}
  />)
}

it('renders HTML contributor images and keeps executable HTML out of announcements', () => {
  renderNotes('<a href="https://github.com/CerealAxis/Nola-Translator/graphs/contributors"><img alt="Contributors" src="https://contrib.rocks/image?repo=CerealAxis/Nola-Translator" /></a>\n\n<script>alert(1)</script><img alt="Unsafe" src="javascript:alert(1)" onerror="alert(1)" />')
  expect(screen.getByRole('img', { name: 'Contributors' }).closest('a')).toHaveAttribute('href', 'https://github.com/CerealAxis/Nola-Translator/graphs/contributors')
  expect(document.querySelector('.app-update-markdown script')).toBeNull()
  expect(document.querySelector('.app-update-markdown [onerror]')).toBeNull()
  expect(document.querySelector('.app-update-markdown [src^="javascript:"]')).toBeNull()
})

it('shows a readable fallback when a remote image fails', () => {
  renderNotes('![Onboarding preview](https://github.com/user-attachments/assets/example)')
  fireEvent.error(screen.getByRole('img', { name: 'Onboarding preview' }))
  expect(screen.getByText('Onboarding preview')).toBeVisible()
  expect(document.querySelector('img[src="https://github.com/user-attachments/assets/example"]')).toBeNull()
})

it('allows remote announcement images without a domain allowlist', () => {
  const html = readFileSync('src/renderer/index.html', 'utf8')
  const policy = /img-src ([^;]+);/.exec(html)?.[1]?.split(/\s+/) ?? []
  expect(policy).toContain('https:')
  expect(policy).toContain('http:')
})
