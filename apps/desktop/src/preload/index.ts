import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { DeepLink } from '../shared/deep-link'

export interface AppInfo {
  version: string
  platform: string
}

const api = {
  getInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:info'),
  takePendingDeepLink: (): Promise<DeepLink | null> => ipcRenderer.invoke('deep-link:take-pending'),
  onDeepLink: (listener: (link: DeepLink) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, link: DeepLink): void => listener(link)
    ipcRenderer.on('deep-link', handler)
    return () => ipcRenderer.removeListener('deep-link', handler)
  }
}

export type RemindApi = typeof api

contextBridge.exposeInMainWorld('remind', api)
