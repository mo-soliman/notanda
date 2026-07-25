import type { ReactNode } from 'react'
import type { MeetingStatus } from '../api/types'
import type { StringKey, makeT } from '../i18n'

type T = ReturnType<typeof makeT>

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  className = ''
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'danger'
  disabled?: boolean
  className?: string
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40'
  const variants = {
    primary:
      'bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200',
    ghost:
      'text-neutral-500 hover:bg-neutral-200/60 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100',
    danger: 'bg-red-600 text-white hover:bg-red-700'
  }
  return (
    <button className={`${base} ${variants[variant]} ${className}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

const statusStyles: Record<MeetingStatus, string> = {
  recording: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  processing: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  complete: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  error: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
}

const statusKeys: Record<MeetingStatus, StringKey> = {
  recording: 'statusRecording',
  processing: 'statusProcessing',
  complete: 'statusComplete',
  error: 'statusError'
}

export function StatusPill({ status, t }: { status: MeetingStatus; t: T }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[status]}`}>
      {t(statusKeys[status])}
    </span>
  )
}

export function SpeakerLabel({ speaker, t }: { speaker: 'me' | 'them'; t: T }) {
  const isMe = speaker === 'me'
  return (
    <span
      className={`w-14 shrink-0 text-xs font-semibold ${
        isMe ? 'text-indigo-600 dark:text-indigo-400' : 'text-neutral-500 dark:text-neutral-400'
      }`}
    >
      {t(isMe ? 'me' : 'them')}
    </span>
  )
}

export function PageHeader({
  title,
  subtitle,
  children
}: {
  title: string
  subtitle?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="mb-6 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-neutral-500">{subtitle}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </header>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 ${className}`}
    >
      {children}
    </div>
  )
}

export function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="text-4xl opacity-40">{icon}</div>
      <p className="max-w-xs text-sm text-neutral-400">{text}</p>
    </div>
  )
}

/** mm:ss for short recordings, h:mm:ss past an hour. */
export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return s >= 3600 ? `${Math.floor(s / 3600)}:${mm}:${ss}` : `${mm}:${ss}`
}
