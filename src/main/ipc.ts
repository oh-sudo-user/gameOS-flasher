import { BrowserWindow, app, ipcMain, shell } from 'electron'
import type {
  BootPayload,
  PrepareImageOptions,
  PrepareLocalOptions,
  ProgressEvent,
  SourceId,
  StartFlashOptions
} from '../shared/types'
import { listDrives } from './drives'
import { cancelFlash, startFlash } from './flasher'
import { cancelPrepare, pickLocalImage, prepareImage, prepareLocalImage } from './imageService'
import { findModel, loadManifest, loadSettings } from './manifest'
import { getSettings, savePreferredSource } from './settings'

function broadcastProgress(event: ProgressEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('job:progress', event)
  }
}

export function registerIpc(): void {
  ipcMain.handle('app:bootstrap', async (): Promise<BootPayload> => {
    const [manifest, settings] = await Promise.all([loadManifest(), loadSettings()])
    return {
      app: { version: app.getVersion(), platform: process.platform, arch: process.arch },
      manifest,
      settings
    }
  })

  ipcMain.handle('drives:list', async () => listDrives())

  ipcMain.handle('image:prepare', async (_event, options: PrepareImageOptions) => {
    if (!options?.jobId || !options.modelId || !options.sourceId) throw new Error('参数不完整')
    const model = await findModel(options.modelId)
    return prepareImage(options, model, broadcastProgress)
  })

  ipcMain.handle('image:prepare-local', async (_event, options: PrepareLocalOptions) => {
    if (!options?.jobId || !options.modelId) throw new Error('参数不完整')
    const model = await findModel(options.modelId)
    const filePath = await pickLocalImage()
    if (!filePath) return null
    return prepareLocalImage(options, model, filePath, broadcastProgress)
  })

  ipcMain.handle('image:cancel', async (_event, jobId: string) => {
    if (typeof jobId === 'string') cancelPrepare(jobId)
  })

  ipcMain.handle('flash:start', async (_event, options: StartFlashOptions) => {
    if (!options?.jobId || !options.imagePath || !options.device) throw new Error('参数不完整')
    return startFlash(options, broadcastProgress)
  })

  ipcMain.handle('flash:cancel', async (_event, jobId: string) => {
    if (typeof jobId === 'string') cancelFlash(jobId)
  })

  ipcMain.handle('settings:set-source', async (_event, source: SourceId) => {
    return savePreferredSource(source)
  })

  ipcMain.handle('settings:get', async () => getSettings())

  ipcMain.handle('shell:open-external', async (_event, url: string) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return
    await shell.openExternal(url)
  })

  ipcMain.handle('shell:reveal', async (_event, target: string) => {
    if (typeof target !== 'string' || !target) return
    shell.showItemInFolder(target)
  })
}
