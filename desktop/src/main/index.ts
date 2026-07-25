import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { initMain } from 'electron-audio-loopback'

// Registers the enable/disable-loopback-audio IPC handlers; must run before app ready.
initMain()

// UI defaults to English; meetings default to Arabic, which is the product's reason to exist.
type Settings = { serverUrl: string; apiKey: string; lang: 'ar' | 'en'; meetingLang: 'ar' | 'en' }
const DEFAULTS: Settings = { serverUrl: '', apiKey: '', lang: 'en', meetingLang: 'ar' }
const settingsPath = (): string => join(app.getPath('userData'), 'settings.json')

function readSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(readFileSync(settingsPath(), 'utf8')) }
  } catch {
    return DEFAULTS
  }
}

ipcMain.handle('settings:get', () => readSettings())
ipcMain.handle('settings:set', (_e, settings: Settings) =>
  writeFileSync(settingsPath(), JSON.stringify(settings, null, 2))
)

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 720,
    minHeight: 520,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
