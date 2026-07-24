import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import type { Segment } from '../api/types'
import { DualRecorder } from '../capture/recorder'
import { uploadQueue } from '../capture/uploadQueue'
import type { PageProps } from '../App'

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export default function Recording({
  t,
  navigate,
  meetingId,
  title
}: PageProps & { meetingId: string; title: string | null }) {
  const recorderRef = useRef<DualRecorder | null>(null)
  const [phase, setPhase] = useState<'starting' | 'recording' | 'stopping' | 'failed'>('starting')
  const [elapsed, setElapsed] = useState(0)
  const [segments, setSegments] = useState<Segment[]>([])
  const [pendingUploads, setPendingUploads] = useState(0)
  const lastSeqRef = useRef(0)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const recorder = new DualRecorder()
    recorderRef.current = recorder
    recorder.start(meetingId, null).then(
      () => setPhase('recording'),
      () => setPhase('failed')
    )
    uploadQueue.onchange = setPendingUploads

    const tick = setInterval(() => setElapsed(recorder.elapsedMs), 1000)
    const poll = setInterval(() => {
      api
        .segments(meetingId, lastSeqRef.current)
        .then((r) => {
          if (r.segments.length > 0) {
            lastSeqRef.current = r.last_seq
            setSegments((prev) => [...prev, ...r.segments].sort((a, b) => a.start_ms - b.start_ms))
          }
        })
        .catch(() => {}) // transient poll failures are fine; queue handles uploads
    }, 5000)

    return () => {
      clearInterval(tick)
      clearInterval(poll)
      uploadQueue.onchange = null
    }
  }, [meetingId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [segments.length])

  const stop = async () => {
    setPhase('stopping')
    const durationMs = recorderRef.current?.stop() ?? null
    // final chunks flush asynchronously; wait for the queue, then finish
    await new Promise((r) => setTimeout(r, 300))
    await uploadQueue.waitForMeeting(meetingId)
    try {
      await api.finishMeeting(meetingId, durationMs)
    } catch {
      /* finish is idempotent; orphan recovery can resend later */
    }
    navigate({ name: 'detail', meetingId })
  }

  return (
    <>
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{title ?? t('appName')}</h1>
          <p className="text-sm text-red-600">
            {phase === 'recording' && <>● {t('recording')} · {formatElapsed(elapsed)}</>}
          </p>
        </div>
        <button
          className="rounded-xl bg-red-600 px-5 py-2.5 font-semibold text-white hover:bg-red-700 disabled:opacity-40"
          disabled={phase !== 'recording'}
          onClick={() => void stop()}
        >
          {phase === 'stopping' ? '…' : t('stopRecording')}
        </button>
      </header>

      {phase === 'failed' && (
        <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{t('captureFailed')}</p>
      )}
      {pendingUploads > 0 && (
        <p className="mb-2 text-xs text-neutral-400">
          {t('uploadsPending')} {pendingUploads}
        </p>
      )}

      <div className="flex-1 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-4">
        {segments.length === 0 && phase === 'recording' && (
          <p className="text-neutral-400">{t('waitingForSpeech')}</p>
        )}
        <ul className="flex flex-col gap-3">
          {segments.map((seg) => (
            <li key={seg.seq} className="flex gap-3">
              <span
                className={`shrink-0 text-xs font-semibold ${
                  seg.speaker === 'me' ? 'text-blue-600' : 'text-neutral-500'
                }`}
              >
                {t(seg.speaker === 'me' ? 'me' : 'them')}
              </span>
              {/* dir=auto: English-majority lines render LTR inside the RTL page */}
              <span dir="auto" className="text-sm leading-relaxed">
                {seg.text}
              </span>
            </li>
          ))}
        </ul>
        <div ref={bottomRef} />
      </div>
    </>
  )
}
