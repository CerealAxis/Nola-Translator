import { readFile, writeFile } from 'node:fs/promises'

const sitemap = new URL('../dist/sitemap.xml', import.meta.url)
const xml = await readFile(sitemap, 'utf8')
const declarationEnd = xml.indexOf('?>') + 2
if (!xml.startsWith('<?xml ') || declarationEnd < 2) throw new Error('Missing sitemap XML declaration')

const stylesheet = '<?xml-stylesheet type="text/css" href="sitemap.css"?>'
await writeFile(sitemap, `${xml.slice(0, declarationEnd)}\n${stylesheet}\n${xml.slice(declarationEnd)}`)
