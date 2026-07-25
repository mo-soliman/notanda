import { contextBridge, ipcRenderer } from 'electron'

export type Settings = {
  serverUrl: string
  apiKey: string
  lang: 'ar' | 'en'
  meetingLang: 'ar' | 'en'
}

const api = {
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  setSettings: (settings: Settings): Promise<void> => ipcRenderer.invoke('settings:set', settings),
  // electron-audio-loopback: while enabled, getDisplayMedia returns system loopback audio
  enableLoopbackAudio: (): Promise<void> => ipcRenderer.invoke('enable-loopback-audio'),
  disableLoopbackAudio: (): Promise<void> => ipcRenderer.invoke('disable-loopback-audio')
}

contextBridge.exposeInMainWorld('notanda', api)

export type NotandaApi = typeof api
