import { formatBytes } from '@web-tools/ui'
import { Button } from '@web-tools/ui'
import type { DownloadStatus } from '../types/download'

interface DownloadProgressProps {
  status: DownloadStatus
  overallProgress: number
  downloadedBytes: number
  totalBytes: number | null
  speed: number
  eta: number | null
  onCancel: () => void
  onResume?: () => void
  canResume?: boolean
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}m ${s}s`
}

export function DownloadProgress({
  status,
  overallProgress,
  downloadedBytes,
  totalBytes,
  speed,
  eta,
  onCancel,
  onResume,
  canResume,
}: DownloadProgressProps) {
  const pct = Math.min(100, Math.round(overallProgress * 100))
  const isIndeterminate = status === 'merging' || status === 'saving'

  if (status === 'completed') {
    return (
      <div className="card bg-success/10 border-success">
        <p className="text-success font-medium text-sm">
          ✅ Download complete!{' '}
          {totalBytes !== null ? formatBytes(totalBytes) : formatBytes(downloadedBytes)} downloaded
        </p>
      </div>
    )
  }

  if (status === 'failed') {
    return (
      <div className="card bg-danger/10 border-danger space-y-2">
        <p className="text-danger font-medium text-sm">❌ Download failed</p>
        {canResume && onResume && (
          <Button variant="primary" size="sm" onClick={onResume}>
            ▶ Resume from {Math.round(overallProgress * 100)}%
          </Button>
        )}
      </div>
    )
  }

  if (status === 'cancelled') {
    return (
      <div className="card space-y-2">
        <p className="text-text-muted text-sm">Download cancelled</p>
        {canResume && onResume && (
          <Button variant="primary" size="sm" onClick={onResume}>
            ▶ Resume from {Math.round(overallProgress * 100)}%
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="card space-y-3">
      {/* Status label */}
      {(status === 'merging' || status === 'saving') && (
        <p className="text-sm text-text-secondary animate-pulse">
          {status === 'merging' ? 'Merging chunks...' : 'Saving file...'}
        </p>
      )}

      {/* Progress bar */}
      <div className="relative h-5 bg-surface-700 rounded overflow-hidden">
        <div
          className={`h-full rounded transition-all duration-300 ${isIndeterminate ? 'w-full bg-accent/40 animate-pulse' : 'bg-accent'}`}
          style={isIndeterminate ? undefined : { width: `${pct}%` }}
        />
        {!isIndeterminate && (
          <span className="absolute inset-0 flex items-center justify-center text-xs font-mono font-bold text-white mix-blend-difference">
            {pct}%
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 text-xs font-mono">
        <div className="bg-surface-700 rounded px-2 py-1.5">
          <p className="text-text-muted text-xs mb-0.5">Downloaded</p>
          <p className="text-text-primary font-semibold">
            {formatBytes(downloadedBytes)}
            {totalBytes !== null && (
              <span className="text-text-muted font-normal"> / {formatBytes(totalBytes)}</span>
            )}
          </p>
        </div>
        <div className="bg-surface-700 rounded px-2 py-1.5">
          <p className="text-text-muted text-xs mb-0.5">Speed</p>
          <p className={`font-semibold ${speed > 0 ? 'text-accent' : 'text-text-muted'}`}>
            {speed > 0 ? `${formatBytes(speed)}/s` : '—'}
          </p>
        </div>
        <div className="bg-surface-700 rounded px-2 py-1.5">
          <p className="text-text-muted text-xs mb-0.5">ETA</p>
          <p className="text-text-primary font-semibold">
            {eta !== null ? formatEta(eta) : '—'}
          </p>
        </div>
      </div>

      <Button variant="danger" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  )
}
