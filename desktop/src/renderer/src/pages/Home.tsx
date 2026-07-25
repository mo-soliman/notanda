import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { MeetingListItem } from '../api/types'
import type { PageProps } from '../App'
import type { Lang } from '../i18n'
import { Button, EmptyState, PageHeader, StatusPill, formatDuration } from '../components/ui'

function formatWhen(iso: string, lang: Lang): string {
  const d = new Date(iso)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const locale = lang === 'ar' ? 'ar' : 'en-GB'
  return sameDay
    ? d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(locale, { day: 'numeric', month: 'short' }) +
        ' · ' +
        d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
}

export default function Home({
  t,
  lang,
  navigate,
  configured,
  meetingLang
}: PageProps & { configured: boolean; meetingLang: Lang }) {
  const [meetings, setMeetings] = useState<MeetingListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    if (!configured) return
    const load = () =>
      api
        .listMeetings()
        .then((r) => {
          setMeetings(r.meetings)
          setError(null)
        })
        .catch(() => setError(t('serverUnreachable')))
    void load()
    // meetings finish transcribing in the background, so keep the list fresh
    const timer = setInterval(load, 15_000)
    return () => clearInterval(timer)
  }, [configured])

  const startMeeting = async () => {
    setStarting(true)
    try {
      const { id } = await api.createMeeting(title.trim() || null, meetingLang)
      navigate({ name: 'recording', meetingId: id, title: title.trim() || null })
    } catch {
      setError(t('serverUnreachable'))
      setStarting(false)
    }
  }

  return (
    <>
      <PageHeader title={t('appName')} subtitle={t('tagline')}>
        <Button variant="ghost" onClick={() => navigate({ name: 'settings' })}>
          {t('settings')}
        </Button>
      </PageHeader>

      {!configured && (
        <div className="mb-5 flex items-center justify-between gap-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          <span>{t('configureFirst')}</span>
          <Button variant="ghost" onClick={() => navigate({ name: 'settings' })}>
            {t('openSettings')}
          </Button>
        </div>
      )}

      <div className="mb-8 flex gap-3">
        <input
          className="flex-1 rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:focus:border-neutral-400"
          placeholder={t('meetingTitlePlaceholder')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && configured && !starting && void startMeeting()}
        />
        <Button disabled={!configured || starting} onClick={() => void startMeeting()}>
          <span className="size-2.5 rounded-full bg-red-500" />
          {starting ? t('starting') : t('newMeeting')}
        </Button>
      </div>

      <h2 className="mb-3 text-xs font-semibold tracking-wide text-neutral-400 uppercase">
        {t('meetings')}
      </h2>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {meetings?.length === 0 && <EmptyState icon="🎙️" text={t('noMeetings')} />}

      <ul className="flex flex-col gap-2 overflow-y-auto pb-4">
        {meetings?.map((m) => (
          <li key={m.id}>
            <button
              className="flex w-full items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3.5 text-start transition hover:border-neutral-400 hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-600"
              onClick={() => navigate({ name: 'detail', meetingId: m.id })}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium" dir="auto">
                  {m.title ?? formatWhen(m.created_at, lang)}
                </div>
                <div className="mt-0.5 text-xs text-neutral-400">
                  {formatWhen(m.created_at, lang)}
                  {m.duration_ms != null && ` · ${formatDuration(m.duration_ms)}`}
                </div>
              </div>
              <StatusPill status={m.status} t={t} />
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
