import type { DownloadSession } from '../types/download'

const DB_NAME = 'turbo-download'
const DB_VERSION = 1
const SESSIONS = 'sessions'
const CHUNKS = 'chunks'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(SESSIONS)) {
        db.createObjectStore(SESSIONS, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(CHUNKS)) {
        db.createObjectStore(CHUNKS)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export function createSessionId(url: string, fileSize: number): string {
  let hash = 0
  const str = `${url}|${fileSize}`
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return `td-${Math.abs(hash).toString(36)}-${fileSize.toString(36)}`
}

export async function saveSession(session: DownloadSession): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SESSIONS, 'readwrite')
    tx.objectStore(SESSIONS).put(session)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function getSession(id: string): Promise<DownloadSession | undefined> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SESSIONS, 'readonly')
    const req = tx.objectStore(SESSIONS).get(id)
    req.onsuccess = () => { db.close(); resolve(req.result) }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

export async function deleteSession(id: string): Promise<void> {
  const session = await getSession(id)
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([SESSIONS, CHUNKS], 'readwrite')
    tx.objectStore(SESSIONS).delete(id)
    if (session) {
      const chunkStore = tx.objectStore(CHUNKS)
      for (let i = 0; i < session.chunkRanges.length; i++) {
        chunkStore.delete(`${id}:${i}`)
      }
    }
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function getIncompleteSessions(): Promise<DownloadSession[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SESSIONS, 'readonly')
    const req = tx.objectStore(SESSIONS).getAll()
    req.onsuccess = () => {
      db.close()
      const sessions = (req.result as DownloadSession[]).filter(
        (s) => s.completedChunks.length < s.chunkRanges.length,
      )
      sessions.sort((a, b) => b.updatedAt - a.updatedAt)
      resolve(sessions)
    }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

export async function saveChunkData(
  sessionId: string,
  chunkIndex: number,
  data: ArrayBuffer,
): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHUNKS, 'readwrite')
    tx.objectStore(CHUNKS).put(data, `${sessionId}:${chunkIndex}`)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function loadAllChunkData(
  sessionId: string,
  totalChunks: number,
): Promise<(ArrayBuffer | null)[]> {
  const db = await openDB()
  const results: (ArrayBuffer | null)[] = new Array(totalChunks).fill(null)

  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHUNKS, 'readonly')
    const store = tx.objectStore(CHUNKS)

    for (let i = 0; i < totalChunks; i++) {
      const req = store.get(`${sessionId}:${i}`)
      const idx = i
      req.onsuccess = () => {
        if (req.result) results[idx] = req.result
      }
    }

    tx.oncomplete = () => { db.close(); resolve(results) }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function cleanupOldSessions(maxAgeDays: number = 7): Promise<void> {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000
  const db = await openDB()

  const sessions = await new Promise<DownloadSession[]>((resolve, reject) => {
    const tx = db.transaction(SESSIONS, 'readonly')
    const req = tx.objectStore(SESSIONS).getAll()
    req.onsuccess = () => resolve(req.result ?? [])
    req.onerror = () => reject(req.error)
  })

  const oldSessions = sessions.filter((s) => s.updatedAt < cutoff)
  if (oldSessions.length === 0) { db.close(); return }

  return new Promise((resolve, reject) => {
    const tx = db.transaction([SESSIONS, CHUNKS], 'readwrite')
    for (const session of oldSessions) {
      tx.objectStore(SESSIONS).delete(session.id)
      for (let i = 0; i < session.chunkRanges.length; i++) {
        tx.objectStore(CHUNKS).delete(`${session.id}:${i}`)
      }
    }
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}
