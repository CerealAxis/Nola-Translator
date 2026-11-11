import { expect, it, vi } from 'vitest'

it('provides Promise.withResolvers for PDF.js on older browsers', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(Promise, 'withResolvers')
  try {
    Reflect.deleteProperty(Promise, 'withResolvers')
    vi.resetModules()
    await import('./pdf-compat')
    const constructor = Promise as PromiseConstructor & { withResolvers<T>(): { promise: Promise<T>; resolve(value: T): void; reject(reason: unknown): void } }
    const resolved = constructor.withResolvers<string>()
    resolved.resolve('ready')
    await expect(resolved.promise).resolves.toBe('ready')
    const rejected = constructor.withResolvers<string>()
    rejected.reject(new Error('failed'))
    await expect(rejected.promise).rejects.toThrow('failed')
  } finally {
    if (descriptor) Object.defineProperty(Promise, 'withResolvers', descriptor)
    else Reflect.deleteProperty(Promise, 'withResolvers')
  }
})
