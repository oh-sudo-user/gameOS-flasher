import { useEffect, useState, type JSX } from 'react'
import type { DriveInfo, ModelInfo } from '../../../shared/types'
import type { FlashUiState, PrepareUiState } from '../types'
import { formatBytes, formatDuration, formatPercent, formatSpeed } from '../format'
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
  const running = flash.status === 'running'
  const elapsed = useElapsed(flash.startedAt, running)

  if (running) {
    const ringLabel =
      flash.phase === 'preparing' ? '校验镜像' : flash.phase === 'finalizing' ? '刷新缓存' : '正在写入'
    const ringSub = flash.phase === 'preparing' ? 'SHA-256' : flash.phase === 'finalizing' ? '即将完成' : '请勿拔出存储卡'

    return (
      <div className="stage-enter flash-running">
        <header className="stage-head stage-head-center">
          <div>
            <p className="eyebrow">STEP 04 · 写入中</p>
            <h2>正在写入 gameOS</h2>
            <p className="stage-sub">{flash.message || '正在将镜像写入存储卡，请保持连接稳定。'}</p>
          </div>
        </header>

        <div className="ring-area">
          <ProgressRing percent={flash.percent} label={ringLabel} sublabel={ringSub} />
        </div>

        <div className="flash-stats">
          <div className="stat">
            <span className="stat-label">写入速度</span>
            <strong>{formatSpeed(flash.speed)}</strong>
          </div>
          <div className="stat">
            <span className="stat-label">已写入</span>
            <strong>
              {formatBytes(flash.received)}
              <small> / {formatBytes(flash.total || prepare.total || model.image.size)}</small>
            </strong>
          </div>
          <div className="stat">
            <span className="stat-label">已用时</span>
            <strong>{formatDuration(elapsed)}</strong>
          </div>
        </div>

        <div className="flash-warning">
          <IconLock size={16} />
          写入期间请不要关闭电脑、休眠或拔出存储卡，否则可能损坏镜像。
        </div>

        <div className="flash-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            取消写入
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
            <h2>{flash.status === 'cancelled' ? '写入已取消' : '写入失败'}</h2>
            <p className="stage-sub">
              {flash.status === 'cancelled'
                ? '存储卡可能处于不完整状态，重新刷写即可恢复。'
                : '请检查读卡器连接或更换存储卡后重试。'}
            </p>
          </div>
        </header>

        <div className="result-panel result-error">
          <div className="result-head">
            <span className="result-icon">
              <IconAlert size={20} />
            </span>
            <div>
              <h3>{flash.status === 'cancelled' ? '刷写中断' : '无法完成写入'}</h3>
              <p className="error-text">{flash.error || flash.message || '未知错误'}</p>
            </div>
          </div>
          <div className="result-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={onRetry}>
              <IconRefresh size={15} />
              重新刷写
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
              <IconArrowLeft size={15} />
              更换存储卡
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
          <h2>确认并开始写入</h2>
          <p className="stage-sub">这是最后一步，写入后存储卡上的原有数据将无法恢复。</p>
        </div>
        <span className="head-chip">
          <IconShield size={14} /> SHA-256 已通过
        </span>
      </header>

      <div className="confirm-card">
        <div className="confirm-main">
          <span className="confirm-icon">
            <IconSparkles size={22} />
          </span>
          <div>
            <h3>
              gameOS {model.image.version} · {model.name}
            </h3>
            <p>
              {formatBytes(prepare.total || model.image.size)} 镜像 → {drive.name}（{formatBytes(drive.size)}）
            </p>
          </div>
        </div>
        <div className="confirm-rows">
          <div>
            <span>目标设备</span>
            <strong>{drive.device}</strong>
          </div>
          <div>
            <span>挂载点</span>
            <strong>{drive.mountpoints.length ? drive.mountpoints.join(' · ') : '未挂载'}</strong>
          </div>
          <div>
            <span>镜像文件</span>
            <strong>{prepare.fileName || model.image.fileName}</strong>
          </div>
        </div>
      </div>

      <div className="alert alert-danger">
        <IconAlert size={18} />
        <div>
          <strong>写入会彻底清空这张存储卡</strong>
          <p>所有分区、游戏存档与数据都会被覆盖。请确认已经备份，并只选中了目标存储卡。</p>
        </div>
      </div>

      <label className={`ack ${acknowledged ? 'is-checked' : ''}`}>
        <input type="checkbox" checked={acknowledged} onChange={(event) => onAcknowledge(event.target.checked)} />
        <span className="ack-box">{acknowledged && <IconCheck size={13} />}</span>
        <span>
          我已备份存储卡中的数据，并确认写入 <strong>{drive.name}</strong>
        </span>
      </label>

      <footer className="stage-actions">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          <IconArrowLeft size={16} />
          上一步
        </button>
        <button type="button" className="btn btn-primary btn-start" onClick={onStart} disabled={!acknowledged}>
          <IconShield size={17} />
          开始刷写
        </button>
      </footer>
    </div>
  )
}
