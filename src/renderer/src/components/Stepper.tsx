import type { JSX } from 'react'
import type { MessageKey } from '../../../shared/i18n'
import { useI18n } from '../i18n'
import { IconCheck } from './Icons'

const STEPS: MessageKey[] = ['step.model', 'step.drive', 'step.prepare', 'step.flash']

interface StepperProps {
  current: number
  onSelect: (index: number) => void
}

export function Stepper({ current, onSelect }: StepperProps): JSX.Element {
  const { t } = useI18n()

  return (
    <nav className="stepper" aria-label={t('step.nav')}>
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
              <span className="stepper-label">{t(label)}</span>
            </button>
            {index < STEPS.length - 1 && <span className={`stepper-line ${current > index ? 'is-filled' : ''}`} />}
          </div>
        )
      })}
    </nav>
  )
}
