// Opt-in live test: read the current Codex login, with isolated widget data.
// Run manually with `node tests/plus-startup.mjs`; no token or quota is logged.
import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-plus-startup-'))
fs.mkdirSync(path.join(testHome, 'data'))
fs.writeFileSync(path.join(testHome, 'data/desktop.json'), JSON.stringify({ onboarded: true, displayUnified: true }))
fs.writeFileSync(path.join(testHome, 'data/.dshw-size.json'), JSON.stringify({ scale: 1.5, showBalanceItems: { desktop_gptplan: { card: true, bubble: true } } }))
const env = { ...process.env, WHALE_TEST_DATA_HOME: testHome }
delete env.ELECTRON_RUN_AS_NODE
try {
  for (let run = 1; run <= 2; run++) {
    const start = Date.now()
    const executablePath = process.env.WHALE_TEST_EXECUTABLE
    const app = await electron.launch({ ...(executablePath ? { executablePath, args: [] } : { args: [root] }), env, timeout: 30000 })
    try {
      const page = await app.firstWindow()
      await page.waitForFunction(() => !!window.dshwDesktopUI, { timeout: 15000 })
      const result = await page.evaluate(async () => {
        const response = await fetch('/dsh-whale/api-models.json')
        const body = await response.json()
        const model = body.models.find(item => item.provider === 'gptplan')
        return { ok: model?.gptPlan?.ok, plan: model?.gptPlan?.planType, windows: (model?.gptPlan?.windows || []).map(w => w.key), error: model?.gptPlan?.windowsError }
      })
      assert.equal(result.ok, true)
      assert.deepEqual(result.windows, ['rolling', 'weekly'], result.error)
      assert.equal(result.error, '')
      await page.waitForFunction(() => window.dshwDesktopUI.snapshot().models.some(m => m.provider === 'gptplan' && m.gptPlan?.windows?.length === 2))
      console.log(JSON.stringify({ startup: run, ok: true, plan: result.plan, windows: result.windows.length, ms: Date.now() - start }))
    } finally { await app.close() }
  }
} finally {
  // This exact directory was created by this test and contains no user data.
  fs.rmSync(testHome, { recursive: true, force: true })
}
