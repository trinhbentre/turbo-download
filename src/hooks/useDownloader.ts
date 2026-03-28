import { useState, useCallback, useRef } from 'react'
import { calculateChunks } from '../lib/chunkStrategy'
import { startParallelDownload, startSingleDownload } from '../lib/downloadEngine'
import type { ParallelDownloadOptions } from '../lib/downloadEngine'
import { saveFile, FileWriteQueue } from '../lib/fileWriter'
import { createSpeedTracker } from '../lib/speedCalculator'
import {
  createSessionId,
  saveSession,
  deleteSession,
  saveChunkData,
  loadAllChunkData,
} from '../lib/sessionStore'
import type {
  FileAnalysis,
  DownloadConfig,
  DownloadState,
  ChunkInfo,
  DownloadSession,
} from '../types/download'

const INITIAL_STATE: DownloadState = {
  status: 'idle',
  method: null,
  fileAnalysis: null,
  chunks: [],
  connections: 1,
  overallProgress: 0,
  downloadedBytes: 0,
  totalBytes: null,
  speed: 0,
  eta: null,
  startTime: null,
  endTime: null,
  error: null,
}

/** How often to persist partial chunk byte offsets (ms) */
const PARTIAL_SAVE_INTERVAL_MS = 5_000

interface UseDownloaderResult {
  state: DownloadState
  start: (analysis: FileAnalysis, config: DownloadConfig) => Promise<void>
  resume: (session: DownloadSession, analysis: FileAnalysis, config: DownloadConfig) => Promise<void>
  cancel: () => void
  reset: () => void
}

export function useDownloader(): UseDownloaderResult {
  const [state, setState] = useState<DownloadState>(INITIAL_STATE)
  const abortControllerRef = useRef<AbortController | null>(null)
  const speedTrackerRef = useRef(createSpeedTracker())
  const speedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const chunksDataRef = useRef<(ArrayBuffer | null)[]>([])
  const completedCountRef = useRef(0)
  const totalChunksRef = useRef(0)
  // Real-time per-chunk byte counts (updated synchronously in onChunkProgress)
  const chunkBytesRef = useRef<number[]>([])
  // Bytes snapshot from previous interval tick for delta speed calc
  const chunkPrevBytesRef = useRef<number[]>([])
  // Session persistence refs
  const sessionRef = useRef<DownloadSession | null>(null)
  const writeQueueRef = useRef<FileWriteQueue | null>(null)
  const persistPromisesRef = useRef<Promise<void>[]>([])
  // Interval for periodically saving partial chunk progress
  const partialSaveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopAllIntervals = useCallback(() => {
    if (speedIntervalRef.current) {
      clearInterval(speedIntervalRef.current)
      speedIntervalRef.current = null
    }
    if (partialSaveIntervalRef.current) {
      clearInterval(partialSaveIntervalRef.current)
      partialSaveIntervalRef.current = null
    }
  }, [])

  const startSpeedInterval = useCallback((totalBytes: number | null) => {
    speedIntervalRef.current = setInterval(() => {
      const speed = speedTrackerRef.current.getSpeed()
      const eta = speedTrackerRef.current.getEta(totalBytes)

      // Compute per-chunk speeds by diffing refs (no state read needed)
      const chunkSpeeds: number[] = chunkBytesRef.current.map((curr, i) => {
        const prev = chunkPrevBytesRef.current[i] ?? 0
        const delta = Math.max(0, curr - prev)
        chunkPrevBytesRef.current[i] = curr
        return delta / 0.5  // bytes per second (500ms interval)
      })

      setState((prev) => ({
        ...prev,
        speed,
        eta,
        chunks: prev.chunks.map((c) =>
          c.status === 'downloading'
            ? { ...c, speed: chunkSpeeds[c.index] ?? 0 }
            : c,
        ),
      }))
    }, 500)
  }, [])

  /** Periodically save per-chunk byte progress to IDB so partial resume works */
  const startPartialSaveInterval = useCallback(() => {
    partialSaveIntervalRef.current = setInterval(() => {
      const s = sessionRef.current
      if (!s) return

      const map: Record<string, number> = {}
      chunkBytesRef.current.forEach((bytes, i) => {
        if (!s.completedChunks.includes(i) && bytes > 0) {
          map[i.toString()] = bytes
        }
      })
      s.chunkBytesMap = map
      s.totalDownloaded = chunkBytesRef.current.reduce((a, b) => a + b, 0)
      s.updatedAt = Date.now()
      saveSession(s).catch(() => {})
    }, PARTIAL_SAVE_INTERVAL_MS)
  }, [])

  // Core download logic shared by start() and resume()
  const beginDownload = useCallback(async (
    analysis: FileAnalysis,
    config: DownloadConfig,
    resumeSession: DownloadSession | null,
  ) => {
    speedTrackerRef.current.reset()
    persistPromisesRef.current = []
    chunkBytesRef.current = []
    chunkPrevBytesRef.current = []

    const isParallel =
      analysis.rangeSupport === 'supported' &&
      analysis.corsStatus === 'allowed' &&
      analysis.fileSize !== null &&
      (resumeSession ? resumeSession.connections > 1 : config.connections > 1)

    const isSingle = !isParallel && analysis.corsStatus === 'allowed'

    if (analysis.corsStatus === 'blocked') {
      setState({
        ...INITIAL_STATE,
        status: 'cors-blocked',
        method: 'cli-only',
        fileAnalysis: analysis,
        connections: config.connections,
        totalBytes: analysis.fileSize,
      })
      return
    }

    const method = isParallel ? 'parallel' : 'single'

    // For resume: reuse saved chunk layout. For fresh: calculate new.
    const ranges = resumeSession
      ? resumeSession.chunkRanges
      : isParallel && analysis.fileSize !== null
        ? calculateChunks(analysis.fileSize, config.connections, config.chunkSizeMin)
        : [{ start: 0, end: (analysis.fileSize ?? 0) - 1 }]

    const skipIndices = resumeSession
      ? new Set(resumeSession.completedChunks)
      : new Set<number>()

    // Partial chunk bytes from previous session (for mid-chunk resume)
    const partialBytesMap = resumeSession?.chunkBytesMap ?? {}

    totalChunksRef.current = ranges.length
    completedCountRef.current = skipIndices.size
    chunksDataRef.current = new Array(ranges.length).fill(null)
    chunkBytesRef.current = ranges.map((r, i) => {
      if (skipIndices.has(i)) return r.end - r.start + 1
      return partialBytesMap[i.toString()] ?? 0
    })
    chunkPrevBytesRef.current = [...chunkBytesRef.current]

    // Determine streaming mode: use FSA streaming to avoid holding data in memory
    const useFSA = !!config.fileHandle ||
      (resumeSession?.useFSA && resumeSession?.fileHandle != null)
    const isStreaming = useFSA && isParallel

    // Load pre-existing chunk data for non-FSA resume (buffered mode only)
    if (resumeSession && !resumeSession.useFSA) {
      const savedChunks = await loadAllChunkData(resumeSession.id, ranges.length)
      for (let i = 0; i < savedChunks.length; i++) {
        if (savedChunks[i]) chunksDataRef.current[i] = savedChunks[i]
      }
    }

    // Create or reuse session
    const sessionId = resumeSession?.id ?? createSessionId(analysis.url, analysis.fileSize ?? 0)
    const session: DownloadSession = resumeSession ?? {
      id: sessionId,
      url: analysis.url,
      fileName: analysis.fileName,
      fileSize: analysis.fileSize!,
      contentType: analysis.contentType,
      etag: analysis.etag,
      lastModified: analysis.lastModified,
      chunkRanges: ranges,
      completedChunks: [],
      chunkBytesMap: {},
      connections: config.connections,
      totalDownloaded: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      useFSA: !!config.fileHandle,
      fileHandle: config.fileHandle ?? null,
    }
    sessionRef.current = session
    await saveSession(session)

    // Init FSA write queue
    if (config.fileHandle) {
      const wq = new FileWriteQueue()
      await wq.init(config.fileHandle)
      writeQueueRef.current = wq
    } else if (resumeSession?.useFSA && resumeSession.fileHandle) {
      type HandleWithPermission = FileSystemFileHandle & {
        requestPermission(opts: { mode: string }): Promise<PermissionState>
      }
      const handle = resumeSession.fileHandle as HandleWithPermission
      const perm = await handle.requestPermission({ mode: 'readwrite' })
      if (perm !== 'granted') {
        setState((prev) => ({
          ...prev,
          status: 'failed',
          error: 'File access permission denied. Please try again.',
        }))
        return
      }
      const wq = new FileWriteQueue()
      await wq.init(resumeSession.fileHandle)
      writeQueueRef.current = wq
    }

    const alreadyDownloaded = chunkBytesRef.current.reduce((a, b) => a + b, 0)

    const initialChunks: ChunkInfo[] = ranges.map((r, i) => {
      const chunkSize = r.end - r.start + 1
      const dlBytes = chunkBytesRef.current[i]
      const isComplete = skipIndices.has(i)
      return {
        index: i,
        startByte: r.start,
        endByte: r.end,
        status: isComplete ? 'completed' as const : dlBytes > 0 ? 'downloading' as const : 'pending' as const,
        progress: isComplete ? 1 : dlBytes > 0 ? dlBytes / chunkSize : 0,
        downloadedBytes: dlBytes,
        speed: 0,
        retryCount: 0,
        data: null,
      }
    })

    setState({
      ...INITIAL_STATE,
      status: 'downloading',
      method,
      fileAnalysis: analysis,
      chunks: initialChunks,
      connections: resumeSession?.connections ?? config.connections,
      totalBytes: analysis.fileSize,
      downloadedBytes: alreadyDownloaded,
      overallProgress: analysis.fileSize ? alreadyDownloaded / analysis.fileSize : 0,
      startTime: Date.now(),
    })

    startSpeedInterval(analysis.fileSize)
    startPartialSaveInterval()

    // Set speed baseline so resumed bytes don't create a speed spike
    if (alreadyDownloaded > 0) {
      speedTrackerRef.current.setBaseline(alreadyDownloaded)
    }

    // Check if already all done (edge case: resume with all chunks completed)
    if (completedCountRef.current === totalChunksRef.current) {
      void finalize(analysis, config)
      return
    }

    const callbacks = {
      // Streaming: write each data piece directly to disk at the correct file offset
      onChunkData: isStreaming
        ? (_index: number, offset: number, data: Uint8Array) => {
            writeQueueRef.current?.writeAt(offset, data as unknown as BufferSource)
          }
        : undefined,

      onChunkProgress: (index: number, loaded: number, total: number) => {
        chunkBytesRef.current[index] = loaded
        setState((prev) => {
          const chunks = prev.chunks.map((c) =>
            c.index === index
              ? {
                  ...c,
                  status: 'downloading' as const,
                  progress: total > 0 ? loaded / total : 0,
                  downloadedBytes: loaded,
                }
              : c,
          )
          return { ...prev, chunks }
        })
      },
      onChunkComplete: (index: number, data: ArrayBuffer) => {
        // In streaming mode data is empty — already written to disk
        if (!isStreaming) {
          chunksDataRef.current[index] = data
        }
        completedCountRef.current++

        // Persist chunk completion
        const persistPromise = (async () => {
          try {
            if (!isStreaming && !writeQueueRef.current) {
              // Non-FSA buffered: store data in IndexedDB
              if (data.byteLength > 0) {
                await saveChunkData(sessionId, index, data)
              }
            }
            // FSA + streaming: data already on disk via onChunkData

            // Update session metadata — mark chunk as completed
            const s = sessionRef.current
            if (s && !s.completedChunks.includes(index)) {
              s.completedChunks = [...s.completedChunks, index]
              delete s.chunkBytesMap[index.toString()]
              s.totalDownloaded = s.completedChunks.reduce((sum, ci) => {
                return sum + (ranges[ci].end - ranges[ci].start + 1)
              }, 0)
              s.updatedAt = Date.now()
              await saveSession(s)
            }
          } catch {
            // Persist failure is non-fatal
          }
        })()
        persistPromisesRef.current[index] = persistPromise

        setState((prev) => {
          const chunks = prev.chunks.map((c) =>
            c.index === index
              ? { ...c, status: 'completed' as const, progress: 1, speed: 0 }
              : c,
          )
          const overallProgress =
            prev.totalBytes != null && prev.totalBytes > 0
              ? prev.downloadedBytes / prev.totalBytes
              : completedCountRef.current / totalChunksRef.current

          return { ...prev, chunks, overallProgress }
        })

        if (completedCountRef.current === totalChunksRef.current) {
          void finalize(analysis, config)
        }
      },
      onChunkError: (index: number, error: string) => {
        // Save partial progress for this chunk before reporting failure
        const s = sessionRef.current
        if (s) {
          const bytes = chunkBytesRef.current[index]
          if (bytes > 0) {
            s.chunkBytesMap[index.toString()] = bytes
            s.updatedAt = Date.now()
            saveSession(s).catch(() => {})
          }
        }

        setState((prev) => {
          const chunks = prev.chunks.map((c) =>
            c.index === index
              ? { ...c, status: 'failed' as const, speed: 0 }
              : c,
          )
          // Check if all non-completed chunks have failed or completed
          const allSettled = chunks.every(
            (c) => c.status === 'completed' || c.status === 'failed',
          )
          if (allSettled) {
            stopAllIntervals()
            return { ...prev, chunks, status: 'failed', error }
          }
          return { ...prev, chunks }
        })
      },
      onChunkRetry: (index: number, attempt: number) => {
        setState((prev) => {
          const chunks = prev.chunks.map((c) =>
            c.index === index
              ? { ...c, status: 'retrying' as const, retryCount: attempt, speed: 0 }
              : c,
          )
          return { ...prev, chunks }
        })
      },
      onProgress: (downloadedBytes: number) => {
        speedTrackerRef.current.update(downloadedBytes)
        setState((prev) => {
          const overallProgress =
            prev.totalBytes != null && prev.totalBytes > 0
              ? downloadedBytes / prev.totalBytes
              : prev.overallProgress
          return { ...prev, downloadedBytes, overallProgress }
        })
      },
    }

    async function finalize(fa: FileAnalysis, cfg: DownloadConfig) {
      // Wait for all chunk persists to complete
      await Promise.all(persistPromisesRef.current.filter(Boolean))

      stopAllIntervals()
      setState((prev) => ({ ...prev, status: 'merging', overallProgress: 1 }))

      if (writeQueueRef.current) {
        // FSA path — data already on disk, just close the writable
        try {
          await writeQueueRef.current.close()
          writeQueueRef.current = null
          await deleteSession(sessionId).catch(() => {})
          sessionRef.current = null

          setState((prev) => ({
            ...prev,
            status: 'completed',
            overallProgress: 1,
            endTime: Date.now(),
            eta: null,
          }))
        } catch (err) {
          setState((prev) => ({
            ...prev,
            status: 'failed',
            error: (err as Error).message,
            endTime: Date.now(),
          }))
        }
      } else {
        // Non-FSA path — merge all chunks and save
        setState((prev) => ({ ...prev, status: 'saving' }))
        try {
          const allChunks = chunksDataRef.current.filter(Boolean) as ArrayBuffer[]
          await saveFile(
            allChunks,
            fa.fileName,
            fa.contentType ?? 'application/octet-stream',
            cfg.useFileSystemAccess,
            cfg.fileHandle,
          )
          await deleteSession(sessionId).catch(() => {})
          sessionRef.current = null

          setState((prev) => ({
            ...prev,
            status: 'completed',
            overallProgress: 1,
            endTime: Date.now(),
            eta: null,
          }))
        } catch (err) {
          setState((prev) => ({
            ...prev,
            status: 'failed',
            error: (err as Error).message,
            endTime: Date.now(),
          }))
        }
      }
    }

    if (isParallel) {
      const opts: ParallelDownloadOptions = {}
      if (skipIndices.size > 0) opts.skipIndices = skipIndices
      // Build initial byte offsets for partial chunk resume
      const hasPartialBytes = chunkBytesRef.current.some(
        (b, i) => b > 0 && !skipIndices.has(i),
      )
      if (hasPartialBytes) {
        opts.initialChunkBytes = chunkBytesRef.current.map((b, i) =>
          skipIndices.has(i) ? 0 : b,
        )
      }

      abortControllerRef.current = startParallelDownload(
        analysis.url,
        ranges,
        config,
        callbacks,
        Object.keys(opts).length > 0 ? opts : undefined,
      )
    } else if (isSingle) {
      abortControllerRef.current = startSingleDownload(analysis.url, callbacks)
    }
  }, [startSpeedInterval, startPartialSaveInterval, stopAllIntervals])

  const start = useCallback(async (analysis: FileAnalysis, config: DownloadConfig) => {
    await beginDownload(analysis, config, null)
  }, [beginDownload])

  const resume = useCallback(async (
    session: DownloadSession,
    analysis: FileAnalysis,
    config: DownloadConfig,
  ) => {
    await beginDownload(analysis, config, session)
  }, [beginDownload])

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort()

    // Save partial progress before stopping
    const s = sessionRef.current
    if (s) {
      const map: Record<string, number> = {}
      chunkBytesRef.current.forEach((bytes, i) => {
        if (!s.completedChunks.includes(i) && bytes > 0) {
          map[i.toString()] = bytes
        }
      })
      s.chunkBytesMap = map
      s.totalDownloaded = chunkBytesRef.current.reduce((a, b) => a + b, 0)
      s.updatedAt = Date.now()
      saveSession(s).catch(() => {})
    }

    stopAllIntervals()
    // Session preserved in IDB — user can resume later
    setState((prev) => ({ ...prev, status: 'cancelled', endTime: Date.now() }))
  }, [stopAllIntervals])

  const reset = useCallback(() => {
    abortControllerRef.current?.abort()
    stopAllIntervals()
    speedTrackerRef.current.reset()
    void writeQueueRef.current?.close().catch(() => {})
    writeQueueRef.current = null
    chunksDataRef.current = []
    chunkBytesRef.current = []
    chunkPrevBytesRef.current = []
    persistPromisesRef.current = []
    completedCountRef.current = 0
    totalChunksRef.current = 0
    sessionRef.current = null
    setState(INITIAL_STATE)
  }, [stopAllIntervals])

  return { state, start, resume, cancel, reset }
}
