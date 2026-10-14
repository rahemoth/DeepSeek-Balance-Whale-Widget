// Failed quota reads must not hold a missing window for a full minute.
export function planCacheFresh(at, now, hasWindows, desktop) {
  const ttl = desktop ? (hasWindows ? 15000 : 5000) : 60000
  return at > 0 && now - at < ttl
}
