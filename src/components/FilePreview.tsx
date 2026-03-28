import { formatBytes } from '@web-tools/ui'
import type { FileAnalysis } from '../types/download'

interface FilePreviewProps {
  analysis: FileAnalysis
}

function StatusBadge({ value }: { value: 'allowed' | 'blocked' | 'unknown' | 'supported' | 'unsupported' }) {
  if (value === 'allowed' || value === 'supported') {
    return <span className="text-success font-medium">✅ {value === 'allowed' ? 'Allowed' : 'Supported'}</span>
  }
  if (value === 'blocked' || value === 'unsupported') {
    return <span className="text-danger font-medium">❌ {value === 'blocked' ? 'Blocked' : 'Not supported'}</span>
  }
  return <span className="text-text-muted">❓ Unknown</span>
}

export function FilePreview({ analysis }: FilePreviewProps) {
  return (
    <div className="card space-y-3">
      {analysis.corsStatus === 'blocked' && (
        <div className="flex items-start gap-2 rounded p-3 bg-warning/10 border border-warning text-warning text-sm">
          <span>⚠️</span>
          <span>
            CORS blocked — browser cannot download this file directly. Use the CLI commands below.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <div className="col-span-2">
          <span className="text-text-muted">File name</span>
          <p className="text-text-primary font-medium truncate mt-0.5">{analysis.fileName}</p>
        </div>

        <div>
          <span className="text-text-muted">File size</span>
          <p className="text-text-primary mt-0.5">
            {analysis.fileSize !== null ? formatBytes(analysis.fileSize) : 'Unknown'}
          </p>
        </div>

        <div>
          <span className="text-text-muted">Content type</span>
          <p className="text-text-primary font-mono text-xs mt-0.5">
            {analysis.contentType ?? 'Unknown'}
          </p>
        </div>

        <div>
          <span className="text-text-muted">Range support</span>
          <p className="mt-0.5">
            <StatusBadge value={analysis.rangeSupport} />
          </p>
        </div>

        <div>
          <span className="text-text-muted">CORS</span>
          <p className="mt-0.5">
            <StatusBadge value={analysis.corsStatus} />
          </p>
        </div>
      </div>
    </div>
  )
}
