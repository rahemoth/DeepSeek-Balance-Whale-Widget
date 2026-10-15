// A fullscreen transparent window must stop intercepting input if its renderer
// stops replying. The main process owns this short, renewable lease.
export function createInputLease(apply, now = Date.now, timeout = 1000) {
  let active = false
  let renewed = 0
  let applied = 0
  function set(value, force = false) {
    if (active === value && !force) return
    active = value
    applied = now()
    apply(value)
  }
  return {
    renew(value) { renewed = now(); set(value, value && renewed - applied >= 2000) },
    release() { set(false) },
    check() { if (active && now() - renewed >= timeout) set(false) }
  }
}
