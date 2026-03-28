import type { FileAnalysis } from '../types/download'

function extractFileName(url: string, contentDisposition: string | null): string {
  if (contentDisposition) {
    const filenameMatch =
      contentDisposition.match(/filename\*=UTF-8''([^;]+)/i) ||
      contentDisposition.match(/filename="?([^";]+)"?/i)
    if (filenameMatch) {
      return decodeURIComponent(filenameMatch[1].trim())
    }
  }
  try {
    const pathname = new URL(url).pathname
    const parts = pathname.split('/')
    const last = parts[parts.length - 1]
    if (last) return decodeURIComponent(last)
  } catch {
    // ignore
  }
  return 'download'
}

function parseHeaders(response: Response) {
  return {
    contentLength: response.headers.get('content-length'),
    contentType: response.headers.get('content-type'),
    acceptRanges: response.headers.get('accept-ranges'),
    contentDisposition: response.headers.get('content-disposition'),
    lastModified: response.headers.get('last-modified'),
    etag: response.headers.get('etag'),
  }
}

export async function analyzeUrl(url: string): Promise<FileAnalysis> {
  const analyzedAt = Date.now()

  // --- Step 1: Try HEAD ---
  let headHeaders: ReturnType<typeof parseHeaders> | null = null
  try {
    const headRes = await fetch(url, { method: 'HEAD', mode: 'cors' })
    headHeaders = parseHeaders(headRes)
  } catch {
    // HEAD failed (CORS blocked or server rejects HEAD) — fall through to GET probe
  }

  // If HEAD was blocked entirely, we know CORS is blocked
  if (headHeaders === null) {
    // Try a GET range probe to distinguish CORS block vs HEAD-only rejection
    try {
      const probeRes = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        headers: { Range: 'bytes=0-0' },
      })
      // If we reach here, CORS is allowed but HEAD was rejected
      const h = parseHeaders(probeRes)
      const rangeSupport: FileAnalysis['rangeSupport'] =
        probeRes.status === 206 || h.acceptRanges === 'bytes'
          ? 'supported'
          : h.acceptRanges === 'none'
            ? 'unsupported'
            : 'unknown'
      // Content-Length in a 206 response is the range size, not total — use Content-Range
      let fileSize: number | null = null
      const contentRange = probeRes.headers.get('content-range')
      if (contentRange) {
        const match = contentRange.match(/\/(\d+)$/)
        if (match) fileSize = parseInt(match[1], 10)
      } else if (h.contentLength) {
        fileSize = parseInt(h.contentLength, 10)
      }
      // Consume the tiny body so the connection is freed
      await probeRes.body?.cancel()
      return {
        url,
        fileName: extractFileName(url, h.contentDisposition),
        fileSize: fileSize !== null && !isNaN(fileSize) ? fileSize : null,
        contentType: h.contentType ? h.contentType.split(';')[0].trim() : null,
        corsStatus: 'allowed',
        rangeSupport,
        acceptRanges: h.acceptRanges,
        lastModified: h.lastModified,
        etag: h.etag,
        analyzedAt,
      }
    } catch {
      // Truly CORS blocked
      return {
        url,
        fileName: extractFileName(url, null),
        fileSize: null,
        contentType: null,
        corsStatus: 'blocked',
        rangeSupport: 'unknown',
        acceptRanges: null,
        lastModified: null,
        etag: null,
        analyzedAt,
      }
    }
  }

  // --- Step 2: HEAD succeeded — check if range support is already confirmed ---
  const fileSize = headHeaders.contentLength ? parseInt(headHeaders.contentLength, 10) : null

  if (headHeaders.acceptRanges === 'bytes') {
    return {
      url,
      fileName: extractFileName(url, headHeaders.contentDisposition),
      fileSize: fileSize !== null && !isNaN(fileSize) ? fileSize : null,
      contentType: headHeaders.contentType ? headHeaders.contentType.split(';')[0].trim() : null,
      corsStatus: 'allowed',
      rangeSupport: 'supported',
      acceptRanges: headHeaders.acceptRanges,
      lastModified: headHeaders.lastModified,
      etag: headHeaders.etag,
      analyzedAt,
    }
  }

  if (headHeaders.acceptRanges === 'none') {
    return {
      url,
      fileName: extractFileName(url, headHeaders.contentDisposition),
      fileSize: fileSize !== null && !isNaN(fileSize) ? fileSize : null,
      contentType: headHeaders.contentType ? headHeaders.contentType.split(';')[0].trim() : null,
      corsStatus: 'allowed',
      rangeSupport: 'unsupported',
      acceptRanges: headHeaders.acceptRanges,
      lastModified: headHeaders.lastModified,
      etag: headHeaders.etag,
      analyzedAt,
    }
  }

  // --- Step 3: accept-ranges missing from HEAD — probe with GET Range: bytes=0-0 ---
  let probeRangeSupport: FileAnalysis['rangeSupport'] = 'unknown'
  let probeAcceptRanges = headHeaders.acceptRanges
  let probeFileSize = fileSize

  try {
    const probeRes = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      headers: { Range: 'bytes=0-0' },
    })
    const probeAccept = probeRes.headers.get('accept-ranges')
    if (probeRes.status === 206 || probeAccept === 'bytes') {
      probeRangeSupport = 'supported'
      probeAcceptRanges = 'bytes'
    } else if (probeAccept === 'none') {
      probeRangeSupport = 'unsupported'
      probeAcceptRanges = 'none'
    }
    // If Content-Length was missing from HEAD, try to get it from Content-Range
    if (probeFileSize === null || isNaN(probeFileSize)) {
      const contentRange = probeRes.headers.get('content-range')
      if (contentRange) {
        const match = contentRange.match(/\/(\d+)$/)
        if (match) probeFileSize = parseInt(match[1], 10)
      }
    }
    await probeRes.body?.cancel()
  } catch {
    // Probe failed — keep unknown
  }

  return {
    url,
    fileName: extractFileName(url, headHeaders.contentDisposition),
    fileSize: probeFileSize !== null && !isNaN(probeFileSize!) ? probeFileSize : null,
    contentType: headHeaders.contentType ? headHeaders.contentType.split(';')[0].trim() : null,
    corsStatus: 'allowed',
    rangeSupport: probeRangeSupport,
    acceptRanges: probeAcceptRanges,
    lastModified: headHeaders.lastModified,
    etag: headHeaders.etag,
    analyzedAt,
  }
}
