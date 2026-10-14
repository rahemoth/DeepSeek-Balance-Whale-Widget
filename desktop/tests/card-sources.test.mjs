import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ensureCardSources } from '../card-sources.mjs'
import { readJson, writeJson } from '../storage.mjs'

test('card sources reuse existing provider config and initialize missing sources once', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-sources-'))
  const file = path.join(home, '.dshw-api.json')
  const existing = { id: 'my-go', provider: 'opencode_go', keyRef: 'MY_GO_KEY', params: { test: 'retained' } }
  writeJson(file, { version: 1, models: [existing], usage: { preserved: 10 } })
  ensureCardSources(home)
  ensureCardSources(home)
  const registry = readJson(file, null)
  assert.equal(registry.models.length, 2)
  assert.deepEqual(registry.models[0], existing)
  assert.equal(registry.models[1].provider, 'gptplan')
  assert.deepEqual(registry.usage, { preserved: 10 })
  fs.rmSync(home, { recursive: true, force: true })
})
