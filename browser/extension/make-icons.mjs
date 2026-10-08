/**
 * Renders `assets/brand/nola-logo.svg` into the raster sizes Chrome can actually load, and emits the
 * same logo as a React component.
 *
 * Chrome refuses SVG in `icons` and `action.default_icon`, so the shipped assets are PNGs derived
 * from the logo rather than the logo itself. They are generated instead of hand-drawn so a logo
 * change is one command away from reaching the extension.
 *
 *   node browser/extension/make-icons.mjs
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const logoPath = resolve(root, '../../assets/brand/nola-logo.svg')
const outDir = resolve(root, 'icons')

const SIZES = [16, 24, 32, 48, 128]

function findBrowser() {
  const override = process.env.CHROME_PATH
  if (override) return override
  const candidates = [
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && join(process.env['PROGRAMFILES(X86)'], 'Google/Chrome/Application/chrome.exe'),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, 'Microsoft/Edge/Application/msedge.exe'),
    process.env['PROGRAMFILES(X86)'] && join(process.env['PROGRAMFILES(X86)'], 'Microsoft/Edge/Application/msedge.exe'),
  ].filter(Boolean)
  return candidates.find(path => existsSync(path))
}

/**
 * A viewport screenshot is only a crop, so the logo is loaded through an `<img>` stretched to the
 * exact pixel box Chrome was given. Sizing the SVG element itself would leave its intrinsic 256px
 * canvas in place and clip anything smaller.
 */
function pageFor(size, logoUrl) {
  return `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent;width:${size}px;height:${size}px;overflow:hidden}img{display:block;width:${size}px;height:${size}px}</style><img src="${logoUrl}">`
}

/**
 * React names SVG properties in camelCase and silently drops the hyphenated spelling it does not
 * recognise, which would leave the mark's strokes hairline-thin. Only names are rewritten; values
 * such as `url(#blue)` and the path data are left exactly as the source wrote them.
 */
const REACT_ATTRIBUTE_NAMES = { class: 'className', for: 'htmlFor', 'xlink:href': 'xlinkHref' }
function toReactAttributes(markup) {
  return markup.replace(/(\s)([a-zA-Z][a-zA-Z0-9]*(?:[:-][a-zA-Z0-9]+)+)(?==)/g, (_, space, name) => {
    const react = REACT_ATTRIBUTE_NAMES[name] ?? name.replace(/-+([a-zA-Z])/g, (_, c) => c.toUpperCase())
    return `${space}${react}`
  })
}

/**
 * Reads the brand mark as a React component so the trigger button paints the same artwork the
 * packaged icons are rasterized from. The source's `title`, `desc` and `role` describe the mark
 * itself, while the control hosting it carries the accessible name.
 */
function logoModule(source) {
  const viewBox = source.match(/viewBox="([^"]+)"/)?.[1]
  if (!viewBox) throw new Error(`No viewBox on ${logoPath}`)
  const body = toReactAttributes(source)
    .replace(/<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/<title[\s\S]*?<\/title>/g, '')
    .replace(/<desc[\s\S]*?<\/desc>/g, '')
    .replace(/<!--([\s\S]*?)-->/g, (_, text) => `{/* ${text.replace(/\s+/g, ' ').trim()} */}`)
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => `      ${line}`)
    .join('\n')
  return `// Generated from assets/brand/nola-logo.svg by make-icons.mjs. Do not edit by hand.
import type { SVGProps } from 'react'

export interface NolaLogoProps extends SVGProps<SVGSVGElement> {}

export function NolaLogo(props: NolaLogoProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none" aria-hidden="true" {...props}>
${body}
    </svg>
  )
}
`
}

function render(browser, size, logoUrl, target) {
  const page = join(tmpdir(), `nola-icon-${process.pid}-${size}.html`)
  writeFileSync(page, pageFor(size, logoUrl))
  try {
    execFileSync(browser, [
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--default-background-color=00000000',
      '--force-device-scale-factor=1',
      `--window-size=${size},${size}`,
      `--screenshot=${target}`,
      pathToFileURL(page).href,
    ], { stdio: 'ignore', timeout: 60_000 })
  } finally {
    rmSync(page, { force: true })
  }
  if (!existsSync(target)) throw new Error(`Chrome produced no output for ${size}px (set CHROME_PATH to override the browser)`)
  return readFileSync(target)
}

const logoSource = readFileSync(logoPath, 'utf8')
const logoFile = resolve(root, 'logo.tsx')
writeFileSync(logoFile, logoModule(logoSource))
console.log(`logo.tsx  ${logoSource.length} bytes of source SVG`)

const browser = findBrowser()
if (!browser) throw new Error('No Chrome or Edge found. Set CHROME_PATH to a Chrome/Edge executable.')

mkdirSync(outDir, { recursive: true })
const logoUrl = pathToFileURL(logoPath).href
for (const size of SIZES) {
  const target = join(outDir, `icon-${size}.png`)
  const png = render(browser, size, logoUrl, target)
  writeFileSync(target, png)
  console.log(`icon-${size}.png  ${size}x${size}  ${png.length} bytes`)
}