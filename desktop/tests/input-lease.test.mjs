import test from 'node:test'
import assert from 'node:assert/strict'
import { createInputLease } from '../input-lease.mjs'

test('a stalled renderer releases desktop input and a recovered renderer renews it', () => {
  let time = 100
  const changes = []
  const lease = createInputLease(value => changes.push(value), () => time)
  lease.renew(true)
  time += 900; lease.check()
  assert.deepEqual(changes, [true])
  lease.renew(true)
  time += 999; lease.check()
  assert.deepEqual(changes, [true])
  time++; lease.check()
  assert.deepEqual(changes, [true, false])
  lease.renew(true)
  lease.release()
  lease.renew(false)
  assert.deepEqual(changes, [true, false, true, false])
})

test('a healthy hovered widget periodically reapplies native input state while unchanged', () => {
  let time = 100
  const changes = []
  const lease = createInputLease(value => changes.push(value), () => time)
  lease.renew(true)
  time += 1999; lease.renew(true)
  assert.deepEqual(changes, [true])
  time++; lease.renew(true)
  assert.deepEqual(changes, [true, true])
  lease.renew(false)
  time += 2000; lease.renew(false)
  assert.deepEqual(changes, [true, true, false])
})
