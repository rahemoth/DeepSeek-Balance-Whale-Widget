export const defaultLayout = { style: 'detail', mode: 'follow', scale: 1, dx: 0, dy: 0, x: null, y: null }
export function normalizeLayout(value = {}) {
  const result = { ...defaultLayout, ...value }
  if (!['detail', 'mini'].includes(result.style) || !['follow', 'fixed'].includes(result.mode)) throw new Error('卡片布局模式无效')
  if (!Number.isFinite(result.scale) || result.scale < .5 || result.scale > 1.5) throw new Error('卡片大小必须为 50%–150%')
  for (const key of ['dx', 'dy', 'x', 'y']) if (result[key] !== null && !Number.isFinite(result[key])) throw new Error('卡片位置无效')
  return Object.fromEntries(Object.keys(defaultLayout).map(key => [key, result[key]]))
}
export function overlaps(a, b, gap = 8) {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y
}
export function placeCard(preferred, size, viewport, obstacles) {
  const clamp = (n, max) => Math.max(8, Math.min(max, n))
  if (size.width > viewport.width - 16 || size.height > viewport.height - 16) return null
  const points = [preferred]
  for (const r of obstacles) {
    const xs = [r.x - size.width - 12, r.x + r.width + 12, preferred.x]
    const ys = [r.y - size.height - 12, r.y + r.height + 12, preferred.y]
    for (const x of xs) for (const y of ys) points.push({ x, y })
  }
  points.push({ x: 8, y: 8 }, { x: viewport.width - size.width - 8, y: 8 }, { x: 8, y: viewport.height - size.height - 8 }, { x: viewport.width - size.width - 8, y: viewport.height - size.height - 8 })
  return points.map(p => ({ x: clamp(p.x, viewport.width - size.width - 8), y: clamp(p.y, viewport.height - size.height - 8), ...size }))
    .filter(p => obstacles.every(r => !overlaps(p, r)))
    .sort((a, b) => Math.hypot(a.x - preferred.x, a.y - preferred.y) - Math.hypot(b.x - preferred.x, b.y - preferred.y))[0] || null
}
