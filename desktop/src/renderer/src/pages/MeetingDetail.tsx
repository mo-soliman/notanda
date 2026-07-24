import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import type { MeetingDetail, Segment } from '../api/types'
import type { PageProps } from '../App'

function formatStamp(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export default function MeetingDetailPage({
  t,
  navigate,
  meetingId
}: PageProps & { meetingId: string }) {
  const [detail, setDetail] = useState<MeetingDetail | null>(null)
  const [segments, setSegments] = useState<Segment[]>([])
  const [pending, setPending] = useState(0)
  const [tab, setTab] = useState<'summary' | 'transcript'>('summary')
  const lastSeqRef = useRef(0)

  useEffect(() => {
    let stopped = false
    const load = async () => {
      try {
        const d = await api.meetingDetail(meetingId)
        const r = await api.segments(meetingId, lastSeqRef.current)
        if (stopped) return
        setDetail(d)
        if (r.segments.length > 0) {
          lastSeqRef.current = r.last_seq
          setSegments((prev) => [...prev, ...r.segments].sort((a, b) => a.start_ms - b.start_ms))
        }
        setPending(r.pending_chunks)
        // keep refreshing until transcription + summary settle
        if (d.status === 'processing' || d.status === 'recording' || r.pending_chunks > 0) {
          setTimeout(() => void load(), 5000)
        }
      } catch {
        /* leave whatever we have on screen */
      }
    }
    void load()
    return () => {
      stopped = true
    }
  }, [meetingId])

  const summary = detail?.summary

  return (
    <>
      <header className="mb-4 flex items-center justify-between">
        <h1 className="truncate text-xl font-bold">
          {detail?.title ?? (detail ? new Date(detail.created_at).toLocaleString() : '…')}
        </h1>
        <button
          className="text-sm text-neutral-500 hover:text-neutral-800"
          onClick={() => navigate({ name: 'home' })}
        >
          → {t('back')}
        </button>
      </header>

      <div className="mb-4 flex gap-2">
        {(['summary', 'transcript'] as const).map((name) => (
          <button
            key={name}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              tab === name ? 'bg-neutral-900 text-white' : 'bg-neutral-200 text-neutral-600'
            }`}
            onClick={() => setTab(name)}
          >
            {t(name === 'summary' ? 'summary' : 'transcript')}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-5">
        {tab === 'summary' && (
          <>
            {!summary && detail?.status === 'error' && (
              <p className="text-sm text-red-600">{t('summaryFailed')}</p>
            )}
            {!summary && detail?.status !== 'error' && (
              <p className="text-neutral-400">{t('noSummaryYet')}</p>
            )}
            {summary && (
              <div className="flex flex-col gap-6">
                <p dir="auto" className="whitespace-pre-wrap leading-relaxed">
                  {summary.overview_md}
                </p>
                {summary.decisions.length > 0 && (
                  <section>
                    <h2 className="mb-2 font-bold">{t('decisions')}</h2>
                    <ul className="list-disc ps-5">
                      {summary.decisions.map((d, i) => (
                        <li key={i} dir="auto" className="mb-1">
                          {d}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {summary.action_items.length > 0 && (
                  <section>
                    <h2 className="mb-2 font-bold">{t('actionItems')}</h2>
                    <ul className="list-disc ps-5">
                      {summary.action_items.map((a, i) => (
                        <li key={i} dir="auto" className="mb-1">
                          {a.text}
                          {a.owner && <span className="text-neutral-500"> — {a.owner}</span>}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}
          </>
        )}

        {tab === 'transcript' && (
          <>
            {pending > 0 && <p className="mb-3 text-sm text-amber-600">{t('transcribing')}</p>}
            <ul className="flex flex-col gap-3">
              {segments.map((seg) => (
                <li key={seg.seq} className="flex gap-3">
                  <span className="shrink-0 font-mono text-xs text-neutral-400">
                    {formatStamp(seg.start_ms)}
                  </span>
                  <span
                    className={`shrink-0 text-xs font-semibold ${
                      seg.speaker === 'me' ? 'text-blue-600' : 'text-neutral-500'
                    }`}
                  >
                    {t(seg.speaker === 'me' ? 'me' : 'them')}
                  </span>
                  <span dir="auto" className="text-sm leading-relaxed">
                    {seg.text}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  )
}
