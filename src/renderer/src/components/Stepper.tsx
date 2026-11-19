import type { JSX } from 'react'
import { IconCheck } from './Icons'

const STEPS = ['选择机型', '选择存储卡', '校验镜像', '写入存储卡']

interface StepperProps {
  current: number
  onSelect: (index: number) => void
}

export function Stepper({ current, onSelect }: StepperProps): React.JSX.Element {
  return (
    <nav className="stepper" aria-label="刷写步骤">
      {STEPS.map((label, index) => {
        const completed = current > index
        const active = current === index
        return (
          <div className="stepper-item" key={label}>
            <button
              type="button"
              className={`stepper-btn ${active ? 'is-active' : ''} ${completed ? 'is-completed' : ''}`}
              onClick={() => {
                if (index < current) onSelect(index)
              }}
              disabled={index >= current}
              aria-current={active ? 'step' : undefined}
            >
              <span className="stepper-dot">{completed ? <IconCheck size={13} /> : index + 1}</span>
              <span className="stepper-label">{label}</span>
            </button>
            {index < STEPS.length - 1 && <span className={`stepper-line ${current > index ? 'is-filled' : ''}`} />}
          </div>
        )
      })}
    </nav>
  )
}
