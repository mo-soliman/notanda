import { useState } from 'react'
import type { AppSettings, PageProps } from '../App'
import type { Lang } from '../i18n'
import { Button, PageHeader } from '../components/ui'

const field =
  'w-full rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:focus:border-neutral-400'

function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-neutral-400">{hint}</span>}
    </label>
  )
}

export default function SettingsPage({
  t,
  navigate,
  settings,
  onSave
}: PageProps & { settings: AppSettings; onSave: (s: AppSettings) => Promise<void> }) {
  const [draft, setDraft] = useState<AppSettings>(settings)
  const [saved, setSaved] = useState(false)

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const save = async () => {
    await onSave({ ...draft, serverUrl: draft.serverUrl.trim(), apiKey: draft.apiKey.trim() })
    setSaved(true)
    setTimeout(() => setSaved(false), 1600)
  }

  return (
    <>
      <PageHeader title={t('settings')}>
        <Button variant="ghost" onClick={() => navigate({ name: 'home' })}>
          {t('back')}
        </Button>
      </PageHeader>

      <div className="flex max-w-md flex-col gap-6 overflow-y-auto pb-4">
        <Field label={t('serverUrl')}>
          <input
            dir="ltr"
            className={field}
            placeholder="https://api.novari.style"
            value={draft.serverUrl}
            onChange={(e) => set('serverUrl', e.target.value)}
          />
        </Field>

        <Field label={t('apiKey')}>
          <input
            dir="ltr"
            type="password"
            className={field}
            placeholder="••••••••••••"
            value={draft.apiKey}
            onChange={(e) => set('apiKey', e.target.value)}
          />
        </Field>

        <Field label={t('meetingLanguage')} hint={t('meetingLanguageHint')}>
          <select
            className={field}
            value={draft.meetingLang}
            onChange={(e) => set('meetingLang', e.target.value as Lang)}
          >
            <option value="ar">{t('arabic')}</option>
            <option value="en">{t('english')}</option>
          </select>
        </Field>

        <Field label={t('language')}>
          <select
            className={field}
            value={draft.lang}
            onChange={(e) => set('lang', e.target.value as Lang)}
          >
            <option value="en">{t('english')}</option>
            <option value="ar">{t('arabic')}</option>
          </select>
        </Field>

        <Button className="self-start" onClick={() => void save()}>
          {saved ? t('saved') : t('save')}
        </Button>
      </div>
    </>
  )
}
