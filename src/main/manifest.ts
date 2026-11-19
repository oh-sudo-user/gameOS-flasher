import { app } from 'electron'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Manifest } from '../shared/types'

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

let cached: Manifest | undefined

export async function loadManifest(): Promise<Manifest> {
  if (cached) return cached

  const raw = await readFile(resourcePath('manifest.json'), 'utf8')
  const manifest = JSON.parse(raw) as Manifest

  if (!manifest || !manifest.release?.owner || !manifest.release?.repo) {
    throw new Error('manifest.json 缺少 release.owner / release.repo 配置')
  }
  if (!Array.isArray(manifest.models) || manifest.models.length === 0) {
    throw new Error('机型清单为空，请检查 manifest.json')
  }

  const ids = new Set<string>()
  for (const model of manifest.models) {
    if (!model.id || !model.name || !model.assetMatch) {
      throw new Error('机型清单格式不正确，缺少必要字段')
    }
    if (ids.has(model.id)) throw new Error(`机型清单存在重复 id：${model.id}`)
    ids.add(model.id)
  }

  cached = manifest
  return manifest
}
