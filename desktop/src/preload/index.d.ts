// Renderer-side view of the preload bridge. Kept in sync with src/preload/index.ts
// by hand (the renderer tsconfig can't include preload sources).

export interface Settings {
  serverUrl: string
  apiKey: string
  lang: 'ar' | 'en'
  meetingLang: 'ar' | 'en'
}

export interface NotandaApi {
  getSettings: () => Promise<Settings>
  setSettings: (settings: Settings) => Promise<void>
  enableLoopbackAudio: () => Promise<void>
  disableLoopbackAudio: () => Promise<void>
}

declare global {
  interface Window {
    notanda: NotandaApi
  }
}

export {}
