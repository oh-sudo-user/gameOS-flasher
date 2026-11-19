import { app, dialog, net } from 'electron'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { mkdir, rename, rm, stat, statfs } from 'node:fs/promises'
import { once } from 'node:events'
import path from 'node:path'
import type {
  ImageInfo,
  ModelInfo,
  PrepareImageOptions,
  PrepareLocalOptions,
  PrepareResult,
  ProgressEvent,
  SourceId
} from '../shared/types'

type Emit = (event: ProgressEvent) => void

class PrepareAbortError extends Error {
  constructor() {
    super('已取消')
    this.name = 'PrepareAbortError'
  }
}

const abortControllers = new Map<string, AbortController>()

const cacheDir = (): string => path.join(app.getPath('userData'), 'images')

export function cancelPrepare(jobId: string): void {
  abortControllers.get(jobId)?.abort()
}

export async function pickLocalImage(): Promise<string | undefined> {
  const result = await dialog.showOpenDialog({
    title: '选择本地 gameOS 镜像',
    buttonLabel: '选择镜像',
    properties: ['openFile'],
    filters: [
      { name: '磁盘镜像', extensions: ['img', 'iso', 'raw', 'bin'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  })
  if (result.canceled || !result.filePaths[0]) return undefined
  return result.filePaths[0]
}

function normalizeSha(value: string | undefined | null): string {
  return (value ?? '').trim().toLowerCase()
}

function emitProgress(emit: Emit, jobId: string, payload: Omit<ProgressEvent, 'jobId' | 'kind'>): void {
  emit({ jobId, kind: 'image', ...payload })
}

function pagePercent(received: number, total: number): number {
  if (!total) return 0
  return Math.min(100, Math.max(0, (received / total) * 100))
}

async function ensureFreeSpace(targetDir: string, needed: number): Promise<void> {
  if (!needed) return
  try {
    await mkdir(targetDir, { recursive: true })
    const stats = await statfs(targetDir)
    const free = Number(stats.bavail) * Number(stats.bsize)
    if (free > 0 && free < needed + 256 * 1024 * 1024) {
      throw new Error(`磁盘空间不足，至少需要 ${((needed + 256 * 1024 * 1024) / 1024 ** 3).toFixed(1)} GB 可用空间`)
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('磁盘空间不足')) throw error
    // 某些文件系统不支持 statfs，忽略该项检查
  }
}

async function hashFile(
  filePath: string,
  signal: AbortSignal,
  onProgress?: (processed: number, total: number) => void
): Promise<string> {
  const info = await stat(filePath)
  const hash = createHash('sha256')
  const stream = createReadStream(filePath, { highWaterMark: 4 * 1024 * 1024 })
  let processed = 0

  try {
    for await (const chunk of stream) {
      if (signal.aborted) throw new PrepareAbortError()
      hash.update(chunk as Buffer)
      processed += (chunk as Buffer).length
      onProgress?.(processed, info.size)
    }
  } finally {
    stream.destroy()
  }
  return hash.digest('hex')
}

async function downloadFromSource(
  image: ImageInfo,
  sourceId: SourceId,
  partPath: string,
  jobId: string,
  emit: Emit,
  signal: AbortSignal
): Promise<string> {
  const source = image.sources.find((item) => item.id === sourceId) ?? image.sources[0]
  if (!source) throw new Error('该机型暂未配置下载源')

  emitProgress(emit, jobId, {
    phase: 'downloading',
    sourceId: source.id,
    received: 0,
    total: image.size,
    percent: 0,
    speed: 0,
    message: `正在从${source.label}下载镜像…`
  })

  const response = await net.fetch(source.url, {
    method: 'GET',
    redirect: 'follow',
    headers: { 'User-Agent': `gameOS-Flasher/${app.getVersion()}`, Accept: 'application/octet-stream,*/*' },
    signal
  })

  if (!response.ok || !response.body) {
    throw new Error(`${source.label}返回 HTTP ${response.status}，无法下载镜像`)
  }

  const contentLength = Number(response.headers.get('content-length') ?? 0)
  const total = contentLength > 0 ? contentLength : image.size
  const hash = createHash('sha256')
  const output = createWriteStream(partPath)
  const reader = response.body.getReader()

  let received = 0
  let speed = 0
  let lastSampleAt = Date.now()
  let lastSampleBytes = 0
  let lastEmitAt = 0

  try {
    while (true) {
      if (signal.aborted) throw new PrepareAbortError()
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue

      const chunk = Buffer.from(value)
      received += chunk.length
      hash.update(chunk)
      if (!output.write(chunk)) await once(output, 'drain')

      const now = Date.now()
      if (now - lastSampleAt >= 400) {
        const instant = ((received - lastSampleBytes) * 1000) / (now - lastSampleAt)
        speed = speed ? speed * 0.65 + instant * 0.35 : instant
        lastSampleAt = now
        lastSampleBytes = received
      }
      if (now - lastEmitAt >= 120) {
        lastEmitAt = now
        emitProgress(emit, jobId, {
          phase: 'downloading',
          sourceId: source.id,
          received,
          total,
          percent: pagePercent(received, total),
          speed,
          message: `正在从${source.label}下载镜像…`
        })
      }
    }

    output.end()
    await once(output, 'finish')
  } catch (error) {
    output.destroy()
    await rm(partPath, { force: true })
    throw error
  } finally {
    reader.releaseLock()
  }

  emitProgress(emit, jobId, {
    phase: 'downloading',
    sourceId: source.id,
    received,
    total: total || received,
    percent: 100,
    speed,
    message: '下载完成'
  })

  return hash.digest('hex')
}

async function prepareWithSources(
  model: ModelInfo,
  preferredSource: SourceId,
  jobId: string,
  emit: Emit,
  signal: AbortSignal
): Promise<PrepareResult> {
  const image = model.image
  const dir = cacheDir()
  await mkdir(dir, { recursive: true })

  const finalPath = path.join(dir, image.fileName)
  const expected = normalizeSha(image.sha256)

  // 优先复用已下载并通过校验的缓存
  if (existsSync(finalPath)) {
    emitProgress(emit, jobId, {
      phase: 'verifying',
      sourceId: preferredSource,
      total: image.size,
      received: 0,
      percent: 0,
      message: '发现本地缓存，正在校验完整性…'
    })
    try {
      const cachedHash = await hashFile(finalPath, signal, (processed, total) => {
        emitProgress(emit, jobId, {
          phase: 'verifying',
          sourceId: preferredSource,
          received: processed,
          total,
          percent: pagePercent(processed, total),
          message: '正在校验本地缓存…'
        })
      })
      if (!expected || cachedHash === expected) {
        emitProgress(emit, jobId, {
          phase: 'ready',
          sourceId: preferredSource,
          sha256: cachedHash,
          expectedSha256: expected,
          hashMatched: expected ? true : null,
          filePath: finalPath,
          fromCache: true,
          total: image.size,
          received: image.size,
          percent: 100,
          message: '镜像已就绪'
        })
        return {
          filePath: finalPath,
          fileName: image.fileName,
          size: image.size,
          sha256: cachedHash,
          expectedSha256: expected,
          hashMatched: expected ? true : null,
          fromCache: true,
          sourceId: preferredSource
        }
      }
      await rm(finalPath, { force: true })
    } catch (error) {
      if (error instanceof PrepareAbortError) throw error
      await rm(finalPath, { force: true }).catch(() => undefined)
    }
  }

  await ensureFreeSpace(dir, image.size)

  const order: SourceId[] = [preferredSource, ...image.sources.map((item) => item.id).filter((id) => id !== preferredSource)]
  const failures: string[] = []

  for (const sourceId of order) {
    const source = image.sources.find((item) => item.id === sourceId)
    if (!source) continue

    const partPath = `${finalPath}.${sourceId}.part`
    try {
      if (failures.length > 0) {
        emitProgress(emit, jobId, {
          phase: 'downloading',
          sourceId,
          total: image.size,
          received: 0,
          percent: 0,
          message: `${source.label}不可用，正在自动切换镜像源…`
        })
      }

      const downloadedHash = await downloadFromSource(image, sourceId, partPath, jobId, emit, signal)

      if (expected && downloadedHash !== expected) {
        throw new Error('SHA-256 校验失败，镜像可能在传输中损坏')
      }

      emitProgress(emit, jobId, {
        phase: 'verifying',
        sourceId,
        total: image.size,
        received: image.size,
        percent: 100,
        sha256: downloadedHash,
        expectedSha256: expected,
        hashMatched: expected ? true : null,
        message: expected ? 'SHA-256 校验通过' : '已计算 SHA-256（清单未配置期望值）'
      })

      await rename(partPath, finalPath)

      await new Promise((resolve) => setTimeout(resolve, 260))

      emitProgress(emit, jobId, {
        phase: 'ready',
        sourceId,
        sha256: downloadedHash,
        expectedSha256: expected,
        hashMatched: expected ? true : null,
        filePath: finalPath,
        fromCache: false,
        total: image.size,
        received: image.size,
        percent: 100,
        message: '镜像已就绪'
      })

      return {
        filePath: finalPath,
        fileName: image.fileName,
        size: image.size,
        sha256: downloadedHash,
        expectedSha256: expected,
        hashMatched: expected ? true : null,
        fromCache: false,
        sourceId
      }
    } catch (error) {
      await rm(partPath, { force: true }).catch(() => undefined)
      if (error instanceof PrepareAbortError || signal.aborted) {
        emitProgress(emit, jobId, { phase: 'cancelled', message: '已取消下载' })
        throw new PrepareAbortError()
      }
      failures.push(`${source.label}：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  throw new Error(failures.join('；') || '镜像下载失败')
}

export async function prepareImage(
  options: PrepareImageOptions,
  model: ModelInfo,
  emit: Emit
): Promise<PrepareResult> {
  const controller = new AbortController()
  abortControllers.set(options.jobId, controller)
  try {
    return await prepareWithSources(model, options.sourceId, options.jobId, emit, controller.signal)
  } catch (error) {
    if (error instanceof PrepareAbortError) throw error
    const message = error instanceof Error ? error.message : String(error)
    emitProgress(emit, options.jobId, { phase: 'error', message })
    throw error
  } finally {
    abortControllers.delete(options.jobId)
  }
}

export async function prepareLocalImage(
  options: PrepareLocalOptions,
  model: ModelInfo,
  filePath: string,
  emit: Emit
): Promise<PrepareResult> {
  const controller = new AbortController()
  abortControllers.set(options.jobId, controller)

  try {
    const info = await stat(filePath)
    emitProgress(emit, options.jobId, {
      phase: 'verifying',
      sourceId: 'local',
      total: info.size,
      received: 0,
      percent: 0,
      filePath,
      message: '正在计算本地镜像的 SHA-256…'
    })

    let lastEmitAt = 0
    const sha256 = await hashFile(filePath, controller.signal, (processed, total) => {
      const now = Date.now()
      if (now - lastEmitAt < 80) return
      lastEmitAt = now
      emitProgress(emit, options.jobId, {
        phase: 'verifying',
        sourceId: 'local',
        received: processed,
        total,
        percent: pagePercent(processed, total),
        filePath,
        message: '正在计算本地镜像的 SHA-256…'
      })
    })

    const expected = normalizeSha(model.image.sha256)
    const hashMatched: boolean | null = expected ? sha256 === expected : null

    emitProgress(emit, options.jobId, {
      phase: hashMatched === false ? 'error' : 'ready',
      sourceId: 'local',
      sha256,
      expectedSha256: expected,
      hashMatched,
      filePath,
      total: info.size,
      received: info.size,
      percent: 100,
      message: hashMatched === false ? 'SHA-256 与官方清单不一致' : '本地镜像已就绪'
    })

    return {
      filePath,
      fileName: path.basename(filePath),
      size: info.size,
      sha256,
      expectedSha256: expected,
      hashMatched,
      fromCache: false,
      sourceId: 'local'
    }
  } catch (error) {
    if (error instanceof PrepareAbortError) {
      emitProgress(emit, options.jobId, { phase: 'cancelled', message: '已取消' })
      throw error
    }
    const message = error instanceof Error ? error.message : String(error)
    emitProgress(emit, options.jobId, { phase: 'error', message })
    throw error
  } finally {
    abortControllers.delete(options.jobId)
  }
}

export async function hashFileForFlash(
  filePath: string,
  onProgress?: (processed: number, total: number) => void
): Promise<string> {
  return hashFile(filePath, new AbortController().signal, onProgress)
}
