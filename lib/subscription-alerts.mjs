export const subscriptionProvider = provider => provider === 'gptplan' || provider === 'opencode_go'
export function subscriptionDefaultLines(kind, provider) {
  const name = provider === 'gptplan' ? 'GPT' : 'OCG'
  if (kind !== 'alert') return [
    { type: 'text', text: '老大，额度已经用掉', size: 6, bold: true, row: 1 },
    { type: 'text', text: '{amount}%', size: 7, bold: true, row: 1, rgb: 'rouge', color: '' },
    { type: 'text', text: '啦，再用要变成穷光蛋啦...', size: 6, bold: true, row: 1 },
  ]
  return [
    { type: 'text', text: '老大~你的' + name + '额度', size: 5, bold: true },
    { type: 'text', text: '已经不足', size: 5, bold: true, row: 2 },
    { type: 'text', text: '{below}%', size: 5, bold: true, rgb: 'rouge', color: '', bgRgb: '', bg: '', row: 2 },
    { type: 'text', text: '啦~', size: 5, bold: true, row: 2 },
    { type: 'image', imgId: 'bimg_money1', size: 6, imgScale: .4 },
  ]
}
export function subscriptionRule(rule, kind, provider) {
  const defaults = { on: false, unit: 'percent', windowKey: 'rolling', below: 20, amount: 80, autoClose: true, ttlSec: 6, soundOn: false, sel: 'frag:cost_a', vol: 0.6, lines: subscriptionDefaultLines(kind, provider) }
  if (!rule || rule.unit !== 'percent') return { ...defaults, legacyMoneyRule: rule ? { ...rule } : null }
  const result = { ...defaults, ...rule }
  if (!Array.isArray(result.lines) || !result.lines.length || (result.lines.length === 1 && ['剩余额度低于 {below}%', '额度已用达到 {amount}%'].includes(result.lines[0].text))) result.lines = defaults.lines
  const value = Number(kind === 'alert' ? result.below : result.amount)
  if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error('额度提醒阈值必须为 0–100%')
  if (!['rolling', 'weekly', ...(provider === 'opencode_go' ? ['monthly'] : [])].includes(result.windowKey)) throw new Error('该套餐不支持此额度窗口')
  return result
}
export function quotaTrigger(model, kind, rule) {
  if (!rule?.on || rule.unit !== 'percent') return null
  const list = model.gptPlan?.windows || model.plan?.windows || []
  const labels = { rolling: '5h', weekly: '周', monthly: '月' }
  const window = list.find(w => w.key === rule.windowKey || w.label === labels[rule.windowKey])
  if (!window || window.usedPct === null || window.usedPct === undefined) return null
  const used = Number(window.usedPct), threshold = Number(kind === 'alert' ? rule.below : rule.amount)
  if (!Number.isFinite(used) || used < 0 || used > 100 || !Number.isFinite(threshold) || threshold < 0 || threshold > 100) return null
  const value = kind === 'alert' ? 100 - used : used
  if (kind === 'alert' ? value > threshold : value < threshold) return null
  return { value, threshold, window, key: `${model.id}:${kind}:${rule.windowKey}:${window.resetAt ?? 'unknown'}:${threshold}` }
}
