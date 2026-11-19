import type { JobPhase, PrepareSourceId } from '../../shared/types'

export type Stage = 'model' | 'drive' | 'prepare' | 'flash' | 'done'

export interface PrepareUiState {
  status: 'idle' | 'running' | 'ready' | 'error'
  phase: JobPhase
  percent: number
  speed: number
  received: number
  total: number
  message: string
  error: string
  sourceId: PrepareSourceId
  sha256: string
  expectedSha256: string
  fileSha256: string
  hashMatched: boolean | null
  filePath: string
  fileName: string
  fromCache: boolean
  version: string
  modelId: string
  jobId: string
}

export interface FlashUiState {
  status: 'idle' | 'running' | 'error' | 'cancelled' | 'done'
  phase: JobPhase
  percent: number
  speed: number
  received: number
  total: number
  message: string
  error: string
  jobId: string
  startedAt: number
  finishedAt: number
}

export const initialPrepare: PrepareUiState = {
  status: 'idle',
  phase: 'queued',
  percent: 0,
  speed: 0,
  received: 0,
  total: 0,
  message: '',
  error: '',
  sourceId: 'official',
  sha256: '',
  expectedSha256: '',
  fileSha256: '',
  hashMatched: null,
  filePath: '',
  fileName: '',
  fromCache: false,
  version: '',
  modelId: '',
  jobId: ''
}

export const initialFlash: FlashUiState = {
  status: 'idle',
  phase: 'queued',
  percent: 0,
  speed: 0,
  received: 0,
  total: 0,
  message: '',
  error: '',
  jobId: '',
  startedAt: 0,
  finishedAt: 0
}
