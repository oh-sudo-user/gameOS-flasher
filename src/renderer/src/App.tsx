import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { detectLocale, translate, type Locale, type MessageKey, type TranslateParams } from '../../shared/i18n'
import type {
  BootPayload,
  DriveInfo,
  ModelInfo,
  PrepareSourceId,
  ProgressEvent,
  SourceId
} from '../../shared/types'
import { createJobId, formatBytes, formatDate } from './format'
import { I18nProvider } from './i18n'
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
import { LanguagePicker } from './components/LanguagePicker'
import {
  IconAlert,
  IconApple,
  IconGithub,
  IconGlobe,
  IconLogo,
  IconRefresh,
  IconShield,
  IconWindows
} from './components/Icons'

const STAGE_INDEX: Record<Stage, number> = { model: 0, drive: 1, prepare: 2, flash: 3, done: 4 }
const REPO_URL = 'https://github.com/oh-sudo-user/gameOS-flasher'

function rawError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return typeof error === 'string' ? error : ''
}

export default function App(): JSX.Element {
  const [boot, setBoot] = useState<BootPayload | null>(null)
  const [bootError, setBootError] = useState('')
  const [bootAttempt, setBootAttempt] = useState(0)
  const [locale, setLocale] = useState<Locale | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const [stage, setStage] = useState<Stage>('model')
  const [model, setModel] = useState<ModelInfo | null>(null)
  const [drives, setDrives] = useState<DriveInfo[]>([])
  const [drivesLoading, setDrivesLoading] = useState(false)
  const [drivesError, setDrivesError] = useState('')
  const [drive, setDrive] = useState<DriveInfo | null>(null)
  const [sourceId, setSourceId] = useState<PrepareSourceId>('official')
  const [prepare, setPrepare] = useState<PrepareUiState>(initialPrepare)
  const [flash, setFlash] = useState<FlashUiState>(initialFlash)
  const [acknowledged, setAcknowledged] = useState(false)

  const prepareJobRef = useRef('')
  const flashJobRef = useRef('')
  const startingPrepareRef = useRef(false)

  const activeLocale: Locale = locale ?? boot?.systemLocale ?? detectLocale(navigator.language)
  const t = useCallback(
    (key: MessageKey, params?: TranslateParams) => translate(activeLocale, key, params),
    [activeLocale]
  )

  useEffect(() => {
    let cancelled = false
    window.api
      .bootstrap()
      .then((payload) => {
        if (cancelled) return
        setBoot(payload)
        setSourceId(payload.settings.preferredSource)
        setLocale(payload.settings.locale)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setBootError(rawError(error) || translate(detectLocale(navigator.language), 'flash.unknownError'))
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
          error: event.phase === 'error' ? (event.message ?? '') : prev.error
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
            return { ...prev, status: 'error', phase: 'error', error: event.message ?? '' }
          }
          if (event.phase === 'cancelled') {
            return {
              ...prev,
              status: 'cancelled',
              phase: 'cancelled',
              message: event.message ?? '',
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
      setDrivesError(rawError(error) || t('flash.unknownError'))
    } finally {
      setDrivesLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (stage === 'drive') void refreshDrives()
  }, [stage, refreshDrives])

  const beginPrepare = useCallback(
    async (targetModel: ModelInfo, source: SourceId) => {
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
        total: targetModel.image?.size ?? 0,
        message: t('progress.downloading', {
          source: t(source === 'mirror' ? 'source.mirror' : 'source.official')
        })
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
          fileSha256: result.fileSha256,
          hashMatched: result.hashMatched,
          filePath: result.filePath,
          fileName: result.fileName,
          fromCache: result.fromCache,
          sourceId: result.sourceId,
          version: result.version,
          message: t('progress.ready')
        }))
      } catch (error) {
        if (prepareJobRef.current !== jobId) return
        const message = rawError(error) || t('flash.unknownError')
        if (message.includes(t('err.cancelled'))) {
          setPrepare((prev) => ({ ...prev, status: 'idle', message: t('progress.cancelled') }))
        } else {
          setPrepare((prev) => ({ ...prev, status: 'error', error: message, message }))
        }
      } finally {
        startingPrepareRef.current = false
      }
    },
    [t]
  )

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
      message: t('prepare.phase.prepare')
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
          fileSha256: result.fileSha256,
          hashMatched: false,
          filePath: result.filePath,
          fileName: result.fileName,
          total: result.size,
          received: result.size,
          version: result.version,
          message: t('err.shaMismatch'),
          error: t('err.shaMismatch')
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
        fileSha256: result.fileSha256,
        hashMatched: result.hashMatched,
        filePath: result.filePath,
        fileName: result.fileName,
        total: result.size,
        received: result.size,
        sourceId: 'local',
        fromCache: false,
        version: result.version,
        message: t('progress.ready')
      }))
    } catch (error) {
      if (prepareJobRef.current !== jobId) return
      const message = rawError(error) || t('flash.unknownError')
      if (!message.includes(t('err.cancelled'))) {
        setPrepare((prev) => ({ ...prev, status: 'error', error: message, message }))
      } else {
        setPrepare((prev) => ({ ...prev, status: 'idle', message: t('progress.cancelled') }))
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

  const handleRefreshModels = useCallback(async (): Promise<void> => {
    try {
      const payload = await window.api.refreshModels()
      setBoot((prev) =>
        prev ? { ...prev, models: payload.models, release: payload.release } : prev
      )
      setModel((prev) => (prev ? payload.models.find((item) => item.id === prev.id) ?? prev : prev))
    } catch (error) {
      const message = rawError(error) || t('flash.unknownError')
      setBoot((prev) =>
        prev ? { ...prev, release: { ...prev.release, error: message } } : prev
      )
    }
  }, [t])

  const handleCancelPrepare = (): void => {
    if (prepare.status !== 'running') return
    void window.api.cancelPrepare(prepare.jobId)
    setPrepare((prev) => ({ ...prev, message: t('progress.cancelled') }))
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
      total: prepare.total || model.image?.size || 0,
      message: t('progress.waitElevation'),
      startedAt: Date.now()
    })
    try {
      const result = await window.api.startFlash({
        jobId,
        imagePath: prepare.filePath,
        expectedSha256: prepare.fileSha256,
        device: drive.device,
        deviceLabel: drive.name,
        modelName: model.name,
        imageVersion: prepare.version || model.image?.version || '',
        imageSize: prepare.total || model.image?.size || 0
      })
      if (flashJobRef.current !== jobId) return
      if (result.cancelled) {
        setFlash((prev) => ({
          ...prev,
          status: 'cancelled',
          phase: 'cancelled',
          message: t('progress.cancelled'),
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
        error: rawError(error) || t('flash.unknownError'),
        finishedAt: Date.now()
      }))
    }
  }

  const handleCancelFlash = (): void => {
    if (flash.status !== 'running') return
    void window.api.cancelFlash(flash.jobId)
    setFlash((prev) => ({ ...prev, message: t('progress.cancelled') }))
  }

  const handleRestart = (): void => {
    setFlash(initialFlash)
    setAcknowledged(false)
    setDrive(null)
    setStage('drive')
  }

  const handleSelectLocale = (next: Locale): void => {
    setLocale(next)
    setPickerOpen(false)
    void window.api.setLocale(next).catch(() => undefined)
  }

  if (!boot) {
    return (
      <I18nProvider locale={activeLocale}>
        <div className="boot-screen">
          <div className="boot-glow" />
          <span className={`boot-logo ${bootError ? 'is-error' : ''}`}>
            {bootError ? <IconAlert size={30} /> : <IconLogo size={34} />}
          </span>
          <h1>{bootError ? t('boot.errorTitle') : t('boot.loading')}</h1>
          <p>{bootError || t('boot.reading')}</p>
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
                {t('boot.retry')}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => window.location.reload()}>
                {t('boot.reload')}
              </button>
            </div>
          )}
        </div>
      </I18nProvider>
    )
  }

  if (locale === null) {
    return (
      <I18nProvider locale={boot.systemLocale}>
        <LanguagePicker detected={boot.systemLocale} current={null} onSelect={handleSelectLocale} />
      </I18nProvider>
    )
  }

  const isMac = boot.app.platform === 'darwin'
  const currentSource: PrepareSourceId = prepare.status === 'idle' ? sourceId : prepare.sourceId
  const sourceLabelKey: MessageKey =
    currentSource === 'local' ? 'source.local' : currentSource === 'mirror' ? 'source.mirror' : 'source.official'
  const checkKey: MessageKey =
    prepare.status !== 'ready'
      ? 'side.pending'
      : prepare.hashMatched === null
        ? 'side.notConfigured'
        : prepare.hashMatched === false
          ? 'side.failed'
          : 'side.passed'
  const checkClass =
    checkKey === 'side.passed'
      ? 'text-mint'
      : checkKey === 'side.failed'
        ? 'text-danger'
        : checkKey === 'side.notConfigured'
          ? 'text-amber'
          : 'is-muted'
  const releaseDate = formatDate(boot.release.publishedAt, activeLocale) || boot.release.tag || ''

  return (
    <I18nProvider locale={activeLocale}>
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
              title={t('lang.switch')}
              onClick={() => setPickerOpen(true)}
            >
              <IconGlobe size={17} />
            </button>
            <button
              type="button"
              className="icon-btn"
              title={t('header.github')}
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
                  models={boot.models}
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
                  release={boot.release}
                  selectedSource={sourceId}
                  onChooseSource={chooseSource}
                  onRefreshModels={() => void handleRefreshModels()}
                  onRetry={handleRetryPrepare}
                  onCancel={handleCancelPrepare}
                  onLocal={() => void handleLocalImage()}
                  onReveal={() => {
                    if (prepare.filePath) void window.api.revealPath(prepare.filePath)
                  }}
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
                  onCleanup={async (filePath) => {
                    try {
                      return await window.api.cleanupImage(filePath)
                    } catch {
                      return false
                    }
                  }}
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
                <h3>{t('side.title')}</h3>
                <span className="summary-dot" />
              </div>
              <div className="summary-rows">
                <div className="summary-row">
                  <span>{t('side.model')}</span>
                  <strong>{model ? model.name : '—'}</strong>
                </div>
                <div className="summary-row">
                  <span>{t('side.image')}</span>
                  <strong>{model?.image ? `gameOS ${model.image.version}` : '—'}</strong>
                </div>
                <div className="summary-row">
                  <span>{t('side.size')}</span>
                  <strong>{model?.image ? formatBytes(model.image.size) : '—'}</strong>
                </div>
                <div className="summary-row">
                  <span>{t('side.card')}</span>
                  <strong className={drive ? '' : 'is-muted'}>{drive ? drive.name : t('side.notSelected')}</strong>
                </div>
                <div className="summary-row">
                  <span>{t('side.source')}</span>
                  <strong className={prepare.status === 'idle' ? 'is-muted' : ''}>{t(sourceLabelKey)}</strong>
                </div>
                <div className="summary-row">
                  <span>{t('side.hash')}</span>
                  <strong className={checkClass}>{t(checkKey)}</strong>
                </div>
              </div>
            </div>

            <div className="safety-card">
              <span className="safety-icon">
                <IconShield size={18} />
              </span>
              <div>
                <h4>{t('safety.title')}</h4>
                <p>{t('safety.body')}</p>
              </div>
            </div>

            <div className="hint-card">
              <h4>{isMac ? t('hint.macTitle') : t('hint.winTitle')}</h4>
              <p>{isMac ? t('hint.macBody') : t('hint.winBody')}</p>
            </div>

            <div className="summary-foot">
              <IconShield size={12} />
              {t('foot.left')}
            </div>
          </aside>
        </div>

        <footer className="app-footer">
          <span>
            <IconShield size={13} /> {t('foot.left')}
          </span>
          <span>{releaseDate ? t('foot.release', { date: releaseDate }) : ''}</span>
        </footer>

        {pickerOpen && (
          <LanguagePicker
            detected={boot.systemLocale}
            current={activeLocale}
            onSelect={handleSelectLocale}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>
    </I18nProvider>
  )
}
