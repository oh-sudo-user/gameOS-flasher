import type { JSX } from 'react'
import type { DriveInfo, ModelInfo } from '../../../shared/types'
import type { FlashUiState, PrepareUiState } from '../types'
import { formatBytes, formatDuration, shortHash } from '../format'
import { useI18n } from '../i18n'
import { IconCheck, IconFolder, IconRefresh, IconSparkles } from './Icons'

interface DoneStepProps {
  model: ModelInfo
  drive: DriveInfo
  prepare: PrepareUiState
  flash: FlashUiState
  onRestart: () => void
  onReveal: () => void
}

export function DoneStep({ model, drive, prepare, flash, onRestart, onReveal }: DoneStepProps): JSX.Element {
  const { t } = useI18n()
  const elapsed = flash.startedAt && flash.finishedAt ? (flash.finishedAt - flash.startedAt) / 1000 : 0
  const version = prepare.version || model.image?.version || '—'
  const totalSize = prepare.total || model.image?.size || 0

  return (
    <div className="stage-enter done-stage">
      <div className="success-hero">
        <span className="success-orbit" aria-hidden="true" />
        <span className="success-check">
          <svg viewBox="0 0 52 52" className="check-svg">
            <circle cx="26" cy="26" r="23" className="check-circle" />
            <path d="M15 27.2l7.2 7.2L37 19.6" className="check-mark" />
          </svg>
        </span>
        <h2>{t('done.title')}</h2>
        <p>{t('done.sub', { version, drive: drive.name })}</p>
      </div>

      <div className="recap-grid">
        <div className="recap-item">
          <span>{t('done.model')}</span>
          <strong>{model.name}</strong>
        </div>
        <div className="recap-item">
          <span>{t('done.version')}</span>
          <strong>gameOS {version}</strong>
        </div>
        <div className="recap-item">
          <span>{t('done.size')}</span>
          <strong>{formatBytes(totalSize)}</strong>
        </div>
        <div className="recap-item">
          <span>{t('done.duration')}</span>
          <strong>{formatDuration(elapsed, t)}</strong>
        </div>
      </div>

      <div className="hash-final">
        <span>SHA-256</span>
        <code title={prepare.sha256}>{shortHash(prepare.sha256)}</code>
        <span className="badge badge-mint">
          <IconCheck size={12} /> {t('done.verified')}
        </span>
      </div>

      <div className="tip-card">
        <span className="tip-icon">
          <IconSparkles size={20} />
        </span>
        <div>
          <h3>{t('done.nextTitle')}</h3>
          <p>{t('done.nextBody')}</p>
        </div>
      </div>

      <footer className="stage-actions stage-actions-end">
        <button type="button" className="btn btn-ghost" onClick={onReveal}>
          <IconFolder size={16} />
          {t('done.reveal')}
        </button>
        <button type="button" className="btn btn-primary" onClick={onRestart}>
          <IconRefresh size={16} />
          {t('done.again')}
        </button>
      </footer>
    </div>
  )
}
