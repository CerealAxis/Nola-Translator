/**
 * A minimal `useSyncExternalStore`, no dependencies. An equal selector does not
 * re-render because `useSyncExternalStore` compares snapshots with `Object.is` —
 * provided the selector returns a stable reference, not a new object each call.
 */

import { useCallback, useSyncExternalStore } from 'react'

export type StoreListener = () => void
/**
 * The updater returns a partial, not a whole state, so a call site writes
 * `{ resources: next }` instead of spreading and writing back. The result is
 * shallow-merged into the current state.
 */
export type StoreUpdater<T> = (state: T) => Partial<T>
/** Either a patch, shallow-merged into the state, or an updater. */
export type StorePatch<T> = Partial<T> | StoreUpdater<T>

export interface Store<T extends object> {
  getState: () => T
  setState: (patch: StorePatch<T>) => T
  subscribe: (listener: StoreListener) => () => void
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial
  const listeners = new Set<StoreListener>()

  const getState = (): T => state

  const setState = (patch: StorePatch<T>): T => {
    const partial = typeof patch === 'function' ? (patch as StoreUpdater<T>)(state) : patch
    state = { ...state, ...partial }
    for (const listener of [...listeners]) listener()
    return state
  }

  const subscribe = (listener: StoreListener): (() => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  return { getState, setState, subscribe }
}

/**
 * Subscribes with a selector. `store` must be a stable reference (a module-level
 * singleton), or every render rebuilds the subscription and snapshot and React
 * reports "The result of getSnapshot should be cached".
 */
export function useStore<T extends object, S>(store: Store<T>, selector: (state: T) => S): S {
  const subscribe = useCallback(
    (listener: StoreListener) => store.subscribe(listener),
    [store],
  )
  const getSnapshot = useCallback(() => selector(store.getState()), [store, selector])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Single-writer queue: one write in flight at a time, later ones wait.
 *
 * Optimistic updates and their rollback read the same snapshot, so two
 * concurrent writes let the second rollback erase the first result.
 */
export function createWriteQueue(): <T>(task: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve()
  return <T,>(task: () => Promise<T>): Promise<T> => {
    const next = tail.then(task, task)
    tail = next.then(noop, noop)
    return next
  }
}

function noop(): void {
}
