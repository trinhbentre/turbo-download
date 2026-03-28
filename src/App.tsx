import { useState, useCallback, useEffect, useRef } from 'react'
import { useStorage, EmptyState, useKeyboardShortcut, ShortcutHints, modKey } from '@web-tools/ui'
import { Header } from './components/Header'
import { UrlInput } from './components/UrlInput'
import { FilePreview } from './components/FilePreview'
import { DownloadConfig } from './components/DownloadConfig'
import { DownloadProgress } from './components/DownloadProgress'
import { ChunkVisualizer } from './components/ChunkVisualizer'
import { CliCommandPanel } from './components/CliCommandPanel'
import { BrowserNotice } from './components/BrowserNotice'
import { DownloadHistory } from './components/DownloadHistory'
import { ResumePrompt } from './components/ResumePrompt'
import { useUrlAnalyzer } from './hooks/useUrlAnalyzer'
import { useDownloader } from './hooks/useDownloader'
import { useHistory } from './hooks/useHistory'
import { suggestConnections } from './lib/chunkStrategy'
import { isFileSystemAccessSupported, openSaveFilePicker } from './lib/fileWriter'
import { analyzeUrl } from './lib/urlAnalyzer'
import { getIncompleteSessions, deleteSession, cleanupOldSessions } from './lib/sessionStore'
import type { DownloadConfig as DownloadConfigType, DownloadSession } from './types/download'

const DEFAULT_CONNECTIONS = 8
const DEFAULT_CHUNK_SIZE_MIN = 1_048_576 // 1 MB
const DEFAULT_MAX_RETRIES = 3

export default function App() {
  const [url, setUrl] = useState('')
  const [connections, setConnections] = useStorage<number>('td-connections', DEFAULT_CONNECTIONS)
  const [useFileSystemAccess, setUseFileSystemAccess] = useStorage<boolean>('td-use-fsa', true)
  const [throttle, setThrottle] = useStorage<number | null>('td-throttle', null)

  const { analysis, isAnalyzing, error: analyzeError, analyze, reset: resetAnalysis } = useUrlAnalyzer()
  const { state, start, resume, cancel, reset: resetDownload } = useDownloader()
  const { entries: historyEntries, addEntry, clearHistory } = useHistory()
  const [resumableSessions, setResumableSessions] = useState<DownloadSession[]>([])
  const [resumeError, setResumeError] = useState<string | null>(null)

  const fsaSupported = isFileSystemAccessSupported()

  const suggestedConns = analysis?.fileSize != null
    ? suggestConnections(analysis.fileSize)
    : DEFAULT_CONNECTIONS

  const validateUrl = useCallback((rawUrl: string): string | null => {
    if (!rawUrl.trim()) return 'Please enter a URL'
    try {
      const parsed = new URL(rawUrl)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return 'Please enter a valid HTTP(S) URL'
      }
    } catch {
      return 'Please enter a valid HTTP(S) URL'
    }
    return null
  }, [])

  const handleAnalyze = useCallback(() => {
    const validationError = validateUrl(url)
    if (validationError) return
    void analyze(url)
  }, [url, analyze, validateUrl])

  const handleUrlChange = useCallback(
    (newUrl: string) => {
      setUrl(newUrl)
      if (analysis) resetAnalysis()
      if (state.status !== 'idle') resetDownload()
    },
    [analysis, state.status, resetAnalysis, resetDownload],
  )

  const handleStart = useCallback(async () => {
    if (!analysis) return

    let fileHandle: FileSystemFileHandle | undefined
    if (useFileSystemAccess && fsaSupported) {
      try {
        fileHandle = await openSaveFilePicker(
          analysis.fileName,
          analysis.contentType ?? 'application/octet-stream',
        )
      } catch {
        // User dismissed the picker — abort start
        return
      }
    }

    const config: DownloadConfigType = {
      connections,
      maxRetries: DEFAULT_MAX_RETRIES,
      chunkSizeMin: DEFAULT_CHUNK_SIZE_MIN,
      useFileSystemAccess,
      throttle,
      fileHandle,
    }
    void start(analysis, config)
  }, [analysis, connections, useFileSystemAccess, fsaSupported, throttle, start])

  const handleClear = useCallback(() => {
    setUrl('')
    resetAnalysis()
    resetDownload()
    setResumeError(null)
  }, [resetAnalysis, resetDownload])

  // Load incomplete sessions on mount & cleanup old ones
  useEffect(() => {
    void cleanupOldSessions(7)
    void getIncompleteSessions().then(setResumableSessions).catch(() => {})
  }, [])

  // Refresh resumable sessions when download completes, fails, or is cancelled
  useEffect(() => {
    if (state.status === 'completed' || state.status === 'failed' || state.status === 'cancelled') {
      void getIncompleteSessions().then(setResumableSessions).catch(() => {})
    }
  }, [state.status])

  const handleResume = useCallback(async (session: DownloadSession) => {
    setResumeError(null)
    try {
      // Re-analyze URL to verify file hasn't changed
      const freshAnalysis = await analyzeUrl(session.url)

      // Verify file integrity — if etag or size changed, can't resume
      if (session.etag && freshAnalysis.etag && session.etag !== freshAnalysis.etag) {
        setResumeError('File has changed on the server. Cannot resume — please start a new download.')
        await deleteSession(session.id)
        setResumableSessions((prev) => prev.filter((s) => s.id !== session.id))
        return
      }
      if (freshAnalysis.fileSize !== null && freshAnalysis.fileSize !== session.fileSize) {
        setResumeError('File size has changed on the server. Cannot resume — please start a new download.')
        await deleteSession(session.id)
        setResumableSessions((prev) => prev.filter((s) => s.id !== session.id))
        return
      }

      if (freshAnalysis.corsStatus === 'blocked') {
        setResumeError('CORS is now blocked for this URL. Cannot resume.')
        return
      }

      // Set URL so UI reflects what we're downloading
      setUrl(session.url)

      const config: DownloadConfigType = {
        connections: session.connections,
        maxRetries: DEFAULT_MAX_RETRIES,
        chunkSizeMin: DEFAULT_CHUNK_SIZE_MIN,
        useFileSystemAccess: session.useFSA,
        throttle,
        fileHandle: session.fileHandle ?? undefined,
      }

      // Clear from resumable list
      setResumableSessions((prev) => prev.filter((s) => s.id !== session.id))

      await resume(session, freshAnalysis, config)
    } catch (err) {
      setResumeError((err as Error).message)
    }
  }, [throttle, resume])

  const handleDiscard = useCallback(async (session: DownloadSession) => {
    await deleteSession(session.id).catch(() => {})
    setResumableSessions((prev) => prev.filter((s) => s.id !== session.id))
  }, [])

  // Resume from failed/cancelled state (re-uses current session)
  const handleResumeFromState = useCallback(async () => {
    if (!state.fileAnalysis) return
    try {
      const freshAnalysis = await analyzeUrl(state.fileAnalysis.url)

      // Find the matching session in IDB
      const sessions = await getIncompleteSessions()
      const session = sessions.find((s) => s.url === state.fileAnalysis!.url)
      if (!session) return

      const config: DownloadConfigType = {
        connections: session.connections,
        maxRetries: DEFAULT_MAX_RETRIES,
        chunkSizeMin: DEFAULT_CHUNK_SIZE_MIN,
        useFileSystemAccess: session.useFSA,
        throttle,
        fileHandle: session.fileHandle ?? undefined,
      }

      await resume(session, freshAnalysis, config)
    } catch (err) {
      setResumeError((err as Error).message)
    }
  }, [state.fileAnalysis, throttle, resume])

  // Record completed/failed downloads in history
  const prevStatusRef = useRef(state.status)
  useEffect(() => {
    const prev = prevStatusRef.current
    prevStatusRef.current = state.status

    if ((state.status === 'completed' || state.status === 'failed') && prev === 'downloading') {
      if (state.fileAnalysis) {
        const duration =
          state.startTime && state.endTime ? state.endTime - state.startTime : 0
        addEntry({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          url: state.fileAnalysis.url,
          fileName: state.fileAnalysis.fileName,
          fileSize: state.fileAnalysis.fileSize,
          method: state.method ?? 'single',
          connections: state.connections,
          speed: state.speed,
          duration,
          completedAt: Date.now(),
          status: state.status === 'completed' ? 'completed' : 'failed',
        })
      }
    }
  }, [state.status, state.fileAnalysis, state.method, state.connections, state.speed, state.startTime, state.endTime, addEntry])

  // ⌘V — auto-paste into URL input
  useKeyboardShortcut({ key: 'v', ctrl: true }, () => {
    void navigator.clipboard.readText().then((text) => {
      if (text.startsWith('http://') || text.startsWith('https://')) {
        handleUrlChange(text)
      }
    })
  })

  // ⌘Enter — start download
  useKeyboardShortcut({ key: 'Enter', ctrl: true }, handleStart)

  // Escape — cancel
  useKeyboardShortcut({ key: 'Escape' }, () => {
    if (state.status === 'downloading') cancel()
  })

  // ⌘K — clear
  useKeyboardShortcut({ key: 'k', ctrl: true }, handleClear)

  const isDownloadActive =
    state.status === 'downloading' ||
    state.status === 'merging' ||
    state.status === 'saving'

  const showProgress =
    state.status === 'downloading' ||
    state.status === 'merging' ||
    state.status === 'saving' ||
    state.status === 'completed' ||
    state.status === 'failed' ||
    state.status === 'cancelled'

  const showConfig =
    analysis !== null &&
    analysis.corsStatus !== 'blocked' &&
    !isDownloadActive &&
    state.status !== 'completed'

  const canStart = analysis !== null && analysis.corsStatus !== 'blocked' && !isDownloadActive

  const corsBlocked = analysis?.corsStatus === 'blocked'
  const showCli = analysis !== null && corsBlocked
  const showChunks = state.chunks.length > 0 && (state.status === 'downloading' || state.status === 'merging')

  const canResumeFromState =
    (state.status === 'failed' || state.status === 'cancelled') &&
    state.fileAnalysis !== null &&
    state.overallProgress > 0

  const mod = modKey()
  const shortcuts = [
    { keys: `${mod}V`, label: 'Paste URL' },
    { keys: `${mod}↵`, label: 'Start' },
    { keys: 'Esc', label: 'Cancel' },
    { keys: `${mod}K`, label: 'Clear' },
  ]

  return (
    <div className="min-h-screen bg-surface-900 text-text-primary">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <UrlInput
          url={url}
          onUrlChange={handleUrlChange}
          onAnalyze={handleAnalyze}
          isAnalyzing={isAnalyzing}
          error={analyzeError || resumeError}
        />

        {/* Resume prompt for incomplete sessions */}
        {resumableSessions.length > 0 && state.status === 'idle' && (
          <ResumePrompt
            sessions={resumableSessions}
            onResume={handleResume}
            onDiscard={handleDiscard}
          />
        )}

        {!analysis && !isAnalyzing && state.status === 'idle' && resumableSessions.length === 0 && (
          <EmptyState
            icon="⚡"
            title="Paste a URL to start downloading"
            description="Accelerate downloads with parallel connections"
          />
        )}

        {analysis && (
          <FilePreview analysis={analysis} />
        )}

        {analysis && (
          <BrowserNotice fileSize={analysis.fileSize} />
        )}

        {showConfig && analysis && (
          <DownloadConfig
            connections={connections}
            onConnectionsChange={setConnections}
            useFileSystemAccess={useFileSystemAccess}
            onUseFileSystemAccessChange={setUseFileSystemAccess}
            throttle={throttle}
            onThrottleChange={setThrottle}
            suggestedConnections={suggestedConns}
            isFileSystemAccessSupported={fsaSupported}
            onStart={handleStart}
            canStart={canStart}
          />
        )}

        {showCli && analysis && (
          <CliCommandPanel
            url={analysis.url}
            fileName={analysis.fileName}
            connections={connections}
          />
        )}

        {showProgress && (
          <DownloadProgress
            status={state.status}
            overallProgress={state.overallProgress}
            downloadedBytes={state.downloadedBytes}
            totalBytes={state.totalBytes}
            speed={state.speed}
            eta={state.eta}
            onCancel={cancel}
            onResume={canResumeFromState ? handleResumeFromState : undefined}
            canResume={canResumeFromState}
          />
        )}

        {showChunks && (
          <ChunkVisualizer chunks={state.chunks} totalBytes={state.totalBytes} />
        )}

        <DownloadHistory
          entries={historyEntries}
          onClear={clearHistory}
          onRedownload={handleUrlChange}
        />

        <div className="pt-2 pb-4">
          <ShortcutHints shortcuts={shortcuts} />
        </div>
      </main>
    </div>
  )
}
