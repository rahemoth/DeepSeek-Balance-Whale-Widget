import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeLayout, placeCard, overlaps } from '../layout.mjs'
import { subscriptionRule, quotaTrigger, subscriptionDefaultLines } from '../../lib/subscription-alerts.mjs'

test('layouts reject invalid sizes and avoid every visible obstacle without altering saved position', () => {
  const preferred = { x: 500, y: 500 }
  const obstacles = [{ x: 480, y: 480, width: 300, height: 200 }, { x: 100, y: 300, width: 250, height: 250 }]
  const placed = placeCard(preferred, { width: 316, height: 200 }, { width: 1000, height: 800 }, obstacles)
  assert.ok(placed)
  assert.ok(obstacles.every(r => !overlaps(placed, r)))
  assert.deepEqual(preferred, { x: 500, y: 500 })
  assert.equal(placeCard(preferred, { width: 316, height: 200 }, { width: 300, height: 180 }, []), null)
  assert.throws(() => normalizeLayout({ scale: 2 }))
  assert.throws(() => normalizeLayout({ scale: .49 }))
  assert.equal(normalizeLayout({ scale: .5, style: 'detail' }).scale, .5)
  assert.equal(normalizeLayout({ scale: .5, style: 'mini' }).scale, .5)
  assert.equal(normalizeLayout({ scale: .75, style: 'mini' }).scale, .75)
  assert.equal(normalizeLayout({ scale: 1.5, mode: 'fixed', x: 0 }).scale, 1.5)
  for (const x of [-1000, 0, 900, 5000]) for (const y of [-1000, 0, 700, 5000]) {
    const p = placeCard({ x, y }, { width: 240, height: 120 }, { width: 1000, height: 800 }, [])
    assert.ok(p.x >= 8 && p.y >= 8 && p.x + p.width <= 992 && p.y + p.height <= 792)
  }
})

test('old money alerts stay disabled and their original values are preserved', () => {
  const old = { on: true, below: 90, lines: [{ text: 'old money' }] }
  const migrated = subscriptionRule(old, 'alert', 'gptplan')
  assert.equal(migrated.on, false)
  assert.equal(migrated.below, 20)
  assert.deepEqual(migrated.legacyMoneyRule, old)
  assert.equal(subscriptionRule(null, 'budget', 'opencode_go').amount, 80)
  assert.throws(() => subscriptionRule({ unit: 'percent', below: 101 }, 'alert', 'gptplan'))
  assert.throws(() => subscriptionRule({ unit: 'percent', windowKey: 'monthly' }, 'alert', 'gptplan'))
})

test('percent rules include zero and full quota, skip unknowns and reset dedup keys on window reset', () => {
  const model = { id: 'gpt', gptPlan: { windows: [{ key: 'rolling', label: '5h', usedPct: 80, resetAt: 1000 }] } }
  const rule = subscriptionRule({ unit: 'percent', on: true, below: 20 }, 'alert', 'gptplan')
  const first = quotaTrigger(model, 'alert', rule)
  assert.equal(first.value, 20)
  assert.equal(quotaTrigger(model, 'alert', rule).key, first.key)
  model.gptPlan.windows[0].resetAt = 2000
  assert.notEqual(quotaTrigger(model, 'alert', rule).key, first.key)
  for (const usedPct of [null, undefined, NaN, -1, 101]) {
    model.gptPlan.windows[0].usedPct = usedPct
    assert.equal(quotaTrigger(model, 'alert', rule), null)
  }
  model.gptPlan.windows[0].usedPct = 100
  assert.equal(quotaTrigger(model, 'alert', { ...rule, below: 0 }).value, 0)
  model.gptPlan.windows[0].usedPct = 0
  assert.equal(quotaTrigger(model, 'budget', { ...rule, amount: 0 }).value, 0)
  assert.equal(quotaTrigger(model, 'budget', { ...rule, windowKey: 'weekly' }), null)
})

test('percentage alerts retain playful copy and picture without overriding custom content', () => {
  const lines = subscriptionDefaultLines('alert', 'gptplan')
  assert.equal(lines[0].text, '老大~你的GPT额度')
  assert.ok(lines.some(m => m.text === '啦~'))
  assert.ok(lines.some(m => m.imgId === 'bimg_money1'))
  assert.ok(lines.some(m => m.text === '{below}%'))
  assert.ok(!JSON.stringify(lines).includes('¥'))
  const custom = [{ type: 'text', text: '我的专属提醒' }]
  assert.deepEqual(subscriptionRule({ unit: 'percent', lines: custom }, 'alert', 'gptplan').lines, custom)
  const previousDefault = [{ type: 'text', text: '剩余额度低于 {below}%', size: 9 }]
  assert.equal(subscriptionRule({ unit: 'percent', lines: previousDefault }, 'alert', 'opencode_go').lines[0].text, '老大~你的OCG额度')
})
