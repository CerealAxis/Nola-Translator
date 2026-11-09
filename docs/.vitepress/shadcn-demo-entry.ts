export function shadcnDemoEntry() {
  return {
    name: 'nola-shadcn-demo-entry',
    enforce: 'pre' as const,
    transform(source: string, id: string) {
      const name = /\/vis\/demos\/shadcn-base\/([\w-]+)\.tsx$/.exec(id)?.[1]
      if (!name) return

      const defaultExport = /^export default function (\w+)/m.exec(source)?.[1]
      const rtl = name.endsWith('-rtl')
      if (defaultExport && !rtl) return

      const namedExports = [...source.matchAll(/^export function (\w+)/gm)].map(([, value]) => value)
      const matchingName = name.replaceAll('-', '').toLowerCase()
      const entry = defaultExport ?? namedExports.find(value => value.toLowerCase() === matchingName) ??
        (namedExports.length === 1 ? namedExports[0] : undefined)
      if (!entry) throw new Error(`Missing preview export in ${id}`)

      // The plugin mounts a default export. Adapt it without rewriting the upstream file.
      const code = source.replace(/^export default function /m, 'function ')
      if (!rtl) return { code: `${code}\nexport default ${entry}\n`, map: null }

      return {
        code: `${code}\nimport { withRtlExample } from '../../shadcn-base/rtl-example.jsx'\nexport default withRtlExample(${entry})\n`,
        map: null,
      }
    },
  }
}
