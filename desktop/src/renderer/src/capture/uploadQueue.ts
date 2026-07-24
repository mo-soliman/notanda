// IndexedDB-backed upload queue. Chunks land in the DB first, then upload;
// server PUTs are idempotent, so replays after a crash/restart are safe.

import { api } from '../api/client'
import type { Stream } from '../api/types'

const DB_NAME = 'notanda-uploads'
const STORE = 'chunks'

interface QueuedChunk {
  key: string // `${meetingId}/${stream}/${index}`
  meetingId: string
  stream: Stream
  index: number
  blob: Blob
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export class UploadQueue {
  private db: IDBDatabase | null = null
  private draining = false
  private backoffMs = 1000
  private timer: ReturnType<typeof setTimeout> | null = null
  onchange: ((pending: number) => void) | null = null

  async init(): Promise<void> {
    this.db = await openDb()
    void this.drain()
  }

  async enqueue(meetingId: string, stream: Stream, index: number, blob: Blob): Promise<void> {
    if (!this.db) throw new Error('queue not initialized')
    const chunk: QueuedChunk = { key: `${meetingId}/${stream}/${index}`, meetingId, stream, index, blob }
    await tx(this.db, 'readwrite', (s) => s.put(chunk))
    void this.drain()
  }

  async pendingCount(meetingId?: string): Promise<number> {
    if (!this.db) return 0
    const all = await tx<QueuedChunk[]>(this.db, 'readonly', (s) => s.getAll())
    return meetingId ? all.filter((c) => c.meetingId === meetingId).length : all.length
  }

  /** Resolves once every queued chunk for the meeting is uploaded (for finish sequencing). */
  async waitForMeeting(meetingId: string): Promise<void> {
    for (;;) {
      if ((await this.pendingCount(meetingId)) === 0) return
      void this.drain()
      await new Promise((r) => setTimeout(r, 500))
    }
  }

  private async drain(): Promise<void> {
    if (this.draining || !this.db) return
    this.draining = true
    try {
      for (;;) {
        const all = await tx<QueuedChunk[]>(this.db, 'readonly', (s) => s.getAll())
        this.onchange?.(all.length)
        if (all.length === 0) {
          this.backoffMs = 1000
          return
        }
        const chunk = all[0]
        try {
          await api.uploadChunk(chunk.meetingId, chunk.stream, chunk.index, chunk.blob)
          await tx(this.db, 'readwrite', (s) => s.delete(chunk.key))
          this.backoffMs = 1000
        } catch (err) {
          // 4xx (other than 401 during setup) means the server refused the
          // chunk permanently (e.g. meeting completed): drop it, don't loop.
          const status = (err as { status?: number }).status
          if (status !== undefined && status >= 400 && status < 500 && status !== 401 && status !== 429) {
            await tx(this.db, 'readwrite', (s) => s.delete(chunk.key))
            continue
          }
          this.scheduleRetry()
          return
        }
      }
    } finally {
      this.draining = false
    }
  }

  private scheduleRetry(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.drain(), this.backoffMs)
    this.backoffMs = Math.min(this.backoffMs * 2, 60_000)
  }
}

export const uploadQueue = new UploadQueue()
