import type { JSX } from 'react'
import type { DriveInfo, ModelInfo } from '../../../shared/types'
import type { FlashUiState, PrepareUiState } from '../types'
import { formatBytes, formatDuration, shortHash } from '../format'
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
  const elapsed = flash.startedAt && flash.finishedAt ? (flash.finishedAt - flash.startedAt) / 1000 : 0

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
        <h2>刷写完成</h2>
        <p>
          已成功将 <strong>gameOS {model.image.version}</strong> 写入 {drive.name}
        </p>
      </div>

      <div className="recap-grid">
        <div className="recap-item">
          <span>设备型号</span>
          <strong>{model.name}</strong>
        </div>
        <div className="recap-item">
          <span>镜像版本</span>
          <strong>gameOS {model.image.version}</strong>
        </div>
        <div className="recap-item">
          <span>写入容量</span>
          <strong>{formatBytes(prepare.total || model.image.size)}</strong>
        </div>
        <div className="recap-item">
          <span>耗时</span>
          <strong>{formatDuration(elapsed)}</strong>
        </div>
      </div>

      <div className="hash-final">
        <span>SHA-256</span>
        <code title={prepare.sha256}>{shortHash(prepare.sha256)}</code>
        <span className="badge badge-mint">
          <IconCheck size={12} /> 已校验
        </span>
      </div>

      <div className="tip-card">
        <span className="tip-icon">
          <IconSparkles size={20} />
        </span>
        <div>
          <h3>接下来</h3>
          <p>安全拔出存储卡，插入设备后开机。首次启动需要初始化文件系统，通常需要 1–2 分钟，请耐心等待。</p>
        </div>
      </div>

      <footer className="stage-actions stage-actions-end">
        <button type="button" className="btn btn-ghost" onClick={onReveal}>
          <IconFolder size={16} />
          打开镜像位置
        </button>
        <button type="button" className="btn btn-primary" onClick={onRestart}>
          <IconRefresh size={16} />
          再刷一张
        </button>
      </footer>
    </div>
  )
}
