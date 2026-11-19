// macOS runtime smoke test for resources/flash-helper.js. Run as root on a mac:
//   sudo env "PATH=$PATH" node scripts/mac-smoke.mjs
// Attaches a raw file as a disk, puts a mounted FAT32 volume at 16MiB (like a
// real card), flashes a pattern image through the helper, read-back verifies.
import { spawnSync } from 'node:child_process'
import { writeFileSync, readFileSync, openSync, readSync, closeSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const helper = path.join(root, 'resources', 'flash-helper.js')
const SIZE = 256 * 1024 * 1024
const img = path.resolve('smoke.img')
const diskImg = path.resolve('smoke-disk.img')
const progressPath = path.resolve('smoke-progress.json')
const cancelPath = path.resolve('smoke-cancel.json')

function run(cmd, args, { allowFail = false } = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 120_000 })
  console.log(`$ ${cmd} ${args.join(' ')}`)
  if (r.stdout?.trim()) console.log(r.stdout.trim())
  if (r.stderr?.trim()) console.error(r.stderr.trim())
  if (r.status !== 0 && !allowFail) throw new Error(`${cmd} exited ${r.status}`)
  return r.stdout ?? ''
}

const sha = (b) => createHash('sha256').update(b).digest('hex')

let disk = ''
try {
  const image = Buffer.alloc(SIZE)
  let s = 0x12345678
  for (let i = 0; i < SIZE; i += 4) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    image.writeUInt32LE(s, i)
  }
  writeFileSync(img, image)
  // backing file must be separate from the source image: the helper would
  // otherwise read the very file it is writing through the attached disk
  writeFileSync(diskImg, Buffer.alloc(SIZE))
  console.log(`image sha256: ${sha(image)}`)

  const attached = run('hdiutil', ['attach', '-nomount', '-readwrite', '-imagekey', 'diskimage-class=CRawDiskImage', diskImg])
  disk = (attached.match(/\/dev\/disk\d+/) ?? [])[0]
  if (!disk) throw new Error('hdiutil attach returned no disk node')
  const rdisk = disk.replace('/dev/disk', '/dev/rdisk')

  try {
    run('gpt', ['create', '-f', disk])
    run('gpt', ['add', '-b', '32768', '-s', '200000', '-t', 'windows', disk])
    run('newfs_msdos', ['-F', '32', `${rdisk}s1`])
    run('diskutil', ['mount', `${disk}s1`], { allowFail: true })
  } catch {
    console.log('gpt path unavailable; falling back to diskutil partitionDisk')
    run('diskutil', ['partitionDisk', disk, '1', 'GPT', 'FAT32', 'ROMS', '200M'])
  }
  const info = run('diskutil', ['info', `${disk}s1`])
  if (!/Mounted:\s+Yes/.test(info)) throw new Error('test volume did not mount; scenario invalid')
  console.log('scenario ready: GPT + mounted FAT32 volume starting at 16MiB')

  run('diskutil', ['unmountDisk', 'force', disk])

  const flash = spawnSync(process.execPath, [helper, img, disk, progressPath, cancelPath], {
    encoding: 'utf8',
    timeout: 300_000
  })
  if (flash.stdout?.trim()) console.log(flash.stdout.trim())
  if (flash.stderr?.trim()) console.error(flash.stderr.trim())
  if (flash.status !== 0) throw new Error(`helper exited ${flash.status}`)
  const progress = JSON.parse(readFileSync(progressPath, 'utf8'))
  console.log(`progress: ${JSON.stringify(progress)}`)
  if (progress.phase !== 'done' || progress.written !== SIZE) throw new Error('helper did not finish')

  const fd = openSync(rdisk, 'r')
  const back = Buffer.alloc(SIZE)
  let off = 0
  while (off < SIZE) {
    const n = readSync(fd, back, off, Math.min(4 * 1024 * 1024, SIZE - off), off)
    if (n <= 0) throw new Error(`read-back stopped at ${off}`)
    off += n
  }
  closeSync(fd)
  const live = sha(back)
  console.log(`rdisk read-back: ${live} (${live === sha(image) ? 'match' : 'differs'})`)
  if (live !== sha(image)) firstDiff(back, image)

  // detach flushes the disk-image helper's caches; the backing file is the
  // bytes that actually persisted, which is what a real card would retain
  run('hdiutil', ['detach', '-force', disk])
  disk = ''
  const persisted = sha(readFileSync(diskImg))
  console.log(`device: ${persisted}\nimage : ${sha(image)}`)
  if (persisted !== sha(image)) {
    firstDiff(readFileSync(diskImg), image)
    throw new Error('READ-BACK MISMATCH')
  }
  console.log('SMOKE OK')
} finally {
  if (disk) run('hdiutil', ['detach', '-force', disk], { allowFail: true })
  rmSync(img, { force: true })
  rmSync(diskImg, { force: true })
  rmSync(progressPath, { force: true })
  rmSync(cancelPath, { force: true })
}

function firstDiff(a, b) {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      const at = Math.max(0, i - 16)
      console.log(`first diff at ${i} (0x${i.toString(16)})`)
      if (i === 0 && a[0] === 0) {
        let z = 0
        while (z < a.length && a[z] === 0) z++
        console.log(`leading zero run: ${z} bytes (0x${z.toString(16)})`)
      }
      console.log(`got : ${a.subarray(at, at + 48).toString('hex')}`)
      console.log(`want: ${b.subarray(at, at + 48).toString('hex')}`)
      return
    }
  }
  console.log(`no byte diff in first ${n} bytes; lengths ${a.length} vs ${b.length}`)
}