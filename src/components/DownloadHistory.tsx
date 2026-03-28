import { useState, useCallback } from 'react'
import { formatBytes, Button } from '@web-tools/ui'
import type { HistoryEntry } from '../types/download'

interface DownloadHistoryProps {
  entries: HistoryEntry[]
  onClear: () => void
  onRedownload: (url: string) => void
}

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return 'just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} min ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr} hr ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`
}

function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`
}

export function DownloadHistory({ entries, onClear, onRedownload }: DownloadHistoryProps) {
  const [expanded, setExpanded] = useState(false)

  const handleToggle = useCallback(() => setExpanded((v) => !v), [])

  if (entries.length === 0) return null

  return (
    <div className="card space-y-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleToggle}
          className="flex items-center gap-2 text-sm font-medium text-text-primary hover:text-accent transition-colors"
        >
          <span className="text-text-muted">{expanded ? '▼' : '▶'}</span>
          Download History ({entries.length})
        </button>

        {expanded && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear all
          </Button>
        )}
      </div>

      {expanded && (
        <div className="space-y-1 mt-1">
          {entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => onRedownload(entry.url)}
              className="w-full text-left flex items-center gap-3 px-2 py-2 rounded hover:bg-surface-700 transition-colors group"
            >
              <span className="flex-shrink-0">
                {entry.status === 'completed' ? '✅' : '❌'}
              </span>

              <span className="flex-1 min-w-0">
                <span className="block text-sm text-text-primary truncate group-hover:text-accent transition-colors">
                  {entry.fileName}
                </span>
                <span className="text-xs text-text-muted font-mono">
                  {entry.fileSize !== null ? formatBytes(entry.fileSize) : 'Unknown size'}
                  {' · '}
                  {entry.connections} conn
                  {' · '}
                  {formatSpeed(entry.speed)}
                </span>
              </span>

              <span className="flex-shrink-0 text-xs text-text-muted">
                {formatRelativeTime(entry.completedAt)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
