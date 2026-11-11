// Chrome 116 lacks Promise.withResolvers; PDF.js uses it in both the page and worker.
const promiseConstructor = Promise as PromiseConstructor & { withResolvers?: <T>() => { promise: Promise<T>; resolve: (value: T | PromiseLike<T>) => void; reject: (reason?: unknown) => void } }
if (!promiseConstructor.withResolvers) {
  Object.defineProperty(promiseConstructor, 'withResolvers', {
    configurable: true,
    writable: true,
    value<T>(this: PromiseConstructor) {
      let resolve!: (value: T | PromiseLike<T>) => void
      let reject!: (reason?: unknown) => void
      const promise = new this<T>((fulfill, fail) => { resolve = fulfill; reject = fail })
      return { promise, resolve, reject }
    },
  })
}
export {}
