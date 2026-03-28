import { useCallback, useRef } from 'react'
import { createSpeedTracker, type SpeedTracker } from '../lib/speedCalculator'

interface UseSpeedTrackerResult {
  trackerRef: React.MutableRefObject<SpeedTracker>
  update: (totalBytes: number) => void
  reset: () => void
}

export function useSpeedTracker(): UseSpeedTrackerResult {
  const trackerRef = useRef<SpeedTracker>(createSpeedTracker())

  const update = useCallback((totalBytes: number) => {
    trackerRef.current.update(totalBytes)
  }, [])

  const reset = useCallback(() => {
    trackerRef.current.reset()
  }, [])

  return { trackerRef, update, reset }
}
