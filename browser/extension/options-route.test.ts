import { expect, it } from 'vitest'
import { parseOptionsRoute } from './options-route'

it('preserves glossary details and safely handles malformed deep links', () => {
  expect(parseOptionsRoute('#glossary/library')).toEqual({ section: 'glossary', libraryId: 'library' })
  expect(parseOptionsRoute('#glossary')).toEqual({ section: 'glossary' })
  expect(parseOptionsRoute('#glossary/%zz')).toEqual({ section: 'glossary', libraryId: '%zz' })
  expect(parseOptionsRoute('#web')).toEqual({ section: 'web' })
})
