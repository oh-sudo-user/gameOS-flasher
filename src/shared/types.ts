export type Platform = 'win32' | 'darwin' | string

export type SourceId = 'official' | 'mirror'
export type PrepareSourceId = SourceId | 'local'

export interface ImageSource {
  id: SourceId
  label: string
  url: string
}

export interface ImageInfo {
  fileName: string
  version: string
  size: number
  /** 期望的 SHA-256；留空表示清单暂未配置校验值 */
  sha256: string
  sources: ImageSource[]
}

export interface ModelInfo {
  id: string
  name: string
  vendor: string
  tagline: string
  chip?: string
  image: ImageInfo
}

export interface Manifest {
  version: number
  updatedAt: string
  models: ModelInfo[]
}

export interface DriveInfo {
  /** 用于写入的物理设备路径，例如 \\.\PhysicalDrive2 或 /dev/disk4 */
  device: string
  name: string
  size: number
  mountpoints: string[]
  isSystem: boolean
  isRemovable: boolean
  isReadOnly: boolean
  isUSB: boolean
  isInternal: boolean
  busType: string
  /** 是否禁止选中 */
  blocked: boolean
  blockReason?: string
}

export type JobPhase =
  | 'queued'
  | 'downloading'
  | 'verifying'
  | 'ready'
  | 'preparing'
  | 'writing'
  | 'finalizing'
  | 'done'
  | 'cancelled'
  | 'error'

export interface ProgressEvent {
  jobId: string
  kind: 'image' | 'flash'
  phase: JobPhase
  /** 已处理字节数 */
  received?: number
  total?: number
  percent?: number
  /** 字节/秒 */
  speed?: number
  message?: string
  sourceId?: PrepareSourceId
  filePath?: string
  sha256?: string
  expectedSha256?: string
  /** null 表示清单未配置期望哈希，无法比对 */
  hashMatched?: boolean | null
  fromCache?: boolean
}

export interface PrepareImageOptions {
  jobId: string
  modelId: string
  sourceId: SourceId
}

export interface PrepareLocalOptions {
  jobId: string
  modelId: string
}

export interface PrepareResult {
  filePath: string
  fileName: string
  size: number
  sha256: string
  expectedSha256: string
  hashMatched: boolean | null
  fromCache: boolean
  sourceId: PrepareSourceId
}

export interface StartFlashOptions {
  jobId: string
  imagePath: string
  expectedSha256: string
  device: string
  deviceLabel: string
  modelName: string
  imageVersion: string
  imageSize: number
}

export interface FlashResult {
  jobId: string
  cancelled: boolean
}

export interface AppInfo {
  version: string
  platform: Platform
  arch: string
}

export interface Settings {
  preferredSource: SourceId
}

export interface BootPayload {
  app: AppInfo
  manifest: Manifest
  settings: Settings
}

export interface FlasherApi {
  bootstrap(): Promise<BootPayload>
  listDrives(): Promise<DriveInfo[]>
  prepareImage(options: PrepareImageOptions): Promise<PrepareResult>
  prepareLocalImage(options: PrepareLocalOptions): Promise<PrepareResult | null>
  cancelPrepare(jobId: string): Promise<void>
  startFlash(options: StartFlashOptions): Promise<FlashResult>
  cancelFlash(jobId: string): Promise<void>
  setPreferredSource(source: SourceId): Promise<Settings>
  onProgress(listener: (event: ProgressEvent) => void): () => void
  openExternal(url: string): Promise<void>
  revealPath(target: string): Promise<void>
}
