import test from 'node:test'
import assert from 'node:assert/strict'
import { quotaProcessEnv, quotaReadError } from '../../lib/quota-network.mjs'

test('quota process inherits system proxy and selected login directory without changing the parent', async () => {
  const env = { PATH: 'example', NO_PROXY: 'localhost', CODEX_HOME: 'old' }
  let endpoint
  const result = await quotaProcessEnv(env, 'selected-login', async url => { endpoint = url; return 'PROXY 127.0.0.1:7897; DIRECT' })
  assert.equal(new URL(endpoint).hostname, 'chatgpt.com')
  assert.equal(result.HTTPS_PROXY, 'http://127.0.0.1:7897/')
  assert.equal(result.HTTP_PROXY, result.HTTPS_PROXY)
  assert.equal(result.NO_PROXY, 'localhost')
  assert.equal(result.CODEX_HOME, 'selected-login')
  assert.deepEqual(env, { PATH: 'example', NO_PROXY: 'localhost', CODEX_HOME: 'old' })
})

test('explicit proxy overrides are preserved; direct and SOCKS PAC routes are honored', async () => {
  for (const key of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy']) {
    const result = await quotaProcessEnv({ [key]: 'http://custom:8080' }, 'login', () => { throw new Error('must not resolve') })
    assert.equal(result[key], 'http://custom:8080')
  }
  assert.equal((await quotaProcessEnv({}, 'login', async () => 'DIRECT; PROXY unused:8080')).HTTPS_PROXY, undefined)
  assert.equal((await quotaProcessEnv({}, 'login', async () => 'SOCKS5 127.0.0.1:1080')).HTTPS_PROXY, 'socks5h://127.0.0.1:1080')
  assert.equal((await quotaProcessEnv({}, 'login')).HTTPS_PROXY, undefined)
  await assert.rejects(quotaProcessEnv({}, 'login', async () => { throw new Error('proxy failed') }))
})

test('quota failures explain recovery without exposing raw service messages', () => {
  assert.match(quotaReadError({ message: 'failed to fetch rate limits: request https://example/?token=secret' }), /网络请求失败/)
  assert.match(quotaReadError({ message: '401 Unauthorized' }), /重新登录/)
  assert.match(quotaReadError({ message: '403 Forbidden' }), /拒绝访问/)
  assert.equal(quotaReadError({ message: 'private token secret' }).includes('secret'), false)
})
