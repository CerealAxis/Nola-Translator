import { expect, it } from 'vitest'

import { settingsPatchSchema } from '../../../src/main/settings-schema'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'

/**
 * The nested patch objects strip unknown keys instead of rejecting them, so a field added to
 * `OverlaySettings` but forgotten here is dropped in silence: the renderer sends it, the main
 * process discards it, and the setting appears to do nothing. `DEFAULT_SETTINGS` is typed as
 * `AppSettings`, so `tsc` rejects a default for a field the type does not declare; these assertions
 * close the other direction, where the schema is the side that fell behind.
 */
const roundTrip = (section: 'overlay' | 'recognition' | 'translation'): string[] => {
  const full = DEFAULT_SETTINGS[section] as Record<string, unknown>
  const parsed = settingsPatchSchema.parse({ [section]: full })
  return Object.keys((parsed[section] ?? {}) as Record<string, unknown>).sort()
}

it('keeps every overlay field in the defaults writable through the patch schema', () => {
  expect(roundTrip('overlay')).toEqual(Object.keys(DEFAULT_SETTINGS.overlay).sort())
})

it('keeps every recognition field in the defaults writable through the patch schema', () => {
  expect(roundTrip('recognition')).toEqual(Object.keys(DEFAULT_SETTINGS.recognition).sort())
})

it('keeps every translation field in the defaults writable through the patch schema', () => {
  expect(roundTrip('translation')).toEqual(Object.keys(DEFAULT_SETTINGS.translation).sort())
})

it('round-trips the caption layout, which is what the overlay popover writes', () => {
  const parsed = settingsPatchSchema.parse({ overlay: { layout: 'sentence' } })
  expect(parsed.overlay).toEqual({ layout: 'sentence' })
  expect(settingsPatchSchema.parse({ overlay: { layout: 'rolling' } }).overlay).toEqual({ layout: 'rolling' })
})

it('rejects a layout outside the declared union', () => {
  expect(() => settingsPatchSchema.parse({ overlay: { layout: 'columns' } })).toThrow()
})
