import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHost } from '../host.mjs'
import { createCredentialStore, readJson, writeJson } from '../storage.mjs'
import { importLegacy } from '../migration.mjs'
import { balanceSummary, beijingDay } from '../../lib/accounting.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-host-test-'))
process.env.CODEX_HOME = path.join(temp, 'codex-empty')
const encryption = {
  isAsyncEncryptionAvailable: async () => true,
  encryptStringAsync: async value => Buffer.from('encrypted:' + value),
  decryptStringAsync: async bytes => ({ result: bytes.toString().slice(10) })
}
const credentials = createCredentialStore(path.join(temp, 'credentials.enc.json'), encryption, {})
const originalFetch = globalThis.fetch
let balance = 10
globalThis.fetch = async url => {
  assert.ok(String(url).startsWith('https://api.deepseek.com/'))
  return Response.json({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: String(balance), granted_balance: '0', topped_up_balance: String(balance) }] })
}
const host = await createHost({ sourceRoot: root, rendererRoot: path.join(root, 'desktop/renderer'), dataHome: temp, credentials })
const call = (name, value) => host.dispatch(new Request('whale://app/dsh-whale/' + name, value === undefined ? {} : { method: 'POST', body: JSON.stringify(value), headers: { 'Content-Type': 'application/json' } }))

test('all original routes are registered and unknown origin cannot mutate data', async () => {
  const original = fs.readFileSync(path.join(root, 'lib/index.js'), 'utf8')
  const paths = [...original.matchAll(/path: '(\/dsh-whale\/[^']+)'/g)].map(match => match[1])
  for (const route of paths) assert.ok(host.routes.some(r => r.path === route), route)
  assert.equal(host.routes.length, 26)
  for (const route of host.routes) assert.equal(route.kind, 'exact')
  const response = await host.dispatch(new Request('whale://app/dsh-whale/size.json', { method: 'POST', body: '{"scale":0.6}', headers: { origin: 'https://attacker.example' } }))
  assert.equal(response.status, 403)
  assert.equal(fs.existsSync(path.join(temp, '.dshw-size.json')), false)
  assert.equal((await host.dispatch(new Request('whale://evil/dsh-whale/size.json'))).status, 403)
  assert.equal((await host.dispatch(new Request('whale://app/assets/../main.mjs'))).status, 404)
})

test('original images, gifs, preset audio and complete frontend are served', async () => {
  for (const route of ['image.png', 'rua.gif', 'sound/press.mp3', 'sound/release.mp3', 'widget.js']) {
    const response = await call(route)
    assert.equal(response.status, 200, route)
    assert.ok((await response.arrayBuffer()).byteLength > 100, route)
  }
  const html = await (await host.dispatch(new Request('whale://app/'))).text()
  assert.ok(html.includes('Content-Security-Policy'))
  assert.equal((await host.dispatch(new Request('whale://app/assets/cost-default.wav'))).status, 200)
})

test('settings, bubbles and resource lists retain the original API', async () => {
  assert.equal((await call('size.json', { scale: 0.42, sound: false })).status, 200)
  assert.equal((await (await call('size.json')).json()).scale, 0.42)
  const bubble = await (await call('bubble.json')).json()
  const config = bubble.config || { v: 1, items: [], lib: [] }
  assert.equal((await call('bubble.json', config)).status, 200)
  for (const name of ['roles.json', 'audio.json', 'bubble-imgs.json', 'usage-settings.json', 'wait.json', 'last-turn.json', 'about.json']) {
    const response = await call(name)
    assert.equal(response.status, 200, name)
    await response.json()
  }
})

test('balance drops add consumption and deposits never erase it', async () => {
  await credentials.set('DEEPSEEK_API_KEY', 'test-key')
  const getBalance = () => call('balance.json?refresh=1').then(r => r.json())
  assert.equal((await getBalance()).ok, true)
  balance = 8
  await getBalance()
  balance = 13
  await getBalance()
  const ledger = readJson(path.join(temp, '.dshw-usage.json'), {})
  assert.ok(ledger.accounting)
  const book = Object.values(ledger.accounting.books)[0]
  assert.ok(book)
  const records = await (await call('usage-records.json')).json()
  assert.equal(records.ok, true)
  const summary = balanceSummary(ledger, beijingDay())
  assert.equal(summary.amount, 2)
  assert.equal(summary.observedDecrease, 2)
  assert.equal(summary.observedIncrease, 5)
})

test('session event bridge retains actual turn accounting and waiting state', async () => {
  const session = { id: 'test-session', title: '测试对话' }
  host.emit('session/event', session, { type: 'assistant/message', data: { turn: 1, message: { source: { model: 'deepseek-flash' } }, usage: { inputTokens: 100, cacheReadTokens: 20, outputTokens: 50, reasoningTokens: 30 } } })
  host.emit('session/event', session, { type: 'turn/end', data: {} })
  const turn = await (await call('last-turn.json')).json()
  assert.equal(turn.seq, 1)
  assert.equal(turn.tokens, 170)
  assert.ok(turn.amount > 0)
  host.emit('session/event', session, { type: 'approval/asked', data: { id: 'approval-one' } })
  assert.equal((await (await call('wait.json')).json()).pending.kind, 'approval')
  host.emit('session/event', session, { type: 'approval/approved', data: { id: 'approval-one' } })
  assert.equal((await (await call('wait.json')).json()).pending, null)
})

test('credential mutations are serialized and never expose plaintext in config', async () => {
  await Promise.all([credentials.set('KEY_A', 'secret-a'), credentials.set('KEY_B', 'secret-b')])
  assert.equal((await credentials.resolve('KEY_A')).value, 'secret-a')
  assert.equal((await credentials.resolve('KEY_B')).value, 'secret-b')
  assert.ok(!fs.readFileSync(path.join(temp, 'credentials.enc.json'), 'utf8').includes('secret-'))
  await credentials.unset('KEY_A')
  assert.equal(await credentials.resolve('KEY_A'), null)
  await assert.rejects(credentials.set('../INVALID', 'secret'))
})

test('legacy import preserves config and creates encrypted credentials and backups', async () => {
  const legacy = path.join(temp, 'legacy.json')
  writeJson(legacy, { api_keys: { deepseek: 'legacy-secret', opencode_go: 'go-secret' }, show: [{ id: 'deepseek', on: true }, { id: 'gptplan', on: true }, { id: 'opencode_go', on: true }] })
  const before = fs.readFileSync(legacy, 'utf8')
  await importLegacy(legacy, { dataHome: temp, credentials })
  assert.equal(fs.readFileSync(legacy, 'utf8'), before)
  assert.equal((await credentials.resolve('DEEPSEEK_API_KEY')).value, 'legacy-secret')
  const registry = readJson(path.join(temp, '.dshw-api.json'), {})
  assert.equal(registry.models.length, 2)
  assert.ok(!JSON.stringify(registry).includes('secret'))
  assert.equal(fs.readdirSync(path.join(temp, 'migration-backups')).length, 1)
})

test('subscription thresholds are validated by the host and old money rules remain recoverable', async () => {
  const file = path.join(temp, '.dshw-usage.json')
  const ledger = readJson(file, {})
  ledger.settings ||= {}; ledger.settings.models ||= {}
  ledger.settings.models.legacy_gptplan = { alert: { on: true, below: 120, lines: [{ type: 'text', text: 'legacy money' }] } }
  writeJson(file, ledger)
  const settings = await (await call('usage-settings.json')).json()
  const converted = settings.settings.models.legacy_gptplan.alert
  assert.equal(converted.on, false)
  assert.equal(converted.unit, 'percent')
  assert.equal(converted.legacyMoneyRule.below, 120)
  for (const below of [-1, 101]) assert.equal((await call('api-models.json', { action: 'model-settings', id: 'legacy_gptplan', alert: { unit: 'percent', below } })).status, 400)
  assert.equal((await call('api-models.json', { action: 'model-settings', id: 'legacy_gptplan', alert: { ...converted, on: true, below: 0 } })).status, 200)
  const saved = readJson(file, {}).settings.models.legacy_gptplan.alert
  assert.equal(saved.below, 0)
  assert.equal(saved.legacyMoneyRule.below, 120)
})

test.after(() => { host.dispose(); globalThis.fetch = originalFetch; fs.rmSync(temp, { recursive: true, force: true }) })
