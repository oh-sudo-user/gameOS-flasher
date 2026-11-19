import type { JSX } from 'react'
import type { MessageKey } from '../../../shared/i18n'
import type { ModelInfo } from '../../../shared/types'
import { formatBytes } from '../format'
import { useI18n } from '../i18n'
import { IconArrowRight, IconCheck, IconChip, IconHandheld } from './Icons'

interface ModelStepProps {
  models: ModelInfo[]
  selectedId?: string
  onSelect: (model: ModelInfo) => void
  onContinue: () => void
}

function taglineKey(id: string): MessageKey {
  return id === 'rg-ds-plus' ? 'tagline.rg-ds-plus' : 'tagline.rg-ds'
}

export function ModelStep({ models, selectedId, onSelect, onContinue }: ModelStepProps): JSX.Element {
  const { t } = useI18n()

  return (
    <div className="stage-enter">
      <header className="stage-head">
        <div>
          <p className="eyebrow">STEP 01</p>
          <h2>{t('model.title')}</h2>
          <p className="stage-sub">{t('model.sub')}</p>
        </div>
        <span className="head-chip">
          <IconChip size={14} /> {t('model.count', { n: models.length })}
        </span>
      </header>

      <div className="model-grid">
        {models.map((model, index) => {
          const selected = model.id === selectedId
          const image = model.image
          return (
            <button
              type="button"
              key={model.id}
              className={`model-card tone-${index % 4} ${selected ? 'is-selected' : ''}`}
              onClick={() => onSelect(model)}
              aria-pressed={selected}
            >
              <div className="model-top">
                <span className="model-avatar">
                  <IconHandheld size={26} />
                </span>
                <span className="model-vendor">{model.vendor}</span>
                {selected && (
                  <span className="model-check">
                    <IconCheck size={13} />
                  </span>
                )}
              </div>
              <h3>{model.name}</h3>
              <p className="model-tagline">{t(taglineKey(model.id))}</p>
              <div className="model-meta">
                {image ? (
                  <>
                    <span className="pill">{model.chip ?? 'gameOS'}</span>
                    <span className="dot-sep" />
                    <span>{formatBytes(image.size)}</span>
                    <span className="dot-sep" />
                    <span>v{image.version}</span>
                  </>
                ) : (
                  <span className="pill is-pending">{t('model.noImage')}</span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      <div className="stage-note">
        <span className="note-dot" />
        {t('model.note')}
      </div>

      <footer className="stage-actions">
        <span className="action-hint">{selectedId ? t('model.selectedHint') : t('model.pickHint')}</span>
        <button type="button" className="btn btn-primary" onClick={onContinue} disabled={!selectedId}>
          {t('common.continue')}
          <IconArrowRight size={16} />
        </button>
      </footer>
    </div>
  )
}
