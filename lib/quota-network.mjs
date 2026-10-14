// Match Electron's system/PAC proxy for the separate Codex process. Environment
// overrides remain authoritative, and nothing is written to the user's settings.
export async function quotaProcessEnv(env, codexHome, resolveProxy) {
  const result = { ...env, CODEX_HOME: codexHome }
  const explicit = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy']
  if (explicit.some(key => env[key]) || typeof resolveProxy !== 'function') return result
  const route = await resolveProxy('https://chatgpt.com/backend-api/wham/usage')
  const first = String(route || '').split(';')[0].trim()
  if (!first || first === 'DIRECT') return result
  const match = /^(PROXY|HTTP|HTTPS|SOCKS|SOCKS5)\s+(\S+)$/i.exec(first)
  if (!match) throw new Error('Unsupported system proxy')
  const scheme = { PROXY: 'http', HTTP: 'http', HTTPS: 'https', SOCKS: 'socks5h', SOCKS5: 'socks5h' }[match[1].toUpperCase()]
  const proxy = new URL(`${scheme}://${match[2]}`).href
  return { ...result, HTTPS_PROXY: proxy, HTTP_PROXY: proxy }
}

export function quotaReadError(error) {
  const message = String(error?.message || error || '')
  if (/401|unauthoriz|not authenticated|not logged|sign in/i.test(message)) return 'Plus 额度登录已失效，请在 Codex 重新登录后刷新'
  if (/403|forbidden/i.test(message)) return 'Plus 额度接口拒绝访问，请检查当前网络或代理后刷新'
  if (/request|network|connect|fetch|proxy/i.test(message)) return 'Plus 额度网络请求失败，请检查网络或代理，稍后会自动重试'
  return 'Plus 额度读取失败，稍后会自动重试'
}
