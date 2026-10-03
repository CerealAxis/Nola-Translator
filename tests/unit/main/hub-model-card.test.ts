import { describe, expect, it, vi } from 'vitest'
import { modelCardExcerpt, readHubModelCard } from '../../../src/main/hub-model-card'

describe('Hugging Face README excerpts', () => {
  it('extracts the introduction without YAML, badges, headings, code or HTML', () => {
    const card = `---\nlanguage: en\nlicense: mit\n---\n# Speech model\n\n![badge](https://example.com/image)\n\n<!-- hidden instructions -->\n<script>bad script content</script>\n\nThis model recognizes **speech** in multiple languages. Read the [paper](https://example.com).\n\n\`\`\`python\nprint('example')\n\`\`\``
    expect(modelCardExcerpt(card)).toBe('This model recognizes speech in multiple languages. Read the paper.')
  })

  it('uses a pinned README URL and shares concurrent fetches for the same card', async () => {
    const revision = 'a'.repeat(40)
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => new Response('This is an introduction from the real model card.'))
    const [first, second] = await Promise.all([
      readHubModelCard('test/shared-card', revision, fetcher),
      readHubModelCard('test/shared-card', revision, fetcher),
    ])
    expect(first).toBe(second)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0][0]).toContain(`/raw/${revision}/README.md`)
  })

  it('rejects arbitrary URLs before fetching', async () => {
    const fetcher = vi.fn()
    await expect(readHubModelCard('https://example.com/private', undefined, fetcher)).rejects.toThrow()
    await expect(readHubModelCard('test/card', '../secret', fetcher)).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('treats missing cards as absent introductions', async () => {
    expect(await readHubModelCard('test/no-card', undefined, async () => new Response('', { status: 404 }))).toBe('')
  })
})
