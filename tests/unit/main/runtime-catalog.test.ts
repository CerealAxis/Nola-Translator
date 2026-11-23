import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runtimePackageSchema, runtimeRecipeSchema } from '../../../src/shared/compute'

describe('shipped component catalogs', () => {
  it('validates every downloadable combination, including artifact checksums', () => {
    const recipes = JSON.parse(readFileSync(resolve('build/runtime-recipes.json'), 'utf8')).recipes
    const packages = JSON.parse(readFileSync(resolve('build/runtime-catalog.json'), 'utf8')).packages
    expect(recipes.length).toBe(124)
    expect(packages.length).toBe(7)
    for (const recipe of recipes) runtimeRecipeSchema.parse(recipe)
    for (const item of packages) runtimePackageSchema.parse(item)
    expect(new Set(recipes.map((r: { id: string }) => r.id)).size).toBe(recipes.length)
    expect(packages.flatMap((p: { companions?: unknown[] }) => p.companions ?? [])).toHaveLength(2)
  })
})
