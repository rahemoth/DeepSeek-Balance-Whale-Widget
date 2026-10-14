import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-ui-'))
const output = path.join(root, 'test-results')
fs.mkdirSync(output, { recursive: true })
const env = { ...process.env, WHALE_TEST_DATA_HOME: testHome, CODEX_HOME: path.join(testHome, 'empty-codex') }
delete env.ELECTRON_RUN_AS_NODE
const executablePath = process.env.WHALE_TEST_EXECUTABLE
const app = await electron.launch({ ...(executablePath ? { executablePath, args: [] } : { args: [root] }), env, timeout: 30000 })
const page = await app.firstWindow()
const errors = []
page.on('pageerror', error => errors.push(error.message))
try {
  await page.waitForFunction(() => !!window.dshwDesktopHitTest, { timeout: 15000 })
  await page.locator('#desktop-cancel').click()
  await page.waitForFunction(() => {
    const r = document.querySelector('.dshwv-img').getBoundingClientRect()
    return r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1
  })
  assert.equal(await page.locator('.dshwv-img').count(), 1)
  assert.equal(await page.evaluate(() => window.dshwDesktopHitTest(5, 5)), false)
  const start = await page.evaluate(() => {
    const r = document.querySelector('.dshwv-img').getBoundingClientRect()
    for (let y = r.top + 5; y < r.bottom - 5; y += 5) {
      for (let x = r.left + 5; x < r.right - 5; x += 5) {
        if (window.dshwDesktopHitTest(x, y)) return { x, y }
      }
    }
    return null
  })
  assert.ok(start, 'role alpha hit map')
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x - 250, start.y - 200, { steps: 12 })
  await page.mouse.up()
  const savedPosition = await page.evaluate(() => localStorage.getItem('dshw-pos'))
  assert.ok(savedPosition, 'drag position saved')
  await page.reload()
  await page.waitForFunction(() => !!window.dshwDesktopHitTest)
  await page.locator('#desktop-cancel').click()
  assert.equal(await page.evaluate(() => localStorage.getItem('dshw-pos')), savedPosition)
  const encryptedRoundtrip = await app.evaluate(async ({ safeStorage }) => {
    const bytes = await safeStorage.encryptStringAsync('whale-ui-test-secret')
    return (await safeStorage.decryptStringAsync(bytes)).result === 'whale-ui-test-secret' && !bytes.toString().includes('whale-ui-test-secret')
  })
  assert.equal(encryptedRoundtrip, true, 'Windows encryption')
  await page.evaluate(() => {
    const originalFetch = window.fetch.bind(window)
    window.fetch = (url, options) => {
      if (String(url).startsWith('/dsh-whale/balance.json')) return Promise.resolve(Response.json({ ok: true, currency: 'CNY', totalBalance: 12.5, rechargeBalance: 10, bonusBalance: 2.5 }))
      if (url === '/dsh-whale/api-models.json') return Promise.resolve(Response.json({ ok: true, models: [
    { id: 'desktop_opencode_go', name: 'OpenCode Go', provider: 'opencode_go', planSupport: true, keyRef: 'OPENCODE_GO_API_KEY', hasKey: true, plan: { ok: true, windows: ['5h', '周', '月'].map((label, i) => ({ key: ['rolling', 'weekly', 'monthly'][i], label, usedPct: i * 20, resetAt: 2000000000000 })) } },
    { id: 'desktop_gptplan', name: 'ChatGPT 套餐', provider: 'gptplan', plan: { ok: true, windows: [{ key: 'rolling', label: '5h', usedPct: 25, resetAt: 2000000000000 }, { key: 'weekly', label: '周', usedPct: null, resetAt: null }] }, gptPlan: { ok: true, planLabel: 'Pro', daysLeft: 20, windows: [{ key: 'rolling', label: '5h', usedPct: 25, resetAt: 2000000000000 }, { key: 'weekly', label: '周', usedPct: null, resetAt: null }] } }
      ] }))
      return originalFetch(url, options)
    }
  })
  await page.locator('#dshw-desktop-cards').waitFor()
  await page.locator('.card-refresh:enabled').waitFor()
  await page.locator('.card-refresh').click()
  await page.locator('.card-refresh:enabled').waitFor()
  assert.equal(await page.locator('.card-value').textContent(), '¥12.50')
  await page.locator('.card-tabs button').filter({ hasText: 'OpenCode Go' }).click()
  assert.equal(await page.locator('.card-source-name').textContent(), 'OpenCode Go')
  assert.equal(await page.locator('.card-window').count(), 3)
  assert.ok((await page.locator('.card-window').first().textContent()).includes('剩余 100.0%'))
  await page.locator('.card-tabs button').filter({ hasText: 'ChatGPT 套餐' }).click()
  assert.equal(await page.locator('.card-source-name').textContent(), 'ChatGPT 套餐')
  assert.equal(await page.locator('.card-value').textContent(), 'ChatGPT Pro')
  assert.ok((await page.locator('.card-window').first().textContent()).includes('剩余 75.0%'))
  assert.ok((await page.locator('.card-window').last().textContent()).includes('剩余 —'))
  assert.equal(await page.evaluate(() => {
    const r = document.querySelector('#dshw-desktop-cards').getBoundingClientRect()
    return window.dshwDesktopHitTest(r.left + 5, r.top + 5)
  }), true)
  await page.screenshot({ path: path.join(output, 'quota-card.png') })
  // A fish click advances a transient source bubble without rewriting custom queues.
  for (const source of ['DeepSeek', 'OpenCode Go', 'ChatGPT 套餐', 'DeepSeek']) {
    await page.evaluate(() => window.dshwDesktopUI.clickFish())
    await page.waitForFunction(name => document.querySelector('.dshwv-desktop-source .dshwv-text')?.innerText.includes(name), source)
    const body = await page.locator('.dshwv-desktop-source .dshwv-text').innerText()
    if (source !== 'DeepSeek') {
      assert.ok(body.includes('已用 5h'))
      assert.ok(!body.includes('周') && !body.includes('月'))
    }
    assert.equal(await page.locator('.dshwv-desktop-source .dshwv-text').evaluate(el => getComputedStyle(el).overflowY), 'hidden')
    if (source === 'ChatGPT 套餐') {
      await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.dshwv-desktop-source .dshwv-text')).opacity) >= .99)
      assert.equal(await page.locator('.dshwv-desktop-source .dshwv-text').evaluate(el => el.scrollHeight <= el.clientHeight + 1), true)
      await page.screenshot({ path: path.join(output, 'compact-5h-bubble.png') })
    }
    for (const other of ['DeepSeek', 'OpenCode Go', 'ChatGPT 套餐'].filter(name => name !== source)) assert.ok(!body.includes(other), source + ' includes ' + other + ': ' + body)
  }
  await page.screenshot({ path: path.join(output, 'bubble-and-card.png') })
  assert.equal(await page.evaluate(() => {
    const c = document.querySelector('#dshw-desktop-cards'), r = c.getBoundingClientRect(), b = document.querySelector('.dshwv-pop-open').getBoundingClientRect()
    return getComputedStyle(c).visibility === 'hidden' || r.right <= b.left || r.left >= b.right || r.bottom <= b.top || r.top >= b.bottom
  }), true)
  await page.locator('.dshwv-pop-open').evaluate(el => el.click())
  assert.equal(await page.evaluate(() => window.dshwDesktopUI.bubbleStatus().shown), true)
  assert.notEqual(await page.evaluate(() => window.dshwDesktopUI.bubbleStatus().kind), 'desktop-source')
  await page.evaluate(() => window.dshwDesktopUI.clickFish())
  await page.waitForFunction(() => document.querySelector('.dshwv-desktop-source .dshwv-text')?.innerText.includes('OpenCode Go'))
  await page.locator('.dshwv-pop-open').evaluate(el => el.click())
  await page.locator('.dshwv-pop-open').evaluate(el => el.click())
  assert.equal(await page.evaluate(() => window.dshwDesktopUI.bubbleStatus().shown), false)
  await page.evaluate(() => window.dshwDesktopUI.clickFish())
  await page.waitForFunction(() => document.querySelector('.dshwv-desktop-source .dshwv-text')?.innerText.includes('DeepSeek'))
  await page.evaluate(() => window.dshwDesktopUI.closeBubble())
  // Source bubbles share the original five-second TTL. Data refresh must not renew it.
  for (const target of ['OpenCode Go', 'ChatGPT 套餐']) {
    for (let i = 0; i < (target === 'OpenCode Go' ? 2 : 3); i++) await page.evaluate(() => window.dshwDesktopUI.clickFish())
    await page.waitForFunction(name => document.querySelector('.dshwv-desktop-source .dshwv-text')?.innerText.includes(name) && window.dshwDesktopUI.bubbleStatus().deadline > 0, target)
    const deadline = await page.evaluate(() => window.dshwDesktopUI.bubbleStatus().deadline)
    assert.ok(deadline - Date.now() <= 5100)
    await page.locator('.card-refresh:enabled').click()
    await page.locator('.card-refresh:enabled').waitFor()
    assert.equal(await page.evaluate(() => window.dshwDesktopUI.bubbleStatus().deadline), deadline)
    await page.waitForFunction(() => !window.dshwDesktopUI.bubbleStatus().shown, { timeout: 8000 })
    await page.locator('.card-refresh:enabled').click()
    await page.locator('.card-refresh:enabled').waitFor()
    assert.equal(await page.evaluate(() => window.dshwDesktopUI.bubbleStatus().shown), false)
  }
  await page.evaluate(() => window.dshwDesktopAction('usage'))
  await page.locator('[data-layout=style]').selectOption('mini')
  await page.waitForFunction(() => document.querySelector('#dshw-desktop-cards').dataset.style === 'mini')
  await page.locator('[data-layout=mode]').selectOption('fixed')
  for (const style of ['detail', 'mini']) {
    await page.locator('[data-layout=style]').selectOption(style)
    await page.locator('[data-layout=scale]').fill('100')
    await page.locator('[data-layout=scale]').dispatchEvent('change')
    await page.waitForFunction(async () => (await window.whaleDesktop.settings()).cardLayout?.scale === 1)
    const fullSize = await page.locator('#dshw-desktop-cards').evaluate(el => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height }))
    await page.locator('[data-layout=scale]').fill('50')
    await page.locator('[data-layout=scale]').dispatchEvent('change')
    await page.waitForFunction(async () => (await window.whaleDesktop.settings()).cardLayout?.scale === .5)
    const smallSize = await page.locator('#dshw-desktop-cards').evaluate(el => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height }))
    assert.ok(Math.abs(smallSize.width - fullSize.width / 2) < 1)
    assert.ok(smallSize.height < fullSize.height * .6, `${style} also scales vertical spacing`)
    for (const source of ['DeepSeek', 'OpenCode Go', 'ChatGPT 套餐']) {
      await page.locator('.card-tabs button').filter({ hasText: source }).evaluate(el => el.click())
      assert.equal(await page.locator('#dshw-desktop-cards').evaluate(el => el.scrollWidth > el.clientWidth + 1), false, `${style}: ${source} fits at 50%`)
    }
    await page.locator('.card-tabs button').filter({ hasText: 'DeepSeek' }).evaluate(el => el.click())
    await page.screenshot({ path: path.join(output, `${style}-card-50-percent.png`) })
  }
  await page.locator('[data-layout=scale]').fill('125')
  await page.locator('[data-layout=scale]').dispatchEvent('change')
  await page.waitForFunction(async () => (await window.whaleDesktop.settings()).cardLayout?.scale === 1.25)
  const cardToggle = page.locator('[data-source-id=desktop_opencode_go][data-display-kind=card]')
  await cardToggle.uncheck()
  assert.equal(await page.locator('.card-tabs button').filter({ hasText: 'OpenCode Go' }).count(), 0)
  assert.equal(await page.locator('[data-source-id=desktop_opencode_go][data-display-kind=bubble]').isChecked(), true)
  await cardToggle.check()
  assert.equal(await page.locator('.dshwv-bal-cards').count(), 0)
  const customQueueBefore = await page.evaluate(() => fetch('/dsh-whale/bubble.json').then(r => r.json()))
  for (const id of ['deepseek', 'desktop_gptplan']) await page.locator(`[data-source-id=${id}][data-display-kind=bubble]`).uncheck()
  await page.evaluate(() => window.dshwDesktopUI.clickFish())
  await page.waitForFunction(() => document.querySelector('.dshwv-desktop-source .dshwv-text')?.innerText.includes('OpenCode Go'))
  await page.evaluate(() => window.dshwDesktopUI.clickFish())
  await page.waitForFunction(() => document.querySelector('.dshwv-desktop-source .dshwv-text')?.innerText.includes('OpenCode Go'))
  await page.locator('[data-source-id=desktop_opencode_go][data-display-kind=bubble]').uncheck()
  await page.evaluate(() => window.dshwDesktopUI.clickFish())
  assert.notEqual(await page.evaluate(() => window.dshwDesktopUI.bubbleStatus().kind), 'desktop-source')
  await page.evaluate(() => window.dshwDesktopUI.closeBubble())
  for (const id of ['deepseek', 'desktop_opencode_go', 'desktop_gptplan']) {
    await page.locator(`[data-source-id=${id}][data-display-kind=bubble]`).check()
    await page.locator(`[data-source-id=${id}][data-display-kind=card]`).uncheck()
  }
  assert.equal(await page.locator('#dshw-desktop-cards').isVisible(), false)
  for (const id of ['deepseek', 'desktop_opencode_go', 'desktop_gptplan']) await page.locator(`[data-source-id=${id}][data-display-kind=card]`).check()
  assert.deepEqual(await page.evaluate(() => fetch('/dsh-whale/bubble.json').then(r => r.json())), customQueueBefore)
  await page.screenshot({ path: path.join(output, 'mini-card-settings.png') })
  await page.evaluate(() => window.dshwDesktopAction('menu'))
  const header = await page.locator('#dshw-desktop-cards header').boundingBox()
  await page.mouse.move(header.x + 20, header.y + 10); await page.mouse.down()
  await page.mouse.move(header.x - 150, header.y - 80, { steps: 8 }); await page.mouse.up()
  await page.waitForFunction(async () => (await window.whaleDesktop.settings()).cardLayout?.mode === 'fixed')
  const layoutBefore = await page.evaluate(async () => (await window.whaleDesktop.settings()).cardLayout)
  await page.reload(); await page.waitForFunction(() => !!window.dshwDesktopUI)
  await page.locator('#desktop-cancel').click()
  assert.deepEqual(await page.evaluate(async () => (await window.whaleDesktop.settings()).cardLayout), layoutBefore)
  await page.locator('#dshw-desktop-cards[data-style=mini]').waitFor()
  const originalBounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ width: 240, height: 200 }))
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#dshw-desktop-cards')).visibility === 'hidden')
  await app.evaluate(({ BrowserWindow }, bounds) => BrowserWindow.getAllWindows()[0].setBounds(bounds), originalBounds)
  await page.locator('#dshw-desktop-cards').waitFor({ state: 'visible' })
  await page.waitForFunction(() => window.dshwDesktopUI.snapshot().models.some(m => m.provider === 'opencode_go'))
  await page.evaluate(() => {
    const m = window.dshwDesktopUI.snapshot().models.find(m => m.provider === 'opencode_go')
    window.whaleDisplay.openSubscription(m)
  })
  assert.ok(!(await page.locator('#dshw-subscription-panel').textContent()).includes('汇率'))
  await page.locator('.subscription-rule').filter({ hasText: '剩余额度预警' }).getByRole('button', { name: '编辑' }).click()
  await page.locator('.dshwv-bubmask:visible').waitFor()
  assert.ok((await page.locator('.dshwv-bubmask:visible').textContent()).includes('% 时提醒'))
  const windowSelect = page.locator('.dshwv-bubmask:visible select').filter({ has: page.locator('option[value=monthly]') })
  await windowSelect.selectOption('monthly')
  await page.locator('.dshwv-bubmask:visible input[max="100"]').fill('15')
  await page.locator('.dshwv-bubmask:visible').getByRole('button', { name: '保存', exact: true }).click()
  await page.locator('#dshw-subscription-panel').waitFor()
  await page.locator('#dshw-subscription-panel').getByRole('button', { name: '关闭', exact: true }).click()
  const counts = await page.evaluate(() => {
    const snap = window.dshwDesktopUI.snapshot(), notify = window.dshwDesktopUI.notifyQuota
    let count = 0; window.dshwDesktopUI.notifyQuota = () => count++
    const model = { id: 'dedup-test', name: 'Test GPT', provider: 'gptplan', gptPlan: { windows: [{ key: 'rolling', label: '5h', usedPct: 80, resetAt: 2000000000001 }] }, settings: { budget: { unit: 'percent', on: true, windowKey: 'rolling', amount: 80 } } }
    window.whaleDisplay.sync(snap.sources, [...snap.models, model]); window.whaleDisplay.sync(snap.sources, [...snap.models, model])
    const sameCycle = count
    model.gptPlan.windows[0].resetAt++
    window.whaleDisplay.sync(snap.sources, [...snap.models, model])
    model.gptPlan.windows[0].usedPct = null
    window.whaleDisplay.sync(snap.sources, [...snap.models, model])
    window.dshwDesktopUI.notifyQuota = notify
    window.whaleDisplay.sync(snap.sources, snap.models)
    return { sameCycle, afterReset: count }
  })
  assert.deepEqual(counts, { sameCycle: 1, afterReset: 2 })
  await page.evaluate(() => window.dshwDesktopUI.notifyQuota({ name: 'GPT', id: 'priority' }, 'budget', { on: true, ttlSec: 0, autoClose: false }, 80, '5h'))
  await page.waitForFunction(() => window.dshwDesktopUI.bubbleStatus().kind === 'alert')
  await page.evaluate(() => window.dshwDesktopUI.clickFish())
  assert.equal(await page.evaluate(() => window.dshwDesktopUI.bubbleStatus().kind), 'alert')
  await page.locator('.dshwv-pop-open').evaluate(el => el.click())
  await page.evaluate(() => window.dshwDesktopAction('menu'))
  await page.locator('.dshwv-menu-open').waitFor()
  await page.screenshot({ path: path.join(output, 'menu.png') })
  await page.evaluate(() => window.dshwDesktopAction('bubble'))
  await page.locator('.dshwv-bubmask:visible').waitFor()
  await page.screenshot({ path: path.join(output, 'bubble-editor.png') })
  await page.locator('.dshwv-bubmask:visible button').filter({ hasText: '取消' }).last().click()
  await page.evaluate(() => window.dshwDesktopAction('sound'))
  await page.locator('.dshwv-bubmask:visible').waitFor()
  await page.screenshot({ path: path.join(output, 'sound-settings.png') })
  await page.locator('.dshwv-bubmask:visible button').filter({ hasText: '取消' }).last().click()
  await page.evaluate(() => window.dshwDesktopAction('resources'))
  await page.locator('.dshwv-resmask').waitFor()
  await page.screenshot({ path: path.join(output, 'resources.png') })
  assert.equal(await page.evaluate(() => window.dshwDesktopHitTest(5, 5)), true)
  assert.deepEqual(errors, [])
  console.log('Windows Electron: 菜单、泡泡编辑器、音效面板、资源管理、透明区命中验证通过。')
} finally { await app.close() }
