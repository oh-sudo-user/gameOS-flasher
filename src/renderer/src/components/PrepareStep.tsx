import type { JSX } from 'react'
import type { ModelInfo, SourceId } from '../../../shared/types'
import type { PrepareUiState } from '../types'
import { formatBytes, formatPercent, formatSpeed, shortHash } from '../format'
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
  onChooseSource: (source: SourceId) => void
  onRetry: () => void
  onCancel: () => void
  onLocal: () => void
  onBack: () => void
  onContinue: () => void
}

const sourceMeta = {
  official: { title: '官方 CDN', desc: '全球加速 · 推荐', icon: IconCloud },
  mirror: { title: 'GitHub 镜像', desc: '备用线路 · 稳定', icon: IconGithub }
} as const

export function PrepareStep({
  model,
  prepare,
  onChooseSource,
  onRetry,
  onCancel,
  onLocal,
  onBack,
  onContinue
}: PrepareStepProps): JSX.Element {
  const running = prepare.status === 'running'
  const ready = prepare.status === 'ready'
  const failed = prepare.status === 'error'
  const phaseText =
    prepare.phase === 'verifying'
      ? '正在校验 SHA-256'
      : prepare.phase === 'downloading'
        ? '正在下载镜像'
        : '正在准备镜像'

  return (
    <div className="stage-enter">
      <header className="stage-head">
        <div>
          <p className="eyebrow">STEP 03</p>
          <h2>下载并校验镜像</h2>
          <p className="stage-sub">
            gameOS {model.image.version} · {model.name} · 写入前会再次验证完整性。
          </p>
        </div>
        <span className="head-chip">
          <IconShield size={14} /> SHA-256
        </span>
      </header>

      <div className="source-grid">
        {(Object.keys(sourceMeta) as SourceId[]).map((id) => {
          const meta = sourceMeta[id]
          const source = model.image.sources.find((item) => item.id === id)
          const active = prepare.sourceId === id
          const Icon = meta.icon
          return (
            <button
              type="button"
              key={id}
              className={`source-card ${active ? 'is-selected' : ''}`}
              onClick={() => onChooseSource(id)}
              disabled={running || !source}
              aria-pressed={active}
            >
              <span className="source-icon">
                <Icon size={19} />
              </span>
              <span className="source-copy">
                <strong>{meta.title}</strong>
                <span>{meta.desc}</span>
              </span>
              {id === 'official' && <span className="source-tag">推荐</span>}
              <span className="radio-mark" />
            </button>
          )
        })}
      </div>

      {prepare.sourceId === 'local' && (
        <div className="local-note">
          <IconFolder size={15} />
          正在使用本地镜像
          {prepare.fileName ? `：${prepare.fileName}` : ''}
        </div>
      )}

      {running && (
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
            取消
          </button>
        </div>
      )}

      {ready && (
        <div className="result-panel result-success">
          <div className="result-head">
            <span className="result-icon">
              <IconCheck size={20} />
            </span>
            <div>
              <h3>
                {prepare.fromCache ? '已复用本地缓存' : '镜像下载完成'}
                {prepare.hashMatched === null ? '（未配置官方校验值）' : '，SHA-256 校验通过'}
              </h3>
              <p>
                {prepare.fromCache ? '缓存文件与清单一致，无需重新下载。' : '文件已保存到本地缓存，随时可以开始写入。'}
              </p>
            </div>
          </div>

          <div className="detail-grid">
            <div className="detail-item">
              <span className="detail-label">镜像文件</span>
              <span className="detail-value">{prepare.fileName || model.image.fileName}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">文件大小</span>
              <span className="detail-value">{formatBytes(prepare.total || model.image.size)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">来源</span>
              <span className="detail-value">
                {prepare.sourceId === 'local'
                  ? '本地文件'
                  : prepare.sourceId === 'mirror'
                    ? 'GitHub 镜像'
                    : '官方 CDN'}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-label">完整性</span>
              <span className="detail-value">
                {prepare.hashMatched === null ? (
                  <span className="text-amber">清单未配置校验值</span>
                ) : (
                  <span className="text-mint">SHA-256 一致</span>
                )}
              </span>
            </div>
          </div>

          <div className="hash-grid">
            <div className="hash-box">
              <span className="hash-label">官方 SHA-256</span>
              <code>{prepare.expectedSha256 || '— 未配置 —'}</code>
            </div>
            <div className="hash-box">
              <span className="hash-label">实际 SHA-256</span>
              <code>{prepare.sha256 || '—'}</code>
            </div>
          </div>

          <div className="result-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>
              <IconRefresh size={15} />
              重新下载
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onLocal}>
              <IconFolder size={15} />
              改用本地镜像
            </button>
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
              <h3>镜像准备失败</h3>
              <p className="error-text">{prepare.error || prepare.message || '下载或校验过程中出现错误'}</p>
            </div>
          </div>
          <div className="result-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>
              <IconRefresh size={15} />
              重试下载
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onLocal}>
              <IconFolder size={15} />
              使用本地镜像
            </button>
          </div>
        </div>
      )}

      {!running && !ready && !failed && (
        <div className="waiting-panel">
          <span className="waiting-icon">
            <IconDownload size={24} />
          </span>
          <div>
            <h3>准备下载 {model.image.fileName}</h3>
            <p>预计下载 {formatBytes(model.image.size)}，完成后会自动校验 SHA-256。</p>
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={onRetry}>
            开始
          </button>
        </div>
      )}

      <button type="button" className="link-btn" onClick={onLocal} disabled={running}>
        <IconFolder size={15} />
        已有镜像文件？选择本地镜像
      </button>

      {prepare.sha256 && !ready && (
        <div className="hash-inline">
          <span>已计算 SHA-256</span>
          <code title={prepare.sha256}>{shortHash(prepare.sha256)}</code>
        </div>
      )}

      <footer className="stage-actions">
        <button type="button" className="btn btn-ghost" onClick={onBack} disabled={running}>
          <IconArrowLeft size={16} />
          上一步
        </button>
        <button type="button" className="btn btn-primary" onClick={onContinue} disabled={!ready}>
          下一步
          <IconArrowRight size={16} />
        </button>
      </footer>
    </div>
  )
}
