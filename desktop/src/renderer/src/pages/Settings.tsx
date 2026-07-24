import { useState } from 'react'
import type { AppSettings, PageProps } from '../App'
import type { Lang } from '../i18n'

export default function SettingsPage({
  t,
  navigate,
  settings,
  onSave
}: PageProps & { settings: AppSettings; onSave: (s: AppSettings) => Promise<void> }) {
  const [serverUrl, setServerUrl] = useState(settings.serverUrl)
  const [apiKey, setApiKey] = useState(settings.apiKey)
  const [lang, setLang] = useState<Lang>(settings.lang)
  const [saved, setSaved] = useState(false)

  const save = async () => {
    await onSave({ serverUrl: serverUrl.trim(), apiKey: apiKey.trim(), lang })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const field = 'w-full rounded-xl border border-neutral-300 bg-white px-4 py-2.5 outline-none focus:border-neutral-500'

  return (
    <>
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold">{t('settings')}</h1>
        <button
          className="text-sm text-neutral-500 hover:text-neutral-800"
          onClick={() => navigate({ name: 'home' })}
        >
          → {t('back')}
        </button>
      </header>

      <div className="flex max-w-md flex-col gap-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t('serverUrl')}</span>
          <input
            dir="ltr"
            className={field}
            placeholder="https://api.notanda.ai"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t('apiKey')}</span>
          <input
            dir="ltr"
            type="password"
            className={field}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t('language')}</span>
          <select className={field} value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
            <option value="ar">{t('arabic')}</option>
            <option value="en">{t('english')}</option>
          </select>
        </label>

        <button
          className="self-start rounded-xl bg-neutral-900 px-6 py-2.5 font-semibold text-white hover:bg-neutral-700"
          onClick={() => void save()}
        >
          {saved ? t('saved') : t('save')}
        </button>
      </div>
    </>
  )
}
