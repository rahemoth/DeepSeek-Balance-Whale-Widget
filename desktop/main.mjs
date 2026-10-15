import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, powerMonitor, protocol, safeStorage, screen, session, shell, Tray } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHost } from './host.mjs'
import { createCredentialStore, readJson, writeJson } from './storage.mjs'
import { importLegacy } from './migration.mjs'
import { ensureCardSources } from './card-sources.mjs'
import { normalizeLayout } from './layout.mjs'
import { createInputLease } from './input-lease.mjs'
import { createRendererHealth } from './renderer-health.mjs'

const desktopRoot = path.dirname(fileURLToPath(import.meta.url))
const sourceRoot = app.isPackaged ? path.join(desktopRoot, 'vendor') : path.dirname(desktopRoot)
app.setName('Whale Widget')
app.setPath('userData', process.env.WHALE_TEST_DATA_HOME || path.join(app.getPath('appData'), 'WhaleWidget'))
protocol.registerSchemesAsPrivileged([{ scheme: 'whale', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }])

let win, tray, host, credentials, cursorTimer, inputLease, rendererHealth
let recoveringRenderer = false
let config = {}
let interactive = false
const dataHome = path.join(app.getPath('userData'), 'data')
const configFile = path.join(dataHome, 'desktop.json')
const trusted = event => win && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame && event.senderFrame.url.startsWith('whale://app/')
function requireTrusted(event) { if (!trusted(event)) throw new Error('无效的桌面调用') }
function persist() { writeJson(configFile, config) }
function selectedDisplay() { return screen.getAllDisplays().find(d => d.id === config.displayId) || screen.getPrimaryDisplay() }
function action(name) {
  if (!win || win.isDestroyed()) return
  win.showInactive()
  win.webContents.send('desktop:action', name)
}
function placeWindow() {
  if (!win || win.isDestroyed()) return
  const display = selectedDisplay()
  config.displayId = display.id
  win.setBounds(display.workArea)
  persist()
}
function showHide() {
  if (win.isVisible()) win.hide()
  else win.showInactive()
  rebuildTray()
}
function rebuildTray() {
  if (!tray) return
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: win.isVisible() ? '隐藏小鲸鱼' : '显示小鲸鱼', click: showHide },
    { label: '打开挂件菜单', click: () => action('menu') },
    { label: '桌面设置 / API Key', click: () => action('desktop-settings') },
    { label: '小鲸鱼记账', click: () => action('usage') },
    { label: '自定义泡泡', click: () => action('bubble') },
    { label: '角色 / 图片 / 音频管理', click: () => action('resources') },
    { label: '音效与提示', click: () => action('sound') },
    { type: 'separator' },
    { label: '移动到显示器', submenu: screen.getAllDisplays().map((d, i) => ({
      label: `显示器 ${i + 1} · ${d.size.width} × ${d.size.height}`, type: 'radio', checked: selectedDisplay().id === d.id,
      click: () => { config.displayId = d.id; placeWindow(); rebuildTray() }
    })) },
    { label: '始终置顶', type: 'checkbox', checked: config.alwaysOnTop, click: item => {
      config.alwaysOnTop = item.checked; win.setAlwaysOnTop(item.checked, 'floating'); persist()
    } },
    { label: '重置挂件位置', click: () => action('reset-position') },
    { label: '刷新数据', click: () => action('refresh') },
    { label: '打开数据目录', click: () => shell.openPath(dataHome) },
    { type: 'separator' },
    { label: '退出小鲸鱼', click: () => app.quit() }
  ]))
}

async function boot() {
  config = { alwaysOnTop: true, onboarded: false, cardsOn: true, cardSources: { deepseek: true, opencode_go: true, gptplan: true }, ...readJson(configFile, {}) }
  ensureCardSources(dataHome)
  if (!config.displayUnified) {
    const sizeFile = path.join(dataHome, '.dshw-size.json')
    const size = readJson(sizeFile, { scale: 1.5 })
    const models = readJson(path.join(dataHome, '.dshw-api.json'), { models: [] }).models
    size.showBalanceItems ||= {}
    for (const provider of ['deepseek', 'opencode_go', 'gptplan']) {
      const id = provider === 'deepseek' ? 'deepseek' : models.find(m => m.provider === provider)?.id
      if (id && !size.showBalanceItems[id]) size.showBalanceItems[id] = { card: config.cardsOn !== false && config.cardSources?.[provider] !== false, bubble: true }
    }
    writeJson(sizeFile, size)
    config.displayUnified = true
    delete config.cardsOn; delete config.cardSources
    persist()
  }
  credentials = createCredentialStore(path.join(dataHome, 'credentials.enc.json'), safeStorage)
  host = await createHost({ sourceRoot, rendererRoot: path.join(desktopRoot, 'renderer'), dataHome, credentials,
    resolveProxy: url => session.defaultSession.resolveProxy(url) })
  protocol.handle('whale', request => host.dispatch(request))
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
  win = new BrowserWindow({
    ...selectedDisplay().workArea,
    title: '小鲸鱼桌面挂件', transparent: true, backgroundColor: '#00000000', frame: false,
    show: false, skipTaskbar: true, resizable: false, movable: false, minimizable: false,
    maximizable: false, fullscreenable: false, hasShadow: false, focusable: false,
    icon: path.join(sourceRoot, 'icon.png'),
    webPreferences: { preload: path.join(desktopRoot, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' }
  })
  win.setMenu(null)
  win.setAlwaysOnTop(config.alwaysOnTop, 'floating')
  win.setIgnoreMouseEvents(true, { forward: true })
  inputLease = createInputLease(value => {
    interactive = value
    if (!win || win.isDestroyed()) return
    win.setIgnoreMouseEvents(!value, { forward: true })
    if (!value) win.setFocusable(false)
  })
  win.on('unresponsive', () => inputLease.release())
  rendererHealth = createRendererHealth(() => {
    inputLease.release()
    recoveringRenderer = true
    // Log only the event and time, never account, balance or credentials.
    try {
      const log = path.join(dataHome, 'desktop-health.log')
      if (fs.existsSync(log) && fs.statSync(log).size > 65536) fs.renameSync(log, log + '.previous')
      fs.appendFileSync(log, JSON.stringify({ at: new Date().toISOString(), event: 'renderer-heartbeat-timeout' }) + '\n')
    } catch {}
    // A normal reload can itself wait forever behind a blocked JS thread.
    win.webContents.forcefullyCrashRenderer()
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('whale://app/')) {
      event.preventDefault()
      if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    }
  })
  win.webContents.on('render-process-gone', () => {
    inputLease.release()
    interactive = false
    win.setIgnoreMouseEvents(true, { forward: true })
    if (recoveringRenderer) {
      recoveringRenderer = false
      rendererHealth.reset()
      win.reload()
      return
    }
    // Keep the tray available for recovery; no invisible window may block input.
    dialog.showMessageBox({ type: 'error', message: '挂件界面已停止，是否重新加载？', buttons: ['重新加载', '退出'] }).then(({ response }) => response === 0 ? win.reload() : app.quit())
  })
  win.on('closed', () => app.quit())
  ipcMain.on('desktop:interactive', (event, value) => {
    if (!trusted(event) || typeof value !== 'boolean') return
    inputLease.renew(value)
    rendererHealth.heartbeat()
  })
  ipcMain.on('desktop:focus', event => {
    if (!trusted(event)) return
    win.setFocusable(true)
    win.focus()
  })
  ipcMain.handle('desktop:settings', async event => {
    requireTrusted(event)
    return {
      ...config, displayId: selectedDisplay().id,
      openAtLogin: app.getLoginItemSettings().openAtLogin,
      keyConfigured: !!(await credentials.resolve('DEEPSEEK_API_KEY')),
      opencodeKeyConfigured: !!(await credentials.resolve('OPENCODE_GO_API_KEY')),
      displays: screen.getAllDisplays().map((d, i) => ({ id: d.id, label: `显示器 ${i + 1} · ${d.size.width} × ${d.size.height}` }))
    }
  })
  ipcMain.handle('desktop:save-layout', (event, value) => {
    requireTrusted(event)
    config.cardLayout = normalizeLayout(value)
    persist()
    return config.cardLayout
  })
  ipcMain.handle('desktop:save-settings', async (event, values) => {
    requireTrusted(event)
    if (!values || typeof values.key !== 'string' || values.key.length > 4096 || typeof values.alwaysOnTop !== 'boolean' || typeof values.openAtLogin !== 'boolean' || !screen.getAllDisplays().some(d => d.id === values.displayId)) throw new Error('桌面设置无效')
    if (values.key.trim()) await credentials.set('DEEPSEEK_API_KEY', values.key.trim())
    if (values.opencodeKey !== undefined) {
      if (typeof values.opencodeKey !== 'string' || values.opencodeKey.length > 4096) throw new Error('OpenCode 密钥无效')
      if (values.opencodeKey.trim()) await credentials.set('OPENCODE_GO_API_KEY', values.opencodeKey.trim())
    }
    config = { ...config, displayId: values.displayId, alwaysOnTop: values.alwaysOnTop, onboarded: true }
    persist()
    app.setLoginItemSettings({ openAtLogin: values.openAtLogin, path: process.execPath, args: app.isPackaged ? [] : [desktopRoot] })
    win.setAlwaysOnTop(config.alwaysOnTop, 'floating')
    placeWindow()
    rebuildTray()
    return { ok: true }
  })
  ipcMain.handle('desktop:import-legacy', async event => {
    requireTrusted(event)
    win.setFocusable(true)
    const result = await dialog.showOpenDialog(win, { title: '选择旧桌面版 config.json', filters: [{ name: 'JSON 配置', extensions: ['json'] }], properties: ['openFile'] })
    if (result.canceled) return { canceled: true }
    const imported = await importLegacy(result.filePaths[0], { dataHome, credentials })
    config.onboarded = true
    persist()
    return imported
  })
  tray = new Tray(nativeImage.createFromPath(path.join(sourceRoot, 'icon.png')).resize({ width: 24, height: 24 }))
  tray.setToolTip('小鲸鱼桌面挂件 · 右键打开设置')
  tray.on('double-click', () => action('menu'))
  rebuildTray()
  globalShortcut.register('CommandOrControl+Alt+W', showHide)
  for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(event, () => { placeWindow(); rebuildTray() })
  powerMonitor.on('resume', () => { rendererHealth.reset(); placeWindow(); action('refresh') })
  cursorTimer = setInterval(() => {
    inputLease.check()
    rendererHealth.check(!!win && !win.isDestroyed() && win.isVisible())
    if (!win || win.isDestroyed() || !win.isVisible()) return
    const cursor = screen.getCursorScreenPoint()
    const bounds = win.getBounds()
    win.webContents.send('desktop:cursor', { x: cursor.x - bounds.x, y: cursor.y - bounds.y })
  }, 50)
  await win.loadURL('whale://app/')
  win.showInactive()
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => action('menu'))
  app.whenReady().then(boot).catch(error => {
    dialog.showErrorBox('小鲸鱼启动失败', `${error.message}\n已有数据已保留。`)
    app.quit()
  })
}
app.on('before-quit', () => { clearInterval(cursorTimer); globalShortcut.unregisterAll(); host?.dispose(); tray?.destroy() })
