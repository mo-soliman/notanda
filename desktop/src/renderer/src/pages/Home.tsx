import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { MeetingListItem, MeetingStatus } from '../api/types'
import type { PageProps } from '../App'

const statusStyles: Record<MeetingStatus, string> = {
  recording: 'bg-red-100 text-red-700',
  processing: 'bg-amber-100 text-amber-700',
  complete: 'bg-emerald-100 text-emerald-700',
  error: 'bg-neutral-200 text-neutral-600'
}

export default function Home({ t, navigate, configured }: PageProps & { configured: boolean }) {
  const [meetings, setMeetings] = useState<MeetingListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    if (!configured) return
    api
      .listMeetings()
      .then((r) => setMeetings(r.meetings))
      .catch(() => setError(t('serverUnreachable')))
  }, [configured])

  const startMeeting = async () => {
    setStarting(true)
    try {
      const { id } = await api.createMeeting(title.trim() || null, 'ar')
      navigate({ name: 'recording', meetingId: id, title: title.trim() || null })
    } catch {
      setError(t('serverUnreachable'))
      setStarting(false)
    }
  }

  return (
    <>
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('appName')}</h1>
        <button
          className="text-sm text-neutral-500 hover:text-neutral-800"
          onClick={() => navigate({ name: 'settings' })}
        >
          {t('settings')}
        </button>
      </header>

      {!configured && (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          {t('configureFirst')}
        </p>
      )}

      <div className="mb-8 flex gap-3">
        <input
          className="flex-1 rounded-xl border border-neutral-300 bg-white px-4 py-3 outline-none focus:border-neutral-500"
          placeholder={t('meetingTitlePlaceholder')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button
          className="rounded-xl bg-neutral-900 px-6 py-3 font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-40"
          disabled={!configured || starting}
          onClick={() => void startMeeting()}
        >
          ● {t('newMeeting')}
        </button>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-neutral-500">{t('meetings')}</h2>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {meetings?.length === 0 && <p className="text-neutral-400">{t('noMeetings')}</p>}
      <ul className="flex flex-col gap-2 overflow-y-auto">
        {meetings?.map((m) => (
          <li key={m.id}>
            <button
              className="flex w-full items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-3 text-start hover:border-neutral-400"
              onClick={() => navigate({ name: 'detail', meetingId: m.id })}
            >
              <span className="truncate">
                {m.title ?? new Date(m.created_at).toLocaleString()}
              </span>
              <span className={`ms-3 rounded-full px-2 py-0.5 text-xs ${statusStyles[m.status]}`}>
                {t(
                  m.status === 'recording'
                    ? 'statusRecording'
                    : m.status === 'processing'
                      ? 'statusProcessing'
                      : m.status === 'complete'
                        ? 'statusComplete'
                        : 'statusError'
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
