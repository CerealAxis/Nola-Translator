/**
 * 数据访问层的对外出口。
 *
 * 组件只从 `@/bridge` 拿东西，不碰这个文件夹里的任何实现。原型阶段
 * `createMockBridge()` 与 `createIpcBridge()` 由 `main.tsx` 二选一，迁回主仓后只剩后者 ——
 * mock 那一整套（`mockBridge` / `fixtures` / `engineSimulator`）连同 `export.test.ts`
 * 一起删除，「界面分不清自己在跟 mock 还是真引擎说话」这个隔离依然由 `contract.ts` 保证。
 */

export * from './types'
export * from './contract'

export { createIpcBridge, isIpcBridgeAvailable } from './ipc/ipcBridge'
