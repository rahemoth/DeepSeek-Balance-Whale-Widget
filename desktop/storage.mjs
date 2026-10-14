import fs from 'node:fs'
import path from 'node:path'

export function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback
  // Corrupt data must be reported, never silently replaced with defaults.
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, file)
}

export function createCredentialStore(file, encryption, env = process.env) {
  let queue = Promise.resolve()
  function validate(ref) {
    if (!/^[A-Za-z0-9_]{1,64}$/.test(ref)) throw new Error('无效的凭据名')
  }
  function mutate(operation) {
    const result = queue.then(async () => {
      const entries = readJson(file, {})
      await operation(entries)
      writeJson(file, entries)
    })
    queue = result.catch(() => {})
    return result
  }
  return {
    async resolve(ref) {
      validate(ref)
      await queue
      if (env[ref]) return { value: env[ref] }
      const entry = readJson(file, {})[ref]
      if (!entry) return null
      const decrypted = await encryption.decryptStringAsync(Buffer.from(entry, 'base64'))
      return { value: decrypted.result }
    },
    async set(ref, value) {
      validate(ref)
      if (!(await encryption.isAsyncEncryptionAvailable())) throw new Error('Windows 凭据加密不可用')
      return mutate(async entries => {
        entries[ref] = (await encryption.encryptStringAsync(String(value))).toString('base64')
      })
    },
    async unset(ref) {
      validate(ref)
      return mutate(entries => { delete entries[ref] })
    }
  }
}
