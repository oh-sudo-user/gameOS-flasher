import { useEffect, useState, type JSX } from 'react'
import type { DriveInfo, ModelInfo } from '../../../shared/types'
import type { FlashUiState, PrepareUiState } from '../types'
import { formatBytes, formatDuration, formatPercent, formatSpeed } from '../format'
import { useI18n } from '../i18n'
import {
  IconAlert,
  IconArrowLeft,
  IconCheck,
  IconLock,
  IconRefresh,
  IconShield,
  IconSparkles
} from './Icons'

interface FlashStepProps {
  model: ModelInfo
  drive: DriveInfo
  prepare: PrepareUiState
  flash: FlashUiState
  acknowledged: boolean
  onAcknowledge: (value: boolean) => void
  onStart: () => void
  onCancel: () => void
  onRetry: () => void
  onBack: () => void
}

function useElapsed(startedAt: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!active || !startedAt) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [startedAt, active])

  if (!startedAt) return 0
  return Math.max(0, (now - startedAt) / 1000)
}

function ProgressRing({ percent, label, sublabel }: { percent: number; label: string; sublabel: string }): JSX.Element {
  const radius = 76
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - Math.min(100, Math.max(0, percent)) / 100)

  return (
    <div className="ring-wrap">
      <svg width="196" height="196" viewBox="0 0 196 196" className="ring">
        <circle cx="98" cy="98" r={radius} className="ring-bg" strokeWidth="9" />
        <circle
          cx="98"
          cy="98"
          r={radius}
          className="ring-fill"
          strokeWidth="9"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="ring-center">
        <strong>{formatPercent(percent)}</strong>
        <span>{label}</span>
        <em>{sublabel}</em>
      </div>
    </div>
  )
}

export function FlashStep({
  model,
  drive,
  prepare,
  flash,
  acknowledged,
  onAcknowledge,
  onStart,
  onCancel,
  onRetry,
  onBack
}: FlashStepProps): JSX.Element {
  const { t } = useI18n()
  const running = flash.status === 'running'
  const elapsed = useElapsed(flash.startedAt, running)
  const version = prepare.version || model.image?.version || '—'
  const totalSize = flash.total || prepare.total || model.image?.size || 0
  const fileName = prepare.fileName || model.image?.fileName || '—'

  if (running) {
    const ringLabel =
      flash.phase === 'preparing'
        ? t('flash.ring.preparing')
        : flash.phase === 'finalizing'
          ? t('flash.ring.finalizing')
          : t('flash.ring.writing')
    const ringSub =
      flash.phase === 'preparing'
        ? t('flash.ring.sha')
        : flash.phase === 'finalizing'
          ? t('flash.ring.almost')
          : t('flash.ring.keep')

    return (
      <div className="stage-enter flash-running">
        <header className="stage-head stage-head-center">
          <div>
            <p className="eyebrow">{t('flash.runningEyebrow')}</p>
            <h2>{t('flash.runningTitle')}</h2>
            <p className="stage-sub">{flash.message || t('flash.runningSub')}</p>
          </div>
        </header>

        <div className="ring-area">
          <ProgressRing percent={flash.percent} label={ringLabel} sublabel={ringSub} />
        </div>

        <div className="flash-stats">
          <div className="stat">
            <span className="stat-label">{t('flash.speed')}</span>
            <strong>{formatSpeed(flash.speed)}</strong>
          </div>
          <div className="stat">
            <span className="stat-label">{t('flash.written')}</span>
            <strong>
              {formatBytes(flash.received)}
              <small> / {formatBytes(totalSize)}</small>
            </strong>
          </div>
          <div className="stat">
            <span className="stat-label">{t('flash.elapsed')}</span>
            <strong>{formatDuration(elapsed, t)}</strong>
          </div>
        </div>

        <div className="flash-warning">
          <IconLock size={16} />
          {t('flash.warning')}
        </div>

        <div className="flash-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {t('flash.cancel')}
          </button>
        </div>
      </div>
    )
  }

  if (flash.status === 'error' || flash.status === 'cancelled') {
    return (
      <div className="stage-enter">
        <header className="stage-head">
          <div>
            <p className="eyebrow">STEP 04</p>
            <h2>{flash.status === 'cancelled' ? t('flash.cancelledTitle') : t('flash.failedTitle')}</h2>
            <p className="stage-sub">
              {flash.status === 'cancelled' ? t('flash.cancelledSub') : t('flash.failedSub')}
            </p>
          </div>
        </header>

        <div className="result-panel result-error">
          <div className="result-head">
            <span className="result-icon">
              <IconAlert size={20} />
            </span>
            <div>
              <h3>{flash.status === 'cancelled' ? t('flash.interrupted') : t('flash.cannotFinish')}</h3>
              <p className="error-text">{flash.error || flash.message || t('flash.unknownError')}</p>
            </div>
          </div>
          <div className="result-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={onRetry}>
              <IconRefresh size={15} />
              {t('flash.retry')}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
              <IconArrowLeft size={15} />
              {t('flash.changeDrive')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="stage-enter">
      <header className="stage-head">
        <div>
          <p className="eyebrow">STEP 04</p>
          <h2>{t('flash.confirmTitle')}</h2>
          <p className="stage-sub">{t('flash.confirmSub')}</p>
        </div>
        <span className="head-chip">
          <IconShield size={14} /> {t('flash.hashPassedChip')}
        </span>
      </header>

      <div className="confirm-card">
        <div className="confirm-main">
          <span className="confirm-icon">
            <IconSparkles size={22} />
          </span>
          <div>
            <h3>
              gameOS {version} · {model.name}
            </h3>
            <p>
              {t('flash.confirmImage', {
                size: formatBytes(totalSize),
                drive: drive.name,
                driveSize: formatBytes(drive.size)
              })}
            </p>
          </div>
        </div>
        <div className="confirm-rows">
          <div>
            <span>{t('flash.targetDevice')}</span>
            <strong>{drive.device}</strong>
          </div>
          <div>
            <span>{t('flash.mountpoint')}</span>
            <strong>{drive.mountpoints.length ? drive.mountpoints.join(' · ') : t('common.unmounted')}</strong>
          </div>
          <div>
            <span>{t('flash.imageFile')}</span>
            <strong>{fileName}</strong>
          </div>
        </div>
      </div>

      <div className="alert alert-danger">
        <IconAlert size={18} />
        <div>
          <strong>{t('flash.wipeTitle')}</strong>
          <p>{t('flash.wipeBody')}</p>
        </div>
      </div>

      <label className={`ack ${acknowledged ? 'is-checked' : ''}`}>
        <input type="checkbox" checked={acknowledged} onChange={(event) => onAcknowledge(event.target.checked)} />
        <span className="ack-box">{acknowledged && <IconCheck size={13} />}</span>
        <span>{t('flash.ack', { drive: drive.name })}</span>
      </label>

      <footer className="stage-actions">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          <IconArrowLeft size={16} />
          {t('common.back')}
        </button>
        <button type="button" className="btn btn-primary btn-start" onClick={onStart} disabled={!acknowledged}>
          <IconShield size={17} />
          {t('flash.start')}
        </button>
      </footer>
    </div>
  )
}
