import type { JSX } from 'react'
import type { MessageKey } from '../../../shared/i18n'
import type { DriveInfo } from '../../../shared/types'
import { formatBytes } from '../format'
import { useI18n } from '../i18n'
import {
  IconAlert,
  IconArrowRight,
  IconCheck,
  IconHardDrive,
  IconRefresh,
  IconSdCard,
  IconShield,
  IconUsb
} from './Icons'

interface DriveStepProps {
  drives: DriveInfo[]
  loading: boolean
  error: string
  selectedDevice?: string
  onSelect: (drive: DriveInfo) => void
  onRefresh: () => void
  onContinue: () => void
}

function DriveIcon({ drive }: { drive: DriveInfo }): JSX.Element {
  if (drive.isSystem) return <IconHardDrive size={22} />
  if (drive.isUSB) return <IconUsb size={22} />
  return <IconSdCard size={22} />
}

export function DriveStep({
  drives,
  loading,
  error,
  selectedDevice,
  onSelect,
  onRefresh,
  onContinue
}: DriveStepProps): JSX.Element {
  const { t } = useI18n()
  const selectable = drives.filter((drive) => !drive.blocked)
  const hasDrive = selectable.length > 0

  return (
    <div className="stage-enter">
      <header className="stage-head">
        <div>
          <p className="eyebrow">STEP 02</p>
          <h2>{t('drive.title')}</h2>
          <p className="stage-sub">{t('drive.sub')}</p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRefresh} disabled={loading}>
          <IconRefresh size={15} className={loading ? 'spin' : ''} />
          {t('common.refresh')}
        </button>
      </header>

      {error && (
        <div className="alert alert-danger">
          <IconAlert size={18} />
          <div>
            <strong>{t('drive.errorTitle')}</strong>
            <p>{error}</p>
          </div>
        </div>
      )}

      {loading && drives.length === 0 && (
        <div className="drive-list">
          {[0, 1, 2].map((item) => (
            <div className="drive-row skeleton" key={item}>
              <span className="skeleton-block" style={{ width: 44, height: 44, borderRadius: 12 }} />
              <span className="skeleton-lines">
                <span className="skeleton-block" style={{ width: '42%' }} />
                <span className="skeleton-block" style={{ width: '26%' }} />
              </span>
            </div>
          ))}
        </div>
      )}

      {!loading && drives.length === 0 && !error && (
        <div className="empty-state">
          <span className="empty-icon">
            <IconSdCard size={34} />
          </span>
          <h3>{t('drive.emptyTitle')}</h3>
          <p>{t('drive.emptyBody')}</p>
          <button type="button" className="btn btn-ghost" onClick={onRefresh}>
            <IconRefresh size={15} />
            {t('drive.redetect')}
          </button>
        </div>
      )}

      {drives.length > 0 && (
        <div className="drive-list">
          {drives.map((drive) => {
            const selected = drive.device === selectedDevice
            return (
              <button
                type="button"
                key={drive.device}
                className={`drive-row ${selected ? 'is-selected' : ''} ${drive.blocked ? 'is-blocked' : ''}`}
                onClick={() => {
                  if (!drive.blocked) onSelect(drive)
                }}
                disabled={drive.blocked}
                aria-pressed={selected}
              >
                <span className="drive-icon">
                  <DriveIcon drive={drive} />
                </span>
                <span className="drive-main">
                  <span className="drive-title">
                    {drive.name}
                    {drive.isSystem && <span className="badge badge-danger">{t('drive.badge.system')}</span>}
                    {!drive.isSystem && drive.isRemovable && (
                      <span className="badge badge-mint">{t('drive.badge.removable')}</span>
                    )}
                    {!drive.isSystem && !drive.isRemovable && drive.isUSB && (
                      <span className="badge badge-blue">USB</span>
                    )}
                    {!drive.isSystem && !drive.isRemovable && !drive.isUSB && (
                      <span className="badge badge-amber">{t('drive.badge.internal')}</span>
                    )}
                    {drive.isReadOnly && <span className="badge badge-amber">{t('drive.badge.readonly')}</span>}
                  </span>
                  <span className="drive-sub">
                    {drive.mountpoints.length > 0 ? drive.mountpoints.join(' · ') : t('common.unmounted')}
                    {drive.busType ? ` · ${drive.busType}` : ''}
                  </span>
                  {drive.blocked && drive.blockReason && (
                    <span className="drive-block">{t(drive.blockReason as MessageKey)}</span>
                  )}
                </span>
                <span className="drive-size">{formatBytes(drive.size)}</span>
                <span className="drive-check">{selected ? <IconCheck size={14} /> : null}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="stage-note">
        <IconShield size={15} />
        {t('drive.note')}
      </div>

      <footer className="stage-actions">
        <span className="action-hint">
          {selectedDevice ? t('drive.hintSelected') : hasDrive ? t('drive.hintPick') : t('drive.hintWaiting')}
        </span>
        <button type="button" className="btn btn-primary" onClick={onContinue} disabled={!selectedDevice}>
          {t('common.continue')}
          <IconArrowRight size={16} />
        </button>
      </footer>
    </div>
  )
}
