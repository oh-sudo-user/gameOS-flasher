/**
 * gameOS Flasher 写入助手
 *
 * 该脚本以管理员权限运行（Windows 下通过 Start-Process -Verb RunAs，
 * macOS 下通过 osascript with administrator privileges），负责把镜像原样写入物理设备。
 * 进度写入 progressPath 指向的 JSON 文件，主进程定时读取以便回传界面。
 * 错误通过 code 字段回传，由主进程按当前语言本地化。
 *
 * Windows 下写入前先 diskpart clean 清除目标盘旧分区表（旧卷随之消失，
 * 回到未初始化状态），并 mountvol /N 关闭自动挂载：否则裸写入触及已挂载
 * 卷的扇区时句柄会被系统作废（EBADF @ 分区起点），或分区表覆写后新卷被
 * 自动挂载产生同样问题。写入结束恢复自动挂载（mountvol /E）。
 *
 * 用法：flash-helper.js <image> <device> <progressFile> <cancelFile>
 */
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')

const [imagePath, rawDevice, progressPath, cancelPath] = process.argv.slice(2)

const CHUNK_SIZE = 4 * 1024 * 1024
const SECTOR_SIZE = 512
const REPORT_INTERVAL = 180
const WRITE_RETRIES = 6
const RETRYABLE_WRITE_CODES = new Set(['EBADF', 'EPERM', 'EACCES', 'EBUSY'])

let deviceFd = null
let imageFd = null
let written = 0
let total = 0
let finished = false
let automountDisabled = false

function normalizeDevice(device) {
  if (!device) return device
  if (process.platform === 'darwin' && /^\/dev\/disk\d+$/.test(device)) {
    return device.replace('/dev/disk', '/dev/rdisk')
  }
  return device
}

function report(phase, extra) {
  const payload = { phase, written, total, ...extra }
  try {
    fs.writeFileSync(progressPath, JSON.stringify(payload))
  } catch (error) {
    try {
      process.stderr.write(`progress write failed: ${error && error.message}\n`)
    } catch {}
  }
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function log(line) {
  try {
    process.stderr.write(`${line}\n`)
  } catch {}
}

function decodeConsole(buf) {
  try {
    return new TextDecoder('gbk').decode(buf)
  } catch {
    return String(buf)
  }
}

// 写入前把目标盘恢复到未初始化状态：清除旧分区表/卷，避免已挂载卷
// 使裸写入句柄失效。diskpart 退出码不可靠，用输出文本确认 clean 成功。
function prepareWindowsDisk() {
  const match = /PhysicalDrive(\d+)$/i.exec(device)
  if (!match) return
  try {
    const res = spawnSync('mountvol.exe', ['/N'], { windowsHide: true, timeout: 10_000 })
    automountDisabled = res.status === 0
    log(`automount disable: ${automountDisabled ? 'ok' : 'failed'}`)
  } catch {}
  const script = path.join(path.dirname(progressPath), 'diskpart.txt')
  try {
    fs.writeFileSync(script, `select disk ${match[1]}\r\nonline disk noerr\r\nclean\r\n`, 'utf8')
    const res = spawnSync('diskpart.exe', ['/s', script], { windowsHide: true, timeout: 120_000 })
    const out = decodeConsole(res.stdout || Buffer.alloc(0))
    log(`diskpart clean exit=${res.status}`)
    if (!/成功地清除|succeeded in cleaning/i.test(out)) {
      log(`diskpart clean not confirmed: ${out.trim().slice(-400)}`)
    }
  } catch (error) {
    log(`diskpart clean failed: ${error && error.message}`)
  }
}

function restoreWindows() {
  if (!automountDisabled) return
  try {
    spawnSync('mountvol.exe', ['/E'], { windowsHide: true, timeout: 10_000 })
  } catch {}
  automountDisabled = false
}

// macOS 的块设备缓冲缓存可能残留旧卷的脏块：裸写入绕过缓存，但缓存
// 里的旧脏块会在 sync/卸载时落盘覆盖新数据。写入前后各 flush 一次。
function syncSystem() {
  try {
    spawnSync('sync', [], { timeout: 30_000 })
  } catch {}
}

function closeAll() {
  restoreWindows()
  if (imageFd !== null) {
    try {
      fs.closeSync(imageFd)
    } catch {}
    imageFd = null
  }
  if (deviceFd !== null) {
    try {
      fs.closeSync(deviceFd)
    } catch {}
    deviceFd = null
  }
}

function fail(code, detail) {
  if (finished) return
  finished = true
  report('error', { code, detail: String(detail || '') })
  log(`gameOS flasher [${code}]: ${detail}`)
  closeAll()
  process.exit(1)
}

function cancelled() {
  if (finished) return
  finished = true
  report('cancelled')
  closeAll()
  process.exit(2)
}

let crcTable = null

function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c
    }
  }
  let c = -1
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ crcTable[(c ^ buf[i]) & 0xff]
  return (c ^ -1) >>> 0
}

// Windows 下随机化镜像携带的磁盘标识（MBR 签名 + GPT Disk GUID）。
// GPT 镜像内嵌固定的磁盘 GUID，若系统里同时插着另一块刷过同一镜像的卡，
// Windows 会因磁盘标识冲突（事件 158）把目标盘强制离线，写入句柄随即
// 失效（EBADF）。每次刷写生成新的随机标识即可避免；不改分区表项，不
// 影响设备启动。
function buildDiskIdentityPatch() {
  if (process.platform !== 'win32' || total < 1024) return null
  try {
    const head = Buffer.alloc(1024)
    if (fs.readSync(imageFd, head, 0, 1024, 0) < 1024) return null

    const isGpt = head.toString('latin1', 512, 520) === 'EFI PART'
    if (!isGpt) {
      crypto.randomBytes(4).copy(head, 440) // MBR 磁盘签名
      return head
    }

    const headerSize = head.readUInt32LE(512 + 12)
    if (headerSize < 92 || headerSize > 512) return null

    crypto.randomBytes(4).copy(head, 440) // 保护性 MBR 的磁盘签名
    const guid = crypto.randomBytes(16)
    guid[7] = (guid[7] & 0x0f) | 0x40 // GUID v4 版本位
    guid[8] = (guid[8] & 0x3f) | 0x80 // 变体位
    guid.copy(head, 568) // GPT 头部偏移 56：Disk GUID

    // 重算 GPT 头部 CRC32（CRC 字段先置零）
    const header = Buffer.from(head.subarray(512, 512 + headerSize))
    header.fill(0, 16, 20) // 头部偏移 16：CRC32 字段
    head.writeUInt32LE(crc32(header), 512 + 16)
    return head
  } catch {
    return null
  }
}

if (!imagePath || !rawDevice || !progressPath || !cancelPath) {
  process.stderr.write('missing arguments: <image> <device> <progressFile> <cancelFile>\n')
  process.exit(1)
}

const device = normalizeDevice(rawDevice)

try {
  total = fs.statSync(imagePath).size
} catch (error) {
  fail('image-open', error && error.message)
}
if (!total) fail('empty', '')

report('preparing')

try {
  imageFd = fs.openSync(imagePath, 'r')
} catch (error) {
  fail('image-open', error && error.message)
}

const identityPatch = buildDiskIdentityPatch()
if (identityPatch) {
  log('randomized disk identifiers to avoid windows disk-id collision')
}

if (process.platform === 'win32') prepareWindowsDisk()
if (process.platform === 'darwin') syncSystem()

try {
  deviceFd = fs.openSync(device, 'r+')
} catch (error) {
  fail('device-open', error && error.message)
}

report('writing')

const buffer = Buffer.alloc(CHUNK_SIZE)
let imageOffset = 0
let lastReport = 0

try {
  while (imageOffset < total) {
    if (fs.existsSync(cancelPath)) cancelled()

    const chunk = Math.min(CHUNK_SIZE, total - imageOffset)
    let read
    try {
      read = fs.readSync(imageFd, buffer, 0, chunk, imageOffset)
    } catch (error) {
      fail('read', error && error.message)
    }
    if (read <= 0) fail('read', 'unexpected end of image')
    if (imageOffset === 0 && identityPatch) identityPatch.copy(buffer, 0)

    let toWrite = read
    if (imageOffset + read >= total) {
      // 末尾补齐到扇区边界，避免部分设备拒绝非对齐写入
      const remainder = read % SECTOR_SIZE
      if (remainder !== 0) {
        const padded = read + (SECTOR_SIZE - remainder)
        buffer.fill(0, read, padded)
        toWrite = padded
      }
    }

    let offset = 0
    let attempts = 0
    while (offset < toWrite) {
      if (fs.existsSync(cancelPath)) cancelled()
      let n
      try {
        // 物理设备句柄必须用显式绝对偏移写入：依赖隐式文件指针在
        // Windows 的 \\.\PhysicalDriveX 上第一次调用就会失败（EBADF）。
        n = fs.writeSync(deviceFd, buffer, offset, toWrite - offset, written)
      } catch (error) {
        // 分区表重读等系统行为可能作废句柄或短暂拒绝写入：
        // 重开设备句柄并重试同一位置。
        if (RETRYABLE_WRITE_CODES.has(error && error.code) && attempts < WRITE_RETRIES) {
          attempts++
          log(`write ${error.code} at offset ${written}; reopening device (attempt ${attempts}/${WRITE_RETRIES})`)
          try {
            fs.closeSync(deviceFd)
          } catch {}
          deviceFd = null
          sleepSync(400)
          try {
            deviceFd = fs.openSync(device, 'r+')
          } catch (openError) {
            fail('device-open', openError && openError.message)
          }
          continue
        }
        fail('write', `${(error && error.message) || ''} (offset ${written})`)
      }
      if (n <= 0) fail('write', 'device accepted 0 bytes')
      attempts = 0
      offset += n
      written += n
      const now = Date.now()
      if (now - lastReport >= REPORT_INTERVAL) {
        lastReport = now
        report('writing')
      }
    }

    imageOffset += read
  }

  report('finalizing')
  try {
    fs.fsyncSync(deviceFd)
  } catch {
    // 部分平台不支持对物理设备 fsync，忽略即可
  }
  if (process.platform === 'darwin') syncSystem()
  closeAll()

  finished = true
  report('done')
  process.exit(0)
} catch (error) {
  fail('write', error && error.message)
}