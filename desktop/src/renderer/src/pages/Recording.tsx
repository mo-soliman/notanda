import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import type { Segment } from '../api/types'
import { DualRecorder } from '../capture/recorder'
import { uploadQueue } from '../capture/uploadQueue'
import type { PageProps } from '../App'
import { Button, PageHeader, SpeakerLabel, formatDuration } from '../components/ui'

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
        .catch(() => {}) // transient poll failures are fine; the queue owns uploads
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
    await new Promise((r) => setTimeout(r, 300)) // let final chunks flush into the queue
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
      <PageHeader
        title={title ?? t('recording')}
        subtitle={
          phase === 'recording' ? (
            <span className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <span className="rec-dot size-2.5 rounded-full bg-red-500" />
              {t('recording')} · <span className="tabular-nums">{formatDuration(elapsed)}</span>
            </span>
          ) : phase === 'starting' ? (
            t('starting')
          ) : undefined
        }
      >
        <Button variant="danger" disabled={phase !== 'recording'} onClick={() => void stop()}>
          {phase === 'stopping' ? t('finishing') : t('stopRecording')}
        </Button>
      </PageHeader>

      {phase === 'failed' && (
        <p className="mb-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {t('captureFailed')}
        </p>
      )}
      {pendingUploads > 0 && (
        <p className="mb-2 text-xs text-neutral-400">
          {t('uploadsPending')} {pendingUploads}
        </p>
      )}

      <div className="flex-1 overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        {segments.length === 0 && phase === 'recording' && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-neutral-400">{t('waitingForSpeech')}</p>
            {[0, 1, 2].map((i) => (
              <div key={i} className="shimmer flex gap-3" style={{ animationDelay: `${i * 0.2}s` }}>
                <div className="h-3 w-14 shrink-0 rounded bg-neutral-200 dark:bg-neutral-800" />
                <div
                  className="h-3 rounded bg-neutral-200 dark:bg-neutral-800"
                  style={{ width: `${70 - i * 15}%` }}
                />
              </div>
            ))}
          </div>
        )}
        <ul className="flex flex-col gap-3.5">
          {segments.map((seg) => (
            <li key={seg.seq} className="flex gap-3">
              <SpeakerLabel speaker={seg.speaker} t={t} />
              {/* dir=auto so English-majority lines read LTR inside an RTL page */}
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
