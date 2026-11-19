import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import type {
  BootPayload,
  DriveInfo,
  ModelInfo,
  ProgressEvent,
  SourceId
} from '../../shared/types'
import { createJobId, formatBytes } from './format'
import {
  initialFlash,
  initialPrepare,
  type FlashUiState,
  type PrepareUiState,
  type Stage
} from './types'
import { Stepper } from './components/Stepper'
import { ModelStep } from './components/ModelStep'
import { DriveStep } from './components/DriveStep'
import { PrepareStep } from './components/PrepareStep'
import { FlashStep } from './components/FlashStep'
import { DoneStep } from './components/DoneStep'
import {
  IconAlert,
  IconApple,
  IconGithub,
  IconLogo,
  IconRefresh,
  IconShield,
  IconWindows
} from './components/Icons'

const STAGE_INDEX: Record<Stage, number> = { model: 0, drive: 1, prepare: 2, flash: 3, done: 4 }
const REPO_URL = 'https://github.com/oh-sudo-user/gameOS-flasher'

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return typeof error === 'string' ? error : '发生未知错误'
}

export default function App(): JSX.Element {
  const [boot, setBoot] = useState<BootPayload | null>(null)
  const [bootError, setBootError] = useState('')
  const [bootAttempt, setBootAttempt] = useState(0)

  const [stage, setStage] = useState<Stage>('model')
  const [model, setModel] = useState<ModelInfo | null>(null)
  const [drives, setDrives] = useState<DriveInfo[]>([])
  const [drivesLoading, setDrivesLoading] = useState(false)
  const [drivesError, setDrivesError] = useState('')
  const [drive, setDrive] = useState<DriveInfo | null>(null)
  const [sourceId, setSourceId] = useState<'official' | 'mirror' | 'local'>('official')
  const [prepare, setPrepare] = useState<PrepareUiState>(initialPrepare)
  const [flash, setFlash] = useState<FlashUiState>(initialFlash)
  const [acknowledged, setAcknowledged] = useState(false)

  const prepareJobRef = useRef('')
  const flashJobRef = useRef('')
  const startingPrepareRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    window.api
      .bootstrap()
      .then((payload) => {
        if (cancelled) return
        setBoot(payload)
        setSourceId(payload.settings.preferredSource)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setBootError(errorMessage(error))
      })
    return () => {
      cancelled = true
    }
  }, [bootAttempt])

  useEffect(() => {
    return window.api.onProgress((event: ProgressEvent) => {
      if (event.kind === 'image' && event.jobId === prepareJobRef.current) {
        setPrepare((prev) => ({
          ...prev,
          status: event.phase === 'error' ? 'error' : event.phase === 'ready' ? 'ready' : prev.status,
          phase: event.phase,
          percent: event.percent ?? prev.percent,
          speed: event.speed ?? prev.speed,
          received: event.received ?? prev.received,
          total: event.total ?? prev.total,
          message: event.message ?? prev.message,
          sourceId: event.sourceId ?? prev.sourceId,
          sha256: event.sha256 ?? prev.sha256,
          expectedSha256: event.expectedSha256 ?? prev.expectedSha256,
          hashMatched: event.hashMatched !== undefined ? event.hashMatched : prev.hashMatched,
          filePath: event.filePath ?? prev.filePath,
          fromCache: event.fromCache ?? prev.fromCache,
          error: event.phase === 'error' ? (event.message ?? prev.error) : prev.error
        }))
      }

      if (event.kind === 'flash' && event.jobId === flashJobRef.current) {
        setFlash((prev) => {
          if (event.phase === 'done') {
            return {
              ...prev,
              status: 'done',
              phase: 'done',
              percent: 100,
              received: event.received ?? prev.total,
              total: event.total ?? prev.total,
              message: event.message ?? prev.message,
              finishedAt: Date.now()
            }
          }
          if (event.phase === 'error') {
            return { ...prev, status: 'error', phase: 'error', error: event.message ?? '写入失败' }
          }
          if (event.phase === 'cancelled') {
            return {
              ...prev,
              status: 'cancelled',
              phase: 'cancelled',
              message: event.message ?? '已取消',
              finishedAt: Date.now()
            }
          }
          return {
            ...prev,
            phase: event.phase,
            percent: event.percent ?? prev.percent,
            speed: event.speed ?? prev.speed,
            received: event.received ?? prev.received,
            total: event.total ?? prev.total,
            message: event.message ?? prev.message
          }
        })
      }
    })
  }, [])

  const refreshDrives = useCallback(async () => {
    setDrivesLoading(true)
    setDrivesError('')
    try {
      const list = await window.api.listDrives()
      setDrives(list)
      setDrive((prev) => {
        if (!prev) return null
        const next = list.find((item) => item.device === prev.device)
        return next && !next.blocked ? next : null
      })
    } catch (error) {
      setDrivesError(errorMessage(error))
    } finally {
      setDrivesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (stage === 'drive') void refreshDrives()
  }, [stage, refreshDrives])

  const beginPrepare = useCallback(async (targetModel: ModelInfo, source: 'official' | 'mirror') => {
    if (startingPrepareRef.current) return
    startingPrepareRef.current = true
    const jobId = createJobId('img')
    prepareJobRef.current = jobId
    setPrepare({
      ...initialPrepare,
      status: 'running',
      jobId,
      modelId: targetModel.id,
      sourceId: source,
      total: targetModel.image.size,
      message: source === 'mirror' ? '正在连接 GitHub 镜像…' : '正在连接官方 CDN…'
    })
    try {
      const result = await window.api.prepareImage({ jobId, modelId: targetModel.id, sourceId: source })
      if (prepareJobRef.current !== jobId) return
      setPrepare((prev) => ({
        ...prev,
        status: 'ready',
        phase: 'ready',
        percent: 100,
        received: result.size,
        total: result.size,
        sha256: result.sha256,
        expectedSha256: result.expectedSha256,
        hashMatched: result.hashMatched,
        filePath: result.filePath,
        fileName: result.fileName,
        fromCache: result.fromCache,
        sourceId: result.sourceId,
        message: '镜像已就绪'
      }))
    } catch (error) {
      if (prepareJobRef.current !== jobId) return
      const message = errorMessage(error)
      if (message.includes('已取消')) {
        setPrepare((prev) => ({ ...prev, status: 'idle', message: '已取消' }))
      } else {
        setPrepare((prev) => ({ ...prev, status: 'error', error: message, message }))
      }
    } finally {
      startingPrepareRef.current = false
    }
  }, [])

  useEffect(() => {
    if (stage !== 'prepare' || !model) return
    if (sourceId === 'local') return
    if (prepare.status === 'running') return
    if (prepare.status === 'ready' && prepare.modelId === model.id && prepare.sourceId === sourceId) return
    void beginPrepare(model, sourceId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, model, sourceId, bootAttempt])

  const chooseSource = (next: SourceId): void => {
    setSourceId(next)
    setAcknowledged(false)
    window.api.setPreferredSource(next).catch(() => undefined)
    if (prepare.status !== 'idle' && prepare.status !== 'running') {
      setPrepare((prev) => ({ ...prev, status: 'idle', sha256: '', message: '' }))
    }
  }

  const handleLocalImage = async (): Promise<void> => {
    if (!model) return
    const jobId = createJobId('img')
    prepareJobRef.current = jobId
    setSourceId('local')
    setPrepare({
      ...initialPrepare,
      status: 'running',
      jobId,
      modelId: model.id,
      sourceId: 'local',
      message: '正在读取本地镜像…'
    })
    try {
      const result = await window.api.prepareLocalImage({ jobId, modelId: model.id })
      if (prepareJobRef.current !== jobId) return
      if (!result) {
        setPrepare((prev) => ({ ...prev, status: 'idle', sourceId: 'local', message: '' }))
        return
      }
      if (result.hashMatched === false) {
        setPrepare((prev) => ({
          ...prev,
          status: 'error',
          phase: 'error',
          percent: 100,
          sha256: result.sha256,
          expectedSha256: result.expectedSha256,
          hashMatched: false,
          filePath: result.filePath,
          fileName: result.fileName,
          total: result.size,
          received: result.size,
          message: 'SHA-256 与官方清单不一致',
          error: '本地镜像的 SHA-256 与官方清单不一致，已阻止继续。请更换镜像文件后重试。'
        }))
        return
      }
      setPrepare((prev) => ({
        ...prev,
        status: 'ready',
        phase: 'ready',
        percent: 100,
        sha256: result.sha256,
        expectedSha256: result.expectedSha256,
        hashMatched: result.hashMatched,
        filePath: result.filePath,
        fileName: result.fileName,
        total: result.size,
        received: result.size,
        sourceId: 'local',
        fromCache: false,
        message: '本地镜像已就绪'
      }))
    } catch (error) {
      if (prepareJobRef.current !== jobId) return
      const message = errorMessage(error)
      if (!message.includes('已取消')) {
        setPrepare((prev) => ({ ...prev, status: 'error', error: message, message }))
      } else {
        setPrepare((prev) => ({ ...prev, status: 'idle', message: '已取消' }))
      }
    }
  }

  const handleRetryPrepare = (): void => {
    if (!model) return
    if (prepare.status === 'running') return
    if (sourceId === 'local') {
      void handleLocalImage()
      return
    }
    void beginPrepare(model, sourceId)
  }

  const handleCancelPrepare = (): void => {
    if (prepare.status !== 'running') return
    void window.api.cancelPrepare(prepare.jobId)
    setPrepare((prev) => ({ ...prev, message: '正在取消…' }))
  }

  const handleSelectModel = (next: ModelInfo): void => {
    if (next.id !== model?.id) {
      setModel(next)
      setPrepare(initialPrepare)
      setFlash(initialFlash)
      setAcknowledged(false)
    }
  }

  const handleSelectDrive = (next: DriveInfo): void => {
    setDrive(next)
    if (flash.status !== 'idle') setFlash(initialFlash)
    setAcknowledged(false)
  }

  const cancelRunningTasks = (): void => {
    if (prepare.status === 'running') void window.api.cancelPrepare(prepare.jobId)
    if (flash.status === 'running') void window.api.cancelFlash(flash.jobId)
  }

  const handleStepSelect = (index: number): void => {
    if (flash.status === 'running') return
    const target = (['model', 'drive', 'prepare', 'flash'] as Stage[])[index]
    if (target === 'flash' && prepare.status !== 'ready') return
    cancelRunningTasks()
    prepareJobRef.current = ''
    if (prepare.status === 'running' && target !== 'prepare') {
      setPrepare((prev) => ({ ...prev, status: 'idle', message: '' }))
    }
    setFlash(initialFlash)
    setAcknowledged(false)
    setStage(target)
  }

  const handleDriveContinue = (): void => {
    if (!drive) return
    setStage('prepare')
  }

  const handlePrepareBack = (): void => {
    if (prepare.status === 'running') void window.api.cancelPrepare(prepare.jobId)
    prepareJobRef.current = ''
    if (prepare.status === 'running') setPrepare((prev) => ({ ...prev, status: 'idle', message: '' }))
    setFlash(initialFlash)
    setAcknowledged(false)
    setStage('drive')
  }

  const handleStartFlash = async (): Promise<void> => {
    if (!model || !drive || prepare.status !== 'ready' || !prepare.filePath) return
    const jobId = createJobId('flash')
    flashJobRef.current = jobId
    setFlash({
      ...initialFlash,
      status: 'running',
      phase: 'preparing',
      jobId,
      total: prepare.total || model.image.size,
      message: '正在准备写入…',
      startedAt: Date.now()
    })
    try {
      const result = await window.api.startFlash({
        jobId,
        imagePath: prepare.filePath,
        expectedSha256: prepare.expectedSha256,
        device: drive.device,
        deviceLabel: drive.name,
        modelName: model.name,
        imageVersion: model.image.version,
        imageSize: prepare.total || model.image.size
      })
      if (flashJobRef.current !== jobId) return
      if (result.cancelled) {
        setFlash((prev) => ({
          ...prev,
          status: 'cancelled',
          phase: 'cancelled',
          message: '已取消',
          finishedAt: Date.now()
        }))
        return
      }
      setFlash((prev) => ({
        ...prev,
        status: 'done',
        phase: 'done',
        percent: 100,
        received: prev.total,
        finishedAt: Date.now()
      }))
      setStage('done')
    } catch (error) {
      if (flashJobRef.current !== jobId) return
      setFlash((prev) => ({
        ...prev,
        status: 'error',
        error: errorMessage(error),
        finishedAt: Date.now()
      }))
    }
  }

  const handleCancelFlash = (): void => {
    if (flash.status !== 'running') return
    void window.api.cancelFlash(flash.jobId)
    setFlash((prev) => ({ ...prev, message: '正在取消写入，请稍候…' }))
  }

  const handleRestart = (): void => {
    setFlash(initialFlash)
    setAcknowledged(false)
    setDrive(null)
    setStage('drive')
  }

  if (!boot) {
    return (
      <div className="boot-screen">
        <div className="boot-glow" />
        <span className={`boot-logo ${bootError ? 'is-error' : ''}`}>
          {bootError ? <IconAlert size={30} /> : <IconLogo size={34} />}
        </span>
        <h1>{bootError ? '启动遇到问题' : '正在载入 gameOS Flasher'}</h1>
        <p>{bootError || '正在读取机型清单与本地配置…'}</p>
        {bootError && (
          <div className="boot-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setBootError('')
                setBootAttempt((value) => value + 1)
              }}
            >
              <IconRefresh size={16} />
              重试
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => window.location.reload()}>
              重新加载
            </button>
          </div>
        )}
      </div>
    )
  }

  const isMac = boot.app.platform === 'darwin'
  const sourceLabel =
    prepare.sourceId === 'local' ? '本地镜像' : prepare.sourceId === 'mirror' ? 'GitHub 镜像' : '官方 CDN'
  const checkLabel =
    prepare.status !== 'ready'
      ? '待校验'
      : prepare.hashMatched === null
        ? '未配置校验值'
        : prepare.hashMatched === false
          ? '校验失败'
          : '已通过'

  return (
    <div className={`app platform-${isMac ? 'darwin' : boot.app.platform}`}>
      <div className="aurora" aria-hidden="true">
        <span className="aurora-a" />
        <span className="aurora-b" />
        <span className="aurora-c" />
      </div>

      <header className="titlebar">
        <div className="brand">
          <span className="brand-mark">
            <IconLogo size={19} />
          </span>
          <span className="brand-name">
            gameOS <em>Flasher</em>
          </span>
          <span className="brand-version">v{boot.app.version}</span>
        </div>
        <div className="titlebar-actions">
          <span className="platform-chip">
            {isMac ? <IconApple size={13} /> : <IconWindows size={13} />}
            {isMac ? 'macOS' : boot.app.platform === 'win32' ? 'Windows' : boot.app.platform}
          </span>
          <button
            type="button"
            className="icon-btn"
            title="打开 GitHub 仓库"
            onClick={() => void window.api.openExternal(REPO_URL)}
          >
            <IconGithub size={17} />
          </button>
        </div>
      </header>

      <div className="shell">
        <main className="main">
          <Stepper current={STAGE_INDEX[stage]} onSelect={handleStepSelect} />

          <section className="stage-card">
            {stage === 'model' && (
              <ModelStep
                models={boot.manifest.models}
                selectedId={model?.id}
                onSelect={handleSelectModel}
                onContinue={() => model && setStage('drive')}
              />
            )}

            {stage === 'drive' && (
              <DriveStep
                drives={drives}
                loading={drivesLoading}
                error={drivesError}
                selectedDevice={drive?.device}
                onSelect={handleSelectDrive}
                onRefresh={() => void refreshDrives()}
                onContinue={handleDriveContinue}
              />
            )}

            {stage === 'prepare' && model && (
              <PrepareStep
                model={model}
                prepare={prepare}
                onChooseSource={chooseSource}
                onRetry={handleRetryPrepare}
                onCancel={handleCancelPrepare}
                onLocal={() => void handleLocalImage()}
                onBack={handlePrepareBack}
                onContinue={() => {
                  if (prepare.status === 'ready') {
                    setAcknowledged(false)
                    setFlash(initialFlash)
                    setStage('flash')
                  }
                }}
              />
            )}

            {stage === 'flash' && model && drive && (
              <FlashStep
                model={model}
                drive={drive}
                prepare={prepare}
                flash={flash}
                acknowledged={acknowledged}
                onAcknowledge={setAcknowledged}
                onStart={() => void handleStartFlash()}
                onCancel={handleCancelFlash}
                onRetry={() => {
                  setFlash(initialFlash)
                  setAcknowledged(false)
                }}
                onBack={() => {
                  setFlash(initialFlash)
                  setAcknowledged(false)
                  setStage('prepare')
                }}
              />
            )}

            {stage === 'done' && model && drive && (
              <DoneStep
                model={model}
                drive={drive}
                prepare={prepare}
                flash={flash}
                onRestart={handleRestart}
                onReveal={() => {
                  if (prepare.filePath) void window.api.revealPath(prepare.filePath)
                }}
              />
            )}
          </section>
        </main>

        <aside className="summary">
          <div className="summary-card">
            <div className="summary-head">
              <h3>刷写摘要</h3>
              <span className="summary-dot" />
            </div>
            <div className="summary-rows">
              <div className="summary-row">
                <span>机型</span>
                <strong>{model ? model.name : '—'}</strong>
              </div>
              <div className="summary-row">
                <span>镜像</span>
                <strong>{model ? `gameOS ${model.image.version}` : '—'}</strong>
              </div>
              <div className="summary-row">
                <span>大小</span>
                <strong>{model ? formatBytes(model.image.size) : '—'}</strong>
              </div>
              <div className="summary-row">
                <span>存储卡</span>
                <strong className={drive ? '' : 'is-muted'}>{drive ? drive.name : '未选择'}</strong>
              </div>
              <div className="summary-row">
                <span>下载源</span>
                <strong className={prepare.status === 'idle' ? 'is-muted' : ''}>{sourceLabel}</strong>
              </div>
              <div className="summary-row">
                <span>SHA-256</span>
                <strong
                  className={
                    checkLabel === '已通过'
                      ? 'text-mint'
                      : checkLabel === '校验失败'
                        ? 'text-danger'
                        : checkLabel === '未配置校验值'
                          ? 'text-amber'
                          : 'is-muted'
                  }
                >
                  {checkLabel}
                </strong>
              </div>
            </div>
          </div>

          <div className="safety-card">
            <span className="safety-icon">
              <IconShield size={18} />
            </span>
            <div>
              <h4>系统盘保护已开启</h4>
              <p>系统盘会被自动识别并禁止选中，写入前还会再次校验目标设备与镜像哈希。</p>
            </div>
          </div>

          <div className="hint-card">
            <h4>{isMac ? 'macOS 提示' : 'Windows 提示'}</h4>
            <p>
              {isMac
                ? '开始写入时需要输入一次管理员密码，用于卸载并写入存储卡。'
                : '开始写入时会弹出 UAC 授权窗口，请选择「是」允许写入。'}
            </p>
          </div>

          <div className="summary-foot">
            <IconShield size={12} />
            拒绝系统盘 · 双重哈希校验
          </div>
        </aside>
      </div>

      <footer className="app-footer">
        <span>
          <IconShield size={13} /> 仅写入外接存储卡
        </span>
        <span>{boot.manifest.updatedAt ? `镜像清单更新于 ${boot.manifest.updatedAt}` : ''}</span>
      </footer>
    </div>
  )
}
