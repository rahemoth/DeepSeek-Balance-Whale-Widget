import path from 'node:path'
import { readJson, writeJson } from './storage.mjs'

export function ensureCardSources(dataHome) {
  const file = path.join(dataHome, '.dshw-api.json')
  const registry = readJson(file, { version: 1, models: [], usage: {} })
  let changed = false
  for (const model of [
    { id: 'desktop_opencode_go', provider: 'opencode_go', name: 'OpenCode Go', currency: 'USD', keyRef: 'OPENCODE_GO_API_KEY' },
    { id: 'desktop_gptplan', provider: 'gptplan', name: 'ChatGPT 套餐', currency: 'USD', keyRef: '' }
  ]) {
    if (!registry.models.some(m => m.provider === model.provider)) { registry.models.push(model); changed = true }
  }
  if (changed) writeJson(file, registry)
}
