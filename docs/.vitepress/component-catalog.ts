import { visSidebar } from './vis-sidebar.ts'

const sections = visSidebar[0].items?.find(item => item.text === '组件')?.items

function listComponents(section: string) {
  const items = sections?.find(item => item.text === section)?.items
  if (!items) throw new Error(`Missing component documentation section: ${section}`)

  return items.map(({ text, link }) => {
    if (!text || !link?.startsWith('/vis/components/')) {
      throw new Error(`Invalid component documentation link: ${link}`)
    }
    const path = link.slice('/vis/components/'.length)
    return { title: text, href: link, path, slug: path.split('/').at(-1) }
  }).sort((a, b) => a.title.split('（', 1)[0].localeCompare(
    b.title.split('（', 1)[0], 'en', { sensitivity: 'base' },
  ))
}

export const componentCatalog = {
  shadcn: listComponents('shadcn 组件'),
  'assistant-ui': listComponents('assistant-ui 组件'),
}
