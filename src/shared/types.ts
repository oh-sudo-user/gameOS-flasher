import type { Locale } from './i18n'

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
  /** 期望的 SHA-256；留空表示 Release 暂未提供校验值 */
  sha256: string
  releaseTag: string
  publishedAt: string
  sources: ImageSource[]
}

/** manifest.json 中的静态机型定义，镜像信息在运行时从 GitHub Release 解析 */
export interface ManifestModel {
  id: string
  name: string
  vendor: string
  tagline: string
  chip?: string
  /** 用于匹配 Release 资源文件名的关键字，例如 rg-ds-plus */
  assetMatch: string
}

export interface ModelInfo extends ManifestModel {
  /** null 表示最新 Release 中还没有该机型的镜像 */
  image: ImageInfo | null
}

export interface ReleaseConfig {
  owner: string
  repo: string
  /** 可选加速前缀，例如 https://ghfast.top/ ；留空则只使用 GitHub 直链 */
  mirrorPrefix?: string
}

export interface Manifest {
  version: number
  updatedAt: string
  release: ReleaseConfig
  models: ManifestModel[]
}

export interface ReleaseStatus {
  tag: string | null
  publishedAt: string | null
  /** 已本地化的错误信息，空字符串表示解析成功 */
  error: string
}

export interface ModelsPayload {
  models: ModelInfo[]
  release: ReleaseStatus
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
  /** 禁止选中的原因（i18n 文案键，由渲染层翻译） */
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
  /** null 表示 Release 未提供期望哈希，无法比对 */
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
  /** 实际写入文件（解压后的 .img）的 SHA-256，用于刷写前二次校验 */
  fileSha256: string
  hashMatched: boolean | null
  fromCache: boolean
  sourceId: PrepareSourceId
  version: string
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
  /** null 表示首次启动，尚未选择语言 */
  locale: Locale | null
}

export interface BootPayload {
  app: AppInfo
  manifest: Manifest
  models: ModelInfo[]
  release: ReleaseStatus
  settings: Settings
  /** 系统检测到的语言，用于在语言选择页高亮 */
  systemLocale: Locale
}

export interface FlasherApi {
  bootstrap(): Promise<BootPayload>
  refreshModels(): Promise<ModelsPayload>
  listDrives(): Promise<DriveInfo[]>
  prepareImage(options: PrepareImageOptions): Promise<PrepareResult>
  prepareLocalImage(options: PrepareLocalOptions): Promise<PrepareResult | null>
  cleanupImage(filePath: string): Promise<boolean>
  cancelPrepare(jobId: string): Promise<void>
  startFlash(options: StartFlashOptions): Promise<FlashResult>
  cancelFlash(jobId: string): Promise<void>
  setPreferredSource(source: SourceId): Promise<Settings>
  setLocale(locale: Locale): Promise<Settings>
  onProgress(listener: (event: ProgressEvent) => void): () => void
  openExternal(url: string): Promise<void>
  revealPath(target: string): Promise<void>
}
