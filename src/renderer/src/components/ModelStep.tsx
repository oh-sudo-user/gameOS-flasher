import type { JSX } from 'react'
import type { ModelInfo } from '../../../shared/types'
import { formatBytes } from '../format'
import { IconArrowRight, IconCheck, IconChip, IconHandheld } from './Icons'

interface ModelStepProps {
  models: ModelInfo[]
  selectedId?: string
  onSelect: (model: ModelInfo) => void
  onContinue: () => void
}

export function ModelStep({ models, selectedId, onSelect, onContinue }: ModelStepProps): JSX.Element {
  return (
    <div className="stage-enter">
      <header className="stage-head">
        <div>
          <p className="eyebrow">STEP 01</p>
          <h2>你的设备是哪一台？</h2>
          <p className="stage-sub">选择机型后，我们会自动匹配对应的 gameOS 镜像与校验值。</p>
        </div>
        <span className="head-chip">
          <IconChip size={14} /> {models.length} 款机型
        </span>
      </header>

      <div className="model-grid">
        {models.map((model, index) => {
          const selected = model.id === selectedId
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
              <p className="model-tagline">{model.tagline}</p>
              <div className="model-meta">
                <span className="pill">{model.chip ?? '通用'}</span>
                <span className="dot-sep" />
                <span>{formatBytes(model.image.size)}</span>
                <span className="dot-sep" />
                <span>v{model.image.version}</span>
              </div>
            </button>
          )
        })}
      </div>

      <div className="stage-note">
        <span className="note-dot" />
        不确定具体型号？可以查看设备背面丝印，或开机后在系统信息中确认芯片型号。
      </div>

      <footer className="stage-actions">
        <span className="action-hint">{selectedId ? '已选择机型，可以继续' : '请选择一台设备'}</span>
        <button type="button" className="btn btn-primary" onClick={onContinue} disabled={!selectedId}>
          继续
          <IconArrowRight size={16} />
        </button>
      </footer>
    </div>
  )
}
