import type { DownloadConfig } from '../types/download'
import type { ChunkRange } from './chunkStrategy'

export interface DownloadCallbacks {
  onChunkProgress: (index: number, loaded: number, total: number) => void
  onChunkComplete: (index: number, data: ArrayBuffer) => void
  onChunkError: (index: number, error: string) => void
  onChunkRetry: (index: number, attempt: number) => void
  onProgress: (downloadedBytes: number) => void
  /** Streaming callback — when provided, data is NOT buffered in memory. */
  onChunkData?: (index: number, offset: number, data: Uint8Array) => void
}

export interface ParallelDownloadOptions {
  skipIndices?: Set<number>
  /** Pre-existing per-chunk byte counts for partial resume (streaming mode). */
  initialChunkBytes?: number[]
}

const INITIAL_RETRY_DELAY_MS = 500

export function startParallelDownload(
  url: string,
  chunks: ChunkRange[],
  config: DownloadConfig,
  callbacks: DownloadCallbacks,
  options?: ParallelDownloadOptions,
): AbortController {
  const controller = new AbortController()
  const { skipIndices, initialChunkBytes } = options ?? {}
  const streaming = !!callbacks.onChunkData
  let completed = skipIndices?.size ?? 0
  // Cumulative bytes received per chunk — only ever increases, survives retries
  const chunkStreamedBytes: number[] = chunks.map((c, i) => {
    if (skipIndices?.has(i)) return c.end - c.start + 1
    return initialChunkBytes?.[i] ?? 0
  })

  // Report initial progress for resumed chunks / partial chunks
  const initialBytes = chunkStreamedBytes.reduce((a, b) => a + b, 0)
  if (initialBytes > 0) {
    callbacks.onProgress(initialBytes)
  }

  async function runChunk(index: number): Promise<void> {
    if (controller.signal.aborted) return
    if (skipIndices?.has(index)) return

    // In buffered mode, accumulate data in memory. In streaming mode, skip buffering.
    const allBuffers: Uint8Array[] = []
    const chunkSize = chunks[index].end - chunks[index].start + 1

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      if (controller.signal.aborted) return

      // Exponential back-off before each retry (not before the first attempt)
      if (attempt > 0) {
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }

      try {
        // Resume from where we left off: skip bytes already downloaded
        const resumeFrom = chunks[index].start + chunkStreamedBytes[index]
        const endByte = chunks[index].end

        // Chunk already fully downloaded (e.g. partial resume had all bytes)
        if (resumeFrom > endByte) {
          completed++
          callbacks.onChunkComplete(index, new ArrayBuffer(0))
          return
        }

        const response = await fetch(url, {
          headers: { Range: `bytes=${resumeFrom}-${endByte}` },
          signal: controller.signal,
          mode: 'cors',
        })

        if (!response.ok && response.status !== 206) {
          throw new Error(`HTTP ${response.status}`)
        }

        const reader = response.body!.getReader()

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          if (streaming) {
            // Streaming mode: emit data immediately at the correct file offset
            const writeOffset = chunks[index].start + chunkStreamedBytes[index]
            callbacks.onChunkData!(index, writeOffset, value)
          } else {
            // Buffered mode: accumulate in memory
            allBuffers.push(value)
          }

          // chunkStreamedBytes[index] accumulates across retries — never resets to 0
          chunkStreamedBytes[index] += value.byteLength

          callbacks.onChunkProgress(index, chunkStreamedBytes[index], chunkSize)
          const streamingTotal = chunkStreamedBytes.reduce((a, b) => a + b, 0)
          callbacks.onProgress(streamingTotal)

          if (config.throttle !== null && config.throttle > 0) {
            const delayMs = (value.byteLength / config.throttle) * 1000
            await new Promise((resolve) => setTimeout(resolve, delayMs))
          }
        }

        // All bytes received
        completed++

        if (streaming) {
          // Data already streamed out
          callbacks.onChunkComplete(index, new ArrayBuffer(0))
        } else {
          // Merge buffers and deliver
          const total = chunkStreamedBytes[index]
          const merged = new Uint8Array(total)
          let offset = 0
          for (const buf of allBuffers) {
            merged.set(buf, offset)
            offset += buf.byteLength
          }
          callbacks.onChunkComplete(index, merged.buffer)
        }
        return

      } catch (err) {
        if (controller.signal.aborted) return
        if (attempt === config.maxRetries) {
          callbacks.onChunkError(index, (err as Error).message)
          return
        }
        // Signal UI that this chunk is retrying
        callbacks.onChunkRetry(index, attempt + 1)
        // Will loop and retry — resumeFrom offset is preserved in chunkStreamedBytes[index]
      }
    }
  }

  void Promise.all(chunks.map((_, i) => runChunk(i)))

  return controller
}

export function startSingleDownload(
  url: string,
  callbacks: DownloadCallbacks,
): AbortController {
  const controller = new AbortController()

  async function run() {
    const response = await fetch(url, { signal: controller.signal, mode: 'cors' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const contentLength = response.headers.get('content-length')
    const total = contentLength ? parseInt(contentLength, 10) : 0
    const reader = response.body!.getReader()
    const buffers: Uint8Array[] = []
    let loaded = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffers.push(value)
      loaded += value.byteLength
      callbacks.onChunkProgress(0, loaded, total)
      callbacks.onProgress(loaded)
    }

    const merged = new Uint8Array(loaded)
    let offset = 0
    for (const buf of buffers) {
      merged.set(buf, offset)
      offset += buf.byteLength
    }
    callbacks.onChunkComplete(0, merged.buffer)
  }

  run().catch((err) => {
    if (!controller.signal.aborted) {
      callbacks.onChunkError(0, (err as Error).message)
    }
  })

  return controller
}
