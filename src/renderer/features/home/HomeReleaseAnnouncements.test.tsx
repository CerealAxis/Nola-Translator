import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import * as store from '@/store'
import type { NolaBridge } from '@/bridge'
import { HomeReleaseAnnouncements } from './HomeReleaseAnnouncements'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('opens the selected release with its complete bilingual Markdown and GitHub link', async () => {
  const firstUrl = 'https://github.com/CerealAxis/Nola-Translator/releases/tag/v1.2.2'
  const secondUrl = 'https://github.com/CerealAxis/Nola-Translator/releases/tag/v1.2.1'
  const openReleasePage = vi.fn().mockResolvedValue(undefined)
  vi.spyOn(store, 'getBridge').mockReturnValue({ app: {
    listRecentReleases: async () => [
      { tag: 'v1.2.2', publishedAt: '2026-11-02T09:00:00Z', notes: '# First release', url: firstUrl },
      {
        tag: 'v1.2.1', publishedAt: '2026-11-01T09:00:00Z', url: secondUrl,
        notes: '# Second release\n\nEnglish notes.\n\n# 第二版\n\n中文公告。',
      },
    ],
    openReleasePage,
  } } as unknown as NolaBridge)

  render(<HomeReleaseAnnouncements />)
  fireEvent.click(await screen.findByRole('button', { name: '打开公告 v1.2.1' }))

  const dialog = within(await screen.findByRole('dialog', { name: 'v1.2.1 更新公告' }))
  expect(dialog.getByRole('heading', { name: 'Second release' })).toBeVisible()
  expect(dialog.getByRole('heading', { name: '第二版' })).toBeVisible()
  expect(dialog.queryByText('First release')).toBeNull()
  fireEvent.click(dialog.getByRole('button', { name: '在 GitHub 查看' }))
  await waitFor(() => expect(openReleasePage).toHaveBeenCalledWith(secondUrl))
})

it('starts the tutorial again from the release announcement', async () => {
  vi.spyOn(store, 'getBridge').mockReturnValue({ app: { listRecentReleases: async () => [
    { tag: 'v1', publishedAt: '2026-11-02T09:00:00Z', notes: 'Notes', url: 'https://github.com/example/release' },
  ] } } as unknown as NolaBridge)
  const start = vi.spyOn(store.actions.settings, 'startOnboarding').mockReturnValue(true)
  render(<HomeReleaseAnnouncements />)
  fireEvent.click(await screen.findByRole('button', { name: '打开公告 v1' }))
  fireEvent.click(await screen.findByRole('button', { name: '再次查看教程' }))
  expect(start).toHaveBeenCalledWith('welcome')
})
