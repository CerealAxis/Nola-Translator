/**
 * The public exit of the data-access layer. `createIpcBridge()` is the only
 * production implementation, and `contract.ts` is the interface both it and any
 * other implementation have to satisfy.
 */

export * from './types'
export * from './contract'

export { createIpcBridge, isIpcBridgeAvailable } from './ipc/ipcBridge'
