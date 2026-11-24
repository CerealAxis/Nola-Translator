import { createContext, useContext, useState, type SetStateAction } from 'react'

// Dialog content unmounts on close. The active game page owns this in-memory cache.
export const ToolState = createContext<Map<string, unknown> | null>(null)
export function useToolState<T>(key: string, initial: T): [T, (action: SetStateAction<T>) => void] {
  const cache = useContext(ToolState)
  const [value, setValue] = useState<T>(() => (cache?.has(key) ? (cache.get(key) as T) : initial))
  return [
    value,
    (action) => {
      const current = cache?.has(key) ? (cache.get(key) as T) : value
      const next = typeof action === 'function' ? (action as (old: T) => T)(current) : action
      cache?.set(key, next)
      setValue(next)
    },
  ]
}
