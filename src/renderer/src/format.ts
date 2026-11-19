import type { MessageKey } from '../../shared/i18n'

type TranslateFn = (key: MessageKey, params?: Record<string, string | number>) => string

export function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(unit === 0 ? 0 : digits)} ${units[unit]}`
}

export function formatSpeed(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '—'
  return `${formatBytes(bytesPerSecond)}/s`
}

export function formatDuration(seconds: number, t: TranslateFn): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return t('duration.seconds', { s: 0 })
  const total = Math.round(seconds)
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  if (minutes <= 0) return t('duration.seconds', { s: rest })
  return t('duration.minutes', { m: minutes, s: rest.toString().padStart(2, '0') })
}

export function formatPercent(percent: number): string {
  if (!Number.isFinite(percent)) return '0%'
  return `${Math.min(100, Math.max(0, percent)).toFixed(percent >= 10 ? 0 : 1)}%`
}

export function formatDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  try {
    return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }).format(date)
  } catch {
    return iso
  }
}

export function shortHash(hash: string): string {
  if (!hash) return '—'
  if (hash.length <= 24) return hash
  return `${hash.slice(0, 12)}…${hash.slice(-8)}`
}

export function createJobId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 8)
  return `${prefix}-${Date.now().toString(36)}-${random}`
}
