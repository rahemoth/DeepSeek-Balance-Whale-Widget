import test from 'node:test'
import assert from 'node:assert/strict'
import { planCacheFresh } from '../../lib/refresh-policy.mjs'
test('desktop quota failures expire quickly while valid windows stay cached for one refresh', () => {
  assert.equal(planCacheFresh(1000, 5999, false, true), true)
  assert.equal(planCacheFresh(1000, 6000, false, true), false)
  assert.equal(planCacheFresh(1000, 15999, true, true), true)
  assert.equal(planCacheFresh(1000, 16000, true, true), false)
  assert.equal(planCacheFresh(1000, 16000, false, false), true)
  assert.equal(planCacheFresh(1000, 61000, true, false), false)
  assert.equal(planCacheFresh(0, 1000, true, true), false)
})
