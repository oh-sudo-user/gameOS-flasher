import { contextBridge, ipcRenderer } from 'electron'
import type { FlasherApi, ProgressEvent, SourceId } from '../shared/types'

const api: FlasherApi = {
  bootstrap: () => ipcRenderer.invoke('app:bootstrap'),
  listDrives: () => ipcRenderer.invoke('drives:list'),
  prepareImage: (options) => ipcRenderer.invoke('image:prepare', options),
  prepareLocalImage: (options) => ipcRenderer.invoke('image:prepare-local', options),
  cancelPrepare: (jobId) => ipcRenderer.invoke('image:cancel', jobId),
  startFlash: (options) => ipcRenderer.invoke('flash:start', options),
  cancelFlash: (jobId) => ipcRenderer.invoke('flash:cancel', jobId),
  setPreferredSource: (source: SourceId) => ipcRenderer.invoke('settings:set-source', source),
  onProgress: (listener: (event: ProgressEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: ProgressEvent): void => listener(payload)
    ipcRenderer.on('job:progress', handler)
    return () => ipcRenderer.removeListener('job:progress', handler)
  },
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  revealPath: (target) => ipcRenderer.invoke('shell:reveal', target)
}

contextBridge.exposeInMainWorld('api', api)
