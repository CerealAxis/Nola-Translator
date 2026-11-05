const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

async function main() {
  const browserName = /msedge/i.test(process.env.PLATFORM_BROWSER || 'msedge') ? 'edge' : 'chrome'
  const root = path.resolve(__dirname, '../..'), output = path.join(root, 'artifacts/platform-subtitle-smoke', browserName)
  await fs.mkdir(output, { recursive: true })
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nola-platform-fixtures-'))
  const extension = path.join(directory, 'extension')
  await fs.cp(path.join(root, 'browser/extension/dist'), extension, { recursive: true })
  const manifest = await fs.readFile(path.join(extension, 'manifest.json'), 'utf8')
  const context = await chromium.launchPersistentContext(path.join(directory, 'profile'), {
    executablePath: process.env.PLATFORM_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, serviceWorkers: 'block', ignoreDefaultArgs: ['--disable-extensions'], args: ['--enable-unsafe-extension-debugging'], viewport: { width: 1280, height: 900 },
  })
  const result = { browser: browserName, version: JSON.parse(manifest).version, fixtureOnly: true, originalManifest: true, checks: [], errors: [], consoleErrors: [], requests: [] }
  const observe = page => {
    page.on('pageerror', error => result.errors.push({ url: page.url(), message: error.message }))
    page.on('console', message => { if (message.type() === 'error') result.consoleErrors.push({ url: page.url(), message: message.text(), location: message.location() }) })
    page.on('request', request => result.requests.push(request.url()))
  }
  const request = (page, trackId) => page.evaluate(trackId => new Promise((resolve, reject) => {
    const nonce = crypto.randomUUID(), start = performance.now()
    const timer = setTimeout(() => { document.removeEventListener('nola-subtitles-response', receive); reject(Error('Subtitle bridge timed out')) }, 25000)
    function receive(event) { const message = JSON.parse(event.detail); if (message.nonce !== nonce) return; clearTimeout(timer); document.removeEventListener('nola-subtitles-response', receive); resolve({ value: message.value, elapsedMs: Math.round(performance.now() - start) }) }
    document.addEventListener('nola-subtitles-response', receive)
    document.dispatchEvent(new CustomEvent('nola-subtitles-request', { detail: JSON.stringify({ nonce, trackId }) }))
  }), trackId)
  try {
    const cdp = await context.browser().newBrowserCDPSession()
    result.extension = (await cdp.send('Extensions.loadUnpacked', { path: extension })).id
    const netflix = await context.newPage(); observe(netflix)
    await netflix.addInitScript(() => {
      const off = { trackId: 'off', isNoneTrack: true }, en = { trackId: 'en', bcp47: 'en' }, ja = { trackId: 'ja', bcp47: 'ja' }
      window.__fixture = { movie: 100, selected: off }
      const player = { getMovieId: () => window.__fixture.movie, getAudioTrack: () => ({ bcp47: 'ja-JP' }), getTimedTextTrack: () => window.__fixture.selected, getTimedTextTrackList: () => [off, en, ja], setTimedTextTrack: track => { window.__fixture.selected = track } }
      window.netflix = { appContext: { state: { playerApp: { getAPI: () => ({ videoPlayer: { getAllPlayerSessionIds: () => ['watch'], getVideoPlayerBySessionId: () => player } }) } } } }
    })
    await netflix.route('https://www.netflix.com/**', route => {
      const url = new URL(route.request().url())
      if (url.pathname.startsWith('/manifest/')) {
        const movie = Number(url.pathname.split('/').pop())
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ result: { movieId: movie, textTracks: ['en', 'ja'].map(id => ({ id, downloadables: { ttml: { urls: [{ url: `https://cdn.nflxvideo.net/fixture-${movie}/${id}` }] } } })) } }) })
      }
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><h1>Netflix fixture — not a real streaming session</h1><div class="watch-video"><video style="width:640px;height:360px"></video></div></body></html>' })
    })
    await netflix.route('https://cdn.nflxvideo.net/**', route => {
      const url = new URL(route.request().url()), movie = /fixture-(\d+)/.exec(url.pathname)[1]
      return route.fulfill({ contentType: 'application/ttml+xml', body: `<tt><body><p begin="10000000" end="30000000">Fixture movie ${movie} ${url.pathname.split('/').pop()}</p></body></tt>` })
    })
    await netflix.goto('https://www.netflix.com/watch/100')
    await netflix.evaluate(async () => { for (const id of [101, 100]) JSON.parse(await (await fetch('/manifest/' + id)).text()) })
    result.netflixTracks = await request(netflix)
    assert.deepEqual(result.netflixTracks.value.map(track => track.id), ['netflix:100:ja', 'netflix:100:en'])
    result.netflixCues = await request(netflix, 'netflix:100:ja')
    assert.deepEqual(result.netflixCues.value, [{ start: 1, end: 3, text: 'Fixture movie 100 ja' }])
    assert.equal(await netflix.evaluate(() => window.__fixture.selected.trackId), 'ja')
    await netflix.evaluate(() => document.dispatchEvent(new CustomEvent('nola-subtitles-restore')))
    assert.equal(await netflix.evaluate(() => window.__fixture.selected.trackId), 'off')
    result.checks.push('Netflix audio-language selection, mapped manifest TTML ticks, restore off')
    await netflix.evaluate(() => { history.replaceState({}, '', '/watch/101'); window.__fixture.movie = 101 })
    result.netflixNextTracks = await request(netflix)
    assert(result.netflixNextTracks.value.every(track => track.id.startsWith('netflix:101:')))
    assert.equal((await request(netflix, 'netflix:100:ja')).value, null)
    result.netflixNextCues = await request(netflix, 'netflix:101:en')
    assert.deepEqual(result.netflixNextCues.value, [{ start: 1, end: 3, text: 'Fixture movie 101 en' }])
    await netflix.evaluate(() => document.dispatchEvent(new CustomEvent('nola-subtitles-restore')))
    assert.equal(await netflix.evaluate(() => window.__fixture.selected.trackId), 'off')
    result.checks.push('Netflix prefetched next movie isolated; old track rejected after SPA switch')
    await netflix.screenshot({ path: path.join(output, 'netflix-fixture.png') })

    const x = await context.newPage(); observe(x)
    const tweet = (id, media) => ({ __typename: 'Tweet', rest_id: id, legacy: { full_text: 'Fixture post', extended_entities: { media: [{ media_key: '7_' + media, ...(id === '100' ? { subtitles: [{ language_code: 'en', url: 'https://video.twimg.com/' + media + '/direct.vtt' }] } : { video_info: { variants: [{ content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/' + media + '/master.m3u8' }] } }) }] } } })
    await x.route('https://x.com/**', route => {
      if (new URL(route.request().url()).pathname === '/fixture/graphql') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: [tweet('100', '111'), tweet('200', '222')] }) })
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><h1>X fixture — not real posts</h1>' + ['100', '200'].map(id => `<article><a href="https://x.com/fixture/status/${id}"><time>Fixture ${id}</time></a><div data-testid="videoComponent"><video style="width:320px;height:180px" poster="https://video.twimg.com/${id === '100' ? '111' : '222'}/poster.jpg"></video><button id="focus-${id}">Select fixture ${id}</button></div></article>`).join('') + '</body></html>' })
    })
    await x.route('https://video.twimg.com/**', route => {
      const url = new URL(route.request().url())
      if (url.pathname.endsWith('/master.m3u8')) return route.fulfill({ contentType: 'application/vnd.apple.mpegurl', body: '#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,NAME="English fixture",LANGUAGE="en",URI="subs.m3u8"' })
      if (url.pathname.endsWith('/subs.m3u8')) return route.fulfill({ contentType: 'application/vnd.apple.mpegurl', body: '#EXTM3U\n#EXTINF:2,\npart.vtt\n#EXT-X-ENDLIST' })
      if (url.pathname.endsWith('.vtt')) return route.fulfill({ contentType: 'text/vtt', body: 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nFixture post ' + (url.pathname.includes('/111/') ? '100' : '200') + '\n' })
      return route.fulfill({ status: 204, body: '' })
    })
    await x.goto('https://x.com/fixture/status/100')
    await x.evaluate(async () => { await (await fetch('/fixture/graphql')).json() }); await x.waitForTimeout(250)
    result.xFirstTracks = await request(x); assert.equal(result.xFirstTracks.value.length, 1)
    const firstId = result.xFirstTracks.value[0].id
    result.xFirstCues = await request(x, firstId)
    assert.deepEqual(result.xFirstCues.value, [{ start: 1, end: 3, text: 'Fixture post 100' }])
    await x.locator('#focus-200').focus()
    result.xSecondTracks = await request(x); assert.equal(result.xSecondTracks.value.length, 1)
    assert.notEqual(result.xSecondTracks.value[0].id, firstId)
    assert.equal((await request(x, firstId)).value, null)
    result.xSecondCues = await request(x, result.xSecondTracks.value[0].id)
    assert.deepEqual(result.xSecondCues.value, [{ start: 1, end: 3, text: 'Fixture post 200' }])
    await x.evaluate(() => { document.activeElement?.blur(); history.replaceState({}, '', '/fixture/status/200') })
    result.xSpaTracks = await request(x); assert.equal(result.xSpaTracks.value.length, 1)
    result.xSpaCues = await request(x, result.xSpaTracks.value[0].id)
    assert.deepEqual(result.xSpaCues.value, [{ start: 1, end: 3, text: 'Fixture post 200' }])
    assert.equal((await request(x, firstId)).value, null)
    result.checks.push('X selected post isolation, GraphQL direct track, owned HLS master and VTT fragment')
    await x.screenshot({ path: path.join(output, 'x-fixture.png') })
    assert.equal(await fs.readFile(path.join(extension, 'manifest.json'), 'utf8'), manifest)
    assert.deepEqual(result.errors, []); assert.deepEqual(result.consoleErrors, [])
    result.passed = true
  } catch (error) { result.failure = String(error); process.exitCode = 1 }
  finally { await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2)); await context.close() }
  console.log(JSON.stringify(result))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
