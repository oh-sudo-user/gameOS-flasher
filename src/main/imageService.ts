import { app, dialog, net } from 'electron'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { mkdir, open, rename, rm, stat, statfs } from 'node:fs/promises'
import { once } from 'node:events'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'
import path from 'node:path'
import type {
  ImageInfo,
  ImageSource,
  ModelInfo,
  PrepareImageOptions,
  PrepareLocalOptions,
  PrepareResult,
  PrepareSourceId,
  ProgressEvent,
  SourceId
} from '../shared/types'
import { mt } from './messages'

type Emit = (event: ProgressEvent) => void

class PrepareAbortError extends Error {
  constructor() {
    super(mt('err.cancelled'))
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
    title: mt('dialog.pickImageTitle'),
    buttonLabel: mt('dialog.pickImageButton'),
    properties: ['openFile'],
    filters: [
      { name: mt('dialog.filterImage'), extensions: ['img', 'iso', 'raw', 'bin', 'gz'] },
      { name: mt('dialog.filterAll'), extensions: ['*'] }
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

function isGzipName(name: string): boolean {
  return /\.(gz|gzip)$/i.test(name)
}

function decompressedName(name: string): string {
  return name.replace(/\.(gz|gzip)$/i, '')
}

/** 读取 gzip 末尾 ISIZE 字段，得到解压后大小（4GB 以内精确） */
async function readGzipSize(filePath: string): Promise<number> {
  try {
    const handle = await open(filePath, 'r')
    try {
      const info = await handle.stat()
      if (info.size < 4) return 0
      const buffer = Buffer.alloc(4)
      await handle.read(buffer, 0, 4, info.size - 4)
      return buffer.readUInt32LE(0)
    } finally {
      await handle.close()
    }
  } catch {
    return 0
  }
}

interface DecompressOptions {
  gzPath: string
  outPath: string
  jobId: string
  emit: Emit
  signal: AbortSignal
  sourceId: PrepareSourceId
  total?: number
}

async function decompressImage(options: DecompressOptions): Promise<number> {
  const { gzPath, outPath, jobId, emit, signal, sourceId } = options
  const estimated = options.total ?? (await readGzipSize(gzPath))
  const partPath = `${outPath}.part`
  let written = 0
  let lastEmitAt = 0

  emitProgress(emit, jobId, {
    phase: 'verifying',
    sourceId,
    received: 0,
    total: estimated,
    percent: 0,
    message: mt('progress.decompressing')
  })

  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      written += chunk.length
      const now = Date.now()
      if (now - lastEmitAt >= 160) {
        lastEmitAt = now
        emitProgress(emit, jobId, {
          phase: 'verifying',
          sourceId,
          received: written,
          total: estimated,
          percent: pagePercent(written, estimated),
          message: mt('progress.decompressing')
        })
      }
      callback(null, chunk)
    }
  })

  try {
    await pipeline(
      createReadStream(gzPath, { highWaterMark: 4 * 1024 * 1024 }),
      createGunzip(),
      meter,
      createWriteStream(partPath),
      { signal }
    )
    await rename(partPath, outPath)
  } catch (error) {
    await rm(partPath, { force: true }).catch(() => undefined)
    if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
      throw new PrepareAbortError()
    }
    throw error
  }

  const info = await stat(outPath)
  emitProgress(emit, jobId, {
    phase: 'verifying',
    sourceId,
    received: info.size,
    total: info.size,
    percent: 100,
    message: mt('progress.decompressing')
  })
  return info.size
}

function sourceLabel(source: ImageSource): string {
  return mt(source.id === 'official' ? 'source.official' : 'source.mirror')
}

async function ensureFreeSpace(targetDir: string, needed: number): Promise<void> {
  if (!needed) return
  await mkdir(targetDir, { recursive: true })

  let free = 0
  try {
    const stats = await statfs(targetDir)
    free = Number(stats.bavail) * Number(stats.bsize)
  } catch {
    // 某些文件系统不支持 statfs，跳过空间检查
    return
  }
  if (free > 0 && free < needed + 256 * 1024 * 1024) {
    throw new Error(mt('err.diskSpace', { size: `${((needed + 256 * 1024 * 1024) / 1024 ** 3).toFixed(1)} GB` }))
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
  if (!source) throw new Error(mt('err.sourceMissing'))

  const label = sourceLabel(source)
  emitProgress(emit, jobId, {
    phase: 'downloading',
    sourceId: source.id,
    received: 0,
    total: image.size,
    percent: 0,
    speed: 0,
    message: mt('progress.downloading', { source: label })
  })

  const response = await net.fetch(source.url, {
    method: 'GET',
    redirect: 'follow',
    headers: { 'User-Agent': `gameOS-Flasher/${app.getVersion()}`, Accept: 'application/octet-stream,*/*' },
    signal
  })

  if (!response.ok || !response.body) {
    throw new Error(mt('err.http', { source: label, status: response.status }))
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
          message: mt('progress.downloading', { source: label })
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
    message: mt('progress.downloaded')
  })

  return hash.digest('hex')
}

function requireImage(model: ModelInfo): ImageInfo {
  if (!model.image) throw new Error(mt('err.noImage'))
  return model.image
}

async function ensureDecompressed(
  archivePath: string,
  finalPath: string,
  gzipped: boolean,
  options: { jobId: string; emit: Emit; signal: AbortSignal; sourceId: PrepareSourceId }
): Promise<number> {
  if (!gzipped) return (await stat(archivePath)).size

  const estimate = await readGzipSize(archivePath)
  if (existsSync(finalPath)) {
    const info = await stat(finalPath)
    if (!estimate || info.size === estimate) return info.size
    await rm(finalPath, { force: true })
  }

  await ensureFreeSpace(path.dirname(finalPath), estimate)
  return decompressImage({
    gzPath: archivePath,
    outPath: finalPath,
    jobId: options.jobId,
    emit: options.emit,
    signal: options.signal,
    sourceId: options.sourceId,
    total: estimate
  })
}

async function prepareWithSources(
  model: ModelInfo,
  preferredSource: SourceId,
  jobId: string,
  emit: Emit,
  signal: AbortSignal
): Promise<PrepareResult> {
  const image = requireImage(model)
  const dir = cacheDir()
  await mkdir(dir, { recursive: true })

  const archivePath = path.join(dir, image.fileName)
  const gzipped = isGzipName(image.fileName)
  const finalName = gzipped ? decompressedName(image.fileName) : image.fileName
  const finalPath = path.join(dir, finalName)
  const expected = normalizeSha(image.sha256)

  const buildResult = (
    archiveHash: string,
    size: number,
    sourceId: PrepareSourceId,
    fromCache: boolean
  ): PrepareResult => {
    emitProgress(emit, jobId, {
      phase: 'ready',
      sourceId,
      sha256: archiveHash,
      expectedSha256: expected,
      hashMatched: expected ? true : null,
      filePath: finalPath,
      fromCache,
      total: size,
      received: size,
      percent: 100,
      message: mt('progress.ready')
    })
    return {
      filePath: finalPath,
      fileName: finalName,
      size,
      sha256: archiveHash,
      expectedSha256: expected,
      hashMatched: expected ? true : null,
      fromCache,
      sourceId,
      version: image.version
    }
  }

  // 优先复用已下载并通过校验的缓存
  if (existsSync(archivePath)) {
    emitProgress(emit, jobId, {
      phase: 'verifying',
      sourceId: preferredSource,
      total: image.size,
      received: 0,
      percent: 0,
      message: mt('progress.cacheFound')
    })
    try {
      const cachedHash = await hashFile(archivePath, signal, (processed, total) => {
        emitProgress(emit, jobId, {
          phase: 'verifying',
          sourceId: preferredSource,
          received: processed,
          total,
          percent: pagePercent(processed, total),
          message: mt('progress.cacheVerifying')
        })
      })
      if (!expected || cachedHash === expected) {
        const size = await ensureDecompressed(archivePath, finalPath, gzipped, {
          jobId,
          emit,
          signal,
          sourceId: preferredSource
        })
        return buildResult(cachedHash, size, preferredSource, true)
      }
      await rm(archivePath, { force: true })
    } catch (error) {
      if (error instanceof PrepareAbortError) throw error
      await rm(archivePath, { force: true }).catch(() => undefined)
    }
  }

  await ensureFreeSpace(dir, image.size)

  const order: SourceId[] = [preferredSource, ...image.sources.map((item) => item.id).filter((id) => id !== preferredSource)]
  const failures: string[] = []

  for (const sourceId of order) {
    const source = image.sources.find((item) => item.id === sourceId)
    if (!source) continue

    const partPath = `${archivePath}.${sourceId}.part`
    try {
      if (failures.length > 0) {
        emitProgress(emit, jobId, {
          phase: 'downloading',
          sourceId,
          total: image.size,
          received: 0,
          percent: 0,
          message: mt('progress.switching', { source: sourceLabel(source) })
        })
      }

      const downloadedHash = await downloadFromSource(image, sourceId, partPath, jobId, emit, signal)

      if (expected && downloadedHash !== expected) {
        throw new Error(mt('err.shaMismatch'))
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
        message: expected ? mt('progress.hashVerified') : mt('progress.hashComputed')
      })

      await rename(partPath, archivePath)

      await new Promise((resolve) => setTimeout(resolve, 260))

      const size = await ensureDecompressed(archivePath, finalPath, gzipped, {
        jobId,
        emit,
        signal,
        sourceId
      })

      return buildResult(downloadedHash, size, sourceId, false)
    } catch (error) {
      await rm(partPath, { force: true }).catch(() => undefined)
      if (error instanceof PrepareAbortError || signal.aborted) {
        emitProgress(emit, jobId, { phase: 'cancelled', message: mt('progress.cancelled') })
        throw new PrepareAbortError()
      }
      failures.push(`${sourceLabel(source)}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  throw new Error(failures.join('; ') || mt('err.downloadFailed'))
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
      message: mt('progress.cacheVerifying')
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
        message: mt('progress.cacheVerifying')
      })
    })

    const gzipped = isGzipName(filePath)
    // 只有压缩包能对应 Release 提供的 SHA-256；手动解压后的 .img 无法比对
    const expected = gzipped ? normalizeSha(model.image?.sha256) : ''
    const hashMatched: boolean | null = expected ? sha256 === expected : null

    if (hashMatched === false) {
      emitProgress(emit, options.jobId, {
        phase: 'error',
        sourceId: 'local',
        sha256,
        expectedSha256: expected,
        hashMatched,
        filePath,
        total: info.size,
        received: info.size,
        percent: 100,
        message: mt('err.shaMismatch')
      })

      return {
        filePath,
        fileName: path.basename(filePath),
        size: info.size,
        sha256,
        expectedSha256: expected,
        hashMatched,
        fromCache: false,
        sourceId: 'local',
        version: model.image?.version ?? ''
      }
    }

    let flashPath = filePath
    let flashName = path.basename(filePath)
    let flashSize = info.size

    if (gzipped) {
      const dir = cacheDir()
      await mkdir(dir, { recursive: true })
      flashName = `local-${decompressedName(flashName)}`
      flashPath = path.join(dir, flashName)
      const estimate = await readGzipSize(filePath)
      await ensureFreeSpace(dir, estimate)
      flashSize = await decompressImage({
        gzPath: filePath,
        outPath: flashPath,
        jobId: options.jobId,
        emit,
        signal: controller.signal,
        sourceId: 'local',
        total: estimate
      })
    }

    emitProgress(emit, options.jobId, {
      phase: 'ready',
      sourceId: 'local',
      sha256,
      expectedSha256: expected,
      hashMatched,
      filePath: flashPath,
      total: flashSize,
      received: flashSize,
      percent: 100,
      message: mt('progress.ready')
    })

    return {
      filePath: flashPath,
      fileName: flashName,
      size: flashSize,
      sha256,
      expectedSha256: expected,
      hashMatched,
      fromCache: false,
      sourceId: 'local',
      version: model.image?.version ?? ''
    }
  } catch (error) {
    if (error instanceof PrepareAbortError) {
      emitProgress(emit, options.jobId, { phase: 'cancelled', message: mt('progress.cancelled') })
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
