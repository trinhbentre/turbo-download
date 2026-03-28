interface BrowserNoticeProps {
  fileSize: number | null
}

const LARGE_FILE_THRESHOLD = 500 * 1024 * 1024 // 500 MB

function isChromiumBased(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /Chrome\/|Edg\//.test(ua) && !/Firefox\/|Safari\//.test(ua.replace('Chrome', ''))
}

export function BrowserNotice({ fileSize }: BrowserNoticeProps) {
  const chromium = isChromiumBased()
  const isLargeFile = fileSize !== null && fileSize > LARGE_FILE_THRESHOLD

  if (chromium && !isLargeFile) return null

  return (
    <div className="flex items-start gap-2 rounded p-3 bg-warning/10 border border-warning text-warning text-sm">
      <span className="flex-shrink-0">⚠️</span>
      <span>
        {isLargeFile && !chromium ? (
          <>
            Large file download works best on <strong>Chrome</strong> or <strong>Edge</strong> which
            support direct disk writes. On this browser, the file must fit in memory before saving.
          </>
        ) : isLargeFile ? (
          <>
            Large file detected. Enable <strong>Save directly to disk</strong> below to avoid
            loading the entire file into memory.
          </>
        ) : (
          <>
            <strong>Chrome</strong> or <strong>Edge</strong> is recommended for direct disk writes,
            especially for files over 500 MB.
          </>
        )}
      </span>
    </div>
  )
}
