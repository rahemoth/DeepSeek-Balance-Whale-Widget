import fs from 'node:fs'
import path from 'node:path'
import { readJson, writeJson } from './storage.mjs'

export async function importLegacy(file, { dataHome, credentials }) {
  const config = readJson(file, null)
  if (!config || !Array.isArray(config.show) || !config.api_keys || typeof config.api_keys !== 'object') {
    throw new Error('请选择旧版 whale-desktop 的 config.json')
  }
  const registryFile = path.join(dataHome, '.dshw-api.json')
  const sizeFile = path.join(dataHome, '.dshw-size.json')
  const registry = readJson(registryFile, { version: 1, models: [], usage: {} })
  const size = readJson(sizeFile, { scale: 0.3 })
  const backup = path.join(dataHome, 'migration-backups', String(Date.now()))
  fs.mkdirSync(backup, { recursive: true })
  for (const name of ['.dshw-api.json', '.dshw-size.json', 'credentials.enc.json']) {
    const source = path.join(dataHome, name)
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(backup, name))
  }
  // Do not copy the plaintext legacy file into this app's data or build output.
  const keyRefs = { deepseek: 'DEEPSEEK_API_KEY', opencode_go: 'OPENCODE_GO_API_KEY' }
  for (const [name, ref] of Object.entries(keyRefs)) {
    if (typeof config.api_keys[name] === 'string' && config.api_keys[name]) await credentials.set(ref, config.api_keys[name])
  }
  const definitions = {
    gptplan: { id: 'legacy_gptplan', name: 'ChatGPT 套餐', provider: 'gptplan', keyRef: '', currency: 'USD' },
    opencode_go: { id: 'legacy_opencode_go', name: 'OpenCode Go', provider: 'opencode_go', keyRef: 'OPENCODE_GO_API_KEY', currency: 'USD' }
  }
  size.showBalanceItems ||= {}
  for (const item of config.show) {
    const model = registry.models.find(m => m.provider === item.id) || definitions[item.id]
    if (model && !registry.models.some(m => m.id === model.id)) registry.models.push(model)
    if (model || item.id === 'deepseek') size.showBalanceItems[model?.id || 'deepseek'] = { card: !!item.on, bubble: !!item.on }
  }
  writeJson(registryFile, registry)
  writeJson(sizeFile, size)
  return { canceled: false }
}
