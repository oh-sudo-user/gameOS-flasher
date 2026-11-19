import { net } from 'electron'
import type {
  ImageInfo,
  ImageSource,
  Manifest,
  ManifestModel,
  ModelInfo,
  ModelsPayload,
  ReleaseStatus
} from '../shared/types'
import { loadManifest } from './manifest'
import { mt } from './messages'

interface GitHubAsset {
  name: string
  size: number
  browser_download_url: string
  /** GitHub 为发布资源提供的摘要，形如 sha256:xxxx */
  digest?: string | null
}

interface GitHubRelease {
  tag_name: string
  published_at: string
  assets: GitHubAsset[]
}

type ReleaseError = 'none' | 'network' | 'rate' | null

interface ReleaseCache {
  at: number
  release: GitHubRelease | null
  error: ReleaseError
}

const API_ROOT = 'https://api.github.com'
const CACHE_TTL = 5 * 60 * 1000

let cache: ReleaseCache | null = null

function isImageAsset(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.endsWith('.img') || lower.endsWith('.img.gz')
}

function hasToken(haystack: string, token: string): boolean {
  const base = haystack.toLowerCase()
  const value = token.toLowerCase()
  let from = 0
  while (from <= base.length) {
    const index = base.indexOf(value, from)
    if (index === -1) return false
    const before = index === 0 ? '' : base[index - 1]
    const after = index + value.length >= base.length ? '' : base[index + value.length]
    const leftOk = !before || !/[a-z0-9]/.test(before)
    const rightOk = !after || !/[a-z0-9]/.test(after)
    if (leftOk && rightOk) return true
    from = index + 1
  }
  return false
}

async function fetchLatestRelease(force: boolean): Promise<{ release: GitHubRelease | null; error: ReleaseError }> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL) {
    return { release: cache.release, error: cache.error }
  }

  const manifest = await loadManifest()
  const url = `${API_ROOT}/repos/${manifest.release.owner}/${manifest.release.repo}/releases/latest`

  try {
    const response = await net.fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'gameOS-Flasher',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    })

    if (response.status === 404) {
      cache = { at: Date.now(), release: null, error: 'none' }
      return { release: null, error: 'none' }
    }
    if (response.status === 403 || response.status === 429) {
      cache = { at: Date.now(), release: null, error: 'rate' }
      return { release: null, error: 'rate' }
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = (await response.json()) as GitHubRelease
    if (!data || !Array.isArray(data.assets)) throw new Error('Unexpected release payload')

    cache = { at: Date.now(), release: data, error: null }
    return { release: data, error: null }
  } catch {
    // 网络异常时优先沿用上一次成功的结果
    if (cache?.release) return { release: cache.release, error: null }
    cache = { at: Date.now(), release: null, error: 'network' }
    return { release: null, error: 'network' }
  }
}

/** 处理 rg-ds 与 rg-ds-plus 这类前缀重叠：同一个资源只归给匹配最长的机型 */
function assignAssets(
  manifest: Manifest,
  release: GitHubRelease
): Map<string, GitHubAsset> {
  const sorted = [...manifest.models].sort((a, b) => b.assetMatch.length - a.assetMatch.length)
  const used = new Set<string>()
  const result = new Map<string, GitHubAsset>()

  for (const model of sorted) {
    const asset = release.assets.find((item) => {
      if (!isImageAsset(item.name) || used.has(item.name)) return false
      return hasToken(item.name, model.assetMatch)
    })
    if (asset) {
      result.set(model.id, asset)
      used.add(asset.name)
    }
  }
  return result
}

function parseChecksums(text: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/)
    if (!match) continue
    map.set(match[2].trim().toLowerCase(), match[1].toLowerCase())
  }
  return map
}

async function loadChecksumAsset(release: GitHubRelease): Promise<Map<string, string>> {
  // 支持汇总文件（SHA256SUMS / checksums.txt）以及每个资源旁的 .sha256 校验文件
  const candidates = release.assets.filter(
    (asset) => /^(sha256sums?|checksums?|sha256)(\.txt)?$/i.test(asset.name) || /\.sha256$/i.test(asset.name)
  )
  const merged = new Map<string, string>()

  for (const candidate of candidates) {
    try {
      const response = await net.fetch(candidate.browser_download_url, {
        headers: { 'User-Agent': 'gameOS-Flasher' }
      })
      if (!response.ok) continue
      for (const [name, hash] of parseChecksums(await response.text())) {
        merged.set(name, hash)
      }
    } catch {
      // 单个校验文件下载失败时忽略，仍可回退到 GitHub 资源 digest
    }
  }

  return merged
}

function buildImage(
  manifest: Manifest,
  release: GitHubRelease,
  asset: GitHubAsset,
  checksums: Map<string, string>
): ImageInfo {
  const digest = typeof asset.digest === 'string' ? asset.digest : ''
  const fromDigest = digest.toLowerCase().startsWith('sha256:') ? digest.slice(7).toLowerCase() : ''
  const sha256 = fromDigest || checksums.get(asset.name.toLowerCase()) || ''

  const sources: ImageSource[] = [
    { id: 'official', label: 'GitHub Release', url: asset.browser_download_url }
  ]
  const prefix = manifest.release.mirrorPrefix?.trim()
  if (prefix) {
    sources.push({ id: 'mirror', label: 'Mirror', url: `${prefix}${asset.browser_download_url}` })
  }

  return {
    fileName: asset.name,
    version: release.tag_name.replace(/^v/i, ''),
    size: asset.size,
    sha256,
    releaseTag: release.tag_name,
    publishedAt: release.published_at,
    sources
  }
}

function statusFor(release: GitHubRelease | null, error: ReleaseError): ReleaseStatus {
  if (!release) {
    const key = error === 'none' ? 'err.releaseNone' : error === 'rate' ? 'err.releaseRate' : 'err.releaseNetwork'
    return { tag: null, publishedAt: null, error: mt(key) }
  }
  return { tag: release.tag_name, publishedAt: release.published_at, error: '' }
}

export async function resolveModels(force = false): Promise<ModelsPayload> {
  const manifest = await loadManifest()
  const { release, error } = await fetchLatestRelease(force)

  if (!release) {
    const models: ModelInfo[] = manifest.models.map((model) => ({ ...model, image: null }))
    return { models, release: statusFor(null, error) }
  }

  const [assigned, checksums] = await Promise.all([assignAssets(manifest, release), loadChecksumAsset(release)])

  const models: ModelInfo[] = manifest.models.map((model) => {
    const asset = assigned.get(model.id)
    return {
      ...model,
      image: asset ? buildImage(manifest, release, asset, checksums) : null
    }
  })

  return { models, release: statusFor(release, error) }
}

export async function findResolvedModel(modelId: string): Promise<ModelInfo | null> {
  const { models } = await resolveModels(false)
  return models.find((item) => item.id === modelId) ?? null
}
