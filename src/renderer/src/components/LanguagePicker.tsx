import type { JSX } from 'react'
import { LOCALES, type Locale } from '../../../shared/i18n'
import { useI18n } from '../i18n'
import { IconCheck, IconClose, IconGlobe, IconLogo } from './Icons'

interface LanguagePickerProps {
  detected: Locale
  current: Locale | null
  onSelect: (locale: Locale) => void
  onClose?: () => void
}

export function LanguagePicker({ detected, current, onSelect, onClose }: LanguagePickerProps): JSX.Element {
  const { t } = useI18n()

  return (
    <div
      className={`lang-overlay ${onClose ? 'is-modal' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={t('lang.title')}
    >
      <div className="lang-panel">
        {onClose && (
          <button type="button" className="lang-close" onClick={onClose} aria-label={t('common.cancel')}>
            <IconClose size={18} />
          </button>
        )}

        <span className="lang-brand">
          <IconLogo size={30} />
          <span className="lang-globe">
            <IconGlobe size={14} />
          </span>
        </span>

        <h2>{t('lang.title')}</h2>
        <p>{t('lang.sub')}</p>

        <div className="lang-grid">
          {LOCALES.map((item) => {
            const active = current === item.id
            return (
              <button
                type="button"
                key={item.id}
                className={`lang-option ${active ? 'is-active' : ''}`}
                onClick={() => onSelect(item.id)}
                aria-pressed={active}
              >
                <span className="lang-native">{item.native}</span>
                <span className="lang-english">{item.english}</span>
                {item.id === detected && <span className="lang-detected">{t('lang.detected')}</span>}
                {active && (
                  <span className="lang-check">
                    <IconCheck size={13} />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
