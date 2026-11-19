import { useState, type JSX } from 'react'
import type { DriveInfo, ModelInfo } from '../../../shared/types'
import type { FlashUiState, PrepareUiState } from '../types'
import { formatBytes, formatDuration, shortHash } from '../format'
import { useI18n } from '../i18n'
import { IconCheck, IconFolder, IconRefresh, IconSparkles, IconTrash } from './Icons'

interface DoneStepProps {
  model: ModelInfo
  drive: DriveInfo
  prepare: PrepareUiState
  flash: FlashUiState
  onRestart: () => void
  onCleanup: (filePath: string) => Promise<boolean>
  onReveal: () => void
}

export function DoneStep({
  model,
  drive,
  prepare,
  flash,
  onRestart,
  onCleanup,
  onReveal
}: DoneStepProps): JSX.Element {
  const { t } = useI18n()
  const [cleanup, setCleanup] = useState<'pending' | 'kept' | 'removed'>('pending')
  const elapsed = flash.startedAt && flash.finishedAt ? (flash.finishedAt - flash.startedAt) / 1000 : 0
  const version = prepare.version || model.image?.version || '—'
  const totalSize = prepare.total || model.image?.size || 0
  // 仅当镜像来自缓存（下载 / 本地 gz 解压）时才提供清理
  const cleanupApplies =
    prepare.sourceId !== 'local' || prepare.fileName.startsWith('local-')

  const handleCleanupDelete = async (): Promise<void> => {
    if (!prepare.filePath) {
      setCleanup('removed')
      return
    }
    await onCleanup(prepare.filePath)
    setCleanup('removed')
  }

  const handleAgain = async (): Promise<void> => {
    // 默认不保留：未手动选择时，继续操作前先删除缓存镜像
    if (cleanup === 'pending' && cleanupApplies && prepare.filePath) {
      await handleCleanupDelete()
    }
    onRestart()
  }

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

      {cleanupApplies && (
        <div className="cleanup-card">
          {cleanup === 'pending' ? (
            <>
              <div>
                <h3>{t('done.cleanupTitle')}</h3>
                <p>{t('done.cleanupBody', { size: formatBytes(totalSize) })}</p>
                <p className="cleanup-hint">{t('done.cleanupHint')}</p>
              </div>
              <div className="cleanup-actions">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void handleCleanupDelete()}>
                  <IconTrash size={15} />
                  {t('done.cleanupDelete')}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCleanup('kept')}>
                  {t('done.cleanupKeep')}
                </button>
              </div>
            </>
          ) : (
            <div className="cleanup-state">
              <IconCheck size={16} />
              {cleanup === 'removed' ? t('done.cleanupRemoved') : t('done.cleanupKept')}
            </div>
          )}
        </div>
      )}

      <footer className="stage-actions stage-actions-end">
        {cleanup !== 'removed' && (
          <button type="button" className="btn btn-ghost" onClick={onReveal}>
            <IconFolder size={16} />
            {t('done.reveal')}
          </button>
        )}
        <button type="button" className="btn btn-primary" onClick={() => void handleAgain()}>
          <IconRefresh size={16} />
          {t('done.again')}
        </button>
      </footer>
    </div>
  )
}
