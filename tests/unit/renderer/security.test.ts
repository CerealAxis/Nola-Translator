import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('renderer content security policy', () => {
  const html = readFileSync(resolve(process.cwd(), 'src/renderer/index.html'), 'utf8')

  it('blocks remote scripts and unsafe evaluation', () => {
    expect(html).toContain('http-equiv="Content-Security-Policy"')
    expect(html).toContain("default-src 'self'")
    expect(html).toContain("script-src 'self'")
    expect(html).toContain("style-src 'self' 'unsafe-inline'")
    expect(html).not.toContain("script-src 'self' 'unsafe-inline'")
    expect(html).not.toContain("'unsafe-eval'")
  })

  it('locks down object, base and form targets', () => {
    expect(html).toContain("object-src 'none'")
    expect(html).toContain("base-uri 'none'")
    expect(html).toContain("form-action 'none'")
  })

  it('allows playback from the isolated meeting audio scheme', () => {
    expect(html).toContain("media-src 'self' nola-audio:")
  })

  it('keeps dev HMR reachable on localhost', () => {
    // electron-vite's dev HMR socket connects to `localhost`, not `127.0.0.1`, and a CSP
    // that misses it kills hot reload silently: no error, no red screen, just no refresh.
    expect(html).toContain('ws://localhost:*')
    expect(html).toContain('http://localhost:*')
    expect(html).not.toContain('127.0.0.1:*')
  })

  it('has no inline script — script-src self would block it silently', () => {
    // A CSP-blocked inline script fails silently: the build passes, the tests pass, and
    // only a console line at runtime says so.
    //
    // HTML comments are stripped first because a comment in the file quotes
    // `<script type="module">` as a counter-example, which would otherwise read as a hit.
    const markup = html.replace(/<!--[\s\S]*?-->/g, '')
    const inlineScripts = [...markup.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
      .filter(([, attributes, body]) => !/\bsrc\s*=/.test(attributes ?? '') && (body ?? '').trim().length > 0)
    expect(inlineScripts.map((match) => match[0].slice(0, 80))).toEqual([])
  })

  it('registers the Tailwind cascade layers before any other style', () => {
    // Tailwind v4 and HeroUI need the cascade layers registered up front. A feature
    // stylesheet that creates them first buries the base layer under components, silently.
    const layerIndex = html.indexOf('@layer properties, theme, base, components, utilities;')
    const firstStyleIndex = html.indexOf('<style>')
    expect(layerIndex).toBeGreaterThan(-1)
    expect(firstStyleIndex).toBeGreaterThan(-1)
    expect(layerIndex).toBeGreaterThan(firstStyleIndex)
  })
})
