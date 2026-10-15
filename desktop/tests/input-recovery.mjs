import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-input-recovery-'))
const env = { ...process.env, WHALE_TEST_DATA_HOME: home, CODEX_HOME: path.join(home, 'empty-codex') }
delete env.ELECTRON_RUN_AS_NODE
const executablePath = process.env.WHALE_TEST_EXECUTABLE
const app = await electron.launch({ ...(executablePath ? { executablePath, args: [] } : { args: [root] }), env })
try {
  const page = await app.firstWindow()
  await page.locator('#desktop-cancel').waitFor()
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    globalThis.inputChanges = []
    const original = win.setIgnoreMouseEvents.bind(win)
    win.setIgnoreMouseEvents = (ignore, options) => {
      globalThis.inputChanges.push(ignore)
      return original(ignore, options)
    }
  })
  // The settings dialog keeps input enabled before the simulated renderer stall.
  await page.waitForTimeout(400)
  await page.evaluate(() => setTimeout(() => {
    const until = Date.now() + 2500
    while (Date.now() < until) { /* Simulate a hung renderer only. */ }
  }, 50))
  const released = await app.evaluate(async () => {
    await new Promise(resolve => setTimeout(resolve, 1700))
    return globalThis.inputChanges.includes(true)
  })
  assert.equal(released, true, 'main process restores mouse passthrough during renderer stall')
  await page.waitForTimeout(1200)
  assert.equal(await app.evaluate(() => globalThis.inputChanges.at(-1)), false, 'input recovers after renderer resumes')
  console.log('PASS: renderer stall releases desktop input; recovery restores dialog interaction')
  await page.evaluate(() => localStorage.setItem('recovery-test', 'preserved'))
  // A persistent JS stall cannot finish by itself. Verify that the main process
  // replaces the renderer and reloads the existing widget configuration.
  await app.evaluate(({ BrowserWindow }) => {
    globalThis.rendererReloaded = false
    BrowserWindow.getAllWindows()[0].webContents.once('did-finish-load', () => { globalThis.rendererReloaded = true })
  })
  await page.evaluate(() => setTimeout(() => { while (true) {} }, 50))
  assert.equal(await app.evaluate(async () => {
    const until = Date.now() + 35000
    while (!globalThis.rendererReloaded && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 100))
    return globalThis.rendererReloaded
  }), true, 'replacement renderer completes loading')
  // Playwright marks the old target permanently crashed. Inspect the replacement
  // through Electron's WebContents instead of reusing the stale page handle.
  const restored = await app.evaluate(async ({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents
    for (let i = 0; i < 50; i++) {
      const state = await contents.executeJavaScript('({ ready: !!window.dshwDesktopHitTest && !!document.getElementById("desktop-cancel"), value: localStorage.getItem("recovery-test") })')
      if (state.ready) return state
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    return { ready: false }
  })
  assert.deepEqual(restored, { ready: true, value: 'preserved' })
  // Either detector may expire first when the entire JS thread stops.
  assert.match(fs.readFileSync(path.join(home, 'data/desktop-health.log'), 'utf8'), /renderer-(heartbeat|frame)-timeout/)
  console.log('PASS: persistent renderer freeze reloads automatically and preserves saved state')
} finally {
  await app.close()
  fs.rmSync(home, { recursive: true, force: true })
}
