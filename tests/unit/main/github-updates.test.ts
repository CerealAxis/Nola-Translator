import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'

import { checkLatestRelease, fetchRecentReleases, isTrustedReleaseUrl } from '../../../src/main/github-updates'

function feed(tag: string, content = '<p>Feature release notes</p>'): string {
  const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<feed><entry><id>tag:github.com,2008:Repository/1/${tag}</id><title>${tag}</title><content type="html">${escaped}</content></entry></feed>`
}

let directory = ''
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true })
  directory = ''
})

it('returns a newer release and reuses the daily cache', async () => {
  directory = await mkdtemp(join(tmpdir(), 'nola-updates-'))
  const cachePath = join(directory, 'release.json')
  let requests = 0
  const fetcher: typeof fetch = async () => {
    requests += 1
    return new Response(feed('v1.1.0', '<h2>Highlights</h2><ul><li>Faster & better captions</li></ul>'), { status: 200 })
  }

  const first = await checkLatestRelease('1.0.3', cachePath, false, fetcher, 1_000_000)
  const second = await checkLatestRelease('1.0.3', cachePath, false, async () => {
    throw new Error('cache should avoid a second request')
  }, 1_000_001)

  expect(first?.latestVersion).toBe('1.1.0')
  expect(first?.updateAvailable).toBe(true)
  expect(first?.releaseNotes).toBe('Highlights\n• Faster & better captions')
  expect(second).toEqual(first)
  expect(requests).toBe(1)

  const forced = await checkLatestRelease('1.0.3', cachePath, true,
    async () => new Response(feed('v1.2.0'), { status: 200 }), 1_000_002)
  expect(forced.latestVersion).toBe('1.2.0')
})

it('does not announce equal, older, or malformed versions', async () => {
  directory = await mkdtemp(join(tmpdir(), 'nola-updates-'))
  const response = (tag: string): typeof fetch => async () => new Response(feed(tag), { status: 200 })

  expect((await checkLatestRelease('1.2.0', join(directory, 'equal.json'), false, response('v1.2.0'))).updateAvailable).toBe(false)
  expect((await checkLatestRelease('2.0.0', join(directory, 'older.json'), false, response('v1.9.9'))).updateAvailable).toBe(false)
  expect((await checkLatestRelease('1.0.0', join(directory, 'invalid.json'), false, response('nightly'))).latestVersion).toBeNull()
})

it('keeps the installed version when GitHub cannot be reached', async () => {
  directory = await mkdtemp(join(tmpdir(), 'nola-updates-'))
  const result = await checkLatestRelease('1.0.3', join(directory, 'offline.json'), true, async () => {
    throw new Error('network unavailable')
  })
  expect(result).toMatchObject({ currentVersion: '1.0.3', latestVersion: null, updateAvailable: false })
})

it('only opens release pages from the application repository', () => {
  expect(isTrustedReleaseUrl('https://github.com/CerealAxis/Nola-Translator/releases/tag/v1.2.0')).toBe(true)
  expect(isTrustedReleaseUrl('https://example.com/CerealAxis/Nola-Translator/releases/tag/v1.2.0')).toBe(false)
  expect(isTrustedReleaseUrl('https://github.com/other/repo/releases/tag/v1.2.0')).toBe(false)
})

it('selects the three newest published releases and preserves their Markdown', async () => {
  const publishedAt = '2026-11-01T09:00:00Z'
  const notes = '# Release notes\n\n' + 'Keep the original Markdown.\n'.repeat(800) + '\n## 原始公告\n'
  const release = (tag: string, body = '') => ({
    tag_name: tag, published_at: publishedAt, body,
    html_url: 'https://github.com/CerealAxis/Nola-Translator/releases/tag/' + tag,
  })
  const fetcher: typeof fetch = async url => {
    expect(url).toBe('https://api.github.com/repos/CerealAxis/Nola-Translator/releases?per_page=100')
    return Response.json([
      release('v1.3.0'),
      { ...release('v2.0.0'), draft: true },
      release('v1.2.0'),
      release('v1.10.0', notes),
      { ...release('v3.0.0'), html_url: 'https://example.com/release' },
      release('v1.5.0'),
      { ...release('v4.0.0'), published_at: null },
    ])
  }

  const announcements = await fetchRecentReleases(fetcher)

  expect(announcements.map(item => item.tag)).toEqual(['v1.10.0', 'v1.5.0', 'v1.3.0'])
  expect(announcements[0]).toEqual({
    tag: 'v1.10.0', publishedAt, notes,
    url: 'https://github.com/CerealAxis/Nola-Translator/releases/tag/v1.10.0',
  })
  await expect(fetchRecentReleases(async () => new Response(null, { status: 403 }))).rejects.toThrow('403')
})
