import { BrowserWindow, app, ipcMain, shell } from 'electron'
import { detectLocale, type Locale } from '../shared/i18n'
import type {
  BootPayload,
  ModelsPayload,
  PrepareImageOptions,
  PrepareLocalOptions,
  ProgressEvent,
  SourceId,
  StartFlashOptions
} from '../shared/types'
import { listDrives } from './drives'
import { cancelFlash, startFlash } from './flasher'
import { cancelPrepare, cleanupImage, pickLocalImage, prepareImage, prepareLocalImage } from './imageService'
import { loadManifest } from './manifest'
import { mt } from './messages'
import { findResolvedModel, resolveModels } from './release'
import { loadSettings, saveLocale, savePreferredSource } from './settings'

function broadcastProgress(event: ProgressEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('job:progress', event)
  }
}

export function registerIpc(): void {
  ipcMain.handle('app:bootstrap', async (): Promise<BootPayload> => {
    // 先加载设置，确保后续错误文案使用用户选择的语言
    const settings = await loadSettings()
    const [manifest, resolved] = await Promise.all([loadManifest(), resolveModels()])
    return {
      app: { version: app.getVersion(), platform: process.platform, arch: process.arch },
      manifest,
      models: resolved.models,
      release: resolved.release,
      settings,
      systemLocale: detectLocale(app.getLocale())
    }
  })

  ipcMain.handle('models:refresh', async (): Promise<ModelsPayload> => resolveModels(true))

  ipcMain.handle('drives:list', async () => listDrives())

  ipcMain.handle('image:prepare', async (_event, options: PrepareImageOptions) => {
    if (!options?.jobId || !options.modelId || !options.sourceId) throw new Error(mt('err.params'))
    const model = await findResolvedModel(options.modelId)
    if (!model) throw new Error(mt('err.modelNotFound'))
    if (!model.image) throw new Error(mt('err.noImage'))
    return prepareImage(options, model, broadcastProgress)
  })

  ipcMain.handle('image:prepare-local', async (_event, options: PrepareLocalOptions) => {
    if (!options?.jobId || !options.modelId) throw new Error(mt('err.params'))
    const model = await findResolvedModel(options.modelId)
    if (!model) throw new Error(mt('err.modelNotFound'))
    const filePath = await pickLocalImage()
    if (!filePath) return null
    return prepareLocalImage(options, model, filePath, broadcastProgress)
  })

  ipcMain.handle('image:cancel', async (_event, jobId: string) => {
    if (typeof jobId === 'string') cancelPrepare(jobId)
  })

  ipcMain.handle('image:cleanup', async (_event, filePath: string) => {
    if (typeof filePath !== 'string') return false
    return cleanupImage(filePath)
  })

  ipcMain.handle('flash:start', async (_event, options: StartFlashOptions) => {
    if (!options?.jobId || !options.imagePath || !options.device) throw new Error(mt('err.params'))
    return startFlash(options, broadcastProgress)
  })

  ipcMain.handle('flash:cancel', async (_event, jobId: string) => {
    if (typeof jobId === 'string') cancelFlash(jobId)
  })

  ipcMain.handle('settings:set-source', async (_event, source: SourceId) => {
    return savePreferredSource(source)
  })

  ipcMain.handle('settings:set-locale', async (_event, locale: Locale) => {
    return saveLocale(locale)
  })

  ipcMain.handle('shell:open-external', async (_event, url: string) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return
    await shell.openExternal(url)
  })

  ipcMain.handle('shell:reveal', async (_event, target: string) => {
    if (typeof target !== 'string' || !target) return
    shell.showItemInFolder(target)
  })
}
