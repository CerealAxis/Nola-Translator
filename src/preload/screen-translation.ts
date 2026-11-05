import type { IpcRenderer } from 'electron'
import type { ScreenTranslationBridge, ScreenSnapshot } from '../shared/screen-translation'

export function createScreenPreload(ipc: IpcRenderer): ScreenTranslationBridge {
  return {
    snapshot: () => ipc.invoke('screen:snapshot'),
    sources: () => ipc.invoke('screen:sources'),
    command: command => ipc.invoke('screen:command', command),
    windowBootstrap: () => ipc.invoke('screen:bootstrap'),
    frame: frame => ipc.invoke('screen:frame', frame),
    captureError: () => ipc.invoke('screen:capture-error'),
    onChanged: callback => {
      const listener = (_event: Electron.IpcRendererEvent, snapshot: ScreenSnapshot) => callback(snapshot)
      ipc.on('screen:changed', listener)
      return () => { ipc.removeListener('screen:changed', listener) }
    },
  }
}
