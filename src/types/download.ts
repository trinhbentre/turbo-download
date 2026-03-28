// === URL Analysis ===

export type CorsStatus = 'allowed' | 'blocked' | 'unknown'
export type RangeSupport = 'supported' | 'unsupported' | 'unknown'

export interface FileAnalysis {
  url: string
  fileName: string
  fileSize: number | null
  contentType: string | null
  corsStatus: CorsStatus
  rangeSupport: RangeSupport
  acceptRanges: string | null
  lastModified: string | null
  etag: string | null
  analyzedAt: number
}

// === Download Engine ===

export type ChunkStatus = 'pending' | 'downloading' | 'completed' | 'failed' | 'retrying' | 'paused'

export interface ChunkInfo {
  index: number
  startByte: number
  endByte: number
  status: ChunkStatus
  progress: number
  downloadedBytes: number
  speed: number
  retryCount: number
  data: ArrayBuffer | null
}

export type DownloadMethod = 'parallel' | 'single' | 'cli-only'

export type DownloadStatus =
  | 'idle'
  | 'analyzing'
  | 'ready'
  | 'downloading'
  | 'paused'
  | 'merging'
  | 'saving'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'cors-blocked'

export interface DownloadState {
  status: DownloadStatus
  method: DownloadMethod | null
  fileAnalysis: FileAnalysis | null
  chunks: ChunkInfo[]
  connections: number
  overallProgress: number
  downloadedBytes: number
  totalBytes: number | null
  speed: number
  eta: number | null
  startTime: number | null
  endTime: number | null
  error: string | null
}

// === Download Config ===

export interface DownloadConfig {
  connections: number
  maxRetries: number
  chunkSizeMin: number
  useFileSystemAccess: boolean
  throttle: number | null
  fileHandle?: FileSystemFileHandle
}

// === History ===

export interface HistoryEntry {
  id: string
  url: string
  fileName: string
  fileSize: number | null
  method: DownloadMethod
  connections: number
  speed: number
  duration: number
  completedAt: number
  status: 'completed' | 'failed'
}

// === Download Session (Resume) ===

export interface DownloadSession {
  id: string
  url: string
  fileName: string
  fileSize: number
  contentType: string | null
  etag: string | null
  lastModified: string | null
  chunkRanges: Array<{ start: number; end: number }>
  completedChunks: number[]
  /** Per-chunk bytes already on disk (for partial resume within a chunk) */
  chunkBytesMap: Record<string, number>
  connections: number
  totalDownloaded: number
  createdAt: number
  updatedAt: number
  useFSA: boolean
  fileHandle: FileSystemFileHandle | null
}

// === CLI Generator ===

export type CliTool = 'aria2c' | 'curl' | 'wget'

export interface CliCommand {
  tool: CliTool
  command: string
  description: string
}
