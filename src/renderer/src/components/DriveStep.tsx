import type { JSX } from 'react'
import type { DriveInfo } from '../../../shared/types'
import { formatBytes } from '../format'
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
  const selectable = drives.filter((drive) => !drive.blocked)
  const hasDrive = selectable.length > 0

  return (
    <div className="stage-enter">
      <header className="stage-head">
        <div>
          <p className="eyebrow">STEP 02</p>
          <h2>插入存储卡并选择目标</h2>
          <p className="stage-sub">建议使用 8GB 以上的 A1/A2 高速卡。系统盘会被自动识别并禁止选中。</p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRefresh} disabled={loading}>
          <IconRefresh size={15} className={loading ? 'spin' : ''} />
          刷新
        </button>
      </header>

      {error && (
        <div className="alert alert-danger">
          <IconAlert size={18} />
          <div>
            <strong>读取设备列表失败</strong>
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
          <h3>没有检测到存储卡</h3>
          <p>请确认存储卡已插入读卡器，然后点击右上角的「刷新」重试。</p>
          <button type="button" className="btn btn-ghost" onClick={onRefresh}>
            <IconRefresh size={15} />
            重新检测
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
                    {drive.isSystem && <span className="badge badge-danger">系统盘</span>}
                    {!drive.isSystem && drive.isRemovable && <span className="badge badge-mint">可移动</span>}
                    {!drive.isSystem && !drive.isRemovable && drive.isUSB && <span className="badge badge-blue">USB</span>}
                    {!drive.isSystem && !drive.isRemovable && !drive.isUSB && <span className="badge badge-amber">内置</span>}
                    {drive.isReadOnly && <span className="badge badge-amber">只读</span>}
                  </span>
                  <span className="drive-sub">
                    {drive.mountpoints.length > 0 ? drive.mountpoints.join(' · ') : '未挂载'} · {drive.busType}
                  </span>
                  {drive.blocked && drive.blockReason && <span className="drive-block">{drive.blockReason}</span>}
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
        已自动跳过系统盘与只读设备；如果目标卡没有出现，请重新插拔后再刷新。
      </div>

      <footer className="stage-actions">
        <span className="action-hint">
          {selectedDevice
            ? '写入前请再次确认卡内数据已备份'
            : hasDrive
              ? '请选择目标存储卡'
              : '等待检测存储卡'}
        </span>
        <button type="button" className="btn btn-primary" onClick={onContinue} disabled={!selectedDevice}>
          继续
          <IconArrowRight size={16} />
        </button>
      </footer>
    </div>
  )
}
