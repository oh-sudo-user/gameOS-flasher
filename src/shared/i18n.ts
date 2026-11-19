import { en, type Messages } from './locales/en'
import { es } from './locales/es'
import { ja } from './locales/ja'
import { ko } from './locales/ko'
import { ru } from './locales/ru'
import { zhCN } from './locales/zh-CN'
import { zhTW } from './locales/zh-TW'

export type Locale = 'en' | 'ko' | 'zh-CN' | 'zh-TW' | 'ru' | 'ja' | 'es'
export type MessageKey = keyof Messages
export type TranslateParams = Record<string, string | number | undefined | null>

export const LOCALES: ReadonlyArray<{ id: Locale; native: string; english: string }> = [
  { id: 'en', native: 'English', english: 'English' },
  { id: 'ko', native: '한국어', english: 'Korean' },
  { id: 'zh-CN', native: '简体中文', english: 'Chinese (Simplified)' },
  { id: 'zh-TW', native: '繁體中文', english: 'Chinese (Traditional)' },
  { id: 'ru', native: 'Русский', english: 'Russian' },
  { id: 'ja', native: '日本語', english: 'Japanese' },
  { id: 'es', native: 'Español', english: 'Spanish' }
]

const dictionaries: Record<Locale, Messages> = {
  en,
  ko,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  ru,
  ja,
  es
}

export function normalizeLocale(value: string | null | undefined): Locale | null {
  if (!value) return null
  return (LOCALES.find((item) => item.id.toLowerCase() === value.toLowerCase())?.id as Locale | undefined) ?? null
}

export function detectLocale(tag: string): Locale {
  const value = String(tag || '').toLowerCase()
  if (value.startsWith('zh')) {
    return /(tw|hk|mo|hant)/.test(value) ? 'zh-TW' : 'zh-CN'
  }
  if (value.startsWith('ko')) return 'ko'
  if (value.startsWith('ja')) return 'ja'
  if (value.startsWith('ru')) return 'ru'
  if (value.startsWith('es')) return 'es'
  return 'en'
}

export function translate(locale: Locale, key: MessageKey, params?: TranslateParams): string {
  const template = dictionaries[locale]?.[key] ?? en[key] ?? String(key)
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name]
    return value === undefined || value === null ? match : String(value)
  })
}
