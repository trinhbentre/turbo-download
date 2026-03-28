const SAMPLE_INTERVAL_MS = 500
const WINDOW_DURATION_MS = 3000

interface Sample {
  timestamp: number
  bytes: number
}

export interface SpeedTracker {
  update: (totalBytesDownloaded: number) => void
  getSpeed: () => number
  getEta: (totalBytes: number | null) => number | null
  setBaseline: (bytes: number) => void
  reset: () => void
}

export function createSpeedTracker(): SpeedTracker {
  const samples: Sample[] = []
  let lastSampleTime = 0
  let lastTotalBytes = 0
  let currentSpeed = 0

  function update(totalBytesDownloaded: number): void {
    const now = Date.now()

    if (now - lastSampleTime >= SAMPLE_INTERVAL_MS) {
      samples.push({ timestamp: now, bytes: totalBytesDownloaded - lastTotalBytes })
      lastTotalBytes = totalBytesDownloaded
      lastSampleTime = now

      // Remove samples older than the window
      const cutoff = now - WINDOW_DURATION_MS
      while (samples.length > 0 && samples[0].timestamp < cutoff) {
        samples.shift()
      }

      const totalBytes = samples.reduce((sum, s) => sum + s.bytes, 0)
      const windowMs = samples.length > 1
        ? samples[samples.length - 1].timestamp - samples[0].timestamp
        : SAMPLE_INTERVAL_MS

      currentSpeed = windowMs > 0 ? (totalBytes / windowMs) * 1000 : 0
    }
  }

  function getSpeed(): number {
    return currentSpeed
  }

  function getEta(totalBytes: number | null): number | null {
    if (totalBytes === null || currentSpeed <= 0 || lastTotalBytes >= totalBytes) return null
    return (totalBytes - lastTotalBytes) / currentSpeed
  }

  function reset(): void {
    samples.length = 0
    lastSampleTime = 0
    lastTotalBytes = 0
    currentSpeed = 0
  }

  function setBaseline(bytes: number): void {
    lastTotalBytes = bytes
    lastSampleTime = Date.now()
  }

  return { update, getSpeed, getEta, setBaseline, reset }
}
