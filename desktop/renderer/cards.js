import { defaultLayout, normalizeLayout, placeCard } from '/layout.mjs'
import { quotaTrigger, subscriptionRule, subscriptionDefaultLines } from '/subscription-alerts.mjs'
const names = { deepseek: 'DeepSeek', opencode_go: 'OpenCode Go', gptplan: 'ChatGPT 套餐' }
const order = Object.keys(names)
let sources = {}, models = [], states = {}, layout = { ...defaultLayout }, selected = localStorage.getItem('whale-card-source') || 'deepseek'
let busy = false, lastUpdated, activeBubble = null, dragging = null, geometry = '', ready = false
let fired = {}; try { fired = JSON.parse(localStorage.getItem('whale-quota-fired') || '{}') } catch {}
const card = document.createElement('section')
card.id = 'dshw-desktop-cards'; card.setAttribute('aria-label', '余额与套餐卡片')
card.innerHTML = '<header><span class="card-source-name"></span><button class="card-refresh" title="刷新余额与额度" aria-label="刷新余额与额度">↻</button></header><div class="card-content" aria-live="polite"></div><footer><div class="card-tabs"></div><span class="card-updated"></span></footer>'
function modelOf(provider) { return models.find(m => m.provider === provider) }
function idOf(provider) { return provider === 'deepseek' ? 'deepseek' : modelOf(provider)?.id }
function enabled(kind) { return order.filter(p => sources[idOf(p)]?.[kind] === true) }
function text(parent, tag, value, className) {
  const node = document.createElement(tag); node.textContent = value
  if (className) node.className = className
  parent.appendChild(node); return node
}
function money(value, currency = 'CNY') {
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? '—' : (currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : currency + ' ') + Number(value).toFixed(2)
}
function countdown(value) {
  if (value === null || value === undefined || value === '') return '重置时间未知'
  const n = Number(value), ms = Number.isFinite(n) ? (n < 1e12 ? n * 1000 : n) : Date.parse(value)
  if (!Number.isFinite(ms)) return '重置时间未知'
  const minutes = Math.ceil((ms - Date.now()) / 60000)
  if (minutes <= 0) return '等待重置'
  const hours = Math.floor(minutes / 60), days = Math.floor(hours / 24)
  return (days ? `${days}天 ${hours % 24}小时` : hours ? `${hours}小时 ${minutes % 60}分` : `${minutes}分`) + '后重置'
}
function windowsOf(data) { return data?.gptPlan?.windows || data?.plan?.windows || [] }
function percent(w) { return w.usedPct !== null && w.usedPct !== undefined && Number.isFinite(Number(w.usedPct)) ? Math.max(0, 100 - Number(w.usedPct)).toFixed(1) + '%' : '—' }
function renderContent(parent, provider, data) {
  if (!data) { text(parent, 'p', busy ? '加载中…' : '尚未读取数据', 'card-muted'); return }
  if (provider === 'deepseek') {
    text(parent, 'div', money(data.totalBalance, data.currency), 'card-value')
    text(parent, 'p', `充值 ${money(data.rechargeBalance, data.currency)} · 赠金 ${money(data.bonusBalance, data.currency)}`, 'card-muted')
    if (!data.ok) text(parent, 'p', data.error || '余额暂不可用', 'card-error')
    return
  }
  const plan = data.gptPlan
  text(parent, 'div', provider === 'gptplan' ? (plan?.ok ? `ChatGPT ${plan.planLabel || '套餐'}` : '套餐未知') : '订阅额度', 'card-value')
  if (plan?.daysLeft != null) text(parent, 'p', `订阅剩余 ${plan.daysLeft} 天`, 'card-muted')
  for (const w of windowsOf(data)) {
    const row = text(parent, 'div', '', 'card-window')
    text(row, 'span', w.label || w.key); text(row, 'strong', `剩余 ${percent(w)}`)
    text(row, 'small', (percent(w) !== '—' ? `已用 ${Number(w.usedPct).toFixed(1)}% · ` : '') + countdown(w.resetAt))
    const meter = document.createElement('progress'); meter.max = 100
    meter.value = 0
    if (percent(w) !== '—') meter.value = Math.max(0, Math.min(100, 100 - Number(w.usedPct)))
    row.appendChild(meter)
  }
  if (!windowsOf(data).length) text(parent, 'p', plan?.windowsError || plan?.error || data.plan?.error || data.error || (provider === 'opencode_go' && !data.hasKey ? '请在桌面设置填写 OpenCode Go Key' : '尚未取到额度窗口'), 'card-error')
}
function render() {
  const ids = enabled('card'); card.hidden = !ids.length
  if (!ids.includes(selected)) { selected = ids[0]; if (selected) localStorage.setItem('whale-card-source', selected) }
  card.dataset.style = layout.style; card.style.setProperty('--card-scale', String(layout.scale))
  card.querySelector('.card-source-name').textContent = names[selected] || '余额与额度'
  card.querySelector('.card-refresh').disabled = busy
  const body = card.querySelector('.card-content'); body.replaceChildren(); renderContent(body, selected, states[selected])
  const tabs = card.querySelector('.card-tabs'); tabs.replaceChildren()
  for (const id of ids) {
    const tab = text(tabs, 'button', names[id], id === selected ? 'selected' : '')
    tab.setAttribute('aria-pressed', String(id === selected))
    tab.onclick = () => { selected = id; localStorage.setItem('whale-card-source', id); render(); position(true) }
  }
  card.querySelector('.card-updated').textContent = busy ? '刷新中' : lastUpdated ? lastUpdated.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''
  position(true)
}
const rect = r => ({ x: r.left, y: r.top, width: r.width, height: r.height })
function anchor() {
  const r = document.querySelector('.dshwv-img')?.getBoundingClientRect(), c = card.getBoundingClientRect()
  return r ? { x: r.left + r.width / 2 - c.width / 2, y: r.top - c.height - 12 } : { x: 8, y: 8 }
}
function position(force = false) {
  if (!ready || card.hidden || dragging) return
  const obstacles = [...document.querySelectorAll('.dshwv-img, .dshwv-pop-open, .dshwv-menu-open')].filter(el => el.getBoundingClientRect().width && getComputedStyle(el).display !== 'none').map(el => rect(el.getBoundingClientRect()))
  const c = card.getBoundingClientRect(), a = anchor()
  const preferred = layout.mode === 'fixed' ? { x: layout.x ?? a.x, y: layout.y ?? a.y } : { x: a.x + layout.dx, y: a.y + layout.dy }
  const key = JSON.stringify([preferred, c.width, c.height, innerWidth, innerHeight, obstacles])
  if (!force && geometry === key) return
  geometry = key
  const p = placeCard(preferred, { width: c.width, height: c.height }, { width: innerWidth, height: innerHeight }, obstacles)
  card.style.visibility = p ? '' : 'hidden'
  if (p) { card.style.left = p.x + 'px'; card.style.top = p.y + 'px' }
}
async function saveLayout() { layout = normalizeLayout(await window.whaleDesktop.saveLayout(layout)); render() }
card.querySelector('header').addEventListener('pointerdown', event => {
  if (event.button !== 0 || event.target.closest('button')) return
  event.preventDefault(); event.stopPropagation()
  const r = card.getBoundingClientRect(); dragging = { x: event.clientX, y: event.clientY, left: r.left, top: r.top }
  event.currentTarget.setPointerCapture(event.pointerId)
})
card.querySelector('header').addEventListener('pointermove', event => {
  if (!dragging) return
  card.style.left = Math.max(8, Math.min(innerWidth - card.offsetWidth - 8, dragging.left + event.clientX - dragging.x)) + 'px'
  card.style.top = Math.max(8, Math.min(innerHeight - card.offsetHeight - 8, dragging.top + event.clientY - dragging.y)) + 'px'
})
card.querySelector('header').addEventListener('pointerup', () => {
  if (!dragging) return
  const r = card.getBoundingClientRect(), a = anchor()
  layout = { ...layout, x: r.left, y: r.top, dx: r.left - a.x, dy: r.top - a.y }
  dragging = null; saveLayout().catch(showError)
})
card.querySelector('header').addEventListener('pointercancel', () => { dragging = null; position(true) })
function showError(error) { const el = document.querySelector('#dshw-subscription-panel [role=status]'); if (el) el.textContent = error.message; else console.error(error.message) }
function sourceLines(provider) {
  const data = states[provider], result = [names[provider]]
  if (provider === 'deepseek') return [...result, `总余额 ${money(data?.totalBalance, data?.currency)}`, `充值 ${money(data?.rechargeBalance, data?.currency)} · 赠金 ${money(data?.bonusBalance, data?.currency)}`, ...(data?.error ? [data.error] : [])]
  if (data?.gptPlan?.ok) result.push(`ChatGPT ${data.gptPlan.planLabel}${data.gptPlan.daysLeft != null ? ' · 剩 ' + data.gptPlan.daysLeft + ' 天' : ''}`)
  for (const w of windowsOf(data)) result.push(`${w.label || w.key} 剩余 ${percent(w)} · ${countdown(w.resetAt)}`)
  if (!windowsOf(data).length) result.push(data?.gptPlan?.windowsError || data?.gptPlan?.error || data?.plan?.error || data?.error || '额度暂不可用')
  return result
}
function showActiveBubble(update = false) {
  if (!activeBubble) return
  const data = states[activeBubble]
  const lines = activeBubble === 'deepseek' ? ['DeepSeek 余额', money(data?.totalBalance, data?.currency)] : [
    names[activeBubble],
    (data?.gptPlan?.ok ? data.gptPlan.planLabel + ' · ' : '') + '已用 ' + window.dshwDesktopUI.quotaText(idOf(activeBubble)).used,
    window.dshwDesktopUI.quotaText(idOf(activeBubble)).reset,
  ]
  const mods = lines.map((line, i) => ({ type: 'text', text: line, size: activeBubble === 'deepseek' && i === 1 ? 12 : 5, bold: i < 2, color: '#203170' }))
  if (update) window.dshwDesktopUI.updateSource(mods)
  else window.dshwDesktopUI.showSource(mods)
}
function runAlerts() {
  for (const model of models.filter(m => m.provider === 'gptplan' || m.provider === 'opencode_go')) for (const kind of ['alert', 'budget']) {
    const rule = model.settings?.[kind], trigger = quotaTrigger(model, kind, rule)
    if (!trigger || fired[trigger.key]) continue
    fired[trigger.key] = Date.now(); fired = Object.fromEntries(Object.entries(fired).slice(-200))
    localStorage.setItem('whale-quota-fired', JSON.stringify(fired))
    window.dshwDesktopUI.notifyQuota(model, kind, rule, trigger.value, trigger.window.label || trigger.window.key)
  }
}
async function refresh() {
  if (busy || !ready) return
  busy = true; render()
  try {
    await Promise.allSettled([
      fetch('/dsh-whale/balance.json?refresh=1').then(r => r.json()).then(data => { states.deepseek = data; render() }),
      window.dshwDesktopUI.refreshModels()
    ])
    lastUpdated = new Date()
    if (window.dshwDesktopUI.bubbleStatus().kind === 'desktop-source') showActiveBubble(true)
  } finally { busy = false; render() }
}
function mountSettings(parent) {
  const area = document.createElement('div'); area.className = 'desktop-layout-controls'
  area.innerHTML = '<label>卡片样式<select data-layout="style"><option value="detail">详细卡片</option><option value="mini">原项目迷你卡片</option></select></label><label>卡片位置<select data-layout="mode"><option value="follow">跟随小肥鱼</option><option value="fixed">固定桌面</option></select></label><label>卡片大小<input data-layout="scale" type="range" min="50" max="150" step="5"><output></output></label><button type="button">恢复默认位置</button>'
  for (const input of area.querySelectorAll('[data-layout]')) {
    input.value = String(input.dataset.layout === 'scale' ? layout.scale * 100 : layout[input.dataset.layout])
    input.oninput = () => {
      const r = card.getBoundingClientRect(), a = anchor()
      if (input.dataset.layout === 'mode') layout = { ...layout, x: r.left, y: r.top, dx: r.left - a.x, dy: r.top - a.y }
      layout[input.dataset.layout] = input.dataset.layout === 'scale' ? Number(input.value) / 100 : input.value
      area.querySelector('output').textContent = Math.round(layout.scale * 100) + '%'; render()
    }
    input.onchange = () => saveLayout().catch(showError)
  }
  area.querySelector('output').textContent = Math.round(layout.scale * 100) + '%'
  area.querySelector('button').onclick = () => { layout = { ...layout, dx: 0, dy: 0, x: null, y: null }; saveLayout().catch(showError) }
  parent.appendChild(area)
}
async function openSubscription(model) {
  document.querySelector('#dshw-subscription-panel')?.remove()
  const mask = document.createElement('div'); mask.id = 'dshw-subscription-panel'
  const panel = document.createElement('div'); panel.className = 'desktop-card'; mask.appendChild(panel)
  text(panel, 'h2', model.name); text(panel, 'p', sourceLines(model.provider).slice(1).join('\n'))
  if (['alert', 'budget'].some(key => model.settings?.[key]?.legacyMoneyRule)) text(panel, 'p', '旧金额提醒已停用并保留记录，请重新设置百分比阈值。', 'card-error')
  for (const [kind, label] of [['alert', '剩余额度预警'], ['budget', '额度使用提醒']]) {
    const rule = subscriptionRule(model.settings?.[kind], kind, model.provider)
    const row = text(panel, 'div', `${label} · ${rule.on ? ((rule.windowKey === 'rolling' ? '5h' : rule.windowKey === 'weekly' ? '周' : '月') + (kind === 'alert' ? ' 剩余 ≤ ' + rule.below : ' 已用 ≥ ' + rule.amount) + '%') : '已关闭'}`, 'subscription-rule')
    text(row, 'button', '编辑').onclick = () => {
      mask.remove()
      window.dshwDesktopUI.editRule({ ...model, settings: { ...model.settings, [kind]: rule } }, kind, async next => {
        try {
          const response = await fetch('/dsh-whale/api-models.json', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'model-settings', id: model.id, [kind]: next }) })
          const result = await response.json()
          if (!response.ok || !result.ok) throw new Error(result.error || '保存失败')
          model.settings = { ...model.settings, [kind]: next }; await openSubscription(model); refresh()
        } catch (error) { await openSubscription(model); showError(error) }
      })
    }
  }
  const label = text(panel, 'label', model.provider === 'gptplan' ? '本机 Codex 登录目录（留空使用默认）' : 'OpenCode Go Key（留空保留）')
  const input = document.createElement('input'); input.type = model.provider === 'gptplan' ? 'text' : 'password'; input.autocomplete = 'off'; label.appendChild(input)
  if (model.provider === 'gptplan') input.value = model.params?.codexHome || ''
  text(panel, 'button', '保存连接设置').onclick = async () => {
    try {
      const body = model.provider === 'gptplan' ? { action: 'save', model: { id: model.id, name: model.name, provider: model.provider, params: { ...model.params, codexHome: input.value.trim() } } } : { action: 'set-key', keyRef: model.keyRef || 'OPENCODE_GO_API_KEY', keyValue: input.value.trim() }
      if (model.provider === 'opencode_go' && !input.value.trim()) return
      const response = await fetch('/dsh-whale/api-models.json', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const result = await response.json(); if (!response.ok || !result.ok) throw new Error(result.error || '保存失败')
      input.value = ''; panel.querySelector('[role=status]').textContent = '已保存'; refresh()
    } catch (error) { showError(error) }
  }
  text(panel, 'button', '刷新').onclick = async () => { await refresh(); await openSubscription(modelOf(model.provider) || model) }
  text(panel, 'button', '关闭').onclick = () => mask.remove()
  text(panel, 'div', '', 'desktop-status').setAttribute('role', 'status')
  mask.onclick = event => { if (event.target === mask) mask.remove() }
  document.body.appendChild(mask)
}
window.whaleDisplay = {
  sync(flags, values) {
    sources = flags || {}; models = values || []
    for (const provider of ['opencode_go', 'gptplan']) states[provider] = modelOf(provider)
    if (ready) { render(); runAlerts() }
    if (activeBubble && !enabled('bubble').includes(activeBubble)) { activeBubble = null; if (window.dshwDesktopUI?.bubbleStatus().kind === 'desktop-source') window.dshwDesktopUI.closeBubble() }
  },
  nextBubble() {
    const ids = enabled('bubble'), status = window.dshwDesktopUI.bubbleStatus()
    if (!ids.length) return false
    if (['alert', 'cost', 'wait'].includes(status.kind)) return true
    activeBubble = status.shown && activeBubble ? ids[(ids.indexOf(activeBubble) + 1) % ids.length] : ids[0]
    showActiveBubble(); position(true); return true
  },
  mountSettings, openSubscription, defaultRuleLines: subscriptionDefaultLines
}
card.querySelector('.card-refresh').onclick = refresh
window.whaleDesktop.onAction(action => { if (action === 'refresh') refresh() })
async function start() {
  if (ready || !window.dshwDesktopUI) return
  const settings = await window.whaleDesktop.settings(); layout = normalizeLayout(settings.cardLayout || {})
  const snapshot = window.dshwDesktopUI.snapshot(); sources = snapshot.sources; models = snapshot.models
  document.body.appendChild(card); ready = true; window.whaleDisplay.sync(sources, models); refresh()
  setInterval(position, 100)
  setInterval(() => { if (enabled('card').length || enabled('bubble').length || models.some(m => m.settings?.alert?.on || m.settings?.budget?.on)) refresh() }, 15000)
  setInterval(() => { if (!busy) render() }, 30000)
  window.addEventListener('resize', () => position(true))
}
window.addEventListener('dshw-desktop-ready', start)
start()
window.dispatchEvent(new Event('whale-display-ready'))
