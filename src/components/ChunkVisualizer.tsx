import { formatBytes } from '@web-tools/ui'
import type { ChunkInfo, ChunkStatus } from '../types/download'

interface ChunkVisualizerProps {
  chunks: ChunkInfo[]
  totalBytes: number | null
}

function statusColor(status: ChunkStatus): string {
  switch (status) {
    case 'pending':    return 'bg-surface-600'
    case 'downloading': return 'bg-accent'
    case 'completed':  return 'bg-success'
    case 'failed':     return 'bg-danger'
    case 'retrying':   return 'bg-warning'
    case 'paused':     return 'bg-text-muted'
    default:           return 'bg-surface-600'
  }
}

function statusLabel(status: ChunkStatus): string {
  switch (status) {
    case 'pending':     return 'Waiting'
    case 'downloading': return 'Downloading'
    case 'completed':   return 'Done'
    case 'failed':      return 'Failed'
    case 'retrying':    return 'Retrying'
    case 'paused':      return 'Paused'
    default: return status
  }
}

export function ChunkVisualizer({ chunks, totalBytes }: ChunkVisualizerProps) {
  if (chunks.length === 0) return null

  const completedCount = chunks.filter((c) => c.status === 'completed').length
  const activeCount = chunks.filter((c) => c.status === 'downloading').length

  return (
    <div className="card space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-text-muted uppercase tracking-wide">
          Parallel Chunks ({chunks.length})
        </p>
        <p className="text-xs text-text-secondary font-mono">
          {completedCount}/{chunks.length} done · {activeCount} active
        </p>
      </div>

      {/* Chunk rows */}
      <div className="space-y-2">
        {chunks.map((chunk) => {
          const pct = Math.round(chunk.progress * 100)
          const chunkSize = chunk.endByte - chunk.startByte + 1
          const isActive = chunk.status === 'downloading'

          return (
            <div key={chunk.index} className="space-y-1">
              {/* Label row */}
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-text-secondary">
                  #{chunk.index + 1}
                  <span className="text-text-muted ml-2">
                    {formatBytes(chunk.startByte)} – {formatBytes(chunk.endByte)}
                  </span>
                </span>
                <div className="flex items-center gap-3">
                  {isActive && chunk.speed > 0 && (
                    <span className="text-accent">{formatBytes(chunk.speed)}/s</span>
                  )}
                  <span
                    className={
                      chunk.status === 'completed'
                        ? 'text-success'
                        : chunk.status === 'failed'
                          ? 'text-danger'
                          : chunk.status === 'retrying'
                            ? 'text-warning'
                            : 'text-text-muted'
                    }
                  >
                    {isActive ? `${pct}%` : statusLabel(chunk.status)}
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="relative h-2 bg-surface-700 rounded overflow-hidden">
                {/* downloaded portion */}
                <div
                  className={`h-full rounded transition-all duration-300 ${statusColor(chunk.status)} ${isActive ? 'opacity-90' : ''}`}
                  style={{ width: `${pct}%` }}
                />
                {/* subtle pulse overlay for active chunks */}
                {isActive && (
                  <div
                    className="absolute top-0 left-0 h-full bg-white/10 animate-pulse rounded"
                    style={{ width: `${pct}%` }}
                  />
                )}
              </div>

              {/* Mini detail: bytes downloaded / chunk size */}
              {isActive && (
                <div className="flex justify-between text-xs text-text-muted font-mono">
                  <span>{formatBytes(chunk.downloadedBytes)}</span>
                  <span>{formatBytes(chunkSize)}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Summary bar — shows overall split across chunks */}
      {totalBytes !== null && (
        <div
          className="flex h-1.5 rounded overflow-hidden gap-px"
          title="Overall chunk map"
        >
          {chunks.map((chunk) => (
            <div
              key={chunk.index}
              className={`h-full transition-colors duration-300 ${statusColor(chunk.status)}`}
              style={{ flex: chunk.endByte - chunk.startByte + 1 }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
