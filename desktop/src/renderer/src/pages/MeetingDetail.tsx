import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import type { MeetingDetail, Segment } from '../api/types'
import type { PageProps } from '../App'
import { Button, EmptyState, PageHeader, SpeakerLabel, formatDuration } from '../components/ui'

export default function MeetingDetailPage({
  t,
  lang,
  navigate,
  meetingId
}: PageProps & { meetingId: string }) {
  const [detail, setDetail] = useState<MeetingDetail | null>(null)
  const [segments, setSegments] = useState<Segment[]>([])
  const [pending, setPending] = useState(0)
  const [tab, setTab] = useState<'summary' | 'transcript'>('summary')
  const [copied, setCopied] = useState(false)
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
        if (d.status === 'processing' || d.status === 'recording' || r.pending_chunks > 0) {
          setTimeout(() => void load(), 5000)
        }
      } catch {
        /* keep whatever is already on screen */
      }
    }
    void load()
    return () => {
      stopped = true
    }
  }, [meetingId])

  const copyTranscript = async () => {
    const text = segments
      .map((s) => `[${formatDuration(s.start_ms)}] ${t(s.speaker === 'me' ? 'me' : 'them')}: ${s.text}`)
      .join('\n')
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const summary = detail?.summary
  const subtitle = detail
    ? new Date(detail.created_at).toLocaleString(lang === 'ar' ? 'ar' : 'en-GB') +
      (detail.duration_ms != null ? ` · ${formatDuration(detail.duration_ms)}` : '')
    : undefined

  return (
    <>
      <PageHeader title={detail?.title ?? t('transcript')} subtitle={subtitle}>
        <Button variant="ghost" onClick={() => navigate({ name: 'home' })}>
          {t('back')}
        </Button>
      </PageHeader>

      <div className="mb-4 flex items-center gap-2">
        {(['summary', 'transcript'] as const).map((name) => (
          <button
            key={name}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              tab === name
                ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                : 'text-neutral-500 hover:bg-neutral-200/60 dark:hover:bg-neutral-800'
            }`}
            onClick={() => setTab(name)}
          >
            {t(name)}
          </button>
        ))}
        {tab === 'transcript' && segments.length > 0 && (
          <button
            className="ms-auto text-xs text-neutral-400 transition hover:text-neutral-700 dark:hover:text-neutral-200"
            onClick={() => void copyTranscript()}
          >
            {copied ? t('copied') : t('copy')}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
        {tab === 'summary' && (
          <>
            {!summary && detail?.status === 'error' && (
              <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                {t('summaryFailed')}
              </p>
            )}
            {!summary && detail?.status !== 'error' && (
              <p className="shimmer text-sm text-neutral-400">{t('noSummaryYet')}</p>
            )}
            {summary && (
              <div className="flex flex-col gap-7">
                <p dir="auto" className="leading-7 whitespace-pre-wrap">
                  {summary.overview_md}
                </p>

                {summary.decisions.length > 0 && (
                  <section>
                    <h2 className="mb-2.5 text-xs font-semibold tracking-wide text-neutral-400 uppercase">
                      {t('decisions')}
                    </h2>
                    <ul className="flex flex-col gap-2">
                      {summary.decisions.map((d, i) => (
                        <li key={i} dir="auto" className="flex gap-2.5 text-sm leading-relaxed">
                          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-emerald-500" />
                          {d}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {summary.action_items.length > 0 && (
                  <section>
                    <h2 className="mb-2.5 text-xs font-semibold tracking-wide text-neutral-400 uppercase">
                      {t('actionItems')}
                    </h2>
                    <ul className="flex flex-col gap-2">
                      {summary.action_items.map((a, i) => (
                        <li key={i} dir="auto" className="flex gap-2.5 text-sm leading-relaxed">
                          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-indigo-500" />
                          <span>
                            {a.text}
                            {a.owner && <span className="text-neutral-400"> — {a.owner}</span>}
                          </span>
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
            {pending > 0 && (
              <p className="shimmer mb-4 text-sm text-amber-600 dark:text-amber-400">
                {t('transcribing')}
              </p>
            )}
            {segments.length === 0 && pending === 0 && (
              <EmptyState icon="📝" text={t('noTranscript')} />
            )}
            <ul className="flex flex-col gap-3.5">
              {segments.map((seg) => (
                <li key={seg.seq} className="flex gap-3">
                  <span className="w-11 shrink-0 pt-0.5 font-mono text-xs text-neutral-400 tabular-nums">
                    {formatDuration(seg.start_ms)}
                  </span>
                  <SpeakerLabel speaker={seg.speaker} t={t} />
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
