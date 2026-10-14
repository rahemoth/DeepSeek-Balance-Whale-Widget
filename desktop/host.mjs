import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { EventEmitter } from 'node:events'
import { pathToFileURL } from 'node:url'

const ORIGIN = 'whale://app'
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.gif': 'image/gif', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' }

// Adapt the real DSH plugin API to an in-process Electron protocol. There is no
// listening TCP port, duplicate balance logic, or reduced desktop route table.
export async function createHost({ sourceRoot, rendererRoot, dataHome, credentials, resolveProxy }) {
  process.env.DSH_HOME = dataHome
  fs.mkdirSync(dataHome, { recursive: true })
  const routes = []
  const effects = []
  const events = new EventEmitter()
  const ctx = {
    desktopWidget: true,
    credentials,
    resolveProxy,
    connection: { requestRejection: () => null },
    webServer: {
      register(route) {
        routes.push(route)
        return () => { const i = routes.indexOf(route); if (i >= 0) routes.splice(i, 1) }
      },
      tapIndex() { return () => {} }
    },
    get(name) { return this[name] },
    on(name, fn) { events.on(name, fn); return () => events.off(name, fn) },
    effect(fn) { const dispose = fn(); if (typeof dispose === 'function') effects.push(dispose) },
    inject(_names, fn) { fn(ctx) }
  }
  const { default: plugin } = await import(pathToFileURL(path.join(sourceRoot, 'lib/index.js')).href)
  plugin.apply(ctx)

  async function dispatch(request) {
    const url = new URL(request.url)
    if (url.protocol !== 'whale:' || url.host !== 'app') return new Response(null, { status: 403 })
    const origin = request.headers.get('origin')
    if (origin && origin !== ORIGIN) return new Response(null, { status: 403 })
    if (request.headers.get('sec-fetch-site') === 'cross-site') return new Response(null, { status: 403 })
    if (!['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)) return new Response(null, { status: 405 })
    const route = routes.find(r => r.kind === 'exact' ? r.path === url.pathname : url.pathname.startsWith(r.path))
    if (!route) {
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 })
      let file
      if (url.pathname === '/') file = path.join(rendererRoot, 'index.html')
      else if (['/desktop.js', '/desktop.css', '/cards.js'].includes(url.pathname)) file = path.join(rendererRoot, url.pathname.slice(1))
      else if (url.pathname === '/layout.mjs') file = path.join(rendererRoot, '..', 'layout.mjs')
      else if (url.pathname === '/subscription-alerts.mjs') file = path.join(sourceRoot, 'lib', 'subscription-alerts.mjs')
      else if (/^\/assets\/[A-Za-z0-9_.-]+$/.test(url.pathname)) file = path.join(sourceRoot, url.pathname)
      if (!file || !fs.existsSync(file)) return new Response(null, { status: 404 })
      return new Response(request.method === 'HEAD' ? null : fs.readFileSync(file), {
        headers: { 'Content-Type': path.extname(file) === '.mjs' ? 'text/javascript' : TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }
      })
    }
    const bytes = Buffer.from(await request.arrayBuffer())
    if (bytes.length > 32 * 1024 * 1024) return new Response(null, { status: 413 })
    const req = Readable.from(bytes.length ? [bytes] : [])
    req.method = request.method
    req.url = url.pathname + url.search
    // The protocol has already enforced its private origin. Present the plugin
    // with its normal loopback request contract, retaining all route guards.
    req.headers = { ...Object.fromEntries(request.headers), host: '127.0.0.1', origin: 'http://127.0.0.1', 'sec-fetch-site': 'same-origin' }
    let status = 200
    let headers = {}
    let body = null
    let ended = false
    const res = {
      get statusCode() { return status },
      set statusCode(value) { status = value },
      writeHead(code, values) { status = code; headers = values || {}; return this },
      end(value) { ended = true; body = value ?? null }
    }
    try {
      await route.handler(req, res)
      if (!ended) throw new Error('接口没有结束响应')
      return new Response([204, 304].includes(status) || request.method === 'HEAD' ? null : body, { status, headers })
    } catch {
      return Response.json({ ok: false, error: '桌面接口处理失败' }, { status: 500 })
    } finally { req.destroy() }
  }
  return { dispatch, routes, emit: (...args) => events.emit(...args), dispose() { effects.reverse().forEach(fn => fn()); events.removeAllListeners() } }
}
