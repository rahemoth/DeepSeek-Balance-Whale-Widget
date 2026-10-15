import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-frame-recovery-'))
fs.mkdirSync(path.join(home, 'empty-codex'))
const env = { ...process.env, WHALE_TEST_DATA_HOME: home, CODEX_HOME: path.join(home, 'empty-codex') }
delete env.ELECTRON_RUN_AS_NODE
const executablePath = process.env.WHALE_TEST_EXECUTABLE
const app = await electron.launch({ ...(executablePath ? { executablePath, args: [] } : { args: [root] }), env })
try {
  const page = await app.firstWindow()
  await page.locator('#desktop-cancel').waitFor()
  await page.waitForTimeout(1400)
  const native = await app.evaluate(({ app, BrowserWindow }) => ({
    focusable: BrowserWindow.getAllWindows()[0].isFocusable(),
    gpu: app.getGPUFeatureStatus().gpu_compositing
  }))
  assert.equal(native.focusable, true, 'interactive dialog restores native focusability')
  if (process.platform === 'win32') assert.notEqual(native.gpu, 'enabled', 'transparent widget uses stable software rendering')
  await page.evaluate(() => localStorage.setItem('frame-test', 'preserved'))
  await app.evaluate(({ BrowserWindow }) => {
    globalThis.frameReloaded = false
    BrowserWindow.getAllWindows()[0].webContents.once('did-finish-load', () => { globalThis.frameReloaded = true })
  })
  // Timers, IPC and cursor heartbeats remain healthy; only animation frames stop.
  await page.evaluate(() => { window.requestAnimationFrame = () => 0 })
  assert.equal(await app.evaluate(async () => {
    const until = Date.now() + 35000
    while (!globalThis.frameReloaded && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 100))
    return globalThis.frameReloaded
  }), true)
  const state = await app.evaluate(async ({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents
    for (let i = 0; i < 50; i++) {
      const state = await contents.executeJavaScript('({ ready: !!window.dshwDesktopHitTest && !!document.getElementById("desktop-cancel"), value: localStorage.getItem("frame-test") })')
      if (state.ready) return state
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    return { ready: false }
  })
  assert.deepEqual(state, { ready: true, value: 'preserved' })
  assert.match(fs.readFileSync(path.join(home, 'data/desktop-health.log'), 'utf8'), /renderer-frame-timeout/)
  console.log('PASS: stopped animation frames recover even with live IPC; settings and native interaction survive')
} finally {
  await app.close()
  fs.rmSync(home, { recursive: true, force: true })
}
