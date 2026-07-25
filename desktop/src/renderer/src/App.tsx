import { useEffect, useState } from 'react'
import { configure, isConfigured } from './api/client'
import { uploadQueue } from './capture/uploadQueue'
import { makeT, type Lang } from './i18n'
import Home from './pages/Home'
import Recording from './pages/Recording'
import MeetingDetailPage from './pages/MeetingDetail'
import SettingsPage from './pages/Settings'

export type Route =
  | { name: 'home' }
  | { name: 'recording'; meetingId: string; title: string | null }
  | { name: 'detail'; meetingId: string }
  | { name: 'settings' }

export interface AppSettings {
  serverUrl: string
  apiKey: string
  lang: Lang
  meetingLang: Lang
}

export interface PageProps {
  t: ReturnType<typeof makeT>
  lang: Lang
  navigate: (route: Route) => void
}

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'home' })
  const [settings, setSettings] = useState<AppSettings | null>(null)

  useEffect(() => {
    void (async () => {
      const s = await window.notanda.getSettings()
      configure(s.serverUrl, s.apiKey)
      await uploadQueue.init()
      setSettings(s)
      if (!s.serverUrl || !s.apiKey) setRoute({ name: 'settings' })
    })()
  }, [])

  useEffect(() => {
    if (!settings) return
    document.documentElement.setAttribute('dir', settings.lang === 'ar' ? 'rtl' : 'ltr')
    document.documentElement.setAttribute('lang', settings.lang)
  }, [settings?.lang])

  if (!settings) return null
  const t = makeT(settings.lang)

  const saveSettings = async (s: AppSettings) => {
    await window.notanda.setSettings(s)
    configure(s.serverUrl, s.apiKey)
    setSettings(s)
  }

  const props = { t, lang: settings.lang, navigate: setRoute }
  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col px-7 py-6">
      {route.name === 'home' && (
        <Home {...props} configured={isConfigured()} meetingLang={settings.meetingLang} />
      )}
      {route.name === 'recording' && (
        <Recording {...props} meetingId={route.meetingId} title={route.title} />
      )}
      {route.name === 'detail' && <MeetingDetailPage {...props} meetingId={route.meetingId} />}
      {route.name === 'settings' && (
        <SettingsPage {...props} settings={settings} onSave={saveSettings} />
      )}
    </div>
  )
}
