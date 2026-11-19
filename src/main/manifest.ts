import { app } from 'electron'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Manifest, ModelInfo, Settings } from '../shared/types'

/**
 * 解析随应用分发的资源文件。
 * Electron 45 在开发模式（electron .）下 app.isPackaged 也可能为 true，
 * 因此这里按候选路径逐一探测，兼容开发、预览与打包三种运行方式。
 */
export function resourcePath(relative: string): string {
  const candidates = [
    path.join(process.resourcesPath, 'resources', relative),
    path.join(app.getAppPath(), 'resources', relative),
    path.join(process.cwd(), 'resources', relative)
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]
}

function manifestPath(): string {
  return resourcePath('manifest.json')
}

let cached: Manifest | undefined

export async function loadManifest(): Promise<Manifest> {
  if (cached) return cached

  const raw = await readFile(manifestPath(), 'utf8')
  const manifest = JSON.parse(raw) as Manifest
  if (!manifest || !Array.isArray(manifest.models) || manifest.models.length === 0) {
    throw new Error('机型清单为空，请检查 manifest.json')
  }
  const ids = new Set<string>()
  for (const model of manifest.models) {
    if (!model.id || !model.name || !model.image?.fileName) {
      throw new Error('机型清单格式不正确，缺少必要字段')
    }
    if (ids.has(model.id)) throw new Error(`机型清单存在重复 id：${model.id}`)
    ids.add(model.id)
  }
  cached = manifest
  return manifest
}

export async function findModel(modelId: string): Promise<ModelInfo> {
  const manifest = await loadManifest()
  const model = manifest.models.find((item) => item.id === modelId)
  if (!model) throw new Error('未找到该机型，请重新选择')
  return model
}

const defaultSettings: Settings = { preferredSource: 'official' }

export function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await readFile(settingsPath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<Settings>
    return {
      preferredSource: parsed.preferredSource === 'mirror' ? 'mirror' : 'official'
    }
  } catch {
    return { ...defaultSettings }
  }
}
