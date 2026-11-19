/**
 * gameOS Flasher 写入助手
 *
 * 该脚本以管理员权限运行（Windows 下通过 Start-Process -Verb RunAs，
 * macOS 下通过 osascript with administrator privileges），负责把镜像原样写入物理设备。
 * 进度写入 progressPath 指向的 JSON 文件，主进程定时读取以便回传界面。
 *
 * 用法：flash-helper.js <image> <device> <progressFile> <cancelFile>
 */
const fs = require('node:fs')

const [imagePath, rawDevice, progressPath, cancelPath] = process.argv.slice(2)

const CHUNK_SIZE = 4 * 1024 * 1024
const SECTOR_SIZE = 512
const REPORT_INTERVAL = 180

let deviceFd = null
let imageFd = null
let written = 0
let total = 0
let finished = false

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

function closeAll() {
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

function fail(message) {
  if (finished) return
  finished = true
  report('error', { message })
  try {
    process.stderr.write(`gameOS flasher: ${message}\n`)
  } catch {}
  closeAll()
  process.exit(1)
}

function cancelled() {
  if (finished) return
  finished = true
  report('cancelled', { message: '用户取消了刷写' })
  closeAll()
  process.exit(2)
}

if (!imagePath || !rawDevice || !progressPath || !cancelPath) {
  process.stderr.write('缺少参数：需要 <image> <device> <progressFile> <cancelFile>\n')
  process.exit(1)
}

const device = normalizeDevice(rawDevice)

try {
  total = fs.statSync(imagePath).size
  if (!total) throw new Error('镜像文件为空')
} catch (error) {
  fail(`无法读取镜像文件：${error && error.message}`)
}

report('preparing', { message: '正在打开目标设备…' })

try {
  imageFd = fs.openSync(imagePath, 'r')
  deviceFd = fs.openSync(device, 'r+')
} catch (error) {
  fail(`无法打开目标设备（请确认存储卡已插入，并允许管理员权限）：${error && error.message}`)
}

report('writing', { message: '正在写入…' })

const buffer = Buffer.alloc(CHUNK_SIZE)
let imageOffset = 0
let lastReport = 0

try {
  while (imageOffset < total) {
    if (fs.existsSync(cancelPath)) cancelled()

    const chunk = Math.min(CHUNK_SIZE, total - imageOffset)
    const read = fs.readSync(imageFd, buffer, 0, chunk, imageOffset)
    if (read <= 0) throw new Error('读取镜像时遇到意外结束')

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
    while (offset < toWrite) {
      if (fs.existsSync(cancelPath)) cancelled()
      const n = fs.writeSync(deviceFd, buffer, offset, toWrite - offset)
      if (n <= 0) throw new Error('写入设备失败（返回 0 字节）')
      offset += n
      written += n
      const now = Date.now()
      if (now - lastReport >= REPORT_INTERVAL) {
        lastReport = now
        report('writing', { message: '正在写入…' })
      }
    }

    imageOffset += read
  }

  report('finalizing', { message: '正在刷新缓存…' })
  try {
    fs.fsyncSync(deviceFd)
  } catch {
    // 部分平台不支持对物理设备 fsync，忽略即可
  }
  closeAll()

  finished = true
  report('done', { message: '写入完成' })
  process.exit(0)
} catch (error) {
  fail(`写入失败：${error && error.message}`)
}
