import { createContext, useContext, useMemo, type JSX, type ReactNode } from 'react'
import { translate, type Locale, type MessageKey, type TranslateParams } from '../../shared/i18n'

export interface I18nValue {
  locale: Locale
  t: (key: MessageKey, params?: TranslateParams) => string
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }): JSX.Element {
  const value = useMemo<I18nValue>(
    () => ({
      locale,
      t: (key, params) => translate(locale, key, params)
    }),
    [locale]
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used inside I18nProvider')
  return value
}
