import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { FlashResult, ProgressEvent, StartFlashOptions } from '../shared/types'
import type { MessageKey } from '../shared/i18n'
import { listDrives } from './drives'
import { hashFileForFlash } from './imageService'
import { resourcePath } from './manifest'
import { mt } from './messages'

type Emit = (event: ProgressEvent) => void

interface HelperProgress {
  phase?: 'queued' | 'preparing' | 'writing' | 'finalizing' | 'done' | 'error' | 'cancelled'
  written?: number
  total?: number
  code?: 'image-open' | 'device-open' | 'read' | 'write' | 'empty' | string
  detail?: string
  message?: string
}

interface FlashSession {
  jobId: string
  cancelPath: string
  cancelled: boolean
}

const sessions = new Map<string, FlashSession>()

function helperPath(): string {
  return resourcePath('flash-helper.js')
}

function normalizeSha(value: string | undefined | null): string {
  return (value ?? '').trim().toLowerCase()
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function toCmdQuoted(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function readLogTail(logPath: string, max = 1200): string {
  try {
    const content = readFileSync(logPath, 'utf8').trim()
    return content ? content.slice(-max) : ''
  } catch {
    return ''
  }
}

function helperErrorMessage(code: string | undefined, detail: string | undefined): string {
  const suffix = detail?.trim() ? ` (${detail.trim()})` : ''
  switch (code) {
    case 'image-open':
      return mt('err.helperImageOpen', { detail: detail ?? '' })
    case 'device-open':
      return mt('err.helperDeviceOpen', { detail: suffix })
    case 'read':
      return mt('err.helperRead', { detail: detail ?? '' })
    case 'empty':
      return mt('err.helperEmpty')
    default:
      return mt('err.helperWrite', { detail: detail ?? '' })
  }
}

function scheduleCleanup(jobDir: string, delayMs: number): void {
  const timer = setTimeout(() => {
    try {
      rmSync(jobDir, { recursive: true, force: true })
    } catch {
      // 忽略清理失败
    }
  }, delayMs)
  timer.unref()
}

function launchWindows(
  jobDir: string,
  imagePath: string,
  device: string,
  progressPath: string,
  cancelPath: string,
  logPath: string
): ChildProcess {
  const launcher = path.join(jobDir, 'flash.cmd')
  const lines = [
    '@echo off',
    'chcp 65001 >nul',
    'set ELECTRON_RUN_AS_NODE=1',
    `${toCmdQuoted(process.execPath)} ${toCmdQuoted(helperPath())} ${toCmdQuoted(imagePath)} ${toCmdQuoted(device)} ${toCmdQuoted(progressPath)} ${toCmdQuoted(cancelPath)} >> ${toCmdQuoted(logPath)} 2>&1`
  ]
  writeFileSync(launcher, lines.join('\r\n'), 'utf8')

  const psCommand = `Start-Process -FilePath ${psQuote(launcher)} -Verb RunAs -WindowStyle Hidden`
  const encoded = Buffer.from(psCommand, 'utf16le').toString('base64')
  return spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
    windowsHide: true
  })
}

function launchMac(
  jobDir: string,
  imagePath: string,
  device: string,
  progressPath: string,
  cancelPath: string,
  logPath: string
): ChildProcess {
  const scriptPath = path.join(jobDir, 'flash.sh')
  const script = [
    '#!/bin/sh',
    `diskutil unmountDisk force ${shellQuote(device)} >/dev/null 2>&1 || true`,
    `ELECTRON_RUN_AS_NODE=1 ${shellQuote(process.execPath)} ${shellQuote(helperPath())} ${shellQuote(imagePath)} ${shellQuote(device)} ${shellQuote(progressPath)} ${shellQuote(cancelPath)} >> ${shellQuote(logPath)} 2>&1`,
    'status=$?',
    `if [ $status -eq 0 ]; then diskutil eject ${shellQuote(device)} >/dev/null 2>&1 || true; fi`,
    'exit $status'
  ].join('\n')
  writeFileSync(scriptPath, script, { encoding: 'utf8', mode: 0o755 })

  // AppleScript's default 2-minute timeout would kill long flashes mid-write
  const appleScript = [
    'with timeout of 7200 seconds',
    `do shell script "/bin/sh " & quoted form of ${JSON.stringify(scriptPath)} with administrator privileges`,
    'end timeout'
  ].join('\n')
  return spawn('osascript', ['-e', appleScript])
}

function deviceMatches(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

export function cancelFlash(jobId: string): void {
  const session = sessions.get(jobId)
  if (!session) return
  session.cancelled = true
  try {
    writeFileSync(session.cancelPath, 'cancel', 'utf8')
  } catch {
    // 忽略
  }
}

export async function startFlash(options: StartFlashOptions, emit: Emit): Promise<FlashResult> {
  const emitFlash = (payload: Omit<ProgressEvent, 'jobId' | 'kind'>): void => {
    emit({ jobId: options.jobId, kind: 'flash', ...payload })
  }

  emitFlash({ phase: 'preparing', percent: 0, message: mt('progress.confirmDevice') })

  const drives = await listDrives()
  const target = drives.find((drive) => deviceMatches(drive.device, options.device))
  if (!target) {
    throw new Error(mt('err.driveMissing'))
  }
  if (target.isSystem || target.blocked) {
    const reason = target.blockReason ? mt(target.blockReason as MessageKey) : mt('drive.badge.system')
    throw new Error(mt('err.driveBlocked', { reason }))
  }
  if (target.isReadOnly) {
    throw new Error(mt('err.readOnly'))
  }
  if (target.size > 0 && options.imageSize > 0 && target.size < options.imageSize) {
    throw new Error(mt('err.tooSmall'))
  }

  const imageStat = await stat(options.imagePath).catch(() => null)
  if (!imageStat || !imageStat.isFile()) {
    throw new Error(mt('err.imageMissing'))
  }

  emitFlash({ phase: 'preparing', percent: 0, message: mt('progress.rehash') })
  const actualSha = await hashFileForFlash(options.imagePath, (processed, total) => {
    emitFlash({
      phase: 'preparing',
      received: processed,
      total,
      percent: total ? Math.min(99, (processed / total) * 100) : 0,
      message: mt('progress.rehash')
    })
  })

  const expected = normalizeSha(options.expectedSha256)
  if (expected && actualSha !== expected) {
    throw new Error(mt('err.secondHash'))
  }

  const jobDir = path.join(os.tmpdir(), 'gameos-flasher', options.jobId)
  mkdirSync(jobDir, { recursive: true })
  const progressPath = path.join(jobDir, 'progress.json')
  const cancelPath = path.join(jobDir, 'cancel.flag')
  const logPath = path.join(jobDir, 'flash.log')
  writeFileSync(progressPath, JSON.stringify({ phase: 'queued', written: 0, total: imageStat.size }), 'utf8')

  const session: FlashSession = { jobId: options.jobId, cancelPath, cancelled: false }
  sessions.set(options.jobId, session)

  emitFlash({
    phase: 'preparing',
    percent: 100,
    message: mt('progress.waitElevation')
  })

  const launcher = process.platform === 'darwin'
    ? launchMac(jobDir, options.imagePath, options.device, progressPath, cancelPath, logPath)
    : launchWindows(jobDir, options.imagePath, options.device, progressPath, cancelPath, logPath)

  let launcherError = ''
  launcher.stderr?.on('data', (chunk: Buffer) => {
    launcherError += chunk.toString('utf8')
  })

  return await new Promise<FlashResult>((resolve, reject) => {
    let finished = false
    let sawHelperProgress = false
    let lastActivity = Date.now()
    let lastEmitAt = 0
    let lastSampleAt = Date.now()
    let lastSampleWritten = 0
    let speed = 0
    let reading = false

    const finish = (error?: Error, result?: FlashResult, cleanupDelay = 2_000): void => {
      if (finished) return
      finished = true
      clearInterval(timer)
      sessions.delete(options.jobId)

      if (error) {
        const tail = readLogTail(logPath)
        const suffix = tail ? `\n\n${tail}` : ''
        scheduleCleanup(jobDir, 60_000)
        reject(new Error(`${error.message}${suffix}`))
      } else {
        scheduleCleanup(jobDir, cleanupDelay)
        resolve(result ?? { jobId: options.jobId, cancelled: false })
      }
    }

    const timer = setInterval(() => {
      if (finished || reading) return

      if (session.cancelled && !sawHelperProgress) {
        emitFlash({ phase: 'cancelled', message: mt('progress.cancelled') })
        // 保留取消标记一段时间，避免提权窗口在取消后才被确认
        finish(undefined, { jobId: options.jobId, cancelled: true }, 30 * 60 * 1000)
        return
      }

      reading = true
      void (async () => {
        try {
          const raw = await readFile(progressPath, 'utf8')
          const progress = JSON.parse(raw) as HelperProgress
          const written = Number(progress.written ?? 0)
          const total = Number(progress.total ?? imageStat.size)

          if (progress.phase && progress.phase !== 'queued') {
            sawHelperProgress = true
            lastActivity = Date.now()
          }

          if (progress.phase === 'error') {
            const message = helperErrorMessage(progress.code, progress.detail)
            emitFlash({ phase: 'error', message })
            finish(new Error(message))
            return
          }
          if (progress.phase === 'cancelled') {
            emitFlash({ phase: 'cancelled', message: mt('progress.cancelled') })
            finish(undefined, { jobId: options.jobId, cancelled: true })
            return
          }
          if (progress.phase === 'done') {
            emitFlash({
              phase: 'done',
              received: total,
              total,
              percent: 100,
              speed,
              message: mt('progress.done')
            })
            finish(undefined, { jobId: options.jobId, cancelled: false })
            return
          }

          const now = Date.now()
          if (now - lastSampleAt >= 500 && written > 0) {
            const instant = ((written - lastSampleWritten) * 1000) / (now - lastSampleAt)
            speed = speed ? speed * 0.65 + instant * 0.35 : instant
            lastSampleAt = now
            lastSampleWritten = written
          }

          if (now - lastEmitAt >= 120) {
            lastEmitAt = now
            const percent = total ? Math.min(100, (written / total) * 100) : 0
            emitFlash({
              phase: progress.phase === 'finalizing' ? 'finalizing' : 'writing',
              received: written,
              total,
              percent,
              speed,
              message: progress.phase === 'finalizing' ? mt('progress.flushing') : mt('progress.writing')
            })
          }
        } catch {
          // 进度文件可能尚未创建，继续等待
        } finally {
          reading = false
        }

        if (finished) return
        const now = Date.now()
        if (session.cancelled && sawHelperProgress && now - lastActivity > 15_000) {
          emitFlash({ phase: 'cancelled', message: mt('progress.cancelled') })
          finish(undefined, { jobId: options.jobId, cancelled: true }, 5 * 60 * 1000)
        } else if (!sawHelperProgress && now - lastActivity > 5 * 60 * 1000) {
          finish(new Error(mt('err.elevationTimeout')))
        } else if (sawHelperProgress && now - lastActivity > 3 * 60 * 1000) {
          finish(new Error(mt('err.stall')))
        }
      })()
    }, 200)

    launcher.on('error', (error) => {
      finish(new Error(mt('err.launchFailed', { message: error.message })))
    })

    launcher.on('exit', (code) => {
      setTimeout(() => {
        if (finished) return
        if (!sawHelperProgress) {
          if (code !== 0 || process.platform === 'darwin') {
            const detail = launcherError.trim()
            finish(new Error(detail ? `${mt('err.elevationDenied')} (${detail})` : mt('err.elevationDenied')))
          }
        }
      }, 900)
    })
  })
}
