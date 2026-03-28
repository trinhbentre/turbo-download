import { formatBytes, Button } from '@web-tools/ui'
import type { DownloadSession } from '../types/download'

interface ResumePromptProps {
  sessions: DownloadSession[]
  onResume: (session: DownloadSession) => void
  onDiscard: (session: DownloadSession) => void
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function ResumePrompt({ sessions, onResume, onDiscard }: ResumePromptProps) {
  if (sessions.length === 0) return null

  return (
    <div className="space-y-2">
      {sessions.map((session) => {
        // Calculate real progress including partial chunks
        const completedBytes = session.completedChunks.reduce((sum, i) => {
          const r = session.chunkRanges[i]
          return sum + (r.end - r.start + 1)
        }, 0)
        const partialBytes = Object.values(session.chunkBytesMap ?? {}).reduce(
          (sum, b) => sum + b, 0,
        )
        const totalDl = completedBytes + partialBytes
        const pct = session.fileSize > 0
          ? Math.round((totalDl / session.fileSize) * 100)
          : 0

        return (
          <div key={session.id} className="card border-warning/50 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-warning text-lg">⏸</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">
                  {session.fileName}
                </p>
                <p className="text-xs text-text-secondary mt-0.5">
                  Incomplete download — {pct}% complete
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 bg-surface-700 rounded overflow-hidden">
              <div
                className="h-full bg-warning rounded transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>

            {/* Details */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted font-mono">
              <span>
                {session.completedChunks.length}/{session.chunkRanges.length} chunks
              </span>
              <span>
                {formatBytes(totalDl)} / {formatBytes(session.fileSize)}
              </span>
              <span>{session.connections} connections</span>
              <span>Started {formatTimeAgo(session.createdAt)}</span>
              {session.useFSA && <span className="text-accent">💾 Direct to disk</span>}
            </div>

            {/* URL */}
            <p className="text-xs text-text-muted font-mono truncate" title={session.url}>
              {session.url}
            </p>

            {/* Actions */}
            <div className="flex gap-2">
              <Button variant="primary" size="sm" onClick={() => onResume(session)}>
                ▶ Resume Download
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onDiscard(session)}>
                Discard
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
