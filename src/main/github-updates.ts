import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { AppUpdateCheckResult } from '../shared/app-updates'

const RELEASE_FEED = 'https://github.com/CerealAxis/Nola-Translator/releases.atom'
const RELEASE_PAGE_PREFIX = 'https://github.com/CerealAxis/Nola-Translator/releases/tag/'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

interface ReleaseMetadata {
  tag: string
  name: string
  notes: string
  url: string
}

interface ReleaseCache {
  checkedAt: number
  release: ReleaseMetadata
}

function parseVersion(value: string): { parts: number[]; prerelease: boolean } | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value.trim())
  if (!match) return null
  return { parts: [Number(match[1]), Number(match[2]), Number(match[3])], prerelease: Boolean(match[4]) }
}

function isNewer(candidate: string, current: string): boolean {
  const next = parseVersion(candidate)
  const installed = parseVersion(current)
  if (!next || !installed) return false
  for (let index = 0; index < next.parts.length; index += 1) {
    if (next.parts[index] !== installed.parts[index]) return next.parts[index]! > installed.parts[index]!
  }
  return installed.prerelease && !next.prerelease
}

function releaseMetadata(value: unknown): ReleaseMetadata | null {
  if (!value || typeof value !== 'object') return null
  const release = value as Record<string, unknown>
  if (typeof release.tag_name !== 'string' || !parseVersion(release.tag_name)) return null
  const releaseUrl = typeof release.html_url === 'string' ? release.html_url : ''
  if (!releaseUrl.startsWith(RELEASE_PAGE_PREFIX)) return null
  return {
    tag: release.tag_name,
    name: typeof release.name === 'string' && release.name.trim() ? release.name.trim() : release.tag_name,
    notes: typeof release.body === 'string' ? release.body.slice(0, 20_000) : '',
    url: releaseUrl,
  }
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_entity, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([\da-f]+);/gi, (_entity, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
}

function releaseNotesFromHtml(html: string): string {
  return decodeEntities(html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<\/(?:p|h[1-6]|li|div|ul|ol|blockquote)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/[\t ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 20_000)
}

function releaseFromFeed(xml: string): ReleaseMetadata | null {
  const entry = /<entry\b[^>]*>([\s\S]*?)<\/entry>/.exec(xml)?.[1]
  if (!entry) return null
  const tag = /<id\b[^>]*>([\s\S]*?)<\/id>/.exec(entry)?.[1]?.split('/').at(-1)
  if (!tag || !parseVersion(tag)) return null
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/.exec(entry)?.[1]
  const content = /<content\b[^>]*>([\s\S]*?)<\/content>/.exec(entry)?.[1]
  return {
    tag,
    name: title ? decodeEntities(title).trim() : tag,
    notes: content ? releaseNotesFromHtml(content) : '',
    url: `${RELEASE_PAGE_PREFIX}${encodeURIComponent(tag)}`,
  }
}

function cachedMetadata(value: unknown): ReleaseCache | null {
  if (!value || typeof value !== 'object') return null
  const cache = value as Record<string, unknown>
  if (typeof cache.checkedAt !== 'number' || !Number.isFinite(cache.checkedAt)) return null
  const release = cache.release as Record<string, unknown> | undefined
  if (!release || typeof release !== 'object'
    || typeof release.tag !== 'string' || typeof release.name !== 'string'
    || typeof release.notes !== 'string' || typeof release.url !== 'string') return null
  const metadata = releaseMetadata({ tag_name: release.tag, name: release.name, body: release.notes, html_url: release.url })
  return metadata ? { checkedAt: cache.checkedAt, release: metadata } : null
}

async function readCache(path: string, now: number): Promise<ReleaseMetadata | null> {
  try {
    const parsed = cachedMetadata(JSON.parse(await readFile(path, 'utf8')) as unknown)
    return parsed && now - parsed.checkedAt >= 0 && now - parsed.checkedAt < CACHE_TTL_MS ? parsed.release : null
  } catch {
    return null
  }
}

async function writeCache(path: string, cache: ReleaseCache): Promise<void> {
  try {
    await mkdir(dirname(path), { recursive: true })
    const temporary = `${path}.tmp`
    await writeFile(temporary, JSON.stringify(cache), 'utf8')
    await rename(temporary, path)
  } catch {
    // A read-only data root should not prevent the application from checking GitHub.
  }
}

/** Checks the stable GitHub release, cached for one day to avoid repeated anonymous API calls. */
export async function checkLatestRelease(
  currentVersion: string,
  cachePath: string,
  force = false,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
): Promise<AppUpdateCheckResult> {
  let release = force ? null : await readCache(cachePath, now)
  if (!release) {
    try {
      const response = await fetcher(RELEASE_FEED, {
        headers: { Accept: 'application/atom+xml' },
        signal: AbortSignal.timeout(8_000),
      })
      if (!response.ok) return unavailable(currentVersion)
      release = releaseFromFeed(await response.text())
      if (!release) return unavailable(currentVersion)
      await writeCache(cachePath, { checkedAt: now, release })
    } catch {
      return unavailable(currentVersion)
    }
  }
  const updateAvailable = isNewer(release.tag, currentVersion)
  return {
    currentVersion,
    latestVersion: release.tag,
    updateAvailable,
    releaseName: release.name,
    releaseNotes: release.notes,
    releaseUrl: release.url,
  }
}

function unavailable(currentVersion: string): AppUpdateCheckResult {
  return { currentVersion, latestVersion: null, updateAvailable: false, releaseName: null, releaseNotes: '', releaseUrl: null }
}

/** Accepts only release pages from the product's own GitHub repository. */
export function isTrustedReleaseUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'github.com'
      && url.pathname.startsWith('/CerealAxis/Nola-Translator/releases/tag/')
      && !url.username && !url.password
  } catch {
    return false
  }
}
