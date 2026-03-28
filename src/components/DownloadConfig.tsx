import { useCallback } from 'react'
import { Button } from '@web-tools/ui'

interface DownloadConfigProps {
  connections: number
  onConnectionsChange: (n: number) => void
  useFileSystemAccess: boolean
  onUseFileSystemAccessChange: (v: boolean) => void
  throttle: number | null
  onThrottleChange: (v: number | null) => void
  suggestedConnections: number
  isFileSystemAccessSupported: boolean
  onStart: () => void
  canStart: boolean
}

export function DownloadConfig({
  connections,
  onConnectionsChange,
  useFileSystemAccess,
  onUseFileSystemAccessChange,
  throttle,
  onThrottleChange,
  suggestedConnections,
  isFileSystemAccessSupported,
  onStart,
  canStart,
}: DownloadConfigProps) {
  const handleConnectionsChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onConnectionsChange(Number(e.target.value))
    },
    [onConnectionsChange],
  )

  const handleThrottleToggle = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onThrottleChange(e.target.checked ? 5 * 1024 * 1024 : null)
    },
    [onThrottleChange],
  )

  const handleThrottleValue = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const mb = parseFloat(e.target.value)
      if (!isNaN(mb) && mb > 0) {
        onThrottleChange(mb * 1024 * 1024)
      }
    },
    [onThrottleChange],
  )

  return (
    <div className="card space-y-4">
      {/* Connection slider */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <label className="text-sm font-medium text-text-primary">Parallel Connections</label>
          <span className="text-accent font-mono font-bold text-sm">{connections}</span>
        </div>
        <input
          type="range"
          min={1}
          max={16}
          step={1}
          value={connections}
          onChange={handleConnectionsChange}
          className="w-full accent-accent"
        />
        <p className="text-xs text-text-muted">
          Recommended: {suggestedConnections} for this file size
        </p>
      </div>

      {/* File System Access */}
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={useFileSystemAccess && isFileSystemAccessSupported}
          onChange={(e) => onUseFileSystemAccessChange(e.target.checked)}
          disabled={!isFileSystemAccessSupported}
          className="mt-0.5 accent-accent"
        />
        <div>
          <span className="text-sm text-text-primary">Save directly to disk</span>
          <p className="text-xs text-text-muted mt-0.5">
            {isFileSystemAccessSupported
              ? 'A save dialog will open before the download starts (recommended for large files)'
              : 'Only available on Chrome and Edge'}
          </p>
        </div>
      </label>

      {/* Throttle */}
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={throttle !== null}
          onChange={handleThrottleToggle}
          className="mt-0.5 accent-accent"
        />
        <div className="flex-1">
          <span className="text-sm text-text-primary">Limit download speed</span>
          {throttle !== null && (
            <div className="flex items-center gap-2 mt-1.5">
              <input
                type="number"
                min={0.1}
                step={0.5}
                value={(throttle / 1024 / 1024).toFixed(1)}
                onChange={handleThrottleValue}
                className="input-base w-24 px-2 py-1 text-sm font-mono"
              />
              <span className="text-sm text-text-muted">MB/s</span>
            </div>
          )}
        </div>
      </label>

      <Button variant="primary" size="lg" onClick={onStart} disabled={!canStart} className="w-full">
        {useFileSystemAccess && isFileSystemAccessSupported ? '📁 Choose Location & Start' : '⚡ Start Download'}
      </Button>
    </div>
  )
}
