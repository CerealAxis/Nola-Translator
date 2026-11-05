const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/CerealAxis/AppData/Local/Temp/nola-firefox-probe-d7a2683a/node_modules/playwright');

async function request(page, trackId) {
  return page.evaluate(trackId => new Promise((resolve, reject) => {
    const nonce = crypto.randomUUID();
    const timeout = setTimeout(() => { document.removeEventListener('nola-subtitles-response', receive); reject(new Error('Production bridge timed out')); }, 20000);
    function receive(event) {
      const response = JSON.parse(event.detail);
      if (response.nonce !== nonce) return;
      clearTimeout(timeout);
      document.removeEventListener('nola-subtitles-response', receive);
      resolve(response.value);
    }
    document.addEventListener('nola-subtitles-response', receive);
    document.dispatchEvent(new CustomEvent('nola-subtitles-request', { detail: JSON.stringify({ nonce, trackId }) }));
  }), trackId);
}

(async () => {
  const root = path.resolve(__dirname, '../..');
  const output = path.join(root, 'artifacts/bilibili-subtitle-extension-probe');
  await fs.mkdir(output, { recursive: true });
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'nola-bilibili-subtitles-'));
  const extension = path.join(temporary, 'extension');
  await fs.cp(path.join(root, 'browser/extension/dist'), extension, { recursive: true });
  const manifestBytes = await fs.readFile(path.join(extension, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  const context = await chromium.launchPersistentContext(path.join(temporary, 'profile'), {
    executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true, serviceWorkers: 'block', ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'], viewport: { width: 1280, height: 900 },
  });
  const result = { version: manifest.version, manifestUnchanged: true, pages: [], network: [] };
  try {
    const cdp = await context.browser().newBrowserCDPSession();
    result.extensionId = (await cdp.send('Extensions.loadUnpacked', { path: extension })).id;
    const page = await context.newPage();
    page.on('response', async response => {
      if (/\/x\/v2\/subtitle\/web\/view|aisubtitle\.hdslb\.com/.test(response.url())) {
        result.network.push({ url: response.url(), status: response.status() });
      }
    });
    for (const suffix of ['video/BV1QA411N7Vu/', 'video/BV1QA411N7Vu/?p=2', 'bangumi/play/ep30134']) {
      await page.goto('https://www.bilibili.com/' + suffix, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(5000);
      const row = { url: page.url(), metadata: await page.evaluate(() => {
        const state = window.__INITIAL_STATE__ || {};
        return { aid: state.aid, cid: state.cid, p: state.p, videoCid: state.videoData?.cid, epInfo: state.epInfo };
      }) };
      result.pages.push(row);
      row.tracks = await request(page);
      if (suffix.startsWith('video/')) {
        assert(Array.isArray(row.tracks), JSON.stringify(row.tracks));
        assert(row.tracks.some(track => track.language.startsWith('zh')), 'Chinese track missing');
        assert(row.tracks.some(track => track.language.startsWith('en')), 'English track missing');
        row.downloads = [];
        for (const track of row.tracks) {
          const cues = await request(page, track.id);
          assert(Array.isArray(cues) && cues.length > 0, JSON.stringify(cues));
          assert(cues.every(cue => typeof cue.text === 'string' && !cue.text.includes('\ufffd')), 'Invalid UTF-8 subtitle');
          if (track.language.startsWith('zh')) assert(cues.some(cue => /[\u3400-\u9fff]/u.test(cue.text)), 'Chinese body missing');
          row.downloads.push({ id: track.id, language: track.language, cueCount: cues.length, first: cues[0], last: cues.at(-1), replacements: 0 });
        }
      }
      await page.screenshot({ path: path.join(output, suffix.includes('?') ? 'p2.png' : suffix.startsWith('video') ? 'p1.png' : 'ep.png') });
      await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
      console.log(JSON.stringify({ url: row.url, metadata: row.metadata, tracks: Array.isArray(row.tracks) ? row.tracks.length : row.tracks, downloads: row.downloads?.map(({ language, cueCount }) => ({ language, cueCount })) }));
    }
    assert.notEqual(result.pages[0].metadata.cid, result.pages[1].metadata.cid, 'Part identity did not change');
    assert.deepEqual(await fs.readFile(path.join(extension, 'manifest.json')), manifestBytes);
    result.passed = true;
  } catch (error) {
    result.error = String(error.stack || error);
    process.exitCode = 1;
  } finally {
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
    await context.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
