export function parseOptionsRoute(hash: string): { section: string; libraryId?: string } {
  const [section, rawId] = hash.replace(/^#\/?/, '').split('/')
  if (section !== 'glossary' || !rawId) return { section }
  try { return { section, libraryId: decodeURIComponent(rawId) } }
  catch { return { section, libraryId: rawId } }
}
