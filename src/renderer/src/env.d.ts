import type { FlasherApi } from '../../shared/types'

declare global {
  interface Window {
    api: FlasherApi
  }
}

export {}
