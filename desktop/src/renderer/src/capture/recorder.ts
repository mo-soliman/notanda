// Dual-stream capture: mic + system loopback, each cut into standalone 30 s
// WebM/Opus files. We do NOT use MediaRecorder's timeslice — blobs after the
// first would lack container headers and wouldn't decode independently.
// Instead each stream runs a stop/restart cycle on a shared timer tick, so
// both chunk clocks stay aligned (chunk N always starts at ~N*30 s).

import { uploadQueue } from './uploadQueue'
import type { Stream } from '../api/types'

export const CHUNK_MS = 30_000
const MIME = 'audio/webm;codecs=opus'
const BITRATE = 32_000

class StreamRecorder {
  private recorder: MediaRecorder | null = null
  private index = 0

  constructor(
    private meetingId: string,
    private stream: Stream,
    private media: MediaStream
  ) {}

  start(): void {
    const rec = new MediaRecorder(this.media, { mimeType: MIME, audioBitsPerSecond: BITRATE })
    const myIndex = this.index
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) void uploadQueue.enqueue(this.meetingId, this.stream, myIndex, e.data)
    }
    rec.start()
    this.recorder = rec
  }

  /** Close the current 30 s file and immediately open the next one. */
  rotate(): void {
    this.recorder?.stop()
    this.index += 1
    this.start()
  }

  stop(): void {
    this.recorder?.stop() // flushes the final partial chunk via ondataavailable
    this.recorder = null
    this.media.getTracks().forEach((t) => t.stop())
  }
}

export class DualRecorder {
  private mic: StreamRecorder | null = null
  private sys: StreamRecorder | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private startedAt = 0

  async start(meetingId: string, micDeviceId: string | null): Promise<void> {
    const micMedia = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(micDeviceId ? { deviceId: { exact: micDeviceId } } : {}),
        echoCancellation: true,
        noiseSuppression: true
      }
    })

    // electron-audio-loopback: while enabled, getDisplayMedia returns system
    // audio; video must be requested, then its tracks removed.
    await window.notanda.enableLoopbackAudio()
    let sysMedia: MediaStream
    try {
      sysMedia = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
    } finally {
      await window.notanda.disableLoopbackAudio()
    }
    sysMedia.getVideoTracks().forEach((t) => {
      t.stop()
      sysMedia.removeTrack(t)
    })

    this.mic = new StreamRecorder(meetingId, 'mic', micMedia)
    this.sys = new StreamRecorder(meetingId, 'sys', sysMedia)
    this.mic.start()
    this.sys.start()
    this.startedAt = Date.now()
    // one shared tick keeps both streams' chunk indices on the same 30 s grid
    this.timer = setInterval(() => {
      this.mic?.rotate()
      this.sys?.rotate()
    }, CHUNK_MS)
  }

  /** Returns elapsed duration in ms. Final chunks flush into the upload queue. */
  stop(): number {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.mic?.stop()
    this.sys?.stop()
    this.mic = null
    this.sys = null
    return Date.now() - this.startedAt
  }

  get elapsedMs(): number {
    return this.startedAt ? Date.now() - this.startedAt : 0
  }
}
