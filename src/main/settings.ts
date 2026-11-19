import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { detectLocale, normalizeLocale, type Locale } from '../shared/i18n'
import type { Settings, SourceId } from '../shared/types'

export function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

const defaults = (): Settings => ({ preferredSource: 'official', locale: null })

let cache: Settings | null = null
let activeLocale: Locale = 'en'

export async function loadSettings(): Promise<Settings> {
  if (cache) return cache
  try {
    const raw = await readFile(settingsPath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<Settings>
    cache = {
      preferredSource: parsed.preferredSource === 'mirror' ? 'mirror' : 'official',
      locale: normalizeLocale(parsed.locale)
    }
  } catch {
    cache = defaults()
  }
  activeLocale = cache.locale ?? detectLocale(app.getLocale())
  return cache
}

/** 主进程当前使用的语言，用于本地化错误与进度文案 */
export function currentLocale(): Locale {
  return activeLocale
}

async function persist(next: Settings): Promise<Settings> {
  cache = next
  try {
    await mkdir(path.dirname(settingsPath()), { recursive: true })
    await writeFile(settingsPath(), JSON.stringify(next, null, 2), 'utf8')
  } catch {
    // 设置写入失败不应影响刷写流程
  }
  return next
}

export async function savePreferredSource(source: SourceId): Promise<Settings> {
  const current = await loadSettings()
  return persist({ ...current, preferredSource: source })
}

export async function saveLocale(locale: Locale): Promise<Settings> {
  const current = await loadSettings()
  activeLocale = locale
  return persist({ ...current, locale })
}
