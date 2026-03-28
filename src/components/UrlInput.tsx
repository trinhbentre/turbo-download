import { useRef, useCallback } from 'react'
import { Button, ErrorBanner } from '@web-tools/ui'

interface UrlInputProps {
  url: string
  onUrlChange: (url: string) => void
  onAnalyze: () => void
  isAnalyzing: boolean
  error: string | null
}

export function UrlInput({ url, onUrlChange, onAnalyze, isAnalyzing, error }: UrlInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') onAnalyze()
    },
    [onAnalyze],
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onUrlChange(e.target.value)
    },
    [onUrlChange],
  )

  return (
    <div className="card space-y-3">
      <div className="flex gap-2">
        <div className="flex-1 flex items-center gap-2 input-base px-3">
          <svg
            className="w-4 h-4 text-text-muted flex-shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          <input
            ref={inputRef}
            type="url"
            value={url}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Paste download URL..."
            className="flex-1 bg-transparent py-2 text-text-primary placeholder:text-text-muted outline-none"
            autoFocus
            maxLength={2048}
          />
        </div>
        <Button
          variant="primary"
          onClick={onAnalyze}
          disabled={!url || isAnalyzing}
          loading={isAnalyzing}
        >
          Analyze
        </Button>
      </div>
      {error && <ErrorBanner message={error} />}
    </div>
  )
}
