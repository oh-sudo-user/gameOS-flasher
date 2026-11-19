import type { JSX } from 'react'
import type { MessageKey } from '../../../shared/i18n'
import type { ModelInfo, PrepareSourceId, ReleaseStatus, SourceId } from '../../../shared/types'
import type { PrepareUiState } from '../types'
import { formatBytes, formatPercent, formatSpeed, shortHash } from '../format'
import { useI18n } from '../i18n'
import {
  IconAlert,
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconCloud,
  IconDownload,
  IconFolder,
  IconGithub,
  IconRefresh,
  IconShield
} from './Icons'

interface PrepareStepProps {
  model: ModelInfo
  prepare: PrepareUiState
  release: ReleaseStatus
  selectedSource: PrepareSourceId
  onChooseSource: (source: SourceId) => void
  onRefreshModels: () => void
  onRetry: () => void
  onCancel: () => void
  onLocal: () => void
  onReveal: () => void
  onBack: () => void
  onContinue: () => void
}

function sourceKey(id: PrepareSourceId): MessageKey {
  return id === 'local' ? 'source.local' : id === 'mirror' ? 'source.mirror' : 'source.official'
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

export function PrepareStep({
  model,
  prepare,
  release,
  selectedSource,
  onChooseSource,
  onRefreshModels,
  onRetry,
  onCancel,
  onLocal,
  onReveal,
  onBack,
  onContinue
}: PrepareStepProps): JSX.Element {
  const { t } = useI18n()
  const image = model.image

  if (!image) {
    return (
      <div className="stage-enter">
        <header className="stage-head">
          <div>
            <p className="eyebrow">STEP 03</p>
            <h2>{t('prepare.title')}</h2>
            <p className="stage-sub">{t('prepare.sub', { version: release.tag ?? '—', model: model.name })}</p>
          </div>
          <span className="head-chip">
            <IconShield size={14} /> SHA-256
          </span>
        </header>

        <div className="empty-state">
          <span className="empty-icon">
            <IconCloud size={34} />
          </span>
          <h3>{t('prepare.noImageTitle')}</h3>
          <p>{release.error || t('prepare.noImageBody', { model: model.name })}</p>
          <button type="button" className="btn btn-ghost" onClick={onRefreshModels}>
            <IconRefresh size={15} />
            {t('prepare.noImageRefresh')}
          </button>
        </div>

        <footer className="stage-actions">
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            <IconArrowLeft size={16} />
            {t('common.back')}
          </button>
        </footer>
      </div>
    )
  }

  const running = prepare.status === 'running'
  const ready = prepare.status === 'ready'
  const failed = prepare.status === 'error'
  const phaseText =
    prepare.phase === 'verifying'
      ? t('prepare.phase.verify')
      : prepare.phase === 'downloading'
        ? t('prepare.phase.download')
        : t('prepare.phase.prepare')

  return (
    <div className="stage-enter">
      <header className="stage-head">
        <div>
          <p className="eyebrow">STEP 03</p>
          <h2>{t('prepare.title')}</h2>
          <p className="stage-sub">{t('prepare.sub', { version: image.version, model: model.name })}</p>
        </div>
        <span className="head-chip">
          <IconShield size={14} /> SHA-256
        </span>
      </header>

      <div className="source-grid">
        {image.sources.map((source) => {
          const active = selectedSource === source.id
          const Icon = source.id === 'mirror' ? IconGithub : IconCloud
          return (
            <button
              type="button"
              key={source.id}
              className={`source-card ${active ? 'is-selected' : ''}`}
              onClick={() => onChooseSource(source.id)}
              disabled={running}
              aria-pressed={active}
            >
              <span className="source-icon">
                <Icon size={19} />
              </span>
              <span className="source-copy">
                <strong>{t(sourceKey(source.id))}</strong>
                <span>{hostOf(source.url)}</span>
              </span>
              {source.id === 'official' && <span className="source-tag">{t('prepare.recommended')}</span>}
              <span className="radio-mark" />
            </button>
          )
        })}
        <button
          type="button"
          className={`source-card ${selectedSource === 'local' ? 'is-selected' : ''}`}
          onClick={onLocal}
          disabled={running && prepare.sourceId !== 'local'}
          aria-pressed={selectedSource === 'local'}
        >
          <span className="source-icon">
            <IconFolder size={19} />
          </span>
          <span className="source-copy">
            <strong>{t('prepare.source.local')}</strong>
            <span>{t('prepare.source.localDesc')}</span>
          </span>
          <span className="radio-mark" />
        </button>
      </div>

      {running &&
        (prepare.sourceId === 'local' ? (
          <div className="progress-panel">
            <div className="progress-head">
              <span className="progress-title">
                <span className="pulse-dot" />
                {prepare.message || phaseText}
              </span>
              {prepare.received > 0 && <span className="progress-percent">{formatPercent(prepare.percent)}</span>}
            </div>
            {prepare.received > 0 && (
              <>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${Math.max(prepare.percent, 0.6)}%` }} />
                </div>
                <div className="progress-stats">
                  <span>
                    {formatBytes(prepare.received)} / {formatBytes(prepare.total)}
                  </span>
                </div>
              </>
            )}
            <button type="button" className="btn btn-ghost btn-sm progress-cancel" onClick={onCancel}>
              {t('common.cancel')}
            </button>
          </div>
        ) : (
          <div className="progress-panel">
            <div className="progress-head">
              <span className="progress-title">
                <span className="pulse-dot" />
                {phaseText}
              </span>
              <span className="progress-percent">{formatPercent(prepare.percent)}</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${Math.max(prepare.percent, 0.6)}%` }} />
            </div>
            <div className="progress-stats">
              <span>
                {formatBytes(prepare.received)} / {formatBytes(prepare.total)}
              </span>
              {prepare.phase === 'downloading' && <span>{formatSpeed(prepare.speed)}</span>}
              <span className="progress-message">{prepare.message}</span>
            </div>
            <button type="button" className="btn btn-ghost btn-sm progress-cancel" onClick={onCancel}>
              {t('common.cancel')}
            </button>
          </div>
        ))}

      {ready && (
        <div className="result-panel result-success">
          <div className="result-head">
            <span className="result-icon">
              <IconCheck size={20} />
            </span>
            <div>
              <h3>
                {prepare.fromCache ? t('prepare.readyCacheTitle') : t('prepare.readyTitle')}
                <span className={`badge ${prepare.hashMatched === null ? 'badge-amber' : 'badge-mint'}`}>
                  {prepare.hashMatched === null ? t('prepare.hashMissing') : t('prepare.hashPassed')}
                </span>
              </h3>
              <p>{prepare.fromCache ? t('prepare.readyCacheBody') : t('prepare.readyBody')}</p>
            </div>
          </div>

          <div className="detail-grid">
            <div className="detail-item">
              <span className="detail-label">{t('prepare.fileName')}</span>
              <span className="detail-value">{prepare.fileName || image.fileName}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">{t('prepare.fileSize')}</span>
              <span className="detail-value">{formatBytes(prepare.total || image.size)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">{t('prepare.source')}</span>
              <span className="detail-value">{t(sourceKey(prepare.sourceId))}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">{t('prepare.integrity')}</span>
              <span className="detail-value">
                {prepare.hashMatched === null ? (
                  <span className="text-amber">{t('prepare.noExpected')}</span>
                ) : (
                  <span className="text-mint">{t('prepare.hashConsistent')}</span>
                )}
              </span>
            </div>
          </div>

          <div className="hash-grid">
            <div className="hash-box">
              <span className="hash-label">{t('prepare.expectedHash')}</span>
              <code>{prepare.expectedSha256 || t('prepare.notConfigured')}</code>
            </div>
            <div className="hash-box">
              <span className="hash-label">{t('prepare.actualHash')}</span>
              <code>{prepare.sha256 || '—'}</code>
            </div>
          </div>

          <div className="result-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>
              <IconRefresh size={15} />
              {t('prepare.redownload')}
            </button>
            {prepare.filePath && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={onReveal}>
                <IconFolder size={15} />
                {t('prepare.reveal')}
              </button>
            )}
          </div>
        </div>
      )}

      {failed && (
        <div className="result-panel result-error">
          <div className="result-head">
            <span className="result-icon">
              <IconAlert size={20} />
            </span>
            <div>
              <h3>{t('prepare.failedTitle')}</h3>
              <p className="error-text">
                {prepare.error || prepare.message || t('prepare.failedBody')}
              </p>
            </div>
          </div>
          <div className="result-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>
              <IconRefresh size={15} />
              {prepare.sourceId === 'local' ? t('common.retry') : t('prepare.retryDownload')}
            </button>
          </div>
        </div>
      )}

      {!running && !ready && !failed &&
        (selectedSource === 'local' ? (
          <div className="waiting-panel">
            <span className="waiting-icon">
              <IconFolder size={24} />
            </span>
            <div>
              <h3>{t('prepare.pickLocal')}</h3>
              <p>{t('prepare.waitingLocalBody')}</p>
            </div>
            <div className="waiting-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={onLocal}>
                <IconFolder size={15} />
                {t('dialog.pickImageButton')}
              </button>
            </div>
          </div>
        ) : (
          <div className="waiting-panel">
            <span className="waiting-icon">
              <IconDownload size={24} />
            </span>
            <div>
              <h3>{t('prepare.waitingTitle', { file: image.fileName })}</h3>
              <p>{t('prepare.waitingBody', { size: formatBytes(image.size) })}</p>
            </div>
            <div className="waiting-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={onRetry}>
                <IconDownload size={15} />
                {t('prepare.startDownload')}
              </button>
            </div>
          </div>
        ))}

      {prepare.sha256 && !ready && (
        <div className="hash-inline">
          <span>{t('prepare.computed')}</span>
          <code title={prepare.sha256}>{shortHash(prepare.sha256)}</code>
        </div>
      )}

      <footer className="stage-actions">
        <button type="button" className="btn btn-ghost" onClick={onBack} disabled={running}>
          <IconArrowLeft size={16} />
          {t('common.back')}
        </button>
        <button type="button" className="btn btn-primary" onClick={onContinue} disabled={!ready}>
          {t('common.next')}
          <IconArrowRight size={16} />
        </button>
      </footer>
    </div>
  )
}
