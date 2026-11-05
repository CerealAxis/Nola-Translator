import { expect, it } from 'vitest'
import { readPageContext } from './page-context'
it('sends article context without editable drafts, hidden data or extension results', () => {
  const document = new DOMParser().parseFromString('<main><p>Article text</p><form><textarea>Private draft</textarea></form><div contenteditable="true">Unsent draft</div><script>secret()</script><span hidden>Hidden</span><span data-nola-translation>Result</span></main>', 'text/html')
  expect(readPageContext(document)).toBe('Article text')
})
