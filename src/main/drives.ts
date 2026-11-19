import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { DriveInfo } from '../shared/types'

const execFileAsync = promisify(execFile)

interface RawDrive {
  device?: unknown
  name?: unknown
  size?: unknown
  mountpoints?: unknown
  isSystem?: unknown
  isRemovable?: unknown
  isReadOnly?: unknown
  isUSB?: unknown
  isInternal?: unknown
  busType?: unknown
}

function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function asBool(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1'
}

function normalizeMountpoints(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && !!item)
  if (typeof value === 'string' && value) return [value]
  return []
}

function finalize(raw: RawDrive, platformBlockReason?: (drive: Omit<DriveInfo, 'blocked' | 'blockReason'>) => string | undefined): DriveInfo {
  const mountpoints = normalizeMountpoints(raw.mountpoints)
  const base: Omit<DriveInfo, 'blocked' | 'blockReason'> = {
    device: asText(raw.device),
    name: asText(raw.name, '未知存储设备'),
    size: Number(raw.size) || 0,
    mountpoints,
    isSystem: asBool(raw.isSystem),
    isRemovable: asBool(raw.isRemovable),
    isReadOnly: asBool(raw.isReadOnly),
    isUSB: asBool(raw.isUSB),
    isInternal: asBool(raw.isInternal),
    busType: asText(raw.busType, '未知')
  }

  let blockReason: string | undefined
  if (!base.device) {
    blockReason = '未能识别设备路径'
  } else if (base.isSystem) {
    blockReason = '系统盘，已自动禁止写入'
  } else if (base.isReadOnly) {
    blockReason = '设备当前为只读状态'
  } else {
    blockReason = platformBlockReason?.(base)
  }

  return { ...base, blocked: !!blockReason, blockReason }
}

/** Windows：通过 CIM 枚举物理磁盘，并映射盘符以识别系统盘 */
async function listWindowsDrives(): Promise<DriveInfo[]> {
  const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$result = New-Object System.Collections.ArrayList
$systemDrive = $env:SystemDrive
Get-CimInstance Win32_DiskDrive | ForEach-Object {
  $disk = $_
  $letters = @()
  foreach ($partition in @(Get-CimAssociatedInstance -InputObject $disk -Association Win32_DiskDriveToDiskPartition)) {
    foreach ($logicalDisk in @(Get-CimAssociatedInstance -InputObject $partition -Association Win32_LogicalDiskToPartition)) {
      if ($logicalDisk.DeviceID) { $letters += [string]$logicalDisk.DeviceID }
    }
  }
  $isSystem = $false
  foreach ($letter in $letters) {
    if ($letter -ieq $systemDrive) { $isSystem = $true }
  }
  $interfaceType = [string]$disk.InterfaceType
  [void]$result.Add([pscustomobject]@{
    device = [string]$disk.DeviceID
    name = [string]$disk.Model
    size = [double]$disk.Size
    mountpoints = @($letters)
    isSystem = $isSystem
    isRemovable = ([string]$disk.MediaType -match 'Removable') -or ($interfaceType -eq 'USB')
    isReadOnly = $false
    isUSB = ($interfaceType -eq 'USB')
    isInternal = ($interfaceType -ne 'USB')
    busType = $interfaceType
  })
}
ConvertTo-Json -InputObject @($result) -Depth 4 -Compress
`
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
    { timeout: 25_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }
  )

  const text = stdout.replace(/^\uFEFF/, '').trim()
  if (!text) return []

  const parsed: unknown = JSON.parse(text)
  const rows = Array.isArray(parsed) ? parsed : [parsed]
  return (rows as RawDrive[]).map((row) => finalize(row))
}

function parseInfoBlock(text: string): Map<string, string> {
  const result = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s{0,4}([^:]+?):\s+(.+)$/)
    if (match) result.set(match[1].trim(), match[2].trim())
  }
  return result
}

async function readDiskInfo(identifier: string): Promise<Map<string, string>> {
  const { stdout } = await execFileAsync('diskutil', ['info', identifier], {
    timeout: 15_000,
    maxBuffer: 2 * 1024 * 1024
  })
  return parseInfoBlock(stdout)
}

/** macOS：通过 diskutil 枚举整块物理磁盘 */
async function listMacDrives(): Promise<DriveInfo[]> {
  const { stdout: listing } = await execFileAsync('diskutil', ['list'], { timeout: 15_000, maxBuffer: 4 * 1024 * 1024 })

  const wholeIds = new Set<string>()
  for (const line of listing.split(/\r?\n/)) {
    const match = line.match(/^\/dev\/(disk\d+)\s+\(/)
    if (match) wholeIds.add(match[1])
  }

  const rootInfo = await readDiskInfo('/')
  const rootPart = rootInfo.get('Part of Whole') ?? rootInfo.get('Parent Whole Disk') ?? ''
  const rootDisk = rootPart.replace(/s\d+$/, '')

  const drives: DriveInfo[] = []
  for (const id of wholeIds) {
    let info: Map<string, string>
    try {
      info = await readDiskInfo(id)
    } catch {
      continue
    }

    if ((info.get('Virtual') ?? 'No') === 'Yes') continue
    if ((info.get('Whole') ?? 'Yes') === 'No') continue

    const device = info.get('Device Node') ?? `/dev/${id}`
    const diskName = info.get('Device / Media Name') ?? info.get('Media Name') ?? `磁盘 ${id}`
    const sizeMatch = (info.get('Disk Size') ?? '').match(/\((\d+)\s+Bytes\)/)
    const mountPoint = info.get('Mount Point') ?? ''
    const mountpoints = mountPoint && !mountPoint.startsWith('Not applicable') ? [mountPoint] : []
    const isInternal = (info.get('Internal') ?? 'No') === 'Yes'
    const isRemovable = (info.get('Removable Media') ?? 'Fixed') === 'Removable' || (info.get('Ejectable') ?? 'No') === 'Yes'
    const busType = info.get('Bus Protocol') ?? '未知'
    const isUSB = /USB/i.test(busType)
    const isReadOnly = (info.get('Read-Only Media') ?? 'No') === 'Yes'
    const isSystem = mountpoints.includes('/') || id === rootDisk

    drives.push(
      finalize(
        {
          device,
          name: diskName,
          size: sizeMatch ? Number(sizeMatch[1]) : 0,
          mountpoints,
          isSystem,
          isRemovable,
          isReadOnly,
          isUSB,
          isInternal,
          busType
        },
        (drive) => {
          if (drive.isInternal && !drive.isRemovable && !drive.isUSB) {
            return '内置磁盘，为保护系统已禁用'
          }
          return undefined
        }
      )
    )
  }

  return drives
}

function sortDrives(drives: DriveInfo[]): DriveInfo[] {
  return drives.sort((a, b) => {
    if (a.blocked !== b.blocked) return a.blocked ? 1 : -1
    if (a.isRemovable !== b.isRemovable) return a.isRemovable ? -1 : 1
    if (a.isUSB !== b.isUSB) return a.isUSB ? -1 : 1
    return b.size - a.size
  })
}

export async function listDrives(): Promise<DriveInfo[]> {
  const drives = process.platform === 'darwin' ? await listMacDrives() : process.platform === 'win32' ? await listWindowsDrives() : []
  return sortDrives(drives)
}
