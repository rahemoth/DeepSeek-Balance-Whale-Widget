import test from 'node:test'
import assert from 'node:assert/strict'
import { createRendererHealth } from '../renderer-health.mjs'

test('renderer watchdog allows startup, tolerates live network waits and recovers missing heartbeats', () => {
  let time = 0, count = 0
  const health = createRendererHealth(() => count++, () => time)
  time = 29999; health.check(true); assert.equal(count, 0)
  for (let i = 0; i < 60; i++) { time += 1000; health.heartbeat(); health.frame(); health.check(true) }
  assert.equal(count, 0)
  time += 14999; health.check(true); assert.equal(count, 0)
  time++; health.check(true); assert.equal(count, 1)
  time += 30000; health.check(true); assert.equal(count, 2)
  time += 30000; health.check(true); assert.equal(count, 3)
  time += 30000; health.check(true); assert.equal(count, 3)
  time += 600000; health.check(true); assert.equal(count, 4)
})

test('a live script with stopped animation frames triggers paint recovery', () => {
  let time = 0
  const reasons = []
  const health = createRendererHealth(reason => reasons.push(reason), () => time)
  health.heartbeat(); health.frame()
  for (let i = 0; i < 15; i++) { time += 1000; health.heartbeat(); health.check(true) }
  assert.deepEqual(reasons, ['renderer-frame-timeout'])
})

test('hidden windows and resume get startup grace without losing recovery limits', () => {
  let time = 0, count = 0
  const health = createRendererHealth(() => count++, () => time)
  time += 100000; health.check(false)
  health.check(true); assert.equal(count, 0)
  time += 29999; health.check(true); assert.equal(count, 0)
  health.reset(); time += 29999; health.check(true); assert.equal(count, 0)
  time++; health.check(true); assert.equal(count, 1)
})
