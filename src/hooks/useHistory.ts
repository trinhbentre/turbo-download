import { useCallback } from 'react'
import { useStorage } from '@web-tools/ui'
import type { HistoryEntry } from '../types/download'

const MAX_HISTORY = 50
const STORAGE_KEY = 'td-history'

export function useHistory() {
  const [entries, setEntries] = useStorage<HistoryEntry[]>(STORAGE_KEY, [])

  const addEntry = useCallback(
    (entry: HistoryEntry) => {
      const filtered = entries.filter((e) => e.id !== entry.id)
      setEntries([entry, ...filtered].slice(0, MAX_HISTORY))
    },
    [entries, setEntries],
  )

  const clearHistory = useCallback(() => {
    setEntries([])
  }, [setEntries])

  return { entries, addEntry, clearHistory }
}
