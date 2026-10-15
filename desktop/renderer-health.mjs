// Network requests do not stop renderer heartbeats. Recover only a stalled UI,
// with a longer allowance for initial load and a bounded restart rate.
export function createRendererHealth(recover, now = Date.now) {
  let deadline = now() + 30000
  let attempts = []
  return {
    heartbeat() { deadline = now() + 15000 },
    reset() { deadline = now() + 30000 },
    check(visible) {
      const time = now()
      if (!visible) { deadline = time + 30000; return }
      if (time < deadline) return
      attempts = attempts.filter(at => time - at < 600000)
      if (attempts.length >= 3) return
      attempts.push(time)
      deadline = time + 30000
      recover()
    }
  }
}
