import { glossaryDocumentSchema, type GlossaryDocument, type GlossaryMutation } from './glossary'
import { glossaryEntryKey } from './glossary-match'

function matchingContent(document: GlossaryDocument): string {
  return JSON.stringify({ enabled: document.enabled, libraries: document.libraries.map(({ name: _name, description: _description, ...library }) => library) })
}
export function validateGlossaryIdentities(document: GlossaryDocument): void {
  if (new Set(document.libraries.map(library => library.id)).size !== document.libraries.length) throw new Error('duplicate')
  const ids = new Set<string>()
  for (const library of document.libraries) {
    const keys = new Set<string>()
    for (const entry of library.entries) {
      const key = glossaryEntryKey(entry)
      if (ids.has(entry.id) || keys.has(key)) throw new Error('duplicate')
      ids.add(entry.id); keys.add(key)
    }
  }
}

export function applyGlossaryMutation(current: GlossaryDocument, request: GlossaryMutation): GlossaryDocument {
  if (request.expectedRevision !== current.revision) throw new Error('conflict')
  const document = structuredClone(current)
  const command = request.command
  if (command.action === 'setEnabled') document.enabled = command.enabled
  else if (command.action === 'saveLibrary') {
    const library = document.libraries.find(item => item.id === command.library.id)
    if (library) Object.assign(library, command.library)
    else {
      if (document.libraries.length >= 50) throw new Error('capReached')
      document.libraries.push({ ...command.library, entries: [] })
    }
  } else if (command.action === 'reorderLibraries') {
    if (new Set(command.libraryIds).size !== document.libraries.length || command.libraryIds.length !== document.libraries.length) throw new Error('invalid')
    document.libraries = command.libraryIds.map(id => {
      const library = document.libraries.find(item => item.id === id)
      if (!library) throw new Error('notFound')
      return library
    })
  } else {
    const library = document.libraries.find(item => item.id === command.libraryId)
    if (!library) throw new Error('notFound')
    if (command.action === 'deleteLibrary') document.libraries = document.libraries.filter(item => item !== library)
    else if (command.action === 'saveTerm') {
      const index = library.entries.findIndex(entry => entry.id === command.entry.id)
      if (index < 0) library.entries.push(command.entry)
      else library.entries[index] = command.entry
    } else if (command.action === 'importTerms') {
      library.entries = command.mode === 'replace' ? command.entries : [...library.entries, ...command.entries]
    } else {
      if (command.entryIds.some(id => !library.entries.some(entry => entry.id === id))) throw new Error('notFound')
      if (command.action === 'deleteTerms') library.entries = library.entries.filter(entry => !command.entryIds.includes(entry.id))
      else for (const entry of library.entries) if (command.entryIds.includes(entry.id)) entry.enabled = command.enabled
    }
  }
  document.revision++
  if (matchingContent(current) !== matchingContent(document)) document.matchingRevision++
  const parsed = glossaryDocumentSchema.parse(document)
  validateGlossaryIdentities(parsed)
  return parsed
}
