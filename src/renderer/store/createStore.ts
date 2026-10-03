/**
 * 一个 `useSyncExternalStore` 之上的极小 store。零依赖，约 60 行。
 *
 * 为什么不是 zustand / valtio：
 * 这个应用的状态只有四个域（设置 / 记录 / 模型 / 会话），每个域都有一个异步动作层在管写。
 * 引入一个状态库之后我们会同时拥有两套"写"的入口（库的 set 与我们的动作），而乐观更新与
 * 回滚必须在同一个地方闭环。少一个依赖、少一处状态源，是这里唯一正确的选择。
 *
 * 为什么 selector 相等时不重渲染：
 * `useSyncExternalStore` 自己在重新渲染前会用 `Object.is` 比较新旧 snapshot，相等就跳过。
 * 所以"selector 相等不重渲染"不需要在这里手写，**前提是 selector 每次返回的值要么是原始值，
 * 要么是稳定引用**。返回一个每次都新建的对象/数组的 selector 会让 React 无限循环，请改成
 * 取其中的某个字段，或在 store 里预计算好。
 *
 * 同理，`setState` 每次都会产生新的 state 对象（浅合并的结果），没有"值没变就跳过"的短路。
 * 真正避免无谓渲染的是上面那条：selector 取到的值不变，组件就不会重渲染。
 */

import { useCallback, useSyncExternalStore } from 'react'

export type StoreListener = () => void
/**
 * updater 返回的是**局部更新**而不是整状态，这样调用点写 `{ resources: next }` 就行，
 * 不用先把整个 state 展开再写回去。返回值会被浅合并进当前 state。
 */
export type StoreUpdater<T> = (state: T) => Partial<T>
/** 允许传一个 patch（浅合并）或一个 updater。 */
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
 * 带 selector 的订阅。`store` 必须是稳定引用（模块级单例），否则每次渲染都会重建
 * subscribe/快照，React 会报 "The result of getSnapshot should be cached"。
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
 * 单写队列。同一时刻只有一个写操作在飞，后到的排队。
 *
 * 这不是"性能优化"，是正确性要求：乐观更新 + 回滚读的是同一份快照，两个写并发时
 * 后一个的回滚会把前一个的结果一起抹掉（"我刚改的开关自己弹回去了"）。主仓的
 * `MeetingStore.serialize()` 是同一个道理。
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
  /* 队列尾部故意吞掉错误：错误必须由调用方自己处理，不能变成 unhandled rejection。 */
}
