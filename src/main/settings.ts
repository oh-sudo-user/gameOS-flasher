import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Settings } from '../shared/types'
import { loadSettings, settingsPath } from './manifest'

export async function getSettings(): Promise<Settings> {
  return loadSettings()
}

export async function savePreferredSource(source: Settings['preferredSource']): Promise<Settings> {
  const settings: Settings = { preferredSource: source === 'mirror' ? 'mirror' : 'official' }
  await mkdir(path.dirname(settingsPath()), { recursive: true })
  await writeFile(settingsPath(), JSON.stringify(settings, null, 2), 'utf8')
  return settings
}
